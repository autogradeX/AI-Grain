import { unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bearer,
  createTestApp,
  multipart,
  register,
  syntheticBoard,
  type TestApp,
} from "./helpers.js";

let t: TestApp;
let token: string;

beforeAll(async () => {
  t = await createTestApp();
  ({ token } = await register(t));
});
afterAll(async () => {
  await t.close();
});

const api = <T = Record<string, unknown>>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  payload?: unknown,
) =>
  t.app
    .inject({
      method,
      url,
      headers: bearer(token),
      ...(payload !== undefined && { payload: payload as object }),
    })
    .then((res) => ({
      status: res.statusCode,
      body: res.headers["content-type"]?.includes("json")
        ? res.json<T>()
        : (res.rawPayload as unknown as T),
      res,
    }));

describe("a sample from photo to report", () => {
  let standardId: string;
  let sampleId: string;
  let batchId: string;

  it("creates a standard and a sample", async () => {
    const std = await api<{ id: string }>("POST", "/api/standards", {
      name: "Test wheat standard",
      crop: "Wheat",
      grades: [
        { grade: "1", maxDefectPct: { broken: 1 }, maxTotalDefectsPct: 2 },
        { grade: "2", maxDefectPct: { broken: 5 }, maxTotalDefectsPct: 8 },
      ],
      definitions: { broken: "Less than three quarters of a whole kernel." },
    });
    expect(std.status).toBe(201);
    standardId = std.body.id;

    const sample = await api<{ id: string; number: number }>(
      "POST",
      "/api/samples",
      {
        crop: "wheat",
        standardId,
        source: "Field 7",
        sampleMassG: 25,
      },
    );
    expect(sample.status).toBe(201);
    expect(sample.body.number).toBe(1);
    sampleId = sample.body.id;

    const second = await api<{ number: number }>("POST", "/api/samples", {
      crop: "barley",
    });
    expect(second.body.number).toBe(2);
  });

  it("rejects a standard for another crop", async () => {
    const res = await api("POST", "/api/samples", {
      crop: "barley",
      standardId,
    });
    expect(res.status).toBe(400);
  });

  it("detects kernels in an uploaded photo", async () => {
    const photo = await syntheticBoard(40);
    // The client measured corners on a half-size copy; the server rescales them.
    const half = photo.corners.map((p) => ({ x: p.x / 2, y: p.y / 2 }));
    const form = multipart(
      {
        side: "front",
        corners: JSON.stringify(half),
        imageWidth: String(photo.width / 2),
        imageHeight: String(photo.height / 2),
      },
      { name: "photo", data: photo.jpeg },
    );
    const res = await t.app.inject({
      method: "POST",
      url: `/api/samples/${sampleId}/batches`,
      headers: { ...bearer(token), ...form.headers },
      payload: form.payload,
    });
    expect(res.statusCode).toBe(202);
    batchId = res.json<{ id: string }>().id;
    await t.jobs.idle();

    const batch = await api<{
      status: string;
      kernelCount: number;
      kernels: unknown[];
    }>("GET", `/api/batches/${batchId}`);
    expect(batch.body.status).toBe("detected");
    expect(batch.body.kernelCount).toBe(40);

    const image = await t.app.inject({
      method: "GET",
      url: `/api/batches/${batchId}/image`,
      headers: bearer(token),
    });
    expect(image.headers["content-type"]).toBe("image/jpeg");
  });

  it("classifies kernels with Claude in sheets of 30", async () => {
    expect((await api("POST", `/api/batches/${batchId}/classify`)).status).toBe(
      202,
    );
    await t.jobs.idle();
    expect(t.classifier.requests.map((r) => r.numbers.length).sort()).toEqual([
      10, 30,
    ]);
    const broken = t.classifier.requests[0]?.classes.find(
      (c) => c.id === "broken",
    );
    // The standard's definition replaces the crop's own description.
    expect(broken?.description).toMatch(/Less than three quarters/);

    const batch = await api<{
      status: string;
      summary: { classified: number; flagged: number; pendingReview: number };
    }>("GET", `/api/batches/${batchId}`);
    expect(batch.body.status).toBe("classified");
    // Broken: 5,10,...,40 (8 kernels). Low confidence: 7,14,21,28 (35 is broken already).
    expect(batch.body.summary).toMatchObject({
      classified: 40,
      flagged: 12,
      pendingReview: 12,
    });

    const usage = await api<{ requests: number; inputTokens: number }>(
      "GET",
      `/api/samples/${sampleId}/usage`,
    );
    expect(usage.body).toMatchObject({ requests: 2, inputTokens: 2000 });
  });

  it("won't complete until flagged kernels are reviewed", async () => {
    const res = await api<{ error: string }>(
      "POST",
      `/api/samples/${sampleId}/complete`,
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/12 flagged/);
  });

  it("records the operator's review decisions", async () => {
    const pending = await api<
      { id: string; number: number; aiClass: string }[]
    >("GET", `/api/samples/${sampleId}/review`);
    expect(pending.body).toHaveLength(12);
    // Confirm all of Claude's verdicts except kernel 10, which the operator calls shrivelled.
    const decisions = pending.body.map((k) => ({
      kernelId: k.id,
      finalClass: k.number === 10 ? "shrivelled" : k.aiClass,
    }));
    expect(
      (await api("POST", "/api/kernels/review", { decisions })).status,
    ).toBe(200);

    const after = await api<unknown[]>(
      "GET",
      `/api/samples/${sampleId}/review`,
    );
    expect(after.body).toHaveLength(0);
    const sample = await api<{
      kernels: { byClass: Record<string, number>; reviewed: number };
    }>("GET", `/api/samples/${sampleId}`);
    expect(sample.body.kernels.byClass).toMatchObject({
      broken: 7,
      shrivelled: 1,
      sound: 32,
    });
    expect(sample.body.kernels.reviewed).toBe(12);
  });

  it("computes mass percentages and the grade from the scale", async () => {
    const tooHeavy = await api("PUT", `/api/samples/${sampleId}/weights`, {
      cupMassG: { broken: 30 },
    });
    expect(tooHeavy.status).toBe(400);

    const res = await api<{
      result: {
        byClassPct: Record<string, number>;
        grade: { grade: string; failures: Record<string, unknown[]> };
      };
    }>("PUT", `/api/samples/${sampleId}/weights`, {
      cupMassG: { broken: 0.5, shrivelled: 0.05 },
    });
    expect(res.status).toBe(200);
    expect(res.body.result.byClassPct.broken).toBeCloseTo(2);
    expect(res.body.result.grade.grade).toBe("2");
    expect(Object.keys(res.body.result.grade.failures)).toEqual(["1"]);
  });

  it("completes, locks and reports the sample", async () => {
    const done = await api<{ status: string }>(
      "POST",
      `/api/samples/${sampleId}/complete`,
    );
    expect(done.status).toBe(200);
    expect(done.body.status).toBe("completed");

    const locked = await api("PUT", `/api/samples/${sampleId}/weights`, {
      cupMassG: {},
    });
    expect(locked.status).toBe(409);

    const summary = await api<{ aiSummary: string }>(
      "POST",
      `/api/samples/${sampleId}/summary`,
    );
    expect(summary.body.aiSummary).toBe("Screening summary.");
    expect(t.classifier.summaries[0]?.facts).toMatchObject({
      grade: "2",
      totalDefectsPct: 2.2,
    });

    const pdf = await t.app.inject({
      method: "GET",
      url: `/api/samples/${sampleId}/report.pdf`,
      headers: bearer(token),
    });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");

    const csv = await t.app.inject({
      method: "GET",
      url: "/api/samples/export.csv",
      headers: bearer(token),
    });
    const lines = csv.body.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^number,created/);
  });

  it("compares the method with a certified grader", async () => {
    await api("PUT", `/api/samples/${sampleId}/reference`, {
      byClassPct: { broken: 1.5, shrivelled: 0.2 },
      grade: "2",
      graderName: "Certified Grader",
    });
    const res = await api<{
      summary: {
        samples: number;
        gradeAgreement: number;
        byClass: { cls: string; meanBiasPct: number }[];
      };
    }>("GET", "/api/validation?crop=wheat");
    expect(res.body.summary.samples).toBe(1);
    expect(res.body.summary.gradeAgreement).toBe(1);
    const broken = res.body.summary.byClass.find((c) => c.cls === "broken");
    expect(broken?.meanBiasPct).toBeCloseTo(0.5);
  });

  it("exports reviewed kernels as a labelled dataset", async () => {
    const res = await t.app.inject({
      method: "GET",
      url: "/api/dataset/export.zip",
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    const files = unzipSync(new Uint8Array(res.rawPayload));
    const names = Object.keys(files);
    expect(names).toContain("labels.csv");
    expect(names.filter((n) => n.startsWith("wheat/broken/"))).toHaveLength(7);
    expect(names.filter((n) => n.startsWith("wheat/shrivelled/"))).toHaveLength(
      1,
    );
  });

  it("saves a reviewed kernel as a reference image used in later requests", async () => {
    const reopened = await api("POST", `/api/samples/${sampleId}/reopen`);
    expect(reopened.status).toBe(200);
    const flagged = await api<{ id: string; finalClass: string }[]>(
      "GET",
      `/api/samples/${sampleId}/review?scope=flagged`,
    );
    const broken = flagged.body.find((k) => k.finalClass === "broken")!;
    const ref = await api("POST", "/api/reference-images/from-kernel", {
      kernelId: broken.id,
    });
    expect(ref.status).toBe(201);

    await api("POST", `/api/batches/${batchId}/classify`, {
      reclassifyAll: true,
    });
    await t.jobs.idle();
    const last = t.classifier.requests.at(-1)!;
    expect(last.references.map((r) => r.cls)).toEqual(["broken"]);
  });

  it("writes the Level 1 prompt from the standard", async () => {
    const res = await api<{ prompt: string }>(
      "GET",
      `/api/prompts/level1?standardId=${standardId}`,
    );
    expect(res.body.prompt).toMatch(
      /Crop: Wheat\. Standard: Test wheat standard\./,
    );
    expect(res.body.prompt).toMatch(/columns A-T, rows 1-28/);
    expect(res.body.prompt).toMatch(/Broken \(Less than three quarters/);
    expect(res.body.prompt).toMatch(/Harmful & disease: Ergot/);
  });

  it("lets only admins delete a sample, and removes its files", async () => {
    expect(t.storage.files.size).toBeGreaterThan(0);
    const res = await api("DELETE", `/api/samples/${sampleId}`);
    expect(res.status).toBe(200);
    const left = [...t.storage.files.keys()].filter((k) =>
      k.includes(sampleId),
    );
    expect(left).toEqual([]);
  });
});

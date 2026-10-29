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
  method: "GET" | "POST" | "PUT",
  url: string,
  payload?: object,
) =>
  t.app
    .inject({
      method,
      url,
      headers: bearer(token),
      ...(payload && { payload }),
    })
    .then((r) => ({ status: r.statusCode, body: r.json<T>() }));

/** A wheat sample with one photographed, classified batch of 30 kernels (6 broken). */
async function classifiedSample(standardId: string | null) {
  const sample = await api<{ id: string }>("POST", "/api/samples", {
    crop: "wheat",
    standardId,
  });
  const photo = await syntheticBoard(30);
  const form = multipart(
    {
      corners: JSON.stringify(photo.corners),
      imageWidth: String(photo.width),
      imageHeight: String(photo.height),
    },
    { name: "photo", data: photo.jpeg },
  );
  const upload = await t.app.inject({
    method: "POST",
    url: `/api/samples/${sample.body.id}/batches`,
    headers: { ...bearer(token), ...form.headers },
    payload: form.payload,
  });
  const batchId = upload.json<{ id: string }>().id;
  await t.jobs.idle();
  await api("POST", `/api/batches/${batchId}/classify`);
  await t.jobs.idle();
  return sample.body.id;
}

async function reviewAll(sampleId: string) {
  const pending = await api<{ id: string; aiClass: string }[]>(
    "GET",
    `/api/samples/${sampleId}/review`,
  );
  await api("POST", "/api/kernels/review", {
    decisions: pending.body.map((k) => ({
      kernelId: k.id,
      finalClass: k.aiClass,
    })),
  });
}

interface Estimate {
  byClassPct?: never;
  byClass: Record<string, number>;
  purityPct: number;
  counted: number;
  countByClass: Record<string, number>;
  grade: { grade: string | null };
}

describe("instant estimate from the photos", () => {
  let strictId: string;
  let lenientId: string;

  beforeAll(async () => {
    const grades = [
      { grade: "1", maxDefectPct: { broken: 10 } },
      { grade: "2", maxDefectPct: { broken: 30 } },
    ];
    strictId = (
      await api<{ id: string }>("POST", "/api/standards", {
        name: "Weighed only",
        crop: "wheat",
        grades,
      })
    ).body.id;
    lenientId = (
      await api<{ id: string }>("POST", "/api/standards", {
        name: "Estimate allowed",
        crop: "wheat",
        grades,
        allowEstimate: true,
      })
    ).body.id;
  });

  it("estimates mass % per class as soon as kernels are classified", async () => {
    const id = await classifiedSample(strictId);
    const sample = await api<{ estimate: Estimate }>(
      "GET",
      `/api/samples/${id}`,
    );
    const e = sample.body.estimate;
    // Every 5th kernel is broken and all synthetic kernels are the same size: 6 of 30.
    expect(e.countByClass.broken).toBe(6);
    expect(e.byClass.broken).toBeCloseTo(20, 0);
    expect(e.purityPct).toBeCloseTo(80, 0);
    expect(e.grade.grade).toBe("2");
  });

  it("won't complete on the estimate when the standard requires weighing", async () => {
    const id = await classifiedSample(strictId);
    await reviewAll(id);
    const res = await api<{ error: string }>(
      "POST",
      `/api/samples/${id}/complete`,
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(
      /doesn't allow completing on the photo estimate/,
    );
  });

  it("completes on the estimate when the standard allows it, after review", async () => {
    const id = await classifiedSample(lenientId);
    const early = await api<{ error: string }>(
      "POST",
      `/api/samples/${id}/complete`,
    );
    expect(early.body.error).toMatch(/flagged kernel/);
    await reviewAll(id);
    const done = await api<{
      status: string;
      result: { source: string; grade: { grade: string } };
    }>("POST", `/api/samples/${id}/complete`);
    expect(done.status).toBe(200);
    expect(done.body.result).toMatchObject({
      source: "estimate",
      grade: { grade: "2" },
    });

    const pdf = await t.app.inject({
      method: "GET",
      url: `/api/samples/${id}/report.pdf`,
      headers: bearer(token),
    });
    expect(pdf.statusCode).toBe(200);

    // Reopening clears the estimate-based result.
    const reopened = await api<{ result: unknown }>(
      "POST",
      `/api/samples/${id}/reopen`,
    );
    expect(reopened.body.result).toBeNull();
  });

  it("uses the weighed result when the sample was weighed, even if estimates are allowed", async () => {
    const id = await classifiedSample(lenientId);
    await reviewAll(id);
    await api("PUT", `/api/samples/${id}/weights`, {
      sampleMassG: 25,
      cupMassG: { broken: 1 },
    });
    const done = await api<{
      result: { source: string; grade: { grade: string } };
    }>("POST", `/api/samples/${id}/complete`);
    expect(done.body.result).toMatchObject({
      source: "weighed",
      grade: { grade: "1" },
    });
  });
});

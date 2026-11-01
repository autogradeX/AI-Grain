import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClassifyRequest } from "../src/ai/classifier.js";
import { CROP_PRESETS } from "@ai-grain/core";
import {
  autopilotOf,
  flagFor,
  type TriageKernel,
} from "../src/modules/autopilot/triage.js";
import {
  bearer,
  createTestApp,
  multipart,
  register,
  syntheticBoard,
  type TestApp,
} from "./helpers.js";

const wheat = CROP_PRESETS.wheat!.classes;
const on = autopilotOf({ spotCheckPct: 0 });
const k = (over: Partial<TriageKernel>): TriageKernel => ({
  isCluster: false,
  aiClass: "sound",
  aiConfidence: "high",
  aiClass2: null,
  aiConfidence2: null,
  draw: 0.5,
  ...over,
});

describe("triage: which kernels a person sees", () => {
  it("lets confident, agreed verdicts stand", () => {
    expect(flagFor(k({}), wheat, on)).toBeNull();
    expect(
      flagFor(
        k({ aiClass: "broken", aiClass2: "broken", aiConfidence2: "medium" }),
        wheat,
        on,
      ),
    ).toBeNull();
  });

  it("sends uncertain, disputed and harmful kernels to a person", () => {
    expect(flagFor(k({ isCluster: true }), wheat, on)).toBe("cluster");
    expect(flagFor(k({ aiClass: "unclear" }), wheat, on)).toBe("unclear");
    expect(flagFor(k({ aiConfidence: "low" }), wheat, on)).toBe(
      "low_confidence",
    );
    expect(
      flagFor(k({ aiClass: "broken", aiClass2: "shrivelled" }), wheat, on),
    ).toBe("disagreement");
    expect(flagFor(k({ aiClass: "ergot", aiClass2: "ergot" }), wheat, on)).toBe(
      "harmful",
    );
    // No second opinion (it failed): the defect isn't taken on one verdict.
    expect(flagFor(k({ aiClass: "broken" }), wheat, on)).toBe("defect");
  });

  it("spot-checks a share of accepted kernels", () => {
    const spot = autopilotOf({ spotCheckPct: 5 });
    expect(flagFor(k({ draw: 0.01 }), wheat, spot)).toBe("spot_check");
    expect(flagFor(k({ draw: 0.5 }), wheat, spot)).toBeNull();
  });

  it("without Autopilot, every defect goes to a person", () => {
    const off = autopilotOf({ enabled: false });
    expect(
      flagFor(k({ aiClass: "broken", aiClass2: "broken" }), wheat, off),
    ).toBe("defect");
    expect(flagFor(k({}), wheat, off)).toBeNull();
  });
});

describe("Autopilot from photo to report", () => {
  let t: TestApp;
  let token: string;

  beforeAll(async () => {
    t = await createTestApp();
    ({ token } = await register(t, "auto@farm.test", "Auto Farm", {
      autopilot: true,
    }));
    // No random spot checks, so counts are exact.
    await api("PATCH", "/api/org", { autopilot: { spotCheckPct: 0 } });
  });
  afterAll(async () => {
    await t.close();
  });

  const api = <T = Record<string, unknown>>(
    method: "GET" | "POST" | "PUT" | "PATCH",
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

  /** A sample and one photo uploaded without corners, as the last photo. */
  async function photographed(
    photo: Buffer,
    sample: { standardId?: string } = {},
  ) {
    const created = await api<{ id: string }>("POST", "/api/samples", {
      crop: "wheat",
      ...sample,
    });
    const form = multipart({ finish: "true" }, { name: "photo", data: photo });
    const upload = await t.app.inject({
      method: "POST",
      url: `/api/samples/${created.body.id}/batches`,
      headers: { ...bearer(token), ...form.headers },
      payload: form.payload,
    });
    expect(upload.statusCode).toBe(202);
    await t.jobs.idle();
    return {
      sampleId: created.body.id,
      batchId: upload.json<{ id: string }>().id,
    };
  }

  interface SampleView {
    status: string;
    result: { source?: string } | null;
    aiSummary: string | null;
    completedBy: string | null;
    autopilot: {
      enabled: boolean;
      acceptedByAi: number;
      flaggedByReason: Record<string, number>;
    };
    kernels: { total: number; flagged: number; pendingReview: number };
  }

  it("finds the board, classifies, double-checks and asks a person only about the uncertain kernels", async () => {
    const before = t.classifier.requests.length;
    const photo = await syntheticBoard(40);
    const { sampleId, batchId } = await photographed(photo.jpeg);

    const batch = await api<{ status: string; kernelCount: number }>(
      "GET",
      `/api/batches/${batchId}`,
    );
    expect(batch.body.status).toBe("classified");
    expect(batch.body.kernelCount).toBe(40);

    // A first pass over all 40 kernels, then a second opinion on the 8 broken ones.
    const requests = t.classifier.requests.slice(before);
    expect(requests.length).toBeGreaterThan(2);
    const secondPass = requests.slice(2).flatMap((r) => r.numbers);
    expect(secondPass.sort((a, b) => a - b)).toEqual([
      5, 10, 15, 20, 25, 30, 35, 40,
    ]);

    // Only the 4 low-confidence kernels need a person: 10% of the sample.
    const view = await api<SampleView>("GET", `/api/samples/${sampleId}`);
    expect(view.body.status).toBe("in_progress");
    expect(view.body.kernels.pendingReview).toBe(4);
    expect(view.body.autopilot.flaggedByReason).toEqual({
      low_confidence: 4,
    });
    expect(view.body.autopilot.acceptedByAi).toBe(36);

    // The person confirms them; Autopilot completes the sample on its own.
    const pending = await api<
      { id: string; aiClass: string; flagReason: string }[]
    >("GET", `/api/samples/${sampleId}/review`);
    expect(pending.body.every((k) => k.flagReason === "low_confidence")).toBe(
      true,
    );
    await api("POST", "/api/kernels/review", {
      decisions: pending.body.map((k) => ({
        kernelId: k.id,
        finalClass: k.aiClass,
      })),
    });
    await t.jobs.idle();
    const done = await api<SampleView>("GET", `/api/samples/${sampleId}`);
    expect(done.body.status).toBe("completed");
    expect(done.body.result?.source).toBe("estimate");
    expect(done.body.completedBy).toBeNull();
    expect(done.body.aiSummary).toBe("Screening summary.");
    const certificates = await api<{ code: string; status: string }[]>(
      "GET",
      `/api/samples/${sampleId}/certificates`,
    );
    expect(certificates.body[0]?.status).toBe("valid");
  });

  it("sends kernels to a person when the two passes disagree, and every harmful one", async () => {
    const original = t.classifier.classify.bind(t.classifier);
    const seen = new Set<number>();
    t.classifier.classify = async (req: ClassifyRequest) => {
      const res = await original(req);
      return {
        ...res,
        verdicts: res.verdicts.map((v) => {
          const again = seen.has(v.number);
          seen.add(v.number);
          if (v.number === 3) return { ...v, cls: "ergot", confidence: "high" };
          // The second opinion on kernel 10 differs from the first.
          if (again && v.number === 10) return { ...v, cls: "shrivelled" };
          return v;
        }),
      };
    };
    try {
      const photo = await syntheticBoard(20);
      const { sampleId } = await photographed(photo.jpeg);
      const view = await api<SampleView>("GET", `/api/samples/${sampleId}`);
      expect(view.body.autopilot.flaggedByReason).toMatchObject({
        harmful: 1,
        disagreement: 1,
      });
      expect(view.body.status).toBe("in_progress");
    } finally {
      t.classifier.classify = original;
    }
  });

  it("waits for weighing when the standard requires it", async () => {
    const std = await api<{ id: string }>("POST", "/api/standards", {
      name: "Weighing required",
      crop: "wheat",
      grades: [{ grade: "1", maxDefectPct: { broken: 50 } }],
      allowEstimate: false,
    });
    expect(std.status).toBe(201);
    const photo = await syntheticBoard(20);
    const { sampleId } = await photographed(photo.jpeg, {
      standardId: std.body.id,
    });
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
    await t.jobs.idle();
    const waiting = await api<SampleView>("GET", `/api/samples/${sampleId}`);
    expect(waiting.body.status).toBe("in_progress");
    const finish = await api<{ waitingFor: string[] }>(
      "POST",
      `/api/samples/${sampleId}/finish`,
    );
    expect(finish.body.waitingFor.join(" ")).toMatch(/weigh the cups/);

    // Weighing is all it waited for.
    await api("PUT", `/api/samples/${sampleId}/weights`, {
      sampleMassG: 50,
      cupMassG: { broken: 2 },
    });
    await t.jobs.idle();
    const done = await api<SampleView>("GET", `/api/samples/${sampleId}`);
    expect(done.body.status).toBe("completed");
    expect(done.body.result?.source).not.toBe("estimate");
  });

  it("asks for the corners when it can't find the board", async () => {
    const blank = await sharp({
      create: { width: 900, height: 1200, channels: 3, background: "#c8c0b0" },
    })
      .jpeg()
      .toBuffer();
    const { batchId } = await photographed(blank);
    const batch = await api<{ status: string; error: string }>(
      "GET",
      `/api/batches/${batchId}`,
    );
    expect(batch.body.status).toBe("failed");
    expect(batch.body.error).toMatch(/Mark its four corners/);
    // The sample doesn't finish without that photo.
    const sampleId = (
      await api<{ sampleId: string }>("GET", `/api/batches/${batchId}`)
    ).body.sampleId;
    const finish = await api<{ waitingFor: string[] }>(
      "POST",
      `/api/samples/${sampleId}/finish`,
    );
    expect(finish.body.waitingFor.join(" ")).toMatch(/photo that failed/);
  });
});

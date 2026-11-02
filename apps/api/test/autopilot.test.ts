import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClassifyRequest } from "../src/ai/classifier.js";
import { CROP_PRESETS } from "@ai-grain/core";
import {
  autopilotOf,
  flagFor,
  wantsExpert,
  type TriageKernel,
} from "../src/modules/autopilot/triage.js";
import {
  bearer,
  createTestApp,
  kernelsOnPaper,
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

  it("accepts a confident expert verdict, but not a harmful or unsure one", () => {
    const low = { aiClass: "sound", aiConfidence: "low" as const };
    expect(wantsExpert(k(low), wheat, on)).toBe(true);
    expect(
      flagFor(
        k({ ...low, expertClass: "sound", expertConfidence: "high" }),
        wheat,
        on,
      ),
    ).toBeNull();
    // Medium is enough when it agrees with an earlier look...
    expect(
      flagFor(
        k({ ...low, expertClass: "sound", expertConfidence: "medium" }),
        wheat,
        on,
      ),
    ).toBeNull();
    // ...but not on touching kernels, and not when it says something new.
    expect(
      flagFor(
        k({
          ...low,
          isCluster: true,
          expertClass: "sound",
          expertConfidence: "medium",
        }),
        wheat,
        on,
      ),
    ).toBe("cluster");
    expect(
      flagFor(
        k({ ...low, expertClass: "broken", expertConfidence: "medium" }),
        wheat,
        on,
      ),
    ).toBe("low_confidence");
    expect(
      flagFor(
        k({ ...low, expertClass: "ergot", expertConfidence: "high" }),
        wheat,
        on,
      ),
    ).toBe("harmful");
    expect(
      flagFor(
        k({ ...low, expertClass: "unclear", expertConfidence: "high" }),
        wheat,
        on,
      ),
    ).toBe("low_confidence");
    // Harmful first looks never go to the expert: a person checks them.
    expect(wantsExpert(k({ aiClass: "ergot" }), wheat, on)).toBe(false);
    expect(wantsExpert(k({}), wheat, on)).toBe(false);
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
    const looks = requests.filter((r) => !r.expert);
    expect(looks.length).toBeGreaterThan(2);
    const secondPass = looks.slice(2).flatMap((r) => r.numbers);
    expect(secondPass.sort((a, b) => a - b)).toEqual([
      5, 10, 15, 20, 25, 30, 35, 40,
    ]);
    // The 4 low-confidence kernels go to the expert pass, on the Advanced tier.
    const expert = requests.filter((r) => r.expert);
    expect(expert.flatMap((r) => r.numbers)).toEqual([7, 14, 21, 28]);
    expect(expert.every((r) => r.model === "claude-opus-5-5")).toBe(true);
    expect(expert[0]!.expert!.notes[7]).toMatch(/first look: "sound" \(low/);

    // The expert wasn't sure either, so only those 4 need a person: 10% of the sample.
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
    // Kernel size of the sound kernels (0.7 cm × 0.36 cm ellipses), saved at completion.
    const dims = (
      done.body as unknown as {
        dimensions: { kernels: number; meanLengthMm: number; meanLb: number };
      }
    ).dimensions;
    expect(dims.kernels).toBeGreaterThan(20);
    expect(dims.meanLengthMm).toBeGreaterThan(6.6);
    expect(dims.meanLengthMm).toBeLessThan(7.5);
    expect(dims.meanLb).toBeGreaterThan(1.7);
    expect(dims.meanLb).toBeLessThan(2.3);
    const certificates = await api<{ code: string; status: string }[]>(
      "GET",
      `/api/samples/${sampleId}/certificates`,
    );
    expect(certificates.body[0]?.status).toBe("valid");

    // The report was built when the sample completed, and is served from storage.
    const stored = () =>
      [...t.storage.files.keys()].filter(
        (key) => key.includes(sampleId) && key.includes("/reports/"),
      );
    expect(stored()).toHaveLength(1);
    const first = await t.app.inject({
      method: "GET",
      url: `/api/samples/${sampleId}/report.pdf`,
      headers: bearer(token),
    });
    expect(first.statusCode).toBe(200);
    expect(first.rawPayload.equals(t.storage.files.get(stored()[0]!)!)).toBe(
      true,
    );
    // A rewritten summary makes a new report, replacing the old one.
    const summarize = t.classifier.summarize.bind(t.classifier);
    t.classifier.summarize = () =>
      Promise.resolve({
        text: "A different summary.",
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      });
    const old = stored()[0];
    await api("POST", `/api/samples/${sampleId}/summary`);
    await t.jobs.idle();
    t.classifier.summarize = summarize;
    expect(stored()).toHaveLength(1);
    expect(stored()[0]).not.toBe(old);
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
          // The second opinion on kernel 10 differs from the first, and the
          // expert can't tell either.
          if (req.expert && v.number === 10)
            return { ...v, cls: "unclear", confidence: "low" as const };
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

  it("lets the expert pass settle what the first looks couldn't", async () => {
    const original = t.classifier.classify.bind(t.classifier);
    t.classifier.classify = async (req: ClassifyRequest) => {
      const res = await original(req);
      if (!req.expert) return res;
      return {
        ...res,
        verdicts: res.verdicts.map((v) =>
          // Kernel 14 turns out to be ergot: harmful, so a person checks it.
          v.number === 14
            ? { ...v, cls: "ergot", confidence: "high" as const }
            : { ...v, confidence: "high" as const, reason: "clearly sound" },
        ),
      };
    };
    try {
      const photo = await syntheticBoard(30);
      const { sampleId } = await photographed(photo.jpeg);
      const view = await api<
        SampleView & { autopilot: { expertSettled: number } }
      >("GET", `/api/samples/${sampleId}`);
      // 7, 21 and 28 settled by the expert as sound; 14 is ergot.
      expect(view.body.autopilot.flaggedByReason).toEqual({ harmful: 1 });
      expect(view.body.autopilot.expertSettled).toBe(3);
      const pending = await api<
        { number: number; aiClass: string; firstClass: string }[]
      >("GET", `/api/samples/${sampleId}/review`);
      expect(pending.body).toMatchObject([
        { number: 14, aiClass: "ergot", firstClass: "sound" },
      ]);
    } finally {
      t.classifier.classify = original;
    }
  });

  it("without the expert pass, uncertain kernels go straight to a person", async () => {
    await api("PATCH", "/api/org", { autopilot: { expertReview: false } });
    try {
      const before = t.classifier.requests.length;
      const photo = await syntheticBoard(20);
      const { sampleId } = await photographed(photo.jpeg);
      expect(t.classifier.requests.slice(before).some((r) => r.expert)).toBe(
        false,
      );
      const view = await api<SampleView>("GET", `/api/samples/${sampleId}`);
      expect(view.body.autopilot.flaggedByReason).toEqual({
        low_confidence: 2,
      });
    } finally {
      await api("PATCH", "/api/org", { autopilot: { expertReview: true } });
    }
  });

  it("reads the photo's side when nobody gave it", async () => {
    const original = t.classifier.classify.bind(t.classifier);
    const sides: string[] = [];
    t.classifier.classify = async (req: ClassifyRequest) => {
      sides.push(req.side);
      const res = await original(req);
      return req.side === "auto" ? { ...res, side: "crease" as const } : res;
    };
    try {
      const photo = await syntheticBoard(40);
      const { batchId } = await photographed(photo.jpeg);
      const batch = await api<{ side: string; sideDetected: boolean }>(
        "GET",
        `/api/batches/${batchId}`,
      );
      expect(batch.body).toMatchObject({ side: "crease", sideDetected: true });
      // The first look asks; later looks are told.
      expect(sides[0]).toBe("auto");
      expect(sides.at(-1)).toBe("crease");
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

  it("suggests the standard this organisation uses for the crop", async () => {
    const none = await api<{ suggestion: unknown }>(
      "GET",
      "/api/standards/suggest?crop=barley",
    );
    expect(none.body.suggestion).toBeNull();
    const make = (name: string) =>
      api<{ id: string }>("POST", "/api/standards", {
        name,
        crop: "barley",
        grades: [{ grade: "1", maxDefectPct: {} }],
      });
    const older = await make("Barley intake");
    const newer = await make("Barley malting");
    // Nothing used yet: the newest.
    const first = await api<{
      suggestion: { standard: { id: string }; reason: { kind: string } };
    }>("GET", "/api/standards/suggest?crop=barley");
    expect(first.body.suggestion).toMatchObject({
      standard: { id: newer.body.id },
      reason: { kind: "newest" },
    });
    // Used most: the older one.
    for (let i = 0; i < 2; i++)
      await api("POST", "/api/samples", {
        crop: "barley",
        standardId: older.body.id,
      });
    const sample = await api<{ id: string }>("POST", "/api/samples", {
      crop: "barley",
    });
    const view = await api<{
      suggestedStandard: { standard: { id: string }; reason: object };
    }>("GET", `/api/samples/${sample.body.id}`);
    expect(view.body.suggestedStandard).toMatchObject({
      standard: { id: older.body.id },
      reason: { kind: "usage", used: 2, of: 2 },
    });
  });

  it("measures repeatability between two runs of the same sample", async () => {
    const photo = await syntheticBoard(30);
    const finish = async (sampleId: string) => {
      const pending = await api<{ id: string; aiClass: string }[]>(
        "GET",
        `/api/samples/${sampleId}/review`,
      );
      if (pending.body.length)
        await api("POST", "/api/kernels/review", {
          decisions: pending.body.map((k) => ({
            kernelId: k.id,
            finalClass: k.aiClass === "unclear" ? "sound" : k.aiClass,
          })),
        });
      await t.jobs.idle();
    };
    const first = await photographed(photo.jpeg);
    await finish(first.sampleId);

    const repeat = await api<{ id: string; repeatOf: string; crop: string }>(
      "POST",
      `/api/samples/${first.sampleId}/repeat`,
    );
    expect(repeat.status).toBe(201);
    expect(repeat.body).toMatchObject({
      repeatOf: first.sampleId,
      crop: "wheat",
    });
    const form = multipart(
      { finish: "true" },
      { name: "photo", data: photo.jpeg },
    );
    await t.app.inject({
      method: "POST",
      url: `/api/samples/${repeat.body.id}/batches`,
      headers: { ...bearer(token), ...form.headers },
      payload: form.payload,
    });
    await t.jobs.idle();
    await finish(repeat.body.id);

    const view = await api<{
      status: string;
      repeat: { runs: { id: string; comparison: { agreementPct: number } }[] };
    }>("GET", `/api/samples/${repeat.body.id}`);
    expect(view.body.status).toBe("completed");
    expect(view.body.repeat.runs).toMatchObject([
      { id: first.sampleId, comparison: { agreementPct: 100 } },
    ]);
    const report = await api<{
      summary: { count: number; bands: Record<string, number> };
    }>("GET", "/api/validation/repeatability");
    expect(report.body.summary.count).toBe(1);
    expect(report.body.summary.bands["99+"]).toBe(1);
  });

  it("returns the same sample when an offline device sends it again", async () => {
    const payload = { crop: "paddy", clientRef: "device-1:3b7f0c2e" };
    const first = await api<{ id: string; number: number }>(
      "POST",
      "/api/samples",
      payload,
    );
    expect(first.status).toBe(201);
    const again = await api<{ id: string }>("POST", "/api/samples", payload);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    // A photo sent twice with the same reference is stored once.
    const photo = await syntheticBoard(10);
    const send = () => {
      const form = multipart(
        { clientRef: "device-1:photo-1" },
        { name: "photo", data: photo.jpeg },
      );
      return t.app.inject({
        method: "POST",
        url: `/api/samples/${first.body.id}/batches`,
        headers: { ...bearer(token), ...form.headers },
        payload: form.payload,
      });
    };
    const one = await send();
    const two = await send();
    expect(one.statusCode).toBe(202);
    expect(two.statusCode).toBe(200);
    expect(two.json<{ id: string }>().id).toBe(one.json<{ id: string }>().id);
    await t.jobs.idle();
  });

  it("works on a photo without the grid board, without sizes in mm", async () => {
    const { sampleId, batchId } = await photographed(await kernelsOnPaper(24));
    const batch = await api<{
      status: string;
      kernelCount: number;
      scaleKnown: boolean;
      error: string | null;
      kernels: { lengthMm: number | null }[];
    }>("GET", `/api/batches/${batchId}`);
    expect(batch.body).toMatchObject({
      status: "classified",
      kernelCount: 24,
      scaleKnown: false,
    });
    expect(batch.body.error).toMatch(/No grid board in this photo/);
    expect(batch.body.kernels.every((k) => k.lengthMm === null)).toBe(true);
    const view = await api<{ dimensions: unknown }>(
      "GET",
      `/api/samples/${sampleId}`,
    );
    expect(view.body.dimensions).toBeNull();
  });

  it("fails clearly when the photo shows no kernels", async () => {
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
    expect(batch.body.error).toMatch(/No kernels were found/);
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

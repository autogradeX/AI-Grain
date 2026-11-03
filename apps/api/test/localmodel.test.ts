import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ClassifierUnavailableError,
  type ClassifyRequest,
} from "../src/ai/classifier.js";
import { CROP_FEATURES, cropFeatures } from "../src/imaging/features.js";
import { evaluate, train, verdictOf } from "../src/modules/localmodel/model.js";
import {
  bearer,
  createTestApp,
  kindsBoard,
  multipart,
  register,
  type TestApp,
} from "./helpers.js";
import sharp from "sharp";

describe("the local model's network", () => {
  it("learns classes it can tell apart and says how sure it is", () => {
    let s = 3;
    const rand = () => (s = (s * 16807) % 2147483647) / 2147483647 - 0.5;
    const make = (label: string, cx: number, cy: number, n: number) =>
      Array.from({ length: n }, () => ({
        x: [cx + rand(), cy + rand(), rand()],
        label,
        weight: 1,
      }));
    const data = [
      ...make("sound", 0, 0, 300),
      ...make("broken", 3, 0, 60),
      ...make("ergot", 0, 3, 40),
    ];
    const model = train(data, { seed: 1 });
    const test = [
      ...make("sound", 0, 0, 50),
      ...make("broken", 3, 0, 50),
      ...make("ergot", 0, 3, 50),
    ];
    const m = evaluate(model, test, "sound");
    expect(m.accuracy).toBeGreaterThan(0.95);
    expect(m.perClass.broken!.recall).toBeGreaterThan(0.9);
    expect(m.defectRecall).toBeGreaterThan(0.95);
    expect(verdictOf(model, [3, 0, 0]).cls).toBe("broken");
    // Half-way between two classes: not sure.
    expect(verdictOf(model, [1.5, 0, 0]).confidence).not.toBe("high");
  });
});

describe("crop measurements", () => {
  it("tells a dark kernel from a light one, and a small one from a large one", async () => {
    const tile = (rx: number, fill: string) =>
      sharp({
        create: { width: 200, height: 200, channels: 3, background: "#1b1b1d" },
      })
        .composite([
          {
            input: Buffer.from(
              `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><ellipse cx="100" cy="100" rx="${rx}" ry="35" fill="${fill}"/></svg>`,
            ),
          },
        ])
        .jpeg()
        .toBuffer();
    const at = (name: (typeof CROP_FEATURES)[number]) =>
      CROP_FEATURES.indexOf(name);
    const light = await cropFeatures(await tile(70, "#d8b46a"));
    const dark = await cropFeatures(await tile(70, "#5c3a1e"));
    const small = await cropFeatures(await tile(36, "#d8b46a"));
    expect(light[at("meanL")]!).toBeGreaterThan(dark[at("meanL")]! + 50);
    expect(light[at("fill")]!).toBeGreaterThan(small[at("fill")]! * 1.6);
    expect(light[at("elongation")]!).toBeGreaterThan(1.7);
    expect(small[at("elongation")]!).toBeLessThan(1.3);
  });
});

describe("classifying offline with the organisation's own model", () => {
  let t: TestApp;
  let token: string;
  // Every 5th kernel broken, every 7th heat-damaged, the rest sound.
  const kindOf = (n: number) =>
    n % 5 === 0 ? "broken" : n % 7 === 0 ? "heat_damaged" : "sound";
  const kinds = Array.from({ length: 120 }, (_, i) => kindOf(i + 1));
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

  async function photographed(seed: number) {
    const sample = await api<{ id: string }>("POST", "/api/samples", {
      crop: "wheat",
    });
    const form = multipart(
      { finish: "true" },
      { name: "photo", data: await kindsBoard(kinds, seed) },
    );
    const up = await t.app.inject({
      method: "POST",
      url: `/api/samples/${sample.body.id}/batches`,
      headers: { ...bearer(token), ...form.headers },
      payload: form.payload,
    });
    await t.jobs.idle();
    return { sampleId: sample.body.id, batchId: up.json<{ id: string }>().id };
  }

  beforeAll(async () => {
    t = await createTestApp();
    ({ token } = await register(t, "lm@mandi.test", "Mandi", {
      autopilot: true,
    }));
    await api("PATCH", "/api/org", {
      autopilot: { spotCheckPct: 0, expertReview: false },
    });
    // Model Orchestration (fake) sees what each kernel is.
    t.classifier.classify = (req: ClassifyRequest) =>
      Promise.resolve({
        verdicts: req.numbers.map((n) => ({
          number: n,
          cls: kindOf(n),
          confidence: "high" as const,
          reason: "test",
        })),
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      });
  }, 60000);
  afterAll(() => t.close());

  it("refuses to train without enough checked kernels", async () => {
    const res = await api("POST", "/api/local-model/train", { crop: "wheat" });
    expect(res.status).toBe(400);
  });

  it("trains on settled kernels and classifies offline", async () => {
    for (const seed of [11, 12, 13]) await photographed(seed);
    const before = await api<{
      counts: Record<string, { settled: number }>;
    }>("GET", "/api/local-model?crop=wheat");
    expect(before.body.counts.sound!.settled).toBeGreaterThan(200);

    const started = await api("POST", "/api/local-model/train", {
      crop: "wheat",
    });
    expect(started.status).toBe(202);
    await t.jobs.idle();
    const status = await api<{
      training: string | null;
      versions: {
        version: number;
        active: boolean;
        metrics: { accuracy: number; defectRecall: number; trainedOn: number };
      }[];
    }>("GET", "/api/local-model?crop=wheat");
    expect(status.body.training).toBeNull();
    const v1 = status.body.versions[0]!;
    expect(v1).toMatchObject({ version: 1, active: true });
    expect(v1.metrics.accuracy).toBeGreaterThan(0.9);
    expect(v1.metrics.defectRecall).toBeGreaterThan(0.9);

    // No internet: the local model classifies instead of waiting.
    const online = t.classifier.classify.bind(t.classifier);
    t.classifier.classify = () =>
      Promise.reject(new ClassifierUnavailableError("offline"));
    try {
      const { sampleId, batchId } = await photographed(21);
      const batch = await api<{
        status: string;
        error: string;
        kernels: {
          number: number;
          aiClass: string;
          flagReason: string | null;
        }[];
      }>("GET", `/api/batches/${batchId}`);
      expect(batch.body.status).toBe("classified");
      expect(batch.body.error).toMatch(/Classified offline by the local model/);
      const right = batch.body.kernels.filter(
        (k) => k.aiClass === kindOf(k.number),
      ).length;
      expect(right / batch.body.kernels.length).toBeGreaterThan(0.9);
      // Its confident verdicts stand; a person checks the rest, then it completes.
      const pending = await api<{ id: string; aiClass: string }[]>(
        "GET",
        `/api/samples/${sampleId}/review`,
      );
      expect(pending.body.length).toBeLessThan(40);
      if (pending.body.length)
        await api("POST", "/api/kernels/review", {
          decisions: pending.body.map((k) => ({
            kernelId: k.id,
            finalClass: k.aiClass === "unclear" ? "sound" : k.aiClass,
          })),
        });
      await t.jobs.idle();
      const done = await api<{ status: string }>(
        "GET",
        `/api/samples/${sampleId}`,
      );
      expect(done.body.status).toBe("completed");
    } finally {
      t.classifier.classify = online;
    }
  }, 120000);

  it("waits for internet when switched off, and skips Model Orchestration when always on", async () => {
    const online = t.classifier.classify.bind(t.classifier);
    t.classifier.classify = () =>
      Promise.reject(new ClassifierUnavailableError("offline"));
    try {
      await api("PUT", "/api/local-model/settings", { mode: "off" });
      const off = await photographed(31);
      const waiting = await api<{ status: string }>(
        "GET",
        `/api/batches/${off.batchId}`,
      );
      expect(waiting.body.status).toBe("waiting");
    } finally {
      t.classifier.classify = online;
    }
    await api("PUT", "/api/local-model/settings", { mode: "always" });
    let asked = 0;
    t.classifier.classify = (req) => {
      asked++;
      return online(req);
    };
    try {
      const always = await photographed(32);
      const batch = await api<{ status: string }>(
        "GET",
        `/api/batches/${always.batchId}`,
      );
      expect(batch.body.status).toBe("classified");
      expect(asked).toBe(0);
    } finally {
      t.classifier.classify = online;
      await api("PUT", "/api/local-model/settings", { mode: "offline" });
    }
  }, 120000);

  it("doesn't use a model that can't tell the classes apart", async () => {
    // Another crop whose kernels all look alike, labelled by number: nothing to learn.
    const online = t.classifier.classify.bind(t.classifier);
    const same = Array.from({ length: 120 }, () => "sound");
    const barley = async (seed: number) => {
      const sample = await api<{ id: string }>("POST", "/api/samples", {
        crop: "barley",
      });
      const form = multipart(
        { finish: "true" },
        { name: "photo", data: await kindsBoard(same, seed) },
      );
      const up = await t.app.inject({
        method: "POST",
        url: `/api/samples/${sample.body.id}/batches`,
        headers: { ...bearer(token), ...form.headers },
        payload: form.payload,
      });
      await t.jobs.idle();
      return up.json<{ id: string }>().id;
    };
    for (const seed of [41, 42, 43, 44, 45]) await barley(seed);
    await api("POST", "/api/local-model/train", { crop: "barley" });
    await t.jobs.idle();
    const status = await api<{
      versions: { shortfalls: string[] }[];
    }>("GET", "/api/local-model?crop=barley");
    expect(status.body.versions[0]!.shortfalls.join(" ")).toMatch(
      /catches \d+% of defects/,
    );
    t.classifier.classify = () =>
      Promise.reject(new ClassifierUnavailableError("offline"));
    try {
      const batchId = await barley(46);
      const batch = await api<{ status: string }>(
        "GET",
        `/api/batches/${batchId}`,
      );
      expect(batch.body.status).toBe("waiting");
    } finally {
      t.classifier.classify = online;
    }
  }, 120000);

  it("only lets admins train", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/local-model/train",
      payload: { crop: "wheat" },
    });
    expect(res.statusCode).toBe(401);
  });
});

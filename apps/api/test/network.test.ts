import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ClassifierUnavailableError,
  type ClassifyRequest,
} from "../src/ai/classifier.js";
import { outbox } from "../src/db/schema.js";
import { augment, MobileNetEmbedder } from "../src/imaging/embedder.js";
import { sweep } from "../src/modules/station/sweeper.js";
import {
  bearer,
  createTestApp,
  kindsBoard,
  multipart,
  register,
  type TestApp,
} from "./helpers.js";

type Method = "GET" | "POST" | "PUT" | "PATCH";
const client =
  (t: TestApp, token: string) =>
  <T = Record<string, unknown>>(
    method: Method,
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

// Every 5th kernel broken, every 7th heat-damaged, the rest sound.
const kindOf = (n: number) =>
  n % 5 === 0 ? "broken" : n % 7 === 0 ? "heat_damaged" : "sound";
const kinds = Array.from({ length: 120 }, (_, i) => kindOf(i + 1));

/** Model Orchestration (fake) that sees what each kernel is. */
function truthful(t: TestApp) {
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
}

/** A sample of one board photo; finished (AI verdicts accepted) when `finish`. */
async function assay(t: TestApp, token: string, seed: number, finish = true) {
  const api = client(t, token);
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
  if (finish) {
    await api("POST", `/api/samples/${sample.body.id}/review/accept-ai`, {});
    await t.jobs.idle();
  }
  return { sampleId: sample.body.id, batchId: up.json<{ id: string }>().id };
}

describe("one local model for the whole network", () => {
  let central: TestApp;
  let station: TestApp;
  let hqToken: string;
  let stationToken: string;

  beforeAll(async () => {
    central = await createTestApp();
    station = await createTestApp();
    ({ token: hqToken } = await register(central, "hq@net.test", "Board"));
    ({ token: stationToken } = await register(
      station,
      "raipur@net.test",
      "APMC Raipur",
      { autopilot: true },
    ));
    await client(station, stationToken)("PATCH", "/api/org", {
      autopilot: { spotCheckPct: 0, expertReview: false },
    });
    truthful(station);
    // The station's requests reach the central app.
    station.webhooks.handler = async (url, init) => {
      const u = new URL(url);
      const res = await central.app.inject({
        method: (init.method ?? "GET") as Method,
        url: u.pathname + u.search,
        headers: init.headers as Record<string, string>,
        ...(init.body ? { payload: init.body as string } : {}),
      });
      return new Response(res.body, { status: res.statusCode });
    };
    const key = await client(central, hqToken)<{ key: string }>(
      "POST",
      "/api/integration/keys",
      { name: "APMC Raipur station", scope: "station" },
    );
    await client(station, stationToken)("PUT", "/api/integration/central", {
      url: "https://central.test/",
      key: key.body.key,
    });
  }, 60000);
  afterAll(async () => {
    await station.close();
    await central.close();
  });

  it("learns at the centre from the station's kernels, and the station classifies offline with it", async () => {
    const hq = client(central, hqToken);
    const raipur = client(station, stationToken);
    for (const seed of [41, 42, 43, 44, 45])
      await assay(station, stationToken, seed);
    // The checked kernels go out with the results.
    await station.ctx.db.update(outbox).set({ nextAttemptAt: new Date(0) });
    await sweep(station.ctx);
    const counts = await hq<{
      counts: Record<string, { network: number }>;
    }>("GET", "/api/local-model?crop=wheat");
    expect(counts.body.counts.sound!.network).toBeGreaterThan(100);
    expect(counts.body.counts.broken!.network).toBeGreaterThan(50);
    // Sent twice (a retry), kept once.
    await station.ctx.db.update(outbox).set({
      deliveredAt: null,
      nextAttemptAt: new Date(0),
    });
    await sweep(station.ctx);
    const again = await hq<{ counts: Record<string, { network: number }> }>(
      "GET",
      "/api/local-model?crop=wheat",
    );
    expect(again.body.counts).toEqual(counts.body.counts);

    // The central server trains on them.
    expect(
      (await hq("POST", "/api/local-model/train", { crop: "wheat" })).status,
    ).toBe(202);
    await central.jobs.idle();
    const trained = await hq<{
      lastError: unknown;
      versions: {
        metrics: {
          defectRecall: number;
          stations: number;
          fromStations: number;
        };
        shortfalls: string[];
      }[];
    }>("GET", "/api/local-model?crop=wheat");
    expect(trained.body.lastError).toBeNull();
    const v1 = trained.body.versions[0]!;
    expect(v1.metrics.stations).toBe(1);
    expect(v1.metrics.fromStations).toBeGreaterThan(100);
    expect(v1.shortfalls).toEqual([]);

    // Station keys only: a read key can't download models.
    const reader = await hq<{ key: string }>("POST", "/api/integration/keys", {
      name: "reader",
    });
    const refused = await central.app.inject({
      method: "GET",
      url: "/api/v1/local-models",
      headers: bearer(reader.body.key),
    });
    expect(refused.statusCode).toBe(403);

    // The station downloads it.
    const pulled = await raipur<{ pulled: number }>(
      "POST",
      "/api/local-model/network/check",
    );
    expect(pulled.body.pulled).toBe(1);
    const status = await raipur<{
      network: { version: number } | null;
      inUse: string | null;
    }>("GET", "/api/local-model?crop=wheat");
    expect(status.body.network?.version).toBe(1);
    expect(status.body.inUse).toBe("network");
    // Nothing newer: nothing downloaded again.
    expect(
      (
        await raipur<{ pulled: number }>(
          "POST",
          "/api/local-model/network/check",
        )
      ).body.pulled,
    ).toBe(0);

    // No internet at the station: the network's model classifies.
    station.classifier.classify = () =>
      Promise.reject(new ClassifierUnavailableError("offline"));
    const { batchId } = await assay(station, stationToken, 51, false);
    const batch = await raipur<{
      status: string;
      kernels: { number: number; aiClass: string }[];
    }>("GET", `/api/batches/${batchId}`);
    expect(batch.body.status).toBe("classified");
    const right = batch.body.kernels.filter(
      (k) => k.aiClass === kindOf(k.number),
    ).length;
    expect(right / batch.body.kernels.length).toBeGreaterThan(0.9);
    truthful(station);
  }, 240000);
});

const MODEL = fileURLToPath(
  new URL("../models/mobilenetv2-12.onnx", import.meta.url),
);

// Runs where the image model is installed (npm run fetch-model; CI does).
describe.skipIf(!existsSync(MODEL))("the MobileNet image model", () => {
  let t: TestApp;
  let token: string;

  beforeAll(async () => {
    t = await createTestApp();
    t.ctx.embedder = await MobileNetEmbedder.load(MODEL);
    ({ token } = await register(t, "mn@mandi.test", "Mandi", {
      autopilot: true,
    }));
    await client(t, token)("PATCH", "/api/org", {
      autopilot: { spotCheckPct: 0, expertReview: false },
    });
    truthful(t);
  }, 60000);
  afterAll(() => t.close());

  it("loads in the built server, as in production", () => {
    // The tests run from the TypeScript sources; Node loads the build differently.
    const built = fileURLToPath(
      new URL("../dist/src/imaging/embedder.js", import.meta.url),
    );
    if (!existsSync(built)) return; // Built by `tsc -b` in npm run check.
    const run = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const { MobileNetEmbedder } = await import(${JSON.stringify(pathToFileURL(built).href)});
         const e = await MobileNetEmbedder.load(${JSON.stringify(MODEL)});
         if (!e) process.exit(2);`,
      ],
      { encoding: "utf8" },
    );
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });

  it("describes a crop the same way turned round, and differently from another kernel", async () => {
    const sharp = (await import("sharp")).default;
    const tile = (fill: string) =>
      sharp({
        create: { width: 160, height: 160, channels: 3, background: "#1b1b1d" },
      })
        .composite([
          {
            input: Buffer.from(
              `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><ellipse cx="80" cy="80" rx="60" ry="24" fill="${fill}"/></svg>`,
            ),
          },
        ])
        .jpeg()
        .toBuffer();
    const golden = await tile("#d8b46a");
    const dark = await tile("#5c3a1e");
    const [a, b, c] = await t.ctx.embedder!.embed([
      golden,
      await augment(golden, 2),
      dark,
    ]);
    expect(a).toHaveLength(1280);
    const dist = (x: number[], y: number[]) =>
      Math.sqrt(x.reduce((s, v, i) => s + (v - y[i]!) ** 2, 0));
    expect(dist(a!, b!)).toBeLessThan(dist(a!, c!));
  });

  it("trains on the image model with altered copies, and classifies offline", async () => {
    const api = client(t, token);
    for (const seed of [61, 62, 63]) await assay(t, token, seed);
    expect(
      (await api("POST", "/api/local-model/train", { crop: "wheat" })).status,
    ).toBe(202);
    await t.jobs.idle();
    const status = await api<{
      lastError: unknown;
      versions: {
        input: string;
        metrics: { accuracy: number; trainedOn: number; realKernels: number };
      }[];
    }>("GET", "/api/local-model?crop=wheat");
    expect(status.body.lastError).toBeNull();
    const v1 = status.body.versions[0]!;
    expect(v1.input).toBe("mobilenet-v2");
    // Rare classes were filled up with altered copies.
    expect(v1.metrics.trainedOn).toBeGreaterThan(v1.metrics.realKernels);
    expect(v1.metrics.accuracy).toBeGreaterThan(0.9);

    t.classifier.classify = () =>
      Promise.reject(new ClassifierUnavailableError("offline"));
    const { batchId } = await assay(t, token, 71, false);
    const batch = await api<{
      kernels: { number: number; aiClass: string; aiReason: string }[];
    }>("GET", `/api/batches/${batchId}`);
    const right = batch.body.kernels.filter(
      (k) => k.aiClass === kindOf(k.number),
    ).length;
    expect(right / batch.body.kernels.length).toBeGreaterThan(0.9);
    truthful(t);
  }, 300000);
});

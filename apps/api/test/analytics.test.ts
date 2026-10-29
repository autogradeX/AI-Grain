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

interface Analytics {
  totals: {
    samples: number;
    completed: number;
    meanPurityPct: number;
    kernelsReviewed: number;
    claudeConfirmedRate: number;
    estimatedClaudeCostUsd: number;
  };
  perDay: { date: string; created: number; completed: number }[];
  groupTrend: { week: string; byGroup: Record<string, number> }[];
  grades: { grade: string; count: number }[];
  sources: { source: string; samples: number }[];
  operators: {
    name: string;
    kernelsReviewed: number;
    corrected: number;
    correctionRate: number;
  }[];
  claudeByClass: {
    cls: string;
    reviewed: number;
    confirmedRate: number;
    mostOftenCorrectedTo: { cls: string } | null;
  }[];
  estimateVsWeighed: { samples: number; meanAbsDiffTotalPct: number };
  claude: { model: string; requests: number; estimatedCostUsd: number }[];
}

describe("analytics", () => {
  beforeAll(async () => {
    const std = await api<{ id: string }>("POST", "/api/standards", {
      name: "S",
      crop: "wheat",
      grades: [
        { grade: "1", maxDefectPct: { broken: 2 } },
        { grade: "2", maxDefectPct: { broken: 50 } },
      ],
    });
    // One photographed, classified, reviewed and weighed sample.
    const s1 = await api<{ id: string }>("POST", "/api/samples", {
      crop: "wheat",
      standardId: std.body.id,
      sampleMassG: 25,
      source: "Farm A",
    });
    const photo = await syntheticBoard(20);
    const form = multipart(
      {
        corners: JSON.stringify(photo.corners),
        imageWidth: String(photo.width),
        imageHeight: String(photo.height),
      },
      { name: "photo", data: photo.jpeg },
    );
    const up = await t.app.inject({
      method: "POST",
      url: `/api/samples/${s1.body.id}/batches`,
      headers: { ...bearer(token), ...form.headers },
      payload: form.payload,
    });
    await t.jobs.idle();
    await api("POST", `/api/batches/${up.json<{ id: string }>().id}/classify`);
    await t.jobs.idle();
    const pending = await api<
      { id: string; number: number; aiClass: string }[]
    >("GET", `/api/samples/${s1.body.id}/review`);
    // Correct one of Claude's broken verdicts to shrivelled; confirm the rest.
    await api("POST", "/api/kernels/review", {
      decisions: pending.body.map((k, i) => ({
        kernelId: k.id,
        finalClass:
          i === 0 && k.aiClass === "broken" ? "shrivelled" : k.aiClass,
      })),
    });
    await api("PUT", `/api/samples/${s1.body.id}/weights`, {
      cupMassG: { broken: 4, shrivelled: 1 },
    });
    await api("POST", `/api/samples/${s1.body.id}/complete`);

    // A second, weighed-only sample from another source, and one left in progress.
    const s2 = await api<{ id: string }>("POST", "/api/samples", {
      crop: "wheat",
      standardId: std.body.id,
      sampleMassG: 20,
      source: "Farm B",
    });
    await api("PUT", `/api/samples/${s2.body.id}/weights`, {
      cupMassG: { broken: 0.2 },
    });
    await api("POST", `/api/samples/${s2.body.id}/complete`);
    await api("POST", "/api/samples", { crop: "barley" });
  });

  it("summarises the period", async () => {
    const res = await api<Analytics>("GET", "/api/analytics?days=30");
    expect(res.status).toBe(200);
    const a = res.body;
    expect(a.totals).toMatchObject({ samples: 3, completed: 2 });
    // (80 + 99) / 2
    expect(a.totals.meanPurityPct).toBeCloseTo(89.5);
    expect(a.perDay).toHaveLength(31);
    expect(a.perDay.at(-1)).toMatchObject({ created: 3, completed: 2 });
    expect(a.groupTrend[0]?.byGroup.broken_defective).toBeCloseTo(10.5);
    expect(a.grades).toEqual([
      { grade: "1", count: 1 },
      { grade: "2", count: 1 },
    ]);
    expect(a.sources.map((s) => s.source).sort()).toEqual(["Farm A", "Farm B"]);
  });

  it("measures how often operators change Claude's verdicts", async () => {
    const a = (await api<Analytics>("GET", "/api/analytics?days=30")).body;
    // 20 kernels: 4 broken (5,10,15,20) flagged, plus none low-confidence below 21 except 7 and 14.
    expect(a.operators[0]).toMatchObject({ name: "Ada Admin", corrected: 1 });
    expect(a.totals.kernelsReviewed).toBe(a.operators[0]!.kernelsReviewed);
    const broken = a.claudeByClass.find((c) => c.cls === "broken")!;
    expect(broken.mostOftenCorrectedTo?.cls).toBe("shrivelled");
    expect(broken.confirmedRate).toBeCloseTo(3 / 4);
  });

  it("compares the photo estimate with the scale and prices Claude's usage", async () => {
    const a = (await api<Analytics>("GET", "/api/analytics?days=30")).body;
    expect(a.estimateVsWeighed.samples).toBe(1);
    expect(a.estimateVsWeighed.meanAbsDiffTotalPct).toBeGreaterThanOrEqual(0);
    expect(a.claude).toHaveLength(1);
    expect(a.claude[0]).toMatchObject({
      model: "claude-sonnet-5-5",
      requests: 1,
    });
    // FakeClassifier reports 1000 input + 200 output tokens: 1000 × $2/M + 200 × $10/M.
    expect(a.claude[0]!.estimatedCostUsd).toBeCloseTo(0.004);
  });

  it("filters by crop", async () => {
    const a = (
      await api<Analytics>("GET", "/api/analytics?days=30&crop=barley")
    ).body;
    expect(a.totals).toMatchObject({ samples: 1, completed: 0 });
  });
});

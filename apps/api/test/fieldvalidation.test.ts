import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bearer,
  createTestApp,
  kindsBoard,
  multipart,
  register,
  type TestApp,
} from "./helpers.js";

describe("field validation against a reference lab", () => {
  let t: TestApp;
  let token: string;
  const api = <T = Record<string, unknown>>(
    method: "GET" | "POST" | "PATCH",
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

  async function completed(extra: object) {
    const sample = await api<{ id: string; number: number }>(
      "POST",
      "/api/samples",
      { crop: "wheat", ...extra },
    );
    const form = multipart(
      { finish: "true" },
      {
        name: "photo",
        data: await kindsBoard(Array<string>(20).fill("sound"), 7),
      },
    );
    await t.app.inject({
      method: "POST",
      url: `/api/samples/${sample.body.id}/batches`,
      headers: { ...bearer(token), ...form.headers },
      payload: form.payload,
    });
    await t.jobs.idle();
    await api("POST", `/api/samples/${sample.body.id}/review/accept-ai`, {});
    await t.jobs.idle();
    return sample.body;
  }

  beforeAll(async () => {
    t = await createTestApp();
    ({ token } = await register(t, "lab@mandi.test", "Mandi", {
      autopilot: true,
    }));
    await api("PATCH", "/api/org", { autopilot: { spotCheckPct: 0 } });
  }, 60000);
  afterAll(() => t.close());

  it("imports the lab's results, compares them, and exports the report", async () => {
    const a = await completed({ moisturePct: 12.4 });
    const b = await completed({ enamLotId: "LOT-B", moisturePct: 13 });
    // The lab's broken %: 0.6 points from this sample's, then 2.5 points.
    const brokenOf = async (id: number) => {
      const list = await api<{ items: { id: string; number: number }[] }>(
        "GET",
        `/api/samples?search=${id}`,
      );
      const sample = await api<{
        result: { byClassPct: Record<string, number> };
      }>(
        "GET",
        `/api/samples/${list.body.items.find((i) => i.number === id)!.id}`,
      );
      return sample.body.result.byClassPct.broken ?? 0;
    };
    const fmt = (v: number) => v.toFixed(3);
    const csv = [
      "Sample,Lot,Lab,Report No,Broken,Shrivelled,Moisture %,Notes",
      `${a.number},,State Lab Raipur,SL/101,${fmt((await brokenOf(a.number)) + 0.6)},0,12.1,ok`,
      `,LOT-B,State Lab Raipur,SL/102,${fmt((await brokenOf(b.number)) + 2.5)},,14.0,`,
      `777,,State Lab Raipur,SL/103,1,,,`,
    ].join("\n");
    const preview = await api<{
      applied: number;
      rows: { sampleNumber: number; classes: number; error: string | null }[];
      ignoredColumns: string[];
    }>("POST", "/api/validation/import", { csv });
    expect(preview.body.applied).toBe(0);
    expect(preview.body.rows.map((r) => r.error)).toEqual([
      null,
      null,
      "No such sample",
    ]);
    expect(preview.body.rows[0]!.classes).toBe(2);
    expect(preview.body.ignoredColumns).toEqual(["Notes"]);

    const done = await api<{ applied: number }>(
      "POST",
      "/api/validation/import",
      { csv, apply: true },
    );
    expect(done.body.applied).toBe(2);

    const report = await api<{
      summary: {
        samples: number;
        byClass: { cls: string; n: number; withinTolerance: number }[];
        measurements: {
          field: string;
          n: number;
          meanAbsDiff: number;
          withinTolerance: number;
        }[];
      };
      samples: { lab: string; reportNo: string; enamLotId: string | null }[];
    }>("GET", "/api/validation?tolMoisture=0.5");
    expect(report.body.summary.samples).toBe(2);
    const broken = report.body.summary.byClass.find((c) => c.cls === "broken")!;
    // 0.6 points apart is within the 1-point tolerance; 2.5 isn't.
    expect(broken).toMatchObject({ n: 2, withinTolerance: 0.5 });
    const moisture = report.body.summary.measurements.find(
      (m) => m.field === "moisture",
    )!;
    expect(moisture.n).toBe(2);
    expect(moisture.meanAbsDiff).toBeCloseTo(0.65);
    expect(moisture.withinTolerance).toBe(0.5);
    expect(report.body.samples.map((s) => s.reportNo).sort()).toEqual([
      "SL/101",
      "SL/102",
    ]);

    const csvReport = await t.app.inject({
      method: "GET",
      url: "/api/validation/report.csv",
      headers: bearer(token),
    });
    expect(csvReport.statusCode).toBe(200);
    expect(csvReport.headers["content-type"]).toContain("text/csv");
    expect(csvReport.body).toContain("Within tolerance");
    expect(csvReport.body).toContain("LOT-B");
    expect(csvReport.body).toContain("SL/102");
  }, 180000);
});

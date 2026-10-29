import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bearer, createTestApp, register, type TestApp } from "./helpers.js";

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

interface Crop {
  key: string;
  label: string;
  classes: { id: string; label: string; group: string }[];
}

describe("crops and their classes", () => {
  it("starts every organisation with the five preset crops", async () => {
    const res = await api<Crop[]>("GET", "/api/crops");
    expect(res.body.map((c) => c.key).sort()).toEqual([
      "barley",
      "hemp",
      "oats",
      "rapeseed",
      "wheat",
    ]);
    const rapeseed = res.body.find((c) => c.key === "rapeseed")!;
    expect(rapeseed.classes.map((c) => c.id)).toContain("green");
  });

  it("creates a crop from the general list the first time a sample uses it", async () => {
    const sample = await api<{ crop: string }>("POST", "/api/samples", {
      crop: "Durum Wheat",
    });
    expect(sample.body.crop).toBe("durum_wheat");
    const crop = await api<Crop>("GET", "/api/crops/durum_wheat");
    expect(crop.body.label).toBe("Durum wheat");
    expect(crop.body.classes.length).toBeGreaterThan(10);
  });

  it("lets an admin add, rename and regroup classes", async () => {
    const wheat = (await api<Crop>("GET", "/api/crops/wheat")).body;
    const classes = [
      ...wheat.classes,
      {
        id: "garlic_bulbils",
        label: "Garlic bulbils",
        group: "impurity",
        description: "Small wild garlic bulbs.",
      },
    ];
    const res = await api<Crop>("PUT", "/api/crops/wheat", {
      label: "Wheat",
      classes,
    });
    expect(res.status).toBe(200);
    expect(res.body.classes.at(-1)?.id).toBe("garlic_bulbils");

    const bad = await api("PUT", "/api/crops/wheat", {
      label: "Wheat",
      classes: [...classes, { id: "sound", label: "Sound", group: "impurity" }],
    });
    expect(bad.status).toBe(400);
  });

  it("rejects standards that limit classes the crop doesn't have", async () => {
    const res = await api<{ error: string }>("POST", "/api/standards", {
      name: "Rapeseed test",
      crop: "rapeseed",
      grades: [{ grade: "A", maxDefectPct: { black_point: 1 } }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/black_point/);

    const ok = await api("POST", "/api/standards", {
      name: "Rapeseed test",
      crop: "rapeseed",
      grades: [
        {
          grade: "A",
          maxDefectPct: { green: 2 },
          maxGroupPct: { impurity: 2 },
        },
      ],
    });
    expect(ok.status).toBe(201);
  });

  it("won't remove a class a standard still limits", async () => {
    const rapeseed = (await api<Crop>("GET", "/api/crops/rapeseed")).body;
    const res = await api<{ error: string }>("PUT", "/api/crops/rapeseed", {
      label: rapeseed.label,
      classes: rapeseed.classes.filter((c) => c.id !== "green"),
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/green/);
  });

  it("checks cup weights against the sample's crop", async () => {
    const sample = await api<{ id: string }>("POST", "/api/samples", {
      crop: "rapeseed",
      sampleMassG: 10,
    });
    const wrong = await api<{ error: string }>(
      "PUT",
      `/api/samples/${sample.body.id}/weights`,
      {
        cupMassG: { black_point: 0.1 },
      },
    );
    expect(wrong.status).toBe(400);
    const right = await api<{
      result: { byGroupPct: Record<string, number>; purityPct: number };
    }>("PUT", `/api/samples/${sample.body.id}/weights`, {
      cupMassG: { green: 0.1, weed_seeds: 0.05 },
    });
    expect(right.status).toBe(200);
    expect(right.body.result.byGroupPct.broken_defective).toBeCloseTo(1);
    expect(right.body.result.byGroupPct.impurity).toBeCloseTo(0.5);
    expect(right.body.result.purityPct).toBeCloseTo(98.5);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bearer,
  createTestApp,
  kindsBoard,
  multipart,
  register,
  type TestApp,
} from "./helpers.js";

describe("prices on standards", () => {
  let t: TestApp;
  let token: string;
  const api = <T = Record<string, unknown>>(
    method: "GET" | "POST" | "PATCH" | "PUT",
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

  beforeAll(async () => {
    t = await createTestApp();
    ({ token } = await register(t, "buyer@fpo.test", "Kisan FPO", {
      autopilot: true,
    }));
    await api("PATCH", "/api/org", { autopilot: { spotCheckPct: 0 } });
  }, 60000);
  afterAll(() => t.close());

  const pricing = {
    currency: "INR",
    unit: "quintal",
    basePrice: 2275,
    gradePrices: { FAQ: 2425 },
    deductions: [
      { scope: "moisture", allowance: 12, rate: 1, mode: "percent" },
      { scope: "totalDefects", allowance: 0, rate: 5, mode: "amount" },
    ],
  };

  it("checks the price rules against the crop", async () => {
    const bad = await api("POST", "/api/standards", {
      name: "Buyer A",
      crop: "wheat",
      grades: [{ grade: "FAQ", maxDefectPct: {} }],
      allowEstimate: true,
      pricing: {
        ...pricing,
        deductions: [
          {
            scope: "class",
            key: "no_such",
            allowance: 0,
            rate: 1,
            mode: "amount",
          },
        ],
      },
    });
    expect(bad.status).toBe(400);
  });

  it("quotes the price on the sample, the result and the slip, and keeps it when the standard is edited without prices", async () => {
    const std = await api<{ id: string; pricing: unknown }>(
      "POST",
      "/api/standards",
      {
        name: "Buyer A",
        crop: "wheat",
        grades: [{ grade: "FAQ", maxDefectPct: {} }],
        allowEstimate: true,
        pricing,
      },
    );
    expect(std.status).toBe(201);
    expect(std.body.pricing).toMatchObject({ basePrice: 2275 });
    // An older client sending the standard without prices leaves them.
    await api("PUT", `/api/standards/${std.body.id}`, {
      name: "Buyer A",
      crop: "wheat",
      grades: [{ grade: "FAQ", maxDefectPct: {} }],
      allowEstimate: true,
    });

    const sample = await api<{ id: string }>("POST", "/api/samples", {
      crop: "wheat",
      standardId: std.body.id,
      moisturePct: 13,
    });
    const form = multipart(
      { finish: "true" },
      {
        name: "photo",
        data: await kindsBoard(Array<string>(20).fill("sound"), 3),
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

    const detail = await api<{
      status: string;
      price: {
        start: number;
        price: number;
        lines: { scope: string; amount: number }[];
      };
    }>("GET", `/api/samples/${sample.body.id}`);
    expect(detail.body.status).toBe("completed");
    const q = detail.body.price;
    expect(q.start).toBe(2425);
    // 1 point of moisture above 12 % = 1 % of 2425.
    expect(q.lines.find((l) => l.scope === "moisture")?.amount).toBe(24.25);
    const off = q.lines.reduce((a, l) => a + l.amount, 0);
    expect(q.price).toBeCloseTo(2425 - off, 2);

    const result = await api<{ price: { price: number; gradePrice: number } }>(
      "GET",
      `/api/samples/${sample.body.id}/result.json`,
    );
    expect(result.body.price).toMatchObject({
      gradePrice: 2425,
      price: q.price,
    });
    const slip = await t.app.inject({
      method: "GET",
      url: `/api/samples/${sample.body.id}/report.pdf?format=slip`,
      headers: bearer(token),
    });
    expect(slip.statusCode).toBe(200);
    expect(slip.headers["content-type"]).toContain("pdf");
  });
});

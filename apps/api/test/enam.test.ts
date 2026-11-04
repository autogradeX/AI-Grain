import { gradeSample } from "@ai-grain/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bearer,
  createTestApp,
  kindsBoard,
  multipart,
  register,
  type TestApp,
} from "./helpers.js";

describe("protein and oil limits", () => {
  const percentages = {
    byClass: {},
    byGroup: {
      admixture: 0,
      broken_defective: 0,
      impurity: 0,
      harmful: 0,
    },
    totalDefectsPct: 0,
    purityPct: 100,
  };
  const grades = [
    { grade: "A", maxDefectPct: {}, minProteinPct: 12, minOilPct: 40 },
    { grade: "B", maxDefectPct: {} },
  ];
  it("needs a measured value that reaches the minimum", () => {
    expect(gradeSample({ percentages }, grades).grade).toBe("B");
    expect(
      gradeSample({ percentages, proteinPct: 12.5, oilPct: 41 }, grades).grade,
    ).toBe("A");
    const low = gradeSample(
      { percentages, proteinPct: 11, oilPct: 41 },
      grades,
    );
    expect(low.failures.A).toEqual([
      {
        scope: "protein",
        limit: "protein",
        value: 11,
        allowed: 12,
        kind: "min",
      },
    ]);
  });
});

describe("e-NAM lots, farmers and NIR values", () => {
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

  beforeAll(async () => {
    t = await createTestApp();
    ({ token } = await register(t, "enam@mandi.test", "Mandi", {
      autopilot: true,
    }));
    await api("PATCH", "/api/org", { autopilot: { spotCheckPct: 0 } });
  }, 60000);
  afterAll(() => t.close());

  const lot = {
    enamLotId: "CG-RAI-2026-004512",
    gateEntryNo: "GE/1187",
    farmerName: "Ramesh Sahu",
    farmerId: "F-77821",
    farmerMobile: "+91 98765 43210",
  };

  it("keeps the lot and farmer on the sample, and finds the sample by them", async () => {
    const bad = await api("POST", "/api/samples", {
      crop: "wheat",
      farmerMobile: "call me",
    });
    expect(bad.status).toBe(400);
    const created = await api<{ id: string } & typeof lot>(
      "POST",
      "/api/samples",
      { crop: "wheat", ...lot },
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject(lot);
    for (const term of ["004512", "GE/1187", "Ramesh"]) {
      const found = await api<{ items: { enamLotId: string }[] }>(
        "GET",
        `/api/samples?search=${encodeURIComponent(term)}`,
      );
      expect(found.body.items.map((i) => i.enamLotId)).toEqual([lot.enamLotId]);
    }
  });

  it("imports NIR values by sample number or lot: a preview first, then only open samples", async () => {
    const open = await api<{ id: string; number: number }>(
      "POST",
      "/api/samples",
      { crop: "mustard", enamLotId: "LOT-OIL-1" },
    );
    const csv = [
      "Sample No;Lot;Protein %;Oil content",
      `${open.body.number};;21,5;41,2`,
      ";LOT-OIL-1;;40,8",
      "999;;12;",
      ";;12;",
    ].join("\n");
    const preview = await api<{
      applied: number;
      rows: { line: number; sampleId: string | null; error: string | null }[];
    }>("POST", "/api/samples/measurements/import", { csv });
    expect(preview.body.applied).toBe(0);
    expect(preview.body.rows.map((r) => r.error)).toEqual([
      null,
      null,
      "No such sample",
      "No sample number or lot ID",
    ]);
    const untouched = await api<{ oilPct: number | null }>(
      "GET",
      `/api/samples/${open.body.id}`,
    );
    expect(untouched.body.oilPct).toBeNull();

    const done = await api<{ applied: number }>(
      "POST",
      "/api/samples/measurements/import",
      { csv, apply: true },
    );
    expect(done.body.applied).toBe(2);
    const after = await api<{ proteinPct: number; oilPct: number }>(
      "GET",
      `/api/samples/${open.body.id}`,
    );
    // The later row (by lot) wins for oil.
    expect(after.body).toMatchObject({ proteinPct: 21.5, oilPct: 40.8 });
  });

  it("puts the lot on the certificate without the mobile, and all of it in the result for connected systems", async () => {
    const sample = await api<{ id: string }>("POST", "/api/samples", {
      crop: "wheat",
      ...lot,
      proteinPct: 12.4,
    });
    const id = sample.body.id;
    const form = multipart(
      { finish: "true" },
      {
        name: "photo",
        data: await kindsBoard(Array<string>(30).fill("sound"), 9),
      },
    );
    await t.app.inject({
      method: "POST",
      url: `/api/samples/${id}/batches`,
      headers: { ...bearer(token), ...form.headers },
      payload: form.payload,
    });
    await t.jobs.idle();
    await api("POST", `/api/samples/${id}/review/accept-ai`, {});
    await t.jobs.idle();
    const result = await api<{
      enam: { lotId: string; farmer: { mobile: string } };
      parameters: { code: string; value: number | null }[];
      certificate: { code: string };
    }>("GET", `/api/samples/${id}/result.json`);
    expect(result.body.enam).toEqual({
      lotId: lot.enamLotId,
      gateEntryNo: lot.gateEntryNo,
      farmer: {
        name: lot.farmerName,
        id: lot.farmerId,
        mobile: lot.farmerMobile,
      },
    });
    expect(
      result.body.parameters.find((p) => p.code === "protein")!.value,
    ).toBe(12.4);

    // The public verification page.
    const verify = await t.app.inject({
      method: "GET",
      url: `/api/public/verify/${result.body.certificate.code}`,
    });
    expect(verify.statusCode).toBe(200);
    const text = verify.body;
    expect(text).not.toContain("98765");
    expect(text).not.toContain("F-77821");
    const payload = verify.json<{
      payload: {
        lot: unknown;
        measurements: { proteinPct: number };
      };
      intact: boolean;
    }>();
    expect(payload.intact).toBe(true);
    expect(payload.payload.lot).toEqual({
      enamLotId: lot.enamLotId,
      gateEntryNo: lot.gateEntryNo,
      farmerName: lot.farmerName,
      farmerIdLast4: "7821",
    });
    expect(payload.payload.measurements.proteinPct).toBe(12.4);

    // The printed report.
    const pdf = await t.app.inject({
      method: "GET",
      url: `/api/samples/${id}/report.pdf`,
      headers: bearer(token),
    });
    expect(pdf.statusCode).toBe(200);
  }, 120000);
});

describe("the e-NAM connection", () => {
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
  const sent: { url: string; headers: Record<string, string>; body: string }[] =
    [];

  beforeAll(async () => {
    t = await createTestApp();
    ({ token } = await register(t, "enam2@mandi.test", "Mandi", {
      autopilot: true,
    }));
    await api("PATCH", "/api/org", { autopilot: { spotCheckPct: 0 } });
    t.webhooks.handler = (url, init) => {
      sent.push({
        url,
        headers: init.headers as Record<string, string>,
        body: init.body as string,
      });
      return Promise.resolve(new Response("{}", { status: 200 }));
    };
  }, 60000);
  afterAll(() => t.close());

  async function completed(extra: object) {
    const sample = await api<{ id: string }>("POST", "/api/samples", {
      crop: "wheat",
      ...extra,
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
    return sample.body.id;
  }

  it("sends results of e-NAM lots, authenticated, and keeps the key secret", async () => {
    const missingKey = await api("PUT", "/api/integration/enam", {
      url: "https://enam.test/assaying",
    });
    expect(missingKey.status).toBe(400);
    const saved = await api("PUT", "/api/integration/enam", {
      url: "https://enam.test/assaying",
      headerName: "X-Api-Key",
      headerValue: "enam-secret-123",
    });
    expect(saved.status).toBe(200);
    const status = await api("GET", "/api/integration");
    expect(JSON.stringify(status.body)).not.toContain("enam-secret-123");
    expect(status.body).toMatchObject({
      enamUrl: "https://enam.test/assaying",
      enamHeaderName: "X-Api-Key",
      enamHeaderValueSet: true,
    });
    const test = await api<{ ok: boolean }>(
      "POST",
      "/api/integration/enam/test",
    );
    expect(test.body.ok).toBe(true);
    sent.length = 0;

    await completed({});
    expect(
      sent.filter((s) => s.url === "https://enam.test/assaying"),
    ).toHaveLength(0);

    await completed({
      enamLotId: "CG-RAI-9",
      farmerName: "Sita",
      farmerMobile: "9876543210",
    });
    const toEnam = sent.filter((s) => s.url === "https://enam.test/assaying");
    expect(toEnam).toHaveLength(1);
    expect(toEnam[0]!.headers["x-api-key"]).toBe("enam-secret-123");
    const body = JSON.parse(toEnam[0]!.body) as {
      event: string;
      data: {
        schema: string;
        lotId: string;
        farmer: Record<string, unknown>;
        parameters: { code: string }[];
        certificate: { code: string } | null;
      };
    };
    expect(body.event).toBe("sample.completed");
    expect(body.data).toMatchObject({
      schema: "ai-grain/enam-assaying@1",
      lotId: "CG-RAI-9",
      farmer: { name: "Sita", id: null },
    });
    // The bridge gets no mobile number: it isn't an assaying result.
    expect(JSON.stringify(body)).not.toContain("9876543210");
    expect(body.data.parameters.some((p) => p.code === "moisture")).toBe(true);
    expect(body.data.certificate?.code).toBeTruthy();
  }, 180000);
});

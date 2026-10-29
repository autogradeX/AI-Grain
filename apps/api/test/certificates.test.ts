import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canonicalJson,
  normalizeCode,
} from "../src/modules/certificates/service.js";
import { bearer, createTestApp, register, type TestApp } from "./helpers.js";

let t: TestApp;
let token: string;
let sampleId: string;

beforeAll(async () => {
  t = await createTestApp();
  ({ token } = await register(t));
  const std = await t.app.inject({
    method: "POST",
    url: "/api/standards",
    headers: bearer(token),
    payload: {
      name: "Test",
      crop: "wheat",
      grades: [{ grade: "1", maxDefectPct: { broken: 5 } }],
    },
  });
  const sample = await t.app.inject({
    method: "POST",
    url: "/api/samples",
    headers: bearer(token),
    payload: {
      crop: "wheat",
      standardId: std.json<{ id: string }>().id,
      sampleMassG: 20,
      source: "Silo 2",
    },
  });
  sampleId = sample.json<{ id: string }>().id;
  await t.app.inject({
    method: "PUT",
    url: `/api/samples/${sampleId}/weights`,
    headers: bearer(token),
    payload: { cupMassG: { broken: 0.4, ergot: 0.01 } },
  });
});
afterAll(async () => {
  await t.close();
});

interface Verify {
  code: string;
  status: string;
  intact: boolean;
  payload: {
    version: number;
    sample: { number: number; source: string };
    result: {
      grade: string;
      purityPct: number;
      byGroupPct: Record<string, number>;
    };
  };
  payloadHash: string;
  newerVersion: { code: string; version: number } | null;
}

const verify = (code: string) =>
  t.app.inject({ method: "GET", url: `/api/public/verify/${code}` });

describe("verified reports", () => {
  let firstCode: string;

  it("issues a certificate when a sample is completed", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: `/api/samples/${sampleId}/complete`,
      headers: bearer(token),
    });
    const body = res.json<{ certificate: { code: string; version: number } }>();
    expect(body.certificate.version).toBe(1);
    expect(body.certificate.code).toMatch(
      /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/,
    );
    firstCode = body.certificate.code;
  });

  it("lets anyone verify it without signing in, from a code typed in any form", async () => {
    const res = await verify(firstCode.toLowerCase().replace(/-/g, " "));
    expect(res.statusCode).toBe(200);
    const v = res.json<Verify>();
    expect(v).toMatchObject({
      status: "valid",
      intact: true,
      newerVersion: null,
    });
    expect(v.payload.sample).toMatchObject({ number: 1, source: "Silo 2" });
    expect(v.payload.result.grade).toBe("1");
    expect(v.payload.result.purityPct).toBeCloseTo(97.95);
    expect(v.payload.result.byGroupPct.harmful).toBeCloseTo(0.05);
    expect(v.payloadHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("detects a payload edited after issue", async () => {
    await t.ctx.db.execute(
      `update certificates set payload = jsonb_set(payload, '{result,grade}', '"EXTRA"') where code = '${firstCode}'`,
    );
    expect((await verify(firstCode)).json<Verify>().intact).toBe(false);
    await t.ctx.db.execute(
      `update certificates set payload = jsonb_set(payload, '{result,grade}', '"1"') where code = '${firstCode}'`,
    );
    expect((await verify(firstCode)).json<Verify>().intact).toBe(true);
  });

  it("withdraws the certificate on reopen and issues a new version on completion", async () => {
    await t.app.inject({
      method: "POST",
      url: `/api/samples/${sampleId}/reopen`,
      headers: bearer(token),
    });
    expect((await verify(firstCode)).json<Verify>().status).toBe("withdrawn");

    const done = await t.app.inject({
      method: "POST",
      url: `/api/samples/${sampleId}/complete`,
      headers: bearer(token),
    });
    const second = done.json<{
      certificate: { code: string; version: number };
    }>().certificate;
    expect(second.version).toBe(2);

    const old = (await verify(firstCode)).json<Verify>();
    expect(old.newerVersion).toEqual({ code: second.code, version: 2 });
    expect((await verify(second.code)).json<Verify>().status).toBe("valid");

    const list = await t.app.inject({
      method: "GET",
      url: `/api/samples/${sampleId}/certificates`,
      headers: bearer(token),
    });
    expect(list.json<{ status: string }[]>().map((c) => c.status)).toEqual([
      "withdrawn",
      "valid",
    ]);
  });

  it("answers 404 for unknown codes", async () => {
    expect((await verify("AAAA-BBBB-CCCC")).statusCode).toBe(404);
  });

  it("renders the PDF with the verification block", async () => {
    const pdf = await t.app.inject({
      method: "GET",
      url: `/api/samples/${sampleId}/report.pdf`,
      headers: bearer(token),
    });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("certificate helpers", () => {
  it("hashes the same data the same way whatever the key order", () => {
    expect(
      canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: null } }),
    ).toBe('{"a":{"c":null,"d":[2,{"x":2,"y":1}]},"b":1}');
  });

  it("normalizes typed codes", () => {
    expect(normalizeCode("abcd efgh jkmn")).toBe("ABCD-EFGH-JKMN");
  });
});

import { createHmac } from "node:crypto";
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
  ({ token } = await register(t, "int@farm.test", "Mandi", {
    autopilot: true,
  }));
  await t.app.inject({
    method: "PATCH",
    url: "/api/org",
    headers: bearer(token),
    payload: { autopilot: { spotCheckPct: 0, expertReview: false } },
  });
});
afterAll(async () => {
  await t.close();
});

const api = <T = Record<string, unknown>>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  url: string,
  payload?: object,
  headers: Record<string, string> = bearer(token),
) =>
  t.app
    .inject({ method, url, headers, ...(payload && { payload }) })
    .then((r) => ({ status: r.statusCode, body: r.json<T>() }));

/** A completed paddy sample: photographed, reviewed, finished by Autopilot. */
async function completedSample() {
  const created = await api<{ id: string; number: number }>(
    "POST",
    "/api/samples",
    { crop: "paddy", source: "Lot 42" },
  );
  const photo = await syntheticBoard(20);
  const form = multipart(
    { finish: "true" },
    { name: "photo", data: photo.jpeg },
  );
  await t.app.inject({
    method: "POST",
    url: `/api/samples/${created.body.id}/batches`,
    headers: { ...bearer(token), ...form.headers },
    payload: form.payload,
  });
  await t.jobs.idle();
  const pending = await api<{ id: string; aiClass: string }[]>(
    "GET",
    `/api/samples/${created.body.id}/review`,
  );
  if (pending.body.length)
    await api("POST", "/api/kernels/review", {
      decisions: pending.body.map((k) => ({
        kernelId: k.id,
        finalClass: k.aiClass === "unclear" ? "sound" : k.aiClass,
      })),
    });
  await t.jobs.idle();
  return created.body;
}

interface Result {
  schema: string;
  sampleNumber: number;
  lot: string;
  commodity: { key: string };
  status: string;
  grade: string | null;
  resultSource: string;
  purityPct: number;
  parameters: {
    code: string;
    kind: string;
    value: number | null;
    unit: string;
  }[];
  certificate: { code: string; verifyUrl: string } | null;
}

describe("integration with APMC, eNAM and ERP systems", () => {
  let key: string;

  it("issues API keys that read results, and revokes them", async () => {
    const created = await api<{ id: string; key: string; prefix: string }>(
      "POST",
      "/api/integration/keys",
      { name: "eNAM bridge" },
    );
    expect(created.status).toBe(201);
    expect(created.body.key).toMatch(/^agk_/);
    key = created.body.key;
    const list = await api<{ keys: { prefix: string }[] }>(
      "GET",
      "/api/integration",
    );
    expect(list.body.keys).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(key);

    const none = await api("GET", "/api/v1/results", undefined, {});
    expect(none.status).toBe(401);
    const empty = await api<{ items: unknown[] }>(
      "GET",
      "/api/v1/results",
      undefined,
      { authorization: `Bearer ${key}` },
    );
    expect(empty.status).toBe(200);
    expect(empty.body.items).toEqual([]);

    const other = await api<{ key: string; id: string }>(
      "POST",
      "/api/integration/keys",
      { name: "old ERP" },
    );
    await api("DELETE", `/api/integration/keys/${other.body.id}`);
    const revoked = await api("GET", "/api/v1/results", undefined, {
      "x-api-key": other.body.key,
    });
    expect(revoked.status).toBe(401);
  });

  it("pushes each completed result to the webhook, signed", async () => {
    const hook = await api<{ webhookSecret: string }>(
      "PUT",
      "/api/integration/webhook",
      { url: "https://erp.example/hooks/assay" },
    );
    expect(hook.body.webhookSecret).toMatch(/^whsec_/);
    // Not shown to everyone with the organisation.
    const org = await api<{ integration: object }>("GET", "/api/org");
    expect(JSON.stringify(org.body)).not.toContain(hook.body.webhookSecret);

    t.webhooks.sent.length = 0;
    const sample = await completedSample();
    const sent = t.webhooks.sent.filter((w) =>
      w.body.includes('"sample.completed"'),
    );
    expect(sent).toHaveLength(1);
    const { url, headers, body } = sent[0]!;
    expect(url).toBe("https://erp.example/hooks/assay");
    expect(headers["x-aigrain-signature"]).toBe(
      `sha256=${createHmac("sha256", hook.body.webhookSecret).update(body).digest("hex")}`,
    );
    const event = JSON.parse(body) as { data: Result };
    expect(event.data).toMatchObject({
      schema: "ai-grain/assaying-result@1",
      sampleNumber: sample.number,
      lot: "Lot 42",
      commodity: { key: "paddy" },
      status: "completed",
      resultSource: "estimate",
    });
    const codes = event.data.parameters.map((p) => p.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "lower_class",
        "damaged",
        "immature",
        "impurity",
        "moisture",
        "length",
        "lb_ratio",
      ]),
    );
    expect(
      event.data.parameters.find((p) => p.code === "length")!.value,
    ).toBeGreaterThan(6);
    expect(event.data.certificate?.verifyUrl).toMatch(
      /^http:\/\/app\.test\/verify\//,
    );

    // The same result, polled with the key and downloaded from the app.
    const polled = await api<{ items: Result[] }>(
      "GET",
      "/api/v1/results",
      undefined,
      { authorization: `Bearer ${key}` },
    );
    expect(polled.body.items.map((r) => r.sampleNumber)).toContain(
      sample.number,
    );
    const one = await api<Result>(
      "GET",
      `/api/v1/results/${sample.number}`,
      undefined,
      { authorization: `Bearer ${key}` },
    );
    expect(one.body.certificate?.code).toBe(event.data.certificate?.code);
    const download = await api<Result>(
      "GET",
      `/api/samples/${sample.id}/result.json`,
    );
    expect(download.body.purityPct).toBe(event.data.purityPct);
  });

  it("retries a failing webhook and records the failure", async () => {
    t.webhooks.sent.length = 0;
    t.webhooks.status = 500;
    try {
      const res = await api<{ delivered: boolean; status: number }>(
        "POST",
        "/api/integration/webhook/test",
      );
      expect(res.body).toMatchObject({ delivered: false, status: 500 });
      expect(t.webhooks.sent).toHaveLength(3);
    } finally {
      t.webhooks.status = 200;
    }
  }, 15000);

  it("lets only admins manage keys", async () => {
    const res = await api("POST", "/api/integration/keys", { name: "x" }, {});
    expect(res.status).toBe(401);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  farmerText,
  normaliseMobile,
} from "../src/modules/integration/farmer.js";
import {
  bearer,
  createTestApp,
  kindsBoard,
  multipart,
  register,
  type TestApp,
} from "./helpers.js";

describe("farmer messages", () => {
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
    ({ token } = await register(t, "sms@fpo.test", "Kisan FPO", {
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

  it("normalises Indian mobile numbers", () => {
    expect(normaliseMobile("98765 43210")).toBe("919876543210");
    expect(normaliseMobile("098765-43210")).toBe("919876543210");
    expect(normaliseMobile("+91 98765 43210")).toBe("919876543210");
  });

  it("sends the result only to farmers who agreed, in their language, keeping the key secret", async () => {
    const saved = await api("PUT", "/api/integration/farmer", {
      url: "https://sms.test/send",
      headerName: "X-Auth",
      headerValue: "gateway-secret-9",
      channel: "whatsapp",
      language: "hi",
    });
    expect(saved.status).toBe(200);
    const status = await api("GET", "/api/integration");
    expect(JSON.stringify(status.body)).not.toContain("gateway-secret-9");
    expect(status.body).toMatchObject({
      farmerUrl: "https://sms.test/send",
      farmerHeaderValueSet: true,
      farmerChannel: "whatsapp",
      farmerLanguage: "hi",
    });
    const test = await api<{ ok: boolean }>(
      "POST",
      "/api/integration/farmer/test",
      { mobile: "9876543210" },
    );
    expect(test.body.ok).toBe(true);
    sent.length = 0;

    // No consent: nothing goes to the farmer.
    await completed({ farmerName: "Sita", farmerMobile: "9876543210" });
    expect(sent.filter((s) => s.url === "https://sms.test/send")).toHaveLength(
      0,
    );

    await completed({
      enamLotId: "CG-RAI-77",
      farmerName: "Sita",
      farmerMobile: "98765 43210",
      farmerConsent: true,
    });
    const messages = sent.filter((s) => s.url === "https://sms.test/send");
    expect(messages).toHaveLength(1);
    expect(messages[0]!.headers["x-auth"]).toBe("gateway-secret-9");
    const body = JSON.parse(messages[0]!.body) as {
      data: { schema: string; to: string; channel: string; text: string };
    };
    expect(body.data).toMatchObject({
      schema: "ai-grain/farmer-message@1",
      to: "919876543210",
      channel: "whatsapp",
    });
    expect(body.data.text).toContain("CG-RAI-77");
    expect(body.data.text).toContain("अनाज जाँच परिणाम");
    expect(body.data.text).toContain("/verify/");
    // Never someone else's details, and not the farmer's own name or ID either.
    expect(body.data.text).not.toContain("Sita");
  });

  it("falls back to English for languages without words yet", () => {
    const text = farmerText(
      {
        organisation: "FPO",
        sampleNumber: 3,
        lot: null,
        enam: {
          lotId: null,
          gateEntryNo: null,
          farmer: { name: null, id: null, mobile: null },
        },
        commodity: { key: "wheat", name: "Wheat" },
        grade: "1",
        standard: "FAQ",
        parameters: [{ code: "moisture", value: 11.24 }],
        totalDefectsPct: 2.04,
        purityPct: 97.96,
        resultSource: "estimate",
        certificate: null,
      } as never,
      "xx",
    );
    expect(
      farmerText(
        {
          organisation: "FPO",
          sampleNumber: 3,
          lot: null,
          enam: {
            lotId: "L-1",
            gateEntryNo: null,
            farmer: { name: null, id: null, mobile: null },
          },
          commodity: { key: "wheat", name: "Wheat" },
          grade: null,
          standard: null,
          parameters: [],
          totalDefectsPct: 2,
          purityPct: 98,
          resultSource: "weighed",
          certificate: null,
        } as never,
        "mr",
      ),
    ).toBe(
      "FPO: धान्य चाचणी निकाल\nलॉट L-1, Wheat\nकोणताही ग्रेड नाही\nदोष 2%, शुद्धता 98%",
    );
    expect(text).toBe(
      "FPO: Grain test result\nLot #3, Wheat\nGrade: 1 (FAQ)\nMoisture 11.2%, Defects 2%, Purity 98% (from photo)",
    );
  });
});

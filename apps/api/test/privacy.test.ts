import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { outbox, samples } from "../src/db/schema.js";
import { sweep } from "../src/modules/station/sweeper.js";
import { bearer, createTestApp, register, type TestApp } from "./helpers.js";

describe("farmers' data", () => {
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
    ({ token } = await register(t, "dpo@fpo.test", "Kisan FPO"));
  }, 60000);
  afterAll(() => t.close());

  it("gives a farmer everything held about them, then erases it on request", async () => {
    const mine = {
      farmerName: "Sita Bai",
      farmerId: "F-1",
      farmerMobile: "98765 43210",
    };
    const a = await api<{ id: string }>("POST", "/api/samples", {
      crop: "wheat",
      ...mine,
      farmerConsent: true,
    });
    await api("POST", "/api/samples", {
      crop: "paddy",
      ...mine,
      farmerMobile: "+91 9876543210",
    });
    await api("POST", "/api/samples", {
      crop: "wheat",
      farmerName: "Other",
      farmerMobile: "9000000000",
    });
    // A message to her not yet sent goes too.
    await t.ctx.db.insert(outbox).values({
      orgId: (await t.ctx.db.select({ orgId: samples.orgId }).from(samples))[0]!
        .orgId,
      target: "farmer",
      event: "sample.completed",
      payload: { sampleId: a.body.id, to: "919876543210" },
    });

    expect((await api("GET", "/api/privacy/farmer")).status).toBe(400);
    const data = await api<{
      samples: {
        crop: string;
        farmerName: string;
        agreedToMessages: boolean;
      }[];
    }>("GET", "/api/privacy/farmer?mobile=9876543210");
    expect(data.body.samples.map((s) => s.crop).sort()).toEqual([
      "paddy",
      "wheat",
    ]);
    expect(data.body.samples.every((s) => s.farmerName === "Sita Bai")).toBe(
      true,
    );

    const erased = await api<{ samples: number }>(
      "POST",
      "/api/privacy/farmer/erase",
      { mobile: "+91 98765-43210" },
    );
    expect(erased.body.samples).toBe(2);
    const left = await t.ctx.db
      .select({ name: samples.farmerName, consent: samples.farmerConsent })
      .from(samples);
    expect(left.map((r) => r.name).sort()).toEqual(["Other", null, null]);
    expect(left.every((r) => !r.consent)).toBe(true);
    expect(await t.ctx.db.select().from(outbox)).toHaveLength(0);
    const again = await api<{ samples: unknown[] }>(
      "GET",
      "/api/privacy/farmer?farmerId=f-1",
    );
    expect(again.body.samples).toHaveLength(0);
  });

  it("clears farmers' details after the organisation's retention period, keeping results", async () => {
    const s = await api<{ id: string }>("POST", "/api/samples", {
      crop: "wheat",
      farmerName: "Ram",
      farmerMobile: "9111111111",
    });
    const { eq } = await import("drizzle-orm");
    await t.ctx.db
      .update(samples)
      .set({
        status: "completed",
        completedAt: new Date(Date.now() - 40 * 86_400_000),
      })
      .where(eq(samples.id, s.body.id));
    expect((await sweep(t.ctx)).farmerDataCleared).toBe(0);
    const saved = await api("PATCH", "/api/org", {
      privacy: { farmerRetentionDays: 30 },
    });
    expect(saved.status).toBe(200);
    expect((await sweep(t.ctx)).farmerDataCleared).toBe(1);
    const [row] = await t.ctx.db
      .select({
        name: samples.farmerName,
        mobile: samples.farmerMobile,
        status: samples.status,
      })
      .from(samples)
      .where(eq(samples.id, s.body.id));
    expect(row).toEqual({ name: null, mobile: null, status: "completed" });
  });
});

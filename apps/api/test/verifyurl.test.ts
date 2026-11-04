import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appUrlIsLocal } from "../src/config.js";
import {
  bearer,
  createTestApp,
  kindsBoard,
  multipart,
  register,
  type TestApp,
} from "./helpers.js";

describe("the address in QR codes", () => {
  it("is flagged in production when it is this computer only", () => {
    const prod = (url: string) =>
      appUrlIsLocal({ APP_URL: url, NODE_ENV: "production" });
    expect(prod("http://localhost:5173")).toBe(true);
    expect(prod("http://127.0.0.1:3000")).toBe(true);
    expect(prod("https://grain.example.in")).toBe(false);
    // A station's address on the mandi's network is reachable there.
    expect(prod("http://192.168.1.20:3000")).toBe(false);
    // In development localhost is right.
    expect(
      appUrlIsLocal({
        APP_URL: "http://localhost:5173",
        NODE_ENV: "development",
      }),
    ).toBe(false);
  });

  describe("on a server", () => {
    let t: TestApp;
    let token: string;
    const get = (url: string) =>
      t.app.inject({ method: "GET", url, headers: bearer(token) });

    beforeAll(async () => {
      t = await createTestApp();
      ({ token } = await register(t, "qr@mandi.test", "Mandi", {
        autopilot: true,
      }));
    }, 60000);
    afterAll(() => t.close());

    it("tells admins while it points to the server's own computer", async () => {
      const me = () =>
        get("/api/auth/me").then((r) =>
          r.json<{ verifyUrlProblem: string | null }>(),
        );
      const config = t.ctx.config as { NODE_ENV: string; APP_URL: string };
      const before = { ...config };
      try {
        config.NODE_ENV = "production";
        config.APP_URL = "http://localhost:5173";
        expect((await me()).verifyUrlProblem).toBe("http://localhost:5173");
        config.APP_URL = "https://grain.example.in";
        expect((await me()).verifyUrlProblem).toBeNull();
      } finally {
        Object.assign(config, before);
      }
    });

    it("rebuilds a stored report when the site's address changes", async () => {
      await t.app.inject({
        method: "PATCH",
        url: "/api/org",
        headers: bearer(token),
        payload: { autopilot: { spotCheckPct: 0 } },
      });
      const sample = await t.app.inject({
        method: "POST",
        url: "/api/samples",
        headers: bearer(token),
        payload: { crop: "wheat" },
      });
      const id = sample.json<{ id: string }>().id;
      const form = multipart(
        { finish: "true" },
        {
          name: "photo",
          data: await kindsBoard(Array<string>(30).fill("sound"), 5),
        },
      );
      await t.app.inject({
        method: "POST",
        url: `/api/samples/${id}/batches`,
        headers: { ...bearer(token), ...form.headers },
        payload: form.payload,
      });
      await t.jobs.idle();
      await t.app.inject({
        method: "POST",
        url: `/api/samples/${id}/review/accept-ai`,
        headers: bearer(token),
        payload: {},
      });
      await t.jobs.idle();
      const status = await get(`/api/samples/${id}`);
      expect(status.json<{ status: string }>().status).toBe("completed");

      const config = t.ctx.config as { APP_URL: string };
      const before = config.APP_URL;
      try {
        config.APP_URL = "http://localhost:5173";
        const first = (await get(`/api/samples/${id}/report.pdf`)).rawPayload;
        // Stored: the same report again.
        expect(
          (await get(`/api/samples/${id}/report.pdf`)).rawPayload.equals(first),
        ).toBe(true);
        // The address is fixed: a new report, with the new QR code.
        config.APP_URL = "https://grain.example.in";
        const fixed = (await get(`/api/samples/${id}/report.pdf`)).rawPayload;
        expect(fixed.equals(first)).toBe(false);
      } finally {
        config.APP_URL = before;
      }
    }, 120000);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  api,
  ApiError,
  applySession,
  refreshSession,
  type Session,
} from "../src/api/client";

const session: Session = {
  accessToken: "new-token",
  expiresIn: 900,
  user: {
    id: "u1",
    email: "a@b.c",
    name: "A",
    role: "admin",
    emailVerified: true,
    org: { id: "o1", name: "O" },
  },
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  applySession(null);
});

describe("api client", () => {
  it("refreshes once on a 401 and retries with the new token", async () => {
    applySession({ ...session, accessToken: "old-token" });
    const calls: { url: string; auth: string | null }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        calls.push({
          url,
          auth: new Headers(init?.headers).get("authorization"),
        });
        if (url === "/api/auth/refresh")
          return Promise.resolve(json(200, session));
        const auth = new Headers(init?.headers).get("authorization");
        return Promise.resolve(
          auth === "Bearer new-token"
            ? json(200, { ok: true })
            : json(401, { code: "token_expired" }),
        );
      }),
    );
    await expect(api.get("/samples")).resolves.toEqual({ ok: true });
    expect(calls.map((c) => c.url)).toEqual([
      "/api/samples",
      "/api/auth/refresh",
      "/api/samples",
    ]);
  });

  it("shares one refresh between concurrent callers", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(json(200, session)));
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a refresh that raced another tab", async () => {
    const replies = [json(401, { code: "refresh_race" }), json(200, session)];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(replies.shift()!)),
    );
    await expect(refreshSession()).resolves.toMatchObject({
      accessToken: "new-token",
    });
  });

  it("turns validation errors into readable messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          json(400, {
            error: "Invalid request",
            code: "validation",
            issues: [{ path: "email", message: "Invalid email" }],
          }),
        ),
      ),
    );
    const err = await api.post("/auth/login", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe(
      "Invalid request: email: Invalid email",
    );
  });
});

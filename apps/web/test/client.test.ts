import { afterEach, describe, expect, it, vi } from "vitest";
import {
  api,
  ApiError,
  applySession,
  refreshSession,
  setSessionListener,
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
    emailEnabled: true,
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

  it("keeps the session when there is no network to refresh it", async () => {
    // Offline, the refresh fails without an answer from the server: the app
    // must not treat that as "signed out".
    const changes: (Session | null)[] = [];
    setSessionListener((s) => changes.push(s));
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await expect(refreshSession()).rejects.toThrow("Failed to fetch");
    expect(changes).toEqual([]);
  });

  it("signs out when the server rejects the refresh", async () => {
    const changes: (Session | null)[] = [];
    setSessionListener((s) => changes.push(s));
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(json(401, { code: "refresh_invalid" }))),
    );
    await expect(refreshSession()).resolves.toBeNull();
    expect(changes).toEqual([null]);
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

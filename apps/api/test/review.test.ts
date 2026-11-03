import { ARTIFICIAL_CLASS_ID } from "@ai-grain/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClassifyRequest } from "../src/ai/classifier.js";
import {
  bearer,
  createTestApp,
  kindsBoard,
  multipart,
  register,
  type TestApp,
} from "./helpers.js";

describe("reviewing a sample with many flagged kernels", () => {
  let t: TestApp;
  let token: string;
  let sampleId: string;
  const api = <T = Record<string, unknown>>(
    method: "GET" | "POST" | "PATCH",
    url: string,
    payload?: object,
    as = token,
  ) =>
    t.app
      .inject({
        method,
        url,
        headers: bearer(as),
        ...(payload && { payload }),
      })
      .then((r) => ({ status: r.statusCode, body: r.json<T>() }));

  beforeAll(async () => {
    t = await createTestApp();
    ({ token } = await register(t, "review@mandi.test", "Mandi", {
      autopilot: true,
    }));
    await api("PATCH", "/api/org", {
      autopilot: { spotCheckPct: 0, expertReview: false, secondOpinion: false },
    });
    // Kernel 3 looks fake, 6 can't be judged, every other one is unsure.
    t.classifier.classify = (req: ClassifyRequest) =>
      Promise.resolve({
        verdicts: req.numbers.map((n) => ({
          number: n,
          cls: n === 3 ? ARTIFICIAL_CLASS_ID : n === 6 ? "unclear" : "sound",
          confidence: n % 2 === 0 || n === 3 ? ("low" as const) : "high",
          reason: "test",
        })),
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      });
    const sample = await api<{ id: string }>("POST", "/api/samples", {
      crop: "wheat",
    });
    sampleId = sample.body.id;
    const form = multipart(
      { finish: "true" },
      {
        name: "photo",
        data: await kindsBoard(Array<string>(60).fill("sound"), 2),
      },
    );
    await t.app.inject({
      method: "POST",
      url: `/api/samples/${sampleId}/batches`,
      headers: { ...bearer(token), ...form.headers },
      payload: form.payload,
    });
    await t.jobs.idle();
  }, 60000);
  afterAll(() => t.close());

  it("pages the list, harmful kernels first", async () => {
    type Item = { id: string; number: number; flagReason: string };
    const all = await api<Item[]>("GET", `/api/samples/${sampleId}/review`);
    expect(all.body.length).toBeGreaterThan(24);
    const first = await api<{ items: Item[]; total: number; harmful: number }>(
      "GET",
      `/api/samples/${sampleId}/review?limit=24&offset=0`,
    );
    expect(first.body.total).toBe(all.body.length);
    expect(first.body.items).toHaveLength(24);
    expect(first.body.harmful).toBe(1);
    expect(first.body.items[0]!.number).toBe(3);
    const second = await api<{ items: Item[] }>(
      "GET",
      `/api/samples/${sampleId}/review?limit=24&offset=24`,
    );
    const seen = new Set(first.body.items.map((k) => k.id));
    expect(second.body.items.some((k) => seen.has(k.id))).toBe(false);
  });

  it("accepts every AI verdict at once, except harmful ones", async () => {
    const res = await api<{
      accepted: number;
      unclear: number;
      harmfulLeft: number;
    }>("POST", `/api/samples/${sampleId}/review/accept-ai`, {});
    expect(res.status).toBe(200);
    expect(res.body.unclear).toBe(1);
    expect(res.body.harmfulLeft).toBe(1);
    expect(res.body.accepted).toBeGreaterThan(20);
    await t.jobs.idle();

    const left = await api<{ number: number }[]>(
      "GET",
      `/api/samples/${sampleId}/review`,
    );
    expect(left.body.map((k) => k.number)).toEqual([3]);
    const before = await api<{ status: string }>(
      "GET",
      `/api/samples/${sampleId}`,
    );
    expect(before.body.status).not.toBe("completed");

    // The one fake-looking kernel, checked by a person, and the sample finishes.
    const [k] = await api<{ id: string }[]>(
      "GET",
      `/api/samples/${sampleId}/review`,
    ).then((r) => r.body);
    await api("POST", "/api/kernels/review", {
      decisions: [{ kernelId: k!.id, finalClass: "sound" }],
    });
    await t.jobs.idle();
    const after = await api<{
      status: string;
      kernels: { byClass: Record<string, number>; pendingReview: number };
    }>("GET", `/api/samples/${sampleId}`);
    expect(after.body.kernels.pendingReview).toBe(0);
    expect(after.body.kernels.byClass.unclear).toBe(1);
    expect(after.body.status).toBe("completed");
  });

  it("is for people who may change samples", async () => {
    const viewer = await register(t, "viewer@other.test", "Other");
    const res = await api(
      "POST",
      `/api/samples/${sampleId}/review/accept-ai`,
      {},
      viewer.token,
    );
    expect([403, 404]).toContain(res.status);
  });
});

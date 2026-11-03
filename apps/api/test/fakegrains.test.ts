import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ARTIFICIAL_CLASS_ID, CROP_PRESETS, presetFor } from "@ai-grain/core";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClassifyRequest } from "../src/ai/classifier.js";
import { CLASSIFY_SYSTEM } from "../src/ai/prompts.js";
import { crops } from "../src/db/schema.js";
import {
  bearer,
  createTestApp,
  kindsBoard,
  multipart,
  register,
  type TestApp,
} from "./helpers.js";

describe("the artificial-grain class", () => {
  it("is in every preset crop and in new crops, as harmful", () => {
    for (const p of [...Object.values(CROP_PRESETS), presetFor("bajra")]) {
      const c = p.classes.find((x) => x.id === ARTIFICIAL_CLASS_ID);
      expect(c?.group, p.key).toBe("harmful");
    }
    expect(CLASSIFY_SYSTEM).toMatch(/fake grains/i);
  });
});

describe("fake grains in a sample", () => {
  let t: TestApp;
  let token: string;
  let orgId: string;
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
    ({ token } = await register(t, "fake@mandi.test", "Mandi", {
      autopilot: true,
    }));
    await api("PATCH", "/api/org", {
      autopilot: { spotCheckPct: 0, expertReview: false },
    });
    // Model Orchestration (fake) sees kernels 3 and 9 as plastic.
    t.classifier.classify = (req: ClassifyRequest) =>
      Promise.resolve({
        verdicts: req.numbers.map((n) =>
          n === 3 || n === 9
            ? {
                number: n,
                cls: ARTIFICIAL_CLASS_ID,
                confidence: "high" as const,
                reason: "glassy, no germ mark, identical outline",
              }
            : {
                number: n,
                cls: "sound",
                confidence: "high" as const,
                reason: "no defect",
              },
        ),
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      });
  }, 60000);
  afterAll(() => t.close());

  it("adds the class to crops made before it existed (migration)", async () => {
    await api("GET", "/api/crops");
    // The test app has this one organisation.
    const [row] = await t.ctx.db.select({ orgId: crops.orgId }).from(crops);
    orgId = row!.orgId;
    // As an organisation's wheat looked before the class existed.
    await t.ctx.db.execute(
      sql`update crops set classes = (select jsonb_agg(c) from jsonb_array_elements(classes) c where c->>'id' <> 'artificial') where org_id = ${orgId} and key = 'wheat'`,
    );
    const migration = await readFile(
      fileURLToPath(
        new URL("../drizzle/0014_artificial_grains.sql", import.meta.url),
      ),
      "utf8",
    );
    await t.ctx.db.execute(sql.raw(migration));
    await t.ctx.db.execute(sql.raw(migration)); // runs safely twice
    const [wheat] = await t.ctx.db
      .select({ classes: crops.classes })
      .from(crops)
      .where(and(eq(crops.orgId, orgId), eq(crops.key, "wheat")));
    expect(
      wheat!.classes.filter((c) => c.id === ARTIFICIAL_CLASS_ID),
    ).toHaveLength(1);
  });

  it("always sends suspected fakes to a person, warns, and reports them", async () => {
    const sample = await api<{ id: string }>("POST", "/api/samples", {
      crop: "wheat",
    });
    const form = multipart(
      { finish: "true" },
      {
        name: "photo",
        data: await kindsBoard(Array<string>(40).fill("sound"), 4),
      },
    );
    await t.app.inject({
      method: "POST",
      url: `/api/samples/${sample.body.id}/batches`,
      headers: { ...bearer(token), ...form.headers },
      payload: form.payload,
    });
    await t.jobs.idle();

    type S = {
      status: string;
      kernels: { artificialSuspected: number; artificialConfirmed: number };
    };
    const before = await api<S>("GET", `/api/samples/${sample.body.id}`);
    // Even confident verdicts wait for a person: the sample isn't finished.
    expect(before.body.status).not.toBe("completed");
    expect(before.body.kernels.artificialSuspected).toBe(2);
    const pending = await api<{ id: string; aiClass: string }[]>(
      "GET",
      `/api/samples/${sample.body.id}/review`,
    );
    expect(
      pending.body.filter((k) => k.aiClass === ARTIFICIAL_CLASS_ID),
    ).toHaveLength(2);

    // The grader confirms one and finds the other is a real, polished kernel.
    const [fake, real] = pending.body.filter(
      (k) => k.aiClass === ARTIFICIAL_CLASS_ID,
    );
    await api("POST", "/api/kernels/review", {
      decisions: [
        { kernelId: fake!.id, finalClass: ARTIFICIAL_CLASS_ID },
        { kernelId: real!.id, finalClass: "sound" },
      ],
    });
    await t.jobs.idle();
    const after = await api<S>("GET", `/api/samples/${sample.body.id}`);
    expect(after.body.kernels).toMatchObject({
      artificialSuspected: 0,
      artificialConfirmed: 1,
    });

    const report = await t.app.inject({
      method: "GET",
      url: `/api/samples/${sample.body.id}/report.pdf`,
      headers: bearer(token),
    });
    expect(report.statusCode).toBe(200);
  });
});

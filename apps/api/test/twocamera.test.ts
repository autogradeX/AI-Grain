import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClassifyRequest } from "../src/ai/classifier.js";
import { LABEL_PX, SHEET_COLS, TILE_PX } from "../src/imaging/sheets.js";
import {
  bearer,
  createTestApp,
  multipart,
  register,
  type TestApp,
} from "./helpers.js";

const W = 2400;
const H = 3200;

/** Grains on a backlit glass tray, well apart, in a repeatable random layout. */
function layout(n: number, seed: number) {
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const grains: { x: number; y: number; angle: number }[] = [];
  while (grains.length < n) {
    const g = {
      x: 250 + r() * (W - 500),
      y: 250 + r() * (H - 500),
      angle: r() * 180,
    };
    if (grains.every((o) => Math.hypot(o.x - g.x, o.y - g.y) > 170))
      grains.push(g);
  }
  return grains;
}

/** One camera's photo: `dark` grains drawn heat-damaged. */
function trayPhoto(
  grains: { x: number; y: number; angle: number }[],
  dark: Set<number>,
) {
  const shapes = grains
    .map(
      (g, i) =>
        `<ellipse cx="${g.x}" cy="${g.y}" rx="62" ry="26" fill="${dark.has(i) ? "#4a2e17" : "#d9b46c"}" transform="rotate(${g.angle} ${g.x} ${g.y})"/>`,
    )
    .join("");
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#e4e9ec"/>${shapes}</svg>`,
    ),
  )
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * What the camera below the glass records: the other side of the same
 * grains, turned 180°, from further away (0.9×), off-centre, and mirrored.
 */
async function bottomCamera(underside: Buffer) {
  const turned = await sharp(underside)
    .rotate(180)
    .resize(Math.round(W * 0.9), Math.round(H * 0.9))
    .toBuffer();
  const placed = await sharp({
    create: { width: W, height: H, channels: 3, background: "#e4e9ec" },
  })
    .composite([{ input: turned, left: 150, top: 200 }])
    .png()
    .toBuffer();
  // A separate step: sharp composites after flipping in the same pipeline.
  return sharp(placed).flop().jpeg({ quality: 92 }).toBuffer();
}

/** Model Orchestration (fake) that looks at each tile: dark is heat-damaged. */
async function lookAtSheet(req: ClassifyRequest) {
  const { data, info } = await sharp(req.sheet)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const verdicts = req.numbers.map((n, i) => {
    const cx = 8 + (i % SHEET_COLS) * (TILE_PX + 8) + TILE_PX / 2;
    const cy =
      8 +
      Math.floor(i / SHEET_COLS) * (TILE_PX + LABEL_PX + 8) +
      LABEL_PX +
      TILE_PX / 2;
    const p = (Math.round(cy) * info.width + Math.round(cx)) * info.channels;
    const lum = 0.3 * data[p]! + 0.59 * data[p + 1]! + 0.11 * data[p + 2]!;
    return {
      number: n,
      cls: lum < 110 ? "heat_damaged" : "sound",
      confidence: "high" as const,
      reason: lum < 110 ? "dark, discoloured" : "plump, even colour",
    };
  });
  return {
    verdicts,
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
  };
}

describe("two cameras, above and below a glass tray", () => {
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
  const upload = (
    sampleId: string,
    photo: Buffer,
    fields: Record<string, string>,
  ) => {
    const form = multipart(fields, { name: "photo", data: photo });
    return t.app.inject({
      method: "POST",
      url: `/api/samples/${sampleId}/batches`,
      headers: { ...bearer(token), ...form.headers },
      payload: form.payload,
    });
  };

  beforeAll(async () => {
    t = await createTestApp();
    ({ token } = await register(t, "cams@mandi.test", "Mandi", {
      autopilot: true,
    }));
    await api("PATCH", "/api/org", {
      autopilot: { spotCheckPct: 0, expertReview: false },
    });
    t.classifier.classify = lookAtSheet;
  }, 60000);
  afterAll(() => t.close());

  it("counts each grain once, and a defect seen only underneath counts", async () => {
    const grains = layout(60, 11);
    const top = await trayPhoto(grains, new Set([25]));
    const bottom = await bottomCamera(
      await trayPhoto(grains, new Set([3, 17, 40])),
    );
    const sample = await api<{ id: string }>("POST", "/api/samples", {
      crop: "wheat",
    });
    const id = sample.body.id;
    const first = await upload(id, top, { side: "front" });
    expect(first.statusCode).toBe(202);
    const topId = first.json<{ id: string }>().id;
    const second = await upload(id, bottom, {
      pairWith: topId,
      finish: "true",
    });
    expect(second.statusCode).toBe(202);
    await t.jobs.idle();

    // A second bottom photo for the same top one is refused.
    expect((await upload(id, bottom, { pairWith: topId })).statusCode).toBe(
      409,
    );

    const topBatch = await api<{
      pairMatch: { pairs: number; share: number };
      kernelCount: number;
    }>("GET", `/api/batches/${topId}`);
    expect(topBatch.body.kernelCount).toBe(60);
    expect(topBatch.body.pairMatch.share).toBeGreaterThan(0.95);

    const s = await api<{
      status: string;
      kernels: { total: number; byClass: Record<string, number> };
    }>("GET", `/api/samples/${id}`);
    // 60 grains, not 120; three dark underneath and one on top.
    expect(s.body.kernels.total).toBe(60);
    expect(s.body.kernels.byClass).toEqual({ sound: 56, heat_damaged: 4 });
    expect(s.body.status).toBe("completed");
  }, 240000);

  it("doesn't count photos of two different trays as one", async () => {
    const sample = await api<{ id: string }>("POST", "/api/samples", {
      crop: "wheat",
    });
    const id = sample.body.id;
    const first = await upload(id, await trayPhoto(layout(50, 21), new Set()), {
      side: "front",
    });
    const topId = first.json<{ id: string }>().id;
    const second = await upload(
      id,
      await bottomCamera(await trayPhoto(layout(50, 99), new Set())),
      { pairWith: topId, finish: "true" },
    );
    await t.jobs.idle();
    const bottom = await api<{ status: string; error: string }>(
      "GET",
      `/api/batches/${second.json<{ id: string }>().id}`,
    );
    expect(bottom.body.status).toBe("failed");
    expect(bottom.body.error).toMatch(/couldn't be lined up/);
    const s = await api<{ status: string }>("GET", `/api/samples/${id}`);
    expect(s.body.status).toBe("in_progress");
  }, 240000);
});

describe("what a person checks with two sides", () => {
  const policy = {
    enabled: true,
    spotCheckPct: 0,
    autoSummary: false,
    expertReview: false,
  };
  const classes = [
    { id: "broken", label: "Broken", group: "broken_defective" as const },
    { id: "heat_damaged", label: "Heat", group: "broken_defective" as const },
    { id: "ergot", label: "Ergot", group: "harmful" as const },
  ];
  const top = {
    isCluster: false,
    aiClass: "sound",
    aiConfidence: "high" as const,
    aiClass2: "sound",
    aiConfidence2: "high" as const,
    draw: 0.5,
  };
  it("lets a settled underside defect stand, and sends doubts and harm to a person", async () => {
    const { flagFor } = await import("../src/modules/autopilot/triage.js");
    const under = (cls: string, conf: "high" | "low") =>
      flagFor(
        { ...top, otherSideClass: cls, otherSideConfidence: conf },
        classes,
        policy,
      );
    expect(under("sound", "high")).toBeNull();
    expect(under("heat_damaged", "high")).toBeNull();
    expect(under("heat_damaged", "low")).toBe("disagreement");
    expect(under("ergot", "high")).toBe("harmful");
    expect(
      flagFor(
        {
          ...top,
          aiClass: "broken",
          aiClass2: "broken",
          otherSideClass: "heat_damaged",
          otherSideConfidence: "high",
        },
        classes,
        policy,
      ),
    ).toBe("disagreement");
  });
});

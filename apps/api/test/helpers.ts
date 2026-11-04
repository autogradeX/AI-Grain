import { randomBytes } from "node:crypto";
import pg from "pg";
import {
  cleanStandardDraft,
  type Classifier,
  type ClassifyRequest,
  type DraftStandardRequest,
  type KernelVerdict,
  type SummaryRequest,
} from "../src/ai/classifier.js";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDb } from "../src/db/client.js";
import { JobRunner } from "../src/lib/jobs.js";
import { MemoryMailer } from "../src/lib/mailer.js";
import { MemoryStorage } from "../src/lib/storage.js";
import sharp from "sharp";

/** Every 5th kernel is broken, every 7th is a low-confidence sound kernel, the rest are sound. */
export class FakeClassifier implements Classifier {
  readonly requests: ClassifyRequest[] = [];
  readonly summaries: SummaryRequest[] = [];

  classify(req: ClassifyRequest) {
    this.requests.push(req);
    const verdicts: KernelVerdict[] = req.numbers.map((n) =>
      n % 5 === 0
        ? {
            number: n,
            cls: "broken",
            confidence: "high",
            reason: "half kernel",
          }
        : n % 7 === 0
          ? { number: n, cls: "sound", confidence: "low", reason: "glare" }
          : {
              number: n,
              cls: "sound",
              confidence: "high",
              reason: "no defect",
            },
    );
    return Promise.resolve({
      verdicts,
      usage: {
        inputTokens: 1000,
        outputTokens: 200,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    });
  }

  suggestCrop(req: { name: string }) {
    return Promise.resolve({
      suggestion: {
        label: `${req.name} (suggested)`,
        classes: [
          {
            id: "split",
            label: "Split",
            group: "broken_defective" as const,
            description: "Seed broken into its two halves.",
            massFactor: 1,
          },
          {
            id: "stones",
            label: "Stones",
            group: "impurity" as const,
            description: "Mineral pieces.",
            massFactor: 2,
          },
        ],
      },
      usage: {
        inputTokens: 300,
        outputTokens: 600,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    });
  }

  readonly drafts: DraftStandardRequest[] = [];

  /** A two-grade draft: one known class, one the crop lacks, one group limit. */
  draftStandard(req: DraftStandardRequest) {
    this.drafts.push(req);
    return Promise.resolve({
      draft: cleanStandardDraft(
        {
          name: `${req.reference} (draft)`,
          description: "Drafted for testing.",
          basis: "Test specification, 2026 edition.",
          grades: ["A", "B"].map((grade, i) => ({
            grade,
            limits: [
              { classId: "broken", maxPct: 2 + i * 2 },
              { classId: "not_a_class_here", maxPct: 3 },
            ],
            groupLimits: [{ group: "impurity" as const, maxPct: 0.5 + i }],
            maxTotalDefectsPct: null,
            maxMoisturePct: 14,
            minTestWeightKgPerHl: null,
          })),
          definitions: [
            {
              classId: "broken",
              definition: "Below three quarters of a kernel.",
            },
          ],
          uncertain: ["Moisture limit may have changed this season."],
          unmatched: [],
        },
        req.classes,
        req.reference,
      ),
      usage: {
        inputTokens: 500,
        outputTokens: 800,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    });
  }

  summarize(req: SummaryRequest) {
    this.summaries.push(req);
    return Promise.resolve({
      text: "Screening summary.",
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    });
  }
}

/**
 * With TEST_DATABASE_URL set (a Postgres server URL), each test app gets its
 * own new database there, so the suite also runs against real Postgres.
 * Otherwise tests use an in-memory PGlite database.
 */
async function testDatabaseUrl(): Promise<string | undefined> {
  const server = process.env.TEST_DATABASE_URL;
  if (!server) return undefined;
  const name = `aigrain_test_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: server });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();
  const url = new URL(server);
  url.pathname = `/${name}`;
  return url.toString();
}

export async function createTestApp(env: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: "test",
    JWT_SECRET: "test-secret-test-secret-test-secret-123",
    APP_URL: "http://app.test",
    AUTH_RATE_LIMIT_PER_MINUTE: "1000",
    ...env,
  });
  const handle = createDb(await testDatabaseUrl(), null);
  await handle.migrate();
  const mailer = new MemoryMailer();
  const storage = new MemoryStorage();
  const classifier = new FakeClassifier();
  // Outgoing webhooks: recorded, answered with `webhooks.status`.
  const webhooks = {
    status: 200,
    /** Throw instead of answering: no internet. */
    offline: false,
    /** Answers instead of `status`, e.g. by passing the request to another test app. */
    handler: null as
      null | ((url: string, init: RequestInit) => Promise<Response>),
    sent: [] as {
      url: string;
      headers: Record<string, string>;
      body: string;
    }[],
  };
  const fakeFetch = ((url: string, init: RequestInit) => {
    if (webhooks.offline)
      return Promise.reject(
        new TypeError("fetch failed: getaddrinfo ENOTFOUND"),
      );
    webhooks.sent.push({
      url,
      headers: init.headers as Record<string, string>,
      body: init.body as string,
    });
    if (webhooks.handler) return webhooks.handler(url, init);
    return Promise.resolve(new Response("", { status: webhooks.status }));
  }) as unknown as typeof fetch;
  let jobs!: JobRunner;
  const { app, ctx } = await buildApp(
    (log) => {
      jobs = new JobRunner(log);
      return {
        config,
        db: handle.db,
        storage,
        mailer,
        classifier,
        jobs,
        fetch: fakeFetch,
      };
    },
    { logger: false },
  );
  await app.ready();
  return {
    app,
    ctx,
    mailer,
    storage,
    classifier,
    jobs,
    webhooks,
    close: async () => {
      await jobs.idle();
      await app.close();
      await handle.close();
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/** Pulls the token out of the last email sent to `to`. */
export function tokenFromMail(mailer: MemoryMailer, to: string): string {
  const mail = [...mailer.sent].reverse().find((m) => m.to === to);
  const match = mail?.text.match(/token=([\w-]+)/);
  if (!match?.[1]) throw new Error(`No token mailed to ${to}`);
  return match[1];
}

export function refreshCookie(res: {
  cookies: { name: string; value: string }[];
}): string {
  const c = res.cookies.find((c) => c.name === "ag_rt");
  if (!c) throw new Error("No refresh cookie set");
  return c.value;
}

/**
 * Signs up a new organisation. Autopilot is switched off unless asked for,
 * so tests can walk through each manual step; autopilot.test.ts covers it.
 */
export async function register(
  t: TestApp,
  email = "admin@farm.test",
  orgName = "Farm",
  options: { autopilot?: boolean } = {},
) {
  const res = await t.app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      orgName,
      name: "Ada Admin",
      email,
      password: "correct horse battery",
    },
  });
  if (res.statusCode !== 201) throw new Error(res.body);
  const body = res.json<{ accessToken: string; user: { id: string } }>();
  if (!options.autopilot) {
    await t.app.inject({
      method: "PATCH",
      url: "/api/org",
      headers: { authorization: `Bearer ${body.accessToken}` },
      payload: { autopilot: { enabled: false } },
    });
  }
  return {
    token: body.accessToken,
    userId: body.user.id,
    cookie: refreshCookie(res),
  };
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/**
 * A synthetic board photo: a dark 20 × 28 cm grid with thin grey lines and
 * light ellipse "kernels", placed inside a larger frame so the corners matter.
 */
export async function syntheticBoard(kernelCount: number) {
  const pxPerCm = 60;
  const margin = 150;
  const bw = 20 * pxPerCm;
  const bh = 28 * pxPerCm;
  const width = bw + margin * 2;
  const height = bh + margin * 2;
  const lines: string[] = [];
  for (let c = 0; c <= 20; c++) {
    const x = margin + c * pxPerCm;
    lines.push(
      `<line x1="${x}" y1="${margin}" x2="${x}" y2="${margin + bh}" stroke="#555" stroke-width="1"/>`,
    );
  }
  for (let r = 0; r <= 28; r++) {
    const y = margin + r * pxPerCm;
    lines.push(
      `<line x1="${margin}" y1="${y}" x2="${margin + bw}" y2="${y}" stroke="#555" stroke-width="1"/>`,
    );
  }
  const kernels: string[] = [];
  for (let i = 0; i < kernelCount; i++) {
    const col = i % 9;
    const row = Math.floor(i / 9);
    const cx = margin + (1.2 + col * 2.1) * pxPerCm;
    const cy = margin + (1.2 + row * 2.0) * pxPerCm;
    kernels.push(
      `<ellipse cx="${cx}" cy="${cy}" rx="${0.35 * pxPerCm}" ry="${0.18 * pxPerCm}" fill="#d8b46a"/>`,
    );
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#777"/>
    <rect x="${margin}" y="${margin}" width="${bw}" height="${bh}" fill="#141414"/>
    ${lines.join("")}${kernels.join("")}</svg>`;
  const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
  return {
    jpeg,
    width,
    height,
    corners: [
      { x: margin, y: margin },
      { x: margin + bw, y: margin },
      { x: margin + bw, y: margin + bh },
      { x: margin, y: margin + bh },
    ],
  };
}

/** Builds a multipart body for `inject`. */
export function multipart(
  fields: Record<string, string>,
  file: { name: string; data: Buffer },
) {
  const boundary = "----aigrain" + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
      ),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
    ),
    file.data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return {
    payload: Buffer.concat(parts),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

/**
 * Brown kernels on light paper, no grid board, with light falling off
 * towards the bottom and a strip of dark table along the bottom edge: a
 * photo taken without the board.
 */
export async function kernelsOnPaper(
  kernelCount: number,
  /** Diameter of a brass reference coin drawn below the kernels, in pixels. */
  coinPx?: number,
) {
  const width = 900;
  const height = 1200;
  const kernels: string[] = [];
  for (let i = 0; i < kernelCount; i++) {
    const col = i % 6;
    const row = Math.floor(i / 6);
    const cx = 110 + col * 135;
    const cy = 120 + row * 130;
    kernels.push(
      `<ellipse cx="${cx}" cy="${cy}" rx="26" ry="18" fill="${i % 7 === 3 ? "#4a3020" : "#9a5a2a"}" transform="rotate(${(i * 37) % 180} ${cx} ${cy})"/>`,
    );
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="light" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e6d3dc"/><stop offset="1" stop-color="#a99aa1"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#light)"/>
    <rect x="0" y="${height - 25}" width="${width}" height="25" fill="#222"/>
    ${kernels.join("")}
    ${coinPx ? `<circle cx="450" cy="950" r="${coinPx / 2}" fill="#b08d57"/>` : ""}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

/** How each kind of kernel looks on `kindsBoard`. */
const KIND_LOOK: Record<string, { rx: number; ry: number; fill: string }> = {
  sound: { rx: 0.35, ry: 0.18, fill: "#d8b46a" },
  broken: { rx: 0.17, ry: 0.14, fill: "#d8b46a" },
  heat_damaged: { rx: 0.35, ry: 0.18, fill: "#5c3a1e" },
};

/**
 * A board whose kernels look like their kind (sound, broken, heat-damaged),
 * one per kind in `kinds`, numbered in reading order like detection does.
 * A little variation in size and colour per kernel keeps it realistic.
 */
export async function kindsBoard(kinds: string[], seed = 1) {
  const pxPerCm = 60;
  const margin = 150;
  const bw = 20 * pxPerCm;
  const bh = 28 * pxPerCm;
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const lines: string[] = [];
  for (let c = 0; c <= 20; c++) {
    const x = margin + c * pxPerCm;
    lines.push(
      `<line x1="${x}" y1="${margin}" x2="${x}" y2="${margin + bh}" stroke="#555" stroke-width="1"/>`,
    );
  }
  for (let r = 0; r <= 28; r++) {
    const y = margin + r * pxPerCm;
    lines.push(
      `<line x1="${margin}" y1="${y}" x2="${margin + bw}" y2="${y}" stroke="#555" stroke-width="1"/>`,
    );
  }
  const shapes = kinds.map((kind, i) => {
    const look = KIND_LOOK[kind]!;
    const cx = margin + (1.2 + (i % 9) * 2.1) * pxPerCm;
    const cy = margin + (1.2 + Math.floor(i / 9) * 2.0) * pxPerCm;
    const k = 0.9 + rand() * 0.2;
    return `<ellipse cx="${cx}" cy="${cy}" rx="${look.rx * pxPerCm * k}" ry="${look.ry * pxPerCm * k}" fill="${look.fill}" opacity="${0.92 + rand() * 0.08}" transform="rotate(${Math.round(rand() * 40 - 20)} ${cx} ${cy})"/>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${bw + margin * 2}" height="${bh + margin * 2}">
    <rect width="100%" height="100%" fill="#bdb6a8"/>
    <rect x="${margin}" y="${margin}" width="${bw}" height="${bh}" fill="#1b1b1d"/>
    ${lines.join("")}${shapes.join("")}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

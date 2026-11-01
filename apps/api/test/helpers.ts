import { randomBytes } from "node:crypto";
import pg from "pg";
import type { KernelVerdict } from "../src/ai/classifier.js";
import type {
  Classifier,
  ClassifyRequest,
  SummaryRequest,
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
    sent: [] as {
      url: string;
      headers: Record<string, string>;
      body: string;
    }[],
  };
  const fakeFetch = ((url: string, init: RequestInit) => {
    webhooks.sent.push({
      url,
      headers: init.headers as Record<string, string>,
      body: init.body as string,
    });
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

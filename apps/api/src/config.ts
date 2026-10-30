import { z } from "zod";

export const CLAUDE_MODELS = [
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
  "claude-opus-5-5",
] as const;
export type ClaudeModel = (typeof CLAUDE_MODELS)[number];

/** What users see: tiers of "Model Orchestration", never model names. */
export const MODEL_TIERS: Record<ClaudeModel, string> = {
  "claude-sonnet-5-5": "Standard",
  "claude-haiku-5-5": "Economy",
  "claude-opus-5-5": "Advanced",
};

export function modelTier(model: string): string {
  return MODEL_TIERS[model as ClaudeModel] ?? "Custom";
}

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().default(3000),
  /** Public URL of the app, used in emailed links. */
  APP_URL: z.url().default("http://localhost:5173"),
  /**
   * Postgres connection string. Leave empty to use an embedded PGlite database in DATA_DIR.
   * For Cloud SQL on Cloud Run: postgres://USER:PASSWORD@/DB?host=/cloudsql/PROJECT:REGION:INSTANCE
   */
  DATABASE_URL: z.string().optional(),
  /** Connections per instance. Keep instances × this under the database's connection limit. */
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  /** Apply database migrations at start-up. Set to false when a separate job runs them. */
  RUN_MIGRATIONS: bool.default(true),
  /** Google Cloud Storage bucket for photos and crops. Leave empty to store files in DATA_DIR. */
  STORAGE_BUCKET: z.string().optional(),
  /** Folder inside the bucket, e.g. "production". */
  STORAGE_PREFIX: z.string().default(""),
  DATA_DIR: z.string().default("./data"),
  /** At least 32 characters. Signs access tokens. */
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  ALLOW_SIGNUP: bool.default(true),
  REQUIRE_EMAIL_VERIFICATION: bool.default(false),
  ANTHROPIC_API_KEY: z.string().optional(),
  DEFAULT_MODEL: z.enum(CLAUDE_MODELS).default("claude-sonnet-5-5"),
  /** Claude requests run in parallel per batch, up to this many at once. */
  CLASSIFY_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(3),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default("AI-Grain <no-reply@localhost>"),
  /**
   * The organisation that runs the public website: its published demo samples,
   * knowledge hub and contact form. Defaults to the first organisation created.
   */
  SITE_OWNER_ORG_ID: z.uuid().optional(),
  /** Directory with the built web app to serve. Leave empty to serve the API only. */
  WEB_DIST_DIR: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(20),
  /** Requests per minute per IP to sign-in, sign-up, reset and invite endpoints. */
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}

import { join } from "node:path";
import { Storage as GcsClient } from "@google-cloud/storage";
import { ClaudeClassifier, UnconfiguredClassifier } from "./ai/classifier.js";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { SchemaMismatchError } from "./db/adopt.js";
import { createDb, DatabaseUnreachableError } from "./db/client.js";
import { JobRunner } from "./lib/jobs.js";
import { LogMailer, SmtpMailer } from "./lib/mailer.js";
import { DiskStorage, GcsStorage } from "./lib/storage.js";

const config = loadConfig();
const dbHandle = createDb(config.DATABASE_URL, config.DATA_DIR, {
  poolMax: config.DB_POOL_MAX,
  onRetry: (attempt, error) => {
    console.warn(
      `Database not reachable yet (attempt ${attempt}): ${error.message || "connection closed"}. Retrying.`,
    );
  },
});
try {
  await dbHandle.ready();
  if (config.RUN_MIGRATIONS) await dbHandle.migrate();
} catch (err) {
  // A plain message instead of a stack trace, so the cause is the first thing in the logs.
  console.error(
    err instanceof DatabaseUnreachableError ||
      err instanceof SchemaMismatchError
      ? err.message
      : err,
  );
  process.exit(1);
}

let jobs!: JobRunner;
const { app } = await buildApp(
  (log) => {
    jobs = new JobRunner(log);
    return {
      config,
      db: dbHandle.db,
      // On Cloud Run the container disk is temporary, so files go to a bucket.
      // Credentials come from the service account (Application Default Credentials).
      storage: config.STORAGE_BUCKET
        ? new GcsStorage(
            new GcsClient().bucket(config.STORAGE_BUCKET),
            config.STORAGE_PREFIX,
          )
        : new DiskStorage(join(config.DATA_DIR, "files")),
      mailer: config.SMTP_URL
        ? new SmtpMailer(config.SMTP_URL, config.MAIL_FROM)
        : new LogMailer(log),
      classifier: config.ANTHROPIC_API_KEY
        ? new ClaudeClassifier({ apiKey: config.ANTHROPIC_API_KEY })
        : new UnconfiguredClassifier(),
      jobs,
    };
  },
  {
    logger:
      config.NODE_ENV === "development"
        ? { transport: { target: "pino-pretty" } }
        : { level: "info" },
    bodyLimit: 1024 * 1024,
  },
);

if (!config.ANTHROPIC_API_KEY) {
  app.log.warn(
    "ANTHROPIC_API_KEY is not set: classification and summaries will fail until it is.",
  );
}
if (!config.SMTP_URL) {
  app.log.warn(
    "SMTP_URL is not set: emails (verification, reset, invites) are written to this log.",
  );
}
if (!config.DATABASE_URL && process.env.K_SERVICE) {
  app.log.warn(
    "Running on Cloud Run without DATABASE_URL: the embedded database is lost when the instance stops.",
  );
}
if (!config.STORAGE_BUCKET && process.env.K_SERVICE) {
  app.log.warn(
    "Running on Cloud Run without STORAGE_BUCKET: photos are lost when the instance stops.",
  );
}

/**
 * Cloud Run sends SIGTERM and allows about 10 seconds. Stop taking requests,
 * give running jobs a few seconds, then exit. Jobs cut off here are marked
 * failed later and can be retried.
 */
let stopping = false;
const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  await Promise.race([
    jobs.idle(),
    new Promise((resolve) => setTimeout(resolve, 7000)),
  ]);
  await dbHandle.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: config.HOST, port: config.PORT });

import { join } from "node:path";
import { ClaudeClassifier, UnconfiguredClassifier } from "./ai/classifier.js";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { JobRunner } from "./lib/jobs.js";
import { LogMailer, SmtpMailer } from "./lib/mailer.js";
import { DiskStorage } from "./lib/storage.js";

const config = loadConfig();
const dbHandle = createDb(config.DATABASE_URL, config.DATA_DIR);
await dbHandle.migrate();

const { app } = await buildApp(
  (log) => ({
    config,
    db: dbHandle.db,
    storage: new DiskStorage(join(config.DATA_DIR, "files")),
    mailer: config.SMTP_URL
      ? new SmtpMailer(config.SMTP_URL, config.MAIL_FROM)
      : new LogMailer(log),
    classifier: config.ANTHROPIC_API_KEY
      ? new ClaudeClassifier({ apiKey: config.ANTHROPIC_API_KEY })
      : new UnconfiguredClassifier(),
    jobs: new JobRunner(log),
  }),
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

const shutdown = async () => {
  await app.close();
  await dbHandle.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await app.listen({ host: config.HOST, port: config.PORT });

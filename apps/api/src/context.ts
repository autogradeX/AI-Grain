import type { Classifier } from "./ai/classifier.js";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import type { JobRunner } from "./lib/jobs.js";
import type { Embedder } from "./imaging/embedder.js";
import type { Mailer } from "./lib/mailer.js";
import type { Storage } from "./lib/storage.js";

/** Everything route modules need, passed in so tests can swap any part. */
export interface AppContext {
  config: Config;
  db: Db;
  storage: Storage;
  mailer: Mailer;
  classifier: Classifier;
  jobs: JobRunner;
  /**
   * Describes kernel crops for the local model (MobileNetV2). Absent when the
   * model file isn't installed: the local model then uses measurements.
   */
  embedder?: Embedder | null;
  /** For outgoing webhooks; tests pass a fake. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

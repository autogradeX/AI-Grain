import { Worker } from "node:worker_threads";
import type { LocalModelWeights } from "../../db/schema.js";
import { train, type Example } from "./model.js";

type TrainOptions = Parameters<typeof train>[1];

/**
 * Trains on a worker thread: training is seconds to a minute of pure
 * computation, which on the main thread would stop the API from answering
 * anyone (the training page's own progress checks included). Running from
 * the TypeScript sources (tests), it trains in place.
 */
export function trainOffThread(
  examples: Example[],
  options: TrainOptions = {},
): Promise<LocalModelWeights> {
  if (import.meta.url.endsWith(".ts"))
    return Promise.resolve(train(examples, options));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.js", import.meta.url), {
      workerData: { examples, options },
    });
    worker.once("message", (weights: LocalModelWeights) => resolve(weights));
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`Training stopped (exit code ${code})`));
    });
  });
}

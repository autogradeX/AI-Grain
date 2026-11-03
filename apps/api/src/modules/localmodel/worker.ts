import { parentPort, workerData } from "node:worker_threads";
import { train, type Example } from "./model.js";

/* Trains the local model off the API's main thread (see thread.ts). */
const { examples, options } = workerData as {
  examples: Example[];
  options: Parameters<typeof train>[1];
};
parentPort?.postMessage(train(examples, options));

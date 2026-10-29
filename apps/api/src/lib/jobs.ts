import type { FastifyBaseLogger } from "fastify";

/**
 * Runs slow work (image processing, Claude requests) after the HTTP response
 * is sent. Jobs run in this process, so the API is meant to run as a single
 * instance; clients poll the batch status. `idle()` lets tests wait for work.
 */
export class JobRunner {
  private readonly running = new Set<Promise<void>>();

  constructor(private readonly log: FastifyBaseLogger) {}

  run(name: string, job: () => Promise<void>): void {
    const promise = job()
      .catch((err: unknown) => {
        this.log.error({ err, job: name }, "Background job failed");
      })
      .finally(() => this.running.delete(promise));
    this.running.add(promise);
  }

  async idle(): Promise<void> {
    while (this.running.size > 0) await Promise.all([...this.running]);
  }
}

/** Runs `fn` over `items` with at most `limit` calls in flight. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T, i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

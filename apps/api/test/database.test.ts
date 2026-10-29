import { describe, expect, it } from "vitest";
import {
  createDb,
  DatabaseUnreachableError,
  describeDatabaseUrl,
} from "../src/db/client.js";

describe("connecting to Postgres", () => {
  it("describes a Cloud SQL URL without the password", () => {
    const text = describeDatabaseUrl(
      "postgres://aigrain:s3cret@/aigrain?host=/cloudsql/proj:asia-southeast1:db",
    );
    expect(text).toBe(
      'database "aigrain" as user "aigrain" via socket /cloudsql/proj:asia-southeast1:db',
    );
    expect(text).not.toContain("s3cret");
  });

  it("retries, then explains a Cloud SQL socket that can't be reached", async () => {
    const retries: number[] = [];
    const handle = createDb(
      "postgres://aigrain:s3cret@/aigrain?host=/tmp/cloudsql/missing:region:instance",
      null,
      {
        attempts: 3,
        retryDelayMs: 5,
        onRetry: (attempt) => retries.push(attempt),
      },
    );
    const error = await handle.ready().catch((e: unknown) => e);
    await handle.close();
    expect(retries).toEqual([1, 2]);
    expect(error).toBeInstanceOf(DatabaseUnreachableError);
    const message = (error as Error).message;
    expect(message).toMatch(/Could not connect to database "aigrain"/);
    expect(message).toMatch(/roles\/cloudsql.client/);
    expect(message).not.toContain("s3cret");
  });
});

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { parse as parseConnectionString } from "pg-connection-string";
import { adoptHandAppliedSchema } from "./adopt.js";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof drizzlePg<typeof schema>>;

export interface DbHandle {
  db: Db;
  /** Waits until the database answers, retrying for a while. Throws DatabaseUnreachableError if it never does. */
  ready(): Promise<void>;
  migrate(): Promise<void>;
  close(): Promise<void>;
}

export class DatabaseUnreachableError extends Error {}

export interface ConnectOptions {
  poolMax?: number;
  /** Connection attempts before giving up. */
  attempts?: number;
  /** Delay before the second attempt; doubles each time, up to 5 seconds. */
  retryDelayMs?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

// apps/api/drizzle, from both src/db and the compiled dist/src/db.
const migrationsFolder = fileURLToPath(
  new URL("../../drizzle", import.meta.url).href.replace(
    "/dist/drizzle",
    "/drizzle",
  ),
);

/** Any fixed number; instances agree on it so only one migrates at a time. */
const MIGRATION_LOCK = 4_202_611;

/** Where a connection string points, without the password, for error messages. */
export function describeDatabaseUrl(databaseUrl: string): string {
  try {
    // pg's own parser: it accepts the Cloud SQL form with an empty host, which URL rejects.
    const c = parseConnectionString(databaseUrl);
    const where = c.host?.startsWith("/")
      ? `socket ${c.host}`
      : `${c.host ?? "localhost"}:${c.port || "5432"}`;
    return `database "${c.database ?? ""}" as user "${c.user ?? ""}" via ${where}`;
  } catch {
    return "the database in DATABASE_URL (the URL could not be parsed)";
  }
}

function unreachableMessage(databaseUrl: string, error: Error): string {
  const lines = [
    `Could not connect to ${describeDatabaseUrl(databaseUrl)}: ${error.message || (error as NodeJS.ErrnoException).code}.`,
  ];
  if (databaseUrl.includes("/cloudsql/")) {
    lines.push(
      "This is a Cloud SQL socket. Check that:",
      "  - the Cloud Run service lists the instance under Cloud SQL connections (--add-cloudsql-instances),",
      "  - the service account has the Cloud SQL Client role (roles/cloudsql.client),",
      "  - the Cloud SQL Admin API (sqladmin.googleapis.com) is enabled in the project,",
      "  - the instance is running, is PostgreSQL, and has a public IP (or the service uses a VPC and DATABASE_URL points at the private IP),",
      "  - the database and user in DATABASE_URL exist. See deploy/cloud-run.md.",
    );
  }
  return lines.join("\n");
}

/**
 * Connects to Postgres when a URL is given. Otherwise opens an embedded
 * PGlite database: in `dataDir`, or in memory when `dataDir` is null.
 */
export function createDb(
  databaseUrl: string | undefined,
  dataDir: string | null,
  options: ConnectOptions = {},
): DbHandle {
  if (databaseUrl) {
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      max: options.poolMax ?? 10,
    });
    // An idle connection can drop (Cloud SQL maintenance, network blips). Without
    // a listener, the pool's error event would crash the process; the pool
    // replaces the connection on the next query instead.
    pool.on("error", (err) => {
      console.error(`Database connection lost: ${err.message}`);
    });
    const db = drizzlePg(pool, { schema });
    return {
      db,
      // The Cloud SQL socket can take a few seconds to accept connections on a cold start.
      ready: async () => {
        const attempts = options.attempts ?? 8;
        let delay = options.retryDelayMs ?? 1000;
        for (let attempt = 1; ; attempt++) {
          try {
            const client = await pool.connect();
            try {
              await client.query("select 1");
            } finally {
              client.release();
            }
            return;
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            if (attempt >= attempts) {
              throw new DatabaseUnreachableError(
                unreachableMessage(databaseUrl, error),
              );
            }
            options.onRetry?.(attempt, error);
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay = Math.min(delay * 2, 5000);
          }
        }
      },
      // Several instances can start at once (Cloud Run scaling). The advisory lock
      // makes the others wait, then find the migrations already applied.
      migrate: async () => {
        const client = await pool.connect();
        try {
          await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK]);
          const adopted = await adoptHandAppliedSchema(
            (text, params) => client.query(text, params),
            migrationsFolder,
          );
          if (adopted.length) {
            console.warn(
              `Found tables created outside the app; recorded migrations ${adopted.join(", ")} as already applied.`,
            );
          }
          await migratePg(drizzlePg(client), { migrationsFolder });
        } finally {
          await client
            .query("select pg_advisory_unlock($1)", [MIGRATION_LOCK])
            .catch(() => undefined);
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }

  let client: PGlite;
  if (dataDir === null) {
    client = new PGlite();
  } else {
    const dir = join(dataDir, "pglite");
    mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzlePglite(client, { schema });
  return {
    // Both drivers expose the same query builder. PGlite is for development and tests.
    db: db as unknown as Db,
    ready: async () => {
      await client.waitReady;
    },
    migrate: () => migratePglite(db, { migrationsFolder }),
    close: () => client.close(),
  };
}

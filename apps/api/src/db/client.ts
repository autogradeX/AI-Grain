import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import pg from "pg";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof drizzlePg<typeof schema>>;

export interface DbHandle {
  db: Db;
  migrate(): Promise<void>;
  close(): Promise<void>;
}

// apps/api/drizzle, from both src/db and the compiled dist/src/db.
const migrationsFolder = fileURLToPath(
  new URL("../../drizzle", import.meta.url).href.replace(
    "/dist/drizzle",
    "/drizzle",
  ),
);

/**
 * Connects to Postgres when a URL is given. Otherwise opens an embedded
 * PGlite database: in `dataDir`, or in memory when `dataDir` is null.
 */
/** Any fixed number; instances agree on it so only one migrates at a time. */
const MIGRATION_LOCK = 4_202_611;

export function createDb(
  databaseUrl: string | undefined,
  dataDir: string | null,
  options: { poolMax?: number } = {},
): DbHandle {
  if (databaseUrl) {
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      max: options.poolMax ?? 10,
    });
    const db = drizzlePg(pool, { schema });
    return {
      db,
      // Several instances can start at once (Cloud Run scaling). The advisory lock
      // makes the others wait, then find the migrations already applied.
      migrate: async () => {
        const client = await pool.connect();
        try {
          await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK]);
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
    migrate: () => migratePglite(db, { migrationsFolder }),
    close: () => client.close(),
  };
}

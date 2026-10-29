import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

type Query = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

interface Journal {
  entries: { idx: number; when: number; tag: string }[];
}

interface Snapshot {
  tables: Record<
    string,
    { name: string; schema: string; columns: Record<string, unknown> }
  >;
  enums: Record<string, { name: string; schema: string }>;
}

export class SchemaMismatchError extends Error {}

/**
 * Handles a database whose tables were created by running the migration SQL
 * by hand (psql, Cloud SQL Studio). The tables exist but Drizzle's migration
 * log is empty, so Drizzle would run 0000 again and fail on "already exists".
 *
 * If the database has every table, column and enum of a migration's schema
 * snapshot, that migration and the ones before it are recorded as applied.
 * Later migrations then run normally. A partial schema is not guessed at: it
 * raises SchemaMismatchError listing what is missing.
 *
 * Returns the tags of the migrations it recorded (empty when nothing to do).
 */
export async function adoptHandAppliedSchema(
  query: Query,
  migrationsFolder: string,
): Promise<string[]> {
  const [log] = (
    await query(`select to_regclass('drizzle.__drizzle_migrations') as t`)
  ).rows;
  if (log?.t) {
    const [count] = (
      await query(`select count(*)::int as n from drizzle.__drizzle_migrations`)
    ).rows;
    if (Number(count?.n) > 0) return [];
  }
  const [users] = (await query(`select to_regclass('public.users') as t`)).rows;
  if (!users?.t) return []; // A fresh database: the migrations create everything.

  const columns = new Set(
    (
      await query(
        `select table_schema || '.' || table_name || '.' || column_name as c
         from information_schema.columns where table_schema not in ('pg_catalog', 'information_schema')`,
      )
    ).rows.map((r) => String(r.c)),
  );
  const enums = new Set(
    (
      await query(
        `select n.nspname || '.' || t.typname as e from pg_type t
         join pg_namespace n on n.oid = t.typnamespace where t.typtype = 'e'`,
      )
    ).rows.map((r) => String(r.e)),
  );

  const journal = JSON.parse(
    await readFile(join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  ) as Journal;
  // For the error message: what the closest snapshot (fewest gaps) is missing.
  let closestMissing: string[] | null = null;
  for (let i = journal.entries.length - 1; i >= 0; i--) {
    const entry = journal.entries[i]!;
    const snapshot = JSON.parse(
      await readFile(
        join(
          migrationsFolder,
          "meta",
          `${String(entry.idx).padStart(4, "0")}_snapshot.json`,
        ),
        "utf8",
      ),
    ) as Snapshot;
    const missing = [
      ...Object.values(snapshot.tables).flatMap((t) =>
        Object.keys(t.columns)
          .map((c) => `${t.schema || "public"}.${t.name}.${c}`)
          .filter((c) => !columns.has(c)),
      ),
      ...Object.values(snapshot.enums)
        .map((e) => `${e.schema || "public"}.${e.name}`)
        .filter((e) => !enums.has(e)),
    ];
    if (missing.length > 0) {
      if (!closestMissing || missing.length < closestMissing.length)
        closestMissing = missing;
      continue;
    }

    const adopted = journal.entries.slice(0, i + 1);
    await query(`create schema if not exists drizzle`);
    await query(
      `create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`,
    );
    for (const e of adopted) {
      // Same hash Drizzle computes: sha256 of the migration file's text.
      const sql = await readFile(
        join(migrationsFolder, `${e.tag}.sql`),
        "utf8",
      );
      await query(
        `insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)`,
        [createHash("sha256").update(sql).digest("hex"), e.when],
      );
    }
    return adopted.map((e) => e.tag);
  }

  throw new SchemaMismatchError(
    [
      "The database already has AI-Grain tables, but they don't match any migration, so it is not safe to migrate it.",
      `Missing: ${(closestMissing ?? []).slice(0, 15).join(", ")}${(closestMissing?.length ?? 0) > 15 ? ", …" : ""}.`,
      "This usually means a migration SQL file was only partly run by hand. If the database holds no data yet,",
      "drop and recreate it and let the app create the tables. See deploy/cloud-run.md (Troubleshooting).",
    ].join("\n"),
  );
}

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, describe, expect, it } from "vitest";
import {
  adoptHandAppliedSchema,
  SchemaMismatchError,
} from "../src/db/adopt.js";

const folder = fileURLToPath(new URL("../drizzle", import.meta.url));
const runFile = async (db: PGlite, tag: string) =>
  db.exec(await readFile(`${folder}/${tag}.sql`, "utf8"));

let db: PGlite;
afterEach(async () => {
  await db.close();
});

const adopt = () =>
  adoptHandAppliedSchema((text, params) => db.query(text, params), folder);
const migrateAll = () => migrate(drizzle(db), { migrationsFolder: folder });
const hasUpdatedAt = async () =>
  (
    await db.query(
      "select 1 from information_schema.columns where table_name = 'batches' and column_name = 'updated_at'",
    )
  ).rows.length === 1;

describe("adopting a schema created by running the SQL by hand", () => {
  it("leaves a fresh database to the migrations", async () => {
    db = new PGlite();
    expect(await adopt()).toEqual([]);
    await migrateAll();
    expect(await hasUpdatedAt()).toBe(true);
  });

  it("records 0000 when only it was run, then applies 0001 normally", async () => {
    db = new PGlite();
    await runFile(db, "0000_init");
    expect(await adopt()).toEqual(["0000_init"]);
    await migrateAll(); // would fail with "type already exists" without the adoption
    expect(await hasUpdatedAt()).toBe(true);
  });

  it("records both when both files were run", async () => {
    db = new PGlite();
    await runFile(db, "0000_init");
    await runFile(db, "0001_batch_updated_at");
    expect(await adopt()).toEqual(["0000_init", "0001_batch_updated_at"]);
    await migrateAll();
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from drizzle.__drizzle_migrations",
    );
    expect(rows[0]?.n).toBe(2);
  });

  it("does nothing once the app has recorded its migrations", async () => {
    db = new PGlite();
    await migrateAll();
    expect(await adopt()).toEqual([]);
  });

  it("refuses a partial schema instead of guessing", async () => {
    db = new PGlite();
    await runFile(db, "0000_init");
    await db.exec("alter table kernels drop column crop_key");
    const error = await adopt().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SchemaMismatchError);
    expect((error as Error).message).toMatch(/public\.kernels\.crop_key/);
  });
});

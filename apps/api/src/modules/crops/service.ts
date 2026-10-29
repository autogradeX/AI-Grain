import {
  CROP_PRESETS,
  presetFor,
  type ClassDef,
  type CropProfile,
} from "@ai-grain/core";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../../context.js";
import { crops } from "../../db/schema.js";

export type CropRow = typeof crops.$inferSelect;

export function normalizeCropKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 60);
}

/** The organisation's crops. The first call seeds the five preset crops. */
export async function listCrops(
  ctx: AppContext,
  orgId: string,
): Promise<CropRow[]> {
  const rows = await ctx.db
    .select()
    .from(crops)
    .where(eq(crops.orgId, orgId))
    .orderBy(asc(crops.label));
  if (rows.length > 0) return rows;
  await ctx.db
    .insert(crops)
    .values(
      Object.values(CROP_PRESETS).map((p) => ({
        orgId,
        key: p.key,
        label: p.label,
        classes: p.classes,
      })),
    )
    .onConflictDoNothing();
  return ctx.db
    .select()
    .from(crops)
    .where(eq(crops.orgId, orgId))
    .orderBy(asc(crops.label));
}

/**
 * The crop profile for `key`, created from its preset (or the general cereal
 * list) the first time a sample, standard or reference uses it.
 */
export async function ensureCrop(
  ctx: AppContext,
  orgId: string,
  key: string,
): Promise<CropRow> {
  const k = normalizeCropKey(key);
  const [existing] = await ctx.db
    .select()
    .from(crops)
    .where(and(eq(crops.orgId, orgId), eq(crops.key, k)));
  if (existing) return existing;
  const preset = presetFor(k);
  await ctx.db
    .insert(crops)
    .values({ orgId, key: k, label: preset.label, classes: preset.classes })
    .onConflictDoNothing();
  const [row] = await ctx.db
    .select()
    .from(crops)
    .where(and(eq(crops.orgId, orgId), eq(crops.key, k)));
  return row!;
}

export function profileOf(row: CropRow): CropProfile {
  return { key: row.key, label: row.label, classes: row.classes };
}

/**
 * Classes with the standard's definitions laid over the crop's descriptions:
 * a standard's own wording wins, since it is what the grader grades against.
 */
export function classesWithDefinitions(
  classes: readonly ClassDef[],
  definitions: Partial<Record<string, string>> | null | undefined,
): ClassDef[] {
  return classes.map((c) => {
    const own = definitions?.[c.id]?.trim();
    return own ? { ...c, description: own } : c;
  });
}

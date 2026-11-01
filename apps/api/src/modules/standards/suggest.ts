import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { AppContext } from "../../context.js";
import { samples, standards } from "../../db/schema.js";

/** How many recent samples of the crop the suggestion looks at. */
const RECENT = 100;

export interface StandardSuggestion {
  standard: { id: string; name: string; allowEstimate: boolean };
  /** Why this one: most used lately, the organisation's only one, or its newest. */
  reason:
    | { kind: "usage"; used: number; of: number }
    | { kind: "only" }
    | { kind: "newest" };
}

/**
 * The standard a new sample of `crop` most likely needs: the one used most
 * in the organisation's recent samples of that crop, else its only standard
 * for the crop, else the newest. Null when it has none for the crop.
 */
export async function suggestStandard(
  ctx: AppContext,
  orgId: string,
  crop: string,
): Promise<StandardSuggestion | null> {
  const candidates = await ctx.db
    .select({
      id: standards.id,
      name: standards.name,
      allowEstimate: standards.allowEstimate,
    })
    .from(standards)
    .where(
      and(
        eq(standards.orgId, orgId),
        eq(standards.crop, crop),
        eq(standards.archived, false),
      ),
    )
    .orderBy(desc(standards.createdAt));
  if (!candidates.length) return null;

  const recent = await ctx.db
    .select({ standardId: samples.standardId })
    .from(samples)
    .where(
      and(
        eq(samples.orgId, orgId),
        eq(samples.crop, crop),
        isNotNull(samples.standardId),
        inArray(
          samples.standardId,
          candidates.map((c) => c.id),
        ),
      ),
    )
    .orderBy(desc(samples.createdAt))
    .limit(RECENT);
  const uses = new Map<string, number>();
  for (const r of recent)
    uses.set(r.standardId!, (uses.get(r.standardId!) ?? 0) + 1);
  // Most used; on a tie, the newer standard (candidates are newest first).
  let best: (typeof candidates)[number] | null = null;
  for (const c of candidates) {
    if ((uses.get(c.id) ?? 0) > (best ? (uses.get(best.id) ?? 0) : 0)) best = c;
  }
  if (best) {
    return {
      standard: best,
      reason: { kind: "usage", used: uses.get(best.id)!, of: recent.length },
    };
  }
  return {
    standard: candidates[0]!,
    reason: { kind: candidates.length === 1 ? "only" : "newest" },
  };
}

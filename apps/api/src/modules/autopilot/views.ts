import { matchViews, type Pt } from "@ai-grain/core";
import { and, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../context.js";
import { batches, kernels } from "../../db/schema.js";
import { triageBatch } from "./service.js";

/*
 * Two cameras, one above and one below a glass tray, photograph the same
 * kernels at once: the bottom photo (`pairOf` = the top photo) is mirrored
 * on upload. Once both are classified, each bottom kernel is paired with its
 * top kernel by position, becomes its twin (`twinOf`: not counted on its
 * own), and its verdict joins the top kernel's (`otherSide*`): a defect on
 * the underside counts, see aiVerdict in batches/service.ts.
 */

/** Below this share of kernels paired, the two photos aren't of the same tray. */
const MIN_SHARE = 0.6;

/** The batch statuses after which a batch's verdicts won't change by themselves. */
const SETTLED = new Set(["classified"]);

/**
 * Pairs a two-camera photo with its partner, if both are classified. Safe to
 * call for any batch, any number of times: "none" for a single photo,
 * "waiting" while the partner isn't done, "joined", or "failed" when the
 * two photos can't be lined up (the bottom one is then marked failed).
 */
export async function joinViews(
  ctx: AppContext,
  batchId: string,
): Promise<"none" | "waiting" | "joined" | "failed"> {
  const [batch] = await ctx.db
    .select({
      id: batches.id,
      pairOf: batches.pairOf,
      sampleId: batches.sampleId,
    })
    .from(batches)
    .where(eq(batches.id, batchId));
  if (!batch) return "none";
  let topId: string;
  let bottomId: string;
  if (batch.pairOf) {
    topId = batch.pairOf;
    bottomId = batch.id;
  } else {
    const [bottom] = await ctx.db
      .select({ id: batches.id })
      .from(batches)
      .where(eq(batches.pairOf, batch.id));
    if (!bottom) return "none";
    topId = batch.id;
    bottomId = bottom.id;
  }
  const pair = await ctx.db
    .select({ id: batches.id, status: batches.status })
    .from(batches)
    .where(inArray(batches.id, [topId, bottomId]));
  if (pair.length < 2 || !pair.every((b) => SETTLED.has(b.status)))
    return "waiting";

  const select = {
    id: kernels.id,
    x: kernels.x,
    y: kernels.y,
    w: kernels.w,
    h: kernels.h,
    aiClass: kernels.aiClass,
    aiConfidence: kernels.aiConfidence,
    aiReason: kernels.aiReason,
    expertClass: kernels.expertClass,
    expertConfidence: kernels.expertConfidence,
    expertReason: kernels.expertReason,
    flagReason: kernels.flagReason,
  };
  const top = await ctx.db
    .select(select)
    .from(kernels)
    .where(eq(kernels.batchId, topId));
  const bottom = await ctx.db
    .select(select)
    .from(kernels)
    .where(eq(kernels.batchId, bottomId));
  const centre = (k: { x: number; y: number; w: number; h: number }): Pt => ({
    x: k.x + k.w / 2,
    y: k.y + k.h / 2,
  });
  // A pair may be up to about half a kernel apart after alignment.
  const sizes = top.map((k) => Math.max(k.w, k.h)).sort((a, b) => a - b);
  const kernelSize = sizes[sizes.length >> 1] ?? 40;
  const match = matchViews(
    top.map(centre),
    bottom.map(centre),
    kernelSize * 0.5,
  );

  // Start again from scratch: a re-run must give the same result.
  await ctx.db
    .update(kernels)
    .set({ twinOf: null })
    .where(eq(kernels.batchId, bottomId));
  await ctx.db
    .update(kernels)
    .set({
      otherSideClass: null,
      otherSideConfidence: null,
      otherSideReason: null,
    })
    .where(eq(kernels.batchId, topId));

  if (match.share < MIN_SHARE) {
    await ctx.db
      .update(batches)
      .set({
        status: "failed",
        pairMatch: {
          pairs: match.pairs.length,
          share: match.share,
          meanErrorPx: Number.isFinite(match.meanError) ? match.meanError : -1,
        },
        error: `The bottom photo couldn't be lined up with the top photo (${Math.round(match.share * 100)}% of kernels paired). Check that both cameras see the same tray and that nothing moved, then delete both photos and take them again.`,
      })
      .where(eq(batches.id, bottomId));
    return "failed";
  }

  await ctx.db.transaction(async (tx) => {
    for (const [ti, bi] of match.pairs) {
      const t = top[ti]!;
      const b = bottom[bi]!;
      const cls = b.expertClass ?? b.aiClass;
      await tx
        .update(kernels)
        .set({ twinOf: t.id })
        .where(eq(kernels.id, b.id));
      await tx
        .update(kernels)
        .set({
          otherSideClass: cls,
          // Settled on its own side (no flag): it stands; else it's unsure.
          otherSideConfidence: b.flagReason ? "low" : "high",
          otherSideReason: b.expertReason ?? b.aiReason,
        })
        .where(eq(kernels.id, t.id));
    }
  });
  await ctx.db
    .update(batches)
    .set({
      pairMatch: {
        pairs: match.pairs.length,
        share: match.share,
        meanErrorPx: Math.round(match.meanError * 10) / 10,
      },
    })
    .where(eq(batches.id, topId));
  // Triage again with both sides known (twins aren't reviewed on their own).
  await triageBatch(ctx, bottomId);
  await triageBatch(ctx, topId);
  return "joined";
}

/** The bottom photo of a two-camera pair, for a top photo; null without one. */
export async function bottomOf(ctx: AppContext, topId: string) {
  const [b] = await ctx.db
    .select({ id: batches.id })
    .from(batches)
    .where(and(eq(batches.pairOf, topId)));
  return b?.id ?? null;
}

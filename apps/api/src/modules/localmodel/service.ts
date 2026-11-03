import { SOUND, UNCLEAR } from "@ai-grain/core";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { AppContext } from "../../context.js";
import {
  analysisRuns,
  batches,
  kernels,
  localModels,
  organizations,
  samples,
  type LocalModelMetrics,
  type LocalModelSettings,
} from "../../db/schema.js";
import {
  cropFeatures,
  modelFeatures,
  type KernelForModel,
} from "../../imaging/features.js";
import { mapLimit } from "../../lib/jobs.js";
import { mix } from "../batches/service.js";
import { evaluate, train, verdictOf, type Example } from "./model.js";

/** A class needs this many labelled kernels to be learned; fewer are left out. */
export const MIN_PER_CLASS = 12;
/** And the model needs this many labelled kernels in all. */
export const MIN_TOTAL = 100;
/** An AI verdict nobody checked counts this much, against 1 for a person's decision. */
const AI_LABEL_WEIGHT = 0.5;

export class NotEnoughDataError extends Error {}

/**
 * The bar a model must clear, on photos it didn't learn from, before it
 * classifies anything: it catches most defects, and its confident verdicts
 * are nearly always right (those are the ones no person checks).
 */
export const QUALITY_BAR = {
  defectRecall: 0.8,
  highAccuracy: 0.95,
  validatedOn: 20,
  /** A confident verdict for a class it gets right less often is checked by a person. */
  classPrecision: 0.9,
};

/** Why a model isn't good enough to use yet; empty when it is. */
export function shortfalls(metrics: LocalModelMetrics): string[] {
  const out: string[] = [];
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  if (metrics.validatedOn < QUALITY_BAR.validatedOn)
    out.push(
      `checked on only ${metrics.validatedOn} kernels (needs ${QUALITY_BAR.validatedOn})`,
    );
  if (metrics.defectRecall < QUALITY_BAR.defectRecall)
    out.push(
      `catches ${pct(metrics.defectRecall)} of defects (needs ${pct(QUALITY_BAR.defectRecall)})`,
    );
  if (metrics.highAccuracy < QUALITY_BAR.highAccuracy)
    out.push(
      `confident verdicts ${pct(metrics.highAccuracy)} right (needs ${pct(QUALITY_BAR.highAccuracy)})`,
    );
  return out;
}

export async function localModelSettings(
  ctx: AppContext,
  orgId: string,
): Promise<{ mode: NonNullable<LocalModelSettings["mode"]> }> {
  const [org] = await ctx.db
    .select({ localModel: organizations.localModel })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  return { mode: org?.localModel.mode ?? "offline" };
}

export async function activeModel(
  ctx: AppContext,
  orgId: string,
  crop: string,
) {
  const [row] = await ctx.db
    .select()
    .from(localModels)
    .where(
      and(
        eq(localModels.orgId, orgId),
        eq(localModels.crop, crop),
        eq(localModels.active, true),
      ),
    )
    .orderBy(desc(localModels.version))
    .limit(1);
  return row ?? null;
}

type KernelRow = typeof kernels.$inferSelect;

/** Measures crops detected before features existed, and saves them. */
async function backfill(ctx: AppContext, rows: KernelRow[]) {
  const missing = rows.filter((k) => !k.features);
  await mapLimit(missing, 8, async (k) => {
    try {
      const f = await cropFeatures(await ctx.storage.get(k.cropKey));
      k.features = f;
      await ctx.db
        .update(kernels)
        .set({ features: f })
        .where(eq(kernels.id, k.id));
    } catch {
      // The crop is gone: the kernel is left out.
    }
  });
}

/** Model inputs for every kernel of these batches, by kernel id. */
async function inputsFor(
  ctx: AppContext,
  batchIds: string[],
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  for (let i = 0; i < batchIds.length; i += 50) {
    const rows = await ctx.db
      .select()
      .from(kernels)
      .where(inArray(kernels.batchId, batchIds.slice(i, i + 50)));
    await backfill(ctx, rows);
    const byBatch = new Map<string, KernelRow[]>();
    for (const r of rows)
      byBatch.set(r.batchId, [...(byBatch.get(r.batchId) ?? []), r]);
    for (const list of byBatch.values()) {
      const usable = list.filter((k) => k.features);
      const x = modelFeatures(
        usable.map((k): KernelForModel => ({
          features: k.features!,
          area: k.area,
          lengthMm: k.lengthMm,
          widthMm: k.widthMm,
          isCluster: k.isCluster,
        })),
      );
      usable.forEach((k, n) => out.set(k.id, x[n]!));
    }
  }
  return out;
}

/** The label a kernel teaches the model, and how much it counts; null when it teaches nothing. */
function labelOf(k: KernelRow): { label: string; weight: number } | null {
  if (k.isCluster) return null;
  if (k.reviewStatus !== "pending") {
    const label = k.finalClass ?? k.expertClass ?? k.aiClass;
    return label && label !== UNCLEAR ? { label, weight: 1 } : null;
  }
  // Settled by Model Orchestration without a person (never the local model's own verdicts).
  if (k.flagReason === null && k.aiClass && k.aiSource !== "local") {
    const label = k.expertClass ?? k.aiClass;
    return label !== UNCLEAR ? { label, weight: AI_LABEL_WEIGHT } : null;
  }
  return null;
}

/** The organisation's labelled kernels of a crop, and how many per class. */
export async function dataset(ctx: AppContext, orgId: string, crop: string) {
  const rows = await ctx.db
    .select({ kernel: kernels })
    .from(kernels)
    .innerJoin(samples, eq(samples.id, kernels.sampleId))
    .where(
      and(
        eq(kernels.orgId, orgId),
        eq(samples.crop, crop),
        eq(kernels.isCluster, false),
        sql`${kernels.aiClass} is not null or ${kernels.finalClass} is not null`,
      ),
    );
  const labelled = rows
    .map((r) => ({ kernel: r.kernel, label: labelOf(r.kernel) }))
    .filter(
      (
        r,
      ): r is { kernel: KernelRow; label: { label: string; weight: number } } =>
        r.label !== null,
    );
  const counts: Record<string, { reviewed: number; settled: number }> = {};
  for (const { label } of labelled) {
    const c = (counts[label.label] ??= { reviewed: 0, settled: 0 });
    if (label.weight === 1) c.reviewed++;
    else c.settled++;
  }
  return { labelled, counts };
}

/**
 * Trains a new version of the crop's local model on the organisation's
 * labelled kernels, checks it on a fifth of the photos it didn't train on,
 * and makes it the active one.
 */
export async function trainLocalModel(
  ctx: AppContext,
  orgId: string,
  crop: string,
  by: string | null,
) {
  const { labelled } = await dataset(ctx, orgId, crop);
  const perClass = new Map<string, number>();
  for (const r of labelled)
    perClass.set(r.label.label, (perClass.get(r.label.label) ?? 0) + 1);
  const kept = new Set(
    [...perClass].filter(([, n]) => n >= MIN_PER_CLASS).map(([c]) => c),
  );
  const leftOut = Object.fromEntries(
    [...perClass].filter(([c]) => !kept.has(c)),
  );
  // At most this many kernels per class (sound kernels can be many
  // thousands): keeps training to seconds, with every class still well seen.
  const cap = new Map<string, number>();
  const usable = labelled
    .filter((r) => kept.has(r.label.label))
    .sort((a, b) => mix(a.kernel.id) - mix(b.kernel.id))
    .filter((r) => {
      const n = (cap.get(r.label.label) ?? 0) + 1;
      cap.set(r.label.label, n);
      return n <= 3000;
    });
  if (usable.length < MIN_TOTAL || kept.size < 2) {
    throw new NotEnoughDataError(
      `Not enough checked kernels yet: ${usable.length} of at least ${MIN_TOTAL}, in at least 2 classes with ${MIN_PER_CLASS} or more each.`,
    );
  }
  const inputs = await inputsFor(ctx, [
    ...new Set(usable.map((r) => r.kernel.batchId)),
  ]);
  const examples = usable.flatMap((r) => {
    const x = inputs.get(r.kernel.id);
    return x
      ? [
          {
            x,
            label: r.label.label,
            weight: r.label.weight,
            batchId: r.kernel.batchId,
            human: r.label.weight === 1,
          },
        ]
      : [];
  });
  // Validation: whole photos the model never saw (a fifth), so its score
  // reflects new photos, and only kernels a person decided.
  const batchIds = [...new Set(examples.map((e) => e.batchId))];
  const held =
    batchIds.length >= 5
      ? new Set(batchIds.filter((id) => mix(`${id}:val`) < 0.2))
      : new Set<string>();
  const isHeld = (e: (typeof examples)[number]) =>
    held.size ? held.has(e.batchId) : mix(`${e.x.join()}:val`) < 0.2;
  const trainSet: Example[] = examples.filter((e) => !isHeld(e));
  let validation: Example[] = examples.filter((e) => isHeld(e) && e.human);
  if (validation.length < 20) validation = examples.filter(isHeld);
  const weights = train(trainSet, { validation, seed: 7 });
  const metrics = {
    ...evaluate(weights, validation, SOUND),
    trainedOn: trainSet.length,
    validatedOn: validation.length,
    leftOut,
  };
  const [last] = await ctx.db
    .select({ version: localModels.version })
    .from(localModels)
    .where(and(eq(localModels.orgId, orgId), eq(localModels.crop, crop)))
    .orderBy(desc(localModels.version))
    .limit(1);
  await ctx.db
    .update(localModels)
    .set({ active: false })
    .where(and(eq(localModels.orgId, orgId), eq(localModels.crop, crop)));
  const [row] = await ctx.db
    .insert(localModels)
    .values({
      orgId,
      crop,
      version: (last?.version ?? 0) + 1,
      weights,
      metrics,
      createdBy: by,
    })
    .returning();
  return row!;
}

/**
 * Classifies a batch's unclassified kernels with the crop's local model, on
 * this machine. Returns false when there is no model for the crop.
 */
export async function classifyLocally(
  ctx: AppContext,
  batchId: string,
): Promise<boolean> {
  const [row] = await ctx.db
    .select({ batch: batches, sample: samples })
    .from(batches)
    .innerJoin(samples, eq(samples.id, batches.sampleId))
    .where(eq(batches.id, batchId));
  if (!row) return false;
  const model = await activeModel(ctx, row.sample.orgId, row.sample.crop);
  // Not good enough yet: the photo waits for Model Orchestration instead.
  if (!model || shortfalls(model.metrics).length) return false;
  const started = Date.now();
  const inputs = await inputsFor(ctx, [batchId]);
  const todo = await ctx.db
    .select({ id: kernels.id })
    .from(kernels)
    .where(and(eq(kernels.batchId, batchId), isNull(kernels.aiClass)));
  const pct = (p: number) => Math.round(p * 100);
  await ctx.db.transaction(async (tx) => {
    for (const k of todo) {
      const x = inputs.get(k.id);
      const v = x
        ? verdictOf(model.weights, x)
        : { cls: UNCLEAR, p: 0, confidence: "low" as const };
      // A class it often gets wrong isn't settled on its word, however sure it is.
      const precision = model.metrics.perClass[v.cls]?.precision ?? 0;
      if (v.confidence === "high" && precision < QUALITY_BAR.classPrecision)
        v.confidence = "medium";
      await tx
        .update(kernels)
        .set({
          aiClass: v.cls,
          aiConfidence: v.confidence,
          aiSource: "local",
          aiReason: x
            ? `Local model v${model.version} (offline), ${pct(v.p)}% sure`
            : "Local model: the crop couldn't be measured",
        })
        .where(eq(kernels.id, k.id));
    }
  });
  await ctx.db.insert(analysisRuns).values({
    orgId: row.sample.orgId,
    sampleId: row.sample.id,
    batchId,
    kind: "local",
    model: `local-v${model.version}`,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    durationMs: Date.now() - started,
  });
  return true;
}

/** What the Local model page shows for a crop. */
export async function localModelStatus(
  ctx: AppContext,
  orgId: string,
  crop: string,
) {
  const { counts } = await dataset(ctx, orgId, crop);
  const versions = await ctx.db
    .select({
      id: localModels.id,
      version: localModels.version,
      metrics: localModels.metrics,
      active: localModels.active,
      createdAt: localModels.createdAt,
    })
    .from(localModels)
    .where(and(eq(localModels.orgId, orgId), eq(localModels.crop, crop)))
    .orderBy(desc(localModels.version))
    .limit(10);
  const [used] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(kernels)
    .innerJoin(samples, eq(samples.id, kernels.sampleId))
    .where(
      and(
        eq(kernels.orgId, orgId),
        eq(samples.crop, crop),
        eq(kernels.aiSource, "local"),
        ne(kernels.reviewStatus, "pending"),
      ),
    );
  return {
    settings: await localModelSettings(ctx, orgId),
    // For each version: why it can't be used yet (empty: it can).
    versions: versions.map((v) => ({
      ...v,
      shortfalls: shortfalls(v.metrics),
    })),
    counts,
    minimum: { perClass: MIN_PER_CLASS, total: MIN_TOTAL },
    reviewedLocalVerdicts: used?.n ?? 0,
  };
}

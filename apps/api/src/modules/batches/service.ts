import { type KernelClass } from "@ai-grain/core";
import { and, asc, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import type {
  ClassifierError,
  KernelVerdict,
  ReferenceExample,
  Usage,
} from "../../ai/classifier.js";
import type { ClaudeModel } from "../../config.js";
import { CLAUDE_MODELS } from "../../config.js";
import type { AppContext } from "../../context.js";
import {
  analysisRuns,
  batches,
  kernels,
  organizations,
  referenceImages,
  samples,
  standards,
  type Corners,
} from "../../db/schema.js";
import { straightenBoard } from "../../imaging/board.js";
import { detectKernels } from "../../imaging/detect.js";
import {
  boardPreview,
  buildSheet,
  cropKernels,
  cropWindowCm,
  KERNELS_PER_SHEET,
} from "../../imaging/sheets.js";
import { mapLimit } from "../../lib/jobs.js";
import { MAX_REFERENCES_PER_REQUEST } from "../references/routes.js";

/** A kernel the operator must look at: anything not confidently sound, and every cluster. */
export const needsReview: SQL<boolean> = sql<boolean>`(
  ${kernels.isCluster}
  or (${kernels.aiClass} is not null and ${kernels.aiClass} <> 'sound')
  or ${kernels.aiConfidence} = 'low'
)`;

/** The class that counts: the operator's decision, else Claude's. */
export const effectiveClass = sql<KernelClass | null>`coalesce(${kernels.finalClass}, ${kernels.aiClass})`;

export const batchPrefix = (b: {
  orgId: string;
  sampleId: string;
  id: string;
}) => `orgs/${b.orgId}/samples/${b.sampleId}/batches/${b.id}`;

async function setBatch(
  ctx: AppContext,
  id: string,
  values: Partial<typeof batches.$inferInsert>,
) {
  await ctx.db.update(batches).set(values).where(eq(batches.id, id));
}

/** Straightens the board, finds kernels and stores a crop of each. Replaces any earlier detection. */
export async function processBatch(
  ctx: AppContext,
  batchId: string,
  corners: Corners,
): Promise<void> {
  const [batch] = await ctx.db
    .select()
    .from(batches)
    .where(eq(batches.id, batchId));
  if (!batch) return;
  await setBatch(ctx, batchId, { status: "detecting", corners, error: null });
  try {
    const prefix = batchPrefix(batch);
    const original = await ctx.storage.get(batch.originalKey);
    const board = await straightenBoard(original, corners);
    const detection = await detectKernels(board);
    const windowCm = cropWindowCm(detection.kernels);
    const crops = await cropKernels(board, detection.kernels, windowCm);

    await ctx.storage.remove(`${prefix}/kernels`);
    await ctx.storage.put(
      `${prefix}/board.jpg`,
      await boardPreview(board, board.width),
    );
    await ctx.storage.put(`${prefix}/preview.jpg`, await boardPreview(board));
    const rows: (typeof kernels.$inferInsert)[] = [];
    for (const k of detection.kernels) {
      const cropKey = `${prefix}/kernels/${k.number}.jpg`;
      await ctx.storage.put(cropKey, crops.get(k.number)!);
      rows.push({
        orgId: batch.orgId,
        sampleId: batch.sampleId,
        batchId,
        number: k.number,
        x: k.x,
        y: k.y,
        w: k.w,
        h: k.h,
        area: k.area,
        cell: k.cell,
        isCluster: k.isCluster,
        cropKey,
      });
    }
    await ctx.db.transaction(async (tx) => {
      await tx.delete(kernels).where(eq(kernels.batchId, batchId));
      for (let i = 0; i < rows.length; i += 500) {
        await tx.insert(kernels).values(rows.slice(i, i + 500));
      }
    });
    await setBatch(ctx, batchId, {
      status: "detected",
      boardKey: `${prefix}/board.jpg`,
      kernelCount: rows.length,
      cropWindowCm: windowCm,
      // Not a failure, but worth a look: usually a corner is off the grid.
      error: detection.ignoredLargeRegions
        ? "Large bright areas were left out. Check that the corners sit on the grid, then re-mark them if needed."
        : null,
    });
  } catch (err) {
    await setBatch(ctx, batchId, {
      status: "failed",
      error: `Detection failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    throw err;
  }
}

/** The model for a sample: its own choice, then the organisation default, then the server default. */
export async function modelFor(
  ctx: AppContext,
  sampleId: string,
): Promise<ClaudeModel> {
  const [row] = await ctx.db
    .select({
      sampleModel: samples.model,
      orgModel: organizations.defaultModel,
    })
    .from(samples)
    .innerJoin(organizations, eq(organizations.id, samples.orgId))
    .where(eq(samples.id, sampleId));
  const pick = row?.sampleModel ?? row?.orgModel;
  return (CLAUDE_MODELS as readonly string[]).includes(pick ?? "")
    ? (pick as ClaudeModel)
    : ctx.config.DEFAULT_MODEL;
}

/** Up to MAX_REFERENCES_PER_REQUEST examples, spread across classes, newest first within a class. */
export async function loadReferences(
  ctx: AppContext,
  orgId: string,
  crop: string,
): Promise<ReferenceExample[]> {
  const rows = await ctx.db
    .select()
    .from(referenceImages)
    .where(
      and(eq(referenceImages.orgId, orgId), eq(referenceImages.crop, crop)),
    )
    .orderBy(asc(referenceImages.cls), desc(referenceImages.createdAt));
  const byClass = new Map<string, typeof rows>();
  for (const r of rows) byClass.set(r.cls, [...(byClass.get(r.cls) ?? []), r]);
  const picked: typeof rows = [];
  for (let round = 0; picked.length < MAX_REFERENCES_PER_REQUEST; round++) {
    let added = false;
    for (const list of byClass.values()) {
      const r = list[round];
      if (r && picked.length < MAX_REFERENCES_PER_REQUEST) {
        picked.push(r);
        added = true;
      }
    }
    if (!added) break;
  }
  return Promise.all(
    picked.map(async (r) => ({
      cls: r.cls,
      note: r.note,
      jpeg: await ctx.storage.get(r.storageKey),
    })),
  );
}

/**
 * Sends the batch's unclassified kernels to Claude, 30 per sheet. Kernels
 * already classified keep their verdicts, so a retry after a failure only
 * re-sends what is missing.
 */
export async function classifyBatch(
  ctx: AppContext,
  batchId: string,
): Promise<void> {
  const [row] = await ctx.db
    .select({ batch: batches, sample: samples, standard: standards })
    .from(batches)
    .innerJoin(samples, eq(samples.id, batches.sampleId))
    .leftJoin(standards, eq(standards.id, samples.standardId))
    .where(eq(batches.id, batchId));
  if (!row) return;
  const { batch, sample, standard } = row;
  const model = await modelFor(ctx, sample.id);
  const started = Date.now();
  const total: Usage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  let requests = 0;
  let failure: string | null;

  await setBatch(ctx, batchId, { status: "classifying", error: null });
  try {
    const todo = await ctx.db
      .select()
      .from(kernels)
      .where(and(eq(kernels.batchId, batchId), isNull(kernels.aiClass)))
      .orderBy(asc(kernels.number));
    const references = await loadReferences(ctx, sample.orgId, sample.crop);
    const chunks: (typeof todo)[] = [];
    for (let i = 0; i < todo.length; i += KERNELS_PER_SHEET) {
      chunks.push(todo.slice(i, i + KERNELS_PER_SHEET));
    }

    const results = await mapLimit(
      chunks,
      ctx.config.CLASSIFY_CONCURRENCY,
      async (chunk) => {
        try {
          const tiles = await Promise.all(
            chunk.map(async (k) => ({
              number: k.number,
              jpeg: await ctx.storage.get(k.cropKey),
            })),
          );
          const { verdicts, usage } = await ctx.classifier.classify({
            model,
            crop: sample.crop,
            standardName: standard?.name ?? null,
            definitions: standard?.definitions ?? {},
            references,
            sheet: await buildSheet(tiles),
            numbers: chunk.map((k) => k.number),
            windowCm: batch.cropWindowCm ?? 1.6,
            side: batch.side,
          });
          requests++;
          total.inputTokens += usage.inputTokens;
          total.outputTokens += usage.outputTokens;
          total.cacheReadTokens += usage.cacheReadTokens;
          total.cacheWriteTokens += usage.cacheWriteTokens;
          await saveVerdicts(ctx, batchId, verdicts);
          return null;
        } catch (err) {
          return (err as ClassifierError).message || String(err);
        }
      },
    );
    failure = results.find((r) => r !== null) ?? null;
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
  }

  await ctx.db.insert(analysisRuns).values({
    orgId: sample.orgId,
    sampleId: sample.id,
    batchId,
    kind: "classify",
    model,
    requests,
    ...total,
    durationMs: Date.now() - started,
    error: failure,
  });
  await setBatch(ctx, batchId, {
    status: failure ? "failed" : "classified",
    error: failure
      ? `Classification incomplete: ${failure}. Retry to classify the remaining kernels.`
      : null,
  });
}

async function saveVerdicts(
  ctx: AppContext,
  batchId: string,
  verdicts: KernelVerdict[],
) {
  await ctx.db.transaction(async (tx) => {
    for (const v of verdicts) {
      await tx
        .update(kernels)
        .set({
          aiClass: v.cls,
          aiConfidence: v.confidence,
          aiReason: v.reason.slice(0, 500),
        })
        .where(and(eq(kernels.batchId, batchId), eq(kernels.number, v.number)));
    }
  });
}

/** Kernel counts per effective class and review progress, for a sample or one batch. */
export async function kernelSummary(
  ctx: AppContext,
  where: { sampleId: string } | { batchId: string },
) {
  const filter =
    "sampleId" in where
      ? eq(kernels.sampleId, where.sampleId)
      : eq(kernels.batchId, where.batchId);
  const byClass = await ctx.db
    .select({ cls: effectiveClass, count: sql<number>`count(*)::int` })
    .from(kernels)
    .where(filter)
    .groupBy(effectiveClass);
  const [progress] = await ctx.db
    .select({
      total: sql<number>`count(*)::int`,
      classified: sql<number>`count(${kernels.aiClass})::int`,
      flagged: sql<number>`count(*) filter (where ${needsReview})::int`,
      pendingReview: sql<number>`count(*) filter (where ${needsReview} and ${kernels.reviewStatus} = 'pending')::int`,
      reviewed: sql<number>`count(*) filter (where ${kernels.reviewStatus} <> 'pending')::int`,
    })
    .from(kernels)
    .where(filter);
  return {
    byClass: Object.fromEntries(
      byClass.map((r) => [r.cls ?? "unclassified", r.count]),
    ),
    ...progress!,
  };
}

/** Batches still being processed in the background for a sample. */
export async function busyBatches(ctx: AppContext, sampleId: string) {
  return ctx.db
    .select({ id: batches.id })
    .from(batches)
    .where(
      and(
        eq(batches.sampleId, sampleId),
        or(eq(batches.status, "detecting"), eq(batches.status, "classifying")),
      ),
    );
}

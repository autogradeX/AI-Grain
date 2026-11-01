import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { summarizeDimensions } from "@ai-grain/core";
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
import { findGridCorners } from "../../imaging/corners.js";
import { detectKernels } from "../../imaging/detect.js";
import { boardGray, measureKernel } from "../../imaging/measure.js";
import {
  boardPreview,
  buildSheet,
  cropKernels,
  cropWindowCm,
  KERNELS_PER_SHEET,
} from "../../imaging/sheets.js";
import { mapLimit } from "../../lib/jobs.js";
import { classesWithDefinitions, ensureCrop } from "../crops/service.js";
import { MAX_REFERENCES_PER_REQUEST } from "../references/routes.js";

/** A kernel a person must look at: triage gave it a reason (see autopilot/triage.ts). */
export const needsReview: SQL<boolean> = sql<boolean>`(${kernels.flagReason} is not null)`;

/** The class that counts: the operator's decision, else the expert pass's, else the first look's. */
export const effectiveClass = sql<
  string | null
>`coalesce(${kernels.finalClass}, ${kernels.expertClass}, ${kernels.aiClass})`;

/** The AI's verdict: the expert pass's when there is one, else the first look's. */
export const aiVerdict = sql<
  string | null
>`coalesce(${kernels.expertClass}, ${kernels.aiClass})`;
export const aiVerdictConfidence = sql<
  "high" | "medium" | "low" | null
>`case when ${kernels.expertClass} is not null then ${kernels.expertConfidence} else ${kernels.aiConfidence} end`;

export const batchPrefix = (b: {
  orgId: string;
  sampleId: string;
  id: string;
}) => `orgs/${b.orgId}/samples/${b.sampleId}/batches/${b.id}`;

/** Busy batches with no progress for this long are treated as interrupted. */
export const STALE_AFTER_MS = 10 * 60 * 1000;

/**
 * Marks batches failed when their background job was cut off, for example
 * when Cloud Run stopped the instance. The operator can then retry.
 */
export async function expireStaleBatches(
  ctx: AppContext,
  where: { sampleId: string } | { batchId: string },
): Promise<void> {
  await ctx.db
    .update(batches)
    .set({
      status: "failed",
      error:
        "Processing stopped before it finished, probably because the server restarted. Retry to continue.",
    })
    .where(
      and(
        "sampleId" in where
          ? eq(batches.sampleId, where.sampleId)
          : eq(batches.id, where.batchId),
        inArray(batches.status, ["detecting", "classifying"]),
        lt(batches.updatedAt, new Date(Date.now() - STALE_AFTER_MS)),
      ),
    );
}

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
  given: Corners | null,
): Promise<void> {
  const [batch] = await ctx.db
    .select()
    .from(batches)
    .where(eq(batches.id, batchId));
  if (!batch) return;
  await setBatch(ctx, batchId, { status: "detecting", error: null });
  try {
    const prefix = batchPrefix(batch);
    const original = await ctx.storage.get(batch.originalKey);
    // No corners from the operator: find the grid in the photo.
    const corners = given ?? (await findGridCorners(original));
    if (!corners) {
      await setBatch(ctx, batchId, {
        status: "failed",
        error:
          "The grid board wasn't found in this photo. Mark its four corners, or retake the photo with the whole board on a lighter surface.",
      });
      return;
    }
    await setBatch(ctx, batchId, { corners });
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
    // Uploads in parallel: one at a time is slow against cloud storage.
    await mapLimit(detection.kernels, 16, (k) =>
      ctx.storage.put(
        `${prefix}/kernels/${k.number}.jpg`,
        crops.get(k.number)!,
      ),
    );
    // Length and breadth at full resolution; touching kernels aren't measured.
    const gray = await boardGray(board);
    const rows: (typeof kernels.$inferInsert)[] = [];
    for (const k of detection.kernels) {
      const cropKey = `${prefix}/kernels/${k.number}.jpg`;
      const size = k.isCluster
        ? null
        : measureKernel(gray, detection.threshold, k);
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
        lengthMm: size?.lengthMm ?? null,
        widthMm: size?.widthMm ?? null,
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

type KernelRow = typeof kernels.$inferSelect;

/**
 * Sends kernels to the classifier, 30 per sheet, and records the usage.
 * Returns the first error, or null. `shuffle` puts kernels next to different
 * neighbours (for an independent second opinion).
 */
export async function classifyKernels(
  ctx: AppContext,
  batchId: string,
  todo: KernelRow[],
  options: {
    kind: "classify" | "second_opinion" | "expert";
    shuffle?: boolean;
    /** Expert pass: what earlier looks said, by kernel number. Smaller sheets, Advanced tier. */
    expertNotes?: Record<number, string>;
    save: (verdicts: KernelVerdict[]) => Promise<void>;
  },
): Promise<string | null> {
  const [row] = await ctx.db
    .select({ batch: batches, sample: samples, standard: standards })
    .from(batches)
    .innerJoin(samples, eq(samples.id, batches.sampleId))
    .leftJoin(standards, eq(standards.id, samples.standardId))
    .where(eq(batches.id, batchId));
  if (!row) return "batch not found";
  const { batch, sample, standard } = row;
  const expert = options.expertNotes;
  const model = expert
    ? ctx.config.EXPERT_MODEL
    : await modelFor(ctx, sample.id);
  // The first look reads the side from the photo when nobody gave it.
  const side =
    options.kind === "classify" && batch.sideDetected ? "auto" : batch.side;
  const sideVotes = { front: 0, crease: 0 };
  const started = Date.now();
  const total: Usage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  let requests = 0;
  let failure: string | null;
  try {
    const crop = await ensureCrop(ctx, sample.orgId, sample.crop);
    const classes = classesWithDefinitions(crop.classes, standard?.definitions);
    const references = await loadReferences(ctx, sample.orgId, sample.crop);
    const ordered = options.shuffle
      ? [...todo].sort((a, b) => mix(a.id) - mix(b.id))
      : todo;
    const chunks: KernelRow[][] = [];
    // Expert sheets are smaller: fewer tiles to weigh per request.
    const perSheet = expert ? EXPERT_KERNELS_PER_SHEET : KERNELS_PER_SHEET;
    for (let i = 0; i < ordered.length; i += perSheet) {
      chunks.push(ordered.slice(i, i + perSheet));
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
          const result = await ctx.classifier.classify({
            model,
            cropLabel: crop.label,
            standardName: standard?.name ?? null,
            classes,
            references,
            sheet: await buildSheet(tiles),
            numbers: chunk.map((k) => k.number),
            windowCm: batch.cropWindowCm ?? 1.6,
            side,
            ...(expert && { expert: { notes: expert } }),
          });
          const { verdicts, usage } = result;
          if (result.side) sideVotes[result.side] += chunk.length;
          requests++;
          total.inputTokens += usage.inputTokens;
          total.outputTokens += usage.outputTokens;
          total.cacheReadTokens += usage.cacheReadTokens;
          total.cacheWriteTokens += usage.cacheWriteTokens;
          await options.save(verdicts);
          // Heartbeat: shows the job is still alive.
          await setBatch(ctx, batchId, { updatedAt: new Date() });
          return null;
        } catch (err) {
          return (err as ClassifierError).message || String(err);
        }
      },
    );
    failure = results.find((r) => r !== null) ?? null;
    if (sideVotes.front + sideVotes.crease > 0) {
      await setBatch(ctx, batchId, {
        side: sideVotes.crease > sideVotes.front ? "crease" : "front",
      });
    }
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
  }
  await ctx.db.insert(analysisRuns).values({
    orgId: sample.orgId,
    sampleId: sample.id,
    batchId,
    kind: options.kind,
    model,
    requests,
    ...total,
    durationMs: Date.now() - started,
    error: failure,
  });
  return failure;
}

/** Expert-pass sheets hold fewer kernels than first-look sheets. */
export const EXPERT_KERNELS_PER_SHEET = 12;

/** A stable pseudo-random number for an id, for shuffling and spot checks. */
export function mix(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * Sends the batch's unclassified kernels to the classifier. Kernels already
 * classified keep their verdicts, so a retry after a failure only re-sends
 * what is missing.
 */
export async function classifyBatch(
  ctx: AppContext,
  batchId: string,
  /** False when more steps follow (second opinion, triage): the batch stays busy. */
  done = true,
): Promise<boolean> {
  await setBatch(ctx, batchId, { status: "classifying", error: null });
  const todo = await ctx.db
    .select()
    .from(kernels)
    .where(and(eq(kernels.batchId, batchId), isNull(kernels.aiClass)))
    .orderBy(asc(kernels.number));
  const failure = await classifyKernels(ctx, batchId, todo, {
    kind: "classify",
    save: (verdicts) => saveVerdicts(ctx, batchId, verdicts),
  });
  if (failure) {
    await setBatch(ctx, batchId, {
      status: "failed",
      error: `Classification incomplete: ${failure}. Retry to classify the remaining kernels.`,
    });
    return false;
  }
  if (done) await setBatch(ctx, batchId, { status: "classified", error: null });
  return true;
}

export async function markClassified(ctx: AppContext, batchId: string) {
  await setBatch(ctx, batchId, { status: "classified", error: null });
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

/** Size of a sample's sound kernels (length, breadth, L/B), from the photos. */
export async function dimensionsFor(ctx: AppContext, sampleId: string) {
  const rows = await ctx.db
    .select({ lengthMm: kernels.lengthMm, widthMm: kernels.widthMm })
    .from(kernels)
    .where(
      and(
        eq(kernels.sampleId, sampleId),
        sql`${effectiveClass} = 'sound'`,
        isNotNull(kernels.lengthMm),
      ),
    );
  return summarizeDimensions(rows);
}

/** Batches still being processed in the background for a sample. */
export async function busyBatches(ctx: AppContext, sampleId: string) {
  await expireStaleBatches(ctx, { sampleId });
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

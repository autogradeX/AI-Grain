import {
  estimateFromObjects,
  gradeSample,
  massPercentages,
  type ClassDef,
  type GradeResult,
  type GradeSpec,
  type MassEstimate,
  type MassPercentages,
  type Measurement,
  type RunBreakdown,
} from "@ai-grain/core";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context.js";
import {
  kernels,
  samples,
  standards,
  type SampleResult,
} from "../../db/schema.js";
import { notFound } from "../../lib/errors.js";
import { effectiveClass } from "../batches/service.js";
import { ensureCrop } from "../crops/service.js";

export type SampleRow = typeof samples.$inferSelect;

export async function loadSample(
  ctx: AppContext,
  orgId: string,
  id: string,
): Promise<SampleRow> {
  const [row] = await ctx.db
    .select()
    .from(samples)
    .where(and(eq(samples.id, id), eq(samples.orgId, orgId)));
  if (!row) throw notFound("Sample");
  return row;
}

export function measurementOf(sample: SampleRow): Measurement | null {
  if (sample.sampleMassG === null) return null;
  return {
    sampleMassG: sample.sampleMassG,
    cupMassG: sample.cupMassG,
    moisturePct: sample.moisturePct ?? undefined,
    testWeightKgPerHl: sample.testWeightKgPerHl ?? undefined,
  };
}

/** The grade for these percentages under the standard's grades, with moisture and test weight from the sample. */
export function gradeFor(
  percentages: MassPercentages,
  sample: SampleRow,
  grades: readonly GradeSpec[] | null,
): GradeResult {
  return grades?.length
    ? gradeSample(
        {
          percentages,
          moisturePct: sample.moisturePct ?? undefined,
          testWeightKgPerHl: sample.testWeightKgPerHl ?? undefined,
        },
        grades,
      )
    : { grade: null, failures: {} };
}

function toResult(
  p: MassPercentages,
  grade: GradeResult,
  source: "weighed" | "estimate",
): SampleResult {
  return {
    source,
    byClassPct: p.byClass,
    byGroupPct: p.byGroup,
    totalDefectsPct: p.totalDefectsPct,
    purityPct: p.purityPct,
    grade,
    computedAt: new Date().toISOString(),
  };
}

/** Mass % per class from the scale, and the grade under the sample's standard if it has one. */
export function computeResult(
  sample: SampleRow,
  classes: readonly ClassDef[],
  grades: readonly GradeSpec[] | null,
): SampleResult | null {
  const m = measurementOf(sample);
  if (!m) return null;
  const percentages = massPercentages(m, classes);
  return toResult(
    percentages,
    gradeFor(percentages, sample, grades),
    "weighed",
  );
}

/** The photo estimate for a sample, from every detected kernel's class and area. */
export async function estimateFor(
  ctx: AppContext,
  sampleId: string,
  classes: readonly ClassDef[],
): Promise<MassEstimate> {
  const rows = await ctx.db
    .select({ cls: effectiveClass, area: kernels.area })
    .from(kernels)
    .where(eq(kernels.sampleId, sampleId));
  return estimateFromObjects(rows, classes);
}

/**
 * A sample's mass % breakdown for comparing runs: its result when it has
 * one, else the live photo estimate; null when there is neither yet.
 */
export async function breakdownOf(
  ctx: AppContext,
  sample: SampleRow,
): Promise<RunBreakdown | null> {
  if (sample.result) {
    return {
      byClass: sample.result.byClassPct,
      purityPct: sample.result.purityPct ?? 100 - sample.result.totalDefectsPct,
    };
  }
  const crop = await ensureCrop(ctx, sample.orgId, sample.crop);
  const estimate = await estimateFor(ctx, sample.id, crop.classes);
  return estimate.counted > 0
    ? { byClass: estimate.byClass, purityPct: estimate.purityPct }
    : null;
}

/** The estimate as a result, graded, for completing a sample that wasn't weighed. */
export function estimateResult(
  estimate: MassEstimate,
  sample: SampleRow,
  grades: readonly GradeSpec[] | null,
): SampleResult {
  return toResult(estimate, gradeFor(estimate, sample, grades), "estimate");
}

/** Recomputes and stores the weighed result after weights, moisture or the standard change. */
export async function refreshResult(
  ctx: AppContext,
  sampleId: string,
): Promise<SampleRow> {
  const [row] = await ctx.db
    .select({ sample: samples, grades: standards.grades })
    .from(samples)
    .leftJoin(standards, eq(standards.id, samples.standardId))
    .where(eq(samples.id, sampleId));
  if (!row) throw notFound("Sample");
  const crop = await ensureCrop(ctx, row.sample.orgId, row.sample.crop);
  const result = computeResult(row.sample, crop.classes, row.grades);
  const [updated] = await ctx.db
    .update(samples)
    .set({ result, updatedAt: new Date() })
    .where(eq(samples.id, sampleId))
    .returning();
  return updated!;
}

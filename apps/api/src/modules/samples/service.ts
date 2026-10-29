import {
  gradeSample,
  massPercentages,
  type GradeSpec,
  type Measurement,
} from "@ai-grain/core";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context.js";
import { samples, standards, type SampleResult } from "../../db/schema.js";
import { notFound } from "../../lib/errors.js";

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

/** Mass % per class from the scale, and the grade under the sample's standard if it has one. */
export function computeResult(
  sample: SampleRow,
  grades: readonly GradeSpec[] | null,
): SampleResult | null {
  const m = measurementOf(sample);
  if (!m) return null;
  const percentages = massPercentages(m);
  return {
    byClassPct: percentages.byClass,
    totalDefectsPct: percentages.totalDefectsPct,
    grade: grades?.length
      ? gradeSample(
          {
            percentages,
            moisturePct: m.moisturePct,
            testWeightKgPerHl: m.testWeightKgPerHl,
          },
          grades,
        )
      : { grade: null, failures: {} },
    computedAt: new Date().toISOString(),
  };
}

/** Recomputes and stores the result after weights, moisture or the standard change. */
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
  const result = computeResult(row.sample, row.grades);
  const [updated] = await ctx.db
    .update(samples)
    .set({ result, updatedAt: new Date() })
    .where(eq(samples.id, sampleId))
    .returning();
  return updated!;
}

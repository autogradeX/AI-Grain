import type { GrainSample } from "./sample.js";

/**
 * Limits a sample must meet to earn a grade. Grades are checked in order, so
 * list the strictest first. Values are configuration, not built-in standards:
 * supply the limits for the crop and market you grade against.
 */
export interface GradeSpec {
  grade: string;
  maxMoisturePct: number;
  minTestWeightKgPerHl: number;
  maxBrokenKernelsPct: number;
  maxForeignMaterialPct: number;
  maxDamagedKernelsPct: number;
}

export interface GradeResult {
  sampleId: string;
  /** The first grade whose limits the sample meets, or null if none. */
  grade: string | null;
  /** For each grade that was rejected, the limits the sample failed. */
  failures: Record<string, string[]>;
}

export function failedLimits(sample: GrainSample, spec: GradeSpec): string[] {
  const failed: string[] = [];
  if (sample.moisturePct > spec.maxMoisturePct) failed.push("moisture");
  if (sample.testWeightKgPerHl < spec.minTestWeightKgPerHl)
    failed.push("testWeight");
  if (sample.brokenKernelsPct > spec.maxBrokenKernelsPct)
    failed.push("brokenKernels");
  if (sample.foreignMaterialPct > spec.maxForeignMaterialPct)
    failed.push("foreignMaterial");
  if (sample.damagedKernelsPct > spec.maxDamagedKernelsPct)
    failed.push("damagedKernels");
  return failed;
}

export function gradeSample(
  sample: GrainSample,
  specs: readonly GradeSpec[],
): GradeResult {
  const failures: Record<string, string[]> = {};
  for (const spec of specs) {
    const failed = failedLimits(sample, spec);
    if (failed.length === 0) {
      return { sampleId: sample.id, grade: spec.grade, failures };
    }
    failures[spec.grade] = failed;
  }
  return { sampleId: sample.id, grade: null, failures };
}

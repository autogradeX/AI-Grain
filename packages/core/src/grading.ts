import { CLASS_GROUPS, type ClassGroup } from "./classes.js";
import type { MassPercentages } from "./measurement.js";

/**
 * Limits a sample must meet to earn a grade. Grades are checked in order, so
 * list the strictest first. All values are configuration supplied by the
 * caller: this library holds no official standards.
 */
export interface GradeSpec {
  grade: string;
  /** Maximum mass % per defect class id. Classes left out are not limited. */
  maxDefectPct: Partial<Record<string, number>>;
  /** Maximum mass % per defect group. */
  maxGroupPct?: Partial<Record<ClassGroup, number>> | undefined;
  maxTotalDefectsPct?: number | undefined;
  maxMoisturePct?: number | undefined;
  minTestWeightKgPerHl?: number | undefined;
}

export type LimitScope =
  "class" | "group" | "total" | "moisture" | "testWeight";

export interface LimitFailure {
  scope: LimitScope;
  /** Class id or group for those scopes; otherwise the same as scope. */
  limit: string;
  value: number | null;
  allowed: number;
  /** "max" when the value must not exceed `allowed`, "min" when it must reach it. */
  kind: "max" | "min";
}

export interface GradeInput {
  percentages: MassPercentages;
  moisturePct?: number | undefined;
  testWeightKgPerHl?: number | undefined;
}

export interface GradeResult {
  /** The first grade whose limits are all met, or null if none. */
  grade: string | null;
  /** For each rejected grade, the limits the sample failed. */
  failures: Record<string, LimitFailure[]>;
}

/**
 * Limits on moisture or test weight need a measured value. A missing value
 * fails the limit, so a sample is never graded on data it doesn't have.
 */
export function failedLimits(
  input: GradeInput,
  spec: GradeSpec,
): LimitFailure[] {
  const failed: LimitFailure[] = [];
  for (const [cls, allowed] of Object.entries(spec.maxDefectPct)) {
    if (allowed === undefined) continue;
    const value = input.percentages.byClass[cls] ?? 0;
    if (value > allowed)
      failed.push({ scope: "class", limit: cls, value, allowed, kind: "max" });
  }
  for (const group of CLASS_GROUPS) {
    const allowed = spec.maxGroupPct?.[group];
    if (allowed === undefined) continue;
    const value = input.percentages.byGroup[group];
    if (value > allowed)
      failed.push({
        scope: "group",
        limit: group,
        value,
        allowed,
        kind: "max",
      });
  }
  if (
    spec.maxTotalDefectsPct !== undefined &&
    input.percentages.totalDefectsPct > spec.maxTotalDefectsPct
  ) {
    failed.push({
      scope: "total",
      limit: "total",
      value: input.percentages.totalDefectsPct,
      allowed: spec.maxTotalDefectsPct,
      kind: "max",
    });
  }
  if (spec.maxMoisturePct !== undefined) {
    const value = input.moisturePct;
    if (value === undefined || value > spec.maxMoisturePct) {
      failed.push({
        scope: "moisture",
        limit: "moisture",
        value: value ?? null,
        allowed: spec.maxMoisturePct,
        kind: "max",
      });
    }
  }
  if (spec.minTestWeightKgPerHl !== undefined) {
    const value = input.testWeightKgPerHl;
    if (value === undefined || value < spec.minTestWeightKgPerHl) {
      failed.push({
        scope: "testWeight",
        limit: "testWeight",
        value: value ?? null,
        allowed: spec.minTestWeightKgPerHl,
        kind: "min",
      });
    }
  }
  return failed;
}

export function gradeSample(
  input: GradeInput,
  specs: readonly GradeSpec[],
): GradeResult {
  const failures: Record<string, LimitFailure[]> = {};
  for (const spec of specs) {
    const failed = failedLimits(input, spec);
    if (failed.length === 0) return { grade: spec.grade, failures };
    failures[spec.grade] = failed;
  }
  return { grade: null, failures };
}

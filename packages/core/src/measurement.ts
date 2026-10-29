import { CLASS_GROUPS, type ClassDef, type ClassGroup } from "./classes.js";

/** What the operator weighed: the whole working sample and one cup per defect class. */
export interface Measurement {
  sampleMassG: number;
  /** Cup mass in grams per class id. */
  cupMassG: Partial<Record<string, number>>;
  /** From a separate moisture meter, if one was used. */
  moisturePct?: number | undefined;
  /** From a separate test-weight measurement, if one was taken. */
  testWeightKgPerHl?: number | undefined;
}

export interface MassPercentages {
  /** Mass % per defect class id. */
  byClass: Record<string, number>;
  /** Mass % per defect group. */
  byGroup: Record<ClassGroup, number>;
  totalDefectsPct: number;
  /** The sound fraction: 100 − total defects. */
  purityPct: number;
}

export function validateMeasurement(
  m: Measurement,
  classes?: readonly ClassDef[],
): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(m.sampleMassG) || m.sampleMassG <= 0) {
    errors.push("sampleMassG must be a positive number");
  }
  const known = classes ? new Set(classes.map((c) => c.id)) : null;
  let cupTotal = 0;
  for (const [cls, mass] of Object.entries(m.cupMassG)) {
    if (mass === undefined) continue;
    if (known && !known.has(cls)) {
      errors.push(`"${cls}" is not a class of this crop`);
      continue;
    }
    if (!Number.isFinite(mass) || mass < 0) {
      errors.push(`cupMassG.${cls} must be zero or more`);
    } else {
      cupTotal += mass;
    }
  }
  if (errors.length === 0 && cupTotal > m.sampleMassG) {
    errors.push("the cups weigh more than the whole sample");
  }
  if (
    m.moisturePct !== undefined &&
    (!Number.isFinite(m.moisturePct) ||
      m.moisturePct < 0 ||
      m.moisturePct > 100)
  ) {
    errors.push("moisturePct must be between 0 and 100");
  }
  if (
    m.testWeightKgPerHl !== undefined &&
    (!Number.isFinite(m.testWeightKgPerHl) || m.testWeightKgPerHl <= 0)
  ) {
    errors.push("testWeightKgPerHl must be a positive number");
  }
  return errors;
}

/** Sums class percentages into groups, total defects and purity. */
export function summarizePercentages(
  byClass: Record<string, number>,
  classes: readonly ClassDef[],
): MassPercentages {
  const byGroup = Object.fromEntries(CLASS_GROUPS.map((g) => [g, 0])) as Record<
    ClassGroup,
    number
  >;
  const full: Record<string, number> = {};
  let total = 0;
  for (const c of classes) {
    const pct = byClass[c.id] ?? 0;
    full[c.id] = pct;
    byGroup[c.group] += pct;
    total += pct;
  }
  return {
    byClass: full,
    byGroup,
    totalDefectsPct: total,
    purityPct: Math.max(0, 100 - total),
  };
}

/** Mass % per class = cup mass ÷ sample mass × 100. Classes with no cup count as 0. */
export function massPercentages(
  m: Measurement,
  classes: readonly ClassDef[],
): MassPercentages {
  const byClass: Record<string, number> = {};
  for (const c of classes)
    byClass[c.id] = ((m.cupMassG[c.id] ?? 0) / m.sampleMassG) * 100;
  return summarizePercentages(byClass, classes);
}

export function roundPct(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

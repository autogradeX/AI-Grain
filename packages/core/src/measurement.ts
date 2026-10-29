import { DEFECT_CLASSES, type DefectClass } from "./classes.js";

/** What the operator weighed: the whole working sample and one cup per defect class. */
export interface Measurement {
  sampleMassG: number;
  cupMassG: Partial<Record<DefectClass, number>>;
  /** From a separate moisture meter, if one was used. */
  moisturePct?: number | undefined;
  /** From a separate test-weight measurement, if one was taken. */
  testWeightKgPerHl?: number | undefined;
}

export interface MassPercentages {
  byClass: Record<DefectClass, number>;
  totalDefectsPct: number;
}

export function validateMeasurement(m: Measurement): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(m.sampleMassG) || m.sampleMassG <= 0) {
    errors.push("sampleMassG must be a positive number");
  }
  let cupTotal = 0;
  for (const cls of DEFECT_CLASSES) {
    const mass = m.cupMassG[cls];
    if (mass === undefined) continue;
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

/** Mass % per class = cup mass ÷ sample mass × 100. Classes with no cup count as 0. */
export function massPercentages(m: Measurement): MassPercentages {
  const byClass = {} as Record<DefectClass, number>;
  let total = 0;
  for (const cls of DEFECT_CLASSES) {
    const pct = ((m.cupMassG[cls] ?? 0) / m.sampleMassG) * 100;
    byClass[cls] = pct;
    total += pct;
  }
  return { byClass, totalDefectsPct: total };
}

export function roundPct(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

import { DEFECT_CLASSES, type DefectClass } from "./classes.js";

/** One sample graded both ways: by this method and by a certified grader. */
export interface ComparisonPair {
  method: Partial<Record<DefectClass, number>>;
  reference: Partial<Record<DefectClass, number>>;
  methodGrade?: string | null | undefined;
  referenceGrade?: string | null | undefined;
}

export interface ClassAgreement {
  cls: DefectClass;
  n: number;
  meanMethodPct: number;
  meanReferencePct: number;
  /** Mean of method − reference. Positive means the method reads high. */
  meanBiasPct: number;
  meanAbsDiffPct: number;
  maxAbsDiffPct: number;
}

export interface ValidationSummary {
  samples: number;
  byClass: ClassAgreement[];
  /** Share of samples (0–1) where both grades are known and match, or null if none are comparable. */
  gradeAgreement: number | null;
  gradeComparable: number;
}

export function summarizeValidation(
  pairs: readonly ComparisonPair[],
): ValidationSummary {
  const byClass: ClassAgreement[] = [];
  for (const cls of DEFECT_CLASSES) {
    let n = 0;
    let sumMethod = 0;
    let sumRef = 0;
    let sumAbs = 0;
    let maxAbs = 0;
    for (const pair of pairs) {
      const m = pair.method[cls];
      const r = pair.reference[cls];
      if (m === undefined || r === undefined) continue;
      n += 1;
      sumMethod += m;
      sumRef += r;
      const abs = Math.abs(m - r);
      sumAbs += abs;
      maxAbs = Math.max(maxAbs, abs);
    }
    if (n === 0) continue;
    byClass.push({
      cls,
      n,
      meanMethodPct: sumMethod / n,
      meanReferencePct: sumRef / n,
      meanBiasPct: (sumMethod - sumRef) / n,
      meanAbsDiffPct: sumAbs / n,
      maxAbsDiffPct: maxAbs,
    });
  }

  let comparable = 0;
  let agree = 0;
  for (const pair of pairs) {
    if (pair.methodGrade === undefined || pair.referenceGrade === undefined)
      continue;
    comparable += 1;
    if (pair.methodGrade === pair.referenceGrade) agree += 1;
  }

  return {
    samples: pairs.length,
    byClass,
    gradeAgreement: comparable === 0 ? null : agree / comparable,
    gradeComparable: comparable,
  };
}

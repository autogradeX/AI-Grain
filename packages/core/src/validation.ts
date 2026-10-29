/** One sample graded both ways: by this method and by a certified grader. */
export interface ComparisonPair {
  method: Partial<Record<string, number>>;
  reference: Partial<Record<string, number>>;
  methodGrade?: string | null | undefined;
  referenceGrade?: string | null | undefined;
}

export interface ClassAgreement {
  cls: string;
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

/** Compares every class that appears in both results of at least one sample. */
export function summarizeValidation(
  pairs: readonly ComparisonPair[],
): ValidationSummary {
  const classes: string[] = [];
  for (const pair of pairs) {
    for (const cls of Object.keys(pair.reference)) {
      if (pair.method[cls] !== undefined && !classes.includes(cls))
        classes.push(cls);
    }
  }
  const byClass: ClassAgreement[] = [];
  for (const cls of classes) {
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

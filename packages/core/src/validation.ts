/** One sample graded both ways: by this method and by a certified grader. */
export interface ComparisonPair {
  method: Partial<Record<string, number>>;
  reference: Partial<Record<string, number>>;
  methodGrade?: string | null | undefined;
  referenceGrade?: string | null | undefined;
  /** Instrument readings here and at the lab (moisture, protein, oil). */
  methodMeasurements?:
    Partial<Record<LabMeasurement, number | undefined>> | undefined;
  referenceMeasurements?:
    Partial<Record<LabMeasurement, number | undefined>> | undefined;
}

export const LAB_MEASUREMENTS = ["moisture", "protein", "oil"] as const;
export type LabMeasurement = (typeof LAB_MEASUREMENTS)[number];

/** How close counts as agreeing with the lab, in percentage points. */
export interface Tolerances {
  classPct: number;
  moisture: number;
  protein: number;
  oil: number;
}

/** Default tolerances: a lab can set its own (tenders often state them). */
export const DEFAULT_TOLERANCES: Tolerances = {
  classPct: 1,
  moisture: 0.5,
  protein: 0.5,
  oil: 0.5,
};

export interface MeasurementAgreement {
  field: LabMeasurement;
  n: number;
  meanBias: number;
  meanAbsDiff: number;
  maxAbsDiff: number;
  /** Share of samples (0–1) within the tolerance. */
  withinTolerance: number;
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
  /** Share of samples (0–1) within the class tolerance of the reference. */
  withinTolerance: number;
}

export interface ValidationSummary {
  samples: number;
  byClass: ClassAgreement[];
  /** Share of samples (0–1) where both grades are known and match, or null if none are comparable. */
  gradeAgreement: number | null;
  gradeComparable: number;
  /** Moisture, protein and oil against the lab, where both were measured. */
  measurements: MeasurementAgreement[];
  tolerances: Tolerances;
}

/** Compares every class that appears in both results of at least one sample. */
export function summarizeValidation(
  pairs: readonly ComparisonPair[],
  tolerances: Tolerances = DEFAULT_TOLERANCES,
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
    let within = 0;
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
      if (abs <= tolerances.classPct + 1e-9) within += 1;
    }
    byClass.push({
      cls,
      n,
      meanMethodPct: sumMethod / n,
      meanReferencePct: sumRef / n,
      meanBiasPct: (sumMethod - sumRef) / n,
      meanAbsDiffPct: sumAbs / n,
      maxAbsDiffPct: maxAbs,
      withinTolerance: within / n,
    });
  }

  const measurements: MeasurementAgreement[] = [];
  for (const field of LAB_MEASUREMENTS) {
    const diffs = pairs.flatMap((p) => {
      const m = p.methodMeasurements?.[field];
      const r = p.referenceMeasurements?.[field];
      return m === undefined || r === undefined ? [] : [m - r];
    });
    if (!diffs.length) continue;
    const abs = diffs.map(Math.abs);
    measurements.push({
      field,
      n: diffs.length,
      meanBias: diffs.reduce((a, b) => a + b, 0) / diffs.length,
      meanAbsDiff: abs.reduce((a, b) => a + b, 0) / abs.length,
      maxAbsDiff: Math.max(...abs),
      withinTolerance:
        abs.filter((d) => d <= tolerances[field] + 1e-9).length / abs.length,
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
    measurements,
    tolerances,
  };
}

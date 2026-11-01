/**
 * Repeatability: how closely two runs of the same physical sample agree.
 *
 * Agreement is the share of mass the two runs put in the same class:
 * 100 − ½ Σ |a − b| over every class, sound included. 100 % means identical
 * breakdowns; two runs that disagree on 1 % of the mass agree at 99 %.
 */

export interface RunComparison {
  agreementPct: number;
  /** The largest difference in any one class, in percentage points. */
  maxDiffPct: number;
  /** The class with that difference ("sound" for purity). */
  maxDiffClass: string | null;
  /** Difference in purity, in percentage points. */
  purityDiffPct: number;
}

/** A run's breakdown: defect classes' mass %, and purity. */
export interface RunBreakdown {
  byClass: Record<string, number>;
  purityPct: number;
}

export function compareRuns(a: RunBreakdown, b: RunBreakdown): RunComparison {
  const ids = new Set([...Object.keys(a.byClass), ...Object.keys(b.byClass)]);
  let total = Math.abs(a.purityPct - b.purityPct);
  let maxDiff = total;
  let maxClass: string | null = total > 0 ? "sound" : null;
  for (const id of ids) {
    const d = Math.abs((a.byClass[id] ?? 0) - (b.byClass[id] ?? 0));
    total += d;
    if (d > maxDiff) {
      maxDiff = d;
      maxClass = id;
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    agreementPct: round(Math.max(0, 100 - total / 2)),
    maxDiffPct: round(maxDiff),
    maxDiffClass: maxClass,
    purityDiffPct: round(a.purityPct - b.purityPct),
  };
}

/** Bands used to report repeatability (as tenders score it). */
export type RepeatabilityBand = "99+" | "97-99" | "95-97" | "below95";

export function repeatabilityBand(agreementPct: number): RepeatabilityBand {
  if (agreementPct >= 99) return "99+";
  if (agreementPct >= 97) return "97-99";
  if (agreementPct >= 95) return "95-97";
  return "below95";
}

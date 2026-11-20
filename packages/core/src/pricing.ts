import type { ClassGroup } from "./classes.js";
import type { MassPercentages } from "./measurement.js";

/*
 * Quality to price: what a buyer pays for a lot, from its grade and figures.
 * Every number here is the buyer's or the organisation's own configuration
 * (a base price, a price per grade, deductions above free allowances); this
 * library holds no official rates.
 */

/** What a deduction is measured on. */
export type PriceScope =
  "moisture" | "totalDefects" | "class" | "group" | "protein" | "oil";

export interface PriceDeduction {
  scope: PriceScope;
  /** Class id or group, for those scopes. */
  key?: string | undefined;
  /**
   * The free allowance: for moisture, defects, classes and groups the
   * deduction applies to each point above it; for protein and oil, to each
   * point below it (a minimum the buyer expects).
   */
  allowance: number;
  /** Per percentage point beyond the allowance. */
  rate: number;
  /** "amount": currency per unit per point. "percent": % of the price per point. */
  mode: "amount" | "percent";
  /** A label for slips and reports; the scope's name when empty. */
  label?: string | undefined;
}

export interface PriceRules {
  currency: string;
  /** The unit the prices are per, as shown: "quintal", "tonne", "kg". */
  unit: string;
  /** The price for a lot with no grade-specific price. */
  basePrice: number;
  /** Price per grade, overriding the base price. */
  gradePrices?: Partial<Record<string, number>> | undefined;
  /** No price for lots that meet no grade (the buyer rejects them). */
  rejectUngraded?: boolean | undefined;
  deductions: PriceDeduction[];
}

export interface PriceInput {
  grade: string | null;
  percentages: Pick<MassPercentages, "byClass" | "byGroup" | "totalDefectsPct">;
  moisturePct?: number | null | undefined;
  proteinPct?: number | null | undefined;
  oilPct?: number | null | undefined;
}

export interface PriceLine {
  scope: PriceScope;
  key?: string | undefined;
  label?: string | undefined;
  value: number;
  /** Points beyond the allowance. */
  points: number;
  /** Currency per unit taken off (positive). */
  amount: number;
}

export interface PriceQuote {
  currency: string;
  unit: string;
  /** The price before deductions (the grade's or the base price). */
  start: number;
  lines: PriceLine[];
  /** The price per unit after deductions, never below 0; null when rejected. */
  price: number | null;
  /** Why there is no price. */
  rejected?: "ungraded" | undefined;
  /** Deductions that need a value the sample doesn't have (not applied). */
  missing: { scope: PriceScope; key?: string | undefined }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function valueOf(input: PriceInput, d: PriceDeduction): number | null {
  switch (d.scope) {
    case "moisture":
      return input.moisturePct ?? null;
    case "protein":
      return input.proteinPct ?? null;
    case "oil":
      return input.oilPct ?? null;
    case "totalDefects":
      return input.percentages.totalDefectsPct;
    case "class":
      return d.key ? (input.percentages.byClass[d.key] ?? 0) : null;
    case "group":
      return d.key
        ? (input.percentages.byGroup[d.key as ClassGroup] ?? 0)
        : null;
  }
}

/** The price per unit for a sample under a buyer's rules. */
export function quotePrice(input: PriceInput, rules: PriceRules): PriceQuote {
  const start = round2(
    (input.grade !== null ? rules.gradePrices?.[input.grade] : undefined) ??
      rules.basePrice,
  );
  const quote: PriceQuote = {
    currency: rules.currency,
    unit: rules.unit,
    start,
    lines: [],
    price: null,
    missing: [],
  };
  if (input.grade === null && rules.rejectUngraded) {
    quote.rejected = "ungraded";
    return quote;
  }
  let total = 0;
  for (const d of rules.deductions) {
    const value = valueOf(input, d);
    if (value === null) {
      quote.missing.push({ scope: d.scope, key: d.key });
      continue;
    }
    const minimum = d.scope === "protein" || d.scope === "oil";
    const points = Math.max(
      0,
      minimum ? d.allowance - value : value - d.allowance,
    );
    if (points <= 0) continue;
    const amount = round2(
      d.mode === "percent" ? (start * d.rate * points) / 100 : d.rate * points,
    );
    if (amount <= 0) continue;
    total += amount;
    quote.lines.push({
      scope: d.scope,
      key: d.key,
      label: d.label,
      value: round2(value),
      points: round2(points),
      amount,
    });
  }
  quote.price = Math.max(0, round2(start - total));
  return quote;
}

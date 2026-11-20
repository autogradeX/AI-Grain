import { describe, expect, it } from "vitest";
import { quotePrice, type PriceRules } from "../src/index.js";

const rules: PriceRules = {
  currency: "INR",
  unit: "quintal",
  basePrice: 2000,
  gradePrices: { A: 2400, B: 2200 },
  rejectUngraded: true,
  deductions: [
    // 1 % of the price for each point of moisture above 12 %.
    { scope: "moisture", allowance: 12, rate: 1, mode: "percent" },
    // ₹10 per point of broken grains above 2 %.
    { scope: "class", key: "broken", allowance: 2, rate: 10, mode: "amount" },
    // ₹25 per point of protein below 11 %.
    { scope: "protein", allowance: 11, rate: 25, mode: "amount" },
  ],
};

const percentages = (broken: number) => ({
  byClass: { broken },
  byGroup: {
    broken_defective: broken,
    admixture: 0,
    impurity: 0,
    harmful: 0,
  },
  totalDefectsPct: broken,
});

describe("quality to price", () => {
  it("starts from the grade's price and takes off each point beyond the allowance", () => {
    const q = quotePrice(
      {
        grade: "B",
        percentages: percentages(4.5),
        moisturePct: 13.5,
        proteinPct: 10.2,
      },
      rules,
    );
    expect(q.start).toBe(2200);
    expect(q.lines.map((l) => [l.scope, l.points, l.amount])).toEqual([
      ["moisture", 1.5, 33],
      ["class", 2.5, 25],
      ["protein", 0.8, 20],
    ]);
    expect(q.price).toBe(2122);
    expect(q.missing).toEqual([]);
  });

  it("takes nothing off within the allowances and uses the base price for other grades", () => {
    const q = quotePrice(
      {
        grade: "C",
        percentages: percentages(1),
        moisturePct: 11,
        proteinPct: 12,
      },
      rules,
    );
    expect(q).toMatchObject({ start: 2000, lines: [], price: 2000 });
  });

  it("rejects ungraded lots when the buyer does, and never applies a deduction without its value", () => {
    expect(
      quotePrice({ grade: null, percentages: percentages(1) }, rules),
    ).toMatchObject({ price: null, rejected: "ungraded" });
    const q = quotePrice({ grade: "A", percentages: percentages(1) }, rules);
    expect(q.price).toBe(2400);
    expect(q.missing.map((m) => m.scope)).toEqual(["moisture", "protein"]);
  });

  it("never goes below zero", () => {
    const q = quotePrice(
      { grade: "A", percentages: percentages(90) },
      {
        ...rules,
        deductions: [
          {
            scope: "class",
            key: "broken",
            allowance: 0,
            rate: 50,
            mode: "amount",
          },
        ],
      },
    );
    expect(q.lines[0]!.amount).toBe(4500);
    expect(q.price).toBe(0);
  });
});

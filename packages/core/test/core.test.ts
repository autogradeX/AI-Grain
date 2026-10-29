import { describe, expect, it } from "vitest";
import {
  gradeSample,
  massPercentages,
  summarizeValidation,
  validateMeasurement,
} from "../src/index.js";
import type { GradeSpec, Measurement } from "../src/index.js";

const specs: GradeSpec[] = [
  {
    grade: "1",
    maxDefectPct: { broken: 2, sprouted: 0.5 },
    maxTotalDefectsPct: 4,
    maxMoisturePct: 14,
  },
  {
    grade: "2",
    maxDefectPct: { broken: 5, sprouted: 1 },
    maxTotalDefectsPct: 8,
  },
];

const measurement: Measurement = {
  sampleMassG: 25,
  cupMassG: { broken: 0.25, sprouted: 0.05, foreign_material: 0.1 },
  moisturePct: 12.5,
};

describe("massPercentages", () => {
  it("divides each cup by the sample mass", () => {
    const pct = massPercentages(measurement);
    expect(pct.byClass.broken).toBeCloseTo(1);
    expect(pct.byClass.sprouted).toBeCloseTo(0.2);
    expect(pct.byClass.shrivelled).toBe(0);
    expect(pct.totalDefectsPct).toBeCloseTo(1.6);
  });
});

describe("validateMeasurement", () => {
  it("accepts a valid measurement", () => {
    expect(validateMeasurement(measurement)).toEqual([]);
  });

  it("rejects cups heavier than the sample", () => {
    expect(
      validateMeasurement({ sampleMassG: 1, cupMassG: { broken: 2 } }),
    ).toEqual(["the cups weigh more than the whole sample"]);
  });

  it("rejects a zero sample mass and negative cups", () => {
    expect(
      validateMeasurement({ sampleMassG: 0, cupMassG: { broken: -1 } }),
    ).toEqual([
      "sampleMassG must be a positive number",
      "cupMassG.broken must be zero or more",
    ]);
  });
});

describe("gradeSample", () => {
  it("assigns the strictest grade whose limits are met", () => {
    const result = gradeSample(
      { percentages: massPercentages(measurement), moisturePct: 12.5 },
      specs,
    );
    expect(result).toEqual({ grade: "1", failures: {} });
  });

  it("fails a moisture limit when moisture was not measured", () => {
    const result = gradeSample(
      { percentages: massPercentages(measurement) },
      specs,
    );
    expect(result.grade).toBe("2");
    expect(result.failures["1"]).toEqual([
      { limit: "moisture", value: null, allowed: 14, kind: "max" },
    ]);
  });

  it("returns null when no grade is met", () => {
    const result = gradeSample(
      {
        percentages: massPercentages({
          sampleMassG: 25,
          cupMassG: { broken: 2.5 },
        }),
      },
      specs,
    );
    expect(result.grade).toBeNull();
    expect(result.failures["2"]?.map((f) => f.limit)).toEqual([
      "broken",
      "total",
    ]);
  });
});

describe("summarizeValidation", () => {
  it("reports bias and agreement per class", () => {
    const summary = summarizeValidation([
      {
        method: { broken: 2 },
        reference: { broken: 1.5 },
        methodGrade: "1",
        referenceGrade: "1",
      },
      {
        method: { broken: 1 },
        reference: { broken: 2 },
        methodGrade: "1",
        referenceGrade: "2",
      },
    ]);
    expect(summary.samples).toBe(2);
    expect(summary.gradeAgreement).toBe(0.5);
    expect(summary.byClass).toHaveLength(1);
    const broken = summary.byClass[0];
    expect(broken?.meanBiasPct).toBeCloseTo(-0.25);
    expect(broken?.meanAbsDiffPct).toBeCloseTo(0.75);
    expect(broken?.maxAbsDiffPct).toBeCloseTo(1);
  });
});

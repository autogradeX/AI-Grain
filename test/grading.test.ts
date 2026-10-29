import { describe, expect, it } from "vitest";
import { gradeSample, validateSample } from "../src/index.js";
import type { GradeSpec, GrainSample } from "../src/index.js";

const specs: GradeSpec[] = [
  {
    grade: "A",
    maxMoisturePct: 13,
    minTestWeightKgPerHl: 78,
    maxBrokenKernelsPct: 2,
    maxForeignMaterialPct: 0.5,
    maxDamagedKernelsPct: 1,
  },
  {
    grade: "B",
    maxMoisturePct: 14.5,
    minTestWeightKgPerHl: 74,
    maxBrokenKernelsPct: 5,
    maxForeignMaterialPct: 1,
    maxDamagedKernelsPct: 3,
  },
];

const sample: GrainSample = {
  id: "s-1",
  crop: "wheat",
  moisturePct: 12.5,
  testWeightKgPerHl: 79,
  brokenKernelsPct: 1,
  foreignMaterialPct: 0.2,
  damagedKernelsPct: 0.5,
};

describe("gradeSample", () => {
  it("assigns the strictest grade the sample meets", () => {
    expect(gradeSample(sample, specs)).toEqual({
      sampleId: "s-1",
      grade: "A",
      failures: {},
    });
  });

  it("falls through to a lower grade and records why", () => {
    const result = gradeSample({ ...sample, moisturePct: 14 }, specs);
    expect(result.grade).toBe("B");
    expect(result.failures).toEqual({ A: ["moisture"] });
  });

  it("returns null when no grade is met", () => {
    const result = gradeSample(
      { ...sample, moisturePct: 20, foreignMaterialPct: 3 },
      specs,
    );
    expect(result.grade).toBeNull();
    expect(result.failures.B).toEqual(["moisture", "foreignMaterial"]);
  });
});

describe("validateSample", () => {
  it("accepts a valid sample", () => {
    expect(validateSample(sample)).toEqual([]);
  });

  it("rejects out-of-range values", () => {
    expect(
      validateSample({ ...sample, moisturePct: 120, testWeightKgPerHl: 0 }),
    ).toEqual([
      "moisturePct must be between 0 and 100",
      "testWeightKgPerHl must be a positive number",
    ]);
  });
});

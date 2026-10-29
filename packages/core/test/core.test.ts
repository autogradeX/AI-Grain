import { describe, expect, it } from "vitest";
import {
  CROP_PRESETS,
  classLabel,
  gradeSample,
  kernelClassIds,
  massPercentages,
  presetFor,
  slugifyClassId,
  summarizeValidation,
  validateClasses,
  validateMeasurement,
} from "../src/index.js";
import type { ClassDef, GradeSpec, Measurement } from "../src/index.js";

const classes = CROP_PRESETS.wheat!.classes;

const specs: GradeSpec[] = [
  {
    grade: "1",
    maxDefectPct: { broken: 2, sprouted: 0.5 },
    maxGroupPct: { harmful: 0.1 },
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
  cupMassG: { broken: 0.25, sprouted: 0.05, stones: 0.1 },
  moisturePct: 12.5,
};

describe("crop presets", () => {
  it("covers the five crops with valid class lists", () => {
    expect(Object.keys(CROP_PRESETS)).toEqual([
      "wheat",
      "barley",
      "oats",
      "rapeseed",
      "hemp",
    ]);
    for (const preset of Object.values(CROP_PRESETS)) {
      expect(validateClasses(preset.classes)).toEqual([]);
      const groups = new Set(preset.classes.map((c) => c.group));
      expect(groups).toEqual(
        new Set(["admixture", "broken_defective", "impurity", "harmful"]),
      );
    }
  });

  it("keeps the ids of the original wheat classes", () => {
    const ids = classes.map((c) => c.id);
    for (const old of [
      "broken",
      "shrivelled",
      "sprouted",
      "heat_damaged",
      "insect_damaged",
      "fusarium_mould",
      "black_point",
      "other_grain",
      "foreign_material",
    ]) {
      expect(ids).toContain(old);
    }
  });

  it("gives unknown crops the general cereal list", () => {
    const millet = presetFor("millet");
    expect(millet.label).toBe("Millet");
    expect(millet.classes.length).toBeGreaterThan(10);
    // A copy: editing it must not change the preset.
    millet.classes.pop();
    expect(presetFor("wheat").classes).toHaveLength(classes.length);
  });

  it("names classes and lists kernel ids", () => {
    expect(classLabel(classes, "insect_damaged")).toBe("Pest-damaged");
    expect(classLabel(classes, "sound")).toBe("Sound");
    expect(kernelClassIds(classes)[0]).toBe("sound");
    expect(kernelClassIds(classes).at(-1)).toBe("unclear");
  });
});

describe("validateClasses", () => {
  it("rejects reserved, duplicate and malformed ids", () => {
    const bad: ClassDef[] = [
      { id: "sound", label: "Sound", group: "impurity" },
      { id: "Bad Id", label: "x", group: "impurity" },
      { id: "dup", label: "a", group: "harmful" },
      { id: "dup", label: "b", group: "harmful" },
    ];
    const errors = validateClasses(bad);
    expect(errors.join("\n")).toMatch(/reserved/);
    expect(errors.join("\n")).toMatch(/lower-case/);
    expect(errors.join("\n")).toMatch(/used twice/);
  });

  it("slugifies labels into ids", () => {
    expect(slugifyClassId("Pest-damaged kernels")).toBe("pest_damaged_kernels");
    expect(slugifyClassId("2nd grade")).toBe("c_2nd_grade");
  });
});

describe("massPercentages", () => {
  it("divides each cup by the sample mass and sums groups", () => {
    const pct = massPercentages(measurement, classes);
    expect(pct.byClass.broken).toBeCloseTo(1);
    expect(pct.byClass.sprouted).toBeCloseTo(0.2);
    expect(pct.byClass.shrivelled).toBe(0);
    expect(pct.byGroup.broken_defective).toBeCloseTo(1.2);
    expect(pct.byGroup.impurity).toBeCloseTo(0.4);
    expect(pct.totalDefectsPct).toBeCloseTo(1.6);
    expect(pct.purityPct).toBeCloseTo(98.4);
  });
});

describe("validateMeasurement", () => {
  it("accepts a valid measurement", () => {
    expect(validateMeasurement(measurement, classes)).toEqual([]);
  });

  it("rejects cups heavier than the sample, and unknown classes", () => {
    expect(
      validateMeasurement({ sampleMassG: 1, cupMassG: { broken: 2 } }, classes),
    ).toEqual(["the cups weigh more than the whole sample"]);
    expect(
      validateMeasurement({ sampleMassG: 10, cupMassG: { gold: 1 } }, classes),
    ).toEqual(['"gold" is not a class of this crop']);
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
      { percentages: massPercentages(measurement, classes), moisturePct: 12.5 },
      specs,
    );
    expect(result).toEqual({ grade: "1", failures: {} });
  });

  it("fails a moisture limit when moisture was not measured", () => {
    const result = gradeSample(
      { percentages: massPercentages(measurement, classes) },
      specs,
    );
    expect(result.grade).toBe("2");
    expect(result.failures["1"]).toEqual([
      {
        scope: "moisture",
        limit: "moisture",
        value: null,
        allowed: 14,
        kind: "max",
      },
    ]);
  });

  it("checks group limits", () => {
    const result = gradeSample(
      {
        percentages: massPercentages(
          { sampleMassG: 25, cupMassG: { ergot: 0.05 } },
          classes,
        ),
        moisturePct: 12,
      },
      specs,
    );
    expect(result.grade).toBe("2");
    expect(result.failures["1"]?.[0]).toMatchObject({
      scope: "group",
      limit: "harmful",
    });
  });

  it("returns null when no grade is met", () => {
    const result = gradeSample(
      {
        percentages: massPercentages(
          { sampleMassG: 25, cupMassG: { broken: 2.5 } },
          classes,
        ),
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

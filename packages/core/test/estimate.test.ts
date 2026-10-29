import { describe, expect, it } from "vitest";
import { estimateFromObjects, type ClassDef } from "../src/index.js";

const classes: ClassDef[] = [
  { id: "broken", label: "Broken", group: "broken_defective" },
  { id: "stones", label: "Stones", group: "impurity", massFactor: 2 },
];

describe("estimateFromObjects", () => {
  it("weights objects by area^1.5 and mass factor", () => {
    const e = estimateFromObjects(
      [
        { cls: "sound", area: 100 }, // weight 1000
        { cls: "sound", area: 100 }, // 1000
        { cls: "broken", area: 100 }, // 1000
        { cls: "stones", area: 100 }, // 1000 × 2
      ],
      classes,
    );
    expect(e.byClass.broken).toBeCloseTo(20);
    expect(e.byClass.stones).toBeCloseTo(40);
    expect(e.byGroup.impurity).toBeCloseTo(40);
    expect(e.purityPct).toBeCloseTo(40);
    expect(e.countByClass).toEqual({ sound: 2, broken: 1, stones: 1 });
  });

  it("leaves unclear and unclassified objects out", () => {
    const e = estimateFromObjects(
      [
        { cls: "sound", area: 100 },
        { cls: "broken", area: 100 },
        { cls: "unclear", area: 900 },
        { cls: null, area: 900 },
      ],
      classes,
    );
    expect(e.byClass.broken).toBeCloseTo(50);
    expect(e).toMatchObject({
      objects: 4,
      counted: 2,
      unclear: 1,
      unclassified: 1,
    });
  });

  it("returns zeros when nothing is classified", () => {
    const e = estimateFromObjects([{ cls: null, area: 10 }], classes);
    expect(e.totalDefectsPct).toBe(0);
    expect(e.counted).toBe(0);
  });
});

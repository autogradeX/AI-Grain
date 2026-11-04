import { describe, expect, it } from "vitest";
import { summarizeValidation } from "../src/index.js";

describe("validation against a reference lab", () => {
  it("counts samples within tolerance, and compares moisture, protein and oil", () => {
    const s = summarizeValidation(
      [
        {
          method: { broken: 3.4 },
          reference: { broken: 3 },
          methodMeasurements: { moisture: 12.4, protein: 11.2 },
          referenceMeasurements: { moisture: 12.1, protein: 12 },
        },
        {
          method: { broken: 5 },
          reference: { broken: 3.5 },
          methodMeasurements: { moisture: 13 },
          referenceMeasurements: { moisture: 13.2 },
        },
        { method: { broken: 2 }, reference: { broken: 2 } },
      ],
      { classPct: 1, moisture: 0.5, protein: 0.5, oil: 0.5 },
    );
    expect(s.byClass[0]!.withinTolerance).toBeCloseTo(2 / 3);
    const moisture = s.measurements.find((m) => m.field === "moisture")!;
    expect(moisture.n).toBe(2);
    expect(moisture.meanBias).toBeCloseTo(0.05);
    expect(moisture.withinTolerance).toBe(1);
    const protein = s.measurements.find((m) => m.field === "protein")!;
    expect(protein).toMatchObject({ n: 1, withinTolerance: 0 });
    expect(protein.meanBias).toBeCloseTo(-0.8);
    expect(s.measurements.some((m) => m.field === "oil")).toBe(false);
  });
});

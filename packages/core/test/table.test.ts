import { describe, expect, it } from "vitest";
import { parseTable, readMeasurements } from "../src/index.js";

describe("instrument tables", () => {
  it("reads commas, semicolons with decimal commas, tabs and quotes", () => {
    expect(parseTable('a,b\n1,"x, y"\n')).toEqual([
      ["a", "b"],
      ["1", "x, y"],
    ]);
    expect(parseTable("a;b\r\n1;12,5\r\n")).toEqual([
      ["a", "b"],
      ["1", "12,5"],
    ]);
    expect(parseTable("\uFEFFa\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("finds sample, lot and values by their usual column names", () => {
    const { rows, columns } = readMeasurements(
      [
        "Sample No.;e-NAM Lot ID;Crude Protein (%DM);Oil Content;Moisture %;Operator",
        "12;;11,8;;12,4;Asha",
        ";CG-RAI-77;;41,2;7,9;Asha",
        "13;;;;;Asha",
        ";;10;;;Asha",
        "14;;150;;;Asha",
      ].join("\n"),
    );
    expect(columns).toEqual([
      "Crude Protein (%DM)",
      "Oil Content",
      "Moisture %",
    ]);
    expect(rows[0]).toEqual({
      line: 2,
      sampleNumber: 12,
      lotId: null,
      values: { protein: 11.8, moisture: 12.4 },
    });
    expect(rows[1]).toMatchObject({
      lotId: "CG-RAI-77",
      values: { oil: 41.2, moisture: 7.9 },
    });
    expect(rows[2]!.error).toBe("No values");
    expect(rows[3]!.error).toBe("No sample number or lot ID");
    expect(rows[4]!.error).toMatch(/outside/);
  });

  it("says what is missing from the header", () => {
    expect(() => readMeasurements("Protein\n12")).toThrow(/Sample/);
    expect(() => readMeasurements("Sample,Operator\n1,A")).toThrow(/Protein/);
  });
});

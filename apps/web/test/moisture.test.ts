import { describe, expect, it } from "vitest";
import { parseMoistureLine } from "../src/devices/moisture";

describe("moisture meter lines", () => {
  it("reads the moisture from the layouts meters print", () => {
    expect(parseMoistureLine("MOISTURE: 13.4 %")).toBe(13.4);
    expect(parseMoistureLine("Moist 13,4%")).toBe(13.4);
    expect(parseMoistureLine("M=12.8")).toBe(12.8);
    expect(parseMoistureLine("13.4%  T=27.1C")).toBe(13.4);
    expect(parseMoistureLine("Wheat,13.4,27.1C")).toBe(13.4);
    expect(parseMoistureLine("Temp 27.1 C   Moisture 14.2 %")).toBe(14.2);
    expect(parseMoistureLine("Paddy  17.25  76.5 kg/hl")).toBe(17.25);
  });

  it("ignores lines without a moisture value", () => {
    expect(parseMoistureLine("")).toBeNull();
    expect(parseMoistureLine("Temp 27.1 C")).toBeNull();
    expect(parseMoistureLine("Calibration: PADDY")).toBeNull();
    expect(parseMoistureLine("Sample 12")).toBeNull();
    expect(parseMoistureLine("99.5 %")).toBeNull();
  });
});

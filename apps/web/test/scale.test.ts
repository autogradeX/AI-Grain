import { describe, expect, it } from "vitest";
import { parseScaleLine } from "../src/devices/scale";

describe("scale readings", () => {
  it("reads the common balance formats in grams", () => {
    expect(parseScaleLine("ST,GS,+  12.345 g")).toEqual({
      grams: 12.345,
      stable: true,
    });
    expect(parseScaleLine("S S     50.12 g")).toEqual({
      grams: 50.12,
      stable: true,
    });
    expect(parseScaleLine("+0.0523kg")).toEqual({ grams: 52.3, stable: true });
    expect(parseScaleLine("   7,5 g")).toEqual({ grams: 7.5, stable: true });
  });

  it("marks unstable readings and ignores lines without a weight", () => {
    expect(parseScaleLine("US,GS,+  12.301 g")?.stable).toBe(false);
    expect(parseScaleLine("S D     12.3 g")?.stable).toBe(false);
    expect(parseScaleLine("OK")).toBeNull();
    expect(parseScaleLine("")).toBeNull();
  });
});

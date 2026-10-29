import { describe, expect, it } from "vitest";
import { niceTicks } from "../src/components/charts";

describe("niceTicks", () => {
  it("rounds the axis up to a clean step", () => {
    expect(niceTicks(7.3)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(0.37, 3)).toEqual([0, 0.2, 0.4]);
  });

  it("keeps counts on whole numbers", () => {
    expect(niceTicks(1, 4, true)).toEqual([0, 1]);
    expect(niceTicks(3, 4, true)).toEqual([0, 1, 2, 3]);
  });

  it("handles an all-zero series", () => {
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});

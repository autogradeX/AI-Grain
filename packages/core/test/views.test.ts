import { describe, expect, it } from "vitest";
import { matchViews } from "../src/index.js";

/** Small repeatable random numbers. */
function rand(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

describe("matching two views of the same kernels", () => {
  for (const [turn, label] of [
    [0, "the same way round"],
    [0.5, "turned by 90°"],
    [1, "turned by 180°"],
  ] as const) {
    it(`pairs kernels when the bottom camera sees them ${label}, smaller and shifted`, () => {
      const r = rand(7 + turn * 10);
      const top = Array.from({ length: 150 }, () => ({
        x: 100 + r() * 1800,
        y: 100 + r() * 2600,
      }));
      // The bottom camera: another zoom, turn and position, a little noise.
      const angle = turn * Math.PI + 0.03;
      const scale = 0.8;
      const toBottom = (p: { x: number; y: number }) => ({
        x:
          (Math.cos(-angle) * (p.x - 900) - Math.sin(-angle) * (p.y - 1300)) /
            scale +
          700 +
          (r() - 0.5) * 6,
        y:
          (Math.sin(-angle) * (p.x - 900) + Math.cos(-angle) * (p.y - 1300)) /
            scale +
          1200 +
          (r() - 0.5) * 6,
      });
      // Each camera misses a few kernels the other sees.
      const shown = top
        .map((p, i) => ({ p: toBottom(p), i }))
        .filter((_, i) => i % 17 !== 3);
      const topSeen = top.filter((_, i) => i % 23 !== 5);
      const topIndex = top.map((_, i) => i).filter((i) => i % 23 !== 5);
      const m = matchViews(
        topSeen,
        shown.map((s) => s.p),
        40,
      );
      const right = m.pairs.filter(
        ([ti, bi]) => topIndex[ti] === shown[bi]!.i,
      ).length;
      expect(m.pairs.length).toBeGreaterThan(130);
      // A kernel the other camera missed can now and then pair with a
      // neighbour the first camera missed: rare, never most.
      expect(right / m.pairs.length).toBeGreaterThan(0.98);
      expect(m.share).toBeGreaterThan(0.9);
      expect(m.transform.scale).toBeCloseTo(scale, 1);
    });
  }

  it("finds nothing to pair between unrelated photos", () => {
    const r = rand(3);
    const a = Array.from({ length: 80 }, () => ({
      x: r() * 2000,
      y: r() * 2800,
    }));
    const b = Array.from({ length: 80 }, () => ({
      x: r() * 2000,
      y: r() * 2800,
    }));
    expect(matchViews(a, b, 15).share).toBeLessThan(0.5);
  });
});

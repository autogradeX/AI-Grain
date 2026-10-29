export interface Pt {
  x: number;
  y: number;
}

/** 3×3 matrix in row-major order, with h[8] = 1. */
export type Homography = number[];

/** Solves for H such that H·from[i] ≈ to[i] for four point pairs. */
export function homography(from: readonly Pt[], to: readonly Pt[]): Homography {
  if (from.length !== 4 || to.length !== 4) {
    throw new Error("homography needs exactly four point pairs");
  }
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i] as Pt;
    const { x: u, y: v } = to[i] as Pt;
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return [...solve(a, b), 1];
}

export function apply(h: Homography, x: number, y: number): Pt {
  const w = (h[6] as number) * x + (h[7] as number) * y + (h[8] as number);
  return {
    x: ((h[0] as number) * x + (h[1] as number) * y + (h[2] as number)) / w,
    y: ((h[3] as number) * x + (h[4] as number) * y + (h[5] as number)) / w,
  };
}

/** Gaussian elimination with partial pivoting. */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i] as number]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(m[pivot]![col]!) < 1e-12) {
      throw new Error("Corner points are degenerate (three or more in a line)");
    }
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const pr = m[col]!;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const row = m[r]!;
      const f = row[col]! / pr[col]!;
      for (let c = col; c <= n; c++) row[c]! -= f * pr[c]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

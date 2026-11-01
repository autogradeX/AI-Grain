/** Size of a sample's sound kernels, measured in the board photos. */
export interface DimensionSummary {
  /** Kernels measured. */
  kernels: number;
  meanLengthMm: number;
  meanBreadthMm: number;
  /** Mean of each kernel's length / breadth. */
  meanLb: number;
  sdLengthMm: number;
  sdBreadthMm: number;
  minLengthMm: number;
  maxLengthMm: number;
}

const round = (n: number, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/** Mean, spread and range of kernel sizes; null when nothing was measured. */
export function summarizeDimensions(
  kernels: readonly { lengthMm: number | null; widthMm: number | null }[],
): DimensionSummary | null {
  const measured = kernels.filter(
    (k): k is { lengthMm: number; widthMm: number } =>
      k.lengthMm !== null && k.widthMm !== null && k.widthMm > 0,
  );
  const n = measured.length;
  if (!n) return null;
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const sd = (v: number[], m: number) =>
    v.length > 1
      ? Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1))
      : 0;
  const lengths = measured.map((k) => k.lengthMm);
  const breadths = measured.map((k) => k.widthMm);
  const ml = mean(lengths);
  const mb = mean(breadths);
  return {
    kernels: n,
    meanLengthMm: round(ml),
    meanBreadthMm: round(mb),
    meanLb: round(mean(measured.map((k) => k.lengthMm / k.widthMm))),
    sdLengthMm: round(sd(lengths, ml)),
    sdBreadthMm: round(sd(breadths, mb)),
    minLengthMm: round(Math.min(...lengths)),
    maxLengthMm: round(Math.max(...lengths)),
  };
}

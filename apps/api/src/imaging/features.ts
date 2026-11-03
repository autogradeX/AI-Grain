import sharp from "sharp";

/**
 * Measurements of one kernel's crop for the local model: colour, texture
 * and shape, by classic image processing. The kernel is the object at the
 * centre of the tile, told from the background (the tile's edge) by its
 * contrast in brightness and colour.
 *
 * Every tile of a batch covers the same window, so shapes in tile pixels are
 * comparable within a batch; sizes across photos come from the kernel's
 * measured area and length instead (see modelFeatures).
 */

/** Names of the values `cropFeatures` returns, in order. */
export const CROP_FEATURES = [
  "fill", // object area / tile area
  "elongation", // major / minor axis
  "rectangularity", // area / (major × minor) of the oriented box
  "roughness", // perimeter² / (4π area): 1 for a disc, higher when jagged
  "meanL",
  "meanA", // red–green
  "meanB", // yellow–blue
  "sdL",
  "sdA",
  "sdB",
  "p10L",
  "p50L",
  "p90L",
  "darkShare", // pixels much darker than the kernel's median
  "brightShare", // pixels much brighter (chalky, white)
  "saturation",
  "hue0",
  "hue1",
  "hue2",
  "hue3",
  "hue4",
  "hue5",
  "gradMean",
  "gradSd",
  "edgeShare",
  "contrastL", // kernel vs background brightness
  "contrastB", // kernel vs background yellow–blue
] as const;

const N = CROP_FEATURES.length;

function median(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[s.length >> 1]!;
}

function percentile(sorted: Float64Array, p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
}

/** Measures the kernel in a crop tile (JPEG). Zeros when nothing stands out at the centre. */
export async function cropFeatures(jpeg: Buffer): Promise<number[]> {
  const { data, info } = await sharp(jpeg)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const n = w * h;
  const L = new Float64Array(n);
  const A = new Float64Array(n);
  const B = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 3]!;
    const g = data[i * 3 + 1]!;
    const b = data[i * 3 + 2]!;
    L[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    A[i] = r - g;
    B[i] = (r + g) / 2 - b;
  }
  // The background: the median along the tile's edge.
  const edge = { l: [] as number[], a: [] as number[], b: [] as number[] };
  const addEdge = (i: number) => {
    edge.l.push(L[i]!);
    edge.a.push(A[i]!);
    edge.b.push(B[i]!);
  };
  for (let x = 0; x < w; x++) {
    addEdge(x);
    addEdge((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    addEdge(y * w);
    addEdge(y * w + w - 1);
  }
  const bgL = median(edge.l);
  const bgA = median(edge.a);
  const bgB = median(edge.b);
  const contrast = new Float64Array(n);
  let maxC = 0;
  for (let i = 0; i < n; i++) {
    const dl = L[i]! - bgL;
    const da = A[i]! - bgA;
    const db = B[i]! - bgB;
    contrast[i] = Math.sqrt(dl * dl + 2.25 * (da * da + db * db));
    if (contrast[i]! > maxC) maxC = contrast[i]!;
  }
  // Object: above a third of the strongest contrast (at least 20), connected to the centre.
  const level = Math.max(20, maxC * 0.35);
  const cx = w >> 1;
  const cy = h >> 1;
  let start = -1;
  let best = Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (contrast[i]! <= level) continue;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d < best) {
        best = d;
        start = i;
      }
    }
  }
  if (start < 0) return new Array<number>(N).fill(0);
  const mask = new Uint8Array(n);
  const stack = [start];
  mask[start] = 1;
  const pix: number[] = [];
  while (stack.length) {
    const i = stack.pop()!;
    pix.push(i);
    const x = i % w;
    for (const j of [
      x > 0 ? i - 1 : -1,
      x < w - 1 ? i + 1 : -1,
      i - w,
      i + w,
    ]) {
      if (j >= 0 && j < n && !mask[j] && contrast[j]! > level) {
        mask[j] = 1;
        stack.push(j);
      }
    }
  }
  const area = pix.length;

  // Shape: principal axes from second moments, perimeter from edge pixels.
  let mx = 0;
  let my = 0;
  for (const i of pix) {
    mx += i % w;
    my += Math.floor(i / w);
  }
  mx /= area;
  my /= area;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let perimeter = 0;
  for (const i of pix) {
    const dx = (i % w) - mx;
    const dy = Math.floor(i / w) - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
    const x = i % w;
    if (
      x === 0 ||
      x === w - 1 ||
      !mask[i - 1] ||
      !mask[i + 1] ||
      !mask[i - w] ||
      !mask[i + w]
    )
      perimeter++;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let minA = Infinity;
  let maxA = -Infinity;
  let minB = Infinity;
  let maxB = -Infinity;
  for (const i of pix) {
    const dx = (i % w) - mx;
    const dy = Math.floor(i / w) - my;
    const a = dx * ux + dy * uy;
    const b = -dx * uy + dy * ux;
    if (a < minA) minA = a;
    if (a > maxA) maxA = a;
    if (b < minB) minB = b;
    if (b > maxB) maxB = b;
  }
  const major = Math.max(1, maxA - minA + 1);
  const minor = Math.max(1, maxB - minB + 1);

  // Colour inside the object.
  const ls = new Float64Array(area);
  let sL = 0;
  let sA = 0;
  let sB = 0;
  let sat = 0;
  const hue = new Array<number>(6).fill(0);
  pix.forEach((i, k) => {
    ls[k] = L[i]!;
    sL += L[i]!;
    sA += A[i]!;
    sB += B[i]!;
    const r = data[i * 3]!;
    const g = data[i * 3 + 1]!;
    const b = data[i * 3 + 2]!;
    const mxc = Math.max(r, g, b);
    const mnc = Math.min(r, g, b);
    const s = mxc ? (mxc - mnc) / mxc : 0;
    sat += s;
    if (mxc !== mnc) {
      let hh: number;
      if (mxc === r) hh = ((g - b) / (mxc - mnc) + 6) % 6;
      else if (mxc === g) hh = (b - r) / (mxc - mnc) + 2;
      else hh = (r - g) / (mxc - mnc) + 4;
      hue[Math.min(5, Math.floor(hh))]! += s;
    }
  });
  const mL = sL / area;
  const mA = sA / area;
  const mB = sB / area;
  let vL = 0;
  let vA = 0;
  let vB = 0;
  for (const i of pix) {
    vL += (L[i]! - mL) ** 2;
    vA += (A[i]! - mA) ** 2;
    vB += (B[i]! - mB) ** 2;
  }
  ls.sort();
  const p50 = percentile(ls, 0.5);
  let dark = 0;
  let bright = 0;
  for (const v of ls) {
    if (v < p50 - 25) dark++;
    if (v > p50 + 25) bright++;
  }
  const hueTotal = hue.reduce((a, b) => a + b, 0) || 1;

  // Texture: brightness gradient (Sobel) inside the object.
  let gSum = 0;
  let gSq = 0;
  let edges = 0;
  let gN = 0;
  for (const i of pix) {
    const x = i % w;
    const y = Math.floor(i / w);
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
    const gx =
      L[i - w + 1]! +
      2 * L[i + 1]! +
      L[i + w + 1]! -
      L[i - w - 1]! -
      2 * L[i - 1]! -
      L[i + w - 1]!;
    const gy =
      L[i + w - 1]! +
      2 * L[i + w]! +
      L[i + w + 1]! -
      L[i - w - 1]! -
      2 * L[i - w]! -
      L[i - w + 1]!;
    const g = Math.sqrt(gx * gx + gy * gy) / 4;
    gSum += g;
    gSq += g * g;
    if (g > 15) edges++;
    gN++;
  }
  const gMean = gN ? gSum / gN : 0;

  return [
    area / n,
    major / minor,
    area / (major * minor),
    (perimeter * perimeter) / (4 * Math.PI * area),
    mL,
    mA,
    mB,
    Math.sqrt(vL / area),
    Math.sqrt(vA / area),
    Math.sqrt(vB / area),
    percentile(ls, 0.1),
    p50,
    percentile(ls, 0.9),
    dark / area,
    bright / area,
    sat / area,
    ...hue.map((v) => v / hueTotal),
    gMean,
    gN ? Math.sqrt(Math.max(0, gSq / gN - gMean * gMean)) : 0,
    gN ? edges / gN : 0,
    mL - bgL,
    mB - bgB,
  ].map((v) => (Number.isFinite(v) ? Math.round(v * 10000) / 10000 : 0));
}

/** What the model sees for one kernel: its crop's measurements, plus size and colour relative to its photo. */
export interface KernelForModel {
  features: number[];
  area: number;
  lengthMm: number | null;
  widthMm: number | null;
  isCluster: boolean;
}

/** Names of the values `modelFeatures` returns, in order. */
export const MODEL_FEATURES = [
  ...CROP_FEATURES,
  "relArea", // area / the photo's median kernel area
  "relLength",
  "relWidth",
  "relL", // brightness vs the photo's median kernel
  "relA",
  "relB",
  "cluster",
] as const;

/**
 * Turns a photo's kernels into model inputs. Sizes and colours are taken
 * relative to the photo's typical kernel, so the model works across photos,
 * lighting and scales (with or without the board).
 */
export function modelFeatures(batch: KernelForModel[]): number[][] {
  const iL = CROP_FEATURES.indexOf("meanL");
  const iA = CROP_FEATURES.indexOf("meanA");
  const iB = CROP_FEATURES.indexOf("meanB");
  const singles = batch.filter((k) => !k.isCluster && k.features.length === N);
  const med = (f: (k: KernelForModel) => number | null) =>
    median(singles.map(f).filter((v): v is number => v !== null && v > 0)) || 1;
  const area = med((k) => k.area);
  const length = med((k) => k.lengthMm);
  const width = med((k) => k.widthMm);
  const colour = (i: number) => median(singles.map((k) => k.features[i]!));
  const cL = colour(iL);
  const cA = colour(iA);
  const cB = colour(iB);
  return batch.map((k) => {
    const f =
      k.features.length === N ? k.features : new Array<number>(N).fill(0);
    return [
      ...f,
      k.area / area,
      k.lengthMm ? k.lengthMm / length : 1,
      k.widthMm ? k.widthMm / width : 1,
      f[iL]! - cL,
      f[iA]! - cA,
      f[iB]! - cB,
      k.isCluster ? 1 : 0,
    ];
  });
}

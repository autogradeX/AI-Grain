import { BOARD_PX_PER_CM, cellAt, rawToSharp, type RawImage } from "./board.js";

/** Detection runs on a downscaled board: faster, and it smooths out printed grid lines. */
const DETECT_PX_PER_CM = 25;
const SCALE = BOARD_PX_PER_CM / DETECT_PX_PER_CM;

export interface DetectOptions {
  /** Smallest object to keep, in cm². Smaller blobs are dust or grid noise. */
  minAreaCm2?: number;
  /** Erosion radius in detection pixels, to remove thin grid lines before labelling. */
  openingRadius?: number;
  /** Larger bright areas are not kernels: usually table showing past a misplaced corner. */
  maxAreaCm2?: number;
}

/** How much brighter than the board a pixel must be to count as an object. */
const MIN_CONTRAST = 30;

export interface DetectedKernel {
  /** 1-based, in reading order: row by row, left to right. */
  number: number;
  /** Bounding box in straightened-board pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Area in straightened-board pixels. */
  area: number;
  cell: string;
  isCluster: boolean;
}

export interface Detection {
  kernels: DetectedKernel[];
  threshold: number;
  medianArea: number;
  /** Bright regions too large to be kernels, which were left out. */
  ignoredLargeRegions: number;
}

/**
 * Finds kernels on a dark board by classic image processing: grayscale,
 * Otsu threshold, morphological opening, connected components. Counting
 * stays out of the language model, which is unreliable at exact counts of
 * many small objects.
 */
export async function detectKernels(
  board: RawImage,
  options: DetectOptions = {},
): Promise<Detection> {
  const minAreaCm2 = options.minAreaCm2 ?? 0.02;
  const radius = options.openingRadius ?? 1;

  const width = Math.round(board.width / SCALE);
  const height = Math.round(board.height / SCALE);
  const gray = await rawToSharp(board)
    .resize(width, height, { kernel: "linear" })
    .grayscale()
    .raw()
    .toBuffer();

  // Otsu alone splits the board from the *light* kernels and misses dark ones
  // (heat damage, black point), which are the defects that matter most. Cap the
  // threshold at a fixed contrast above the board, which covers most of the image.
  const background = median(gray);
  const threshold = Math.min(otsu(gray), background + MIN_CONTRAST);
  let mask: Uint8Array = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) mask[i] = gray[i]! > threshold ? 1 : 0;
  if (radius > 0) {
    mask = dilate(erode(mask, width, height, radius), width, height, radius);
  }

  const cm2 = DETECT_PX_PER_CM * DETECT_PX_PER_CM;
  const minArea = minAreaCm2 * cm2;
  const maxArea = (options.maxAreaCm2 ?? 4) * cm2;
  const labels = new Int32Array(width * height);
  const all = label(mask, width, height, labels);
  const found = all.filter((b) => b.area >= minArea && b.area <= maxArea);
  const ignoredLargeRegions = all.filter((b) => b.area > maxArea).length;

  const areas = found.map((b) => b.area).sort((a, b) => a - b);
  const medianArea = areas.length ? areas[Math.floor(areas.length / 2)]! : 0;
  const enough = areas.length >= 5;
  const isLarge = (b: Blob) => enough && b.area > medianArea * 2.2;

  // Touching kernels: separate them where they meet, so each is counted,
  // classified and weighed on its own. Two touching kernels are only about
  // twice a kernel's area, so anything clearly larger than one is tried.
  const blobs = found.flatMap((b) =>
    enough && b.area > medianArea * 1.5
      ? (splitTouching(labels, width, b, medianArea, minArea) ?? [b])
      : [b],
  );

  const kernels = blobs
    .map((b) => {
      const x = Math.max(0, Math.round(b.minX * SCALE));
      const y = Math.max(0, Math.round(b.minY * SCALE));
      const w = Math.min(
        board.width - x,
        Math.round((b.maxX - b.minX + 1) * SCALE),
      );
      const h = Math.min(
        board.height - y,
        Math.round((b.maxY - b.minY + 1) * SCALE),
      );
      return {
        x,
        y,
        w,
        h,
        area: Math.round(b.area * SCALE * SCALE),
        cell: cellAt(x + w / 2, y + h / 2),
        row: Math.floor((y + h / 2) / BOARD_PX_PER_CM),
        cx: x + w / 2,
        isCluster: isLarge(b),
      };
    })
    .sort((a, b) => a.row - b.row || a.cx - b.cx)
    .map(({ row: _row, cx: _cx, ...k }, i) => ({ number: i + 1, ...k }));

  return {
    kernels,
    threshold,
    medianArea: Math.round(medianArea * SCALE * SCALE),
    ignoredLargeRegions,
  };
}

/** Median gray level. The board covers most of the image, so this is the board's brightness. */
function median(gray: Uint8Array | Buffer): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of gray) hist[v]!++;
  let seen = 0;
  for (let i = 0; i < 256; i++) {
    seen += hist[i]!;
    if (seen * 2 >= gray.length) return i;
  }
  return 255;
}

/** Otsu's method: the threshold that best separates the histogram into two classes. */
export function otsu(gray: Uint8Array | Buffer): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of gray) hist[v]!++;
  const total = gray.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i]!;
  let sumBg = 0;
  let weightBg = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    weightBg += hist[t]!;
    if (weightBg === 0) continue;
    const weightFg = total - weightBg;
    if (weightFg === 0) break;
    sumBg += t * hist[t]!;
    const meanBg = sumBg / weightBg;
    const meanFg = (sumAll - sumBg) / weightFg;
    const between = weightBg * weightFg * (meanBg - meanFg) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Square min-filter, done as a horizontal then a vertical pass. */
function erode(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return filter(filter(m, w, h, r, true, 1), w, h, r, false, 1);
}

function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return filter(filter(m, w, h, r, true, 0), w, h, r, false, 0);
}

/** For erosion (`keep` = 1) a pixel stays set only if all neighbours are set; for dilation (`keep` = 0) it is set if any is. */
function filter(
  m: Uint8Array,
  w: number,
  h: number,
  r: number,
  horizontal: boolean,
  keep: 0 | 1,
): Uint8Array {
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let value = keep;
      for (let d = -r; d <= r; d++) {
        const nx = horizontal ? x + d : x;
        const ny = horizontal ? y : y + d;
        const v = nx < 0 || ny < 0 || nx >= w || ny >= h ? 0 : m[ny * w + nx]!;
        if (keep === 1 && v === 0) {
          value = 0;
          break;
        }
        if (keep === 0 && v === 1) {
          value = 1;
          break;
        }
      }
      out[y * w + x] = value;
    }
  }
  return out;
}

interface Blob {
  /** Label in the label map. */
  id: number;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * 8-connected component labelling with an explicit stack. Writes each
 * pixel's blob id (from 1) into `labels` when given.
 */
function label(
  mask: Uint8Array,
  w: number,
  h: number,
  labels?: Int32Array,
): Blob[] {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const blobs: Blob[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const blob: Blob = {
      id: blobs.length + 1,
      area: 0,
      minX: w,
      minY: h,
      maxX: 0,
      maxY: 0,
    };
    while (top > 0) {
      const i = stack[--top]!;
      if (labels) labels[i] = blob.id;
      const x = i % w;
      const y = (i - x) / w;
      blob.area++;
      if (x < blob.minX) blob.minX = x;
      if (x > blob.maxX) blob.maxX = x;
      if (y < blob.minY) blob.minY = y;
      if (y > blob.maxY) blob.maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (mask[j] && !seen[j]) {
            seen[j] = 1;
            stack[top++] = j;
          }
        }
      }
    }
    blobs.push(blob);
  }
  return blobs;
}

/**
 * Distance from each set pixel to the nearest unset pixel (or the edge), by
 * a two-pass 3-4 chamfer transform: close to Euclidean, in pixels.
 */
function distanceMap(m: Uint8Array, w: number, h: number): Float32Array {
  const big = 1e9;
  const d = new Float32Array(m.length);
  for (let i = 0; i < m.length; i++) d[i] = m[i] ? big : 0;
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(
        d[i],
        at(x - 1, y) + 3,
        at(x, y - 1) + 3,
        at(x - 1, y - 1) + 4,
        at(x + 1, y - 1) + 4,
      );
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(
        d[i],
        at(x + 1, y) + 3,
        at(x, y + 1) + 3,
        at(x + 1, y + 1) + 4,
        at(x - 1, y + 1) + 4,
      );
    }
  }
  for (let i = 0; i < d.length; i++) d[i] = d[i]! / 3;
  return d;
}

/**
 * Separates touching kernels in one large blob: finds the level of its
 * distance map at which it falls apart into kernel-sized cores (the narrow
 * necks where kernels touch go first), then grows each core back over the
 * blob's pixels (nearest core wins). Returns null when it doesn't come apart
 * cleanly; the blob then stays one object.
 */
export function splitTouching(
  labels: Int32Array,
  width: number,
  blob: Blob,
  medianArea: number,
  minArea: number,
): Blob[] | null {
  const bw = blob.maxX - blob.minX + 1;
  const bh = blob.maxY - blob.minY + 1;
  const sub = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (labels[(blob.minY + y) * width + blob.minX + x] === blob.id)
        sub[y * bw + x] = 1;
    }
  }
  const dist = distanceMap(sub, bw, bh);
  let peak = 0;
  for (const v of dist) if (v > peak) peak = v;
  // The level that gives the most cores (ties: the lowest level).
  let best: { seeds: Int32Array; count: number } | null = null;
  const core = new Uint8Array(bw * bh);
  for (let level = 1; level < peak - 0.5; level += 0.5) {
    for (let i = 0; i < core.length; i++) core[i] = dist[i]! > level ? 1 : 0;
    const seeds = new Int32Array(bw * bh);
    const cores = label(core, bw, bh, seeds).filter(
      (c) => c.area >= Math.max(3, medianArea * 0.03),
    );
    if (cores.length < 2) continue;
    if (best && cores.length <= best.count) continue;
    // Keep only the cores that passed the size filter, renumbered 1..n.
    const keep = new Map(cores.map((c, i) => [c.id, i + 1]));
    for (let i = 0; i < seeds.length; i++) seeds[i] = keep.get(seeds[i]!) ?? 0;
    best = { seeds, count: cores.length };
  }
  if (!best) return null;

  // Grow the cores back over the blob, breadth first (4-connected).
  const owner = best.seeds;
  let frontier: number[] = [];
  for (let i = 0; i < owner.length; i++) if (owner[i]) frontier.push(i);
  while (frontier.length) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % bw;
      for (const j of [
        x > 0 ? i - 1 : -1,
        x < bw - 1 ? i + 1 : -1,
        i - bw,
        i + bw,
      ]) {
        if (j >= 0 && j < owner.length && sub[j] && !owner[j]) {
          owner[j] = owner[i]!;
          next.push(j);
        }
      }
    }
    frontier = next;
  }
  const parts = Array.from({ length: best.count }, (_, i) => ({
    id: blob.id,
    area: 0,
    minX: bw,
    minY: bh,
    maxX: 0,
    maxY: 0,
    n: i + 1,
  }));
  for (let i = 0; i < owner.length; i++) {
    const n = owner[i]!;
    if (!n) continue;
    const p = parts[n - 1]!;
    const x = i % bw;
    const y = (i - x) / bw;
    p.area++;
    if (x < p.minX) p.minX = x;
    if (x > p.maxX) p.maxX = x;
    if (y < p.minY) p.minY = y;
    if (y > p.maxY) p.maxY = y;
  }
  // Every part must look like (part of) a kernel, not a sliver.
  if (parts.some((p) => p.area < Math.max(minArea, medianArea * 0.3)))
    return null;
  return parts.map((p) => ({
    id: blob.id,
    area: p.area,
    minX: blob.minX + p.minX,
    minY: blob.minY + p.minY,
    maxX: blob.minX + p.maxX,
    maxY: blob.minY + p.maxY,
  }));
}

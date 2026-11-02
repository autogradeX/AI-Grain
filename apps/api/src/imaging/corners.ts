import { applyHomography as apply, homography } from "@ai-grain/core";
import sharp from "sharp";
import type { Corners } from "../db/schema.js";
import { GRID_COLS, GRID_ROWS } from "./board.js";
import { otsu } from "./detect.js";

/**
 * Finds the grid's four outer corners in a board photo, so nobody has to mark
 * them by hand. Classic image processing:
 *
 * 1. The board is the largest dark region (Otsu threshold, connected
 *    components) on a downscaled grey copy.
 * 2. Its four extreme points give a first quadrilateral.
 * 3. That quadrilateral is straightened at low resolution, and the outermost
 *    printed grid lines (columns and rows that are light along their whole
 *    length) move the corners from the card's edge onto the grid.
 *
 * Returns null when no plausible board is found; the operator then marks the
 * corners as before.
 */

const WORK_SIZE = 1600;
/** Region finding runs smaller and median-filtered, so grid lines don't split the board. */
const MASK_SIZE = 420;
const WARP_W = 600;
const WARP_H = Math.round((WARP_W * GRID_ROWS) / GRID_COLS);

interface Gray {
  data: Uint8Array;
  width: number;
  height: number;
}

type Pt = { x: number; y: number };

async function grayscale(jpeg: Buffer): Promise<Gray & { scale: number }> {
  const meta = await sharp(jpeg).metadata();
  const longSide = Math.max(meta.width ?? 1, meta.height ?? 1);
  const scale = Math.min(1, WORK_SIZE / longSide);
  const { data, info } = await sharp(jpeg)
    .resize({
      width: Math.round((meta.width ?? 1) * scale),
      height: Math.round((meta.height ?? 1) * scale),
    })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8Array(data.buffer, data.byteOffset, data.length),
    width: info.width,
    height: info.height,
    scale,
  };
}

/** The largest 4-connected region of `mask`, as a list of pixel indexes. */
function largestRegion(mask: Uint8Array, width: number) {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  let best: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const region: number[] = [];
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    while (top > 0) {
      const i = stack[--top]!;
      region.push(i);
      const x = i % width;
      const neighbours = [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        i - width,
        i + width,
      ];
      for (const n of neighbours) {
        if (n >= 0 && n < mask.length && mask[n] && !seen[n]) {
          seen[n] = 1;
          stack[top++] = n;
        }
      }
    }
    if (region.length > best.length) best = region;
  }
  return best;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

function quadArea(q: Pt[]): number {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % 4]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

function bilinear(img: Gray, fx: number, fy: number): number {
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  if (x0 < 0 || y0 < 0 || x0 + 1 >= img.width || y0 + 1 >= img.height)
    return -1;
  const dx = fx - x0;
  const dy = fy - y0;
  const i = y0 * img.width + x0;
  const d = img.data;
  return (
    (d[i]! * (1 - dx) + d[i + 1]! * dx) * (1 - dy) +
    (d[i + img.width]! * (1 - dx) + d[i + img.width + 1]! * dx) * dy
  );
}

/**
 * Position (0–1) of the first and last printed grid line in a profile of
 * per-column (or per-row) medians: the outermost peaks that sit on the
 * evenly spaced lattice of `cells + 1` lines. Null when there is no clear
 * lattice (then the dark region's edge is used).
 */
function outerLines(profile: number[], cells: number): [number, number] | null {
  const n = profile.length;
  const sorted = profile.filter((v) => v >= 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const base = sorted[Math.floor(sorted.length / 2)]!;
  const high = sorted[Math.floor(sorted.length * 0.98)]!;
  if (high - base < 8) return null;
  const threshold = base + (high - base) * 0.4;
  // Centres of runs above the threshold.
  const peaks: number[] = [];
  for (let i = 0; i < n;) {
    if (profile[i]! >= threshold) {
      let j = i;
      while (j + 1 < n && profile[j + 1]! >= threshold) j++;
      peaks.push((i + j) / 2);
      i = j + 1;
    } else i++;
  }
  if (peaks.length < cells * 0.6) return null;
  const gaps = peaks
    .slice(1)
    .map((p, i) => p - peaks[i]!)
    .filter((g) => g > n / (cells * 3));
  if (!gaps.length) return null;
  const spacing = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!;
  // The lattice phase that most peaks agree with.
  let best: number[] = [];
  for (const ref of peaks) {
    const inliers = peaks.filter((p) => {
      const k = (p - ref) / spacing;
      return Math.abs(k - Math.round(k)) < 0.2;
    });
    if (inliers.length > best.length) best = inliers;
  }
  let first = best[0]!;
  let last = best.at(-1)!;
  let lines = Math.round((last - first) / spacing) + 1;
  if (Math.abs(lines - (cells + 1)) > 2) return null;
  // Border lines can blur into the region's edge: add missing lines on the
  // side that has room for them.
  while (lines < cells + 1) {
    const roomBefore = first;
    const roomAfter = n - 1 - last;
    if (Math.max(roomBefore, roomAfter) < spacing * 0.6) break;
    if (roomBefore >= roomAfter) first = Math.max(0, first - spacing);
    else last = Math.min(n - 1, last + spacing);
    lines++;
  }
  return [first / (n - 1), last / (n - 1)];
}

const median = (values: number[]) => {
  const v = values.filter((x) => x >= 0).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)]! : -1;
};

async function maskImage(img: Gray) {
  const scale = MASK_SIZE / Math.max(img.width, img.height);
  const { data, info } = await sharp(Buffer.from(img.data), {
    raw: { width: img.width, height: img.height, channels: 1 },
  })
    .resize({
      width: Math.round(img.width * scale),
      height: Math.round(img.height * scale),
    })
    .median(5)
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8Array(data.buffer, data.byteOffset, data.length),
    width: info.width,
    height: info.height,
    // Mask pixels to work-image pixels.
    up: img.width / info.width,
  };
}

export interface FoundBoard {
  corners: Corners;
  /**
   * The printed grid lines were found, so the corners sit on the 1 cm grid
   * and sizes in mm are right. False: only a dark area of board-like shape.
   */
  grid: boolean;
}

export async function findGridCorners(
  jpeg: Buffer,
): Promise<FoundBoard | null> {
  const img = await grayscale(jpeg);
  const small = await maskImage(img);
  const { width, height } = small;
  const threshold = otsu(small.data);
  const mask = new Uint8Array(small.data.length);
  for (let i = 0; i < mask.length; i++)
    mask[i] = small.data[i]! < threshold ? 1 : 0;
  const region = largestRegion(mask, width);
  if (region.length < width * height * 0.12) return null;

  // Extreme points along the diagonals: top-left, top-right, bottom-right, bottom-left.
  let tl = region[0]!;
  let tr = tl;
  let br = tl;
  let bl = tl;
  const score = (i: number) => {
    const x = i % width;
    const y = (i - x) / width;
    return { s: x + y, d: x - y };
  };
  for (const i of region) {
    const { s, d } = score(i);
    if (s < score(tl).s) tl = i;
    if (s > score(br).s) br = i;
    if (d > score(tr).d) tr = i;
    if (d < score(bl).d) bl = i;
  }
  // Centre of the extreme mask pixel, in work-image pixels.
  const pt = (i: number): Pt => ({
    x: ((i % width) + 0.5) * small.up,
    y: (Math.floor(i / width) + 0.5) * small.up,
  });
  let quad = [pt(tl), pt(tr), pt(br), pt(bl)];

  // A landscape board: start at the corner that makes the long sides the 28 cm ones.
  const horizontal = dist(quad[0]!, quad[1]!) + dist(quad[3]!, quad[2]!);
  const vertical = dist(quad[0]!, quad[3]!) + dist(quad[1]!, quad[2]!);
  if (horizontal > vertical) quad = [quad[3]!, quad[0]!, quad[1]!, quad[2]!];

  // Plausibility: a convex, mostly filled quadrilateral of board-like shape.
  const area = quadArea(quad) / (small.up * small.up);
  const ratio =
    (dist(quad[0]!, quad[3]!) + dist(quad[1]!, quad[2]!)) /
    (dist(quad[0]!, quad[1]!) + dist(quad[3]!, quad[2]!));
  if (area < region.length * 0.85 || area > region.length * 2) return null;
  if (ratio < 1.1 || ratio > 1.9) return null;

  // Straighten the quadrilateral and look for the outermost grid lines.
  const h = homography(
    [
      { x: 0, y: 0 },
      { x: WARP_W, y: 0 },
      { x: WARP_W, y: WARP_H },
      { x: 0, y: WARP_H },
    ],
    quad,
  );
  const warp = new Float32Array(WARP_W * WARP_H);
  for (let y = 0; y < WARP_H; y++) {
    for (let x = 0; x < WARP_W; x++) {
      const p = apply(h, x + 0.5, y + 0.5);
      warp[y * WARP_W + x] = bilinear(img, p.x - 0.5, p.y - 0.5);
    }
  }
  const colProfile: number[] = [];
  for (let x = 0; x < WARP_W; x++) {
    const col: number[] = [];
    for (let y = 0; y < WARP_H; y += 2) col.push(warp[y * WARP_W + x]!);
    colProfile.push(median(col));
  }
  const rowProfile: number[] = [];
  for (let y = 0; y < WARP_H; y++) {
    const row: number[] = [];
    for (let x = 0; x < WARP_W; x += 2) row.push(warp[y * WARP_W + x]!);
    rowProfile.push(median(row));
  }
  const cols = outerLines(colProfile, GRID_COLS);
  const rows = outerLines(rowProfile, GRID_ROWS);
  const [x0, x1] = cols ?? [0, 1];
  const [y0, y1] = rows ?? [0, 1];

  const back = (u: number, v: number) => {
    const p = apply(h, u * WARP_W, v * WARP_H);
    return { x: p.x / img.scale, y: p.y / img.scale };
  };
  return {
    corners: [back(x0, y0), back(x1, y0), back(x1, y1), back(x0, y1)],
    // One axis is enough (a tilted or partly shaded board may hide the other).
    grid: cols !== null || rows !== null,
  };
}

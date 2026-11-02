import { BOARD_PX_PER_CM, rawToSharp, type RawImage } from "./board.js";
import { dilate, erode } from "./detect.js";

/**
 * Kernel length and breadth from the straightened board, at full resolution
 * (0.1 mm per pixel). Classic image processing: the kernel's pixels are the
 * bright connected region at its centre; its main axis comes from the
 * region's second moments, and length and breadth are its extents along and
 * across that axis (what a grader measures with callipers).
 */

export interface Gray {
  data: Uint8Array;
  width: number;
  height: number;
}

export async function boardGray(board: RawImage): Promise<Gray> {
  const data = await rawToSharp(board).grayscale().raw().toBuffer();
  return {
    data: new Uint8Array(data.buffer, data.byteOffset, data.length),
    width: board.width,
    height: board.height,
  };
}

const MM_PER_PX = 10 / BOARD_PX_PER_CM;
/** Opening radius in board pixels: removes lines up to about 0.6 mm wide. */
const LINE_RADIUS = 3;

/**
 * Measures the kernel in `box` (board pixels). Null when it can't be measured
 * on its own: nothing bright at its centre, or the region runs into a
 * neighbour (much larger than the kernel's detected area).
 */
export function measureKernel(
  gray: Gray,
  detection: { threshold: number; polarity: 1 | -1 },
  box: { x: number; y: number; w: number; h: number; area: number },
): { lengthMm: number; widthMm: number } | null {
  const { threshold, polarity } = detection;
  const pad = Math.round(BOARD_PX_PER_CM * 0.15);
  const x0 = Math.max(0, box.x - pad);
  const y0 = Math.max(0, box.y - pad);
  const x1 = Math.min(gray.width, box.x + box.w + pad);
  const y1 = Math.min(gray.height, box.y + box.h + pad);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 2 || h <= 2) return null;
  const raw = (i: number) =>
    gray.data[(y0 + Math.floor(i / w)) * gray.width + x0 + (i % w)]!;
  // The background here: the median along the crop's edge.
  const edge: number[] = [];
  for (let x = 0; x < w; x++) edge.push(raw(x), raw((h - 1) * w + x));
  for (let y = 0; y < h; y++) edge.push(raw(y * w), raw(y * w + w - 1));
  edge.sort((a, b) => a - b);
  const background = edge[edge.length >> 1]!;
  // Contrast with the background, positive towards the kernel.
  const value = (i: number) => polarity * (raw(i) - background);
  // The kernel's pixels at a brightness level: bright pixels, opened to drop
  // printed grid lines (thinner than a kernel), connected to the pixel
  // nearest the box centre. Null when the region runs off into a neighbour.
  const region = (level: number) => {
    let mask: Uint8Array = new Uint8Array(w * h);
    for (let i = 0; i < mask.length; i++) mask[i] = value(i) > level ? 1 : 0;
    mask = dilate(erode(mask, w, h, LINE_RADIUS), w, h, LINE_RADIUS);
    const cx = box.x + box.w / 2 - x0;
    const cy = box.y + box.h / 2 - y0;
    let start = -1;
    let best = Infinity;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d < best && mask[y * w + x]) {
          best = d;
          start = y * w + x;
        }
      }
    }
    if (start < 0) return null;
    const seen = new Uint8Array(w * h);
    const stack = [start];
    seen[start] = 1;
    const xs: number[] = [];
    const ys: number[] = [];
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      // Touching the padded edge (not the board's): it continues into a neighbour.
      if (
        (x === 0 && x0 > 0) ||
        (y === 0 && y0 > 0) ||
        (x === w - 1 && x1 < gray.width) ||
        (y === h - 1 && y1 < gray.height)
      )
        return null;
      xs.push(x);
      ys.push(y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (!seen[j] && mask[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    return { xs, ys, mask };
  };

  const first = region(threshold);
  if (!first) return null;
  // Much larger than detected: merged with a neighbour. Much smaller: noise.
  if (first.xs.length > box.area * 1.6 || first.xs.length < box.area * 0.4)
    return null;
  // The edge sits half-way between this kernel's brightness and the board's
  // around it; the detection threshold is lower and includes the blurred rim.
  const middle = (v: number[]) => v.sort((a, b) => a - b)[v.length >> 1]!;
  const fg = middle(first.xs.map((x, k) => value(first.ys[k]! * w + x)));
  const around: number[] = [];
  for (let i = 0; i < w * h; i++) if (!first.mask[i]) around.push(value(i));
  const level = around.length ? (fg + middle(around)) / 2 : threshold;
  const { xs, ys } = (level > threshold && region(level)) || first;
  const n = xs.length;

  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i]!;
    my += ys[i]!;
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let minA = Infinity;
  let maxA = -Infinity;
  let minB = Infinity;
  let maxB = -Infinity;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    const a = dx * ux + dy * uy;
    const b = -dx * uy + dy * ux;
    if (a < minA) minA = a;
    if (a > maxA) maxA = a;
    if (b < minB) minB = b;
    if (b > maxB) maxB = b;
  }
  // +1: extents run from pixel centre to pixel centre.
  const length = (maxA - minA + 1) * MM_PER_PX;
  const breadth = (maxB - minB + 1) * MM_PER_PX;
  return {
    lengthMm: Math.round(Math.max(length, breadth) * 100) / 100,
    widthMm: Math.round(Math.min(length, breadth) * 100) / 100,
  };
}

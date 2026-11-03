import sharp from "sharp";
import { BOARD_PX_PER_CM, cellAt, rawToSharp, type RawImage } from "./board.js";

/**
 * Detection runs on a downscaled board by default: faster, and it smooths
 * out printed grid lines. Small or densely spread kernels (rice) need more.
 */
const DEFAULT_PX_PER_CM = 25;

export interface DetectOptions {
  /** Smallest object to keep, in cm². Smaller blobs are dust or grid noise. */
  minAreaCm2?: number;
  /** Resolution to detect at, in pixels per board cm (the board is 100). */
  pxPerCm?: number;
  /** Look for a round reference coin, much larger than a kernel, and leave it out. */
  findCoin?: boolean;
  /** Erosion radius in detection pixels, to remove thin grid lines before labelling. */
  openingRadius?: number;
  /** Larger bright areas are not kernels: usually table showing past a misplaced corner. */
  maxAreaCm2?: number;
}

/** How much a pixel must differ from the background around it to count as an object (at most). */
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
  /** Contrast with the local background that counts as an object (grey levels). */
  threshold: number;
  /** +1: objects brighter than the background (dark board). −1: darker (light paper or cloth). */
  polarity: 1 | -1;
  medianArea: number;
  /** Bright regions too large to be kernels, which were left out. */
  ignoredLargeRegions: number;
  /** Objects cut off by the edge of the photo, left out (they can't be judged whole). */
  edgeObjects: number;
  /**
   * Kernels counted, with each group of touching kernels that couldn't be
   * separated counted by its area (area ÷ a single kernel's area).
   */
  grainCount: number;
  /** The reference coin, when asked to find one: its diameter in board pixels. */
  coin?: { x: number; y: number; diameterPx: number };
}

/**
 * Finds kernels by classic image processing: grayscale, contrast with the
 * local background, Otsu threshold, morphological opening, connected
 * components. Works on the dark grid board (kernels brighter) and on light
 * paper or cloth (kernels darker), and under uneven light. Counting stays
 * out of the language model, which is unreliable at exact counts of many
 * small objects.
 */
export async function detectKernels(
  board: RawImage,
  options: DetectOptions = {},
): Promise<Detection> {
  const minAreaCm2 = options.minAreaCm2 ?? 0.02;
  const DETECT_PX_PER_CM = Math.min(
    BOARD_PX_PER_CM,
    options.pxPerCm ?? DEFAULT_PX_PER_CM,
  );
  const SCALE = BOARD_PX_PER_CM / DETECT_PX_PER_CM;
  // About 0.4 mm: wide enough to drop printed grid lines, not kernels.
  const radius =
    options.openingRadius ?? Math.max(1, Math.round(DETECT_PX_PER_CM / 25));

  const width = Math.round(board.width / SCALE);
  const height = Math.round(board.height / SCALE);
  const rgb = await rawToSharp(board)
    .resize(width, height, { kernel: "linear" })
    .removeAlpha()
    .raw()
    .toBuffer();
  // The background surface is fitted at about 3 px per cm.
  const { contrast, polarity, gray } = await contrastMap(
    rgb,
    width,
    height,
    Math.max(1, Math.round(DETECT_PX_PER_CM / 3)),
  );
  // Otsu alone splits the background from the most contrasting kernels and
  // misses faint ones (heat damage, black point on a dark board; chalky or
  // pale kernels on paper), which are the defects that matter most. Cap the
  // threshold at a fixed contrast.
  // On light paper faint objects (white kernels) still differ in tone, and
  // the paper itself varies more under a lamp, so Otsu decides within limits.
  const threshold =
    polarity === 1
      ? Math.max(8, Math.min(otsu(contrast), MIN_CONTRAST))
      : Math.max(20, Math.min(otsu(contrast), 60));
  let mask: Uint8Array = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++)
    mask[i] = contrast[i]! > threshold ? 1 : 0;
  if (radius > 0) {
    mask = dilate(erode(mask, width, height, radius), width, height, radius);
  }

  const cm2 = DETECT_PX_PER_CM * DETECT_PX_PER_CM;
  const minArea = minAreaCm2 * cm2;
  const maxArea = (options.maxAreaCm2 ?? 4) * cm2;
  const labels = new Int32Array(width * height);
  const all = label(mask, width, height, labels);
  const atEdge = (b: Blob) =>
    b.minX <= 0 || b.minY <= 0 || b.maxX >= width - 1 || b.maxY >= height - 1;
  // Printed grid lines and board edges: long and thin, unlike any kernel.
  const isLine = (b: Blob) => {
    const w = b.maxX - b.minX + 1;
    const h = b.maxY - b.minY + 1;
    return (
      Math.max(w, h) / Math.min(w, h) > 8 &&
      Math.min(w, h) <= DETECT_PX_PER_CM * 0.2
    );
  };
  const sized = all.filter((b) => b.area >= minArea && !isLine(b));
  const inside = sized.filter((b) => !atEdge(b));
  const edgeObjects = sized.filter(
    (b) => atEdge(b) && b.area <= maxArea,
  ).length;
  // Large areas unlike the background (usually table showing past a
  // misplaced corner): measured against the whole photo's background, since
  // the local background follows them.
  const globalBg = median(gray);
  let wide: Uint8Array = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++)
    wide[i] = polarity * (gray[i]! - globalBg) > MIN_CONTRAST ? 1 : 0;
  wide = dilate(
    erode(wide, width, height, radius * 2),
    width,
    height,
    radius * 2,
  );
  const ignoredLargeRegions = label(wide, width, height).filter(
    (b) => b.area > maxArea,
  ).length;

  const areas = inside
    .filter((b) => b.area <= maxArea)
    .map((b) => b.area)
    .sort((a, b) => a - b);
  const medianArea = areas.length ? areas[Math.floor(areas.length / 2)]! : 0;
  // A reference coin: round, filled like a disc, and many times a kernel's
  // area. The largest such object is taken.
  let coinBlob: Blob | null = null;
  if (options.findCoin && medianArea > 0) {
    for (const b of inside) {
      const w = b.maxX - b.minX + 1;
      const h = b.maxY - b.minY + 1;
      const round = w / h > 0.8 && w / h < 1.25;
      const disc = b.area / (w * h) > 0.7 && b.area / (w * h) < 0.86;
      if (round && disc && b.area > medianArea * 6)
        if (!coinBlob || b.area > coinBlob.area) coinBlob = b;
    }
  }
  // Larger regions are kept when they could be a heap of touching kernels
  // (up to about 400, a dense pile on paper): the splitter separates them.
  // Bigger is not kernels.
  const heapMax = medianArea * 400;
  const found = inside.filter(
    (b) => b !== coinBlob && (b.area <= maxArea || b.area <= heapMax),
  );
  const enough = areas.length >= 5;
  const isLarge = (b: Blob) => enough && b.area > medianArea * 2.2;

  // Touching kernels: separate them where they meet, so each is counted,
  // classified and weighed on its own. Two touching kernels are only about
  // twice a kernel's area, so anything clearly larger than one is tried.
  // A heap comes apart in steps: each piece still holding several kernels
  // is split again at its own levels.
  const split = (b: Blob, depth: number): Blob[] => {
    if (!enough || b.area <= medianArea * 1.5) return [b];
    const parts = splitTouching(
      labels,
      width,
      b,
      medianArea,
      minArea,
      contrast,
      ids,
    );
    if (!parts) return [b];
    if (depth >= 6) return parts;
    return parts.flatMap((p) => split(p, depth + 1));
  };
  let nextId = all.reduce((m, b) => Math.max(m, b.id), 0) + 1;
  const ids = { next: () => nextId++ };
  const blobs = found
    .flatMap((b) => split(b, 0))
    // A large region that didn't come apart isn't a kernel, unless it came
    // from a heap: then it is counted by its area, and a person checks it.
    .filter((b) => b.area <= maxArea || (enough && b.area <= heapMax));

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
    polarity,
    medianArea: Math.round(medianArea * SCALE * SCALE),
    ignoredLargeRegions,
    edgeObjects,
    ...(coinBlob && {
      coin: {
        x: Math.round(((coinBlob.minX + coinBlob.maxX) / 2) * SCALE),
        y: Math.round(((coinBlob.minY + coinBlob.maxY) / 2) * SCALE),
        // The diameter of a disc of the same area.
        diameterPx: Math.sqrt((4 * coinBlob.area) / Math.PI) * SCALE,
      },
    }),
    grainCount: kernels.reduce(
      (n, k) =>
        n +
        (k.isCluster && medianArea > 0
          ? Math.max(1, Math.round(k.area / (medianArea * SCALE * SCALE)))
          : 1),
      0,
    ),
  };
}

/**
 * On a light background, how much brightness counts beside colour. Paper
 * brightness swings widely under a lamp (spotlight, fall-off, shadows of the
 * kernels themselves), while its tint stays steady; kernels differ in tint
 * (brown is warmer, white rice is neutral against bluish paper).
 */
const LIGHT_BRIGHTNESS_WEIGHT = 0.35;

/** Terms of the background surface: 1, x, y, x², xy, y², x²y, xy², x³, y³. */
function terms(x: number, y: number): number[] {
  return [
    1,
    x,
    y,
    x * x,
    x * y,
    y * y,
    x * x * y,
    x * y * y,
    x * x * x,
    y * y * y,
  ];
}

/** Solves A·c = b for a small square system (Gaussian elimination with pivoting). */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const p = m[col]![col]!;
    if (Math.abs(p) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / p;
      for (let c = col; c <= n; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  return m.map((row, i) => (Math.abs(row[i]!) < 1e-12 ? 0 : row[n]! / row[i]!));
}

/**
 * The background as a smooth surface per colour channel (a cubic in x and
 * y), fitted to background pixels only: refitted a few times, each time
 * leaving out pixels that differ from the surface (kernels, shadows, grid
 * lines, table showing). Follows light falling off across the photo, and
 * dense heaps of kernels can't pull it towards their own colour.
 */
function fitBackground(rgb: Buffer, width: number, height: number): number[][] {
  const pts: { t: number[]; c: [number, number, number] }[] = [];
  const step = Math.max(1, Math.round(Math.sqrt((width * height) / 6000)));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 3;
      pts.push({
        t: terms(x / width, y / height),
        c: [rgb[i]!, rgb[i + 1]!, rgb[i + 2]!],
      });
    }
  }
  // Start from the pixels nearest the typical colour: the background is most of the photo.
  const lum = pts.map((p) => 0.299 * p.c[0] + 0.587 * p.c[1] + 0.114 * p.c[2]);
  const sorted = [...lum].sort((a, b) => a - b);
  const mid = sorted[sorted.length >> 1]!;
  const spread =
    sorted[Math.floor(sorted.length * 0.75)]! -
    sorted[Math.floor(sorted.length * 0.25)]!;
  let use = lum.map((l) => Math.abs(l - mid) <= Math.max(12, spread));
  // On light paper objects are darker or warmer than the paper, never
  // brighter and bluer: a pixel on that side of the surface is paper, and
  // only differences the other way mark kernels. Without this a dense heap
  // of kernels pulls the surface towards its own colour, and white kernels
  // (only a little darker and less blue than the paper) vanish into it.
  const light = mid >= 128;
  let coef: number[][] = [];
  for (let round = 0; round < (light ? 6 : 4); round++) {
    coef = [0, 1, 2].map((ch) => {
      const k = 10;
      const ata = Array.from({ length: k }, () => new Array<number>(k).fill(0));
      const atb = new Array<number>(k).fill(0);
      pts.forEach((p, n) => {
        if (!use[n]) return;
        for (let i = 0; i < k; i++) {
          atb[i]! += p.t[i]! * p.c[ch]!;
          for (let j = 0; j < k; j++) ata[i]![j]! += p.t[i]! * p.t[j]!;
        }
      });
      return solve(ata, atb);
    });
    const resid = pts.map((p) => {
      const f = [0, 1, 2].map((ch) =>
        coef[ch]!.reduce((s, c, i) => s + c * p.t[i]!, 0),
      );
      if (light) {
        const [r, g, b] = p.c;
        const dl =
          0.299 * (r - f[0]!) + 0.587 * (g - f[1]!) + 0.114 * (b - f[2]!);
        const da = r - g - (f[0]! - f[1]!);
        const dy = (r + g) / 2 - b - ((f[0]! + f[1]!) / 2 - f[2]!);
        // Darker, warmer or redder than the surface (or greener: a stain).
        return Math.sqrt(Math.min(0, dl) ** 2 + Math.max(0, dy) ** 2 + da * da);
      }
      let d = 0;
      for (let ch = 0; ch < 3; ch++) d += (p.c[ch]! - f[ch]!) ** 2;
      return Math.sqrt(d);
    });
    const r = [...resid].sort((a, b) => a - b);
    // Background residuals are small and alike; keep those within a few times the typical one.
    const cut = Math.max(8, r[Math.floor(r.length * 0.5)]! * 3);
    use = resid.map((d) => d <= cut);
  }
  return coef;
}

/**
 * How different each pixel is from the background, in brightness and
 * colour: 0 on plain background, higher on kernels. Colour matters on light
 * paper, where pale or white kernels are about as bright as the paper but
 * warmer (or cooler) in tone. The background comes from `fitBackground`.
 */
export async function contrastMap(
  rgb: Buffer,
  width: number,
  height: number,
  reduce: number,
): Promise<{ contrast: Uint8Array; gray: Uint8Array; polarity: 1 | -1 }> {
  const sw = Math.max(8, Math.round(width / reduce));
  const sh = Math.max(8, Math.round(height / reduce));
  const reduced = await sharp(rgb, { raw: { width, height, channels: 3 } })
    .resize(sw, sh, { kernel: "linear" })
    .raw()
    .toBuffer();
  const coef = fitBackground(reduced, sw, sh);
  // Light background: mostly colour (see LIGHT_BRIGHTNESS_WEIGHT). On a dark
  // board brightness counts fully: kernels are much brighter than the board.
  const bgLum =
    0.299 * coef[0]![0]! + 0.587 * coef[1]![0]! + 0.114 * coef[2]![0]!;
  const lightBackground = bgLum >= 128;
  const n = width * height;
  const gray = new Uint8Array(n);
  const contrast = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    const fy = y / height;
    for (let x = 0; x < width; x++) {
      const t = terms(x / width, fy);
      const i = y * width + x;
      const r = rgb[i * 3]!;
      const g = rgb[i * 3 + 1]!;
      const b = rgb[i * 3 + 2]!;
      let br = 0;
      let bgG = 0;
      let bb = 0;
      for (let k = 0; k < 10; k++) {
        br += coef[0]![k]! * t[k]!;
        bgG += coef[1]![k]! * t[k]!;
        bb += coef[2]![k]! * t[k]!;
      }
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      gray[i] = l;
      // Brightness, red–green and yellow–blue differences; colour weighs more.
      let dl = l - (0.299 * br + 0.587 * bgG + 0.114 * bb);
      if (lightBackground) dl *= LIGHT_BRIGHTNESS_WEIGHT;
      const da = r - g - (br - bgG);
      const dy = (r + g) / 2 - b - ((br + bgG) / 2 - bb);
      contrast[i] = Math.min(
        255,
        Math.round(Math.sqrt(dl * dl + 2.25 * (da * da + dy * dy))),
      );
    }
  }
  return { contrast, gray, polarity: lightBackground ? -1 : 1 };
}

/** Median gray level. The background covers most of the image, so this is its brightness. */
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
export function erode(
  m: Uint8Array,
  w: number,
  h: number,
  r: number,
): Uint8Array {
  return filter(filter(m, w, h, r, true, 1), w, h, r, false, 1);
}

export function dilate(
  m: Uint8Array,
  w: number,
  h: number,
  r: number,
): Uint8Array {
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
  /** The contrast map at the same resolution: lower where kernels meet. */
  contrast?: Uint8Array,
  /** When given, each part gets a new id, written into `labels`, so it can be split again. */
  ids?: { next: () => number },
): Blob[] | null {
  const bw = blob.maxX - blob.minX + 1;
  const bh = blob.maxY - blob.minY + 1;
  const sub = new Uint8Array(bw * bh);
  const strength = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const g = (blob.minY + y) * width + blob.minX + x;
      if (labels[g] === blob.id) {
        sub[y * bw + x] = 1;
        strength[y * bw + x] = contrast ? contrast[g]! : 0;
      }
    }
  }
  const minCore = Math.max(3, medianArea * 0.03);
  /** Cores where `value` > level, renumbered 1..n; null below two. */
  const coresAt = (value: Float32Array, level: number) => {
    const core = new Uint8Array(bw * bh);
    for (let i = 0; i < core.length; i++) core[i] = value[i]! > level ? 1 : 0;
    const seeds = new Int32Array(bw * bh);
    const cores = label(core, bw, bh, seeds).filter((c) => c.area >= minCore);
    if (cores.length < 2) return null;
    const keep = new Map(cores.map((c, i) => [c.id, i + 1]));
    for (let i = 0; i < seeds.length; i++) seeds[i] = keep.get(seeds[i]!) ?? 0;
    return { seeds, count: cores.length };
  };

  // Candidate cores: levels of the distance map (narrow necks where kernels
  // touch go first) and, when given, of the contrast (fainter where they
  // meet, for kernels pressed side by side).
  const candidates: { seeds: Int32Array; count: number }[] = [];
  const dist = distanceMap(sub, bw, bh);
  let peak = 0;
  for (const v of dist) if (v > peak) peak = v;
  for (let level = 1; level < peak - 0.5; level += 0.5) {
    const c = coresAt(dist, level);
    if (c) candidates.push(c);
  }
  if (contrast) {
    let lo = 255;
    let hi = 0;
    for (let i = 0; i < sub.length; i++) {
      if (!sub[i]) continue;
      lo = Math.min(lo, strength[i]!);
      hi = Math.max(hi, strength[i]!);
    }
    for (let level = lo + 4; level < hi - 4; level += 4) {
      const c = coresAt(strength, level);
      if (c) candidates.push(c);
    }
  }
  // As many kernels as the area holds (about area ÷ a kernel's area), each
  // looking like a kernel rather than a sliver; nearer that number wins, and
  // on a tie the larger count.
  const expected = blob.area / medianArea;
  candidates.sort(
    (a, b) =>
      Math.abs(a.count - expected) - Math.abs(b.count - expected) ||
      b.count - a.count,
  );
  for (const c of candidates) {
    // Far more pieces than the area holds: cut through kernels, not between.
    if (c.count > Math.round(expected) + 1) continue;
    const { parts, owner } = growParts(c.seeds, c.count, sub, bw, bh, blob);
    if (!parts.every((p) => p.area >= Math.max(minArea, medianArea * 0.3)))
      continue;
    if (!ids) return parts;
    const newIds = parts.map(() => ids.next());
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        const n = owner[y * bw + x]!;
        if (n) labels[(blob.minY + y) * width + blob.minX + x] = newIds[n - 1]!;
      }
    return parts.map((p, i) => ({ ...p, id: newIds[i]! }));
  }
  return null;
}

/** Grows numbered cores back over the blob's pixels (nearest core wins) and returns the parts. */
function growParts(
  seeds: Int32Array,
  count: number,
  sub: Uint8Array,
  bw: number,
  bh: number,
  blob: Blob,
): { parts: Blob[]; owner: Int32Array } {
  const owner = Int32Array.from(seeds);
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
  const parts = Array.from({ length: count }, () => ({
    area: 0,
    minX: bw,
    minY: bh,
    maxX: 0,
    maxY: 0,
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
  return {
    owner,
    parts: parts.map((p) => ({
      id: blob.id,
      area: p.area,
      minX: blob.minX + p.minX,
      minY: blob.minY + p.minY,
      maxX: blob.minX + p.maxX,
      maxY: blob.minY + p.maxY,
    })),
  };
}

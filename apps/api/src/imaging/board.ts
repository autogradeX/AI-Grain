import sharp, { type Sharp } from "sharp";
import type { Corners } from "../db/schema.js";
import { applyHomography as apply, homography } from "@ai-grain/core";

/** The printed grid: columns A–T and rows 1–28, 1 cm each. */
export const GRID_COLS = 20;
export const GRID_ROWS = 28;
/** Resolution of the straightened board image. */
export const BOARD_PX_PER_CM = 100;
export const BOARD_WIDTH = GRID_COLS * BOARD_PX_PER_CM;
export const BOARD_HEIGHT = GRID_ROWS * BOARD_PX_PER_CM;

export interface RawImage {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

/**
 * Applies EXIF orientation and caps the size, so the stored original and
 * the corner coordinates the client sends refer to the same pixels.
 */
export async function normalizeUpload(
  input: Buffer,
  /** Mirror left–right: a camera below a glass tray sees the kernels mirrored. */
  options: { mirror?: boolean } = {},
): Promise<{ jpeg: Buffer; width: number; height: number }> {
  // Turned upright (EXIF) first, then mirrored: a separate step, so the
  // mirror never mixes with the turn.
  const upright = options.mirror
    ? sharp(await sharp(input).rotate().toBuffer()).flop()
    : sharp(input).rotate();
  const { data, info } = await upright
    .resize({
      width: 4800,
      height: 4800,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 92 })
    .toBuffer({ resolveWithObject: true });
  return { jpeg: data, width: info.width, height: info.height };
}

/** Default corners when the client sends none: the whole photo. */
export function fullFrameCorners(width: number, height: number): Corners {
  return [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ];
}

/**
 * Corners for a photo without the board: the whole photo, fitted into the
 * board's 20 × 28 shape with its own proportions (centred, the rest filled),
 * so nothing is stretched and one pixel is the same size in both directions.
 * A landscape photo (most webcams) is turned a quarter turn to fill the
 * upright board, instead of leaving wide bands above and below it.
 */
export function photoCorners(width: number, height: number): Corners {
  const upright = GRID_COLS / GRID_ROWS;
  if (width > height) {
    // Turned: the photo's width runs along the board's height.
    const target = 1 / upright;
    let w = width;
    let h = height;
    if (width / height < target) w = height * target;
    else h = width / target;
    const x0 = (width - w) / 2;
    const y0 = (height - h) / 2;
    // Board top-left, top-right, bottom-right, bottom-left: the photo's
    // bottom-left, top-left, top-right, bottom-right (a quarter turn clockwise).
    return [
      { x: x0, y: y0 + h },
      { x: x0, y: y0 },
      { x: x0 + w, y: y0 },
      { x: x0 + w, y: y0 + h },
    ];
  }
  let w = width;
  let h = height;
  if (width / height < upright) w = height * upright;
  else h = width / upright;
  const x0 = (width - w) / 2;
  const y0 = (height - h) / 2;
  return [
    { x: x0, y: y0 },
    { x: x0 + w, y: y0 },
    { x: x0 + w, y: y0 + h },
    { x: x0, y: y0 + h },
  ];
}

/** Maps the quadrilateral at `corners` onto a straight 20 × 28 cm board image. */
export async function straightenBoard(
  original: Buffer,
  corners: Corners,
  /** Fill what lies outside the photo with its edge instead of black. */
  extend = false,
): Promise<RawImage> {
  const src = await sharp(original)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sw = src.info.width;
  const sh = src.info.height;
  const sc = src.info.channels;
  const s = src.data;

  const h = homography(
    [
      { x: 0, y: 0 },
      { x: BOARD_WIDTH, y: 0 },
      { x: BOARD_WIDTH, y: BOARD_HEIGHT },
      { x: 0, y: BOARD_HEIGHT },
    ],
    corners,
  );

  const out = Buffer.alloc(BOARD_WIDTH * BOARD_HEIGHT * 3);
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const p = apply(h, x + 0.5, y + 0.5);
      const fx = p.x - 0.5;
      const fy = p.y - 0.5;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const o = (y * BOARD_WIDTH + x) * 3;
      if (x0 < 0 || y0 < 0 || x0 + 1 >= sw || y0 + 1 >= sh) {
        if (!extend) continue;
      }
      // Outside the photo (a photo fitted with its own proportions): the
      // nearest edge pixel, so no black bands look like objects.
      const cx = Math.min(sw - 2, Math.max(0, x0));
      const cy = Math.min(sh - 2, Math.max(0, y0));
      const dx = cx === x0 ? fx - x0 : 0;
      const dy = cy === y0 ? fy - y0 : 0;
      const i00 = (cy * sw + cx) * sc;
      const i10 = i00 + sc;
      const i01 = i00 + sw * sc;
      const i11 = i01 + sc;
      for (let c = 0; c < 3; c++) {
        const top = s[i00 + c]! * (1 - dx) + s[i10 + c]! * dx;
        const bottom = s[i01 + c]! * (1 - dx) + s[i11 + c]! * dx;
        out[o + c] = Math.round(top * (1 - dy) + bottom * dy);
      }
    }
  }
  return { data: out, width: BOARD_WIDTH, height: BOARD_HEIGHT, channels: 3 };
}

export function rawToSharp(img: RawImage): Sharp {
  return sharp(img.data, {
    raw: { width: img.width, height: img.height, channels: img.channels as 3 },
  });
}

/** Grid cell for a point on the straightened board, e.g. "C14". */
export function cellAt(
  x: number,
  y: number,
  pxPerCm = BOARD_PX_PER_CM,
): string {
  const col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor(x / pxPerCm)));
  const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(y / pxPerCm)));
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

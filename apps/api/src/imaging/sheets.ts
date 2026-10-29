import sharp, { type OverlayOptions } from "sharp";
import { BOARD_PX_PER_CM, rawToSharp, type RawImage } from "./board.js";

export const TILE_PX = 200;
const LABEL_PX = 28;
export const SHEET_COLS = 6;
export const SHEET_ROWS = 5;
export const KERNELS_PER_SHEET = SHEET_COLS * SHEET_ROWS;

export interface CropBox {
  number: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Side of the square crop window in cm. Every crop in a batch uses the same
 * window, so tiles share one scale and kernel sizes stay comparable.
 */
export function cropWindowCm(boxes: readonly CropBox[]): number {
  const sides = boxes
    .map((b) => Math.max(b.w, b.h) / BOARD_PX_PER_CM)
    .sort((a, b) => a - b);
  const p90 = sides.length ? sides[Math.floor(sides.length * 0.9)]! : 1;
  return Math.min(3, Math.max(1.2, Math.ceil(p90 * 1.3 * 10) / 10));
}

/** Cuts a square crop centred on each kernel, `windowCm` wide, scaled to TILE_PX. Outside the board is black. */
export async function cropKernels(
  board: RawImage,
  boxes: readonly CropBox[],
  windowCm: number,
): Promise<Map<number, Buffer>> {
  const side = Math.round(windowCm * BOARD_PX_PER_CM);
  const ch = board.channels;
  const crops = new Map<number, Buffer>();
  for (const b of boxes) {
    const left = Math.round(b.x + b.w / 2 - side / 2);
    const top = Math.round(b.y + b.h / 2 - side / 2);
    const region = Buffer.alloc(side * side * ch);
    for (let row = 0; row < side; row++) {
      const sy = top + row;
      if (sy < 0 || sy >= board.height) continue;
      const x0 = Math.max(0, left);
      const x1 = Math.min(board.width, left + side);
      if (x1 <= x0) continue;
      board.data.copy(
        region,
        (row * side + (x0 - left)) * ch,
        (sy * board.width + x0) * ch,
        (sy * board.width + x1) * ch,
      );
    }
    const jpeg = await sharp(region, {
      raw: { width: side, height: side, channels: ch as 3 },
    })
      .resize(TILE_PX, TILE_PX)
      .jpeg({ quality: 90 })
      .toBuffer();
    crops.set(b.number, jpeg);
  }
  return crops;
}

/** Arranges up to 30 numbered crops on one sheet image for a single Claude request. */
export async function buildSheet(
  tiles: readonly { number: number; jpeg: Buffer }[],
): Promise<Buffer> {
  if (tiles.length > KERNELS_PER_SHEET) {
    throw new Error(`A sheet holds at most ${KERNELS_PER_SHEET} kernels`);
  }
  const cell = TILE_PX + LABEL_PX;
  const width = SHEET_COLS * TILE_PX + (SHEET_COLS + 1) * 8;
  const rows = Math.ceil(tiles.length / SHEET_COLS);
  const height = rows * cell + (rows + 1) * 8;

  const composites: OverlayOptions[] = [];
  const labels: string[] = [];
  tiles.forEach((t, i) => {
    const col = i % SHEET_COLS;
    const row = Math.floor(i / SHEET_COLS);
    const left = 8 + col * (TILE_PX + 8);
    const top = 8 + row * (cell + 8);
    labels.push(
      `<text x="${left + 4}" y="${top + 21}" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold" fill="#ffffff">#${t.number}</text>`,
    );
    composites.push({ input: t.jpeg, left, top: top + LABEL_PX });
  });
  composites.push({
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${labels.join("")}</svg>`,
    ),
    left: 0,
    top: 0,
  });

  return sharp({
    create: { width, height, channels: 3, background: "#3a3a3a" },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** A downscaled board image for the browser and reports. */
export async function boardPreview(
  board: RawImage,
  width = 1000,
): Promise<Buffer> {
  return rawToSharp(board).resize({ width }).jpeg({ quality: 85 }).toBuffer();
}

/** Draws a ring around each listed kernel on a board preview. */
export async function annotateBoard(
  preview: Buffer,
  boardWidthPx: number,
  marks: readonly {
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
  }[],
): Promise<Buffer> {
  const meta = await sharp(preview).metadata();
  const width = meta.width;
  const height = meta.height;
  const s = width / boardWidthPx;
  const circles = marks
    .map((m) => {
      const r = (Math.max(m.w, m.h) / 2) * s + 6;
      return `<circle cx="${(m.x + m.w / 2) * s}" cy="${(m.y + m.h / 2) * s}" r="${r}" fill="none" stroke="${m.color}" stroke-width="3"/>`;
    })
    .join("");
  return sharp(preview)
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${circles}</svg>`,
        ),
      },
    ])
    .jpeg({ quality: 85 })
    .toBuffer();
}

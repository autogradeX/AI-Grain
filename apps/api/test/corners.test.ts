import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { findGridCorners } from "../src/imaging/corners.js";
import { syntheticBoard } from "./helpers.js";

/** A dark card larger than its printed grid, like an A4 board, on a light table. */
async function cardWithMargins(rotateDeg = 0) {
  const px = 50;
  const gx = 260;
  const gy = 240;
  const gw = 20 * px;
  const gh = 28 * px;
  const lines: string[] = [];
  for (let c = 0; c <= 20; c++)
    lines.push(
      `<line x1="${gx + c * px}" y1="${gy}" x2="${gx + c * px}" y2="${gy + gh}" stroke="#666" stroke-width="2"/>`,
    );
  for (let r = 0; r <= 28; r++)
    lines.push(
      `<line x1="${gx}" y1="${gy + r * px}" x2="${gx + gw}" y2="${gy + r * px}" stroke="#666" stroke-width="2"/>`,
    );
  const kernels = Array.from(
    { length: 60 },
    (_, i) =>
      `<ellipse cx="${gx + (1.5 + (i % 8) * 2.3) * px}" cy="${gy + (1.5 + Math.floor(i / 8) * 3.3) * px}" rx="17" ry="9" fill="#d8b46a"/>`,
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1520" height="1880">
    <rect width="100%" height="100%" fill="#b9b2a4"/>
    <rect x="${gx - 25}" y="${gy - 42}" width="${gw + 50}" height="${gh + 84}" fill="#151618"/>
    ${lines.join("")}${kernels.join("")}</svg>`;
  let img = sharp(Buffer.from(svg));
  if (rotateDeg) img = img.rotate(rotateDeg, { background: "#b9b2a4" });
  const jpeg = await img.jpeg({ quality: 90 }).toBuffer();
  return {
    jpeg,
    grid: [
      { x: gx, y: gy },
      { x: gx + gw, y: gy },
      { x: gx + gw, y: gy + gh },
      { x: gx, y: gy + gh },
    ],
  };
}

const maxError = (
  a: { x: number; y: number }[],
  b: { x: number; y: number }[],
) => Math.max(...a.map((p, i) => Math.hypot(p.x - b[i]!.x, p.y - b[i]!.y)));

describe("finding the grid corners", () => {
  it("finds the corners of a board on a lighter background", async () => {
    const board = await syntheticBoard(40);
    const found = await findGridCorners(board.jpeg);
    expect(found?.grid).toBe(true);
    const corners = found?.corners;
    expect(corners).toBeDefined();
    // Within half a grid cell (30 px at 60 px/cm).
    expect(maxError(corners!, board.corners)).toBeLessThan(30);
  });

  it("puts the corners on the printed grid, not the card's edge", async () => {
    const card = await cardWithMargins();
    const found = await findGridCorners(card.jpeg);
    expect(found?.grid).toBe(true);
    const corners = found?.corners;
    expect(corners).toBeDefined();
    expect(maxError(corners!, card.grid)).toBeLessThan(15);
  });

  it("handles a board photographed at an angle", async () => {
    const card = await cardWithMargins(7);
    const found = await findGridCorners(card.jpeg);
    const corners = found?.corners;
    expect(corners).toBeDefined();
    // The grid's sides stay about 20 × 28 cells long.
    const top = Math.hypot(
      corners![1].x - corners![0].x,
      corners![1].y - corners![0].y,
    );
    const left = Math.hypot(
      corners![3].x - corners![0].x,
      corners![3].y - corners![0].y,
    );
    expect(left / top).toBeGreaterThan(1.3);
    expect(left / top).toBeLessThan(1.5);
    expect(top).toBeGreaterThan(950);
    expect(top).toBeLessThan(1050);
  });

  it("returns nothing when there is no board in the photo", async () => {
    const blank = await sharp({
      create: { width: 800, height: 1000, channels: 3, background: "#c8c0b0" },
    })
      .jpeg()
      .toBuffer();
    expect(await findGridCorners(blank)).toBeNull();
  });
});

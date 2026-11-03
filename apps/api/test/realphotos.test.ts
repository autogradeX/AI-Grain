import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { photoCorners, straightenBoard } from "../src/imaging/board.js";
import { findGridCorners } from "../src/imaging/corners.js";
import { detectKernels } from "../src/imaging/detect.js";

/*
 * Real photos from users, counted by hand. They guard the count against
 * regressions in both directions: kernels missed (white rice on bluish
 * paper) and objects counted that aren't kernels (paper, shadows, dust).
 */

const fixture = (name: string) =>
  readFile(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)));

/** As the pipeline treats a photo without the board: the whole photo, at full detail. */
async function detectWithoutBoard(jpeg: Buffer) {
  const { width, height } = await sharp(jpeg).metadata();
  const board = await straightenBoard(jpeg, photoCorners(width, height), true);
  return detectKernels(board, { pxPerCm: 100 });
}

describe("real photos", () => {
  it("counts rice on paper close to the hand count of 424, white grains included", async () => {
    const jpeg = await fixture("rice-on-paper.jpg");
    const found = await findGridCorners(jpeg);
    expect(found?.grid ?? false).toBe(false);
    const d = await detectWithoutBoard(jpeg);
    expect(d.polarity).toBe(-1);
    // Within 8% of the hand count.
    expect(d.grainCount).toBeGreaterThanOrEqual(390);
    expect(d.grainCount).toBeLessThanOrEqual(458);
    // Nothing on the empty paper around the heap (it lies within these
    // bounds on the 2000 × 2800 frame).
    for (const k of d.kernels) {
      expect(k.x).toBeGreaterThan(250);
      expect(k.y).toBeGreaterThan(350);
      expect(k.x + k.w).toBeLessThan(1650);
      expect(k.y + k.h).toBeLessThan(2650);
    }
  }, 120_000);

  it("counts each chana once: 63 whole ones, the one cut off by the edge left out", async () => {
    const d = await detectWithoutBoard(await fixture("chana-on-paper.jpg"));
    expect(d.grainCount).toBeGreaterThanOrEqual(62);
    expect(d.grainCount).toBeLessThanOrEqual(64);
    expect(d.kernels.filter((k) => k.isCluster)).toHaveLength(0);
  }, 60_000);

  it("finds nothing on the empty paper of the same photos", async () => {
    for (const [name, top] of [
      ["rice-on-paper.jpg", 0],
      ["chana-on-paper.jpg", 0.82],
    ] as const) {
      const jpeg = await fixture(name);
      const { width, height } = await sharp(jpeg).metadata();
      // A strip with no kernels: the top of the rice photo, the bottom of
      // the chana photo (with the lamp's fall-off and a shadow).
      const strip = await sharp(jpeg)
        .extract({
          left: 0,
          top: Math.round(height * top),
          width: width,
          height: Math.round(height * 0.15),
        })
        .jpeg()
        .toBuffer();
      const d = await detectWithoutBoard(strip);
      expect(d.kernels, name).toHaveLength(0);
    }
  }, 60_000);
});

import { describe, expect, it } from "vitest";
import type { Corners } from "../src/db/schema.js";
import {
  cellAt,
  normalizeUpload,
  straightenBoard,
} from "../src/imaging/board.js";
import { detectKernels } from "../src/imaging/detect.js";
import { boardGray, measureKernel } from "../src/imaging/measure.js";
import { applyHomography as apply, homography } from "@ai-grain/core";
import {
  buildSheet,
  cropKernels,
  cropWindowCm,
} from "../src/imaging/sheets.js";
import sharp from "sharp";
import { syntheticBoard } from "./helpers.js";

describe("homography", () => {
  it("maps each source corner onto its target", () => {
    const from = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const to = [
      { x: 5, y: 3 },
      { x: 40, y: 8 },
      { x: 38, y: 50 },
      { x: 2, y: 45 },
    ];
    const h = homography(from, to);
    from.forEach((p, i) => {
      const q = apply(h, p.x, p.y);
      expect(q.x).toBeCloseTo(to[i]!.x, 6);
      expect(q.y).toBeCloseTo(to[i]!.y, 6);
    });
  });

  it("rejects corners in a line", () => {
    const line = [0, 1, 2, 3].map((i) => ({ x: i, y: i }));
    expect(() => homography(line, line)).toThrow(/degenerate/);
  });
});

describe("cellAt", () => {
  it("names grid cells A1 to T28", () => {
    expect(cellAt(0, 0)).toBe("A1");
    expect(cellAt(250, 1310)).toBe("C14");
    expect(cellAt(1999, 2799)).toBe("T28");
    expect(cellAt(5000, 5000)).toBe("T28");
  });
});

describe("kernel detection", () => {
  it("finds every kernel on a synthetic board and ignores the grid lines", async () => {
    const photo = await syntheticBoard(40);
    const { jpeg } = await normalizeUpload(photo.jpeg);
    const board = await straightenBoard(jpeg, photo.corners as Corners);
    const detection = await detectKernels(board);
    expect(detection.kernels).toHaveLength(40);
    expect(detection.kernels.some((k) => k.isCluster)).toBe(false);
    // Reading order: the first kernel sits near (1.2 cm, 1.2 cm), cell B2.
    expect(detection.kernels[0]?.cell).toBe("B2");
    expect(detection.kernels.map((k) => k.number)).toEqual(
      Array.from({ length: 40 }, (_, i) => i + 1),
    );

    const window = cropWindowCm(detection.kernels);
    expect(window).toBeGreaterThanOrEqual(1.2);
    const crops = await cropKernels(
      board,
      detection.kernels.slice(0, 30),
      window,
    );
    expect(crops.size).toBe(30);
    const sheet = await buildSheet(
      [...crops.entries()].map(([number, jpeg]) => ({ number, jpeg })),
    );
    const meta = await sharp(sheet).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBeGreaterThan(1200);
  });

  it("finds dark kernels, such as heat-damaged ones, as well as light ones", async () => {
    const photo = await syntheticBoard(0);
    const overlay = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${photo.width}" height="${photo.height}">
        ${Array.from({ length: 10 }, (_, i) => `<ellipse cx="${300 + i * 100}" cy="600" rx="21" ry="11" fill="${i % 2 ? "#6b4a2b" : "#d8b46a"}"/>`).join("")}
      </svg>`,
    );
    const jpeg = await sharp(photo.jpeg)
      .composite([{ input: overlay }])
      .jpeg()
      .toBuffer();
    const board = await straightenBoard(jpeg, photo.corners as Corners);
    const detection = await detectKernels(board);
    expect(detection.kernels).toHaveLength(10);
  });

  it("leaves out table showing past a misplaced corner", async () => {
    const photo = await syntheticBoard(20);
    // Corners pushed 60 px outside the grid, so a strip of the grey table is inside them.
    const loose = photo.corners.map((p, i) => ({
      x: p.x + (i === 0 || i === 3 ? -60 : 60),
      y: p.y + (i < 2 ? -60 : 60),
    }));
    const board = await straightenBoard(photo.jpeg, loose as Corners);
    const detection = await detectKernels(board);
    expect(detection.kernels).toHaveLength(20);
    expect(detection.ignoredLargeRegions).toBeGreaterThan(0);
  });

  it("flags touching kernels as a cluster", async () => {
    const photo = await syntheticBoard(12);
    // Add two overlapping kernels to the photo.
    const overlay = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${photo.width}" height="${photo.height}">
        <ellipse cx="900" cy="1500" rx="21" ry="11" fill="#d8b46a"/>
        <ellipse cx="930" cy="1505" rx="21" ry="11" fill="#d8b46a"/>
        <ellipse cx="915" cy="1520" rx="21" ry="11" fill="#d8b46a"/>
      </svg>`,
    );
    const jpeg = await sharp(photo.jpeg)
      .composite([{ input: overlay }])
      .jpeg()
      .toBuffer();
    const board = await straightenBoard(jpeg, photo.corners as Corners);
    const detection = await detectKernels(board);
    expect(detection.kernels).toHaveLength(13);
    expect(detection.kernels.filter((k) => k.isCluster)).toHaveLength(1);
  });

  it("separates kernels that only touch", async () => {
    const photo = await syntheticBoard(12);
    // Three kernels in a row, end to end, and two side by side.
    const overlay = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${photo.width}" height="${photo.height}">
        <ellipse cx="700" cy="1500" rx="21" ry="11" fill="#d8b46a"/>
        <ellipse cx="741" cy="1500" rx="21" ry="11" fill="#d8b46a"/>
        <ellipse cx="782" cy="1500" rx="21" ry="11" fill="#d8b46a"/>
        <ellipse cx="1000" cy="1600" rx="21" ry="11" fill="#d8b46a"/>
        <ellipse cx="1000" cy="1621" rx="21" ry="11" fill="#d8b46a"/>
      </svg>`,
    );
    const jpeg = await sharp(photo.jpeg)
      .composite([{ input: overlay }])
      .jpeg()
      .toBuffer();
    const board = await straightenBoard(jpeg, photo.corners as Corners);
    const detection = await detectKernels(board);
    expect(detection.kernels).toHaveLength(17);
    expect(detection.kernels.filter((k) => k.isCluster)).toHaveLength(0);
    // Each part is about one kernel.
    const areas = detection.kernels.map((k) => k.area);
    expect(Math.max(...areas) / Math.min(...areas)).toBeLessThan(1.8);
  });

  it("measures each kernel's length and breadth", async () => {
    // Kernels in the synthetic board are ellipses 0.7 cm × 0.36 cm.
    const photo = await syntheticBoard(20);
    const board = await straightenBoard(photo.jpeg, photo.corners as Corners);
    const detection = await detectKernels(board);
    const gray = await boardGray(board);
    const sizes = detection.kernels.map((k) =>
      measureKernel(gray, detection.threshold, k),
    );
    expect(sizes.every((s) => s !== null)).toBe(true);
    for (const s of sizes) {
      expect(s!.lengthMm).toBeGreaterThan(6.6);
      expect(s!.lengthMm).toBeLessThan(7.5);
      expect(s!.widthMm).toBeGreaterThan(3.2);
      expect(s!.widthMm).toBeLessThan(4.0);
    }
  });

  it("measures a rotated kernel along its own axis", async () => {
    const photo = await syntheticBoard(1);
    const overlay = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${photo.width}" height="${photo.height}">
        <ellipse cx="0" cy="0" rx="30" ry="9" fill="#d8b46a" transform="translate(800 1200) rotate(35)"/>
      </svg>`,
    );
    const jpeg = await sharp(photo.jpeg)
      .composite([{ input: overlay }])
      .jpeg()
      .toBuffer();
    const board = await straightenBoard(jpeg, photo.corners as Corners);
    const detection = await detectKernels(board);
    const gray = await boardGray(board);
    const rotated = detection.kernels.find((k) => k.w > 60 && k.h > 60)!;
    const size = measureKernel(gray, detection.threshold, rotated)!;
    // 60 px × 18 px at 60 px/cm: 10 mm × 3 mm.
    expect(size.lengthMm).toBeGreaterThan(9.4);
    expect(size.lengthMm).toBeLessThan(10.6);
    expect(size.widthMm).toBeGreaterThan(2.6);
    expect(size.widthMm).toBeLessThan(3.5);
  });
});

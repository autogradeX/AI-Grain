import type { ClassGroup } from "@ai-grain/core";

/*
 * The example sample the landing animation tells its story with: kernels on
 * the 20 × 28 cm grid board (1 scene unit = 1 cm), each with a class group, a
 * shape and a starting place in the swirl. Seeded, so every visit and every
 * frame agrees with the counts shown in the example result card.
 */

export type KernelKind = "sound" | ClassGroup;

export interface KernelSpec {
  kind: KernelKind;
  /** Resting place on the board (x across, z down the board). */
  boardX: number;
  boardZ: number;
  /** Turn on the board, radians. */
  yaw: number;
  /** Length, width and height scale of the kernel shape. */
  scale: [number, number, number];
  color: number;
  /** Place in the swirl: radius, angle, height, speed. */
  orbit: { r: number; a: number; y: number; speed: number };
  /** 0–1 offset so kernels don't all move at once. */
  delay: number;
  /** Which cup a defect goes to, and where in it. */
  cup: number;
  cupX: number;
  cupZ: number;
  cupY: number;
}

export const BOARD = { width: 20, depth: 28 };

/** Cups beside the board, one per class group, in group order. */
export const CUP_GROUPS: ClassGroup[] = [
  "admixture",
  "broken_defective",
  "impurity",
  "harmful",
];
export const CUP_X = 15.5;
export const cupZ = (i: number) => -10.5 + i * 7;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHAPES: Record<
  KernelKind,
  { scale: [number, number, number]; colors: number[] }
> = {
  sound: { scale: [1, 1, 1], colors: [0xd9a441, 0xe0b04f, 0xcf9a3a, 0xe6ba5c] },
  // Other cereals: longer and paler, like oats or barley in wheat.
  admixture: { scale: [1.3, 0.8, 0.8], colors: [0xe8d39a, 0xd8c286] },
  // Broken, shrivelled or heat-damaged: short or thin, darker.
  broken_defective: {
    scale: [0.6, 0.95, 0.9],
    colors: [0xb07a2e, 0x8f5f25, 0xa36c2a],
  },
  // Weed seeds, husks and stones: small, round, dark.
  impurity: {
    scale: [0.45, 0.85, 0.85],
    colors: [0x4a3a2a, 0x5b5148, 0x3a3029],
  },
  // Ergot and mould: long, black-purple.
  harmful: { scale: [1.45, 0.65, 0.6], colors: [0x2a1a24, 0x33202c] },
};

/** How many kernels of each kind the example sample has (120 in all). */
const MIX: [KernelKind, number][] = [
  ["sound", 96],
  ["admixture", 5],
  ["broken_defective", 11],
  ["impurity", 4],
  ["harmful", 4],
];

export function buildSample(): KernelSpec[] {
  const rand = mulberry32(15587);
  const kinds = MIX.flatMap(([k, n]) => Array<KernelKind>(n).fill(k));
  // Shuffle so defects are spread over the board.
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!];
  }
  const cols = 10;
  const filled = new Array<number>(CUP_GROUPS.length).fill(0);
  return kinds.map((kind, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const shape = SHAPES[kind];
    const cup = kind === "sound" ? -1 : CUP_GROUPS.indexOf(kind);
    let cupX = 0;
    let cupZ = 0;
    let cupY = 0;
    if (cup >= 0) {
      const n = filled[cup]!++;
      const angle = n * 2.4;
      const radius = 0.35 + 0.5 * Math.sqrt((n % 6) / 6);
      cupX = Math.cos(angle) * radius;
      cupZ = Math.sin(angle) * radius;
      cupY = 0.5 + Math.floor(n / 6) * 0.35;
    }
    return {
      kind,
      // Two cm pitch with jitter, inside the 20 × 28 grid, like a spread sample.
      boardX: -9 + col * 2 + (rand() - 0.5) * 0.7,
      boardZ: -11.5 + row * 2.1 + (rand() - 0.5) * 0.7,
      yaw: rand() * Math.PI,
      scale: shape.scale,
      color: shape.colors[Math.floor(rand() * shape.colors.length)]!,
      orbit: {
        r: 5 + rand() * 13,
        a: rand() * Math.PI * 2,
        y: 4 + rand() * 9,
        speed: 0.08 + rand() * 0.12,
      },
      delay: rand(),
      cup,
      cupX,
      cupZ,
      cupY,
    };
  });
}

export function countByKind(sample: KernelSpec[]): Record<KernelKind, number> {
  const counts = {
    sound: 0,
    admixture: 0,
    broken_defective: 0,
    impurity: 0,
    harmful: 0,
  };
  for (const k of sample) counts[k.kind]++;
  return counts;
}

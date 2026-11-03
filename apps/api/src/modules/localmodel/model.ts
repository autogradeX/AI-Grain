import type { LocalModelMetrics, LocalModelWeights } from "../../db/schema.js";

/*
 * The local model: a small neural network (one hidden layer) on the
 * kernel measurements from imaging/features.ts, trained on the
 * organisation's own labelled kernels. Plain TypeScript, so it runs on the
 * station's CPU with nothing to install and nothing to download.
 */

export interface Example {
  x: number[];
  label: string;
  /** How much this example counts: 1 for a person's decision, less for an AI verdict. */
  weight: number;
}

const HIDDEN = 32;

/** Small, fast, repeatable pseudo-random numbers (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function standardize(x: number[], mean: number[], std: number[]): number[] {
  return x.map((v, i) => (v - mean[i]!) / std[i]!);
}

/** Class probabilities for one kernel. */
export function predict(model: LocalModelWeights, x: number[]): number[] {
  const z = standardize(x, model.featureMean, model.featureStd);
  const h = model.b1.map((b, j) => {
    let s = b;
    for (let i = 0; i < z.length; i++) s += model.w1[j]![i]! * z[i]!;
    return s > 0 ? s : 0;
  });
  const logits = model.b2.map((b, k) => {
    let s = b;
    for (let j = 0; j < h.length; j++) s += model.w2[k]![j]! * h[j]!;
    return s;
  });
  const max = Math.max(...logits);
  const e = logits.map((v) => Math.exp(v - max));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}

/** The model's verdict: the likeliest class, with a confidence from its probability. */
export function verdictOf(
  model: LocalModelWeights,
  x: number[],
): { cls: string; p: number; confidence: "high" | "medium" | "low" } {
  const probs = predict(model, x);
  let k = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i]! > probs[k]!) k = i;
  const p = probs[k]!;
  return {
    cls: model.classes[k]!,
    p,
    confidence: p >= HIGH ? "high" : p >= MEDIUM ? "medium" : "low",
  };
}

/** Probability thresholds for high and medium confidence. */
export const HIGH = 0.9;
export const MEDIUM = 0.7;

/**
 * Trains the network with Adam on standardized inputs. Each class is
 * weighted by 1/√(its count), so rare defects aren't drowned by sound
 * kernels; training stops when the held-out loss stops improving.
 */
export function train(
  examples: Example[],
  options: { epochs?: number; seed?: number; validation?: Example[] } = {},
): LocalModelWeights {
  const random = rng(options.seed ?? 42);
  const classes = [...new Set(examples.map((e) => e.label))].sort();
  const K = classes.length;
  const D = examples[0]!.x.length;
  const idx = new Map(classes.map((c, i) => [c, i]));

  const mean = new Array<number>(D).fill(0);
  const std = new Array<number>(D).fill(0);
  for (const e of examples) e.x.forEach((v, i) => (mean[i]! += v));
  mean.forEach((_, i) => (mean[i]! /= examples.length));
  for (const e of examples)
    e.x.forEach((v, i) => (std[i]! += (v - mean[i]!) ** 2));
  std.forEach((_, i) => (std[i] = Math.sqrt(std[i]! / examples.length) || 1));

  const count = new Array<number>(K).fill(0);
  for (const e of examples) count[idx.get(e.label)!]! += e.weight;
  const classWeight = count.map((c) => 1 / Math.sqrt(Math.max(c, 1)));
  const norm =
    classWeight.reduce((a, b, k) => a + b * count[k]!, 0) /
    count.reduce((a, b) => a + b, 0);
  for (let k = 0; k < K; k++) classWeight[k]! /= norm;

  // He initialisation for the ReLU layer.
  const gauss = () =>
    Math.sqrt(-2 * Math.log(random() || 1e-12)) *
    Math.cos(2 * Math.PI * random());
  const w1 = Array.from({ length: HIDDEN }, () =>
    Array.from({ length: D }, () => gauss() * Math.sqrt(2 / D)),
  );
  const b1 = new Array<number>(HIDDEN).fill(0);
  const w2 = Array.from({ length: K }, () =>
    Array.from({ length: HIDDEN }, () => gauss() * Math.sqrt(1 / HIDDEN)),
  );
  const b2 = new Array<number>(K).fill(0);

  // Adam state, one moment pair per parameter array.
  const params = [w1, b1, w2, b2];
  const zerosLike = (p: unknown): unknown =>
    Array.isArray(p) && Array.isArray(p[0])
      ? (p as number[][]).map((r) => new Array<number>(r.length).fill(0))
      : new Array<number>((p as number[]).length).fill(0);
  const m1 = params.map(zerosLike) as [
    number[][],
    number[],
    number[][],
    number[],
  ];
  const m2 = params.map(zerosLike) as [
    number[][],
    number[],
    number[][],
    number[],
  ];
  const lr = 0.01;
  const decay = 1e-4;
  const beta1 = 0.9;
  const beta2 = 0.999;
  let step = 0;

  const data = examples.map((e) => ({
    z: standardize(e.x, mean, std),
    k: idx.get(e.label)!,
    w: e.weight * classWeight[idx.get(e.label)!]!,
  }));
  const model = (): LocalModelWeights => ({
    classes,
    featureMean: mean,
    featureStd: std,
    w1: w1.map((r) => [...r]),
    b1: [...b1],
    w2: w2.map((r) => [...r]),
    b2: [...b2],
  });
  const lossOn = (set: Example[]) => {
    let loss = 0;
    let n = 0;
    const current = model();
    for (const e of set) {
      const k = idx.get(e.label);
      if (k === undefined) continue;
      loss -= Math.log(Math.max(1e-9, predict(current, e.x)[k]!));
      n++;
    }
    return n ? loss / n : 0;
  };

  const epochs = options.epochs ?? 300;
  const batchSize = 64;
  let bestLoss = Infinity;
  let best = model();
  let sinceBest = 0;
  for (let epoch = 0; epoch < epochs; epoch++) {
    // Shuffle.
    for (let i = data.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [data[i], data[j]] = [data[j]!, data[i]!];
    }
    for (let s = 0; s < data.length; s += batchSize) {
      const batch = data.slice(s, s + batchSize);
      const g1 = w1.map((r) => new Array<number>(r.length).fill(0));
      const gb1 = new Array<number>(HIDDEN).fill(0);
      const g2 = w2.map((r) => new Array<number>(r.length).fill(0));
      const gb2 = new Array<number>(K).fill(0);
      let total = 0;
      for (const { z, k, w } of batch) {
        const pre = b1.map((b, j) => {
          let v = b;
          for (let i = 0; i < D; i++) v += w1[j]![i]! * z[i]!;
          return v;
        });
        const h = pre.map((v) => (v > 0 ? v : 0));
        const logits = b2.map((b, c) => {
          let v = b;
          for (let j = 0; j < HIDDEN; j++) v += w2[c]![j]! * h[j]!;
          return v;
        });
        const max = Math.max(...logits);
        const e = logits.map((v) => Math.exp(v - max));
        const sum = e.reduce((a, b) => a + b, 0);
        const p = e.map((v) => v / sum);
        // Cross-entropy gradient, weighted.
        const dLogit = p.map((v, c) => w * (v - (c === k ? 1 : 0)));
        const dh = new Array<number>(HIDDEN).fill(0);
        for (let c = 0; c < K; c++) {
          gb2[c]! += dLogit[c]!;
          for (let j = 0; j < HIDDEN; j++) {
            g2[c]![j]! += dLogit[c]! * h[j]!;
            dh[j]! += dLogit[c]! * w2[c]![j]!;
          }
        }
        for (let j = 0; j < HIDDEN; j++) {
          if (pre[j]! <= 0) continue;
          gb1[j]! += dh[j]!;
          for (let i = 0; i < D; i++) g1[j]![i]! += dh[j]! * z[i]!;
        }
        total += w;
      }
      step++;
      const grads = [g1, gb1, g2, gb2];
      const scale = 1 / Math.max(total, 1e-9);
      const bc1 = 1 - beta1 ** step;
      const bc2 = 1 - beta2 ** step;
      const update = (
        p: number[],
        g: number[],
        a: number[],
        b: number[],
        reg: boolean,
      ) => {
        for (let i = 0; i < p.length; i++) {
          const gi = g[i]! * scale + (reg ? decay * p[i]! : 0);
          a[i] = beta1 * a[i]! + (1 - beta1) * gi;
          b[i] = beta2 * b[i]! + (1 - beta2) * gi * gi;
          p[i]! -= (lr * (a[i]! / bc1)) / (Math.sqrt(b[i]! / bc2) + 1e-8);
        }
      };
      w1.forEach((row, j) =>
        update(row, grads[0]![j] as number[], m1[0][j]!, m2[0][j]!, true),
      );
      update(b1, gb1, m1[1], m2[1], false);
      w2.forEach((row, c) =>
        update(row, grads[2]![c] as number[], m1[2][c]!, m2[2][c]!, true),
      );
      update(b2, gb2, m1[3], m2[3], false);
    }
    // Early stopping on the held-out kernels (or the training loss).
    const loss = lossOn(
      options.validation?.length ? options.validation : examples,
    );
    if (loss < bestLoss - 1e-4) {
      bestLoss = loss;
      best = model();
      sinceBest = 0;
    } else if (++sinceBest >= 25) break;
  }
  return best;
}

/**
 * How the model does on held-out kernels: accuracy, per class, the
 * confusion matrix, defect recall, and accuracy of its confident verdicts.
 */
export function evaluate(
  model: LocalModelWeights,
  test: Example[],
  soundClass: string,
): Omit<LocalModelMetrics, "trainedOn" | "validatedOn" | "leftOut"> {
  const classes = model.classes;
  const K = classes.length;
  const idx = new Map(classes.map((c, i) => [c, i]));
  const confusion = Array.from({ length: K }, () =>
    new Array<number>(K).fill(0),
  );
  let right = 0;
  let high = 0;
  let highRight = 0;
  let defects = 0;
  let defectsCaught = 0;
  let n = 0;
  for (const e of test) {
    const truth = idx.get(e.label);
    if (truth === undefined) continue;
    const v = verdictOf(model, e.x);
    const guess = idx.get(v.cls)!;
    confusion[truth]![guess]!++;
    n++;
    if (guess === truth) right++;
    if (v.confidence === "high") {
      high++;
      if (guess === truth) highRight++;
    }
    if (e.label !== soundClass) {
      defects++;
      if (v.cls !== soundClass) defectsCaught++;
    }
  }
  const perClass: LocalModelMetrics["perClass"] = {};
  classes.forEach((c, k) => {
    const tp = confusion[k]![k]!;
    const actual = confusion[k]!.reduce((a, b) => a + b, 0);
    const predicted = confusion.reduce((a, row) => a + row[k]!, 0);
    perClass[c] = {
      n: actual,
      precision: predicted ? tp / predicted : 0,
      recall: actual ? tp / actual : 0,
    };
  });
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return {
    accuracy: r(n ? right / n : 0),
    defectRecall: r(defects ? defectsCaught / defects : 1),
    highAccuracy: r(high ? highRight / high : 0),
    highShare: r(n ? high / n : 0),
    perClass: Object.fromEntries(
      Object.entries(perClass).map(([c, v]) => [
        c,
        { n: v.n, precision: r(v.precision), recall: r(v.recall) },
      ]),
    ),
    confusion: { classes, counts: confusion },
  };
}

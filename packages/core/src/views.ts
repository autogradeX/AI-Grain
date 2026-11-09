/*
 * Two views of the same kernels: a camera above and one below a glass tray.
 * The bottom photo is mirrored when it arrives, so both show the kernels
 * the same way round; the cameras may still differ in position, turn and
 * zoom. matchViews finds that difference from the kernels themselves (no
 * calibration) and pairs each kernel with its other side.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Bottom → top: rotate by `angle`, scale by `scale`, then shift. */
export interface Similarity {
  scale: number;
  angle: number;
  tx: number;
  ty: number;
}

export interface ViewMatch {
  /** [index in top, index in bottom] for each kernel seen from both sides. */
  pairs: [number, number][];
  transform: Similarity;
  /** Matched kernels as a share of the smaller view (0–1). */
  share: number;
  /** Mean distance between matched centres after alignment, in top pixels. */
  meanError: number;
}

export function applySimilarity(t: Similarity, p: Pt): Pt {
  const c = Math.cos(t.angle);
  const s = Math.sin(t.angle);
  return {
    x: t.scale * (c * p.x - s * p.y) + t.tx,
    y: t.scale * (s * p.x + c * p.y) + t.ty,
  };
}

/** The similarity (no reflection) that best maps `from` onto `to` (Umeyama). */
function fitSimilarity(from: Pt[], to: Pt[]): Similarity {
  const n = from.length;
  const mf = { x: 0, y: 0 };
  const mt = { x: 0, y: 0 };
  for (let i = 0; i < n; i++) {
    mf.x += from[i]!.x / n;
    mf.y += from[i]!.y / n;
    mt.x += to[i]!.x / n;
    mt.y += to[i]!.y / n;
  }
  let a = 0;
  let b = 0;
  let varF = 0;
  for (let i = 0; i < n; i++) {
    const fx = from[i]!.x - mf.x;
    const fy = from[i]!.y - mf.y;
    const tx = to[i]!.x - mt.x;
    const ty = to[i]!.y - mt.y;
    a += fx * tx + fy * ty;
    b += fx * ty - fy * tx;
    varF += fx * fx + fy * fy;
  }
  const angle = Math.atan2(b, a);
  const scale = varF > 0 ? Math.sqrt(a * a + b * b) / varF : 1;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    scale,
    angle,
    tx: mt.x - scale * (c * mf.x - s * mf.y),
    ty: mt.y - scale * (s * mf.x + c * mf.y),
  };
}

function centroidAndSpread(p: Pt[]) {
  const m = { x: 0, y: 0 };
  for (const q of p) {
    m.x += q.x / p.length;
    m.y += q.y / p.length;
  }
  let r = 0;
  for (const q of p) r += ((q.x - m.x) ** 2 + (q.y - m.y) ** 2) / p.length;
  return { m, r: Math.sqrt(r) || 1 };
}

/** Each moved bottom point and its nearest top point, kept when both are each other's nearest. */
function mutualPairs(top: Pt[], moved: Pt[], maxDist: number) {
  const d2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const nearestTop = moved.map((p) => {
    let best = -1;
    let bd = Infinity;
    top.forEach((q, i) => {
      const d = d2(p, q);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return { i: best, d: bd };
  });
  const nearestBottom = top.map((q) => {
    let best = -1;
    let bd = Infinity;
    moved.forEach((p, j) => {
      const d = d2(p, q);
      if (d < bd) {
        bd = d;
        best = j;
      }
    });
    return best;
  });
  const pairs: [number, number][] = [];
  let err = 0;
  moved.forEach((_, j) => {
    const { i, d } = nearestTop[j]!;
    if (i >= 0 && nearestBottom[i] === j && d <= maxDist * maxDist) {
      pairs.push([i, j]);
      err += Math.sqrt(d);
    }
  });
  return { pairs, err: pairs.length ? err / pairs.length : Infinity };
}

/**
 * Pairs kernels seen from above (`top`) with the same kernels seen from below
 * (`bottom`, already mirrored), by their centres. `maxDist` is how far apart
 * (in top pixels, after alignment) a pair may still be: about half a kernel.
 * Tries the bottom camera turned by 0°, 90°, 180° and 270°, refines each by
 * iterative closest points, and keeps the alignment that pairs the most.
 */
export function matchViews(
  top: Pt[],
  bottom: Pt[],
  maxDist: number,
): ViewMatch {
  const none: ViewMatch = {
    pairs: [],
    transform: { scale: 1, angle: 0, tx: 0, ty: 0 },
    share: 0,
    meanError: Infinity,
  };
  if (top.length < 3 || bottom.length < 3) return none;
  const T = centroidAndSpread(top);
  const B = centroidAndSpread(bottom);
  let best = none;
  for (const turn of [0, 0.5, 1, 1.5]) {
    const angle = turn * Math.PI;
    const scale = T.r / B.r;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    let t: Similarity = {
      scale,
      angle,
      tx: T.m.x - scale * (c * B.m.x - s * B.m.y),
      ty: T.m.y - scale * (s * B.m.x + c * B.m.y),
    };
    // Start wide (the spread of the kernels), tighten to `maxDist`.
    let reach = Math.max(maxDist * 4, T.r * 0.5);
    let found = mutualPairs(
      top,
      bottom.map((p) => applySimilarity(t, p)),
      reach,
    );
    for (let round = 0; round < 40 && found.pairs.length >= 3; round++) {
      t = fitSimilarity(
        found.pairs.map(([, j]) => bottom[j]!),
        found.pairs.map(([i]) => top[i]!),
      );
      reach = Math.max(maxDist, reach * 0.8);
      const next = mutualPairs(
        top,
        bottom.map((p) => applySimilarity(t, p)),
        reach,
      );
      const settled =
        next.pairs.length === found.pairs.length &&
        Math.abs(next.err - found.err) < 1e-6 &&
        reach === maxDist;
      found = next;
      if (settled) break;
    }
    const final = mutualPairs(
      top,
      bottom.map((p) => applySimilarity(t, p)),
      maxDist,
    );
    const share = final.pairs.length / Math.min(top.length, bottom.length);
    if (
      final.pairs.length > best.pairs.length ||
      (final.pairs.length === best.pairs.length && final.err < best.meanError)
    )
      best = { pairs: final.pairs, transform: t, share, meanError: final.err };
  }
  return best;
}

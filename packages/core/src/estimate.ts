import { SOUND, UNCLEAR, type ClassDef } from "./classes.js";
import { summarizePercentages, type MassPercentages } from "./measurement.js";

/** One detected object: its class (null until classified) and its area in board pixels. */
export interface EstimateObject {
  cls: string | null;
  area: number;
}

export interface MassEstimate extends MassPercentages {
  /** Objects detected in the photos. */
  objects: number;
  /** Objects that counted: classified and not unclear. */
  counted: number;
  unclear: number;
  unclassified: number;
  /** Object count per class id, including sound. */
  countByClass: Record<string, number>;
}

/**
 * Estimates mass % per class from the photos alone. Each object's weight is
 * taken as area^1.5 (area to volume, at the same density) times its class's
 * mass factor. Unclear and unclassified objects are left out of both sides.
 * This is an estimate; weighing the cups gives the verified result.
 */
export function estimateFromObjects(
  objects: readonly EstimateObject[],
  classes: readonly ClassDef[],
): MassEstimate {
  const factor = new Map(classes.map((c) => [c.id, c.massFactor ?? 1]));
  const weight: Record<string, number> = {};
  const countByClass: Record<string, number> = {};
  let total = 0;
  let unclear = 0;
  let unclassified = 0;
  let counted = 0;
  for (const o of objects) {
    if (o.cls === null) {
      unclassified++;
      continue;
    }
    countByClass[o.cls] = (countByClass[o.cls] ?? 0) + 1;
    if (o.cls === UNCLEAR) {
      unclear++;
      continue;
    }
    const f = o.cls === SOUND ? 1 : factor.get(o.cls);
    // A class no longer in the crop still counts towards the total, but not as a defect.
    const w = Math.max(0, o.area) ** 1.5 * (f ?? 1);
    weight[o.cls] = (weight[o.cls] ?? 0) + w;
    total += w;
    counted++;
  }
  const byClass: Record<string, number> = {};
  for (const c of classes)
    byClass[c.id] = total > 0 ? ((weight[c.id] ?? 0) / total) * 100 : 0;
  return {
    ...summarizePercentages(byClass, classes),
    objects: objects.length,
    counted,
    unclear,
    unclassified,
    countByClass,
  };
}

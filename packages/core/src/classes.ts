/**
 * Kernel classes are configured per crop. Every defect class belongs to one
 * of four groups, following the structure of EN 15587 impurity ("Besatz")
 * analysis. The sound fraction is reported as purity.
 */
export const CLASS_GROUPS = [
  "admixture",
  "broken_defective",
  "impurity",
  "harmful",
] as const;
export type ClassGroup = (typeof CLASS_GROUPS)[number];

export const GROUP_LABELS: Record<ClassGroup, string> = {
  admixture: "Grain admixtures",
  broken_defective: "Broken & defective",
  impurity: "Impurities & foreign material",
  harmful: "Harmful & disease",
};

/** Reserved class ids: every crop has these. */
export const SOUND = "sound";
export const UNCLEAR = "unclear";

export interface ClassDef {
  /** Lower-case id, e.g. "broken". Stored on kernels and used as a cup key. */
  id: string;
  label: string;
  group: ClassGroup;
  /** What this class means, given to Claude as its definition. */
  description?: string | undefined;
  /**
   * Relative weight of an object of this class compared with a sound kernel
   * of the same projected area, for the image-based mass estimate. 1 when
   * unset; e.g. above 1 for stones, below 1 for husks.
   */
  massFactor?: number | undefined;
}

export interface CropProfile {
  /** Lower-case key, e.g. "wheat". Samples refer to their crop by this key. */
  key: string;
  label: string;
  classes: ClassDef[];
}

/** All ids a kernel can carry for this crop: sound, the defect classes, unclear. */
export function kernelClassIds(classes: readonly ClassDef[]): string[] {
  return [SOUND, ...classes.map((c) => c.id), UNCLEAR];
}

export function classLabel(
  classes: readonly ClassDef[],
  id: string | null | undefined,
): string {
  if (!id) return "Not classified";
  if (id === SOUND) return "Sound";
  if (id === UNCLEAR) return "Unclear";
  return classes.find((c) => c.id === id)?.label ?? id;
}

export function groupOf(
  classes: readonly ClassDef[],
  id: string,
): ClassGroup | null {
  return classes.find((c) => c.id === id)?.group ?? null;
}

export function isClassGroup(value: string): value is ClassGroup {
  return (CLASS_GROUPS as readonly string[]).includes(value);
}

const ID_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

/** Problems with a class list, or an empty array when it is usable. */
export function validateClasses(classes: readonly ClassDef[]): string[] {
  const errors: string[] = [];
  if (classes.length === 0)
    errors.push("a crop needs at least one defect class");
  const seen = new Set<string>();
  for (const c of classes) {
    if (!ID_PATTERN.test(c.id)) {
      errors.push(
        `class id "${c.id}" must be lower-case letters, digits and _, starting with a letter`,
      );
    }
    if (c.id === SOUND || c.id === UNCLEAR)
      errors.push(`"${c.id}" is reserved`);
    if (seen.has(c.id)) errors.push(`class id "${c.id}" is used twice`);
    seen.add(c.id);
    if (!c.label.trim()) errors.push(`class "${c.id}" needs a label`);
    if (!isClassGroup(c.group))
      errors.push(`class "${c.id}" has an unknown group "${String(c.group)}"`);
    if (
      c.massFactor !== undefined &&
      !(c.massFactor > 0 && c.massFactor <= 20)
    ) {
      errors.push(`class "${c.id}" mass factor must be between 0 and 20`);
    }
  }
  return errors;
}

/** Turns a label into a class id: "Pest-damaged" → "pest_damaged". */
export function slugifyClassId(label: string): string {
  const slug = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[a-z]/.test(slug) ? slug : `c_${slug}`.slice(0, 40);
}

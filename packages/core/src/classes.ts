/** Defect classes a kernel can be sorted into. Each class has its own cup on the scale. */
export const DEFECT_CLASSES = [
  "broken",
  "shrivelled",
  "sprouted",
  "heat_damaged",
  "insect_damaged",
  "fusarium_mould",
  "black_point",
  "other_grain",
  "foreign_material",
] as const;

export type DefectClass = (typeof DEFECT_CLASSES)[number];

/** Every label a kernel can carry: sound, a defect, or unclear when the image is too poor to judge. */
export const KERNEL_CLASSES = ["sound", ...DEFECT_CLASSES, "unclear"] as const;

export type KernelClass = (typeof KERNEL_CLASSES)[number];

export const CLASS_LABELS: Record<KernelClass, string> = {
  sound: "Sound",
  broken: "Broken",
  shrivelled: "Shrivelled",
  sprouted: "Sprouted",
  heat_damaged: "Heat-damaged",
  insect_damaged: "Insect-damaged",
  fusarium_mould: "Fusarium / mould",
  black_point: "Black point",
  other_grain: "Other grain",
  foreign_material: "Foreign material",
  unclear: "Unclear",
};

export function isDefectClass(value: string): value is DefectClass {
  return (DEFECT_CLASSES as readonly string[]).includes(value);
}

export function isKernelClass(value: string): value is KernelClass {
  return (KERNEL_CLASSES as readonly string[]).includes(value);
}

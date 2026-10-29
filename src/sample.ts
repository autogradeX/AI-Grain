/** Measurements for a single grain sample. Percentages are 0–100 by weight. */
export interface GrainSample {
  id: string;
  /** Crop type, e.g. "wheat", "corn", "rice". */
  crop: string;
  moisturePct: number;
  /** Test weight in kg/hl. */
  testWeightKgPerHl: number;
  brokenKernelsPct: number;
  foreignMaterialPct: number;
  damagedKernelsPct: number;
}

export function validateSample(sample: GrainSample): string[] {
  const errors: string[] = [];
  const pctFields = [
    "moisturePct",
    "brokenKernelsPct",
    "foreignMaterialPct",
    "damagedKernelsPct",
  ] as const;

  if (sample.id.trim() === "") errors.push("id must not be empty");
  if (sample.crop.trim() === "") errors.push("crop must not be empty");
  for (const field of pctFields) {
    const value = sample[field];
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      errors.push(`${field} must be between 0 and 100`);
    }
  }
  if (
    !Number.isFinite(sample.testWeightKgPerHl) ||
    sample.testWeightKgPerHl <= 0
  ) {
    errors.push("testWeightKgPerHl must be a positive number");
  }
  return errors;
}

export {
  CLASS_GROUPS,
  GROUP_LABELS,
  SOUND,
  UNCLEAR,
  classLabel,
  groupOf,
  isClassGroup,
  kernelClassIds,
  slugifyClassId,
  validateClasses,
} from "./classes.js";
export type { ClassDef, ClassGroup, CropProfile } from "./classes.js";
export { CROP_PRESETS, presetFor } from "./presets.js";
export {
  massPercentages,
  roundPct,
  summarizePercentages,
  validateMeasurement,
} from "./measurement.js";
export type { MassPercentages, Measurement } from "./measurement.js";
export { failedLimits, gradeSample } from "./grading.js";
export type {
  GradeInput,
  GradeResult,
  GradeSpec,
  LimitFailure,
  LimitScope,
} from "./grading.js";
export { summarizeValidation } from "./validation.js";
export type {
  ClassAgreement,
  ComparisonPair,
  ValidationSummary,
} from "./validation.js";
export { apply as applyHomography, homography } from "./homography.js";
export type { Homography, Pt } from "./homography.js";
export { estimateFromObjects } from "./estimate.js";
export type { EstimateObject, MassEstimate } from "./estimate.js";

import type {
  ClassDef,
  ClassGroup,
  GradeResult,
  GradeSpec,
} from "@ai-grain/core";

export type Role = "admin" | "grader" | "viewer";
export type ClaudeModel =
  "claude-sonnet-5-5" | "claude-haiku-5-5" | "claude-opus-5-5";

export const MODEL_LABELS: Record<ClaudeModel, string> = {
  "claude-sonnet-5-5": "Claude Sonnet 5.5 (default)",
  "claude-haiku-5-5": "Claude Haiku 5.5 (lowest cost)",
  "claude-opus-5-5": "Claude Opus 5.5 (difficult samples)",
};

export interface Org {
  id: string;
  name: string;
  defaultModel: ClaudeModel | null;
  effectiveModel: ClaudeModel;
  models: ClaudeModel[];
  claudeConfigured: boolean;
}

export interface Standard {
  id: string;
  name: string;
  crop: string;
  description: string | null;
  grades: GradeSpec[];
  definitions: Partial<Record<string, string>>;
  allowEstimate: boolean;
  archived: boolean;
  updatedAt: string;
}

export interface SampleEstimate {
  byClass: Record<string, number>;
  byGroup: Record<ClassGroup, number>;
  totalDefectsPct: number;
  purityPct: number;
  objects: number;
  counted: number;
  unclear: number;
  unclassified: number;
  countByClass: Record<string, number>;
  grade: GradeResult;
}

export interface Crop {
  id: string;
  key: string;
  label: string;
  classes: ClassDef[];
  archived: boolean;
}

export interface CropProfile {
  key: string;
  label: string;
  classes: ClassDef[];
}

export interface SampleListItem {
  id: string;
  number: number;
  crop: string;
  source: string | null;
  status: "in_progress" | "completed";
  grade: string | null;
  totalDefectsPct: number | null;
  standardName: string | null;
  createdByName: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface SampleResult {
  source?: "weighed" | "estimate";
  byClassPct: Record<string, number>;
  byGroupPct: Record<ClassGroup, number>;
  purityPct: number;
  totalDefectsPct: number;
  grade: GradeResult;
  computedAt: string;
}

export interface ReferenceResult {
  byClassPct: Partial<Record<string, number>>;
  grade: string | null;
  graderName?: string;
  gradedOn?: string;
  notes?: string;
}

export type BatchStatus =
  | "uploaded"
  | "detecting"
  | "detected"
  | "classifying"
  | "classified"
  | "failed";

export interface KernelSummary {
  byClass: Record<string, number>;
  total: number;
  classified: number;
  flagged: number;
  pendingReview: number;
  reviewed: number;
}

export interface Sample {
  id: string;
  number: number;
  crop: string;
  standardId: string | null;
  source: string | null;
  notes: string | null;
  status: "in_progress" | "completed";
  model: ClaudeModel | null;
  effectiveModel: ClaudeModel;
  sampleMassG: number | null;
  moisturePct: number | null;
  testWeightKgPerHl: number | null;
  cupMassG: Partial<Record<string, number>>;
  result: SampleResult | null;
  reference: ReferenceResult | null;
  aiSummary: string | null;
  createdAt: string;
  completedAt: string | null;
  cropProfile: CropProfile;
  /** Mass % estimated from kernel areas in the photos; null until kernels are classified. */
  estimate: SampleEstimate | null;
  standard: Standard | null;
  batches: {
    id: string;
    side: "front" | "crease";
    status: BatchStatus;
    kernelCount: number | null;
    error: string | null;
    createdAt: string;
  }[];
  kernels: KernelSummary;
}

export interface Kernel {
  id: string;
  number: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cell: string;
  isCluster: boolean;
  aiClass: string | null;
  aiConfidence: "high" | "medium" | "low" | null;
  aiReason: string | null;
  finalClass: string | null;
  reviewStatus: "pending" | "confirmed" | "corrected";
  needsReview: boolean;
}

export interface Batch {
  id: string;
  sampleId: string;
  side: "front" | "crease";
  status: BatchStatus;
  error: string | null;
  kernelCount: number | null;
  cropWindowCm: number | null;
  corners: { x: number; y: number }[] | null;
  originalWidth: number;
  originalHeight: number;
  board: { width: number; height: number; pxPerCm: number };
  kernels: Kernel[];
  summary: KernelSummary;
}

export interface ReviewKernel {
  id: string;
  batchId: string;
  side: "front" | "crease";
  number: number;
  cell: string;
  isCluster: boolean;
  aiClass: string | null;
  aiConfidence: "high" | "medium" | "low" | null;
  aiReason: string | null;
  finalClass: string | null;
  reviewStatus: "pending" | "confirmed" | "corrected";
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Invite {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  link?: string;
}

export interface ReferenceImage {
  id: string;
  crop: string;
  cls: string;
  note: string | null;
  createdAt: string;
}

export interface ValidationReport {
  target: { min: number; recommended: number };
  summary: {
    samples: number;
    gradeAgreement: number | null;
    gradeComparable: number;
    byClass: {
      cls: string;
      n: number;
      meanMethodPct: number;
      meanReferencePct: number;
      meanBiasPct: number;
      meanAbsDiffPct: number;
      maxAbsDiffPct: number;
    }[];
  };
  samples: {
    id: string;
    number: number;
    crop: string;
    standardName: string | null;
    completedAt: string;
    methodGrade: string | null;
    referenceGrade: string | null;
  }[];
}

export interface AuditEntry {
  id: string;
  action: string;
  detail: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

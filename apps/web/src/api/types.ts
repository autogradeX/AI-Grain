import type {
  ClassDef,
  ClassGroup,
  GradeResult,
  GradeSpec,
} from "@ai-grain/core";

export type Role = "admin" | "grader" | "viewer";
export type ClaudeModel =
  "claude-sonnet-5-5" | "claude-haiku-5-5" | "claude-opus-5-5";

export interface Org {
  id: string;
  name: string;
  defaultModel: ClaudeModel | null;
  effectiveModel: ClaudeModel;
  models: ClaudeModel[];
  claudeConfigured: boolean;
  /** This organisation runs the public website (demo, hub, enquiries). */
  isSiteOwner: boolean;
  autopilot: AutopilotPolicy;
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

/** How much of a sample the AI handles on its own (organisation setting). */
export interface AutopilotPolicy {
  enabled: boolean;
  spotCheckPct: number;
  autoSummary: boolean;
  /** Kernels the first looks can't settle go to the Advanced tier before a person. */
  expertReview: boolean;
}

/** The standard a sample most likely needs, and why. */
export interface StandardSuggestion {
  standard: { id: string; name: string; allowEstimate: boolean };
  reason:
    | { kind: "usage"; used: number; of: number }
    | { kind: "only" }
    | { kind: "newest" };
}

/** Why a kernel went to a person; null when the AI's verdict stands. */
export type FlagReason =
  | "cluster"
  | "unclear"
  | "low_confidence"
  | "medium_confidence"
  | "defect"
  | "harmful"
  | "disagreement"
  | "spot_check";

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
  /** Kernels waiting for a person. */
  pendingReview: number;
  /** Photos still being processed. */
  processing: boolean;
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
  /** Null when Autopilot completed the sample. */
  completedBy: string | null;
  /** Shown on the public website's demo page. */
  publicDemo: boolean;
  demoTitle: string | null;
  createdAt: string;
  completedAt: string | null;
  cropProfile: CropProfile;
  /** Mass % estimated from kernel areas in the photos; null until kernels are classified. */
  estimate: SampleEstimate | null;
  standard: Standard | null;
  batches: {
    id: string;
    side: "front" | "crease";
    /** The side was read from the photo. */
    sideDetected: boolean;
    status: BatchStatus;
    kernelCount: number | null;
    error: string | null;
    createdAt: string;
  }[];
  kernels: KernelSummary;
  /** All photos are in: Autopilot finishes once nothing waits on a person. */
  autoFinish: boolean;
  autopilot: AutopilotPolicy & {
    /** Kernels whose AI verdict stands without a person. */
    acceptedByAi: number;
    flaggedByReason: Partial<Record<FlagReason, number>>;
    /** Kernels sent to the expert check, and how many it settled. */
    expertAsked: number;
    expertSettled: number;
  };
  /** Set while the sample has no standard. */
  suggestedStandard: StandardSuggestion | null;
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
  aiClass2: string | null;
  aiConfidence2: "high" | "medium" | "low" | null;
  /** The first look's class; aiClass is the expert check's when it ran. */
  firstClass: string | null;
  expertClass: string | null;
  flagReason: FlagReason | null;
  needsReview: boolean;
}

export interface Batch {
  id: string;
  sampleId: string;
  side: "front" | "crease";
  sideDetected: boolean;
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
  aiClass2: string | null;
  firstClass: string | null;
  expertClass: string | null;
  flagReason: FlagReason | null;
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
  /** The summary covers every sample; `samples` is one page of them. */
  total: number;
  limit: number;
  offset: number;
}

export interface AuditEntry {
  id: string;
  action: string;
  detail: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

/** One page of a server-paginated list. */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

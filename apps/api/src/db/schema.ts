import type {
  ClassDef,
  ClassGroup,
  GradeResult,
  GradeSpec,
} from "@ai-grain/core";
import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ["admin", "grader", "viewer"]);
export type Role = (typeof roleEnum.enumValues)[number];

export const tokenPurposeEnum = pgEnum("token_purpose", [
  "verify_email",
  "reset_password",
  "invite",
]);

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  defaultModel: text("default_model"),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull(),
    active: boolean("active").notNull().default(true),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(sql`lower(${t.email})`)],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** All tokens rotated from one login share a family. Reusing a rotated token revokes the family. */
    familyId: uuid("family_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("refresh_tokens_family_idx").on(t.familyId)],
);

/** One-time tokens sent by email: verification, password reset and invites. */
export const authTokens = pgTable("auth_tokens", {
  id: id(),
  purpose: tokenPurposeEnum("purpose").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  email: text("email").notNull(),
  role: roleEnum("role"),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    orgId: uuid("org_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_org_idx").on(t.orgId, t.createdAt)],
);

/** An organisation's crops and their defect classes. Samples, standards and references refer to a crop by key. */
export const crops = pgTable(
  "crops",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    classes: jsonb("classes").$type<ClassDef[]>().notNull(),
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("crops_org_key_idx").on(t.orgId, t.key)],
);

export const standards = pgTable("standards", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  crop: text("crop").notNull(),
  description: text("description"),
  /** Grades in order, strictest first. */
  grades: jsonb("grades").$type<GradeSpec[]>().notNull(),
  /** How this standard describes each defect class, given to Claude as definitions. */
  definitions: jsonb("definitions")
    .$type<Partial<Record<string, string>>>()
    .notNull(),
  /**
   * Whether a sample may be completed on the photo estimate when it wasn't
   * weighed. Off by default: weighing gives the verified result.
   */
  allowEstimate: boolean("allow_estimate").notNull().default(false),
  archived: boolean("archived").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Example kernels from the organisation's own grain, sent to Claude with each request. */
export const referenceImages = pgTable("reference_images", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  crop: text("crop").notNull(),
  cls: text("cls").notNull(),
  storageKey: text("storage_key").notNull(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
});

export const sampleStatusEnum = pgEnum("sample_status", [
  "in_progress",
  "completed",
]);

export interface SampleResult {
  /** "weighed": from the cups on the scale. "estimate": from kernel areas in the photos. Missing means weighed. */
  source?: "weighed" | "estimate";
  byClassPct: Record<string, number>;
  /** Missing on results computed before groups existed. */
  byGroupPct?: Record<ClassGroup, number>;
  totalDefectsPct: number;
  purityPct?: number;
  grade: GradeResult;
  computedAt: string;
}

/** Results from a certified grader for the same sample, used to validate this method. */
export interface ReferenceResult {
  byClassPct: Partial<Record<string, number>>;
  grade: string | null;
  graderName?: string | undefined;
  gradedOn?: string | undefined;
  notes?: string | undefined;
}

export const samples = pgTable(
  "samples",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    crop: text("crop").notNull(),
    standardId: uuid("standard_id").references(() => standards.id, {
      onDelete: "set null",
    }),
    source: text("source"),
    notes: text("notes"),
    status: sampleStatusEnum("status").notNull().default("in_progress"),
    model: text("model"),
    sampleMassG: doublePrecision("sample_mass_g"),
    moisturePct: doublePrecision("moisture_pct"),
    testWeightKgPerHl: doublePrecision("test_weight_kg_per_hl"),
    cupMassG: jsonb("cup_mass_g")
      .$type<Partial<Record<string, number>>>()
      .notNull()
      .default({}),
    result: jsonb("result").$type<SampleResult>(),
    reference: jsonb("reference").$type<ReferenceResult>(),
    aiSummary: text("ai_summary"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    completedBy: uuid("completed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("samples_org_number_idx").on(t.orgId, t.number),
    index("samples_org_created_idx").on(t.orgId, t.createdAt),
  ],
);

export const batchStatusEnum = pgEnum("batch_status", [
  "uploaded",
  "detecting",
  "detected",
  "classifying",
  "classified",
  "failed",
]);
export type BatchStatus = (typeof batchStatusEnum.enumValues)[number];

export interface Point {
  x: number;
  y: number;
}

/** Board corners in original-image pixels: top-left, top-right, bottom-right, bottom-left. */
export type Corners = [Point, Point, Point, Point];

export const batches = pgTable("batches", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  sampleId: uuid("sample_id")
    .notNull()
    .references(() => samples.id, { onDelete: "cascade" }),
  /** "front" for the first photo, "crease" for the optional flipped photo. */
  side: text("side").$type<"front" | "crease">().notNull().default("front"),
  status: batchStatusEnum("status").notNull().default("uploaded"),
  originalKey: text("original_key").notNull(),
  originalWidth: integer("original_width").notNull(),
  originalHeight: integer("original_height").notNull(),
  boardKey: text("board_key"),
  corners: jsonb("corners").$type<Corners>(),
  kernelCount: integer("kernel_count"),
  /** Side of the square crop window, shared by every kernel crop in the batch. */
  cropWindowCm: doublePrecision("crop_window_cm"),
  error: text("error"),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
  /** Changes on every update. A busy batch that stops changing was cut off by a restart. */
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "confirmed",
  "corrected",
]);

export const kernels = pgTable(
  "kernels",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sampleId: uuid("sample_id")
      .notNull()
      .references(() => samples.id, { onDelete: "cascade" }),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    /** 1-based number within the batch, as shown to Claude and on screen. */
    number: integer("number").notNull(),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    w: integer("w").notNull(),
    h: integer("h").notNull(),
    area: integer("area").notNull(),
    cell: text("cell").notNull(),
    /** Unusually large blob: probably kernels touching. The operator should separate them. */
    isCluster: boolean("is_cluster").notNull().default(false),
    cropKey: text("crop_key").notNull(),
    aiClass: text("ai_class"),
    aiConfidence: text("ai_confidence").$type<"high" | "medium" | "low">(),
    aiReason: text("ai_reason"),
    finalClass: text("final_class"),
    reviewStatus: reviewStatusEnum("review_status")
      .notNull()
      .default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [
    index("kernels_batch_idx").on(t.batchId, t.number),
    index("kernels_sample_idx").on(t.sampleId),
  ],
);

export const analysisRuns = pgTable("analysis_runs", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  sampleId: uuid("sample_id")
    .notNull()
    .references(() => samples.id, { onDelete: "cascade" }),
  batchId: uuid("batch_id").references(() => batches.id, {
    onDelete: "cascade",
  }),
  kind: text("kind").$type<"classify" | "summary">().notNull(),
  model: text("model").notNull(),
  requests: integer("requests").notNull().default(0),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
  durationMs: integer("duration_ms"),
  error: text("error"),
  createdAt: createdAt(),
});

import type {
  ClassDef,
  ClassGroup,
  DimensionSummary,
  GradeResult,
  GradeSpec,
} from "@ai-grain/core";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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

/** Public website settings, kept on the site owner's organisation. */
export interface SiteSettings {
  bookingUrl?: string;
  contactEmail?: string;
  phone?: string;
  address?: string;
}

/**
 * Autopilot: how much of a sample the AI handles on its own. Stored as set by
 * an admin; missing keys take the defaults in `autopilotOf`.
 */
export interface AutopilotSettings {
  /** Find corners, classify, get a second opinion and finish without buttons. */
  enabled?: boolean;
  /** Share of AI-accepted kernels sent to a person anyway, to keep measuring accuracy. */
  spotCheckPct?: number;
  /** Write the plain-language summary when a sample finishes. */
  autoSummary?: boolean;
  /** Send kernels the first two looks couldn't settle to the Advanced tier before a person. */
  expertReview?: boolean;
}

/** The PDF report's layout, set per organisation. */
export interface ReportSettings {
  /** Replaces "Grain screening report" as the title. */
  title?: string;
  /** Lines under the title: address, licence number, lab name. */
  header?: string;
  /** Printed at the bottom of every page. */
  footer?: string;
  /** Signature lines at the end, e.g. "Assayer", "Mandi Secretary". */
  signatures?: string[];
  showBoards?: boolean;
  showGallery?: boolean;
  showDimensions?: boolean;
  showSummary?: boolean;
}

/** Measuring kernel size in photos without the grid board. */
export interface MeasurementSettings {
  /** Diameter of the reference coin placed beside the kernels, in mm. */
  referenceMm?: number;
}

/** When the organisation's own local model classifies kernels. */
export interface LocalModelSettings {
  /**
   * "offline": when Model Orchestration can't be reached (default).
   * "always": the local model only, Model Orchestration is never asked.
   * "off": never; photos wait for internet.
   */
  mode?: "offline" | "always" | "off";
  /** Training in progress, by crop: when it started (cleared when done). */
  training?: Record<string, string>;
}

/** Where completed results are pushed (APMC, eNAM bridge, ERP). */
export interface IntegrationSettings {
  webhookUrl?: string;
  /** Signs each delivery (HMAC-SHA256), so the receiver can check it came from here. */
  webhookSecret?: string;
  /**
   * A station's central AI-Grain server (https://…): results and
   * certificates are sent there, and report QR codes point to it.
   */
  centralUrl?: string;
  /** API key (station scope) issued by the central server. */
  centralKey?: string;
}

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  defaultModel: text("default_model"),
  site: jsonb("site").$type<SiteSettings>().notNull().default({}),
  autopilot: jsonb("autopilot")
    .$type<AutopilotSettings>()
    .notNull()
    .default({}),
  report: jsonb("report").$type<ReportSettings>().notNull().default({}),
  localModel: jsonb("local_model")
    .$type<LocalModelSettings>()
    .notNull()
    .default({}),
  measurement: jsonb("measurement")
    .$type<MeasurementSettings>()
    .notNull()
    .default({}),
  integration: jsonb("integration")
    .$type<IntegrationSettings>()
    .notNull()
    .default({}),
  createdAt: createdAt(),
});

/**
 * Keys for systems that read results (APMC, eNAM bridge, ERP). Only a hash
 * is stored; the key is shown once when created.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** "read": reads results. "station": a mandi station sends its results and certificates. */
    scope: text("scope").$type<"read" | "station">().notNull().default("read"),
    /** First characters of the key, to tell keys apart in the list. */
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("api_keys_hash_idx").on(t.keyHash)],
);

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
    /** All photos are taken: Autopilot finishes the sample once nothing waits on a person. */
    autoFinish: boolean("auto_finish").notNull().default(false),
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
    /** Size of the sound kernels, saved when the sample completes. */
    dimensions: jsonb("dimensions").$type<DimensionSummary>(),
    /** A second run of the same physical sample, to measure repeatability. */
    repeatOf: uuid("repeat_of").references((): AnyPgColumn => samples.id, {
      onDelete: "set null",
    }),
    /** Set by a device that created the sample offline, so a retried upload doesn't create it twice. */
    clientRef: text("client_ref"),
    /** Shown on the public website's interactive demo. Only the site owner's completed samples. */
    publicDemo: boolean("public_demo").notNull().default(false),
    demoTitle: text("demo_title"),
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
    uniqueIndex("samples_org_client_ref_idx").on(t.orgId, t.clientRef),
  ],
);

export const batchStatusEnum = pgEnum("batch_status", [
  "uploaded",
  "detecting",
  "detected",
  "classifying",
  "classified",
  "failed",
  /** Model Orchestration couldn't be reached (no internet): retried by itself. */
  "waiting",
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
  /** The side wasn't given at upload: Model Orchestration reads it from the photo. */
  sideDetected: boolean("side_detected").notNull().default(false),
  status: batchStatusEnum("status").notNull().default("uploaded"),
  originalKey: text("original_key").notNull(),
  originalWidth: integer("original_width").notNull(),
  originalHeight: integer("original_height").notNull(),
  boardKey: text("board_key"),
  corners: jsonb("corners").$type<Corners>(),
  /** The corners sit on the 1 cm grid, so sizes in mm are right. False for photos without the grid board. */
  scaleKnown: boolean("scale_known").notNull().default(true),
  kernelCount: integer("kernel_count"),
  /** Kernels including those in touching groups, counted by area. */
  grainCount: integer("grain_count"),
  /**
   * Millimetres per straightened-board pixel when a reference coin gave the
   * scale (photo without the board); null: the board's own 0.1 mm.
   */
  mmPerPx: doublePrecision("mm_per_px"),
  /** Side of the square crop window, shared by every kernel crop in the batch. */
  cropWindowCm: doublePrecision("crop_window_cm"),
  /** Waiting for Model Orchestration: when to try again, and how often it was tried. */
  retryAt: timestamp("retry_at", { withTimezone: true }),
  retries: integer("retries").notNull().default(0),
  /** Set by a device that queued the photo offline, so a retried upload isn't stored twice. */
  clientRef: text("client_ref").unique(),
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

export type FlagReason =
  | "cluster"
  | "unclear"
  | "low_confidence"
  | "medium_confidence"
  | "defect"
  | "harmful"
  | "disagreement"
  | "spot_check";

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
    /** Longest dimension and the breadth across it, measured in the photo. Null when it couldn't be measured. */
    lengthMm: doublePrecision("length_mm"),
    widthMm: doublePrecision("width_mm"),
    cropKey: text("crop_key").notNull(),
    aiClass: text("ai_class"),
    aiConfidence: text("ai_confidence").$type<"high" | "medium" | "low">(),
    aiReason: text("ai_reason"),
    /** Who gave aiClass: Model Orchestration (online), or the local model (offline). */
    aiSource: text("ai_source").$type<"orchestration" | "local">(),
    /**
     * Colour, texture and shape measurements of the kernel's crop, for the
     * local model (see imaging/features.ts). Null for kernels detected before.
     */
    features: jsonb("features").$type<number[]>(),
    /** Second, independent verdict (Autopilot), on a sheet with different neighbours. */
    aiClass2: text("ai_class2"),
    aiConfidence2: text("ai_confidence2").$type<"high" | "medium" | "low">(),
    /**
     * Expert verdict (Autopilot, Advanced tier) for kernels the first two
     * looks couldn't settle. When present it is the AI's verdict.
     */
    expertClass: text("expert_class"),
    expertConfidence: text("expert_confidence").$type<
      "high" | "medium" | "low"
    >(),
    expertReason: text("expert_reason"),
    /**
     * Why a person must look at this kernel; null when the AI's verdict stands.
     * Set by triage after classification.
     */
    flagReason: text("flag_reason").$type<FlagReason>(),
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
  kind: text("kind")
    .$type<"classify" | "second_opinion" | "expert" | "summary" | "local">()
    .notNull(),
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

export const certificateStatusEnum = pgEnum("certificate_status", [
  "valid",
  "withdrawn",
]);

/** What a certificate vouches for: a frozen copy of the completed sample's result. */
export interface CertificatePayload {
  version: number;
  code: string;
  organisation: string;
  sample: {
    number: number;
    crop: string;
    source: string | null;
    standard: string | null;
  };
  result: {
    source: "weighed" | "estimate";
    grade: string | null;
    purityPct: number;
    totalDefectsPct: number;
    byGroupPct: Record<string, number>;
    byClassPct: { id: string; label: string; group: string; pct: number }[];
  };
  measurements: {
    sampleMassG: number | null;
    moisturePct: number | null;
    testWeightKgPerHl: number | null;
  };
  kernels: { total: number; flagged: number; reviewed: number };
  model: string;
  operators: string[];
  completedAt: string;
  issuedAt: string;
}

/**
 * Issued when a sample is completed. The hash covers the payload, so anyone
 * with the code can check that a report's figures are genuine and unchanged.
 * Reopening the sample withdraws the certificate; completing again issues a
 * new version.
 */
export const certificates = pgTable(
  "certificates",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sampleId: uuid("sample_id")
      .notNull()
      .references(() => samples.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    version: integer("version").notNull(),
    payload: jsonb("payload").$type<CertificatePayload>().notNull(),
    payloadHash: text("payload_hash").notNull(),
    status: certificateStatusEnum("status").notNull().default("valid"),
    issuedBy: uuid("issued_by").references(() => users.id, {
      onDelete: "set null",
    }),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    withdrawnReason: text("withdrawn_reason"),
  },
  (t) => [index("certificates_sample_idx").on(t.sampleId, t.version)],
);

export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "closed",
]);

/** Messages sent through the public website's contact form. */
export const leads = pgTable(
  "leads",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company"),
    phone: text("phone"),
    message: text("message").notNull(),
    status: leadStatusEnum("status").notNull().default("new"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("leads_org_idx").on(t.orgId, t.createdAt)],
);

export const articleKindEnum = pgEnum("article_kind", [
  "guide",
  "glossary",
  "news",
  "case_study",
]);
export type ArticleKind = (typeof articleKindEnum.enumValues)[number];

/** Knowledge hub content on the public website, written in Markdown. */
export const articles = pgTable(
  "articles",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    kind: articleKindEnum("kind").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    body: text("body").notNull(),
    published: boolean("published").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("articles_org_slug_idx").on(t.orgId, t.slug)],
);

/**
 * Results waiting to be sent to connected systems (the webhook, a station's
 * central server). Kept until delivered and retried with growing pauses, so
 * nothing is lost while the internet is down.
 */
export const outbox = pgTable(
  "outbox",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    target: text("target").$type<"webhook" | "central">().notNull(),
    event: text("event").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [index("outbox_due_idx").on(t.deliveredAt, t.nextAttemptAt)],
);

/**
 * Certificates issued by mandi stations and received by this (central)
 * server, so anyone can verify a station's report here.
 */
export const remoteCertificates = pgTable(
  "remote_certificates",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** The station's name (its organisation) and its sample id. */
    station: text("station").notNull(),
    stationSampleId: text("station_sample_id").notNull(),
    code: text("code").notNull().unique(),
    version: integer("version").notNull(),
    payload: jsonb("payload").$type<CertificatePayload>().notNull(),
    payloadHash: text("payload_hash").notNull(),
    status: certificateStatusEnum("status").notNull().default("valid"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    withdrawnReason: text("withdrawn_reason"),
    /** The full result as the station sent it (ai-grain/assaying-result@1). */
    result: jsonb("result").$type<Record<string, unknown>>(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("remote_certificates_sample_idx").on(t.orgId, t.stationSampleId),
  ],
);

/** A trained local model's numbers (see modules/localmodel/model.ts). */
export interface LocalModelWeights {
  classes: string[];
  featureMean: number[];
  featureStd: number[];
  w1: number[][];
  b1: number[];
  w2: number[][];
  b2: number[];
}

/** How a local model did on kernels held back from training. */
export interface LocalModelMetrics {
  accuracy: number;
  /** Share of defective kernels it called defective (any defect class). */
  defectRecall: number;
  /** Accuracy on its confident (high) verdicts, and their share. */
  highAccuracy: number;
  highShare: number;
  perClass: Record<string, { n: number; precision: number; recall: number }>;
  confusion: { classes: string[]; counts: number[][] };
  trainedOn: number;
  validatedOn: number;
  /** Classes with too few examples, left out of the model. */
  leftOut: Record<string, number>;
}

/**
 * The organisation's own model for a crop, trained on its reviewed kernels:
 * classifies on the station's CPU when Model Orchestration can't be reached.
 */
export const localModels = pgTable(
  "local_models",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    crop: text("crop").notNull(),
    version: integer("version").notNull(),
    weights: jsonb("weights").$type<LocalModelWeights>().notNull(),
    metrics: jsonb("metrics").$type<LocalModelMetrics>().notNull(),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [index("local_models_org_crop_idx").on(t.orgId, t.crop, t.version)],
);

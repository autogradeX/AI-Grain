import {
  CLASS_GROUPS,
  GROUP_LABELS,
  summarizePercentages,
} from "@ai-grain/core";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { AppContext } from "../../context.js";
import {
  apiKeys,
  certificates,
  organizations,
  samples,
} from "../../db/schema.js";
import { enqueue } from "./outbox.js";
import { kernelSummary } from "../batches/service.js";
import { currentCertificate } from "../certificates/service.js";
import { ensureCrop } from "../crops/service.js";
import type { SampleRow } from "../samples/service.js";
import { getStandard } from "../standards/routes.js";

/** Version of the result format, so receivers can tell changes apart. */
export const RESULT_SCHEMA = "ai-grain/assaying-result@1";

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface AssayParameter {
  /** Stable id: a class id, a group id, or moisture / test_weight / length / breadth / lb_ratio. */
  code: string;
  name: string;
  kind: "class" | "group" | "measurement";
  group?: string;
  value: number | null;
  unit: string;
}

/**
 * A completed sample as an assaying result, in the shape APMC, eNAM bridges
 * and ERP systems need: one parameter per physical quality parameter (each
 * defect class and group, moisture, test weight, kernel size), with the
 * grade and the certificate anyone can verify.
 */
export async function assayingResult(ctx: AppContext, sample: SampleRow) {
  const crop = await ensureCrop(ctx, sample.orgId, sample.crop);
  const [org] = await ctx.db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, sample.orgId));
  const standard = sample.standardId
    ? await getStandard(ctx, sample.orgId, sample.standardId)
    : null;
  const cert = await currentCertificate(ctx, sample.id);
  const kernels = await kernelSummary(ctx, { sampleId: sample.id });
  const pct = sample.result
    ? summarizePercentages(sample.result.byClassPct, crop.classes)
    : null;
  const parameters: AssayParameter[] = [];
  for (const g of CLASS_GROUPS) {
    const inGroup = crop.classes.filter((c) => c.group === g);
    if (!inGroup.length) continue;
    parameters.push({
      code: g,
      name: GROUP_LABELS[g],
      kind: "group",
      value: pct ? r2(pct.byGroup[g]) : null,
      unit: "%",
    });
    for (const c of inGroup) {
      parameters.push({
        code: c.id,
        name: c.label,
        kind: "class",
        group: g,
        value: pct ? r2(pct.byClass[c.id] ?? 0) : null,
        unit: "%",
      });
    }
  }
  const d = sample.dimensions;
  parameters.push(
    {
      code: "moisture",
      name: "Moisture",
      kind: "measurement",
      value: sample.moisturePct,
      unit: "%",
    },
    {
      code: "test_weight",
      name: "Test weight",
      kind: "measurement",
      value: sample.testWeightKgPerHl,
      unit: "kg/hl",
    },
    {
      code: "length",
      name: "Mean kernel length",
      kind: "measurement",
      value: d?.meanLengthMm ?? null,
      unit: "mm",
    },
    {
      code: "breadth",
      name: "Mean kernel breadth",
      kind: "measurement",
      value: d?.meanBreadthMm ?? null,
      unit: "mm",
    },
    {
      code: "lb_ratio",
      name: "Length / breadth ratio",
      kind: "measurement",
      value: d?.meanLb ?? null,
      unit: "",
    },
  );
  return {
    schema: RESULT_SCHEMA,
    sampleId: sample.id,
    sampleNumber: sample.number,
    lot: sample.source,
    organisation: org?.name ?? null,
    commodity: { key: crop.key, name: crop.label },
    status: sample.status,
    assayedAt: sample.completedAt?.toISOString() ?? null,
    standard: standard?.name ?? null,
    grade: sample.result?.grade.grade ?? null,
    /** "weighed": cups on the scale. "estimate": from kernel areas in the photos. */
    resultSource: sample.result ? (sample.result.source ?? "weighed") : null,
    purityPct: pct ? r2(pct.purityPct) : null,
    totalDefectsPct: pct ? r2(pct.totalDefectsPct) : null,
    sampleMassG: sample.sampleMassG,
    parameters,
    kernels: {
      analysed: kernels.total,
      checkedByPerson: kernels.reviewed,
      /** Suspected artificial (fake) grains not yet checked, and those a person confirmed. */
      artificialSuspected: kernels.artificialSuspected,
      artificialConfirmed: kernels.artificialConfirmed,
    },
    repeatOf: sample.repeatOf,
    certificate: cert
      ? {
          code: cert.code,
          version: cert.version,
          sha256: cert.payloadHash,
          verifyUrl: `${await verifyBase(ctx, sample.orgId)}/verify/${cert.code}`,
        }
      : null,
  };
}

export type AssayingResult = Awaited<ReturnType<typeof assayingResult>>;

// --- API keys -------------------------------------------------------------

const KEY_PREFIX = "agk_";

export const hashKey = (key: string) =>
  createHash("sha256").update(key).digest("hex");

/** A new key: shown once, only its hash is stored. */
export function newApiKey() {
  const key = KEY_PREFIX + randomBytes(24).toString("base64url");
  return { key, prefix: key.slice(0, 12), keyHash: hashKey(key) };
}

/** The organisation, scope and name of an API key, or null when unknown or revoked. */
export async function orgForKey(
  ctx: AppContext,
  key: string,
): Promise<{
  id: string;
  orgId: string;
  scope: "read" | "station";
  name: string;
} | null> {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const [row] = await ctx.db
    .select({
      id: apiKeys.id,
      orgId: apiKeys.orgId,
      scope: apiKeys.scope,
      name: apiKeys.name,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashKey(key)), isNull(apiKeys.revokedAt)));
  if (!row) return null;
  await ctx.db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id));
  return { id: row.id, orgId: row.orgId, scope: row.scope, name: row.name };
}

// --- Webhooks -------------------------------------------------------------

export const signBody = (secret: string, body: string) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

export const newWebhookSecret = () =>
  `whsec_${randomBytes(24).toString("base64url")}`;

/**
 * Sends one event to the organisation's webhook, once, signed (the "Send a
 * test" button). Results themselves go through the outbox, which retries
 * until they are delivered.
 */
export async function sendWebhook(
  ctx: AppContext,
  orgId: string,
  event: string,
  data: unknown,
): Promise<{ delivered: boolean; status: number | null; error?: string }> {
  const [org] = await ctx.db
    .select({ integration: organizations.integration })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  const integration = org?.integration;
  if (!integration?.webhookUrl || !integration.webhookSecret)
    return { delivered: false, status: null, error: "No webhook set up" };
  const id = randomBytes(12).toString("hex");
  const body = JSON.stringify({
    id,
    event,
    createdAt: new Date().toISOString(),
    data,
  });
  try {
    const res = await (ctx.fetch ?? fetch)(integration.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "AI-Grain/1",
        "x-aigrain-event": event,
        "x-aigrain-delivery": id,
        "x-aigrain-signature": signBody(integration.webhookSecret, body),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    return { delivered: res.ok, status: res.status };
  } catch (err) {
    return {
      delivered: false,
      status: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Where certificates are verified: the central server for a station, else this server. */
export async function verifyBase(ctx: AppContext, orgId: string) {
  const [org] = await ctx.db
    .select({ integration: organizations.integration })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  return (org?.integration.centralUrl ?? ctx.config.APP_URL).replace(
    /\/+$/,
    "",
  );
}

/** The certificate as a station sends it to its central server. */
function certificateForCentral(cert: typeof certificates.$inferSelect) {
  return {
    code: cert.code,
    version: cert.version,
    payload: cert.payload,
    payloadHash: cert.payloadHash,
    issuedAt: cert.issuedAt.toISOString(),
  };
}

/**
 * After a sample completes: queue its result for the webhook, and its
 * result and certificate for the central server, when they are set up.
 */
export async function notifyCompleted(
  ctx: AppContext,
  sampleId: string,
): Promise<void> {
  const [sample] = await ctx.db
    .select()
    .from(samples)
    .where(eq(samples.id, sampleId));
  if (!sample || sample.status !== "completed") return;
  const result = await assayingResult(ctx, sample);
  const cert = await currentCertificate(ctx, sample.id);
  await enqueue(ctx, sample.orgId, "sample.completed", {
    webhook: result,
    ...(cert && {
      central: { result, certificate: certificateForCentral(cert) },
    }),
  });
}

/** After a sample is reopened: its certificates no longer stand, wherever they were sent. */
export async function notifyWithdrawn(
  ctx: AppContext,
  orgId: string,
  sampleId: string,
  codes: string[],
  reason: string,
): Promise<void> {
  if (!codes.length) return;
  const data = { sampleId, codes, reason };
  await enqueue(ctx, orgId, "certificate.withdrawn", {
    webhook: data,
    central: data,
  });
}

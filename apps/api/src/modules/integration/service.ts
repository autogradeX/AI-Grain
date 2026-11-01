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
  organizations,
  samples,
  type IntegrationSettings,
} from "../../db/schema.js";
import { audit } from "../../lib/audit.js";
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
    },
    repeatOf: sample.repeatOf,
    certificate: cert
      ? {
          code: cert.code,
          version: cert.version,
          sha256: cert.payloadHash,
          verifyUrl: `${ctx.config.APP_URL}/verify/${cert.code}`,
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

/** The organisation an API key belongs to, or null when unknown or revoked. */
export async function orgForKey(
  ctx: AppContext,
  key: string,
): Promise<string | null> {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const [row] = await ctx.db
    .select({ id: apiKeys.id, orgId: apiKeys.orgId })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashKey(key)), isNull(apiKeys.revokedAt)));
  if (!row) return null;
  await ctx.db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id));
  return row.orgId;
}

// --- Webhooks -------------------------------------------------------------

export const signBody = (secret: string, body: string) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

export const newWebhookSecret = () =>
  `whsec_${randomBytes(24).toString("base64url")}`;

/**
 * Sends one event to the organisation's webhook, with an HMAC signature, and
 * up to three attempts. Returns whether it was delivered. A receiver that
 * misses one (or this instance stopping mid-retry) can catch up from
 * GET /api/v1/results?since=… .
 */
export async function sendWebhook(
  ctx: AppContext,
  orgId: string,
  event: string,
  data: unknown,
  settings?: IntegrationSettings,
): Promise<{ delivered: boolean; status: number | null; error?: string }> {
  let integration = settings;
  if (!integration) {
    const [org] = await ctx.db
      .select({ integration: organizations.integration })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    integration = org?.integration;
  }
  if (!integration?.webhookUrl || !integration.webhookSecret)
    return { delivered: false, status: null, error: "No webhook set up" };
  const id = randomBytes(12).toString("hex");
  const body = JSON.stringify({
    id,
    event,
    createdAt: new Date().toISOString(),
    data,
  });
  const send = ctx.fetch ?? fetch;
  let last: { status: number | null; error?: string } = { status: null };
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0)
      await new Promise((r) => setTimeout(r, attempt * attempt * 1000));
    try {
      const res = await send(integration.webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "AI-Grain-Webhook/1",
          "x-aigrain-event": event,
          "x-aigrain-delivery": id,
          "x-aigrain-signature": signBody(integration.webhookSecret, body),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      last = { status: res.status };
      if (res.ok) {
        await audit(ctx.db, {
          orgId,
          userId: null,
          action: "integration.webhook_delivered",
          detail: { event, id, status: res.status },
        });
        return { delivered: true, status: res.status };
      }
    } catch (err) {
      last = {
        status: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  await audit(ctx.db, {
    orgId,
    userId: null,
    action: "integration.webhook_failed",
    detail: { event, id, ...last },
  });
  return { delivered: false, ...last };
}

/** After a sample completes: push its result to the webhook, when one is set up. */
export async function notifyCompleted(
  ctx: AppContext,
  sampleId: string,
): Promise<void> {
  const [sample] = await ctx.db
    .select()
    .from(samples)
    .where(eq(samples.id, sampleId));
  if (!sample || sample.status !== "completed") return;
  const [org] = await ctx.db
    .select({ integration: organizations.integration })
    .from(organizations)
    .where(eq(organizations.id, sample.orgId));
  if (!org?.integration.webhookUrl) return;
  await sendWebhook(
    ctx,
    sample.orgId,
    "sample.completed",
    await assayingResult(ctx, sample),
    org.integration,
  );
}

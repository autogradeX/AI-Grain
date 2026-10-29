import { createHash, randomInt } from "node:crypto";
import { roundPct, summarizePercentages } from "@ai-grain/core";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../context.js";
import {
  certificates,
  organizations,
  samples,
  standards,
  users,
  type CertificatePayload,
} from "../../db/schema.js";
import { kernelSummary, modelFor } from "../batches/service.js";
import { ensureCrop } from "../crops/service.js";

/** No 0/O, 1/I/L, U: codes are read off paper and typed in. */
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

/** 12 random characters as XXXX-XXXX-XXXX: about 59 bits, too many to guess. */
export function newCertificateCode(): string {
  let raw = "";
  for (let i = 0; i < 12; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export function normalizeCode(code: string): string {
  const raw = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.length === 12
    ? `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`
    : raw;
}

/** JSON with object keys sorted at every level, so the same data always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function hashPayload(payload: CertificatePayload): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

/** Issues a new certificate version for a just-completed sample. */
export async function issueCertificate(
  ctx: AppContext,
  sampleId: string,
  issuedBy: string,
) {
  const [row] = await ctx.db
    .select({
      sample: samples,
      orgName: organizations.name,
      standardName: standards.name,
    })
    .from(samples)
    .innerJoin(organizations, eq(organizations.id, samples.orgId))
    .leftJoin(standards, eq(standards.id, samples.standardId))
    .where(eq(samples.id, sampleId));
  if (!row?.sample.result || !row.sample.completedAt)
    throw new Error("Only completed samples get a certificate");
  const { sample } = row;
  const result = sample.result!;
  const crop = await ensureCrop(ctx, sample.orgId, sample.crop);
  const pct = summarizePercentages(result.byClassPct, crop.classes);
  const kernels = await kernelSummary(ctx, { sampleId });
  const operatorIds = [sample.createdBy, sample.completedBy].filter(
    (v): v is string => !!v,
  );
  const operators = operatorIds.length
    ? await ctx.db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, operatorIds))
    : [];
  const [last] = await ctx.db
    .select({ version: certificates.version })
    .from(certificates)
    .where(eq(certificates.sampleId, sampleId))
    .orderBy(desc(certificates.version))
    .limit(1);
  const version = (last?.version ?? 0) + 1;
  const code = newCertificateCode();
  const r3 = (n: number) => roundPct(n, 3);

  const payload: CertificatePayload = {
    version,
    code,
    organisation: row.orgName,
    sample: {
      number: sample.number,
      crop: crop.label,
      source: sample.source,
      standard: row.standardName,
    },
    result: {
      source: result.source ?? "weighed",
      grade: result.grade.grade,
      purityPct: r3(pct.purityPct),
      totalDefectsPct: r3(pct.totalDefectsPct),
      byGroupPct: Object.fromEntries(
        Object.entries(pct.byGroup).map(([g, v]) => [g, r3(v)]),
      ),
      byClassPct: crop.classes.map((c) => ({
        id: c.id,
        label: c.label,
        group: c.group,
        pct: r3(pct.byClass[c.id] ?? 0),
      })),
    },
    measurements: {
      sampleMassG: sample.sampleMassG,
      moisturePct: sample.moisturePct,
      testWeightKgPerHl: sample.testWeightKgPerHl,
    },
    kernels: {
      total: kernels.total,
      flagged: kernels.flagged,
      reviewed: kernels.reviewed,
    },
    model: await modelFor(ctx, sampleId),
    operators: [
      ...new Set(
        operatorIds.map(
          (id) => operators.find((o) => o.id === id)?.name ?? "unknown",
        ),
      ),
    ],
    completedAt: sample.completedAt!.toISOString(),
    issuedAt: new Date().toISOString(),
  };
  const [cert] = await ctx.db
    .insert(certificates)
    .values({
      orgId: sample.orgId,
      sampleId,
      code,
      version,
      payload,
      payloadHash: hashPayload(payload),
      issuedBy,
      issuedAt: new Date(payload.issuedAt),
    })
    .returning();
  return cert!;
}

/** Withdraws the sample's valid certificates, for example when it is reopened. */
export async function withdrawCertificates(
  ctx: AppContext,
  sampleId: string,
  reason: string,
): Promise<void> {
  await ctx.db
    .update(certificates)
    .set({
      status: "withdrawn",
      withdrawnAt: new Date(),
      withdrawnReason: reason,
    })
    .where(
      and(
        eq(certificates.sampleId, sampleId),
        eq(certificates.status, "valid"),
      ),
    );
}

export async function currentCertificate(ctx: AppContext, sampleId: string) {
  const [cert] = await ctx.db
    .select()
    .from(certificates)
    .where(
      and(
        eq(certificates.sampleId, sampleId),
        eq(certificates.status, "valid"),
      ),
    )
    .orderBy(desc(certificates.version))
    .limit(1);
  return cert ?? null;
}

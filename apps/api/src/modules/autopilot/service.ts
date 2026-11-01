import {
  CLASS_GROUPS,
  classLabel,
  GROUP_LABELS,
  roundPct,
  summarizePercentages,
} from "@ai-grain/core";
import { and, eq, inArray } from "drizzle-orm";
import type { KernelVerdict } from "../../ai/classifier.js";
import type { AppContext } from "../../context.js";
import {
  analysisRuns,
  batches,
  kernels,
  organizations,
  samples,
  type Corners,
  type FlagReason,
} from "../../db/schema.js";
import { audit } from "../../lib/audit.js";
import {
  busyBatches,
  classifyBatch,
  classifyKernels,
  dimensionsFor,
  kernelSummary,
  markClassified,
  mix,
  modelFor,
  processBatch,
} from "../batches/service.js";
import { issueCertificate } from "../certificates/service.js";
import { notifyCompleted } from "../integration/service.js";
import { prepareReport } from "../reports/service.js";
import { ensureCrop } from "../crops/service.js";
import {
  estimateFor,
  estimateResult,
  measurementOf,
  refreshResult,
  type SampleRow,
} from "../samples/service.js";
import { getStandard } from "../standards/routes.js";
import {
  autopilotOf,
  flagFor,
  wantsExpert,
  wantsSecondOpinion,
  type AutopilotPolicy,
} from "./triage.js";

export async function policyForOrg(
  ctx: AppContext,
  orgId: string,
): Promise<AutopilotPolicy> {
  const [org] = await ctx.db
    .select({ autopilot: organizations.autopilot })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  return autopilotOf(org?.autopilot);
}

async function batchContext(ctx: AppContext, batchId: string) {
  const [row] = await ctx.db
    .select({ batch: batches, sample: samples })
    .from(batches)
    .innerJoin(samples, eq(samples.id, batches.sampleId))
    .where(eq(batches.id, batchId));
  if (!row) return null;
  const crop = await ensureCrop(ctx, row.sample.orgId, row.sample.crop);
  const policy = await policyForOrg(ctx, row.sample.orgId);
  return { ...row, classes: crop.classes, policy };
}

/** An independent second verdict for the kernels triage needs one for. */
export async function secondOpinion(
  ctx: AppContext,
  batchId: string,
): Promise<void> {
  const c = await batchContext(ctx, batchId);
  if (!c) return;
  const rows = await ctx.db
    .select()
    .from(kernels)
    .where(eq(kernels.batchId, batchId));
  const todo = rows.filter(
    (k) => !k.aiClass2 && wantsSecondOpinion({ ...k, draw: 0 }, c.classes),
  );
  if (!todo.length) return;
  // A failure here isn't fatal: kernels without a second verdict go to a person.
  await classifyKernels(ctx, batchId, todo, {
    kind: "second_opinion",
    shuffle: true,
    save: (verdicts: KernelVerdict[]) =>
      ctx.db.transaction(async (tx) => {
        for (const v of verdicts) {
          await tx
            .update(kernels)
            .set({ aiClass2: v.cls, aiConfidence2: v.confidence })
            .where(
              and(eq(kernels.batchId, batchId), eq(kernels.number, v.number)),
            );
        }
      }),
  });
}

const looked = (cls: string | null, confidence: string | null) =>
  cls ? `"${cls}" (${confidence ?? "no"} confidence)` : null;

/** What the earlier looks said about a kernel, for the expert pass. */
function expertNote(k: typeof kernels.$inferSelect): string {
  const parts = [
    k.isCluster ? "this tile shows touching kernels" : null,
    k.aiClass
      ? `first look: ${looked(k.aiClass, k.aiConfidence)}${k.aiReason ? `, ${k.aiReason.slice(0, 160)}` : ""}`
      : null,
    k.aiClass2 ? `second look: ${looked(k.aiClass2, k.aiConfidence2)}` : null,
  ].filter(Boolean);
  return parts.join("; ");
}

/**
 * The expert pass: kernels the first two looks couldn't settle (touching
 * kernels, "unclear", low confidence, disagreement) go to the Advanced tier
 * on smaller sheets, with what the earlier looks said. Triage then accepts
 * its confident verdicts; the rest still go to a person.
 */
export async function expertReview(
  ctx: AppContext,
  batchId: string,
): Promise<void> {
  const c = await batchContext(ctx, batchId);
  if (!c || !c.policy.expertReview) return;
  const rows = await ctx.db
    .select()
    .from(kernels)
    .where(eq(kernels.batchId, batchId));
  const todo = rows.filter(
    (k) =>
      !k.expertClass &&
      k.reviewStatus === "pending" &&
      wantsExpert({ ...k, draw: 0 }, c.classes, c.policy),
  );
  if (!todo.length) return;
  // A failure here isn't fatal: those kernels go to a person.
  await classifyKernels(ctx, batchId, todo, {
    kind: "expert",
    expertNotes: Object.fromEntries(todo.map((k) => [k.number, expertNote(k)])),
    save: (verdicts: KernelVerdict[]) =>
      ctx.db.transaction(async (tx) => {
        for (const v of verdicts) {
          await tx
            .update(kernels)
            .set({
              expertClass: v.cls,
              expertConfidence: v.confidence,
              expertReason: v.reason.slice(0, 500),
            })
            .where(
              and(eq(kernels.batchId, batchId), eq(kernels.number, v.number)),
            );
        }
      }),
  });
}

/** Decides, per kernel, whether a person has to look at it (see flagFor). */
export async function triageBatch(
  ctx: AppContext,
  batchId: string,
): Promise<void> {
  const c = await batchContext(ctx, batchId);
  if (!c) return;
  const rows = await ctx.db
    .select({
      id: kernels.id,
      isCluster: kernels.isCluster,
      aiClass: kernels.aiClass,
      aiConfidence: kernels.aiConfidence,
      aiClass2: kernels.aiClass2,
      aiConfidence2: kernels.aiConfidence2,
      expertClass: kernels.expertClass,
      expertConfidence: kernels.expertConfidence,
      flagReason: kernels.flagReason,
      reviewStatus: kernels.reviewStatus,
    })
    .from(kernels)
    .where(eq(kernels.batchId, batchId));
  const groups = new Map<FlagReason | null, string[]>();
  for (const k of rows) {
    let reason = flagFor(
      { ...k, draw: mix(`${k.id}:spot`) },
      c.classes,
      c.policy,
    );
    // A kernel a person already decided stays in the reviewed set.
    if (!reason && k.reviewStatus !== "pending") reason = k.flagReason;
    if (reason === k.flagReason) continue;
    groups.set(reason, [...(groups.get(reason) ?? []), k.id]);
  }
  for (const [reason, ids] of groups) {
    for (let i = 0; i < ids.length; i += 500) {
      await ctx.db
        .update(kernels)
        .set({ flagReason: reason })
        .where(inArray(kernels.id, ids.slice(i, i + 500)));
    }
  }
}

/**
 * The whole batch pipeline: find the board (and its corners when none were
 * given), count kernels, then with Autopilot classify, get a second opinion,
 * triage and finish the sample when nothing waits on a person.
 */
export async function runBatch(
  ctx: AppContext,
  batchId: string,
  corners: Corners | null,
): Promise<void> {
  await processBatch(ctx, batchId, corners);
  const c = await batchContext(ctx, batchId);
  if (!c || c.batch.status !== "detected") return;
  if (c.policy.enabled) await classifyAndTriage(ctx, batchId);
}

/** Classification and what follows it: second opinion, expert pass, triage, finishing. */
export async function classifyAndTriage(
  ctx: AppContext,
  batchId: string,
): Promise<void> {
  // The batch stays "classifying" until triage is done, so nobody finishes
  // the sample before the review flags exist.
  const classified = await classifyBatch(ctx, batchId, false);
  const c = await batchContext(ctx, batchId);
  if (!c) return;
  if (classified && c.policy.enabled) {
    await secondOpinion(ctx, batchId);
    await expertReview(ctx, batchId);
  }
  await triageBatch(ctx, batchId);
  if (classified) await markClassified(ctx, batchId);
  await finishIfReady(ctx, c.sample.id);
}

/** Whether the photo estimate may be the result: the standard decides; without one, Autopilot does. */
export function estimateAllowed(
  standard: { allowEstimate: boolean } | null,
  policy: AutopilotPolicy,
): boolean {
  return standard ? standard.allowEstimate : policy.enabled;
}

/** What still stands between a sample and completion; empty when it can complete. */
export async function completionProblems(
  ctx: AppContext,
  sample: SampleRow,
): Promise<string[]> {
  const standard = sample.standardId
    ? await getStandard(ctx, sample.orgId, sample.standardId)
    : null;
  const policy = await policyForOrg(ctx, sample.orgId);
  const summary = await kernelSummary(ctx, { sampleId: sample.id });
  const weighed = measurementOf(sample) !== null;
  const onEstimate = !weighed && estimateAllowed(standard ?? null, policy);
  const problems: string[] = [];
  if (!weighed && !onEstimate) {
    problems.push(
      standard
        ? "weigh the cups (this standard doesn't allow completing on the photo estimate)"
        : "enter the sample mass and cup weights",
    );
  }
  if (
    onEstimate &&
    (summary.total === 0 || summary.classified < summary.total)
  ) {
    problems.push(
      "photograph the sample and classify every kernel, for the photo estimate",
    );
  }
  if ((await busyBatches(ctx, sample.id)).length)
    problems.push("wait for photos to finish processing");
  const [failed] = await ctx.db
    .select({ id: batches.id })
    .from(batches)
    .where(and(eq(batches.sampleId, sample.id), eq(batches.status, "failed")))
    .limit(1);
  // A failed photo is part of the sample: finishing without it would drop it.
  if (failed) problems.push("fix or delete the photo that failed");
  if (summary.pendingReview > 0) {
    problems.push(
      `check the ${summary.pendingReview} flagged kernel(s) still waiting for review`,
    );
  }
  return problems;
}

/** Completes a sample: result, certificate and audit entry. `by` is null for Autopilot. */
export async function completeSample(
  ctx: AppContext,
  sample: SampleRow,
  by: string | null,
) {
  const standard = sample.standardId
    ? await getStandard(ctx, sample.orgId, sample.standardId)
    : null;
  let result;
  if (measurementOf(sample) !== null) {
    result = (await refreshResult(ctx, sample.id)).result;
  } else {
    const crop = await ensureCrop(ctx, sample.orgId, sample.crop);
    result = estimateResult(
      await estimateFor(ctx, sample.id, crop.classes),
      sample,
      standard?.grades ?? null,
    );
  }
  const [row] = await ctx.db
    .update(samples)
    .set({
      status: "completed",
      result,
      dimensions: await dimensionsFor(ctx, sample.id),
      completedAt: new Date(),
      completedBy: by,
    })
    .where(eq(samples.id, sample.id))
    .returning();
  const certificate = await issueCertificate(ctx, sample.id, by);
  await audit(ctx.db, {
    orgId: sample.orgId,
    userId: by,
    action: by ? "samples.completed" : "samples.completed_by_autopilot",
    detail: {
      id: sample.id,
      number: sample.number,
      grade: result?.grade.grade ?? null,
      source: result?.source ?? "weighed",
      certificate: certificate.code,
    },
  });
  // Connected systems (APMC, eNAM bridge, ERP) get the result pushed.
  ctx.jobs.run(`notify ${sample.id}`, () => notifyCompleted(ctx, sample.id));
  return { row: row!, certificate };
}

/** A short plain-language report of a completed sample's results. */
export async function writeSummary(ctx: AppContext, sampleId: string) {
  const [sample] = await ctx.db
    .select()
    .from(samples)
    .where(eq(samples.id, sampleId));
  if (!sample?.result) throw new Error("The sample has no result yet");
  const standard = sample.standardId
    ? await getStandard(ctx, sample.orgId, sample.standardId)
    : null;
  const summary = await kernelSummary(ctx, { sampleId });
  const model = await modelFor(ctx, sampleId);
  const crop = await ensureCrop(ctx, sample.orgId, sample.crop);
  const pct = summarizePercentages(sample.result.byClassPct, crop.classes);
  const started = Date.now();
  const facts = {
    sample: `#${sample.number}`,
    crop: crop.label,
    source: sample.source,
    standard: standard?.name ?? null,
    resultSource:
      sample.result.source === "estimate"
        ? "estimated from the photos (kernel areas), not weighed"
        : "weighed on a scale",
    sampleMassG: sample.sampleMassG,
    moisturePct: sample.moisturePct,
    testWeightKgPerHl: sample.testWeightKgPerHl,
    massPctByClass: Object.fromEntries(
      crop.classes.map((c) => [c.label, roundPct(pct.byClass[c.id] ?? 0)]),
    ),
    massPctByGroup: Object.fromEntries(
      CLASS_GROUPS.map((g) => [GROUP_LABELS[g], roundPct(pct.byGroup[g])]),
    ),
    totalDefectsPct: roundPct(pct.totalDefectsPct),
    purityPct: roundPct(pct.purityPct),
    grade: sample.result.grade.grade,
    failedLimitsPerGrade: sample.result.grade.failures,
    gradeLimits: standard?.grades ?? null,
    kernelsPhotographed: summary.total,
    kernelsCheckedByAPerson: summary.reviewed,
    kernelCountsByClass: Object.fromEntries(
      Object.entries(summary.byClass).map(([id, n]) => [
        classLabel(crop.classes, id),
        n,
      ]),
    ),
  };
  const { text, usage } = await ctx.classifier.summarize({ model, facts });
  await ctx.db.insert(analysisRuns).values({
    orgId: sample.orgId,
    sampleId,
    kind: "summary",
    model,
    requests: 1,
    ...usage,
    durationMs: Date.now() - started,
  });
  const [row] = await ctx.db
    .update(samples)
    .set({ aiSummary: text, updatedAt: new Date() })
    .where(eq(samples.id, sampleId))
    .returning();
  return row!;
}

/**
 * Autopilot's last step: once all photos are in (`autoFinish`), processed
 * and nothing waits on a person, complete the sample, issue its report and
 * write the summary. Safe to call any time; does nothing until ready.
 */
export async function finishIfReady(
  ctx: AppContext,
  sampleId: string,
): Promise<boolean> {
  const [sample] = await ctx.db
    .select()
    .from(samples)
    .where(eq(samples.id, sampleId));
  if (!sample || sample.status !== "in_progress" || !sample.autoFinish)
    return false;
  const policy = await policyForOrg(ctx, sample.orgId);
  if (!policy.enabled) return false;
  if ((await completionProblems(ctx, sample)).length) return false;
  // Another request may be finishing it at the same moment: only one wins.
  const [claimed] = await ctx.db
    .update(samples)
    .set({ autoFinish: false })
    .where(and(eq(samples.id, sampleId), eq(samples.autoFinish, true)))
    .returning({ id: samples.id });
  if (!claimed) return false;
  try {
    await completeSample(ctx, sample, null);
  } catch (err) {
    // Try again on the next trigger rather than leaving the sample stuck.
    await ctx.db
      .update(samples)
      .set({ autoFinish: true })
      .where(eq(samples.id, sampleId));
    throw err;
  }
  if (policy.autoSummary) {
    try {
      await writeSummary(ctx, sampleId);
    } catch {
      // The report stands without a summary; it can be written later.
    }
  }
  // Build the PDF now, so opening it is instant.
  await prepareReport(ctx, sampleId, sample.orgId).catch(() => undefined);
  return true;
}

import { summarizePercentages, validateMeasurement } from "@ai-grain/core";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  or,
  sql,
} from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CLAUDE_MODELS } from "../../config.js";
import type { AppContext } from "../../context.js";
import {
  batches,
  kernels,
  samples,
  standards,
  users,
} from "../../db/schema.js";
import { audit } from "../../lib/audit.js";
import { badRequest, conflict } from "../../lib/errors.js";
import {
  authenticate,
  authOf,
  requireRole,
  WRITE_ROLES,
} from "../auth/guard.js";
import {
  busyBatches,
  expireStaleBatches,
  kernelSummary,
  modelFor,
} from "../batches/service.js";
import { ensureCrop, normalizeCropKey } from "../crops/service.js";
import { withdrawCertificates } from "../certificates/service.js";
import { getStandard } from "../standards/routes.js";
import { estimateFor, gradeFor, loadSample, refreshResult } from "./service.js";
import { likePattern } from "../../lib/pagination.js";
import {
  completeSample,
  completionProblems,
  finishIfReady,
  policyForOrg,
  writeSummary,
} from "../autopilot/service.js";

const Mass = z.number().positive().max(100_000);
const Pct = z.number().min(0).max(100);

const SampleFields = z.object({
  standardId: z.uuid().nullable().optional(),
  source: z.string().trim().max(200).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  sampleMassG: Mass.nullable().optional(),
  moisturePct: Pct.nullable().optional(),
  testWeightKgPerHl: z.number().positive().max(200).nullable().optional(),
  model: z.enum(CLAUDE_MODELS).nullable().optional(),
});

function defined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

export function sampleRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.addHook("preHandler", authenticate(ctx));
    const write = { preHandler: requireRole(...WRITE_ROLES) };

    /** What the AI did on a sample and why kernels went to a person. */
    async function autopilotStatus(sampleId: string, orgId: string) {
      const policy = await policyForOrg(ctx, orgId);
      const byReason = await ctx.db
        .select({ reason: kernels.flagReason, count: count() })
        .from(kernels)
        .where(eq(kernels.sampleId, sampleId))
        .groupBy(kernels.flagReason);
      const flagged: Partial<Record<string, number>> = {};
      let accepted = 0;
      for (const r of byReason) {
        if (r.reason) flagged[r.reason] = r.count;
        else accepted += r.count;
      }
      return { ...policy, acceptedByAi: accepted, flaggedByReason: flagged };
    }

    async function editable(orgId: string, id: string) {
      const sample = await loadSample(ctx, orgId, id);
      if (sample.status === "completed")
        throw conflict("The sample is completed. Reopen it to make changes.");
      return sample;
    }

    app.get("/samples", async (request) => {
      const me = authOf(request);
      const q = z
        .object({
          status: z.enum(["in_progress", "completed"]).optional(),
          search: z.string().trim().max(100).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(25),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .parse(request.query);
      const conditions = [eq(samples.orgId, me.orgId)];
      if (q.status) conditions.push(eq(samples.status, q.status));
      if (q.search) {
        const like = likePattern(q.search);
        const asNumber = Number(q.search.replace(/^#/, ""));
        conditions.push(
          or(
            ilike(samples.crop, like),
            ilike(samples.source, like),
            ...(Number.isInteger(asNumber)
              ? [eq(samples.number, asNumber)]
              : []),
          )!,
        );
      }
      const where = and(...conditions);
      const [items, [totals]] = await Promise.all([
        ctx.db
          .select({
            id: samples.id,
            number: samples.number,
            crop: samples.crop,
            source: samples.source,
            status: samples.status,
            grade: sql<string | null>`${samples.result}->'grade'->>'grade'`,
            totalDefectsPct: sql<
              number | null
            >`(${samples.result}->>'totalDefectsPct')::float`,
            standardName: standards.name,
            createdByName: users.name,
            createdAt: samples.createdAt,
            completedAt: samples.completedAt,
          })
          .from(samples)
          .leftJoin(standards, eq(standards.id, samples.standardId))
          .leftJoin(users, eq(users.id, samples.createdBy))
          .where(where)
          .orderBy(desc(samples.createdAt))
          .limit(q.limit)
          .offset(q.offset),
        ctx.db.select({ total: count() }).from(samples).where(where),
      ]);
      // Where people are needed: kernels waiting for review, photos in progress.
      const ids = items.map((i) => i.id);
      const [queues, busy] = ids.length
        ? await Promise.all([
            ctx.db
              .select({ sampleId: kernels.sampleId, count: count() })
              .from(kernels)
              .where(
                and(
                  inArray(kernels.sampleId, ids),
                  isNotNull(kernels.flagReason),
                  eq(kernels.reviewStatus, "pending"),
                ),
              )
              .groupBy(kernels.sampleId),
            ctx.db
              .selectDistinct({ sampleId: batches.sampleId })
              .from(batches)
              .where(
                and(
                  inArray(batches.sampleId, ids),
                  inArray(batches.status, ["detecting", "classifying"]),
                ),
              ),
          ])
        : [[], []];
      const queue = new Map(queues.map((q) => [q.sampleId, q.count]));
      const processing = new Set(busy.map((b) => b.sampleId));
      return {
        items: items.map((i) => ({
          ...i,
          pendingReview: queue.get(i.id) ?? 0,
          processing: processing.has(i.id),
        })),
        total: totals?.total ?? 0,
      };
    });

    app.post("/samples", write, async (request, reply) => {
      const me = authOf(request);
      const body = SampleFields.extend({
        crop: z.string().trim().min(1).max(60).transform(normalizeCropKey),
      }).parse(request.body);
      // Creates the crop from its preset the first time it is used.
      await ensureCrop(ctx, me.orgId, body.crop);
      if (body.standardId) {
        const std = await getStandard(ctx, me.orgId, body.standardId);
        if (!std) throw badRequest("Unknown standard");
        if (std.crop !== body.crop)
          throw badRequest(
            `That standard is for ${std.crop}, not ${body.crop}`,
          );
      }
      // Numbers are per organisation; retry if two samples are created at once.
      for (let attempt = 0; ; attempt++) {
        try {
          const [row] = await ctx.db.transaction(async (tx) => {
            const [max] = await tx
              .select({
                n: sql<number>`coalesce(max(${samples.number}), 0)::int`,
              })
              .from(samples)
              .where(eq(samples.orgId, me.orgId));
            return tx
              .insert(samples)
              .values({
                ...defined(body),
                crop: body.crop,
                orgId: me.orgId,
                number: (max?.n ?? 0) + 1,
                createdBy: me.id,
              })
              .returning();
          });
          reply.code(201);
          return row;
        } catch (err) {
          if (attempt >= 3) throw err;
        }
      }
    });

    app.get("/samples/:id", async (request) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const sample = await loadSample(ctx, me.orgId, id);
      await expireStaleBatches(ctx, { sampleId: id });
      const [standard, batchRows, summary, model] = await Promise.all([
        sample.standardId
          ? getStandard(ctx, me.orgId, sample.standardId)
          : Promise.resolve(null),
        ctx.db
          .select({
            id: batches.id,
            side: batches.side,
            status: batches.status,
            kernelCount: batches.kernelCount,
            error: batches.error,
            createdAt: batches.createdAt,
          })
          .from(batches)
          .where(eq(batches.sampleId, id))
          .orderBy(asc(batches.createdAt)),
        kernelSummary(ctx, { sampleId: id }),
        modelFor(ctx, id),
      ]);
      const crop = await ensureCrop(ctx, me.orgId, sample.crop);
      const estimate = await estimateFor(ctx, id, crop.classes);
      // Results saved before classes had groups lack the group totals and purity.
      const result = sample.result && {
        ...sample.result,
        ...(() => {
          const p = summarizePercentages(
            sample.result.byClassPct,
            crop.classes,
          );
          return {
            byGroupPct: p.byGroup,
            purityPct: p.purityPct,
            totalDefectsPct: p.totalDefectsPct,
          };
        })(),
      };
      return {
        ...sample,
        result,
        cropProfile: {
          key: crop.key,
          label: crop.label,
          classes: crop.classes,
        },
        // Live while kernels are classified and reviewed; null until any kernel counts.
        estimate:
          estimate.counted > 0
            ? {
                ...estimate,
                grade: gradeFor(estimate, sample, standard?.grades ?? null),
              }
            : null,
        standard: standard ?? null,
        effectiveModel: model,
        batches: batchRows,
        kernels: summary,
        autopilot: await autopilotStatus(id, me.orgId),
      };
    });

    app.patch("/samples/:id", write, async (request) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const body = SampleFields.parse(request.body);
      const sample = await editable(me.orgId, id);
      if (body.standardId) {
        const std = await getStandard(ctx, me.orgId, body.standardId);
        if (!std) throw badRequest("Unknown standard");
        if (std.crop !== sample.crop)
          throw badRequest(
            `That standard is for ${std.crop}, not ${sample.crop}`,
          );
      }
      await ctx.db.update(samples).set(defined(body)).where(eq(samples.id, id));
      return refreshResult(ctx, id);
    });

    /** Cup masses in grams, one per defect class. Replaces all earlier cup masses. */
    app.put("/samples/:id/weights", write, async (request) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const body = z
        .object({
          sampleMassG: Mass.optional(),
          cupMassG: z.record(
            z.string().max(40),
            z.number().min(0).max(100_000),
          ),
        })
        .parse(request.body);
      const sample = await editable(me.orgId, id);
      const sampleMassG = body.sampleMassG ?? sample.sampleMassG;
      if (sampleMassG === null) throw badRequest("Enter the sample mass first");
      const crop = await ensureCrop(ctx, me.orgId, sample.crop);
      const errors = validateMeasurement(
        { sampleMassG, cupMassG: body.cupMassG },
        crop.classes,
      );
      if (errors.length) throw badRequest(errors.join("; "));
      await ctx.db
        .update(samples)
        .set({ sampleMassG, cupMassG: body.cupMassG })
        .where(eq(samples.id, id));
      const refreshed = await refreshResult(ctx, id);
      // Weighed now: that may be all Autopilot was waiting for.
      ctx.jobs.run(`finish ${id}`, async () => {
        await finishIfReady(ctx, id);
      });
      return refreshed;
    });

    /**
     * Completes a sample. The result comes from the scale when the sample was
     * weighed; otherwise from the photo estimate, if the sample's standard
     * allows that (or, with Autopilot, when there is no standard). Flagged
     * kernels must be reviewed either way.
     */
    app.post("/samples/:id/complete", write, async (request) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const sample = await editable(me.orgId, id);
      const problems = await completionProblems(ctx, sample);
      if (problems.length)
        throw badRequest(`Before completing: ${problems.join(", ")}.`);
      const { row, certificate } = await completeSample(ctx, sample, me.id);
      return {
        ...row,
        certificate: { code: certificate.code, version: certificate.version },
      };
    });

    /**
     * All photos are in: Autopilot completes the sample as soon as nothing
     * waits on a person (now, or after the last review). Returns what is
     * still outstanding.
     */
    app.post("/samples/:id/finish", write, async (request) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const sample = await editable(me.orgId, id);
      await ctx.db
        .update(samples)
        .set({ autoFinish: true })
        .where(eq(samples.id, id));
      const waitingFor = await completionProblems(ctx, sample);
      if (!waitingFor.length) {
        ctx.jobs.run(`finish ${id}`, async () => {
          await finishIfReady(ctx, id);
        });
      }
      return { autoFinish: true, waitingFor };
    });

    app.post("/samples/:id/reopen", write, async (request) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const sample = await loadSample(ctx, me.orgId, id);
      const [row] = await ctx.db
        .update(samples)
        .set({
          status: "in_progress",
          completedAt: null,
          completedBy: null,
          // Reopened for changes: finishes again only when asked.
          autoFinish: false,
          // An estimate-based result is shown live again while the sample is open.
          ...(sample.result?.source === "estimate" && { result: null }),
        })
        .where(eq(samples.id, id))
        .returning();
      await withdrawCertificates(
        ctx,
        id,
        "The sample was reopened for changes.",
      );
      await audit(ctx.db, {
        orgId: me.orgId,
        userId: me.id,
        action: "samples.reopened",
        detail: { id },
      });
      return row;
    });

    app.delete(
      "/samples/:id",
      { preHandler: requireRole("admin") },
      async (request) => {
        const me = authOf(request);
        const { id } = z.object({ id: z.uuid() }).parse(request.params);
        const sample = await loadSample(ctx, me.orgId, id);
        if ((await busyBatches(ctx, id)).length)
          throw conflict("Photos are still being processed");
        await ctx.db.delete(samples).where(eq(samples.id, id));
        await ctx.storage.remove(`orgs/${me.orgId}/samples/${id}`);
        await audit(ctx.db, {
          orgId: me.orgId,
          userId: me.id,
          action: "samples.deleted",
          detail: { id, number: sample.number },
        });
        return { ok: true };
      },
    );

    /** Results from a certified grader for the same sample, for validating this method. */
    app.put("/samples/:id/reference", write, async (request) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const body = z
        .object({
          byClassPct: z.record(z.string().max(40), Pct),
          grade: z.string().trim().max(40).nullable(),
          graderName: z.string().trim().max(120).optional(),
          gradedOn: z.iso.date().optional(),
          notes: z.string().max(2000).optional(),
        })
        .nullable()
        .parse(request.body);
      await loadSample(ctx, me.orgId, id);
      const [row] = await ctx.db
        .update(samples)
        .set({ reference: body, updatedAt: new Date() })
        .where(eq(samples.id, id))
        .returning();
      return row;
    });

    /** Asks Model Orchestration for a short plain-language report of the results. */
    app.post("/samples/:id/summary", write, async (request) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const sample = await loadSample(ctx, me.orgId, id);
      if (!sample.result)
        throw badRequest("Enter the weights before asking for a summary");
      try {
        return await writeSummary(ctx, id);
      } catch (err) {
        throw badRequest(
          `Model Orchestration could not write the summary: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  };
}

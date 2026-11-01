import {
  compareRuns,
  repeatabilityBand,
  summarizeValidation,
  type RepeatabilityBand,
} from "@ai-grain/core";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { samples, standards } from "../../db/schema.js";
import { breakdownOf } from "../samples/service.js";
import { authenticate, authOf } from "../auth/guard.js";
import { pageQuery } from "../../lib/pagination.js";

/** The number of samples graded both ways before the method's results should be relied on. */
export const VALIDATION_TARGET = { min: 30, recommended: 50 };

export function validationRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.addHook("preHandler", authenticate(ctx));

    /**
     * Compares this method with certified grading, per defect class, over
     * completed samples that have a reference result.
     */
    /**
     * Repeatability: every completed repeat run compared with the first run
     * of the same physical sample, with the share in each agreement band.
     */
    app.get("/validation/repeatability", async (request) => {
      const me = authOf(request);
      const { crop } = z
        .object({ crop: z.string().optional() })
        .parse(request.query);
      const repeats = await ctx.db
        .select()
        .from(samples)
        .where(
          and(
            eq(samples.orgId, me.orgId),
            isNotNull(samples.repeatOf),
            eq(samples.status, "completed"),
            ...(crop ? [eq(samples.crop, crop.toLowerCase())] : []),
          ),
        )
        .orderBy(desc(samples.completedAt))
        .limit(500);
      const firstIds = [...new Set(repeats.map((r) => r.repeatOf!))];
      const firsts = firstIds.length
        ? await ctx.db
            .select()
            .from(samples)
            .where(
              and(
                eq(samples.orgId, me.orgId),
                inArray(samples.id, firstIds),
                eq(samples.status, "completed"),
              ),
            )
        : [];
      const firstById = new Map(firsts.map((f) => [f.id, f]));
      const pairs = [];
      for (const r of repeats) {
        const first = firstById.get(r.repeatOf!);
        if (!first) continue;
        const [a, b] = await Promise.all([
          breakdownOf(ctx, first),
          breakdownOf(ctx, r),
        ]);
        if (!a || !b) continue;
        const comparison = compareRuns(a, b);
        pairs.push({
          crop: r.crop,
          first: { id: first.id, number: first.number },
          repeat: { id: r.id, number: r.number },
          ...comparison,
          band: repeatabilityBand(comparison.agreementPct),
        });
      }
      const bands: Record<RepeatabilityBand, number> = {
        "99+": 0,
        "97-99": 0,
        "95-97": 0,
        below95: 0,
      };
      for (const p of pairs) bands[p.band]++;
      return {
        pairs,
        summary: {
          count: pairs.length,
          meanAgreementPct: pairs.length
            ? Math.round(
                (pairs.reduce((n, p) => n + p.agreementPct, 0) / pairs.length) *
                  100,
              ) / 100
            : null,
          minAgreementPct: pairs.length
            ? Math.min(...pairs.map((p) => p.agreementPct))
            : null,
          bands,
        },
      };
    });

    app.get("/validation", async (request) => {
      const me = authOf(request);
      const q = z
        .object({
          crop: z.string().optional(),
          standardId: z.uuid().optional(),
          ...pageQuery(25),
        })
        .parse(request.query);
      const conditions = [
        eq(samples.orgId, me.orgId),
        eq(samples.status, "completed"),
        isNotNull(samples.reference),
        isNotNull(samples.result),
      ];
      if (q.crop) conditions.push(eq(samples.crop, q.crop.toLowerCase()));
      if (q.standardId) conditions.push(eq(samples.standardId, q.standardId));
      const rows = await ctx.db
        .select({
          id: samples.id,
          number: samples.number,
          crop: samples.crop,
          standardName: standards.name,
          result: samples.result,
          reference: samples.reference,
          completedAt: samples.completedAt,
        })
        .from(samples)
        .leftJoin(standards, eq(standards.id, samples.standardId))
        .where(and(...conditions))
        .orderBy(desc(samples.completedAt));

      const summary = summarizeValidation(
        rows.map((r) => ({
          method: r.result!.byClassPct,
          reference: r.reference!.byClassPct,
          methodGrade: r.result!.grade.grade,
          referenceGrade: r.reference!.grade,
        })),
      );
      return {
        target: VALIDATION_TARGET,
        summary,
        // The summary covers every sample; the list is one page of them.
        total: rows.length,
        limit: q.limit,
        offset: q.offset,
        samples: rows.slice(q.offset, q.offset + q.limit).map((r) => ({
          id: r.id,
          number: r.number,
          crop: r.crop,
          standardName: r.standardName,
          completedAt: r.completedAt,
          methodGrade: r.result!.grade.grade,
          referenceGrade: r.reference!.grade,
          methodPct: r.result!.byClassPct,
          referencePct: r.reference!.byClassPct,
        })),
      };
    });
  };
}

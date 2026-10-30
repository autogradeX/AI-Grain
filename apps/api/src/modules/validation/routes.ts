import { summarizeValidation } from "@ai-grain/core";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { samples, standards } from "../../db/schema.js";
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

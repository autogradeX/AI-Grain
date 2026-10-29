import { DEFECT_CLASSES } from "@ai-grain/core";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { standards } from "../../db/schema.js";
import { audit } from "../../lib/audit.js";
import { notFound } from "../../lib/errors.js";
import { authenticate, authOf, requireRole } from "../auth/guard.js";

const Pct = z.number().min(0).max(100);
const DefectLimits = z.partialRecord(z.enum(DEFECT_CLASSES), Pct);

export const GradeSpecSchema = z.object({
  grade: z.string().trim().min(1).max(40),
  maxDefectPct: DefectLimits,
  maxTotalDefectsPct: Pct.optional(),
  maxMoisturePct: Pct.optional(),
  minTestWeightKgPerHl: z.number().positive().optional(),
});

const StandardBody = z.object({
  name: z.string().trim().min(1).max(120),
  crop: z.string().trim().toLowerCase().min(1).max(60),
  description: z.string().max(2000).nullable().optional(),
  grades: z
    .array(GradeSpecSchema)
    .min(1)
    .max(20)
    .refine(
      (g) => new Set(g.map((x) => x.grade)).size === g.length,
      "Grade names must be unique",
    ),
  definitions: z
    .partialRecord(z.enum(DEFECT_CLASSES), z.string().max(1000))
    .default({}),
});

export async function getStandard(ctx: AppContext, orgId: string, id: string) {
  const [row] = await ctx.db
    .select()
    .from(standards)
    .where(and(eq(standards.id, id), eq(standards.orgId, orgId)));
  return row;
}

export function standardRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.addHook("preHandler", authenticate(ctx));
    const admin = { preHandler: requireRole("admin") };

    app.get("/standards", async (request) => {
      const me = authOf(request);
      const { includeArchived } = z
        .object({ includeArchived: z.stringbool().default(false) })
        .parse(request.query);
      return ctx.db
        .select()
        .from(standards)
        .where(
          includeArchived
            ? eq(standards.orgId, me.orgId)
            : and(eq(standards.orgId, me.orgId), eq(standards.archived, false)),
        )
        .orderBy(standards.crop, desc(standards.updatedAt));
    });

    app.get("/standards/:id", async (request) => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const row = await getStandard(ctx, authOf(request).orgId, id);
      if (!row) throw notFound("Standard");
      return row;
    });

    app.post("/standards", admin, async (request, reply) => {
      const me = authOf(request);
      const body = StandardBody.parse(request.body);
      const [row] = await ctx.db
        .insert(standards)
        .values({
          ...body,
          description: body.description ?? null,
          orgId: me.orgId,
        })
        .returning();
      await audit(ctx.db, {
        orgId: me.orgId,
        userId: me.id,
        action: "standards.created",
        detail: { id: row!.id },
      });
      reply.code(201);
      return row;
    });

    app.put("/standards/:id", admin, async (request) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const body = StandardBody.parse(request.body);
      const [row] = await ctx.db
        .update(standards)
        .set({
          ...body,
          description: body.description ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(standards.id, id), eq(standards.orgId, me.orgId)))
        .returning();
      if (!row) throw notFound("Standard");
      await audit(ctx.db, {
        orgId: me.orgId,
        userId: me.id,
        action: "standards.updated",
        detail: { id },
      });
      return row;
    });

    // Archived rather than deleted, because completed samples refer to their standard.
    app.post("/standards/:id/archive", admin, async (request) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const { archived } = z
        .object({ archived: z.boolean() })
        .parse(request.body);
      const [row] = await ctx.db
        .update(standards)
        .set({ archived, updatedAt: new Date() })
        .where(and(eq(standards.id, id), eq(standards.orgId, me.orgId)))
        .returning();
      if (!row) throw notFound("Standard");
      return row;
    });
  };
}

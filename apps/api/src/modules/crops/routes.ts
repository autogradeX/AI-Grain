import { CLASS_GROUPS, validateClasses, type ClassDef } from "@ai-grain/core";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { CLAUDE_MODELS, type ClaudeModel } from "../../config.js";
import {
  crops,
  kernels,
  organizations,
  referenceImages,
  samples,
  standards,
} from "../../db/schema.js";
import { audit } from "../../lib/audit.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { authenticate, authOf, requireRole } from "../auth/guard.js";
import { ensureCrop, listCrops, normalizeCropKey } from "./service.js";

const ClassSchema = z.object({
  id: z.string().trim(),
  label: z.string().trim().min(1).max(80),
  group: z.enum(CLASS_GROUPS),
  description: z.string().trim().max(1000).optional(),
  massFactor: z.number().positive().max(20).optional(),
});

const CropKey = z.string().trim().min(1).max(60).transform(normalizeCropKey);

/** Class ids that samples, kernels, references or standards of this crop still use. */
async function classesInUse(
  ctx: AppContext,
  orgId: string,
  crop: string,
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const used = new Set<string>();
  const kernelRows = await ctx.db
    .selectDistinct({ a: kernels.aiClass, f: kernels.finalClass })
    .from(kernels)
    .innerJoin(samples, eq(samples.id, kernels.sampleId))
    .where(
      and(
        eq(kernels.orgId, orgId),
        eq(samples.crop, crop),
        or(inArray(kernels.aiClass, ids), inArray(kernels.finalClass, ids)),
      ),
    );
  for (const r of kernelRows) {
    if (r.a && ids.includes(r.a)) used.add(r.a);
    if (r.f && ids.includes(r.f)) used.add(r.f);
  }
  const refRows = await ctx.db
    .selectDistinct({ cls: referenceImages.cls })
    .from(referenceImages)
    .where(
      and(
        eq(referenceImages.orgId, orgId),
        eq(referenceImages.crop, crop),
        inArray(referenceImages.cls, ids),
      ),
    );
  for (const r of refRows) used.add(r.cls);
  const cupRows = await ctx.db
    .select({ cups: samples.cupMassG })
    .from(samples)
    .where(
      and(
        eq(samples.orgId, orgId),
        eq(samples.crop, crop),
        sql`${samples.cupMassG} <> '{}'::jsonb`,
      ),
    );
  for (const r of cupRows)
    for (const id of ids) if ((r.cups[id] ?? 0) > 0) used.add(id);
  const stdRows = await ctx.db
    .select({ grades: standards.grades })
    .from(standards)
    .where(and(eq(standards.orgId, orgId), eq(standards.crop, crop)));
  for (const r of stdRows)
    for (const g of r.grades)
      for (const id of ids) if (g.maxDefectPct[id] !== undefined) used.add(id);
  return [...used];
}

export function cropRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.addHook("preHandler", authenticate(ctx));
    const admin = { preHandler: requireRole("admin") };

    app.get("/crops", async (request) => {
      const { includeArchived } = z
        .object({ includeArchived: z.stringbool().default(false) })
        .parse(request.query);
      const rows = await listCrops(ctx, authOf(request).orgId);
      return includeArchived ? rows : rows.filter((r) => !r.archived);
    });

    app.get("/crops/:key", async (request) => {
      const { key } = z.object({ key: CropKey }).parse(request.params);
      const [row] = await ctx.db
        .select()
        .from(crops)
        .where(and(eq(crops.orgId, authOf(request).orgId), eq(crops.key, key)));
      if (!row) throw notFound("Crop");
      return row;
    });

    /**
     * Model Orchestration suggests a crop's label and defect classes from its
     * name. Nothing is saved: the admin reviews the suggestion first.
     */
    app.post("/crops/suggest", admin, async (request) => {
      const me = authOf(request);
      const { name } = z
        .object({ name: z.string().trim().min(1).max(80) })
        .parse(request.body);
      const [org] = await ctx.db
        .select({ model: organizations.defaultModel })
        .from(organizations)
        .where(eq(organizations.id, me.orgId));
      const model = (CLAUDE_MODELS as readonly string[]).includes(
        org?.model ?? "",
      )
        ? (org!.model as ClaudeModel)
        : ctx.config.DEFAULT_MODEL;
      try {
        const { suggestion } = await ctx.classifier.suggestCrop({
          model,
          name,
        });
        return { key: normalizeCropKey(name), ...suggestion };
      } catch (err) {
        throw badRequest(
          `Model Orchestration could not suggest classes: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });

    /** Adds a crop. Without classes, it starts from its preset or the general cereal list. */
    app.post("/crops", admin, async (request, reply) => {
      const me = authOf(request);
      const body = z
        .object({
          key: CropKey,
          label: z.string().trim().min(1).max(80).optional(),
          classes: z.array(ClassSchema).max(60).optional(),
        })
        .parse(request.body);
      const [exists] = await ctx.db
        .select({ id: crops.id })
        .from(crops)
        .where(and(eq(crops.orgId, me.orgId), eq(crops.key, body.key)));
      if (exists) throw conflict(`There is already a crop "${body.key}"`);
      const row = await ensureCrop(ctx, me.orgId, body.key);
      const classes = (body.classes as ClassDef[] | undefined) ?? row.classes;
      const errors = validateClasses(classes);
      if (errors.length) throw badRequest(errors.join("; "));
      const [updated] = await ctx.db
        .update(crops)
        .set({ label: body.label ?? row.label, classes })
        .where(eq(crops.id, row.id))
        .returning();
      await audit(ctx.db, {
        orgId: me.orgId,
        userId: me.id,
        action: "crops.created",
        detail: { key: body.key },
      });
      reply.code(201);
      return updated;
    });

    /** Replaces a crop's label and classes. Classes still in use can't be removed. */
    app.put("/crops/:key", admin, async (request) => {
      const me = authOf(request);
      const { key } = z.object({ key: CropKey }).parse(request.params);
      const body = z
        .object({
          label: z.string().trim().min(1).max(80),
          classes: z.array(ClassSchema).max(60),
        })
        .parse(request.body);
      const classes = body.classes as ClassDef[];
      const errors = validateClasses(classes);
      if (errors.length) throw badRequest(errors.join("; "));
      const [row] = await ctx.db
        .select()
        .from(crops)
        .where(and(eq(crops.orgId, me.orgId), eq(crops.key, key)));
      if (!row) throw notFound("Crop");
      const keep = new Set(classes.map((c) => c.id));
      const removed = row.classes
        .map((c) => c.id)
        .filter((id) => !keep.has(id));
      const inUse = await classesInUse(ctx, me.orgId, key, removed);
      if (inUse.length) {
        throw conflict(
          `These classes are used by samples, reference images or standards and can't be removed: ${inUse.join(", ")}. Rename them instead.`,
        );
      }
      const [updated] = await ctx.db
        .update(crops)
        .set({ label: body.label, classes })
        .where(eq(crops.id, row.id))
        .returning();
      await audit(ctx.db, {
        orgId: me.orgId,
        userId: me.id,
        action: "crops.updated",
        detail: { key, removed },
      });
      return updated;
    });

    app.post("/crops/:key/archive", admin, async (request) => {
      const me = authOf(request);
      const { key } = z.object({ key: CropKey }).parse(request.params);
      const { archived } = z
        .object({ archived: z.boolean() })
        .parse(request.body);
      const [row] = await ctx.db
        .update(crops)
        .set({ archived })
        .where(and(eq(crops.orgId, me.orgId), eq(crops.key, key)))
        .returning();
      if (!row) throw notFound("Crop");
      return row;
    });
  };
}

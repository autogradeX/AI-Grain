import { KERNEL_CLASSES } from "@ai-grain/core";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { kernels, referenceImages, samples } from "../../db/schema.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { TILE_PX } from "../../imaging/sheets.js";
import {
  authenticate,
  authOf,
  requireRole,
  WRITE_ROLES,
} from "../auth/guard.js";
import { readUpload } from "../batches/upload.js";

/** At most this many reference images per crop go into each Claude request. */
export const MAX_REFERENCES_PER_REQUEST = 12;

export function referenceRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.addHook("preHandler", authenticate(ctx));

    app.get("/reference-images", async (request) => {
      const me = authOf(request);
      const { crop } = z
        .object({ crop: z.string().optional() })
        .parse(request.query);
      return ctx.db
        .select({
          id: referenceImages.id,
          crop: referenceImages.crop,
          cls: referenceImages.cls,
          note: referenceImages.note,
          createdAt: referenceImages.createdAt,
        })
        .from(referenceImages)
        .where(
          crop
            ? and(
                eq(referenceImages.orgId, me.orgId),
                eq(referenceImages.crop, crop.toLowerCase()),
              )
            : eq(referenceImages.orgId, me.orgId),
        )
        .orderBy(
          referenceImages.crop,
          referenceImages.cls,
          desc(referenceImages.createdAt),
        );
    });

    app.post(
      "/reference-images",
      { preHandler: requireRole(...WRITE_ROLES) },
      async (request, reply) => {
        const me = authOf(request);
        const upload = await readUpload(request);
        const fields = z
          .object({
            crop: z.string().trim().toLowerCase().min(1).max(60),
            cls: z.enum(KERNEL_CLASSES),
            note: z.string().max(200).optional(),
          })
          .parse(upload.fields);
        let jpeg: Buffer;
        try {
          // A single kernel, cropped by the user. Square it at tile size like the sheet crops.
          jpeg = await sharp(upload.file)
            .rotate()
            .resize(TILE_PX, TILE_PX, { fit: "contain", background: "#000" })
            .jpeg({ quality: 90 })
            .toBuffer();
        } catch {
          throw badRequest("The file is not a readable image");
        }
        const [row] = await ctx.db
          .insert(referenceImages)
          .values({
            orgId: me.orgId,
            crop: fields.crop,
            cls: fields.cls,
            note: fields.note ?? null,
            storageKey: "",
            createdBy: me.id,
          })
          .returning();
        const key = `orgs/${me.orgId}/references/${row!.id}.jpg`;
        await ctx.storage.put(key, jpeg);
        await ctx.db
          .update(referenceImages)
          .set({ storageKey: key })
          .where(eq(referenceImages.id, row!.id));
        reply.code(201);
        return { id: row!.id, crop: row!.crop, cls: row!.cls, note: row!.note };
      },
    );

    /** Saves a reviewed kernel crop as a reference image. */
    app.post(
      "/reference-images/from-kernel",
      { preHandler: requireRole(...WRITE_ROLES) },
      async (request, reply) => {
        const me = authOf(request);
        const body = z
          .object({ kernelId: z.uuid(), note: z.string().max(200).optional() })
          .parse(request.body);
        const [k] = await ctx.db
          .select({
            cropKey: kernels.cropKey,
            finalClass: kernels.finalClass,
            crop: samples.crop,
          })
          .from(kernels)
          .innerJoin(samples, eq(samples.id, kernels.sampleId))
          .where(
            and(eq(kernels.id, body.kernelId), eq(kernels.orgId, me.orgId)),
          );
        if (!k) throw notFound("Kernel");
        if (!k.finalClass)
          throw badRequest("Review the kernel before using it as a reference");
        const [row] = await ctx.db
          .insert(referenceImages)
          .values({
            orgId: me.orgId,
            crop: k.crop,
            cls: k.finalClass,
            note: body.note ?? null,
            storageKey: "",
            createdBy: me.id,
          })
          .returning();
        const key = `orgs/${me.orgId}/references/${row!.id}.jpg`;
        await ctx.storage.put(key, await ctx.storage.get(k.cropKey));
        await ctx.db
          .update(referenceImages)
          .set({ storageKey: key })
          .where(eq(referenceImages.id, row!.id));
        reply.code(201);
        return { id: row!.id, crop: row!.crop, cls: row!.cls, note: row!.note };
      },
    );

    app.get("/reference-images/:id/image", async (request, reply) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const [row] = await ctx.db
        .select()
        .from(referenceImages)
        .where(
          and(eq(referenceImages.id, id), eq(referenceImages.orgId, me.orgId)),
        );
      if (!row) throw notFound("Reference image");
      reply
        .header("cache-control", "private, max-age=86400")
        .type("image/jpeg");
      return ctx.storage.get(row.storageKey);
    });

    app.delete(
      "/reference-images/:id",
      { preHandler: requireRole(...WRITE_ROLES) },
      async (request) => {
        const me = authOf(request);
        const { id } = z.object({ id: z.uuid() }).parse(request.params);
        const [row] = await ctx.db
          .delete(referenceImages)
          .where(
            and(
              eq(referenceImages.id, id),
              eq(referenceImages.orgId, me.orgId),
            ),
          )
          .returning();
        if (!row) throw notFound("Reference image");
        await ctx.storage.remove(row.storageKey);
        return { ok: true };
      },
    );
  };
}

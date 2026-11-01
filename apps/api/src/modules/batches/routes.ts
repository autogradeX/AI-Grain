import { kernelClassIds } from "@ai-grain/core";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import {
  analysisRuns,
  batches,
  kernels,
  samples,
  type Corners,
} from "../../db/schema.js";
import {
  BOARD_HEIGHT,
  BOARD_PX_PER_CM,
  BOARD_WIDTH,
  normalizeUpload,
} from "../../imaging/board.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import {
  authenticate,
  authOf,
  requireRole,
  WRITE_ROLES,
} from "../auth/guard.js";
import { ensureCrop } from "../crops/service.js";
import { loadSample } from "../samples/service.js";
import {
  aiVerdict,
  aiVerdictConfidence,
  batchPrefix,
  expireStaleBatches,
  kernelSummary,
  needsReview,
} from "./service.js";
import {
  classifyAndTriage,
  finishIfReady,
  runBatch,
} from "../autopilot/service.js";
import { readUpload } from "./upload.js";

const Point = z.object({ x: z.number().finite(), y: z.number().finite() });
const CornersSchema = z.tuple([Point, Point, Point, Point]);

const BUSY = ["detecting", "classifying"] as const;

async function loadBatch(ctx: AppContext, orgId: string, id: string) {
  await expireStaleBatches(ctx, { batchId: id });
  const [batch] = await ctx.db
    .select()
    .from(batches)
    .where(and(eq(batches.id, id), eq(batches.orgId, orgId)));
  if (!batch) throw notFound("Batch");
  return batch;
}

async function assertEditable(
  ctx: AppContext,
  orgId: string,
  sampleId: string,
) {
  const sample = await loadSample(ctx, orgId, sampleId);
  if (sample.status === "completed")
    throw conflict("The sample is completed. Reopen it to make changes.");
  return sample;
}

export function batchRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.addHook("preHandler", authenticate(ctx));
    const write = { preHandler: requireRole(...WRITE_ROLES) };

    /**
     * Uploads one board photo. `corners` are the grid's outer corners in the
     * photo (TL, TR, BR, BL) measured on an image `imageWidth` × `imageHeight`
     * pixels; the server rescales them to its stored copy. Without corners the
     * server finds the grid itself. `finish` says this is the sample's last
     * photo: Autopilot completes the sample once nothing waits on a person.
     */
    app.post("/samples/:sampleId/batches", write, async (request, reply) => {
      const me = authOf(request);
      const { sampleId } = z
        .object({ sampleId: z.uuid() })
        .parse(request.params);
      const sample = await assertEditable(ctx, me.orgId, sampleId);
      const upload = await readUpload(request);
      const fields = z
        .object({
          // "auto": Model Orchestration reads the side from the photo.
          side: z.enum(["front", "crease", "auto"]).default("auto"),
          corners: z.string().optional(),
          imageWidth: z.coerce.number().positive().optional(),
          imageHeight: z.coerce.number().positive().optional(),
          finish: z.enum(["true", "false"]).optional(),
          // From a device that queued the photo offline: a retry returns the same batch.
          clientRef: z.string().trim().min(8).max(64).optional(),
        })
        .parse(upload.fields);
      if (fields.clientRef) {
        const [existing] = await ctx.db
          .select()
          .from(batches)
          .where(
            and(
              eq(batches.clientRef, fields.clientRef),
              eq(batches.orgId, me.orgId),
            ),
          );
        if (existing) {
          reply.code(200);
          return existing;
        }
      }
      const clientCorners =
        fields.corners && fields.imageWidth && fields.imageHeight
          ? CornersSchema.parse(JSON.parse(fields.corners))
          : null;

      let normalized;
      try {
        normalized = await normalizeUpload(upload.file);
      } catch {
        throw badRequest("The file is not a readable image");
      }
      const corners = clientCorners
        ? (clientCorners.map((p) => ({
            x: (p.x * normalized.width) / fields.imageWidth!,
            y: (p.y * normalized.height) / fields.imageHeight!,
          })) as Corners)
        : null;

      const [batch] = await ctx.db
        .insert(batches)
        .values({
          orgId: me.orgId,
          sampleId: sample.id,
          side: fields.side === "crease" ? "crease" : "front",
          sideDetected: fields.side === "auto",
          clientRef: fields.clientRef ?? null,
          originalKey: "",
          originalWidth: normalized.width,
          originalHeight: normalized.height,
          corners,
          createdBy: me.id,
        })
        .returning();
      const originalKey = `${batchPrefix(batch!)}/original.jpg`;
      await ctx.storage.put(originalKey, normalized.jpeg);
      await ctx.db
        .update(batches)
        .set({ originalKey, status: "detecting" })
        .where(eq(batches.id, batch!.id));
      await ctx.db
        .update(samples)
        .set({
          updatedAt: new Date(),
          ...(fields.finish === "true" && { autoFinish: true }),
        })
        .where(eq(samples.id, sample.id));
      ctx.jobs.run(`batch ${batch!.id}`, () =>
        runBatch(ctx, batch!.id, corners),
      );
      reply.code(202);
      return { ...batch!, originalKey, status: "detecting" };
    });

    app.get("/batches/:id", async (request) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const batch = await loadBatch(ctx, me.orgId, id);
      const rows = await ctx.db
        .select({
          id: kernels.id,
          number: kernels.number,
          x: kernels.x,
          y: kernels.y,
          w: kernels.w,
          h: kernels.h,
          cell: kernels.cell,
          isCluster: kernels.isCluster,
          lengthMm: kernels.lengthMm,
          widthMm: kernels.widthMm,
          aiClass: aiVerdict,
          aiConfidence: aiVerdictConfidence,
          aiReason: sql<
            string | null
          >`coalesce(${kernels.expertReason}, ${kernels.aiReason})`,
          firstClass: kernels.aiClass,
          expertClass: kernels.expertClass,
          finalClass: kernels.finalClass,
          reviewStatus: kernels.reviewStatus,
          aiClass2: kernels.aiClass2,
          aiConfidence2: kernels.aiConfidence2,
          flagReason: kernels.flagReason,
          needsReview,
        })
        .from(kernels)
        .where(eq(kernels.batchId, id))
        .orderBy(asc(kernels.number));
      return {
        ...batch,
        board: {
          width: BOARD_WIDTH,
          height: BOARD_HEIGHT,
          pxPerCm: BOARD_PX_PER_CM,
        },
        kernels: rows,
        summary: await kernelSummary(ctx, { batchId: id }),
      };
    });

    app.get("/batches/:id/image", async (request, reply) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const { variant } = z
        .object({
          variant: z.enum(["original", "board", "preview"]).default("preview"),
        })
        .parse(request.query);
      const batch = await loadBatch(ctx, me.orgId, id);
      const key =
        variant === "original"
          ? batch.originalKey
          : `${batchPrefix(batch)}/${variant}.jpg`;
      if (variant !== "original" && !batch.boardKey)
        throw notFound("Board image");
      reply.header("cache-control", "private, max-age=60").type("image/jpeg");
      return ctx.storage.get(key);
    });

    /** Re-runs detection with new corners. Clears earlier kernels and their review. */
    app.put("/batches/:id/corners", write, async (request, reply) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const body = z.object({ corners: CornersSchema }).parse(request.body);
      const batch = await loadBatch(ctx, me.orgId, id);
      await assertEditable(ctx, me.orgId, batch.sampleId);
      if ((BUSY as readonly string[]).includes(batch.status))
        throw conflict("The batch is still being processed");
      await ctx.db
        .update(batches)
        .set({ status: "detecting" })
        .where(eq(batches.id, id));
      ctx.jobs.run(`batch ${id}`, () => runBatch(ctx, id, body.corners));
      reply.code(202);
      return { ok: true };
    });

    app.post("/batches/:id/classify", write, async (request, reply) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const { reclassifyAll } = z
        .object({ reclassifyAll: z.boolean().default(false) })
        .parse(request.body ?? {});
      const batch = await loadBatch(ctx, me.orgId, id);
      await assertEditable(ctx, me.orgId, batch.sampleId);
      if ((BUSY as readonly string[]).includes(batch.status))
        throw conflict("The batch is still being processed");
      if (!batch.boardKey)
        throw badRequest("Kernels have not been detected yet");
      if (reclassifyAll) {
        // Keeps the operator's decisions; only Claude's verdicts are cleared.
        await ctx.db
          .update(kernels)
          .set({
            aiClass: null,
            aiConfidence: null,
            aiReason: null,
            aiClass2: null,
            aiConfidence2: null,
            expertClass: null,
            expertConfidence: null,
            expertReason: null,
          })
          .where(eq(kernels.batchId, id));
      }
      await ctx.db
        .update(batches)
        .set({ status: "classifying", error: null })
        .where(eq(batches.id, id));
      ctx.jobs.run(`classify ${id}`, () => classifyAndTriage(ctx, id));
      reply.code(202);
      return { ok: true };
    });

    app.delete("/batches/:id", write, async (request) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const batch = await loadBatch(ctx, me.orgId, id);
      await assertEditable(ctx, me.orgId, batch.sampleId);
      if ((BUSY as readonly string[]).includes(batch.status))
        throw conflict("The batch is still being processed");
      await ctx.db.delete(batches).where(eq(batches.id, id));
      await ctx.storage.remove(batchPrefix(batch));
      return { ok: true };
    });

    app.get("/kernels/:id/crop", async (request, reply) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const [k] = await ctx.db
        .select({ cropKey: kernels.cropKey })
        .from(kernels)
        .where(and(eq(kernels.id, id), eq(kernels.orgId, me.orgId)));
      if (!k) throw notFound("Kernel");
      reply.header("cache-control", "private, max-age=3600").type("image/jpeg");
      return ctx.storage.get(k.cropKey);
    });

    /** Kernels across a sample's batches that the operator still has to check, or all flagged ones. */
    app.get("/samples/:sampleId/review", async (request) => {
      const me = authOf(request);
      const { sampleId } = z
        .object({ sampleId: z.uuid() })
        .parse(request.params);
      const { scope } = z
        .object({
          scope: z.enum(["pending", "flagged", "all"]).default("pending"),
        })
        .parse(request.query);
      await loadSample(ctx, me.orgId, sampleId);
      const conditions = [eq(kernels.sampleId, sampleId)];
      if (scope !== "all") conditions.push(needsReview);
      if (scope === "pending")
        conditions.push(eq(kernels.reviewStatus, "pending"));
      return ctx.db
        .select({
          id: kernels.id,
          batchId: kernels.batchId,
          side: batches.side,
          number: kernels.number,
          cell: kernels.cell,
          isCluster: kernels.isCluster,
          aiClass: aiVerdict,
          aiConfidence: aiVerdictConfidence,
          aiReason: sql<
            string | null
          >`coalesce(${kernels.expertReason}, ${kernels.aiReason})`,
          firstClass: kernels.aiClass,
          expertClass: kernels.expertClass,
          finalClass: kernels.finalClass,
          reviewStatus: kernels.reviewStatus,
          aiClass2: kernels.aiClass2,
          flagReason: kernels.flagReason,
        })
        .from(kernels)
        .innerJoin(batches, eq(batches.id, kernels.batchId))
        .where(and(...conditions))
        .orderBy(asc(batches.createdAt), asc(kernels.number));
    });

    /**
     * Records the operator's decision for one or more kernels. A decision equal
     * to Claude's verdict counts as confirmed; anything else as corrected.
     */
    app.post("/kernels/review", write, async (request) => {
      const me = authOf(request);
      const body = z
        .object({
          decisions: z
            .array(
              z.object({
                kernelId: z.uuid(),
                finalClass: z.string().max(40).nullable(),
              }),
            )
            .min(1)
            .max(500),
        })
        .parse(request.body);
      const ids = body.decisions.map((d) => d.kernelId);
      const found = await ctx.db
        .select({
          id: kernels.id,
          sampleId: kernels.sampleId,
          aiClass: aiVerdict,
        })
        .from(kernels)
        .where(and(eq(kernels.orgId, me.orgId), inArray(kernels.id, ids)));
      if (found.length !== new Set(ids).size) throw notFound("Kernel");
      // Each decision must be a class of that kernel's crop.
      const allowed = new Map<string, Set<string>>();
      for (const sampleId of new Set(found.map((k) => k.sampleId))) {
        const sample = await assertEditable(ctx, me.orgId, sampleId);
        const crop = await ensureCrop(ctx, me.orgId, sample.crop);
        allowed.set(sampleId, new Set(kernelClassIds(crop.classes)));
      }
      const sampleOf = new Map(found.map((k) => [k.id, k.sampleId]));
      for (const d of body.decisions) {
        if (
          d.finalClass !== null &&
          !allowed.get(sampleOf.get(d.kernelId)!)?.has(d.finalClass)
        ) {
          throw badRequest(
            `"${d.finalClass}" is not a class of this sample's crop`,
          );
        }
      }
      const ai = new Map(found.map((k) => [k.id, k.aiClass]));
      const now = new Date();
      await ctx.db.transaction(async (tx) => {
        for (const d of body.decisions) {
          await tx
            .update(kernels)
            .set(
              d.finalClass === null
                ? {
                    finalClass: null,
                    reviewStatus: "pending",
                    reviewedBy: null,
                    reviewedAt: null,
                  }
                : {
                    finalClass: d.finalClass,
                    reviewStatus:
                      d.finalClass === ai.get(d.kernelId)
                        ? "confirmed"
                        : "corrected",
                    reviewedBy: me.id,
                    reviewedAt: now,
                  },
            )
            .where(eq(kernels.id, d.kernelId));
        }
      });
      // The last decision may be all that kept a sample from finishing.
      for (const sampleId of new Set(found.map((k) => k.sampleId))) {
        ctx.jobs.run(`finish ${sampleId}`, async () => {
          await finishIfReady(ctx, sampleId);
        });
      }
      return { ok: true, updated: body.decisions.length };
    });

    app.get("/samples/:sampleId/usage", async (request) => {
      const me = authOf(request);
      const { sampleId } = z
        .object({ sampleId: z.uuid() })
        .parse(request.params);
      await loadSample(ctx, me.orgId, sampleId);
      const [row] = await ctx.db
        .select({
          requests: sql<number>`coalesce(sum(${analysisRuns.requests}), 0)::int`,
          inputTokens: sql<number>`coalesce(sum(${analysisRuns.inputTokens}), 0)::int`,
          outputTokens: sql<number>`coalesce(sum(${analysisRuns.outputTokens}), 0)::int`,
          cacheReadTokens: sql<number>`coalesce(sum(${analysisRuns.cacheReadTokens}), 0)::int`,
          cacheWriteTokens: sql<number>`coalesce(sum(${analysisRuns.cacheWriteTokens}), 0)::int`,
        })
        .from(analysisRuns)
        .where(eq(analysisRuns.sampleId, sampleId));
      return row;
    });
  };
}

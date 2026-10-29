import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { zipSync } from "fflate";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { batches, kernels, samples } from "../../db/schema.js";
import { csvRow } from "../../lib/csv.js";
import { badRequest } from "../../lib/errors.js";
import { authenticate, authOf, requireRole } from "../auth/guard.js";

const MAX_EXPORT = 20_000;

/**
 * Every kernel an operator confirmed or corrected is a labelled training
 * example. This exports them as images sorted into one folder per class,
 * with a CSV of labels and Claude's original verdicts.
 */
export function datasetRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.addHook("preHandler", authenticate(ctx));

    app.get("/dataset/stats", async (request) => {
      const me = authOf(request);
      return ctx.db
        .select({
          crop: samples.crop,
          cls: kernels.finalClass,
          count: sql<number>`count(*)::int`,
          corrected: sql<number>`count(*) filter (where ${kernels.reviewStatus} = 'corrected')::int`,
        })
        .from(kernels)
        .innerJoin(samples, eq(samples.id, kernels.sampleId))
        .where(
          and(
            eq(kernels.orgId, me.orgId),
            inArray(kernels.reviewStatus, ["confirmed", "corrected"]),
          ),
        )
        .groupBy(samples.crop, kernels.finalClass)
        .orderBy(samples.crop, kernels.finalClass);
    });

    app.get(
      "/dataset/export.zip",
      { preHandler: requireRole("admin") },
      async (request, reply) => {
        const me = authOf(request);
        const q = z
          .object({ crop: z.string().optional() })
          .parse(request.query);
        const conditions = [
          eq(kernels.orgId, me.orgId),
          inArray(kernels.reviewStatus, ["confirmed", "corrected"]),
        ];
        if (q.crop) conditions.push(eq(samples.crop, q.crop.toLowerCase()));
        const rows = await ctx.db
          .select({
            id: kernels.id,
            cropKey: kernels.cropKey,
            finalClass: kernels.finalClass,
            aiClass: kernels.aiClass,
            aiConfidence: kernels.aiConfidence,
            reviewStatus: kernels.reviewStatus,
            cell: kernels.cell,
            side: batches.side,
            windowCm: batches.cropWindowCm,
            sampleNumber: samples.number,
            crop: samples.crop,
          })
          .from(kernels)
          .innerJoin(samples, eq(samples.id, kernels.sampleId))
          .innerJoin(batches, eq(batches.id, kernels.batchId))
          .where(and(...conditions))
          .orderBy(asc(samples.number), asc(kernels.number))
          .limit(MAX_EXPORT + 1);
        if (rows.length > MAX_EXPORT) {
          throw badRequest(
            `More than ${MAX_EXPORT} labelled kernels. Export one crop at a time.`,
          );
        }

        const files: Record<string, Uint8Array> = {};
        const csv = [
          "file,crop,label,claude_label,claude_confidence,review,sample,cell,side,window_cm",
        ];
        for (const r of rows) {
          const path = `${r.crop}/${r.finalClass}/${r.id}.jpg`;
          files[path] = new Uint8Array(await ctx.storage.get(r.cropKey));
          csv.push(
            csvRow([
              path,
              r.crop,
              r.finalClass,
              r.aiClass,
              r.aiConfidence,
              r.reviewStatus,
              r.sampleNumber,
              r.cell,
              r.side,
              r.windowCm,
            ]),
          );
        }
        files["labels.csv"] = new TextEncoder().encode(csv.join("\n") + "\n");
        // JPEGs are already compressed; storing them avoids wasted CPU.
        const zip = zipSync(files, { level: 0 });
        reply
          .type("application/zip")
          .header(
            "content-disposition",
            `attachment; filename="ai-grain-dataset${q.crop ? `-${q.crop}` : ""}.zip"`,
          );
        return Buffer.from(zip);
      },
    );
  };
}

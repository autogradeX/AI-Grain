import { CLASS_GROUPS, roundPct, summarizePercentages } from "@ai-grain/core";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { samples, standards } from "../../db/schema.js";
import { authenticate, authOf } from "../auth/guard.js";
import { csvCell } from "../../lib/csv.js";
import { listCrops } from "../crops/service.js";
import { loadSample } from "../samples/service.js";
import { reportPdf } from "./service.js";

export function reportRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.addHook("preHandler", authenticate(ctx));

    app.get("/samples/:id/report.pdf", async (request, reply) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const sample = await loadSample(ctx, me.orgId, id);
      const pdf = await reportPdf(ctx, sample);
      reply
        .type("application/pdf")
        .header(
          "content-disposition",
          `inline; filename="sample-${sample.number}.pdf"`,
        );
      return pdf;
    });

    app.get("/samples/export.csv", async (request, reply) => {
      const me = authOf(request);
      const q = z
        .object({
          from: z.iso.date().optional(),
          to: z.iso.date().optional(),
          status: z.enum(["in_progress", "completed"]).optional(),
        })
        .parse(request.query);
      const conditions = [eq(samples.orgId, me.orgId)];
      if (q.status) conditions.push(eq(samples.status, q.status));
      if (q.from)
        conditions.push(
          gte(samples.createdAt, new Date(`${q.from}T00:00:00Z`)),
        );
      if (q.to)
        conditions.push(lte(samples.createdAt, new Date(`${q.to}T23:59:59Z`)));
      const rows = await ctx.db
        .select({ sample: samples, standardName: standards.name })
        .from(samples)
        .leftJoin(standards, eq(standards.id, samples.standardId))
        .where(and(...conditions))
        .orderBy(desc(samples.createdAt))
        .limit(10_000);
      // One column per class of every crop in the export, prefixed by crop.
      const cropList = await listCrops(ctx, me.orgId);
      const classesOf = new Map(cropList.map((c) => [c.key, c.classes]));
      const usedCrops = [...new Set(rows.map((r) => r.sample.crop))];
      const classColumns = usedCrops.flatMap((crop) =>
        (classesOf.get(crop) ?? []).map((c) => ({ crop, id: c.id })),
      );
      const header = [
        "number",
        "created",
        "completed",
        "status",
        "crop",
        "source",
        "standard",
        "grade",
        "sample_mass_g",
        "moisture_pct",
        "test_weight_kg_hl",
        "purity_pct",
        "total_defects_pct",
        ...CLASS_GROUPS.map((g) => `${g}_pct`),
        ...classColumns.map((c) => `${c.crop}:${c.id}_pct`),
      ];
      const lines = [header.join(",")];
      for (const { sample: s, standardName } of rows) {
        const pct = s.result
          ? summarizePercentages(
              s.result.byClassPct,
              classesOf.get(s.crop) ?? [],
            )
          : null;
        lines.push(
          [
            s.number,
            s.createdAt.toISOString(),
            s.completedAt?.toISOString(),
            s.status,
            s.crop,
            s.source,
            standardName,
            s.result?.grade.grade,
            s.sampleMassG,
            s.moisturePct,
            s.testWeightKgPerHl,
            pct ? roundPct(pct.purityPct, 3) : null,
            pct ? roundPct(pct.totalDefectsPct, 3) : null,
            ...CLASS_GROUPS.map((g) =>
              pct ? roundPct(pct.byGroup[g], 3) : null,
            ),
            ...classColumns.map((c) =>
              pct && c.crop === s.crop
                ? roundPct(pct.byClass[c.id] ?? 0, 3)
                : null,
            ),
          ]
            .map(csvCell)
            .join(","),
        );
      }
      reply
        .type("text/csv; charset=utf-8")
        .header("content-disposition", 'attachment; filename="samples.csv"');
      return lines.join("\n") + "\n";
    });
  };
}

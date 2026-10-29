import { CLASS_LABELS, DEFECT_CLASSES, roundPct } from "@ai-grain/core";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import {
  batches,
  kernels,
  organizations,
  samples,
  standards,
  users,
} from "../../db/schema.js";
import { BOARD_WIDTH } from "../../imaging/board.js";
import { annotateBoard } from "../../imaging/sheets.js";
import { authenticate, authOf } from "../auth/guard.js";
import {
  batchPrefix,
  effectiveClass,
  kernelSummary,
  modelFor,
} from "../batches/service.js";
import { csvCell } from "../../lib/csv.js";
import { getStandard } from "../standards/routes.js";
import { loadSample } from "../samples/service.js";
import { renderReport } from "./pdf.js";

export function reportRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.addHook("preHandler", authenticate(ctx));

    app.get("/samples/:id/report.pdf", async (request, reply) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const sample = await loadSample(ctx, me.orgId, id);
      const [org] = await ctx.db
        .select()
        .from(organizations)
        .where(eq(organizations.id, me.orgId));
      const standard = sample.standardId
        ? await getStandard(ctx, me.orgId, sample.standardId)
        : null;
      const names = await ctx.db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(
          inArray(
            users.id,
            [sample.createdBy, sample.completedBy].filter(
              (v): v is string => !!v,
            ),
          ),
        );
      const nameOf = (uid: string | null) =>
        names.find((n) => n.id === uid)?.name ?? null;

      const batchRows = await ctx.db
        .select()
        .from(batches)
        .where(eq(batches.sampleId, id))
        .orderBy(asc(batches.createdAt));
      const boards = [];
      for (const b of batchRows) {
        if (!b.boardKey) continue;
        const marks = await ctx.db
          .select({
            x: kernels.x,
            y: kernels.y,
            w: kernels.w,
            h: kernels.h,
            cls: effectiveClass,
          })
          .from(kernels)
          .where(eq(kernels.batchId, b.id));
        const preview = await ctx.storage.get(`${batchPrefix(b)}/preview.jpg`);
        boards.push({
          side: b.side,
          image: await annotateBoard(
            preview,
            BOARD_WIDTH,
            marks
              .filter((m) => m.cls && m.cls !== "sound")
              .map((m) => ({
                ...m,
                color: m.cls === "unclear" ? "#ffb300" : "#ff1744",
              })),
          ),
        });
      }

      const pdf = await renderReport({
        orgName: org?.name ?? "",
        sample,
        standard: standard
          ? { name: standard.name, grades: standard.grades }
          : null,
        createdByName: nameOf(sample.createdBy),
        completedByName: nameOf(sample.completedBy),
        model: await modelFor(ctx, id),
        kernels: await kernelSummary(ctx, { sampleId: id }),
        boards,
      });
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
        "total_defects_pct",
        ...DEFECT_CLASSES.map((c) => `${c}_pct`),
      ];
      const lines = [header.join(",")];
      for (const { sample: s, standardName } of rows) {
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
            s.result ? roundPct(s.result.totalDefectsPct, 3) : null,
            ...DEFECT_CLASSES.map((c) =>
              s.result ? roundPct(s.result.byClassPct[c], 3) : null,
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

    app.get("/classes", () =>
      ["sound", ...DEFECT_CLASSES, "unclear"].map((c) => ({
        id: c,
        label: CLASS_LABELS[c as keyof typeof CLASS_LABELS],
      })),
    );
  };
}

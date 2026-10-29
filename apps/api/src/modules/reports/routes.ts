import { CLASS_GROUPS, roundPct, summarizePercentages } from "@ai-grain/core";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import QRCode from "qrcode";
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
import { currentCertificate } from "../certificates/service.js";
import { ensureCrop, listCrops } from "../crops/service.js";
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

      const crop = await ensureCrop(ctx, me.orgId, sample.crop);

      // Gallery: every kernel whose class isn't sound, in batch and number order.
      const GALLERY_MAX = 240;
      const batchIndex = new Map(batchRows.map((b, i) => [b.id, i + 1]));
      const notSound = sql`coalesce(${effectiveClass}, '') <> 'sound'`;
      const galleryRows = await ctx.db
        .select({
          batchId: kernels.batchId,
          number: kernels.number,
          cell: kernels.cell,
          cropKey: kernels.cropKey,
          aiClass: kernels.aiClass,
          aiConfidence: kernels.aiConfidence,
          finalClass: kernels.finalClass,
          reviewStatus: kernels.reviewStatus,
        })
        .from(kernels)
        .where(and(eq(kernels.sampleId, id), notSound))
        .orderBy(asc(kernels.batchId), asc(kernels.number));
      const ordered = galleryRows.sort(
        (a, b) =>
          (batchIndex.get(a.batchId) ?? 0) - (batchIndex.get(b.batchId) ?? 0) ||
          a.number - b.number,
      );
      const gallery = await Promise.all(
        ordered.slice(0, GALLERY_MAX).map(async (k) => ({
          jpeg: await ctx.storage.get(k.cropKey),
          number: k.number,
          cell: k.cell,
          batch: batchIndex.get(k.batchId) ?? 0,
          finalClass: k.finalClass,
          aiClass: k.aiClass,
          aiConfidence: k.aiConfidence,
          reviewed: k.reviewStatus !== "pending",
        })),
      );

      const cert =
        sample.status === "completed"
          ? await currentCertificate(ctx, id)
          : null;
      const verifyUrl = cert
        ? `${ctx.config.APP_URL}/verify/${cert.code}`
        : null;
      const pdf = await renderReport({
        orgName: org?.name ?? "",
        sample,
        standard: standard
          ? { name: standard.name, grades: standard.grades }
          : null,
        createdByName: nameOf(sample.createdBy),
        completedByName: nameOf(sample.completedBy),
        cropLabel: crop.label,
        classes: crop.classes,
        model: await modelFor(ctx, id),
        kernels: await kernelSummary(ctx, { sampleId: id }),
        boards,
        certificate:
          cert && verifyUrl
            ? {
                code: cert.code,
                version: cert.version,
                hash: cert.payloadHash,
                url: verifyUrl,
                qr: await QRCode.toBuffer(verifyUrl, {
                  type: "png",
                  margin: 1,
                  width: 300,
                }),
              }
            : null,
        gallery,
        galleryTotal: ordered.length,
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

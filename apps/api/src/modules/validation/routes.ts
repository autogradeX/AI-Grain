import {
  cellNumber,
  compareRuns,
  DEFAULT_TOLERANCES,
  headerKey,
  LAB_MEASUREMENTS,
  parseTable,
  repeatabilityBand,
  summarizeValidation,
  type RepeatabilityBand,
  type Tolerances,
} from "@ai-grain/core";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { samples, standards, type ReferenceResult } from "../../db/schema.js";
import { audit } from "../../lib/audit.js";
import { badRequest } from "../../lib/errors.js";
import { ensureCrop } from "../crops/service.js";
import { breakdownOf } from "../samples/service.js";
import {
  authenticate,
  authOf,
  requireRole,
  WRITE_ROLES,
} from "../auth/guard.js";
import { pageQuery } from "../../lib/pagination.js";

/** The number of samples graded both ways before the method's results should be relied on. */
export const VALIDATION_TARGET = { min: 30, recommended: 50 };

export function validationRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.addHook("preHandler", authenticate(ctx));
    const write = { preHandler: requireRole(...WRITE_ROLES) };

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

    /** The rows and summary of a validation: every completed sample with a reference result. */
    async function comparison(
      orgId: string,
      q: { crop?: string | undefined; standardId?: string | undefined },
      tolerances: Tolerances,
    ) {
      const conditions = [
        eq(samples.orgId, orgId),
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
          enamLotId: samples.enamLotId,
          standardName: standards.name,
          result: samples.result,
          reference: samples.reference,
          moisturePct: samples.moisturePct,
          proteinPct: samples.proteinPct,
          oilPct: samples.oilPct,
          completedAt: samples.completedAt,
        })
        .from(samples)
        .leftJoin(standards, eq(standards.id, samples.standardId))
        .where(and(...conditions))
        .orderBy(desc(samples.completedAt));
      const measured = (v: number | null | undefined) => v ?? undefined;
      const pairs = rows.map((r) => ({
        method: r.result!.byClassPct,
        reference: r.reference!.byClassPct,
        methodGrade: r.result!.grade.grade,
        referenceGrade: r.reference!.grade,
        methodMeasurements: {
          moisture: measured(r.moisturePct),
          protein: measured(r.proteinPct),
          oil: measured(r.oilPct),
        },
        referenceMeasurements: {
          moisture: r.reference!.moisturePct,
          protein: r.reference!.proteinPct,
          oil: r.reference!.oilPct,
        },
      }));
      return { rows, summary: summarizeValidation(pairs, tolerances) };
    }

    const Query = z.object({
      crop: z.string().optional(),
      standardId: z.uuid().optional(),
      // Agreement tolerances in percentage points (defaults: DEFAULT_TOLERANCES).
      tolClass: z.coerce.number().min(0).max(50).optional(),
      tolMoisture: z.coerce.number().min(0).max(50).optional(),
      tolProtein: z.coerce.number().min(0).max(50).optional(),
      tolOil: z.coerce.number().min(0).max(50).optional(),
    });
    const tolerancesOf = (q: z.infer<typeof Query>): Tolerances => ({
      classPct: q.tolClass ?? DEFAULT_TOLERANCES.classPct,
      moisture: q.tolMoisture ?? DEFAULT_TOLERANCES.moisture,
      protein: q.tolProtein ?? DEFAULT_TOLERANCES.protein,
      oil: q.tolOil ?? DEFAULT_TOLERANCES.oil,
    });

    app.get("/validation", async (request) => {
      const me = authOf(request);
      const q = Query.extend(pageQuery(25)).parse(request.query);
      const { rows, summary } = await comparison(me.orgId, q, tolerancesOf(q));
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
          enamLotId: r.enamLotId,
          standardName: r.standardName,
          completedAt: r.completedAt,
          methodGrade: r.result!.grade.grade,
          referenceGrade: r.reference!.grade,
          methodPct: r.result!.byClassPct,
          referencePct: r.reference!.byClassPct,
          lab: r.reference!.lab ?? r.reference!.graderName ?? null,
          reportNo: r.reference!.reportNo ?? null,
        })),
      };
    });

    /**
     * The validation as a spreadsheet, for a tender or an audit: the
     * summary per class and per measurement, then every sample side by side
     * with the lab.
     */
    app.get("/validation/report.csv", async (request, reply) => {
      const me = authOf(request);
      const q = Query.parse(request.query);
      const tolerances = tolerancesOf(q);
      const { rows, summary } = await comparison(me.orgId, q, tolerances);
      const cell = (v: string | number | null | undefined) => {
        const text =
          v === null || v === undefined
            ? ""
            : typeof v === "number"
              ? String(Math.round(v * 1000) / 1000)
              : String(v);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };
      const line = (cells: (string | number | null | undefined)[]) =>
        cells.map(cell).join(",");
      const out: string[] = [
        line(["AI-Grain validation against reference results"]),
        line(["Samples", summary.samples]),
        line([
          "Grade agreement",
          summary.gradeAgreement === null
            ? ""
            : `${Math.round(summary.gradeAgreement * 100)}% of ${summary.gradeComparable}`,
        ]),
        line([
          "Tolerances (percentage points)",
          `class ${tolerances.classPct}`,
          `moisture ${tolerances.moisture}`,
          `protein ${tolerances.protein}`,
          `oil ${tolerances.oil}`,
        ]),
        "",
        line([
          "Parameter",
          "Samples",
          "Mean here",
          "Mean reference",
          "Mean difference (bias)",
          "Mean absolute difference",
          "Largest difference",
          "Within tolerance",
        ]),
        ...summary.byClass.map((c) =>
          line([
            c.cls,
            c.n,
            c.meanMethodPct,
            c.meanReferencePct,
            c.meanBiasPct,
            c.meanAbsDiffPct,
            c.maxAbsDiffPct,
            `${Math.round(c.withinTolerance * 100)}%`,
          ]),
        ),
        ...summary.measurements.map((m) =>
          line([
            m.field,
            m.n,
            "",
            "",
            m.meanBias,
            m.meanAbsDiff,
            m.maxAbsDiff,
            `${Math.round(m.withinTolerance * 100)}%`,
          ]),
        ),
        "",
      ];
      const classes = summary.byClass.map((c) => c.cls);
      out.push(
        line([
          "Sample",
          "e-NAM lot",
          "Crop",
          "Completed",
          "Lab",
          "Report no.",
          "Grade here",
          "Grade reference",
          ...classes.flatMap((c) => [`${c} here`, `${c} reference`]),
          ...LAB_MEASUREMENTS.flatMap((f) => [`${f} here`, `${f} reference`]),
        ]),
      );
      for (const r of rows) {
        const ref = r.reference!;
        const mine = {
          moisture: r.moisturePct,
          protein: r.proteinPct,
          oil: r.oilPct,
        };
        const theirs = {
          moisture: ref.moisturePct,
          protein: ref.proteinPct,
          oil: ref.oilPct,
        };
        out.push(
          line([
            r.number,
            r.enamLotId,
            r.crop,
            r.completedAt?.toISOString().slice(0, 10),
            ref.lab ?? ref.graderName,
            ref.reportNo,
            r.result!.grade.grade,
            ref.grade,
            ...classes.flatMap((c) => [
              r.result!.byClassPct[c],
              ref.byClassPct[c],
            ]),
            ...LAB_MEASUREMENTS.flatMap((f) => [mine[f], theirs[f]]),
          ]),
        );
      }
      reply
        .header("content-type", "text/csv; charset=utf-8")
        .header(
          "content-disposition",
          'attachment; filename="ai-grain-validation.csv"',
        );
      return `\uFEFF${out.join("\r\n")}\r\n`;
    });

    /**
     * A reference lab's results for many samples at once (CSV): each row
     * names a sample by number or e-NAM lot ID; columns named after a class
     * (its id or name), "Grade", "Lab", "Report no", "Date", "Moisture",
     * "Protein" and "Oil" are taken. Without `apply`, a preview.
     */
    app.post("/validation/import", write, async (request) => {
      const me = authOf(request);
      const body = z
        .object({
          csv: z.string().min(1).max(900_000),
          apply: z.boolean().default(false),
        })
        .parse(request.body);
      const [header, ...lines] = parseTable(body.csv);
      if (!header) throw badRequest("The file is empty");
      const keys = header.map(headerKey);
      const col = (is: (k: string) => boolean) => keys.findIndex(is);
      const c = {
        sample: col((k) => k.startsWith("sample")),
        lot: col((k) => k.includes("lot")),
        grade: col((k) => k === "grade" || k === "labgrade"),
        lab: col((k) => k === "lab" || k === "laboratory" || k === "grader"),
        report: col((k) => k.startsWith("report") || k === "certificateno"),
        date: col((k) => k === "date" || k === "testedon" || k === "gradedon"),
        moisture: col((k) => k.includes("moisture")),
        protein: col((k) => k.includes("protein")),
        oil: col((k) => k.includes("oil") || k === "fat"),
      };
      if (c.sample < 0 && c.lot < 0)
        throw badRequest(
          'No column names the sample: add a "Sample" (sample number) or "Lot" (e-NAM lot ID) column',
        );
      if (lines.length > 2000) throw badRequest("At most 2000 rows at a time");
      const known = new Set(Object.values(c).filter((i) => i >= 0));
      const usedColumns = new Set<number>();
      const out = [];
      let applied = 0;
      for (const [i, cells] of lines.entries()) {
        const rawNumber =
          c.sample >= 0 ? cells[c.sample]?.replace(/^#/, "") : "";
        const number =
          rawNumber && /^\d+$/.test(rawNumber) ? Number(rawNumber) : null;
        const lotId = c.lot >= 0 ? cells[c.lot]?.trim() || null : null;
        const row = {
          line: i + 2,
          sampleNumber: number,
          lotId,
          sampleId: null as string | null,
          classes: 0,
          error: null as string | null,
        };
        out.push(row);
        if (number === null && !lotId) {
          row.error = "No sample number or lot ID";
          continue;
        }
        const found = await ctx.db
          .select()
          .from(samples)
          .where(
            and(
              eq(samples.orgId, me.orgId),
              number !== null
                ? eq(samples.number, number)
                : eq(samples.enamLotId, lotId!),
            ),
          )
          .orderBy(desc(samples.createdAt));
        if (!found.length) {
          row.error = "No such sample";
          continue;
        }
        if (found.length > 1) {
          row.error = `Several samples for this lot (#${found.map((f) => f.number).join(", #")}): use the sample number`;
          continue;
        }
        const sample = found[0]!;
        row.sampleId = sample.id;
        row.sampleNumber = sample.number;
        // Class columns, by the class's id or name, for this sample's crop.
        const crop = await ensureCrop(ctx, me.orgId, sample.crop);
        const byClassPct: Record<string, number> = {};
        for (const cls of crop.classes) {
          const idx = keys.findIndex(
            (k, j) =>
              !known.has(j) &&
              (k === headerKey(cls.id) || k === headerKey(cls.label)),
          );
          if (idx < 0) continue;
          const v = cellNumber(cells[idx]);
          if (v === null) continue;
          usedColumns.add(idx);
          if (v < 0 || v > 100) {
            row.error = `${cls.label}: ${v} is outside 0–100 %`;
            break;
          }
          byClassPct[cls.id] = v;
        }
        if (row.error) continue;
        row.classes = Object.keys(byClassPct).length;
        const num = (idx: number) => (idx >= 0 ? cellNumber(cells[idx]) : null);
        const text = (idx: number) =>
          idx >= 0 ? cells[idx]?.trim() || undefined : undefined;
        const measurements = {
          moisturePct: num(c.moisture),
          proteinPct: num(c.protein),
          oilPct: num(c.oil),
        };
        if (
          !row.classes &&
          Object.values(measurements).every((v) => v === null)
        ) {
          row.error = "No class or measurement values";
          continue;
        }
        if (!body.apply) continue;
        const before = sample.reference;
        const date = text(c.date);
        const reference: ReferenceResult = {
          ...before,
          byClassPct: { ...before?.byClassPct, ...byClassPct },
          grade: text(c.grade) ?? before?.grade ?? null,
          ...(text(c.lab) && { lab: text(c.lab) }),
          ...(text(c.report) && { reportNo: text(c.report) }),
          ...(date && /^\d{4}-\d{2}-\d{2}$/.test(date) && { gradedOn: date }),
          ...(measurements.moisturePct !== null && {
            moisturePct: measurements.moisturePct,
          }),
          ...(measurements.proteinPct !== null && {
            proteinPct: measurements.proteinPct,
          }),
          ...(measurements.oilPct !== null && { oilPct: measurements.oilPct }),
        };
        await ctx.db
          .update(samples)
          .set({ reference, updatedAt: new Date() })
          .where(eq(samples.id, sample.id));
        applied++;
      }
      if (body.apply && applied)
        await audit(ctx.db, {
          orgId: me.orgId,
          userId: me.id,
          action: "validation.lab_results_imported",
          detail: { applied, rows: lines.length },
        });
      const ignored = header.filter(
        (_, j) => !known.has(j) && !usedColumns.has(j),
      );
      return { rows: out, applied, ignoredColumns: ignored };
    });
  };
}

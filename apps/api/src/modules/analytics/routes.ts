import {
  CLASS_GROUPS,
  summarizePercentages,
  type ClassGroup,
} from "@ai-grain/core";
import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ClaudeModel } from "../../config.js";
import type { AppContext } from "../../context.js";
import { analysisRuns, kernels, samples, users } from "../../db/schema.js";
import { authenticate, authOf } from "../auth/guard.js";
import { listCrops } from "../crops/service.js";
import { estimateFor } from "../samples/service.js";

/** List prices in USD per million tokens, for a cost estimate. */
const PRICES: Record<
  ClaudeModel,
  { input: number; output: number; cacheRead: number }
> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
};
/** Cache writes (5-minute) cost 1.25 × the input price. */
const CACHE_WRITE_FACTOR = 1.25;

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Monday of the week containing `d`, as YYYY-MM-DD (UTC). */
function weekStart(d: Date): string {
  const x = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return day(x);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export function analyticsRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.addHook("preHandler", authenticate(ctx));

    app.get("/analytics", async (request) => {
      const me = authOf(request);
      const q = z
        .object({
          days: z.coerce.number().int().min(1).max(730).default(30),
          crop: z.string().max(60).optional(),
        })
        .parse(request.query);
      const from = new Date(Date.now() - q.days * 24 * 3600 * 1000);
      from.setUTCHours(0, 0, 0, 0);

      const cropRows = await listCrops(ctx, me.orgId);
      const classesOf = new Map(cropRows.map((c) => [c.key, c.classes]));
      const sampleFilter = [
        eq(samples.orgId, me.orgId),
        gte(samples.createdAt, from),
      ];
      if (q.crop) sampleFilter.push(eq(samples.crop, q.crop));
      const rows = await ctx.db
        .select({
          id: samples.id,
          crop: samples.crop,
          source: samples.source,
          status: samples.status,
          result: samples.result,
          createdAt: samples.createdAt,
          completedAt: samples.completedAt,
          completedBy: samples.completedBy,
        })
        .from(samples)
        .where(and(...sampleFilter))
        .limit(5000);
      const completed = rows.filter(
        (r) => r.status === "completed" && r.result && r.completedAt,
      );

      // Samples per day: every day in the range, zeros included.
      const perDay = new Map<string, { created: number; completed: number }>();
      for (
        let d = new Date(from);
        d <= new Date();
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        perDay.set(day(d), { created: 0, completed: 0 });
      }
      for (const r of rows) {
        const d = perDay.get(day(r.createdAt));
        if (d) d.created++;
      }
      for (const r of completed) {
        const d = perDay.get(day(r.completedAt!));
        if (d) d.completed++;
      }

      // Average mass % per defect group, per week, over completed samples.
      const pctOf = (r: (typeof completed)[number]) =>
        summarizePercentages(r.result!.byClassPct, classesOf.get(r.crop) ?? []);
      const weeks = new Map<
        string,
        { n: number; sums: Record<ClassGroup, number>; purity: number }
      >();
      for (const r of completed) {
        const w = weekStart(r.completedAt!);
        const p = pctOf(r);
        const entry =
          weeks.get(w) ??
          ({
            n: 0,
            purity: 0,
            sums: Object.fromEntries(CLASS_GROUPS.map((g) => [g, 0])),
          } as {
            n: number;
            sums: Record<ClassGroup, number>;
            purity: number;
          });
        entry.n++;
        entry.purity += p.purityPct;
        for (const g of CLASS_GROUPS) entry.sums[g] += p.byGroup[g];
        weeks.set(w, entry);
      }
      const groupTrend = [...weeks.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([week, e]) => ({
          week,
          samples: e.n,
          purityPct: e.purity / e.n,
          byGroup: Object.fromEntries(
            CLASS_GROUPS.map((g) => [g, e.sums[g] / e.n]),
          ) as Record<ClassGroup, number>,
        }));

      // Grades.
      const gradeCounts = new Map<string, number>();
      for (const r of completed) {
        const g = r.result!.grade.grade ?? "No grade";
        gradeCounts.set(g, (gradeCounts.get(g) ?? 0) + 1);
      }

      // Sources, worst first by average purity.
      const bySource = new Map<string, { n: number; purity: number[] }>();
      for (const r of completed) {
        const key = r.source?.trim() || "Not recorded";
        const e = bySource.get(key) ?? { n: 0, purity: [] };
        e.n++;
        e.purity.push(pctOf(r).purityPct);
        bySource.set(key, e);
      }
      const sources = [...bySource.entries()]
        .map(([source, e]) => ({
          source,
          samples: e.n,
          meanPurityPct: mean(e.purity)!,
          minPurityPct: Math.min(...e.purity),
        }))
        .sort((a, b) => b.samples - a.samples)
        .slice(0, 15);

      // Operators: review decisions in the range, and samples they completed.
      const reviews = await ctx.db
        .select({
          userId: kernels.reviewedBy,
          aiClass: kernels.aiClass,
          finalClass: kernels.finalClass,
          status: kernels.reviewStatus,
        })
        .from(kernels)
        .innerJoin(samples, eq(samples.id, kernels.sampleId))
        .where(
          and(
            eq(kernels.orgId, me.orgId),
            isNotNull(kernels.reviewedBy),
            gte(kernels.reviewedAt, from),
            ...(q.crop ? [eq(samples.crop, q.crop)] : []),
          ),
        );
      const opStats = new Map<
        string,
        { confirmed: number; corrected: number; completed: number }
      >();
      const op = (id: string) => {
        const e = opStats.get(id) ?? {
          confirmed: 0,
          corrected: 0,
          completed: 0,
        };
        opStats.set(id, e);
        return e;
      };
      for (const r of reviews) {
        if (!r.userId) continue;
        if (r.status === "confirmed") op(r.userId).confirmed++;
        else if (r.status === "corrected") op(r.userId).corrected++;
      }
      for (const r of completed)
        if (r.completedBy) op(r.completedBy).completed++;
      const names = opStats.size
        ? await ctx.db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(inArray(users.id, [...opStats.keys()]))
        : [];
      const operators = [...opStats.entries()]
        .map(([id, e]) => ({
          userId: id,
          name: names.find((n) => n.id === id)?.name ?? "Former user",
          samplesCompleted: e.completed,
          kernelsReviewed: e.confirmed + e.corrected,
          corrected: e.corrected,
          correctionRate:
            e.confirmed + e.corrected
              ? e.corrected / (e.confirmed + e.corrected)
              : null,
        }))
        .sort((a, b) => b.kernelsReviewed - a.kernelsReviewed);

      // Claude against the operators' decisions, per class Claude chose.
      const byAiClass = new Map<
        string,
        { n: number; confirmed: number; becameWhat: Map<string, number> }
      >();
      for (const r of reviews) {
        if (!r.aiClass) continue;
        const e = byAiClass.get(r.aiClass) ?? {
          n: 0,
          confirmed: 0,
          becameWhat: new Map(),
        };
        e.n++;
        if (r.status === "confirmed") e.confirmed++;
        else if (r.finalClass)
          e.becameWhat.set(
            r.finalClass,
            (e.becameWhat.get(r.finalClass) ?? 0) + 1,
          );
        byAiClass.set(r.aiClass, e);
      }
      const claudeByClass = [...byAiClass.entries()]
        .map(([cls, e]) => {
          const [mostOften] = [...e.becameWhat.entries()].sort(
            (a, b) => b[1] - a[1],
          );
          return {
            cls,
            reviewed: e.n,
            confirmedRate: e.confirmed / e.n,
            mostOftenCorrectedTo: mostOften
              ? { cls: mostOften[0], count: mostOften[1] }
              : null,
          };
        })
        .sort((a, b) => b.reviewed - a.reviewed);
      const totalReviewed = reviews.filter(
        (r) => r.status !== "pending",
      ).length;
      const totalConfirmed = reviews.filter(
        (r) => r.status === "confirmed",
      ).length;

      // Photo estimate against the scale, on weighed samples that were photographed.
      const weighed = completed
        .filter((r) => r.result!.source !== "estimate")
        .slice(0, 200);
      const diffs: number[] = [];
      const groupBias: Record<ClassGroup, number[]> = Object.fromEntries(
        CLASS_GROUPS.map((g) => [g, []]),
      ) as unknown as Record<ClassGroup, number[]>;
      for (const r of weighed) {
        const classes = classesOf.get(r.crop) ?? [];
        const e = await estimateFor(ctx, r.id, classes);
        if (e.counted === 0) continue;
        const w = pctOf(r);
        diffs.push(Math.abs(e.totalDefectsPct - w.totalDefectsPct));
        for (const g of CLASS_GROUPS)
          groupBias[g].push(e.byGroup[g] - w.byGroup[g]);
      }

      // Claude usage and an estimated cost at list prices.
      const usage = await ctx.db
        .select({
          model: analysisRuns.model,
          requests: sql<number>`coalesce(sum(${analysisRuns.requests}), 0)::int`,
          inputTokens: sql<number>`coalesce(sum(${analysisRuns.inputTokens}), 0)::bigint`,
          outputTokens: sql<number>`coalesce(sum(${analysisRuns.outputTokens}), 0)::bigint`,
          cacheReadTokens: sql<number>`coalesce(sum(${analysisRuns.cacheReadTokens}), 0)::bigint`,
          cacheWriteTokens: sql<number>`coalesce(sum(${analysisRuns.cacheWriteTokens}), 0)::bigint`,
        })
        .from(analysisRuns)
        .innerJoin(samples, eq(samples.id, analysisRuns.sampleId))
        .where(
          and(
            eq(analysisRuns.orgId, me.orgId),
            gte(analysisRuns.createdAt, from),
            ...(q.crop ? [eq(samples.crop, q.crop)] : []),
          ),
        )
        .groupBy(analysisRuns.model);
      const claude = usage.map((u) => {
        const price = PRICES[u.model as ClaudeModel];
        const n = (v: number | string) => Number(v);
        const cost = price
          ? (n(u.inputTokens) * price.input +
              n(u.outputTokens) * price.output +
              n(u.cacheReadTokens) * price.cacheRead +
              n(u.cacheWriteTokens) * price.input * CACHE_WRITE_FACTOR) /
            1e6
          : null;
        return {
          model: u.model,
          requests: u.requests,
          inputTokens: n(u.inputTokens),
          outputTokens: n(u.outputTokens),
          cacheReadTokens: n(u.cacheReadTokens),
          cacheWriteTokens: n(u.cacheWriteTokens),
          estimatedCostUsd: cost,
        };
      });
      const costTotal = claude.reduce(
        (s, c) => s + (c.estimatedCostUsd ?? 0),
        0,
      );

      // Autopilot: how much the AI settled alone, and how often people agreed
      // with it when they checked a random sample of those verdicts.
      const ids = rows.map((r) => r.id);
      const [ai] = ids.length
        ? await ctx.db
            .select({
              classified: sql<number>`count(${kernels.aiClass})::int`,
              acceptedByAi: sql<number>`count(*) filter (where ${kernels.aiClass} is not null and ${kernels.flagReason} is null)::int`,
              spotChecked: sql<number>`count(*) filter (where ${kernels.flagReason} = 'spot_check' and ${kernels.reviewStatus} <> 'pending')::int`,
              spotAgreed: sql<number>`count(*) filter (where ${kernels.flagReason} = 'spot_check' and ${kernels.reviewStatus} = 'confirmed')::int`,
            })
            .from(kernels)
            .where(inArray(kernels.sampleId, ids))
        : [];

      const turnaround = completed.map(
        (r) => (r.completedAt!.getTime() - r.createdAt.getTime()) / 60000,
      );
      return {
        range: { days: q.days, from: from.toISOString(), crop: q.crop ?? null },
        totals: {
          samples: rows.length,
          completed: completed.length,
          inProgress: rows.length - completed.length,
          meanPurityPct: mean(completed.map((r) => pctOf(r).purityPct)),
          medianTurnaroundMinutes: median(turnaround),
          kernelsReviewed: totalReviewed,
          claudeConfirmedRate: totalReviewed
            ? totalConfirmed / totalReviewed
            : null,
          estimatedClaudeCostUsd: costTotal,
          costPerCompletedSampleUsd: completed.length
            ? costTotal / completed.length
            : null,
          aiHandledRate: ai?.classified
            ? ai.acceptedByAi / ai.classified
            : null,
          spotChecked: ai?.spotChecked ?? 0,
          spotCheckAgreement: ai?.spotChecked
            ? ai.spotAgreed / ai.spotChecked
            : null,
          completedByAutopilot: completed.filter((r) => !r.completedBy).length,
        },
        perDay: [...perDay.entries()].map(([date, v]) => ({ date, ...v })),
        groupTrend,
        grades: [...gradeCounts.entries()]
          .map(([grade, count]) => ({ grade, count }))
          .sort((a, b) => a.grade.localeCompare(b.grade)),
        sources,
        operators,
        claudeByClass,
        estimateVsWeighed: {
          samples: diffs.length,
          meanAbsDiffTotalPct: mean(diffs),
          meanBiasByGroup: Object.fromEntries(
            CLASS_GROUPS.map((g) => [g, mean(groupBias[g])]),
          ) as Record<ClassGroup, number | null>,
        },
        claude,
      };
    });
  };
}

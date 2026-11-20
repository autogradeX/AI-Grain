import { and, count, eq, gte, isNotNull, max, notInArray } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import {
  batches,
  organizations,
  samples,
  standards,
  supportReports,
} from "../../db/schema.js";
import { outboxStatus } from "../integration/outbox.js";
import { PriceRulesSchema, GradeSpecSchema } from "../standards/routes.js";

/*
 * A station and its central server, beyond results: the central server
 * shares standards (and their prices) that every station then uses, and
 * each station says how it is doing (a heartbeat) so the network's admin
 * sees which stations work, which wait for internet and which need help.
 * Both run from the sweeper, at most every half hour; a failed connection
 * just waits for the next round. Nothing is kept in memory.
 */

const SYNC_EVERY_MS = 30 * 60_000;

export const SharedStandard = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  crop: z.string().min(1).max(60),
  description: z.string().max(2000).nullable(),
  grades: z.array(GradeSpecSchema).min(1).max(20),
  definitions: z.record(z.string(), z.string().max(1000)),
  allowEstimate: z.boolean(),
  pricing: PriceRulesSchema.nullable(),
  updatedAt: z.string(),
});

const SharedList = z.object({ items: z.array(SharedStandard).max(200) });

/** What a station reports about itself. */
export const Heartbeat = z.object({
  station: z.string().max(200),
  samplesToday: z.number().int().min(0),
  completed7d: z.number().int().min(0),
  lastSampleAt: z.string().nullable(),
  photosWaitingForInternet: z.number().int().min(0),
  photosFailed7d: z.number().int().min(0),
  outboxWaiting: z.number().int().min(0),
  oldestWaiting: z.string().nullable(),
  helpReports7d: z.number().int().min(0),
  localModelMode: z.string().max(20),
  simpleMode: z.boolean(),
  imageModel: z.boolean(),
});
export type HeartbeatBody = z.infer<typeof Heartbeat>;

/** The station's own figures, for its heartbeat. */
export async function heartbeatOf(
  ctx: AppContext,
  orgId: string,
): Promise<HeartbeatBody> {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [org] = await ctx.db
    .select({
      name: organizations.name,
      localModel: organizations.localModel,
      simpleMode: organizations.simpleMode,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  const [today] = await ctx.db
    .select({ n: count() })
    .from(samples)
    .where(and(eq(samples.orgId, orgId), gte(samples.createdAt, dayStart)));
  const [week] = await ctx.db
    .select({ n: count(), last: max(samples.completedAt) })
    .from(samples)
    .where(
      and(
        eq(samples.orgId, orgId),
        eq(samples.status, "completed"),
        gte(samples.completedAt, weekAgo),
      ),
    );
  const [last] = await ctx.db
    .select({ at: max(samples.createdAt) })
    .from(samples)
    .where(eq(samples.orgId, orgId));
  const [waiting] = await ctx.db
    .select({ n: count() })
    .from(batches)
    .where(and(eq(batches.orgId, orgId), eq(batches.status, "waiting")));
  const [failed] = await ctx.db
    .select({ n: count() })
    .from(batches)
    .where(
      and(
        eq(batches.orgId, orgId),
        eq(batches.status, "failed"),
        gte(batches.createdAt, weekAgo),
      ),
    );
  const [help] = await ctx.db
    .select({ n: count() })
    .from(supportReports)
    .where(
      and(
        eq(supportReports.orgId, orgId),
        gte(supportReports.createdAt, weekAgo),
      ),
    );
  const outbox = await outboxStatus(ctx, orgId);
  return {
    station: org?.name ?? "",
    samplesToday: today?.n ?? 0,
    completed7d: week?.n ?? 0,
    lastSampleAt: last?.at ? new Date(last.at).toISOString() : null,
    photosWaitingForInternet: waiting?.n ?? 0,
    photosFailed7d: failed?.n ?? 0,
    outboxWaiting: outbox.waiting,
    oldestWaiting: outbox.oldestWaiting
      ? new Date(outbox.oldestWaiting).toISOString()
      : null,
    helpReports7d: help?.n ?? 0,
    localModelMode: org?.localModel.mode ?? "offline",
    simpleMode: Boolean(org?.simpleMode.crops?.length),
    imageModel: Boolean(ctx.embedder),
  };
}

/** Copies the central server's shared standards; ones it no longer shares are archived. */
export async function applySharedStandards(
  ctx: AppContext,
  orgId: string,
  items: z.infer<typeof SharedStandard>[],
): Promise<number> {
  let changed = 0;
  await ctx.db.transaction(async (tx) => {
    for (const s of items) {
      const values = {
        name: s.name,
        crop: s.crop,
        description: s.description,
        grades: s.grades,
        definitions: s.definitions,
        allowEstimate: s.allowEstimate,
        pricing: s.pricing,
        archived: false,
      };
      const [have] = await tx
        .select({
          id: standards.id,
          networkUpdatedAt: standards.networkUpdatedAt,
        })
        .from(standards)
        .where(and(eq(standards.orgId, orgId), eq(standards.networkId, s.id)));
      if (have) {
        if (
          have.networkUpdatedAt?.toISOString() ===
          new Date(s.updatedAt).toISOString()
        )
          continue;
        await tx
          .update(standards)
          .set({
            ...values,
            networkUpdatedAt: new Date(s.updatedAt),
            updatedAt: new Date(),
          })
          .where(eq(standards.id, have.id));
      } else {
        await tx.insert(standards).values({
          ...values,
          orgId,
          networkId: s.id,
          networkUpdatedAt: new Date(s.updatedAt),
        });
      }
      changed++;
    }
    const kept = items.map((s) => s.id);
    const gone = await tx
      .update(standards)
      .set({ archived: true, updatedAt: new Date() })
      .where(
        and(
          eq(standards.orgId, orgId),
          isNotNull(standards.networkId),
          eq(standards.archived, false),
          ...(kept.length ? [notInArray(standards.networkId, kept)] : []),
        ),
      )
      .returning({ id: standards.id });
    changed += gone.length;
  });
  return changed;
}

/**
 * Station: sends its heartbeat to the central server and takes the
 * standards it shares. Returns how many standards changed.
 */
export async function syncWithCentral(
  ctx: AppContext,
  options: { orgId?: string; force?: boolean } = {},
): Promise<number> {
  const orgs = await ctx.db
    .select({ id: organizations.id, integration: organizations.integration })
    .from(organizations)
    .where(options.orgId ? eq(organizations.id, options.orgId) : undefined);
  let changed = 0;
  for (const org of orgs) {
    const { centralUrl, centralKey, centralSyncedAt } = org.integration;
    if (!centralUrl || !centralKey) continue;
    if (
      !options.force &&
      centralSyncedAt &&
      Date.now() - Date.parse(centralSyncedAt) < SYNC_EVERY_MS
    )
      continue;
    const base = `${centralUrl.replace(/\/+$/, "")}/api/v1`;
    const call = async (path: string, body?: unknown) => {
      const res = await (ctx.fetch ?? fetch)(`${base}${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          authorization: `Bearer ${centralKey}`,
          "user-agent": "AI-Grain/1",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };
    try {
      await call("/stations/heartbeat", await heartbeatOf(ctx, org.id));
      const list = SharedList.parse(await call("/standards"));
      changed += await applySharedStandards(ctx, org.id, list.items);
      // Read again: settings may have changed meanwhile.
      const [now] = await ctx.db
        .select({ integration: organizations.integration })
        .from(organizations)
        .where(eq(organizations.id, org.id));
      await ctx.db
        .update(organizations)
        .set({
          integration: {
            ...now?.integration,
            centralSyncedAt: new Date().toISOString(),
          },
        })
        .where(eq(organizations.id, org.id));
    } catch {
      // No connection, or the central server can't answer yet: next round.
    }
  }
  return changed;
}

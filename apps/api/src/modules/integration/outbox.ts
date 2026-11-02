import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import type { AppContext } from "../../context.js";
import {
  organizations,
  outbox,
  type IntegrationSettings,
} from "../../db/schema.js";
import { signBody } from "./service.js";

/*
 * The outbox: results waiting to be sent to connected systems. A row is
 * written in the same moment the result exists and kept until the receiver
 * accepts it, so a station without internet loses nothing: everything goes
 * out, in order, when the connection is back.
 */

type Target = "webhook" | "central";

/** After a failed try: 1, 2, 4 … minutes, at most an hour. */
export function outboxDelayMs(attempts: number): number {
  return Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, attempts - 1));
}

async function settingsOf(ctx: AppContext, orgId: string) {
  const [org] = await ctx.db
    .select({ integration: organizations.integration })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  return org?.integration ?? {};
}

const targetsOf = (s: IntegrationSettings): Target[] => [
  ...(s.webhookUrl && s.webhookSecret ? (["webhook"] as const) : []),
  ...(s.centralUrl && s.centralKey ? (["central"] as const) : []),
];

/**
 * Queues an event for every connected system the organisation has set up,
 * with the payload each one gets, and tries to send it straight away.
 */
export async function enqueue(
  ctx: AppContext,
  orgId: string,
  event: string,
  payloads: Partial<Record<Target, Record<string, unknown>>>,
): Promise<number> {
  const targets = targetsOf(await settingsOf(ctx, orgId)).filter(
    (t) => payloads[t],
  );
  if (!targets.length) return 0;
  await ctx.db.insert(outbox).values(
    targets.map((target) => ({
      orgId,
      target,
      event,
      payload: payloads[target]!,
    })),
  );
  ctx.jobs.run(`outbox ${orgId}`, () =>
    deliverDue(ctx, { orgId }).then(() => undefined),
  );
  return targets.length;
}

/** Sends one row once. Returns null on success, else why not (and whether the network failed). */
async function sendOnce(
  ctx: AppContext,
  row: typeof outbox.$inferSelect,
  settings: IntegrationSettings,
): Promise<{ error: string; network: boolean } | null> {
  const body = JSON.stringify({
    id: row.id,
    event: row.event,
    createdAt: row.createdAt.toISOString(),
    data: row.payload,
  });
  let url: string;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "AI-Grain/1",
    "x-aigrain-event": row.event,
    "x-aigrain-delivery": row.id,
  };
  if (row.target === "webhook") {
    if (!settings.webhookUrl || !settings.webhookSecret)
      return { error: "The webhook is no longer set up", network: false };
    url = settings.webhookUrl;
    headers["x-aigrain-signature"] = signBody(settings.webhookSecret, body);
  } else {
    if (!settings.centralUrl || !settings.centralKey)
      return {
        error: "The central server is no longer set up",
        network: false,
      };
    url = `${settings.centralUrl.replace(/\/+$/, "")}/api/v1/ingest`;
    headers.authorization = `Bearer ${settings.centralKey}`;
  }
  try {
    const res = await (ctx.fetch ?? fetch)(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return null;
    let detail = "";
    try {
      detail = ((await res.text()) || "").slice(0, 200);
    } catch {
      // No body.
    }
    return {
      error: `HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
      network: false,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
      network: true,
    };
  }
}

/**
 * Sends what is due, oldest first. Each row is taken with a short lease, so
 * two instances never send the same row at once. Stops at the first network
 * failure: the connection is down, the rest waits. Returns how many went out.
 */
export async function deliverDue(
  ctx: AppContext,
  options: { orgId?: string; limit?: number } = {},
): Promise<number> {
  const now = new Date();
  const due = await ctx.db
    .select()
    .from(outbox)
    .where(
      and(
        isNull(outbox.deliveredAt),
        lte(outbox.nextAttemptAt, now),
        ...(options.orgId ? [eq(outbox.orgId, options.orgId)] : []),
      ),
    )
    .orderBy(asc(outbox.createdAt))
    .limit(options.limit ?? 50);
  const settings = new Map<string, IntegrationSettings>();
  let delivered = 0;
  for (const row of due) {
    const [leased] = await ctx.db
      .update(outbox)
      .set({ nextAttemptAt: new Date(Date.now() + 2 * 60_000) })
      .where(
        and(
          eq(outbox.id, row.id),
          isNull(outbox.deliveredAt),
          lte(outbox.nextAttemptAt, now),
        ),
      )
      .returning({ id: outbox.id });
    if (!leased) continue;
    if (!settings.has(row.orgId))
      settings.set(row.orgId, await settingsOf(ctx, row.orgId));
    const failure = await sendOnce(ctx, row, settings.get(row.orgId)!);
    const attempts = row.attempts + 1;
    if (!failure) {
      await ctx.db
        .update(outbox)
        .set({ deliveredAt: new Date(), attempts, lastError: null })
        .where(eq(outbox.id, row.id));
      delivered++;
      continue;
    }
    await ctx.db
      .update(outbox)
      .set({
        attempts,
        lastError: failure.error.slice(0, 500),
        nextAttemptAt: new Date(Date.now() + outboxDelayMs(attempts)),
      })
      .where(eq(outbox.id, row.id));
    if (failure.network) break;
  }
  return delivered;
}

/** Everything waiting for this organisation becomes due now (the "Send now" button). */
export async function sendNow(ctx: AppContext, orgId: string) {
  await ctx.db
    .update(outbox)
    .set({ nextAttemptAt: new Date() })
    .where(and(eq(outbox.orgId, orgId), isNull(outbox.deliveredAt)));
  return deliverDue(ctx, { orgId });
}

/** What the Integrations page shows: waiting, failing, recently sent. */
export async function outboxStatus(ctx: AppContext, orgId: string) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000);
  const [counts] = await ctx.db
    .select({
      waiting: sql<number>`count(*) filter (where ${outbox.deliveredAt} is null)::int`,
      failing: sql<number>`count(*) filter (where ${outbox.deliveredAt} is null and ${outbox.attempts} > 0)::int`,
      oldestWaiting: sql<
        string | null
      >`min(${outbox.createdAt}) filter (where ${outbox.deliveredAt} is null)`,
    })
    .from(outbox)
    .where(eq(outbox.orgId, orgId));
  const [sent] = await ctx.db
    .select({
      count: sql<number>`count(*)::int`,
      last: sql<string | null>`max(${outbox.deliveredAt})`,
    })
    .from(outbox)
    .where(
      and(
        eq(outbox.orgId, orgId),
        isNotNull(outbox.deliveredAt),
        gte(outbox.deliveredAt, dayAgo),
      ),
    );
  const recent = await ctx.db
    .select({
      id: outbox.id,
      target: outbox.target,
      event: outbox.event,
      attempts: outbox.attempts,
      lastError: outbox.lastError,
      nextAttemptAt: outbox.nextAttemptAt,
      deliveredAt: outbox.deliveredAt,
      createdAt: outbox.createdAt,
      sampleNumber: sql<
        number | null
      >`coalesce(${outbox.payload} ->> 'sampleNumber', ${outbox.payload} -> 'result' ->> 'sampleNumber')::int`,
    })
    .from(outbox)
    .where(eq(outbox.orgId, orgId))
    .orderBy(desc(outbox.createdAt))
    .limit(20);
  return {
    waiting: counts?.waiting ?? 0,
    failing: counts?.failing ?? 0,
    oldestWaiting: counts?.oldestWaiting ?? null,
    sentLastDay: sent?.count ?? 0,
    lastSentAt: sent?.last ?? null,
    recent,
  };
}

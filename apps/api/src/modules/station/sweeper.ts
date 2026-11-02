import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import type { AppContext } from "../../context.js";
import { batches } from "../../db/schema.js";
import { classifyAndTriage } from "../autopilot/service.js";
import { deliverDue } from "../integration/outbox.js";

/**
 * Photos waiting for Model Orchestration (no internet) whose retry time has
 * come: classified again, one at a time. Stops at the first one that has to
 * wait again: the connection is still down. Returns how many went through.
 */
export async function resumeWaiting(ctx: AppContext, limit = 10) {
  const due = await ctx.db
    .select({ id: batches.id })
    .from(batches)
    .where(
      and(
        eq(batches.status, "waiting"),
        or(isNull(batches.retryAt), lte(batches.retryAt, new Date())),
      ),
    )
    .orderBy(asc(batches.retryAt))
    .limit(limit);
  let resumed = 0;
  for (const { id } of due) {
    // Another instance may take it at the same moment: only one wins.
    const [claimed] = await ctx.db
      .update(batches)
      .set({ status: "classifying" })
      .where(and(eq(batches.id, id), eq(batches.status, "waiting")))
      .returning({ id: batches.id });
    if (!claimed) continue;
    await classifyAndTriage(ctx, id);
    const [after] = await ctx.db
      .select({ status: batches.status })
      .from(batches)
      .where(eq(batches.id, id));
    if (after?.status === "waiting") break;
    resumed++;
  }
  return resumed;
}

/** One round of background work that waits on the internet. */
export async function sweep(ctx: AppContext) {
  const resumed = await resumeWaiting(ctx);
  const delivered = await deliverDue(ctx);
  return { resumed, delivered };
}

/**
 * Runs `sweep` now and then every `everyMs`, one round at a time. State is
 * all in the database (retry times, the outbox), so a restart or a second
 * instance just carries on.
 */
export function startSweeper(
  ctx: AppContext,
  log: { error: (obj: unknown, msg: string) => void },
  everyMs = 60_000,
) {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    sweep(ctx)
      .catch((err: unknown) => log.error({ err }, "Background sweep failed"))
      .finally(() => {
        running = false;
      });
  };
  setTimeout(tick, 5_000).unref();
  const timer = setInterval(tick, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}

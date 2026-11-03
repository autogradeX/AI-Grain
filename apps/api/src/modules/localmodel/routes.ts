import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { organizations } from "../../db/schema.js";
import { audit } from "../../lib/audit.js";
import { badRequest, conflict } from "../../lib/errors.js";
import { authenticate, authOf, requireRole } from "../auth/guard.js";
import { normalizeCropKey } from "../crops/service.js";
import {
  dataset,
  localModelStatus,
  MIN_PER_CLASS,
  MIN_TOTAL,
  NotEnoughDataError,
  trainLocalModel,
} from "./service.js";

/** Training cut off (a restart) is forgotten after this long. */
const TRAINING_STALE_MS = 30 * 60_000;

/** Marks a crop's training as started, or as ended (with why it failed, if it did). */
async function setTraining(
  ctx: AppContext,
  orgId: string,
  crop: string,
  on: boolean,
  error?: string,
) {
  const [org] = await ctx.db
    .select({ localModel: organizations.localModel })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  const training = { ...org?.localModel.training };
  const trainingError = { ...org?.localModel.trainingError };
  if (on) {
    training[crop] = new Date().toISOString();
    delete trainingError[crop];
  } else {
    delete training[crop];
    if (error)
      trainingError[crop] = {
        at: new Date().toISOString(),
        message: error.slice(0, 500),
      };
  }
  await ctx.db
    .update(organizations)
    .set({ localModel: { ...org?.localModel, training, trainingError } })
    .where(eq(organizations.id, orgId));
}

/** The organisation's local model (offline classification): status, training, mode. */
export function localModelRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.addHook("preHandler", authenticate(ctx));
    const admin = { preHandler: requireRole("admin") };

    app.get("/local-model", async (request) => {
      const me = authOf(request);
      const { crop } = z
        .object({ crop: z.string().min(1).max(60).transform(normalizeCropKey) })
        .parse(request.query);
      const status = await localModelStatus(ctx, me.orgId, crop);
      const [org] = await ctx.db
        .select({ localModel: organizations.localModel })
        .from(organizations)
        .where(eq(organizations.id, me.orgId));
      const started = org?.localModel.training?.[crop];
      const training =
        started && Date.now() - Date.parse(started) < TRAINING_STALE_MS
          ? started
          : null;
      return {
        ...status,
        training,
        lastError: org?.localModel.trainingError?.[crop] ?? null,
      };
    });

    /** Trains a new version in the background; the page polls GET until it appears. */
    app.post("/local-model/train", admin, async (request, reply) => {
      const me = authOf(request);
      const { crop } = z
        .object({ crop: z.string().min(1).max(60).transform(normalizeCropKey) })
        .parse(request.body);
      const [org] = await ctx.db
        .select({ localModel: organizations.localModel })
        .from(organizations)
        .where(eq(organizations.id, me.orgId));
      const started = org?.localModel.training?.[crop];
      if (started && Date.now() - Date.parse(started) < TRAINING_STALE_MS)
        throw conflict("A model for this crop is already being trained");
      // Refuse straight away when there isn't enough to learn from.
      const { counts } = await dataset(ctx, me.orgId, crop);
      const total = Object.values(counts).reduce(
        (n, c) => n + c.reviewed + c.settled,
        0,
      );
      const classes = Object.values(counts).filter(
        (c) => c.reviewed + c.settled >= MIN_PER_CLASS,
      ).length;
      if (total < MIN_TOTAL || classes < 2)
        throw badRequest(
          `Not enough checked kernels yet: ${total} of at least ${MIN_TOTAL}, in at least 2 classes with ${MIN_PER_CLASS} or more each.`,
        );
      await setTraining(ctx, me.orgId, crop, true);
      ctx.jobs.run(`train ${crop}`, async () => {
        let failure: string | undefined;
        try {
          const model = await trainLocalModel(ctx, me.orgId, crop, me.id);
          await audit(ctx.db, {
            orgId: me.orgId,
            userId: me.id,
            action: "local_model.trained",
            detail: {
              crop,
              version: model.version,
              accuracy: model.metrics.accuracy,
            },
          });
        } catch (err) {
          failure =
            err instanceof NotEnoughDataError
              ? err.message
              : `Training failed: ${err instanceof Error ? err.message : String(err)}`;
          if (!(err instanceof NotEnoughDataError)) throw err;
        } finally {
          await setTraining(ctx, me.orgId, crop, false, failure);
        }
      });
      reply.code(202);
      return { training: true };
    });

    app.put("/local-model/settings", admin, async (request) => {
      const me = authOf(request);
      const { mode } = z
        .object({ mode: z.enum(["offline", "always", "off"]) })
        .parse(request.body);
      const [org] = await ctx.db
        .select({ localModel: organizations.localModel })
        .from(organizations)
        .where(eq(organizations.id, me.orgId));
      await ctx.db
        .update(organizations)
        .set({ localModel: { ...org?.localModel, mode } })
        .where(eq(organizations.id, me.orgId));
      await audit(ctx.db, {
        orgId: me.orgId,
        userId: me.id,
        action: "local_model.settings",
        detail: { mode },
      });
      return { mode };
    });
  };
}

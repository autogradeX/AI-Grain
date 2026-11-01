import { and, asc, desc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { apiKeys, organizations, samples } from "../../db/schema.js";
import { audit } from "../../lib/audit.js";
import { badRequest, notFound, unauthorized } from "../../lib/errors.js";
import { authenticate, authOf, requireRole } from "../auth/guard.js";
import { loadSample } from "../samples/service.js";
import {
  assayingResult,
  newApiKey,
  newWebhookSecret,
  orgForKey,
  RESULT_SCHEMA,
  sendWebhook,
} from "./service.js";

/** Settings for connected systems: API keys and the webhook (admins). */
export function integrationRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.addHook("preHandler", authenticate(ctx));
    const admin = { preHandler: requireRole("admin") };

    /** A sample's result in the format connected systems receive (any signed-in user). */
    app.get("/samples/:id/result.json", async (request, reply) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const sample = await loadSample(ctx, me.orgId, id);
      reply.header(
        "content-disposition",
        `attachment; filename="sample-${sample.number}-result.json"`,
      );
      return assayingResult(ctx, sample);
    });

    app.get("/integration", admin, async (request) => {
      const me = authOf(request);
      const [org] = await ctx.db
        .select({ integration: organizations.integration })
        .from(organizations)
        .where(eq(organizations.id, me.orgId));
      const keys = await ctx.db
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          prefix: apiKeys.prefix,
          createdAt: apiKeys.createdAt,
          lastUsedAt: apiKeys.lastUsedAt,
        })
        .from(apiKeys)
        .where(and(eq(apiKeys.orgId, me.orgId), isNull(apiKeys.revokedAt)))
        .orderBy(desc(apiKeys.createdAt));
      return {
        keys,
        webhookUrl: org?.integration.webhookUrl ?? null,
        webhookSecret: org?.integration.webhookSecret ?? null,
        schema: RESULT_SCHEMA,
      };
    });

    /** Creates an API key. The key is in this response only. */
    app.post("/integration/keys", admin, async (request, reply) => {
      const me = authOf(request);
      const { name } = z
        .object({ name: z.string().trim().min(1).max(80) })
        .parse(request.body);
      const k = newApiKey();
      const [row] = await ctx.db
        .insert(apiKeys)
        .values({
          orgId: me.orgId,
          name,
          prefix: k.prefix,
          keyHash: k.keyHash,
          createdBy: me.id,
        })
        .returning({
          id: apiKeys.id,
          name: apiKeys.name,
          prefix: apiKeys.prefix,
        });
      await audit(ctx.db, {
        orgId: me.orgId,
        userId: me.id,
        action: "integration.key_created",
        detail: { name, prefix: k.prefix },
      });
      reply.code(201);
      return { ...row, key: k.key };
    });

    app.delete("/integration/keys/:id", admin, async (request) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const [row] = await ctx.db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(apiKeys.id, id),
            eq(apiKeys.orgId, me.orgId),
            isNull(apiKeys.revokedAt),
          ),
        )
        .returning({ prefix: apiKeys.prefix });
      if (!row) throw notFound("API key");
      await audit(ctx.db, {
        orgId: me.orgId,
        userId: me.id,
        action: "integration.key_revoked",
        detail: { prefix: row.prefix },
      });
      return { ok: true };
    });

    /** Sets or clears the webhook URL; a signing secret is made the first time. */
    app.put("/integration/webhook", admin, async (request) => {
      const me = authOf(request);
      const { url, rotateSecret } = z
        .object({
          url: z
            .url({ protocol: /^https?$/ })
            .max(500)
            .nullable(),
          rotateSecret: z.boolean().default(false),
        })
        .parse(request.body);
      if (
        url &&
        ctx.config.NODE_ENV === "production" &&
        !url.startsWith("https://")
      )
        throw badRequest("The webhook URL must use https");
      const [org] = await ctx.db
        .select({ integration: organizations.integration })
        .from(organizations)
        .where(eq(organizations.id, me.orgId));
      const secret =
        url && (rotateSecret || !org?.integration.webhookSecret)
          ? newWebhookSecret()
          : org?.integration.webhookSecret;
      await ctx.db
        .update(organizations)
        .set({
          integration: url ? { webhookUrl: url, webhookSecret: secret! } : {},
        })
        .where(eq(organizations.id, me.orgId));
      await audit(ctx.db, {
        orgId: me.orgId,
        userId: me.id,
        action: "integration.webhook_updated",
        detail: { url, rotated: rotateSecret },
      });
      return { webhookUrl: url, webhookSecret: url ? secret : null };
    });

    /** Sends a test event, so the receiving side can be checked. */
    app.post("/integration/webhook/test", admin, async (request) => {
      const me = authOf(request);
      return sendWebhook(ctx, me.orgId, "test", {
        message: "Test event from AI-Grain",
        schema: RESULT_SCHEMA,
      });
    });
  };
}

/** The organisation of the API key on the request, or 401. */
async function keyOrg(ctx: AppContext, request: FastifyRequest) {
  const header = request.headers.authorization;
  const key = header?.startsWith("Bearer ")
    ? header.slice(7).trim()
    : String(request.headers["x-api-key"] ?? "");
  const orgId = key ? await orgForKey(ctx, key) : null;
  if (!orgId) throw unauthorized("A valid API key is required", "api_key");
  return orgId;
}

/**
 * Read-only API for connected systems (APMC, eNAM bridge, ERP), with an API
 * key instead of a user session. Results only: completed samples.
 */
export function machineRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    /** Completed results, oldest first, after `since` (exclusive): poll with the last `assayedAt`. */
    app.get("/results", async (request) => {
      const orgId = await keyOrg(ctx, request);
      const q = z
        .object({
          since: z.iso.datetime({ offset: true }).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          crop: z.string().optional(),
        })
        .parse(request.query);
      const rows = await ctx.db
        .select()
        .from(samples)
        .where(
          and(
            eq(samples.orgId, orgId),
            eq(samples.status, "completed"),
            isNotNull(samples.completedAt),
            ...(q.since ? [gt(samples.completedAt, new Date(q.since))] : []),
            ...(q.crop ? [eq(samples.crop, q.crop.toLowerCase())] : []),
          ),
        )
        .orderBy(asc(samples.completedAt))
        .limit(q.limit);
      const items = [];
      for (const s of rows) items.push(await assayingResult(ctx, s));
      return {
        schema: RESULT_SCHEMA,
        items,
        next:
          rows.length === q.limit
            ? rows.at(-1)!.completedAt!.toISOString()
            : null,
      };
    });

    /** One result, by sample number or id. */
    app.get("/results/:ref", async (request) => {
      const orgId = await keyOrg(ctx, request);
      const { ref } = z
        .object({ ref: z.string().min(1).max(64) })
        .parse(request.params);
      const asNumber = Number(ref);
      const [row] = await ctx.db
        .select()
        .from(samples)
        .where(
          and(
            eq(samples.orgId, orgId),
            Number.isInteger(asNumber)
              ? eq(samples.number, asNumber)
              : z.uuid().safeParse(ref).success
                ? eq(samples.id, ref)
                : eq(samples.number, -1),
          ),
        );
      if (!row) throw notFound("Sample");
      return assayingResult(ctx, row);
    });
  };
}

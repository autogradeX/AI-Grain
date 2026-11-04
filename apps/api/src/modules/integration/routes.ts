import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
} from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import {
  apiKeys,
  certificates,
  organizations,
  remoteCertificates,
  samples,
  type CertificatePayload,
  type IntegrationSettings,
} from "../../db/schema.js";
import { outboxStatus, sendNow } from "./outbox.js";
import { hashPayload } from "../certificates/service.js";
import { audit } from "../../lib/audit.js";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  unauthorized,
} from "../../lib/errors.js";
import {
  networkModels,
  receiveTrainingExamples,
  TrainingExamplesData,
} from "../localmodel/network.js";
import { authenticate, authOf, requireRole } from "../auth/guard.js";
import { loadSample } from "../samples/service.js";
import {
  assayingResult,
  newApiKey,
  newWebhookSecret,
  orgForKey,
  ENAM_SCHEMA,
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
          scope: apiKeys.scope,
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
        centralUrl: org?.integration.centralUrl ?? null,
        centralKeySet: Boolean(org?.integration.centralKey),
        enamUrl: org?.integration.enamUrl ?? null,
        enamHeaderName: org?.integration.enamHeaderName ?? null,
        enamHeaderValueSet: Boolean(org?.integration.enamHeaderValue),
        outbox: await outboxStatus(ctx, me.orgId),
        schema: RESULT_SCHEMA,
      };
    });

    /** Creates an API key. The key is in this response only. */
    app.post("/integration/keys", admin, async (request, reply) => {
      const me = authOf(request);
      const { name, scope } = z
        .object({
          name: z.string().trim().min(1).max(80),
          // "station": a mandi station sends its results here.
          scope: z.enum(["read", "station"]).default("read"),
        })
        .parse(request.body);
      const k = newApiKey();
      const [row] = await ctx.db
        .insert(apiKeys)
        .values({
          orgId: me.orgId,
          name,
          scope,
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
          integration: url
            ? { ...org?.integration, webhookUrl: url, webhookSecret: secret! }
            : withoutWebhook(org?.integration ?? {}),
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

    /**
     * A station's central server: where results and certificates go when
     * there is internet, and where report QR codes point. The key is kept
     * when only the URL changes; null clears both.
     */
    app.put("/integration/central", admin, async (request) => {
      const me = authOf(request);
      const { url, key } = z
        .object({
          url: z
            .url({ protocol: /^https?$/ })
            .max(300)
            .nullable(),
          key: z.string().trim().startsWith("agk_").max(100).optional(),
        })
        .parse(request.body);
      if (
        url &&
        ctx.config.NODE_ENV === "production" &&
        !url.startsWith("https://")
      )
        throw badRequest("The central server's address must use https");
      const [org] = await ctx.db
        .select({ integration: organizations.integration })
        .from(organizations)
        .where(eq(organizations.id, me.orgId));
      const current = org?.integration ?? {};
      const { centralUrl: _u, centralKey: _k, ...rest } = current;
      const centralKey = key ?? current.centralKey;
      if (url && !centralKey)
        throw badRequest("Enter the station key from the central server");
      await ctx.db
        .update(organizations)
        .set({
          integration: url
            ? {
                ...rest,
                centralUrl: url.replace(/\/+$/, ""),
                centralKey: centralKey!,
              }
            : rest,
        })
        .where(eq(organizations.id, me.orgId));
      await audit(ctx.db, {
        orgId: me.orgId,
        userId: me.id,
        action: "integration.central_updated",
        detail: { url },
      });
      return { centralUrl: url, centralKeySet: Boolean(url && centralKey) };
    });

    /** Checks the central server answers and accepts this station's key. */
    app.post("/integration/central/test", admin, async (request) => {
      const me = authOf(request);
      const [org] = await ctx.db
        .select({ integration: organizations.integration })
        .from(organizations)
        .where(eq(organizations.id, me.orgId));
      const { centralUrl, centralKey } = org?.integration ?? {};
      if (!centralUrl || !centralKey)
        return { ok: false, status: null, error: "No central server set up" };
      try {
        const res = await (ctx.fetch ?? fetch)(`${centralUrl}/api/v1/ingest`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${centralKey}`,
          },
          body: JSON.stringify({ id: "test", event: "test", data: {} }),
          signal: AbortSignal.timeout(10_000),
        });
        return { ok: res.ok, status: res.status };
      } catch (err) {
        return {
          ok: false,
          status: null,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    });

    /**
     * The e-NAM connection: where results of samples with an e-NAM lot ID go
     * (the state's e-NAM bridge or assaying API), and the header that
     * authenticates them. The value is kept when only the address or
     * header name changes, and is never returned; null clears it all.
     */
    app.put("/integration/enam", admin, async (request) => {
      const me = authOf(request);
      const body = z
        .object({
          url: z
            .url({ protocol: /^https?$/ })
            .max(300)
            .nullable(),
          headerName: z
            .string()
            .trim()
            .regex(/^[A-Za-z0-9-]{1,60}$/, "A header name: letters, digits, -")
            .optional(),
          headerValue: z.string().trim().min(1).max(500).optional(),
        })
        .parse(request.body);
      if (
        body.url &&
        ctx.config.NODE_ENV === "production" &&
        !body.url.startsWith("https://")
      )
        throw badRequest("The e-NAM address must use https");
      const [org] = await ctx.db
        .select({ integration: organizations.integration })
        .from(organizations)
        .where(eq(organizations.id, me.orgId));
      const current = org?.integration ?? {};
      const {
        enamUrl: _u,
        enamHeaderName: _n,
        enamHeaderValue: _v,
        ...rest
      } = current;
      const value = body.headerValue ?? current.enamHeaderValue;
      if (body.url && !value)
        throw badRequest("Enter the key or token e-NAM gave you");
      const headerName =
        body.headerName ?? current.enamHeaderName ?? "Authorization";
      await ctx.db
        .update(organizations)
        .set({
          integration: body.url
            ? {
                ...rest,
                enamUrl: body.url,
                enamHeaderName: headerName,
                enamHeaderValue: value!,
              }
            : rest,
        })
        .where(eq(organizations.id, me.orgId));
      await audit(ctx.db, {
        orgId: me.orgId,
        userId: me.id,
        action: "integration.enam_updated",
        detail: { url: body.url, headerName },
      });
      return {
        enamUrl: body.url,
        enamHeaderName: body.url ? headerName : null,
        enamHeaderValueSet: Boolean(body.url),
      };
    });

    /** Sends a test event to the e-NAM connection. */
    app.post("/integration/enam/test", admin, async (request) => {
      const me = authOf(request);
      const [org] = await ctx.db
        .select({ integration: organizations.integration })
        .from(organizations)
        .where(eq(organizations.id, me.orgId));
      const { enamUrl, enamHeaderName, enamHeaderValue } =
        org?.integration ?? {};
      if (!enamUrl || !enamHeaderValue)
        return { ok: false, status: null, error: "No e-NAM connection set up" };
      try {
        const res = await (ctx.fetch ?? fetch)(enamUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-aigrain-event": "test",
            [(enamHeaderName || "authorization").toLowerCase()]:
              enamHeaderValue,
          },
          body: JSON.stringify({
            id: "test",
            event: "test",
            data: { schema: ENAM_SCHEMA, message: "Test event from AI-Grain" },
          }),
          signal: AbortSignal.timeout(10_000),
        });
        return { ok: res.ok, status: res.status };
      } catch (err) {
        return {
          ok: false,
          status: null,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    });

    /** Sends everything waiting now, instead of at its next retry. */
    app.post("/integration/outbox/send", admin, async (request) => {
      const me = authOf(request);
      const sent = await sendNow(ctx, me.orgId);
      return { sent, outbox: await outboxStatus(ctx, me.orgId) };
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

function withoutWebhook(s: IntegrationSettings): IntegrationSettings {
  const { webhookUrl: _u, webhookSecret: _s, ...rest } = s;
  return rest;
}

/** The API key on the request (its organisation, scope and name), or 401. */
async function requestKey(ctx: AppContext, request: FastifyRequest) {
  const header = request.headers.authorization;
  const key = header?.startsWith("Bearer ")
    ? header.slice(7).trim()
    : String(request.headers["x-api-key"] ?? "");
  const found = key ? await orgForKey(ctx, key) : null;
  if (!found) throw unauthorized("A valid API key is required", "api_key");
  return found;
}

const keyOrg = async (ctx: AppContext, request: FastifyRequest) =>
  (await requestKey(ctx, request)).orgId;

const CertificateIn = z.object({
  code: z.string().min(4).max(40),
  version: z.number().int().min(1),
  payload: z.record(z.string(), z.unknown()),
  payloadHash: z.string().min(16).max(128),
  issuedAt: z.iso.datetime({ offset: true }),
});

const IngestBody = z.discriminatedUnion("event", [
  z.object({
    id: z.string().max(64),
    event: z.literal("sample.completed"),
    data: z.object({
      result: z.record(z.string(), z.unknown()),
      certificate: CertificateIn,
    }),
  }),
  z.object({
    id: z.string().max(64),
    event: z.literal("certificate.withdrawn"),
    data: z.object({
      sampleId: z.string().max(64),
      codes: z.array(z.string().max(40)).max(50),
      reason: z.string().max(500),
    }),
  }),
  z.object({
    id: z.string().max(64),
    event: z.literal("training.examples"),
    data: TrainingExamplesData,
  }),
  z.object({
    id: z.string().max(64),
    event: z.literal("test"),
    data: z.unknown(),
  }),
]);

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

    /**
     * A mandi station sends its results and certificates here (a key with the
     * station scope). Idempotent: a retried delivery changes nothing. Each
     * certificate's hash is checked against its contents before it is kept.
     */
    // Checked kernels for the network model carry their crop images.
    app.post("/ingest", { bodyLimit: 16 * 1024 * 1024 }, async (request) => {
      const key = await requestKey(ctx, request);
      if (key.scope !== "station")
        throw forbidden("This key can't send results: create a station key");
      const body = IngestBody.parse(request.body);
      if (body.event === "test") return { ok: true };
      if (body.event === "training.examples") {
        const kept = await receiveTrainingExamples(ctx, key, body.data);
        return { ok: true, kept };
      }
      if (body.event === "certificate.withdrawn") {
        if (body.data.codes.length)
          await ctx.db
            .update(remoteCertificates)
            .set({
              status: "withdrawn",
              withdrawnAt: new Date(),
              withdrawnReason: body.data.reason,
            })
            .where(
              and(
                eq(remoteCertificates.orgId, key.orgId),
                inArray(remoteCertificates.code, body.data.codes),
              ),
            );
        return { ok: true };
      }
      const { result, certificate } = body.data;
      const payload = certificate.payload as unknown as CertificatePayload;
      if (hashPayload(payload) !== certificate.payloadHash)
        throw badRequest("The certificate doesn't match its hash");
      const [existing] = await ctx.db
        .select({ orgId: remoteCertificates.orgId })
        .from(remoteCertificates)
        .where(eq(remoteCertificates.code, certificate.code));
      if (existing && existing.orgId !== key.orgId)
        throw conflict("That certificate code belongs to another organisation");
      const [local] = await ctx.db
        .select({ id: certificates.id })
        .from(certificates)
        .where(eq(certificates.code, certificate.code));
      if (local) throw conflict("That certificate code is already used here");
      const station =
        typeof result.organisation === "string" && result.organisation
          ? result.organisation
          : key.name;
      await ctx.db
        .insert(remoteCertificates)
        .values({
          orgId: key.orgId,
          station,
          stationSampleId:
            typeof result.sampleId === "string" ? result.sampleId : "",
          code: certificate.code,
          version: certificate.version,
          payload,
          payloadHash: certificate.payloadHash,
          issuedAt: new Date(certificate.issuedAt),
          result,
        })
        .onConflictDoNothing();
      return { ok: true };
    });

    /** The network's models (trained here on every station's kernels), for stations to download. */
    app.get("/local-models", async (request) => {
      const key = await requestKey(ctx, request);
      if (key.scope !== "station")
        throw forbidden("Models are for stations: use a station key");
      const models = await networkModels(ctx, key.orgId);
      return {
        items: models.map((m) => ({
          crop: m.crop,
          version: m.version,
          input: m.weights.input ?? "features",
          createdAt: m.createdAt,
        })),
      };
    });

    app.get("/local-models/:crop", async (request) => {
      const key = await requestKey(ctx, request);
      if (key.scope !== "station")
        throw forbidden("Models are for stations: use a station key");
      const { crop } = z
        .object({ crop: z.string().min(1).max(60) })
        .parse(request.params);
      const model = (await networkModels(ctx, key.orgId)).find(
        (m) => m.crop === crop,
      );
      if (!model) throw notFound("Model");
      return model;
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

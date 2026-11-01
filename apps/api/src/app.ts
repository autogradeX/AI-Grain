import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyServerOptions } from "fastify";
import { ZodError } from "zod";
import type { AppContext } from "./context.js";
import { HttpError } from "./lib/errors.js";
import { INTERNAL_RENDER_TOKEN, registerWeb } from "./web/serve.js";
import { analyticsRoutes } from "./modules/analytics/routes.js";
import { authRoutes } from "./modules/auth/routes.js";
import { batchRoutes } from "./modules/batches/routes.js";
import {
  certificateRoutes,
  publicVerifyRoutes,
} from "./modules/certificates/routes.js";
import { cropRoutes } from "./modules/crops/routes.js";
import { datasetRoutes } from "./modules/dataset/routes.js";
import { promptRoutes } from "./modules/prompts/routes.js";
import { referenceRoutes } from "./modules/references/routes.js";
import { reportRoutes } from "./modules/reports/routes.js";
import { sampleRoutes } from "./modules/samples/routes.js";
import { publicSiteRoutes, siteAdminRoutes } from "./modules/site/routes.js";
import { standardRoutes } from "./modules/standards/routes.js";
import { userRoutes } from "./modules/users/routes.js";
import {
  integrationRoutes,
  machineRoutes,
} from "./modules/integration/routes.js";
import { validationRoutes } from "./modules/validation/routes.js";

export async function buildApp(
  makeCtx: (log: import("fastify").FastifyBaseLogger) => AppContext,
  options: FastifyServerOptions = {},
) {
  const app = Fastify({ trustProxy: true, ...options });
  const ctx = makeCtx(app.log);

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "blob:", "data:"],
        mediaSrc: ["'self'", "blob:"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cookie);
  await app.register(multipart, {
    limits: {
      fileSize: ctx.config.MAX_UPLOAD_MB * 1024 * 1024,
      files: 1,
      fields: 20,
    },
  });
  // Powerful browser features: the camera for board photos, nothing else.
  app.addHook("onSend", async (_request, reply) => {
    reply.header(
      "permissions-policy",
      "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    );
  });

  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: "1 minute",
    // Reads made while server-rendering a page are part of that one request.
    allowList: (request) =>
      request.headers["x-internal-render"] === INTERNAL_RENDER_TOKEN,
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "Invalid request",
        code: "validation",
        issues: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }
    if (error instanceof SyntaxError && "statusCode" in error) {
      return reply
        .code(400)
        .send({ error: "Malformed JSON", code: "bad_json" });
    }
    if (error instanceof HttpError) {
      return reply
        .code(error.statusCode)
        .send({ error: error.message, code: error.code });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply.code(status).send({ error: (error as Error).message });
    }
    request.log.error({ err: error }, "Unhandled error");
    return reply
      .code(500)
      .send({ error: "Something went wrong on the server" });
  });

  app.get("/api/health", () => ({ ok: true }));

  await app.register(
    async (api) => {
      await api.register(authRoutes(ctx), { prefix: "/auth" });
      await api.register(userRoutes(ctx));
      await api.register(cropRoutes(ctx));
      await api.register(standardRoutes(ctx));
      await api.register(referenceRoutes(ctx));
      await api.register(sampleRoutes(ctx));
      await api.register(batchRoutes(ctx));
      await api.register(reportRoutes(ctx));
      await api.register(validationRoutes(ctx));
      await api.register(datasetRoutes(ctx));
      await api.register(promptRoutes(ctx));
      await api.register(certificateRoutes(ctx));
      await api.register(analyticsRoutes(ctx));
      await api.register(publicVerifyRoutes(ctx), { prefix: "/public" });
      await api.register(publicSiteRoutes(ctx), { prefix: "/public" });
      await api.register(siteAdminRoutes(ctx));
      await api.register(integrationRoutes(ctx));
      await api.register(machineRoutes(ctx), { prefix: "/v1" });
    },
    { prefix: "/api" },
  );

  await registerWeb(app, ctx);

  return { app, ctx };
}

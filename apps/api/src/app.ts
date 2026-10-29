import { existsSync } from "node:fs";
import { resolve } from "node:path";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyServerOptions } from "fastify";
import { ZodError } from "zod";
import type { AppContext } from "./context.js";
import { HttpError } from "./lib/errors.js";
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
import { standardRoutes } from "./modules/standards/routes.js";
import { userRoutes } from "./modules/users/routes.js";
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
  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: "1 minute",
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
    },
    { prefix: "/api" },
  );

  // The built web app, with client-side routes falling back to index.html.
  const webDir = ctx.config.WEB_DIST_DIR
    ? resolve(ctx.config.WEB_DIST_DIR)
    : null;
  if (webDir && existsSync(webDir)) {
    await app.register(fastifyStatic, { root: webDir });
    app.setNotFoundHandler((request, reply) => {
      const path = request.url.split("?")[0] ?? "";
      // App routes like /samples/123 get index.html; missing files and API paths get a real 404.
      if (
        request.method === "GET" &&
        !path.startsWith("/api/") &&
        !/\.[a-z0-9]+$/i.test(path)
      ) {
        return reply.header("cache-control", "no-cache").sendFile("index.html");
      }
      return reply.code(404).send({ error: "Not found" });
    });
  }

  return { app, ctx };
}

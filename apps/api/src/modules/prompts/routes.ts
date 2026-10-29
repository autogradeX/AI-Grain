import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { level1Prompt } from "../../ai/prompts.js";
import type { AppContext } from "../../context.js";
import { notFound } from "../../lib/errors.js";
import { authenticate, authOf } from "../auth/guard.js";
import { getStandard } from "../standards/routes.js";

/** Level 1: a prompt to paste into the Claude app, for graders working without this app's camera flow. */
export function promptRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.addHook("preHandler", authenticate(ctx));

    app.get("/prompts/level1", async (request) => {
      const me = authOf(request);
      const q = z
        .object({
          standardId: z.uuid().optional(),
          crop: z.string().trim().max(60).optional(),
        })
        .parse(request.query);
      if (q.standardId) {
        const std = await getStandard(ctx, me.orgId, q.standardId);
        if (!std) throw notFound("Standard");
        return {
          prompt: level1Prompt({
            crop: std.crop,
            standardName: std.name,
            definitions: std.definitions,
          }),
        };
      }
      return {
        prompt: level1Prompt({
          crop: q.crop ?? "wheat",
          standardName: null,
          definitions: {},
        }),
      };
    });
  };
}

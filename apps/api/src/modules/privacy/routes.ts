import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { audit } from "../../lib/audit.js";
import { badRequest } from "../../lib/errors.js";
import { authenticate, authOf, requireRole } from "../auth/guard.js";
import { eraseFarmer, samplesOfFarmer, type FarmerRef } from "./service.js";

const Ref = z.object({
  mobile: z
    .string()
    .trim()
    .regex(/^\+?[0-9 -]{6,20}$/, "A phone number: digits, spaces, + or -")
    .optional(),
  farmerId: z.string().trim().min(1).max(60).optional(),
});

function refOf(input: unknown): FarmerRef {
  const ref = Ref.parse(input);
  if (!ref.mobile && !ref.farmerId)
    throw badRequest("Give the farmer's mobile or farmer ID");
  return ref;
}

/** Admins answer a farmer's requests about their data: see it all, or erase it. */
export function privacyRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.addHook("preHandler", authenticate(ctx));
    const admin = { preHandler: requireRole("admin") };

    /** Everything held about a farmer, as a file to hand over. */
    app.get("/privacy/farmer", admin, async (request, reply) => {
      const me = authOf(request);
      const ref = refOf(request.query);
      const rows = await samplesOfFarmer(ctx, me.orgId, ref);
      await audit(ctx.db, {
        orgId: me.orgId,
        userId: me.id,
        action: "privacy.farmer_exported",
        detail: { samples: rows.length },
      });
      reply.header(
        "content-disposition",
        'attachment; filename="farmer-data.json"',
      );
      return {
        exportedAt: new Date().toISOString(),
        samples: rows.map((r) => ({
          number: r.number,
          crop: r.crop,
          status: r.status,
          createdAt: r.createdAt,
          completedAt: r.completedAt,
          enamLotId: r.enamLotId,
          gateEntryNo: r.gateEntryNo,
          farmerName: r.farmerName,
          farmerId: r.farmerId,
          farmerMobile: r.farmerMobile,
          agreedToMessages: r.farmerConsent,
          grade: r.result?.grade.grade ?? null,
          totalDefectsPct: r.result?.totalDefectsPct ?? null,
        })),
      };
    });

    /** Erases a farmer's name, ID and mobile from every sample (results stay). */
    app.post("/privacy/farmer/erase", admin, async (request) => {
      const me = authOf(request);
      const erased = await eraseFarmer(ctx, me.orgId, refOf(request.body));
      // The audit keeps how many, never who.
      await audit(ctx.db, {
        orgId: me.orgId,
        userId: me.id,
        action: "privacy.farmer_erased",
        detail: { samples: erased },
      });
      return { samples: erased };
    });
  };
}

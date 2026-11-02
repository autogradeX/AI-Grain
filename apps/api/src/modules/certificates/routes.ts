import { and, asc, eq, gt } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { certificates, remoteCertificates } from "../../db/schema.js";
import { notFound } from "../../lib/errors.js";
import { authenticate, authOf } from "../auth/guard.js";
import { loadSample } from "../samples/service.js";
import { hashPayload, normalizeCode } from "./service.js";

/** Certificates of a sample, for its page. */
export function certificateRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.addHook("preHandler", authenticate(ctx));

    app.get("/samples/:id/certificates", async (request) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      await loadSample(ctx, me.orgId, id);
      return ctx.db
        .select({
          code: certificates.code,
          version: certificates.version,
          status: certificates.status,
          payloadHash: certificates.payloadHash,
          issuedAt: certificates.issuedAt,
          withdrawnAt: certificates.withdrawnAt,
          withdrawnReason: certificates.withdrawnReason,
        })
        .from(certificates)
        .where(
          and(eq(certificates.sampleId, id), eq(certificates.orgId, me.orgId)),
        )
        .orderBy(asc(certificates.version));
    });
  };
}

/**
 * Public, no sign-in: anyone holding a report can check it here. Returns only
 * what the certificate itself contains, plus whether it is still valid.
 */
export function publicVerifyRoutes(ctx: AppContext) {
  /** A certificate a mandi station issued and sent here (this is its central server). */
  async function verifyRemote(code: string) {
    const [cert] = await ctx.db
      .select()
      .from(remoteCertificates)
      .where(eq(remoteCertificates.code, code));
    if (!cert) throw notFound("Certificate");
    const [newer] = await ctx.db
      .select({
        code: remoteCertificates.code,
        version: remoteCertificates.version,
      })
      .from(remoteCertificates)
      .where(
        and(
          eq(remoteCertificates.orgId, cert.orgId),
          eq(remoteCertificates.stationSampleId, cert.stationSampleId),
          gt(remoteCertificates.version, cert.version),
        ),
      )
      .orderBy(asc(remoteCertificates.version))
      .limit(1);
    return {
      code: cert.code,
      status: cert.status,
      payload: cert.payload,
      payloadHash: cert.payloadHash,
      intact: hashPayload(cert.payload) === cert.payloadHash,
      issuedAt: cert.issuedAt,
      withdrawnAt: cert.withdrawnAt,
      withdrawnReason: cert.withdrawnReason,
      newerVersion: newer ?? null,
      // Issued at a station and received here.
      station: cert.station,
      receivedAt: cert.receivedAt,
    };
  }

  return (app: FastifyInstance) => {
    app.get(
      "/verify/:code",
      { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
      async (request) => {
        const { code } = z
          .object({ code: z.string().max(40) })
          .parse(request.params);
        const [cert] = await ctx.db
          .select()
          .from(certificates)
          .where(eq(certificates.code, normalizeCode(code)));
        if (!cert) return verifyRemote(normalizeCode(code));
        const [newer] = await ctx.db
          .select({ code: certificates.code, version: certificates.version })
          .from(certificates)
          .where(
            and(
              eq(certificates.sampleId, cert.sampleId),
              gt(certificates.version, cert.version),
            ),
          )
          .orderBy(asc(certificates.version))
          .limit(1);
        return {
          code: cert.code,
          status: cert.status,
          payload: cert.payload,
          payloadHash: cert.payloadHash,
          // Recomputed now: proves the stored payload wasn't edited after issue.
          intact: hashPayload(cert.payload) === cert.payloadHash,
          issuedAt: cert.issuedAt,
          withdrawnAt: cert.withdrawnAt,
          withdrawnReason: cert.withdrawnReason,
          newerVersion: newer ?? null,
        };
      },
    );
  };
}

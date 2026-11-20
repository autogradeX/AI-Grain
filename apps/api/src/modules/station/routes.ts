import { networkInterfaces } from "node:os";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import QRCode from "qrcode";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import {
  batches,
  organizations,
  supportReports,
  users,
} from "../../db/schema.js";
import { audit } from "../../lib/audit.js";
import { badRequest } from "../../lib/errors.js";
import { pageQuery } from "../../lib/pagination.js";
import {
  authenticate,
  authOf,
  requireRole,
  WRITE_ROLES,
} from "../auth/guard.js";
import { enqueue, outboxStatus } from "../integration/outbox.js";

/** This machine's addresses on the local network (Wi-Fi or cable), IPv4. */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === "IPv4" && !a.internal) out.push(a.address);
    }
  }
  return out;
}

/** Station mode: where phones on the mandi's Wi-Fi open the app. */
export function stationRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.addHook("preHandler", authenticate(ctx));

    app.get("/station", async () => {
      if (!ctx.config.STATION_MODE) return { station: false, addresses: [] };
      // Behind docker the container's own address isn't the one phones use:
      // STATION_ADDRESS (set at install) wins.
      const fixed = ctx.config.STATION_ADDRESS?.trim();
      const addresses = fixed
        ? [fixed]
        : lanAddresses().map((ip) => `http://${ip}:${ctx.config.PORT}`);
      return {
        station: true,
        addresses,
        qr: addresses[0]
          ? await QRCode.toDataURL(addresses[0], { margin: 1, width: 240 })
          : null,
      };
    });

    /**
     * What the station's server can tell about itself, for the simple
     * screen's self-check: whether the AI is set up, results waiting to go
     * out, photos waiting for internet, the image model.
     */
    app.get("/station/health", async (request) => {
      const me = authOf(request);
      const [waiting] = await ctx.db
        .select({ n: count() })
        .from(batches)
        .where(and(eq(batches.orgId, me.orgId), eq(batches.status, "waiting")));
      const [failed] = await ctx.db
        .select({ n: count() })
        .from(batches)
        .where(
          and(eq(batches.orgId, me.orgId), inArray(batches.status, ["failed"])),
        );
      const outbox = await outboxStatus(ctx, me.orgId);
      return {
        time: new Date().toISOString(),
        orchestration: Boolean(ctx.config.ANTHROPIC_API_KEY),
        imageModel: Boolean(ctx.embedder),
        photosWaitingForInternet: waiting?.n ?? 0,
        photosFailed: failed?.n ?? 0,
        outbox: {
          waiting: outbox.waiting,
          failing: outbox.failing,
          oldestWaiting: outbox.oldestWaiting,
        },
      };
    });

    /**
     * "Help": the operator sends what the station saw (devices, connection,
     * recent errors) in one tap. Kept here for the admin, and sent to the
     * central server (the network's support) when there is one.
     */
    app.post(
      "/station/help",
      { preHandler: requireRole(...WRITE_ROLES) },
      async (request, reply) => {
        const me = authOf(request);
        const body = z
          .object({
            note: z.string().trim().max(1000).optional(),
            diagnostics: z.record(z.string(), z.unknown()),
          })
          .parse(request.body);
        if (JSON.stringify(body.diagnostics).length > 50_000)
          throw badRequest("The report is too large");
        const [org] = await ctx.db
          .select({ name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, me.orgId));
        const [row] = await ctx.db
          .insert(supportReports)
          .values({
            orgId: me.orgId,
            userId: me.id,
            note: body.note ?? null,
            diagnostics: body.diagnostics,
          })
          .returning();
        await enqueue(ctx, me.orgId, "support.report", {
          central: {
            id: row!.id,
            station: org?.name ?? "",
            note: body.note ?? null,
            diagnostics: body.diagnostics,
            createdAt: row!.createdAt.toISOString(),
          },
        });
        await audit(ctx.db, {
          orgId: me.orgId,
          userId: me.id,
          action: "station.help",
          detail: { id: row!.id },
        });
        reply.code(201);
        return { id: row!.id };
      },
    );

    /** The help reports stations sent (admins). */
    app.get(
      "/station/help",
      { preHandler: requireRole("admin") },
      async (request) => {
        const me = authOf(request);
        const q = z.object(pageQuery(20)).parse(request.query);
        const items = await ctx.db
          .select({
            id: supportReports.id,
            note: supportReports.note,
            diagnostics: supportReports.diagnostics,
            createdAt: supportReports.createdAt,
            userName: users.name,
          })
          .from(supportReports)
          .leftJoin(users, eq(users.id, supportReports.userId))
          .where(eq(supportReports.orgId, me.orgId))
          .orderBy(desc(supportReports.createdAt))
          .limit(q.limit)
          .offset(q.offset);
        return { items };
      },
    );
  };
}

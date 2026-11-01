import {
  and,
  count,
  desc,
  eq,
  gt,
  ilike,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { autopilotOf } from "../autopilot/triage.js";
import { CLAUDE_MODELS } from "../../config.js";
import type { AppContext } from "../../context.js";
import {
  auditLog,
  authTokens,
  organizations,
  roleEnum,
  users,
  type AutopilotSettings,
} from "../../db/schema.js";
import { audit } from "../../lib/audit.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { authenticate, authOf, requireRole } from "../auth/guard.js";
import {
  createAuthToken,
  findUserByEmail,
  revokeAllSessions,
} from "../auth/service.js";
import { siteOwnerOrgId } from "../site/service.js";
import { likePattern, page, pageQuery } from "../../lib/pagination.js";

const Role = z.enum(roleEnum.enumValues);

export function userRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.addHook("preHandler", authenticate(ctx));
    const admin = { preHandler: requireRole("admin") };

    app.get("/users", admin, async (request) => {
      const me = authOf(request);
      const q = z
        .object({
          search: z.string().trim().max(100).optional(),
          ...pageQuery(25),
        })
        .parse(request.query);
      const where = and(
        eq(users.orgId, me.orgId),
        ...(q.search
          ? [
              or(
                ilike(users.name, likePattern(q.search)),
                ilike(users.email, likePattern(q.search)),
              )!,
            ]
          : []),
      );
      const [items, [totals]] = await Promise.all([
        ctx.db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            active: users.active,
            emailVerified: sql<boolean>`${users.emailVerifiedAt} is not null`,
            lastLoginAt: users.lastLoginAt,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(where)
          .orderBy(users.name, users.id)
          .limit(q.limit)
          .offset(q.offset),
        ctx.db.select({ total: count() }).from(users).where(where),
      ]);
      return page(items, totals?.total, q);
    });

    app.patch("/users/:id", admin, async (request) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const body = z
        .object({ role: Role.optional(), active: z.boolean().optional() })
        .parse(request.body);
      const [target] = await ctx.db
        .select()
        .from(users)
        .where(and(eq(users.id, id), eq(users.orgId, me.orgId)));
      if (!target) throw notFound("User");

      const losesAdmin =
        target.role === "admin" &&
        ((body.role !== undefined && body.role !== "admin") ||
          body.active === false);
      if (losesAdmin) {
        const [other] = await ctx.db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.orgId, me.orgId),
              eq(users.role, "admin"),
              eq(users.active, true),
              ne(users.id, id),
            ),
          )
          .limit(1);
        if (!other)
          throw badRequest("The organisation needs at least one active admin");
      }

      await ctx.db
        .update(users)
        .set({
          ...(body.role !== undefined && { role: body.role }),
          ...(body.active !== undefined && { active: body.active }),
        })
        .where(eq(users.id, id));
      if (body.active === false) await revokeAllSessions(ctx, id);
      await audit(ctx.db, {
        orgId: me.orgId,
        userId: me.id,
        action: "users.updated",
        detail: { target: id, ...body },
        ip: request.ip,
      });
      return { ok: true };
    });

    app.get("/users/invites", admin, async (request) => {
      const me = authOf(request);
      return ctx.db
        .select({
          id: authTokens.id,
          email: authTokens.email,
          role: authTokens.role,
          expiresAt: authTokens.expiresAt,
          createdAt: authTokens.createdAt,
        })
        .from(authTokens)
        .where(
          and(
            eq(authTokens.orgId, me.orgId),
            eq(authTokens.purpose, "invite"),
            isNull(authTokens.usedAt),
            gt(authTokens.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(authTokens.createdAt));
    });

    app.post("/users/invites", admin, async (request, reply) => {
      const me = authOf(request);
      const body = z
        .object({ email: z.email().max(254), role: Role })
        .parse(request.body);
      if (await findUserByEmail(ctx, body.email)) {
        throw conflict("Someone already has an account with this email");
      }
      const [org] = await ctx.db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, me.orgId));
      const invite = await createAuthToken(ctx, {
        purpose: "invite",
        email: body.email,
        orgId: me.orgId,
        role: body.role,
        createdBy: me.id,
      });
      const link = `${ctx.config.APP_URL}/accept-invite?token=${invite.token}`;
      await ctx.mailer.send({
        to: body.email,
        subject: `You're invited to ${org?.name ?? "AI-Grain"}`,
        text: `${me.name} invited you to join ${org?.name ?? "their organisation"} on AI-Grain as ${body.role}.\n\nCreate your account here (valid for 7 days):\n${link}`,
      });
      await audit(ctx.db, {
        orgId: me.orgId,
        userId: me.id,
        action: "users.invited",
        detail: { email: body.email, role: body.role },
        ip: request.ip,
      });
      reply.code(201);
      // The link is returned too, so an admin can share it when email isn't set up.
      return {
        id: invite.id,
        email: body.email,
        role: body.role,
        expiresAt: invite.expiresAt,
        link,
      };
    });

    app.delete("/users/invites/:id", admin, async (request) => {
      const me = authOf(request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const deleted = await ctx.db
        .delete(authTokens)
        .where(
          and(
            eq(authTokens.id, id),
            eq(authTokens.orgId, me.orgId),
            eq(authTokens.purpose, "invite"),
          ),
        )
        .returning({ id: authTokens.id });
      if (!deleted.length) throw notFound("Invite");
      return { ok: true };
    });

    app.get("/org", async (request) => {
      const me = authOf(request);
      const [org] = await ctx.db
        .select()
        .from(organizations)
        .where(eq(organizations.id, me.orgId));
      if (!org) throw notFound("Organisation");
      return {
        ...org,
        // With defaults filled in, as the pipeline applies them.
        autopilot: autopilotOf(org.autopilot),
        effectiveModel: org.defaultModel ?? ctx.config.DEFAULT_MODEL,
        models: CLAUDE_MODELS,
        claudeConfigured: Boolean(ctx.config.ANTHROPIC_API_KEY),
        // This organisation runs the public website (demo, hub, enquiries).
        isSiteOwner: (await siteOwnerOrgId(ctx)) === me.orgId,
      };
    });

    app.patch("/org", admin, async (request) => {
      const me = authOf(request);
      const body = z
        .object({
          name: z.string().trim().min(1).max(120).optional(),
          defaultModel: z.enum(CLAUDE_MODELS).nullable().optional(),
          autopilot: z
            .object({
              enabled: z.boolean().optional(),
              spotCheckPct: z.number().min(0).max(20).optional(),
              autoSummary: z.boolean().optional(),
              expertReview: z.boolean().optional(),
            })
            .optional(),
        })
        .parse(request.body);
      const [current] = await ctx.db
        .select({ autopilot: organizations.autopilot })
        .from(organizations)
        .where(eq(organizations.id, me.orgId));
      await ctx.db
        .update(organizations)
        .set({
          ...(body.name !== undefined && { name: body.name }),
          ...(body.defaultModel !== undefined && {
            defaultModel: body.defaultModel,
          }),
          ...(body.autopilot && {
            autopilot: {
              ...current?.autopilot,
              ...(Object.fromEntries(
                Object.entries(body.autopilot).filter(
                  ([, v]) => v !== undefined,
                ),
              ) as AutopilotSettings),
            },
          }),
        })
        .where(eq(organizations.id, me.orgId));
      await audit(ctx.db, {
        orgId: me.orgId,
        userId: me.id,
        action: "org.updated",
        detail: body,
      });
      return { ok: true };
    });

    app.get("/audit", admin, async (request) => {
      const me = authOf(request);
      const q = z.object(pageQuery(50)).parse(request.query);
      const where = eq(auditLog.orgId, me.orgId);
      const [items, [totals]] = await Promise.all([
        ctx.db
          .select({
            id: auditLog.id,
            action: auditLog.action,
            detail: auditLog.detail,
            ip: auditLog.ip,
            createdAt: auditLog.createdAt,
            user: { id: users.id, name: users.name, email: users.email },
          })
          .from(auditLog)
          .leftJoin(users, eq(users.id, auditLog.userId))
          .where(where)
          .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
          .limit(q.limit)
          .offset(q.offset),
        ctx.db.select({ total: count() }).from(auditLog).where(where),
      ]);
      return page(items, totals?.total, q);
    });
  };
}

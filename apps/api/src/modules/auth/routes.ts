import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { organizations, users } from "../../db/schema.js";
import { audit } from "../../lib/audit.js";
import { hashPassword, verifyPassword } from "../../lib/crypto.js";
import {
  badRequest,
  conflict,
  forbidden,
  HttpError,
  unauthorized,
} from "../../lib/errors.js";
import { authenticate, authOf, signAccessToken } from "./guard.js";
import {
  LOCK_MINUTES,
  MAX_FAILED_LOGINS,
  REFRESH_COOKIE,
  checkPasswordStrength,
  clearRefreshCookie,
  consumeRefreshToken,
  createAuthToken,
  findAuthToken,
  findUserByEmail,
  issueRefreshToken,
  normalizeEmail,
  publicUser,
  revokeAllSessions,
  revokeFamily,
  sendVerificationEmail,
  startSession,
} from "./service.js";

const Email = z.email().max(254);
const Password = z.string().min(1).max(200);
const Name = z.string().trim().min(1).max(120);

// Checked against when an email is unknown, so failed logins take the same time either way.
const DUMMY_HASH = await hashPassword("timing-equaliser-not-a-real-password");

export function authRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    /** Tight limit for endpoints that guess passwords or send email. */
    const strictLimit = {
      rateLimit: {
        max: ctx.config.AUTH_RATE_LIMIT_PER_MINUTE,
        timeWindow: "1 minute",
      },
    };
    const auth = authenticate(ctx);

    app.post("/register", { config: strictLimit }, async (request, reply) => {
      if (!ctx.config.ALLOW_SIGNUP)
        throw forbidden("Sign-up is closed. Ask an admin for an invite.");
      const body = z
        .object({ orgName: Name, name: Name, email: Email, password: Password })
        .parse(request.body);
      checkPasswordStrength(body.password);
      if (await findUserByEmail(ctx, body.email)) {
        throw conflict("An account with this email already exists");
      }
      const passwordHash = await hashPassword(body.password);
      const user = await ctx.db.transaction(async (tx) => {
        const [org] = await tx
          .insert(organizations)
          .values({ name: body.orgName })
          .returning();
        const [created] = await tx
          .insert(users)
          .values({
            orgId: org!.id,
            email: normalizeEmail(body.email),
            name: body.name,
            passwordHash,
            role: "admin",
          })
          .returning();
        return created!;
      });
      await audit(ctx.db, {
        orgId: user.orgId,
        userId: user.id,
        action: "auth.register",
        ip: request.ip,
      });
      await sendVerificationEmail(ctx, user);
      if (ctx.config.REQUIRE_EMAIL_VERIFICATION) {
        reply.code(201);
        return { verificationRequired: true };
      }
      reply.code(201);
      return startSession(ctx, request, reply, user.id);
    });

    app.post("/login", { config: strictLimit }, async (request, reply) => {
      const body = z
        .object({ email: Email, password: Password })
        .parse(request.body);
      const user = await findUserByEmail(ctx, body.email);
      const invalid = unauthorized(
        "Wrong email or password",
        "invalid_credentials",
      );
      if (!user) {
        await verifyPassword(body.password, DUMMY_HASH);
        throw invalid;
      }
      if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
        throw new HttpError(
          423,
          "Too many failed sign-ins. Try again later or reset your password.",
          "locked",
        );
      }
      if (!(await verifyPassword(body.password, user.passwordHash))) {
        const failed = user.failedLogins + 1;
        const lock = failed >= MAX_FAILED_LOGINS;
        await ctx.db
          .update(users)
          .set({
            failedLogins: lock ? 0 : failed,
            lockedUntil: lock
              ? new Date(Date.now() + LOCK_MINUTES * 60_000)
              : user.lockedUntil,
          })
          .where(eq(users.id, user.id));
        await audit(ctx.db, {
          orgId: user.orgId,
          userId: user.id,
          action: lock ? "auth.locked" : "auth.login_failed",
          ip: request.ip,
        });
        throw invalid;
      }
      if (!user.active)
        throw unauthorized("This account has been disabled", "disabled");
      // Only with a mail server: otherwise nobody could ever confirm.
      if (
        ctx.config.REQUIRE_EMAIL_VERIFICATION &&
        ctx.config.SMTP_URL &&
        !user.emailVerifiedAt
      ) {
        throw new HttpError(
          403,
          "Confirm your email address first",
          "email_unverified",
        );
      }
      await ctx.db
        .update(users)
        .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() })
        .where(eq(users.id, user.id));
      await audit(ctx.db, {
        orgId: user.orgId,
        userId: user.id,
        action: "auth.login",
        ip: request.ip,
      });
      return startSession(ctx, request, reply, user.id);
    });

    app.post("/refresh", async (request, reply) => {
      const outcome = await consumeRefreshToken(
        ctx,
        request.cookies[REFRESH_COOKIE],
        request.ip,
      );
      if (!outcome.ok) {
        clearRefreshCookie(reply);
        throw unauthorized("Please sign in again", "refresh_invalid");
      }
      await issueRefreshToken(
        ctx,
        request,
        reply,
        outcome.userId,
        outcome.familyId,
      );
      return {
        accessToken: await signAccessToken(ctx, outcome.userId),
        expiresIn: ctx.config.ACCESS_TOKEN_TTL_SECONDS,
        user: await publicUser(ctx, outcome.userId),
      };
    });

    app.post("/logout", async (request, reply) => {
      const outcome = await consumeRefreshToken(
        ctx,
        request.cookies[REFRESH_COOKIE],
        request.ip,
      );
      if (outcome.ok) await revokeFamily(ctx, outcome.familyId);
      clearRefreshCookie(reply);
      return { ok: true };
    });

    app.post("/logout-all", { preHandler: auth }, async (request, reply) => {
      const me = authOf(request);
      await revokeAllSessions(ctx, me.id);
      clearRefreshCookie(reply);
      await audit(ctx.db, {
        orgId: me.orgId,
        userId: me.id,
        action: "auth.logout_all",
        ip: request.ip,
      });
      return { ok: true };
    });

    app.get("/me", { preHandler: auth }, async (request) =>
      publicUser(ctx, authOf(request).id),
    );

    app.patch("/me", { preHandler: auth }, async (request) => {
      const body = z.object({ name: Name }).parse(request.body);
      const me = authOf(request);
      await ctx.db
        .update(users)
        .set({ name: body.name })
        .where(eq(users.id, me.id));
      return publicUser(ctx, me.id);
    });

    app.post(
      "/password/change",
      { preHandler: auth, config: strictLimit },
      async (request, reply) => {
        const body = z
          .object({ currentPassword: Password, newPassword: Password })
          .parse(request.body);
        const me = authOf(request);
        const [user] = await ctx.db
          .select()
          .from(users)
          .where(eq(users.id, me.id));
        if (
          !user ||
          !(await verifyPassword(body.currentPassword, user.passwordHash))
        ) {
          throw badRequest("Current password is wrong", "invalid_credentials");
        }
        checkPasswordStrength(body.newPassword);
        await ctx.db
          .update(users)
          .set({ passwordHash: await hashPassword(body.newPassword) })
          .where(eq(users.id, me.id));
        // Sign out every other device; this one gets a fresh session.
        await revokeAllSessions(ctx, me.id);
        await audit(ctx.db, {
          orgId: me.orgId,
          userId: me.id,
          action: "auth.password_changed",
          ip: request.ip,
        });
        return startSession(ctx, request, reply, me.id);
      },
    );

    app.post("/password/forgot", { config: strictLimit }, async (request) => {
      const body = z.object({ email: Email }).parse(request.body);
      const user = await findUserByEmail(ctx, body.email);
      // Same answer whether or not the account exists, so this can't be used to find accounts.
      if (user?.active) {
        const { token } = await createAuthToken(ctx, {
          purpose: "reset_password",
          email: user.email,
          userId: user.id,
        });
        await ctx.mailer.send({
          to: user.email,
          subject: "Reset your AI-Grain password",
          text: `Hello ${user.name},\n\nSomeone asked to reset your password. If it was you, open this link within an hour:\n${ctx.config.APP_URL}/reset-password?token=${token}\n\nIf it wasn't you, ignore this email; your password stays the same.`,
        });
        await audit(ctx.db, {
          orgId: user.orgId,
          userId: user.id,
          action: "auth.reset_requested",
          ip: request.ip,
        });
      }
      return { ok: true };
    });

    app.post("/password/reset", { config: strictLimit }, async (request) => {
      const body = z
        .object({ token: z.string().min(10), password: Password })
        .parse(request.body);
      checkPasswordStrength(body.password);
      const row = await findAuthToken(ctx, "reset_password", body.token, true);
      if (!row?.userId)
        throw badRequest(
          "This reset link is invalid or has expired",
          "token_invalid",
        );
      await ctx.db
        .update(users)
        .set({
          passwordHash: await hashPassword(body.password),
          failedLogins: 0,
          lockedUntil: null,
          // The reset link proved the address works.
          emailVerifiedAt: new Date(),
        })
        .where(eq(users.id, row.userId));
      await revokeAllSessions(ctx, row.userId);
      await audit(ctx.db, {
        userId: row.userId,
        action: "auth.password_reset",
        ip: request.ip,
      });
      return { ok: true };
    });

    app.post("/email/verify", async (request) => {
      const body = z.object({ token: z.string().min(10) }).parse(request.body);
      const row = await findAuthToken(ctx, "verify_email", body.token, true);
      if (!row?.userId)
        throw badRequest(
          "This link is invalid or has expired",
          "token_invalid",
        );
      await ctx.db
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(and(eq(users.id, row.userId), isNull(users.emailVerifiedAt)));
      return { ok: true };
    });

    app.post("/email/resend", { config: strictLimit }, async (request) => {
      const body = z.object({ email: Email }).parse(request.body);
      const user = await findUserByEmail(ctx, body.email);
      if (user && !user.emailVerifiedAt && user.active)
        await sendVerificationEmail(ctx, user);
      return { ok: true };
    });

    app.get("/invite/:token", async (request) => {
      const { token } = z.object({ token: z.string() }).parse(request.params);
      const row = await findAuthToken(ctx, "invite", token, false);
      if (!row?.orgId)
        throw badRequest(
          "This invite is invalid or has expired",
          "token_invalid",
        );
      const [org] = await ctx.db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, row.orgId));
      return { email: row.email, role: row.role, orgName: org?.name };
    });

    app.post(
      "/invite/accept",
      { config: strictLimit },
      async (request, reply) => {
        const body = z
          .object({ token: z.string().min(10), name: Name, password: Password })
          .parse(request.body);
        checkPasswordStrength(body.password);
        const row = await findAuthToken(ctx, "invite", body.token, false);
        if (!row?.orgId || !row.role) {
          throw badRequest(
            "This invite is invalid or has expired",
            "token_invalid",
          );
        }
        if (await findUserByEmail(ctx, row.email)) {
          throw conflict(
            "An account with this email already exists. Sign in instead.",
          );
        }
        const passwordHash = await hashPassword(body.password);
        const used = await findAuthToken(ctx, "invite", body.token, true);
        if (!used)
          throw badRequest(
            "This invite has already been used",
            "token_invalid",
          );
        const [user] = await ctx.db
          .insert(users)
          .values({
            orgId: row.orgId,
            email: row.email,
            name: body.name,
            passwordHash,
            role: row.role,
            emailVerifiedAt: new Date(),
          })
          .returning();
        await audit(ctx.db, {
          orgId: row.orgId,
          userId: user!.id,
          action: "auth.invite_accepted",
          detail: { invitedBy: row.createdBy },
          ip: request.ip,
        });
        reply.code(201);
        return startSession(ctx, request, reply, user!.id);
      },
    );
  };
}

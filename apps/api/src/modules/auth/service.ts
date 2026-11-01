import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppContext } from "../../context.js";
import {
  authTokens,
  organizations,
  refreshTokens,
  users,
  type Role,
} from "../../db/schema.js";
import { audit } from "../../lib/audit.js";
import { hashToken, newToken } from "../../lib/crypto.js";
import { badRequest } from "../../lib/errors.js";
import { signAccessToken } from "./guard.js";

export const REFRESH_COOKIE = "ag_rt";
const REFRESH_COOKIE_PATH = "/api/auth";
/**
 * A rotated token presented again within this window is a lost response
 * (the connection dropped, or the page changed, after the server rotated
 * but before the browser stored the new cookie) or two tabs refreshing at
 * once, not theft. It gets a new session in the same family; reuse later
 * than this revokes the family.
 */
const ROTATION_GRACE_MS = 30_000;
export const MAX_FAILED_LOGINS = 10;
export const LOCK_MINUTES = 15;

export type TokenPurpose = "verify_email" | "reset_password" | "invite";
const TOKEN_TTL_HOURS: Record<TokenPurpose, number> = {
  verify_email: 48,
  reset_password: 1,
  invite: 7 * 24,
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(ctx: AppContext, email: string) {
  const [user] = await ctx.db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalizeEmail(email)}`);
  return user;
}

export async function publicUser(ctx: AppContext, userId: string) {
  const [row] = await ctx.db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      emailVerified: sql<boolean>`${users.emailVerifiedAt} is not null`,
      createdAt: users.createdAt,
      org: { id: organizations.id, name: organizations.name },
    })
    .from(users)
    .innerJoin(organizations, eq(organizations.id, users.orgId))
    .where(eq(users.id, userId));
  // Without a mail server no confirmation email can arrive, so the app
  // doesn't ask for one.
  return row && { ...row, emailEnabled: Boolean(ctx.config.SMTP_URL) };
}

/** Starts a new session: a new refresh-token family in a cookie, and an access token in the body. */
export async function startSession(
  ctx: AppContext,
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
) {
  await issueRefreshToken(ctx, request, reply, userId, randomUUID());
  return {
    accessToken: await signAccessToken(ctx, userId),
    expiresIn: ctx.config.ACCESS_TOKEN_TTL_SECONDS,
    user: await publicUser(ctx, userId),
  };
}

export async function issueRefreshToken(
  ctx: AppContext,
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  familyId: string,
): Promise<void> {
  const token = newToken();
  const expiresAt = new Date(
    Date.now() + ctx.config.REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000,
  );
  await ctx.db.insert(refreshTokens).values({
    userId,
    familyId,
    tokenHash: hashToken(token),
    expiresAt,
    userAgent: request.headers["user-agent"]?.slice(0, 300) ?? null,
    ip: request.ip,
  });
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: ctx.config.NODE_ENV === "production",
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  });
}

export function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
}

export async function revokeFamily(
  ctx: AppContext,
  familyId: string,
): Promise<void> {
  await ctx.db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.familyId, familyId),
        isNull(refreshTokens.revokedAt),
      ),
    );
}

export async function revokeAllSessions(
  ctx: AppContext,
  userId: string,
): Promise<void> {
  await ctx.db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)),
    );
}

export type RefreshOutcome =
  | { ok: true; userId: string; familyId: string }
  | {
      ok: false;
      reason: "missing" | "invalid" | "expired" | "reused";
    };

/** Checks a presented refresh token and marks it rotated. Reuse of a rotated token revokes its family. */
export async function consumeRefreshToken(
  ctx: AppContext,
  token: string | undefined,
  ip: string,
): Promise<RefreshOutcome> {
  if (!token) return { ok: false, reason: "missing" };
  const [row] = await ctx.db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashToken(token)));
  if (!row || row.revokedAt) return { ok: false, reason: "invalid" };
  const withinGrace = (at: Date) =>
    Date.now() - at.getTime() < ROTATION_GRACE_MS;
  if (row.rotatedAt) {
    if (withinGrace(row.rotatedAt)) return activeUser(ctx, row);
    await revokeFamily(ctx, row.familyId);
    await audit(ctx.db, {
      userId: row.userId,
      action: "auth.refresh_reuse",
      detail: { familyId: row.familyId },
      ip,
    });
    return { ok: false, reason: "reused" };
  }
  if (row.expiresAt.getTime() < Date.now())
    return { ok: false, reason: "expired" };

  // Conditional update, so two concurrent requests can't both rotate the same token.
  await ctx.db
    .update(refreshTokens)
    .set({ rotatedAt: new Date() })
    .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.rotatedAt)));
  // Another request rotated it a moment ago: the same grace applies.
  return activeUser(ctx, row);
}

async function activeUser(
  ctx: AppContext,
  row: { userId: string; familyId: string },
): Promise<RefreshOutcome> {
  const [user] = await ctx.db
    .select({ active: users.active })
    .from(users)
    .where(eq(users.id, row.userId));
  if (!user?.active) return { ok: false, reason: "invalid" };
  return { ok: true, userId: row.userId, familyId: row.familyId };
}

export async function createAuthToken(
  ctx: AppContext,
  input: {
    purpose: TokenPurpose;
    email: string;
    userId?: string;
    orgId?: string;
    role?: Role;
    createdBy?: string;
  },
): Promise<{ id: string; token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(
    Date.now() + TOKEN_TTL_HOURS[input.purpose] * 3600 * 1000,
  );
  const [row] = await ctx.db
    .insert(authTokens)
    .values({
      purpose: input.purpose,
      tokenHash: hashToken(token),
      email: normalizeEmail(input.email),
      userId: input.userId ?? null,
      orgId: input.orgId ?? null,
      role: input.role ?? null,
      createdBy: input.createdBy ?? null,
      expiresAt,
    })
    .returning({ id: authTokens.id });
  return { id: row!.id, token, expiresAt };
}

/** Finds a valid, unused token. `consume` marks it used in the same statement. */
export async function findAuthToken(
  ctx: AppContext,
  purpose: TokenPurpose,
  token: string,
  consume: boolean,
) {
  const where = and(
    eq(authTokens.tokenHash, hashToken(token)),
    eq(authTokens.purpose, purpose),
    isNull(authTokens.usedAt),
    gt(authTokens.expiresAt, new Date()),
  );
  if (!consume) {
    const [row] = await ctx.db.select().from(authTokens).where(where);
    return row;
  }
  const [row] = await ctx.db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(where)
    .returning();
  return row;
}

export async function sendVerificationEmail(
  ctx: AppContext,
  user: { id: string; email: string; name: string },
): Promise<void> {
  const { token } = await createAuthToken(ctx, {
    purpose: "verify_email",
    email: user.email,
    userId: user.id,
  });
  await ctx.mailer.send({
    to: user.email,
    subject: "Confirm your AI-Grain email address",
    text: `Hello ${user.name},\n\nConfirm your email address by opening this link:\n${ctx.config.APP_URL}/verify-email?token=${token}\n\nThe link is valid for 48 hours.`,
  });
}

export function checkPasswordStrength(password: string): void {
  if (password.length < 10)
    throw badRequest("Password must be at least 10 characters");
  if (password.length > 200)
    throw badRequest("Password must be at most 200 characters");
  if (/^(.)\1+$/.test(password)) throw badRequest("Password is too simple");
}

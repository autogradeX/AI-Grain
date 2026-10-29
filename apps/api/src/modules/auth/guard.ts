import { and, eq } from "drizzle-orm";
import type {
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from "fastify";
import { jwtVerify, SignJWT } from "jose";
import type { AppContext } from "../../context.js";
import { users, type Role } from "../../db/schema.js";
import { forbidden, unauthorized } from "../../lib/errors.js";

export interface AuthUser {
  id: string;
  orgId: string;
  role: Role;
  email: string;
  name: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthUser;
  }
}

const secretKey = (secret: string) => new TextEncoder().encode(secret);

export async function signAccessToken(
  ctx: AppContext,
  userId: string,
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ctx.config.ACCESS_TOKEN_TTL_SECONDS}s`)
    .setAudience("ai-grain")
    .sign(secretKey(ctx.config.JWT_SECRET));
}

/**
 * Verifies the bearer token, then loads the user so a role change or
 * deactivation applies on the next request rather than at token expiry.
 */
export function authenticate(ctx: AppContext): preHandlerAsyncHookHandler {
  return async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw unauthorized();
    let userId: string | undefined;
    try {
      const { payload } = await jwtVerify(
        header.slice(7),
        secretKey(ctx.config.JWT_SECRET),
        { audience: "ai-grain", algorithms: ["HS256"] },
      );
      userId = payload.sub;
    } catch {
      throw unauthorized("Session expired", "token_expired");
    }
    if (!userId) throw unauthorized();
    const [user] = await ctx.db
      .select({
        id: users.id,
        orgId: users.orgId,
        role: users.role,
        email: users.email,
        name: users.name,
      })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.active, true)));
    if (!user) throw unauthorized("Account not found or disabled");
    request.auth = user;
  };
}

export function requireRole(...roles: Role[]): preHandlerAsyncHookHandler {
  return (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.auth) return Promise.reject(unauthorized());
    if (!roles.includes(request.auth.role)) return Promise.reject(forbidden());
    return Promise.resolve();
  };
}

/** The authenticated user. Only call from routes behind `authenticate`. */
export function authOf(request: FastifyRequest): AuthUser {
  if (!request.auth) throw unauthorized();
  return request.auth;
}

/** Roles that may change samples. Viewers can only read. */
export const WRITE_ROLES: Role[] = ["admin", "grader"];

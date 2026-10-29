import { asc, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { AppContext } from "../../context.js";
import { articles, organizations } from "../../db/schema.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { authOf } from "../auth/guard.js";
import { DEFAULT_ARTICLES } from "./content.js";

/** The organisation that runs the public website: SITE_OWNER_ORG_ID, else the first one created. */
export async function siteOwnerOrgId(ctx: AppContext): Promise<string | null> {
  if (ctx.config.SITE_OWNER_ORG_ID) return ctx.config.SITE_OWNER_ORG_ID;
  const [first] = await ctx.db
    .select({ id: organizations.id })
    .from(organizations)
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  return first?.id ?? null;
}

export async function requireSiteOwnerId(ctx: AppContext): Promise<string> {
  const id = await siteOwnerOrgId(ctx);
  if (!id) throw notFound("Website");
  return id;
}

/** Admins of the site owner's organisation manage the public website. */
export async function assertSiteAdmin(
  ctx: AppContext,
  request: FastifyRequest,
): Promise<string> {
  const me = authOf(request);
  const owner = await siteOwnerOrgId(ctx);
  if (me.role !== "admin" || me.orgId !== owner) {
    throw forbidden(
      "Only admins of the organisation that runs the website can do that",
    );
  }
  return owner;
}

/** Publishes the starting guides and glossary the first time the hub is used. */
export async function ensureDefaultArticles(
  ctx: AppContext,
  orgId: string,
): Promise<void> {
  const [any] = await ctx.db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.orgId, orgId))
    .limit(1);
  if (any) return;
  const now = new Date();
  await ctx.db
    .insert(articles)
    .values(
      DEFAULT_ARTICLES.map((a) => ({
        ...a,
        orgId,
        published: true,
        publishedAt: now,
      })),
    )
    .onConflictDoNothing();
}

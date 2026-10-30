import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import {
  articleKindEnum,
  articles,
  batches,
  kernels,
  leads,
  organizations,
  samples,
  users,
} from "../../db/schema.js";
import {
  BOARD_HEIGHT,
  BOARD_PX_PER_CM,
  BOARD_WIDTH,
} from "../../imaging/board.js";
import { audit } from "../../lib/audit.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { authenticate, requireRole } from "../auth/guard.js";
import { batchPrefix, effectiveClass } from "../batches/service.js";
import { currentCertificate } from "../certificates/service.js";
import { ensureCrop } from "../crops/service.js";
import { estimateFor } from "../samples/service.js";
import {
  assertSiteAdmin,
  ensureDefaultArticles,
  requireSiteOwnerId,
  siteOwnerOrgId,
} from "./service.js";
import { page, pageQuery } from "../../lib/pagination.js";

const Kind = z.enum(articleKindEnum.enumValues);
const Slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lower-case letters, digits and hyphens",
  )
  .max(100);

/** A published demo sample of the site owner, or 404. */
async function loadDemo(ctx: AppContext, id: string) {
  const owner = await requireSiteOwnerId(ctx);
  const [sample] = await ctx.db
    .select()
    .from(samples)
    .where(
      and(
        eq(samples.id, id),
        eq(samples.orgId, owner),
        eq(samples.publicDemo, true),
        eq(samples.status, "completed"),
      ),
    );
  if (!sample) throw notFound("Demo");
  return sample;
}

/** Public, no sign-in: what the website shows. */
export function publicSiteRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.get("/site", async () => {
      const owner = await siteOwnerOrgId(ctx);
      if (!owner) return { name: "AI-Grain", demos: 0 };
      const [org] = await ctx.db
        .select()
        .from(organizations)
        .where(eq(organizations.id, owner));
      const [demos] = await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(samples)
        .where(
          and(
            eq(samples.orgId, owner),
            eq(samples.publicDemo, true),
            eq(samples.status, "completed"),
          ),
        );
      return {
        name: org?.name ?? "AI-Grain",
        bookingUrl: org?.site.bookingUrl ?? null,
        contactEmail: org?.site.contactEmail ?? null,
        phone: org?.site.phone ?? null,
        address: org?.site.address ?? null,
        demos: demos?.n ?? 0,
      };
    });

    app.get("/demos", async () => {
      const owner = await siteOwnerOrgId(ctx);
      if (!owner) return [];
      const rows = await ctx.db
        .select({
          id: samples.id,
          number: samples.number,
          crop: samples.crop,
          title: samples.demoTitle,
          sampleMassG: samples.sampleMassG,
        })
        .from(samples)
        .where(
          and(
            eq(samples.orgId, owner),
            eq(samples.publicDemo, true),
            eq(samples.status, "completed"),
          ),
        )
        .orderBy(asc(samples.number));
      const counts = rows.length
        ? await ctx.db
            .select({
              sampleId: kernels.sampleId,
              n: sql<number>`count(*)::int`,
            })
            .from(kernels)
            .where(
              inArray(
                kernels.sampleId,
                rows.map((r) => r.id),
              ),
            )
            .groupBy(kernels.sampleId)
        : [];
      return Promise.all(
        rows.map(async (r) => ({
          ...r,
          kernels: counts.find((c) => c.sampleId === r.id)?.n ?? 0,
          cropLabel: (await ensureCrop(ctx, owner, r.crop)).label,
        })),
      );
    });

    /** Everything the interactive demo shows: photos, every kernel with its class, and the results. */
    app.get("/demos/:id", async (request) => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const sample = await loadDemo(ctx, id);
      const crop = await ensureCrop(ctx, sample.orgId, sample.crop);
      const batchRows = await ctx.db
        .select({ id: batches.id, side: batches.side })
        .from(batches)
        .where(and(eq(batches.sampleId, id), eq(batches.status, "classified")))
        .orderBy(asc(batches.createdAt));
      const kernelRows = await ctx.db
        .select({
          id: kernels.id,
          batchId: kernels.batchId,
          number: kernels.number,
          x: kernels.x,
          y: kernels.y,
          w: kernels.w,
          h: kernels.h,
          cell: kernels.cell,
          cls: effectiveClass,
          aiClass: kernels.aiClass,
          aiConfidence: kernels.aiConfidence,
          aiReason: kernels.aiReason,
          reviewed: sql<boolean>`${kernels.reviewStatus} <> 'pending'`,
        })
        .from(kernels)
        .where(eq(kernels.sampleId, id))
        .orderBy(asc(kernels.number));
      const cert = await currentCertificate(ctx, id);
      return {
        id,
        number: sample.number,
        title: sample.demoTitle,
        crop: { key: crop.key, label: crop.label, classes: crop.classes },
        sampleMassG: sample.sampleMassG,
        board: {
          width: BOARD_WIDTH,
          height: BOARD_HEIGHT,
          pxPerCm: BOARD_PX_PER_CM,
        },
        batches: batchRows.map((b) => ({
          ...b,
          kernels: kernelRows.filter((k) => k.batchId === b.id),
        })),
        estimate: await estimateFor(ctx, id, crop.classes),
        result: sample.result,
        certificate: cert?.code ?? null,
      };
    });

    app.get("/demos/:id/batches/:batchId/image", async (request, reply) => {
      const { id, batchId } = z
        .object({ id: z.uuid(), batchId: z.uuid() })
        .parse(request.params);
      const sample = await loadDemo(ctx, id);
      const [batch] = await ctx.db
        .select()
        .from(batches)
        .where(and(eq(batches.id, batchId), eq(batches.sampleId, sample.id)));
      if (!batch) throw notFound("Photo");
      reply.header("cache-control", "public, max-age=3600").type("image/jpeg");
      return ctx.storage.get(`${batchPrefix(batch)}/preview.jpg`);
    });

    app.get("/demos/:id/kernels/:kernelId/crop", async (request, reply) => {
      const { id, kernelId } = z
        .object({ id: z.uuid(), kernelId: z.uuid() })
        .parse(request.params);
      const sample = await loadDemo(ctx, id);
      const [k] = await ctx.db
        .select({ cropKey: kernels.cropKey })
        .from(kernels)
        .where(and(eq(kernels.id, kernelId), eq(kernels.sampleId, sample.id)));
      if (!k) throw notFound("Kernel");
      reply.header("cache-control", "public, max-age=3600").type("image/jpeg");
      return ctx.storage.get(k.cropKey);
    });

    app.post(
      "/contact",
      { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
      async (request) => {
        const body = z
          .object({
            name: z.string().trim().min(1).max(120),
            email: z.email().max(254),
            company: z.string().trim().max(160).optional(),
            phone: z.string().trim().max(40).optional(),
            message: z.string().trim().min(1).max(5000),
            consent: z.literal(true, {
              error: "Please agree to the privacy terms",
            }),
            // A field people can't see. Bots fill it in.
            website: z.string().max(0, "Invalid request").optional(),
          })
          .parse(request.body);
        const owner = await requireSiteOwnerId(ctx);
        await ctx.db.insert(leads).values({
          orgId: owner,
          name: body.name,
          email: body.email,
          company: body.company || null,
          phone: body.phone || null,
          message: body.message,
          ip: request.ip,
        });
        const [org] = await ctx.db
          .select()
          .from(organizations)
          .where(eq(organizations.id, owner));
        const to = org?.site.contactEmail
          ? [org.site.contactEmail]
          : (
              await ctx.db
                .select({ email: users.email })
                .from(users)
                .where(
                  and(
                    eq(users.orgId, owner),
                    eq(users.role, "admin"),
                    eq(users.active, true),
                  ),
                )
            ).map((u) => u.email);
        for (const address of to) {
          await ctx.mailer.send({
            to: address,
            subject: `Website enquiry from ${body.name}`,
            text: `${body.name} <${body.email}>${body.company ? `, ${body.company}` : ""}${body.phone ? `, ${body.phone}` : ""} wrote:\n\n${body.message}\n\nIt is also listed under Website → Enquiries in AI-Grain.`,
          });
        }
        return { ok: true };
      },
    );

    app.get("/articles", async (request) => {
      const q = z
        .object({ kind: Kind.optional(), ...pageQuery(24, 60) })
        .parse(request.query);
      const owner = await siteOwnerOrgId(ctx);
      if (!owner) return page([], 0, q);
      await ensureDefaultArticles(ctx, owner);
      const where = and(
        eq(articles.orgId, owner),
        eq(articles.published, true),
        ...(q.kind ? [eq(articles.kind, q.kind)] : []),
      );
      const [items, [totals]] = await Promise.all([
        ctx.db
          .select({
            slug: articles.slug,
            kind: articles.kind,
            title: articles.title,
            summary: articles.summary,
            publishedAt: articles.publishedAt,
          })
          .from(articles)
          .where(where)
          .orderBy(asc(articles.kind), asc(articles.title), asc(articles.id))
          .limit(q.limit)
          .offset(q.offset),
        ctx.db.select({ total: count() }).from(articles).where(where),
      ]);
      return page(items, totals?.total, q);
    });

    app.get("/articles/:slug", async (request) => {
      const { slug } = z
        .object({ slug: z.string().max(100) })
        .parse(request.params);
      const owner = await requireSiteOwnerId(ctx);
      await ensureDefaultArticles(ctx, owner);
      const [a] = await ctx.db
        .select({
          slug: articles.slug,
          kind: articles.kind,
          title: articles.title,
          summary: articles.summary,
          body: articles.body,
          publishedAt: articles.publishedAt,
          updatedAt: articles.updatedAt,
        })
        .from(articles)
        .where(
          and(
            eq(articles.orgId, owner),
            eq(articles.slug, slug),
            eq(articles.published, true),
          ),
        );
      if (!a) throw notFound("Article");
      return a;
    });
  };
}

/** For admins of the site owner: settings, enquiries, articles and demo publishing. */
export function siteAdminRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.addHook("preHandler", authenticate(ctx));
    const admin = { preHandler: requireRole("admin") };

    app.get("/site/settings", admin, async (request) => {
      const owner = await assertSiteAdmin(ctx, request);
      const [org] = await ctx.db
        .select()
        .from(organizations)
        .where(eq(organizations.id, owner));
      return org?.site ?? {};
    });

    app.put("/site/settings", admin, async (request) => {
      const owner = await assertSiteAdmin(ctx, request);
      const body = z
        .object({
          bookingUrl: z.url().max(500).or(z.literal("")).optional(),
          contactEmail: z.email().max(254).or(z.literal("")).optional(),
          phone: z.string().trim().max(40).optional(),
          address: z.string().trim().max(300).optional(),
        })
        .parse(request.body);
      const site = Object.fromEntries(
        Object.entries(body).filter(([, v]) => v),
      );
      await ctx.db
        .update(organizations)
        .set({ site })
        .where(eq(organizations.id, owner));
      return site;
    });

    app.get("/site/leads", admin, async (request) => {
      const owner = await assertSiteAdmin(ctx, request);
      const q = z
        .object({
          status: z.enum(["new", "contacted", "closed"]).optional(),
          ...pageQuery(20),
        })
        .parse(request.query);
      const where = and(
        eq(leads.orgId, owner),
        ...(q.status ? [eq(leads.status, q.status)] : []),
      );
      const [items, [totals]] = await Promise.all([
        ctx.db
          .select()
          .from(leads)
          .where(where)
          .orderBy(desc(leads.createdAt), desc(leads.id))
          .limit(q.limit)
          .offset(q.offset),
        ctx.db.select({ total: count() }).from(leads).where(where),
      ]);
      return page(items, totals?.total, q);
    });

    app.patch("/site/leads/:id", admin, async (request) => {
      const owner = await assertSiteAdmin(ctx, request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const { status } = z
        .object({ status: z.enum(["new", "contacted", "closed"]) })
        .parse(request.body);
      const [row] = await ctx.db
        .update(leads)
        .set({ status })
        .where(and(eq(leads.id, id), eq(leads.orgId, owner)))
        .returning();
      if (!row) throw notFound("Enquiry");
      return row;
    });

    app.get("/site/articles", admin, async (request) => {
      const owner = await assertSiteAdmin(ctx, request);
      const q = z
        .object({ kind: Kind.optional(), ...pageQuery(25) })
        .parse(request.query);
      await ensureDefaultArticles(ctx, owner);
      const where = and(
        eq(articles.orgId, owner),
        ...(q.kind ? [eq(articles.kind, q.kind)] : []),
      );
      const [items, [totals]] = await Promise.all([
        ctx.db
          .select()
          .from(articles)
          .where(where)
          .orderBy(asc(articles.kind), asc(articles.title), asc(articles.id))
          .limit(q.limit)
          .offset(q.offset),
        ctx.db.select({ total: count() }).from(articles).where(where),
      ]);
      return page(items, totals?.total, q);
    });

    const ArticleBody = z.object({
      slug: Slug,
      kind: Kind,
      title: z.string().trim().min(1).max(200),
      summary: z.string().trim().max(500).nullable().optional(),
      body: z.string().max(50_000),
      published: z.boolean(),
    });

    app.post("/site/articles", admin, async (request, reply) => {
      const owner = await assertSiteAdmin(ctx, request);
      const body = ArticleBody.parse(request.body);
      const [exists] = await ctx.db
        .select({ id: articles.id })
        .from(articles)
        .where(and(eq(articles.orgId, owner), eq(articles.slug, body.slug)));
      if (exists) throw conflict("An article with this address already exists");
      const [row] = await ctx.db
        .insert(articles)
        .values({
          ...body,
          summary: body.summary ?? null,
          orgId: owner,
          publishedAt: body.published ? new Date() : null,
        })
        .returning();
      reply.code(201);
      return row;
    });

    app.put("/site/articles/:id", admin, async (request) => {
      const owner = await assertSiteAdmin(ctx, request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const body = ArticleBody.parse(request.body);
      const [current] = await ctx.db
        .select()
        .from(articles)
        .where(and(eq(articles.id, id), eq(articles.orgId, owner)));
      if (!current) throw notFound("Article");
      const [row] = await ctx.db
        .update(articles)
        .set({
          ...body,
          summary: body.summary ?? null,
          publishedAt: body.published
            ? (current.publishedAt ?? new Date())
            : null,
        })
        .where(eq(articles.id, id))
        .returning();
      return row;
    });

    app.delete("/site/articles/:id", admin, async (request) => {
      const owner = await assertSiteAdmin(ctx, request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const deleted = await ctx.db
        .delete(articles)
        .where(and(eq(articles.id, id), eq(articles.orgId, owner)))
        .returning({ id: articles.id });
      if (!deleted.length) throw notFound("Article");
      return { ok: true };
    });

    /** Shows or hides a completed sample on the public demo. */
    app.post("/samples/:id/publish", admin, async (request) => {
      const owner = await assertSiteAdmin(ctx, request);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const body = z
        .object({
          publicDemo: z.boolean(),
          demoTitle: z.string().trim().max(120).nullable().optional(),
        })
        .parse(request.body);
      const [sample] = await ctx.db
        .select()
        .from(samples)
        .where(and(eq(samples.id, id), eq(samples.orgId, owner)));
      if (!sample) throw notFound("Sample");
      if (body.publicDemo && sample.status !== "completed") {
        throw badRequest("Only completed samples can be published as a demo");
      }
      const [row] = await ctx.db
        .update(samples)
        .set({
          publicDemo: body.publicDemo,
          demoTitle: body.demoTitle ?? sample.demoTitle,
        })
        .where(eq(samples.id, id))
        .returning();
      await audit(ctx.db, {
        orgId: owner,
        action: body.publicDemo
          ? "site.demo_published"
          : "site.demo_unpublished",
        detail: { id, number: sample.number },
      });
      return row;
    });
  };
}

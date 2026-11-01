import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { AppContext } from "../context.js";

/**
 * Marks the API reads the server makes while rendering a page, so they don't
 * count against the visitor rate limit. Random per process; never leaves it.
 */
export const INTERNAL_RENDER_TOKEN = randomBytes(24).toString("hex");

interface RenderResult {
  status: 200 | 404;
  title: string;
  head: string;
  html: string;
  state: string;
  lazyModules: string[];
}

interface SsrModule {
  render(
    url: string,
    origin: string,
    fetchApi: (path: string) => Promise<{ status: number; body: unknown }>,
  ): Promise<RenderResult>;
}

type ViteManifest = Record<string, { file: string; css?: string[] }>;

/** Signed-in app and sign-in pages: a client-rendered shell, kept out of search. */
const PRIVATE =
  /^\/(app|login|register|forgot-password|reset-password|verify-email|accept-invite)(\/|$)/;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Serves the built web app. Public pages are server-rendered (when the build
 * includes dist-ssr) so crawlers and AI answer engines that don't run
 * JavaScript read the full page; everything else gets the app shell.
 */
export async function registerWeb(app: FastifyInstance, ctx: AppContext) {
  const webDir = ctx.config.WEB_DIST_DIR
    ? resolve(ctx.config.WEB_DIST_DIR)
    : null;
  if (!webDir || !existsSync(webDir)) return;

  await app.register(fastifyStatic, {
    root: webDir,
    // "/" is a page to render, not index.html; /index.html stays the shell.
    index: false,
    setHeaders: (res, path) => {
      // @fastify/static 10 passes the Fastify reply here, though its types
      // still describe a Node response; support both.
      const target = res as unknown as {
        header?: (name: string, value: string) => void;
        setHeader?: (name: string, value: string) => void;
      };
      const set = (key: string, value: string) =>
        target.header
          ? target.header(key, value)
          : target.setHeader?.(key, value);
      const name = path.replace(/\\/g, "/");
      if (name.endsWith("/sw.js") || name.endsWith("/index.html")) {
        // Checked on every load, so a deploy reaches installed apps.
        set("cache-control", "no-cache");
      } else if (name.includes("/assets/")) {
        // Hashed file names: a changed file gets a new name.
        set("cache-control", "public, max-age=31536000, immutable");
      }
      if (name.endsWith(".webmanifest")) {
        set("content-type", "application/manifest+json");
      }
    },
  });

  const template = readFileSync(resolve(webDir, "index.html"), "utf8");
  const manifestPath = resolve(webDir, ".vite/manifest.json");
  const manifest: ViteManifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, "utf8")) as ViteManifest)
    : {};
  const ssrPath = resolve(webDir, "../dist-ssr/entry-server.js");
  let ssr: Promise<SsrModule> | null = existsSync(ssrPath)
    ? (import(pathToFileURL(ssrPath).href) as Promise<SsrModule>)
    : null;
  ssr?.catch((err: unknown) => {
    app.log.error({ err }, "Server rendering disabled: could not load it");
    ssr = null;
  });
  const origin = ctx.config.APP_URL.replace(/\/+$/, "");

  const fetchApi = async (path: string) => {
    const res = await app.inject({
      method: "GET",
      url: `/api${path}`,
      headers: { "x-internal-render": INTERNAL_RENDER_TOKEN },
    });
    return {
      status: res.statusCode,
      body: res.statusCode === 200 ? res.json<unknown>() : null,
    };
  };

  /** The client-rendered app shell; private pages are kept out of search. */
  const shell = (reply: FastifyReply, keepOutOfSearch: boolean) => {
    if (keepOutOfSearch) reply.header("x-robots-tag", "noindex");
    return reply
      .header("cache-control", "no-cache")
      .type("text/html; charset=utf-8")
      .send(template);
  };

  /** Every published article, page by page. */
  const allArticles = async () => {
    const items: {
      slug: string;
      kind: string;
      title: string;
      summary: string | null;
      publishedAt: string | null;
      updatedAt?: string;
    }[] = [];
    for (let offset = 0; offset < 5000; offset += 60) {
      const res = await fetchApi(`/public/articles?limit=60&offset=${offset}`);
      const page = res.body as { items: typeof items; total: number } | null;
      if (!page) break;
      items.push(...page.items);
      if (items.length >= page.total || page.items.length === 0) break;
    }
    return items;
  };

  // Crawlers: everything public is open, the app and API are not. AI search
  // crawlers get their own group (a named group replaces the * rules for
  // that bot, so the disallows repeat). Training crawlers follow the * rules.
  app.get("/robots.txt", async (_request, reply) => {
    const closed = [
      "/app/",
      "/api/",
      "/login",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/verify-email",
      "/accept-invite",
    ]
      .map((p) => `Disallow: ${p}`)
      .join("\n");
    return reply
      .type("text/plain; charset=utf-8")
      .header("cache-control", "public, max-age=3600")
      .send(
        `# AI-Grain\nUser-agent: *\nAllow: /\n${closed}\n\n` +
          `# AI search engines may read and cite the public pages.\n` +
          `User-agent: OAI-SearchBot\nUser-agent: Claude-SearchBot\nUser-agent: PerplexityBot\nAllow: /\n${closed}\n\n` +
          `Sitemap: ${origin}/sitemap.xml\n`,
      );
  });

  app.get("/sitemap.xml", async (_request, reply) => {
    const pages = [
      { loc: "/", priority: "1.0" },
      { loc: "/demo", priority: "0.8" },
      { loc: "/hub", priority: "0.8" },
      { loc: "/hub?kind=glossary", priority: "0.7" },
      { loc: "/roi", priority: "0.6" },
      { loc: "/contact", priority: "0.6" },
      { loc: "/verify", priority: "0.4" },
    ].map((p) => ({ ...p, lastmod: null as string | null }));
    for (const a of await allArticles()) {
      pages.push({
        loc: `/hub/${a.slug}`,
        priority: "0.7",
        lastmod: a.updatedAt ?? a.publishedAt,
      });
    }
    const xmlEscape = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const body = pages
      .map(
        (p) =>
          `  <url>\n    <loc>${xmlEscape(origin + p.loc)}</loc>\n` +
          (p.lastmod
            ? `    <lastmod>${new Date(p.lastmod).toISOString().slice(0, 10)}</lastmod>\n`
            : "") +
          `    <priority>${p.priority}</priority>\n  </url>`,
      )
      .join("\n");
    return reply
      .type("application/xml; charset=utf-8")
      .header("cache-control", "public, max-age=3600")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
      );
  });

  // A plain-text map for AI assistants (llmstxt.org). Optional: Google says it
  // doesn't use it; some other AI tools read it.
  app.get("/llms.txt", async (_request, reply) => {
    const articles = await allArticles();
    const list = (kind: string) =>
      articles
        .filter((a) => a.kind === kind)
        .map(
          (a) =>
            `- [${a.title}](${origin}/hub/${a.slug})${a.summary ? `: ${a.summary}` : ""}`,
        )
        .join("\n");
    const sections = [
      ["Guides", list("guide")],
      ["Glossary", list("glossary")],
      ["Case studies", list("case_study")],
      ["News", list("news")],
    ]
      .filter(([, items]) => items)
      .map(([title, items]) => `## ${title}\n\n${items}`)
      .join("\n\n");
    return reply
      .type("text/plain; charset=utf-8")
      .header("cache-control", "public, max-age=3600")
      .send(
        `# AI-Grain\n\n> Grain impurity screening with a phone, a 0.01 g scale and AI Model Orchestration. Kernels on a 1 cm grid board are found by image processing, classified by AI into EN 15587-style groups (grain admixtures, broken and defective, impurities and foreign material, harmful and disease), checked by an operator, and weighed; mass percentages come from the scale, and reports carry a verifiable code. A screening and pre-check tool, not an official grading method unless validated and approved.\n\n` +
          `## Main pages\n\n` +
          `- [Home](${origin}/): what AI-Grain does, the process, equipment and FAQ\n` +
          `- [Demo analysis](${origin}/demo): a real sample, every kernel classified and checked\n` +
          `- [ROI calculator](${origin}/roi): savings compared with manual inspection\n` +
          `- [Knowledge hub](${origin}/hub): guides and glossary\n` +
          `- [Verify a report](${origin}/verify): check a certificate code\n` +
          `- [Contact](${origin}/contact): book a walkthrough\n\n` +
          `${sections}\n`,
      );
  });

  const page = async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.url;
    const path = url.split("?")[0] ?? "";
    // Missing files and API paths get a real 404.
    if (
      request.method !== "GET" ||
      path.startsWith("/api/") ||
      /\.[a-z0-9]+$/i.test(path)
    ) {
      return reply.code(404).send({ error: "Not found" });
    }
    // One URL per page: /hub/ and /hub are the same page.
    if (path.length > 1 && path.endsWith("/")) {
      return reply.redirect(
        path.replace(/\/+$/, "") + url.slice(path.length),
        301,
      );
    }
    if (PRIVATE.test(path)) return shell(reply, true);
    // Without the server bundle, public pages still work (and stay indexable).
    if (!ssr) return shell(reply, false);

    try {
      const page = await (await ssr).render(url, origin, fetchApi);
      const css = page.lazyModules.flatMap((m) => {
        const chunk = manifest[m];
        if (!chunk) return [];
        return [
          `<link rel="modulepreload" crossorigin href="/${chunk.file}" />`,
          ...(chunk.css ?? []).map(
            (f) => `<link rel="stylesheet" crossorigin href="/${f}" />`,
          ),
        ];
      });
      const html = template
        .replace(
          /<title>[^<]*<\/title>/,
          `<title>${escapeHtml(page.title)}</title>`,
        )
        .replace(/\s*<meta\s+name="description"[^>]*>/, "")
        .replace(
          "</head>",
          `    ${page.head}\n    ${css.join("\n    ")}\n  </head>`,
        )
        .replace(
          '<div id="root"></div>',
          `<div id="root">${page.html}</div>\n    <script type="application/json" id="ssr-state">${page.state}</script>`,
        );
      return reply
        .code(page.status)
        .header("cache-control", "no-cache")
        .type("text/html; charset=utf-8")
        .send(html);
    } catch (err) {
      // The page still works: the browser renders it.
      request.log.error({ err, url }, "Server rendering failed");
      return shell(reply, false);
    }
  };

  // The static files plugin would answer "/" itself (a folder), so the home
  // page has its own route; every other page arrives as a "not found".
  app.get("/", page);
  app.setNotFoundHandler(page);
}

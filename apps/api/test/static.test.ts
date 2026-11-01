import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, register, type TestApp } from "./helpers.js";

describe("serving the web app", () => {
  let t: TestApp;
  let root: string;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "ai-grain-web-"));
    const dir = join(root, "dist");
    mkdirSync(join(dir, "assets"), { recursive: true });
    mkdirSync(join(root, "dist-ssr"));
    writeFileSync(
      join(dir, "index.html"),
      '<!doctype html><html><head><meta name="description" content="x" /><title>AI-Grain</title></head><body><div id="root"></div></body></html>',
    );
    writeFileSync(
      join(dir, "sw.js"),
      "self.addEventListener('fetch', () => {});",
    );
    writeFileSync(join(dir, "manifest.webmanifest"), '{"name":"AI-Grain"}');
    writeFileSync(join(dir, "assets", "index-abc123.js"), "export {};");
    // A stand-in for the server-rendering bundle: it reads the public API
    // through the function the server passes in, like the real one.
    writeFileSync(
      join(root, "dist-ssr", "entry-server.js"),
      `export async function render(url, origin, fetchApi) {
        const site = await fetchApi("/public/site");
        const missing = url.startsWith("/hub/missing");
        return {
          status: missing ? 404 : 200,
          title: missing ? "Page not found | AI-Grain" : "Rendered " + url,
          head: '<link rel="canonical" href="' + origin + url + '" />',
          html: "<h1>Server-rendered " + url + " for " + site.body.name + "</h1>",
          state: '{"queries":[]}',
          lazyModules: [],
        };
      }`,
    );
    t = await createTestApp({
      WEB_DIST_DIR: dir,
      APP_URL: "https://grain.example/",
    });
    // The first organisation runs the site; its starter guides get published.
    await register(t);
  });

  afterAll(async () => {
    await t.close();
    rmSync(root, { recursive: true, force: true });
  });

  const get = (url: string) => t.app.inject({ method: "GET", url });

  it("server-renders public pages with their own title and head", async () => {
    const home = await get("/");
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain("<title>Rendered /</title>");
    expect(home.body).toContain("<h1>Server-rendered / for Farm</h1>");
    expect(home.body).toContain('href="https://grain.example/"');
    expect(home.body).toContain(
      '<script type="application/json" id="ssr-state">',
    );
    // The template's generic description is replaced by the page's own.
    expect(home.body).not.toContain('content="x"');
    expect(home.headers["x-robots-tag"]).toBeUndefined();
    const hub = await get("/hub?kind=glossary");
    expect(hub.body).toContain("<title>Rendered /hub?kind=glossary</title>");
  });

  it("answers a missing page with a 404 status", async () => {
    const missing = await get("/hub/missing-article");
    expect(missing.statusCode).toBe(404);
    expect(missing.body).toContain("Page not found");
  });

  it("keeps the app and sign-in pages out of search", async () => {
    for (const url of ["/app", "/app/samples/1", "/login"]) {
      const res = await get(url);
      expect(res.statusCode).toBe(200);
      expect(res.headers["x-robots-tag"]).toBe("noindex");
      expect(res.body).toContain('<div id="root"></div>');
    }
  });

  it("redirects a trailing slash to the one URL of the page", async () => {
    const res = await get("/hub/?kind=guide");
    expect(res.statusCode).toBe(301);
    expect(res.headers.location).toBe("/hub?kind=guide");
  });

  it("serves robots.txt, sitemap.xml and llms.txt for crawlers", async () => {
    const robots = await get("/robots.txt");
    expect(robots.body).toContain("Disallow: /app/");
    expect(robots.body).toContain("User-agent: OAI-SearchBot");
    expect(robots.body).toContain("Sitemap: https://grain.example/sitemap.xml");
    const sitemap = await get("/sitemap.xml");
    expect(sitemap.headers["content-type"]).toContain("application/xml");
    expect(sitemap.body).toContain("<loc>https://grain.example/</loc>");
    // Published guides are listed with their last change.
    expect(sitemap.body).toMatch(
      /<loc>https:\/\/grain\.example\/hub\/[a-z0-9-]+<\/loc>\s*<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/,
    );
    const llms = await get("/llms.txt");
    expect(llms.body).toContain("# AI-Grain");
    expect(llms.body).toContain("## Guides");
  });

  it("lets installed apps pick up a new version", async () => {
    const sw = await get("/sw.js");
    expect(sw.statusCode).toBe(200);
    expect(sw.headers["cache-control"]).toBe("no-cache");
    const shell = await get("/index.html");
    expect(shell.headers["cache-control"]).toBe("no-cache");
  });

  it("caches hashed assets for good and serves the manifest", async () => {
    const asset = await get("/assets/index-abc123.js");
    expect(asset.statusCode).toBe(200);
    expect(asset.headers["cache-control"]).toContain("immutable");
    const manifest = await get("/manifest.webmanifest");
    expect(manifest.headers["content-type"]).toBe("application/manifest+json");
  });

  it("keeps real 404s for missing files and API paths", async () => {
    expect((await get("/assets/missing.js")).statusCode).toBe(404);
    expect((await get("/api/nothing-here")).statusCode).toBe(404);
  });
});

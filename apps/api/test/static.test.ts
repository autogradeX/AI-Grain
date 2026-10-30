import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.js";

describe("serving the web app", () => {
  let t: TestApp;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "ai-grain-web-"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>x</title>");
    writeFileSync(
      join(dir, "sw.js"),
      "self.addEventListener('fetch', () => {});",
    );
    writeFileSync(join(dir, "manifest.webmanifest"), '{"name":"AI-Grain"}');
    writeFileSync(join(dir, "assets", "index-abc123.js"), "export {};");
    t = await createTestApp({ WEB_DIST_DIR: dir });
  });

  afterAll(async () => {
    await t.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const get = (url: string) => t.app.inject({ method: "GET", url });

  it("lets installed apps pick up a new version", async () => {
    const sw = await get("/sw.js");
    expect(sw.statusCode).toBe(200);
    expect(sw.headers["cache-control"]).toBe("no-cache");
    const page = await get("/app/samples/123");
    expect(page.statusCode).toBe(200);
    expect(page.headers["cache-control"]).toBe("no-cache");
    expect(page.body).toContain("<title>");
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

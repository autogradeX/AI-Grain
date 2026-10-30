import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

/**
 * Writes /sw.js at build time: the service worker template with the list of
 * files to precache (the app shell) and a version derived from them.
 * The 3D landing scene is left out; it is cached when first visited.
 */
function serviceWorker(): Plugin {
  return {
    name: "ai-grain-service-worker",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const files = Object.values(bundle)
        .map((f) => f.fileName)
        .filter(
          (name) =>
            (/\.(js|css)$/.test(name) && !/(GrainScene|HomePage)/.test(name)) ||
            // The Latin and Devanagari fonts, so text looks right offline.
            /(inter-latin-wght|devanagari-devanagari)/.test(name),
        );
      const precache = [
        "/index.html",
        "/manifest.webmanifest",
        "/icon.svg",
        "/icons/icon-192.png",
        "/icons/apple-touch-icon.png",
        ...files.map((f) => `/${f}`),
      ];
      const html = bundle["index.html"];
      const version = createHash("sha256")
        .update(precache.join("\n"))
        .update(html && "source" in html ? String(html.source) : "")
        .digest("hex")
        .slice(0, 12);
      const template = readFileSync(
        new URL("./sw/service-worker.js", import.meta.url),
        "utf8",
      );
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: template
          .replace("__VERSION__", version)
          .replace("self.__PRECACHE__", JSON.stringify(precache)),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: {
    port: 5173,
    host: true,
    proxy: { "/api": "http://localhost:3000" },
  },
});

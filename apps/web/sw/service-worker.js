/* global self, caches, fetch, URL, Response */
/*
 * AI-Grain service worker. The build fills in VERSION and PRECACHE (see
 * vite.config.ts).
 *
 * - The app shell (index.html, scripts, styles, icons) is cached at install,
 *   so the installed app opens offline and right after a deploy.
 * - Pages: network first, the cached shell when offline.
 * - Hashed /assets/ files: cache first (their names change when they do).
 * - /api/ is never cached: grain data and photos stay on the server and
 *   behind sign-in.
 * - A new version waits until the page asks it to take over, so the app
 *   can offer "Reload" instead of changing under the user.
 */
const VERSION = "__VERSION__";
const PRECACHE = self.__PRECACHE__;
const SHELL = `ai-grain-shell-${VERSION}`;
const RUNTIME = "ai-grain-runtime-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("ai-grain-shell-") && k !== SHELL)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") void self.skipWaiting();
});

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(RUNTIME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(request);
  const update = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit);
  return hit ?? update;
}

async function page(request) {
  try {
    return await fetch(request);
  } catch {
    const shell = await caches.match("/index.html");
    return (
      shell ??
      new Response("Offline", {
        status: 503,
        headers: { "content-type": "text/plain" },
      })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;
  if (request.mode === "navigate") {
    event.respondWith(page(request));
  } else if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});

/*
 * Docmate service worker (plan §5) — plain JS, no bundler.
 *
 * Strategy:
 *   - app shell pre-cached on install ("docmate-v1")
 *   - navigations + /api/ calls: network-first
 *   - same-origin static assets: cache-first with a background refresh
 *   - never cache writes: non-GET requests bypass the SW entirely
 *   - /api/v1/auth/* always goes to the network (never cached)
 *   - an offline navigation falls back to the cached "/" shell
 */

const CACHE = "docmate-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .catch(() => undefined),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data && data.type === "SKIP_WAITING") self.skipWaiting();
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isAuthApi(url) {
  return url.pathname.startsWith("/api/v1/auth/");
}

function isApi(url) {
  return url.pathname.startsWith("/api/");
}

/** Network-first: used for navigations and API reads. */
async function networkFirst(request, offlineShell) {
  try {
    const res = await fetch(request);
    // Cache successful same-origin, non-API GET responses (the shell/HTML).
    if (res && res.ok && request.method === "GET") {
      const url = new URL(request.url);
      if (isSameOrigin(url) && !isApi(url)) {
        const cache = await caches.open(CACHE);
        cache.put(request, res.clone()).catch(() => undefined);
      }
    }
    return res;
  } catch (err) {
    if (offlineShell) {
      const shell = await caches.match("/");
      if (shell) return shell;
    }
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

/** Cache-first with a background refresh: same-origin static assets. */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    fetch(request)
      .then((res) => {
        if (res && res.ok) {
          caches
            .open(CACHE)
            .then((cache) => cache.put(request, res.clone()))
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
    return cached;
  }
  const res = await fetch(request);
  if (res && res.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, res.clone()).catch(() => undefined);
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Writes and any other method are never intercepted or cached.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Auth endpoints always go straight to the network.
  if (isAuthApi(url)) return;

  // API reads: network-first, never cached.
  if (isSameOrigin(url) && isApi(url)) {
    event.respondWith(networkFirst(request, false));
    return;
  }

  // Navigations: network-first with the cached shell as the offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, true));
    return;
  }

  // Same-origin static assets: cache-first + background refresh.
  if (isSameOrigin(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
});

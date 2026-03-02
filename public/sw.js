// RedBox POS Service Worker — scoped to /pos/ routes only
// NO external libraries (Workbox, Serwist, next-pwa) — native APIs only

const STATIC_CACHE = "pos-static-v1";
const AUTH_CACHE = "pos-auth-v1";

// Assets to pre-cache during install
const PRE_CACHE_URLS = ["/pos"];

// --- Install ---
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRE_CACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// --- Activate ---
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // AUTH_CACHE is written by page context (lib/serviceWorker.ts), not this SW —
            // preserve it across SW version updates so cached Clerk tokens survive upgrades
            .filter((key) => key !== STATIC_CACHE && key !== AUTH_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// --- Fetch ---
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Pass through WebSocket connections (Convex)
  if (url.protocol === "wss:" || url.protocol === "ws:") {
    return;
  }

  // Pass through non-GET requests
  if (request.method !== "GET") {
    return;
  }

  // Cache-first for static assets
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Network-first for POS navigation requests
  if (request.mode === "navigate" && url.pathname.startsWith("/pos")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // All other requests: network-only (no caching for API calls, etc.)
});

// --- Strategies ---

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) {
      // Update cache in background
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, response));
          }
        })
        .catch(() => {
          // Network unavailable, stale cache is fine
        });
      return cached;
    }
    return fetch(request).then((response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
      }
      return response;
    });
  });
}

function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
      }
      return response;
    })
    .catch(() => {
      return caches.match(request).then((cached) => {
        return cached || new Response("Offline", { status: 503, statusText: "Service Unavailable" });
      });
    });
}

// --- Helpers ---

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/^\/icon-\d+x\d+\.png$/) ||
    url.pathname === "/manifest.webmanifest"
  );
}

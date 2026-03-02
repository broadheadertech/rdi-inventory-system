const AUTH_CACHE = "pos-auth-v1";
const TOKEN_KEY = "/api/clerk-token";

/**
 * Register the POS service worker scoped to /pos/ routes only.
 * Returns the ServiceWorkerRegistration or null if unsupported.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/pos/",
      updateViaCache: "none",
    });
    return registration;
  } catch (error) {
    console.error("Service worker registration failed:", error);
    return null;
  }
}

/**
 * Cache the Clerk session token in the Cache API for offline auth.
 * Accessible from both page and SW contexts.
 */
export async function cacheClerkToken(token: string): Promise<void> {
  try {
    const cache = await caches.open(AUTH_CACHE);
    await cache.put(TOKEN_KEY, new Response(token, { headers: { "Content-Type": "text/plain; charset=utf-8" } }));
  } catch (error) {
    console.error("Failed to cache Clerk token:", error);
  }
}

/**
 * Retrieve the cached Clerk session token.
 * Returns null if no token is cached.
 */
export async function getCachedClerkToken(): Promise<string | null> {
  try {
    const response = await caches.match(TOKEN_KEY);
    if (!response) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Check if a JWT token is expired by decoding the payload.
 * Manual base64 decode — no external JWT library needed.
 * Returns true if expired or if the token cannot be decoded.
 */
export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp < Date.now() / 1000;
  } catch {
    return true;
  }
}

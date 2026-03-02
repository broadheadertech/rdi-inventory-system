# Story 4.1: Service Worker & Offline Detection

Status: done

## Story

As a **Cashier**,
I want the POS to detect when I'm offline and continue working seamlessly,
So that sales are never interrupted by internet outages.

## Acceptance Criteria

1. **Given** the POS is running
   **When** the service worker is registered for `/pos/` routes only
   **Then** POS UI assets (HTML, CSS, JS bundles) are pre-cached for offline use
   **And** non-POS routes are unaffected by the service worker

2. **Given** the POS is online
   **When** the network status is checked
   **Then** the ConnectionIndicator shows a green dot (hidden by default — only visible briefly on state change)

3. **Given** the POS is online and data is syncing (future Story 4.2)
   **When** the sync indicator is triggered
   **Then** the ConnectionIndicator shows a blue pulse animation

4. **Given** the network goes down
   **When** the POS detects it is offline
   **Then** the ConnectionIndicator shows an amber dot + "Offline Mode" text
   **And** the transition is ambient — no blocking modals or error popups
   **And** the POS flow (scan, cart, payment, complete) continues identically

5. **Given** there is a connection error (not just offline)
   **When** the error state is detected
   **Then** the ConnectionIndicator shows a red dot + retry option

6. **Given** the POS is a PWA
   **When** the manifest is configured
   **Then** `display: standalone` and `start_url: /pos` are set
   **And** the POS is installable on tablet devices

7. **Given** the cashier is authenticated via Clerk
   **When** the POS goes offline
   **Then** the Clerk session token is cached in Service Worker storage for offline auth
   **And** force re-auth occurs on reconnect if the cached token has expired

8. **Given** the service worker is installed
   **When** it serves cached assets while offline
   **Then** the entire POS UI loads without network connectivity
   **And** the service worker uses cache-first strategy for static assets and network-first for Convex data

## Tasks / Subtasks

- [x] Task 1: Create PWA manifest at `app/manifest.ts` (AC: #6)
  - [x] 1.1 Create `app/manifest.ts` exporting a `MetadataRoute.Manifest` object. Set `name: "RedBox POS"`, `short_name: "RedBox"`, `start_url: "/pos"`, `display: "standalone"`, `background_color: "#ffffff"`, `theme_color: "#dc2626"` (red-600 brand color). Include icon references for 192x192 and 512x512 PNGs.
  - [x] 1.2 Create placeholder icon files `public/icon-192x192.png` and `public/icon-512x512.png` (simple red square or use existing brand assets if available).

- [x] Task 2: Create service worker at `public/sw.js` (AC: #1, #8)
  - [x] 2.1 Create `public/sw.js` with `install`, `activate`, and `fetch` event listeners. On `install`, open a cache named `pos-static-v1` and pre-cache the POS route shell (list of critical asset URLs to be determined at build time — initially cache `/pos` and any static assets under `/_next/static/`).
  - [x] 2.2 Implement cache-first strategy for static assets (`/_next/static/*`, `/icon-*.png`, `/manifest.json`). Implement network-first strategy for navigation requests and Convex WebSocket connections. For requests that match neither strategy, fall back to network with no caching.
  - [x] 2.3 On `activate`, clean up old caches (delete any caches not matching current version name `pos-static-v1`).
  - [x] 2.4 Scope the service worker to `/pos/` — when registering in Task 3, pass `{ scope: '/pos/' }` to restrict SW to POS routes only.

- [x] Task 3: Create `lib/serviceWorker.ts` — SW registration helper (AC: #1, #7)
  - [x] 3.1 Create `lib/serviceWorker.ts` with an exported async function `registerServiceWorker()`. Check `'serviceWorker' in navigator`. If supported, call `navigator.serviceWorker.register('/sw.js', { scope: '/pos/', updateViaCache: 'none' })`. Return the `ServiceWorkerRegistration` or null.
  - [x] 3.2 Add a `cacheClerkToken(token: string)` function that stores the Clerk session token in the SW-controlled cache (use `caches.open('pos-auth-v1')` and store as a synthetic Response). Add a `getCachedClerkToken()` function to retrieve it.
  - [x] 3.3 Add an `isTokenExpired(token: string): boolean` function that decodes the JWT `exp` claim (base64 decode the payload segment, parse JSON, compare `exp` against `Date.now() / 1000`). Do NOT use any external JWT library — manual base64 decode is sufficient for expiry check.

- [x] Task 4: Create `components/shared/ConnectionIndicator.tsx` (AC: #2, #3, #4, #5)
  - [x] 4.1 Create `components/shared/ConnectionIndicator.tsx` with `"use client"` directive. Define a `ConnectionStatus` type: `"online" | "syncing" | "offline" | "error"`. Accept optional props: `status?: ConnectionStatus` (override), `onRetry?: () => void`.
  - [x] 4.2 Use `useState` + `useEffect` to track connection status via `navigator.onLine` and `window` event listeners (`online`, `offline`). Default to `navigator.onLine ? "online" : "offline"` on mount.
  - [x] 4.3 Render the indicator as a fixed-position element in the POS header area (not floating/overlay — integrated into the layout). Visual states:
    - **online**: Small green dot (`bg-green-500`), hidden by default. Only briefly visible (fade-in then fade-out over 2s) when transitioning FROM another state.
    - **syncing**: Blue dot (`bg-blue-500`) with pulse animation (`animate-pulse`), visible while syncing. Text: "Syncing..."
    - **offline**: Amber dot (`bg-amber-500`) + text "Offline Mode" visible persistently. Use `AlertTriangle` icon from lucide-react.
    - **error**: Red dot (`bg-red-500`) + text "Connection Error" + small "Retry" button. Use `XCircle` icon from lucide-react.
  - [x] 4.4 Ensure the indicator meets POS accessibility requirements: state changes announced via `aria-live="polite"` region (announced once, not repeatedly). Use `role="status"`. Never rely on color alone — always pair with text/icon.
  - [x] 4.5 Export a `useConnectionStatus()` hook from the same file that returns the current `ConnectionStatus`. This hook will be consumed by Story 4.2 to trigger offline queue behavior.

- [x] Task 5: Modify `app/pos/layout.tsx` — register SW + add ConnectionIndicator (AC: #1, #2, #4, #6, #7)
  - [x] 5.1 Import `registerServiceWorker` and `cacheClerkToken` from `@/lib/serviceWorker`. Import `ConnectionIndicator` from `@/components/shared/ConnectionIndicator`. Import `useAuth` from `@clerk/nextjs` (or `@clerk/clerk-react`).
  - [x] 5.2 In a `useEffect`, call `registerServiceWorker()` on mount (fire-and-forget — do NOT await or block rendering). This registers the SW scoped to `/pos/`.
  - [x] 5.3 In a separate `useEffect`, get the Clerk session token via `useAuth().getToken()` and pass it to `cacheClerkToken(token)`. Re-run when the token changes (add token to dependency array). This ensures the latest valid token is always cached for offline auth.
  - [x] 5.4 Add `<ConnectionIndicator />` inside the layout's JSX, positioned in the header area (above the `{children}` content, inside the `theme-pos` wrapper).

- [x] Task 6: Add SW headers to `next.config.js` or `next.config.ts` (AC: #8)
  - [x] 6.1 Read the existing Next.js config file. Add a `headers()` async function returning headers for `/sw.js`: `Content-Type: application/javascript; charset=utf-8`, `Cache-Control: no-cache, no-store, must-revalidate`. This ensures browsers always fetch the latest service worker.

- [x] Task 7: Verify integration (AC: all)
  - [x] 7.1 Run `npx tsc --noEmit` — zero TypeScript errors.
  - [x] 7.2 Run `npx next lint` — zero lint warnings/errors.
  - [x] 7.3 Verify `next build` completes without errors (the SW file in `public/` should be served as a static asset).

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**Service Worker Scope — POS Only:**
The SW MUST be scoped to `/pos/` routes only. When registering, pass `{ scope: '/pos/' }`. This prevents the SW from interfering with admin, warehouse, HQ, or customer routes. The architecture explicitly states: "Service worker scoped exclusively to `(pos)/` routes."

```typescript
// In lib/serviceWorker.ts:
navigator.serviceWorker.register('/sw.js', {
  scope: '/pos/',
  updateViaCache: 'none',
});
```

**No External SW Libraries:**
The architecture explicitly states: NO Workbox, Serwist, next-pwa, or other SW frameworks. Use a custom `public/sw.js` with native browser APIs only. This keeps complexity low for a solo developer project.

**PWA Manifest — Next.js App Router Pattern:**
Next.js 15 supports `app/manifest.ts` natively via `MetadataRoute.Manifest`. This is the official pattern — do NOT use a static `manifest.json` in `public/`.

```typescript
// app/manifest.ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RedBox POS',
    short_name: 'RedBox',
    start_url: '/pos',
    display: 'standalone',
    // ...
  };
}
```

**ConnectionIndicator — Ambient, Never Blocking:**
Per UX spec, the indicator MUST be ambient. No modals, no blocking dialogs, no error popups. The cashier should not care about connectivity state — the POS flow must feel identical online and offline. The indicator is a small status element in the header, not a banner or overlay.

Visual states (from UX spec):
- **Online**: Green dot `#16A34A`, hidden by default
- **Syncing**: Blue pulse `#3B82F6`
- **Offline**: Amber dot `#F59E0B` + "Offline Mode" text
- **Error**: Red dot `#EF4444` + retry option

**Clerk Token Caching — Cache API (not IndexedDB):**
Store the Clerk JWT in the Cache API (accessible from both page and SW contexts) rather than IndexedDB. This is simpler and the token is small. Use a synthetic `Response` object:

```typescript
const cache = await caches.open('pos-auth-v1');
await cache.put('/api/clerk-token', new Response(token));
```

To retrieve: `const res = await caches.match('/api/clerk-token');`

**JWT Expiry Check — Manual Decode (No Library):**
Do NOT install `jsonwebtoken` or `jose` just for token expiry checking. A JWT's payload is base64url-encoded JSON. Decode it manually:

```typescript
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp < Date.now() / 1000;
  } catch {
    return true; // Treat decode failures as expired
  }
}
```

**Cache Strategy in SW:**
- **Static assets** (`/_next/static/*`, icons, manifest): Cache-first (serve from cache, update in background)
- **Navigation requests** (`/pos`, `/pos/reconciliation`): Network-first with cache fallback (so latest HTML is served when online, cached version when offline)
- **Convex WebSocket** (`wss://*.convex.cloud`): Pass through — do NOT cache or intercept WebSocket connections
- **Other requests**: Network-only (no caching for API calls, etc.)

**SW Security Headers in next.config:**
Per Next.js PWA guide, add headers for `/sw.js` to prevent caching and set correct content type:

```javascript
// In next.config headers():
{
  source: '/sw.js',
  headers: [
    { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
    { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
  ],
}
```

### Scope Boundaries — DO NOT IMPLEMENT

- **IndexedDB stores** (transactionQueue, offlineCart, stockSnapshot) → Story 4.2
- **Offline transaction queueing** → Story 4.2
- **AES-256 encryption** of offline data → Story 4.2
- **Offline mutation interception** → Story 4.2
- **Sync/replay of queued transactions** → Story 4.2
- **Stock snapshots** → Story 4.2
- **Conflict resolution** → Story 4.2
- **Push notifications** → Not in scope for Epic 4

### Existing Code to Build Upon (Epics 1-3)

**Already exists — DO NOT recreate:**
- `app/pos/layout.tsx` — POS layout with auth guard (Clerk + role check via `useQuery(api.auth.users.getCurrentUser)`, ErrorBoundary, `theme-pos` class). This file will be MODIFIED to add SW registration + ConnectionIndicator.
- `app/pos/page.tsx` — Main POS page (product search + barcode scanner + cart). NOT modified in this story.
- `middleware.ts` — Route protection with Clerk. NOT modified in this story.
- `convex/_helpers/withBranchScope.ts` — Auth + branch scoping. NOT modified.
- `components/shared/ErrorBoundary.tsx` — Error boundary component. NOT modified.

**Key patterns from previous stories (follow these):**
- `"use client"` on all POS UI components
- `min-h-14` (56px) for all POS touch targets
- `Loader2` spinner for loading states (from lucide-react)
- Inline error messages (not toast/modal)
- `useEffect` for side effects (SW registration, token caching)
- React 19 patterns (no legacy patterns)

### Previous Story Learnings (from Epic 3 Code Reviews)

- **H1 (3.4)**: Never trust client-provided values — all computation server-side. For SW, this means the SW never modifies or creates transaction data (that's Story 4.2's mutation interception).
- **H2 (3.5)**: ErrorBoundary for Convex query errors. The ConnectionIndicator should degrade gracefully if `navigator.onLine` is unavailable.
- **M3 (3.6)**: Extract shared helpers to avoid duplication. The `useConnectionStatus()` hook should be reusable across POS components.
- **Pattern**: Run `npx tsc --noEmit` + `npx next lint` after all changes for zero-error verification.
- **Pattern**: Keep imports clean — no unused imports (caught by lint).

### Project Structure Notes

```
Files to CREATE in this story:
├── app/
│   └── manifest.ts                       # PWA manifest (Next.js MetadataRoute)
├── public/
│   ├── sw.js                             # Service worker (plain JS, no TS)
│   ├── icon-192x192.png                  # PWA icon (placeholder)
│   └── icon-512x512.png                  # PWA icon (placeholder)
├── lib/
│   └── serviceWorker.ts                  # SW registration + Clerk token caching
├── components/
│   └── shared/
│       └── ConnectionIndicator.tsx       # Network status indicator (4 states)

Files to MODIFY in this story:
├── app/pos/layout.tsx                    # Add SW registration + ConnectionIndicator
├── next.config.ts (or .mjs)             # Add SW headers

Files to reference (NOT modify):
├── app/pos/page.tsx                      # Main POS page (verify SW doesn't break it)
├── middleware.ts                         # Route protection (verify SW doesn't conflict)
├── components/shared/ErrorBoundary.tsx   # Existing error boundary pattern
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.1]
- [Source: _bmad-output/planning-artifacts/architecture.md — Service Worker: POS-only scope, custom SW]
- [Source: _bmad-output/planning-artifacts/architecture.md — Offline: IndexedDB + Web Crypto (AES-256)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Clerk: session token cached in SW storage]
- [Source: _bmad-output/planning-artifacts/architecture.md — Three IndexedDB stores: transactionQueue, offlineCart, stockSnapshot]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — ConnectionIndicator: green/blue/amber/red states]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Ambient, never blocking: no modals for offline state]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — POS: 56px touch targets, 18px font base]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Offline empty state: cloud-off icon, amber color]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — aria-live="polite" for status changes]
- [Source: https://nextjs.org/docs/app/guides/progressive-web-apps — Next.js 15 PWA guide: manifest.ts, SW registration, headers]
- [Source: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto — Web Crypto API for AES-256]
- [Source: _bmad-output/implementation-artifacts/3-6-end-of-day-cash-reconciliation.md — Code review learnings]
- [Source: _bmad-output/implementation-artifacts/3-4-payment-processing-and-transaction-completion.md — Server-authoritative pattern]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

No significant debugging issues encountered. All tasks completed in a single pass with zero TypeScript errors, zero lint warnings, and a clean production build.

### Completion Notes List

- **Task 1**: Created `app/manifest.ts` using Next.js 15 `MetadataRoute.Manifest` native pattern. Generated placeholder 192×192 and 512×512 red PNG icons via a Node.js script (solid #dc2626 fill, no external image tools needed). Build confirmed `/manifest.webmanifest` route is generated automatically.
- **Task 2**: Created `public/sw.js` with three event handlers: `install` (pre-cache `/pos` into `pos-static-v1`), `activate` (evict stale caches, claim clients), `fetch` (pass-through for WebSocket + non-GET; cache-first for static assets; network-first for POS navigation; network-only otherwise). No external libraries (Workbox/Serwist) used per architecture mandate.
- **Task 3**: Created `lib/serviceWorker.ts` with `registerServiceWorker()` (scoped to `/pos/`, `updateViaCache: 'none'`), `cacheClerkToken()` (Cache API with synthetic Response), `getCachedClerkToken()`, and `isTokenExpired()` (manual base64 decode, no JWT library).
- **Task 4**: Created `components/shared/ConnectionIndicator.tsx` with `useConnectionStatus` hook and `ConnectionIndicator` component. Four visual states (online/syncing/offline/error), `role="status"` + `aria-live="polite"` for accessibility, `AlertTriangle` + `XCircle` from lucide-react. Added `animate-fade-out` keyframe to `tailwind.config.ts` for the online transition animation.
- **Task 5**: Modified `app/pos/layout.tsx` — added SW registration on mount (fire-and-forget `useEffect`), Clerk token caching via `useAuth().getToken()` (cleanup-cancelled async pattern), and `<ConnectionIndicator />` in the header area above `{children}`.
- **Task 6**: Modified `next.config.ts` — added `headers()` returning `Content-Type: application/javascript; charset=utf-8` and `Cache-Control: no-cache, no-store, must-revalidate` for `/sw.js`.
- **Task 7**: All verifications passed — `tsc --noEmit` (0 errors), `next lint` (0 warnings), `next build` (18 pages compiled cleanly including `/manifest.webmanifest`).

### File List

- `app/manifest.ts` — NEW: PWA manifest using MetadataRoute.Manifest
- `public/sw.js` — NEW: Service worker (install/activate/fetch, cache strategies, POS-scoped)
- `public/icon-192x192.png` — NEW: PWA app icon placeholder (192×192 red)
- `public/icon-512x512.png` — NEW: PWA app icon placeholder (512×512 red)
- `lib/serviceWorker.ts` — NEW: SW registration helper + Clerk token caching + JWT expiry check
- `components/shared/ConnectionIndicator.tsx` — NEW: Connection status indicator (4 states) + useConnectionStatus hook
- `app/pos/layout.tsx` — MODIFIED: Added SW registration, Clerk token caching, ConnectionIndicator
- `next.config.ts` — MODIFIED: Added SW headers (Content-Type + Cache-Control: no-cache)
- `tailwind.config.ts` — MODIFIED: Added fade-out keyframe + animation utility

## Senior Developer Review (AI)

**Review Date:** 2026-02-28
**Outcome:** Changes Requested → Fixed
**Total Issues:** 7 (1 High, 2 Medium, 4 Low) — All addressed

### Action Items

- [x] [HIGH] AC #7 partial — `isTokenExpired()` never called; no reconnect re-auth handler. Added `window.addEventListener("online", ...)` in `app/pos/layout.tsx` that calls `getToken()`, caches fresh token, and redirects to `/sign-in` if session expired. [app/pos/layout.tsx]
- [x] [MEDIUM] `aria-live` DOM-swap in `ConnectionIndicator` — returning two different DOM elements caused screen reader announcements to be missed on state changes. Replaced with single persistent `role="status"` div; className toggled for sr-only vs visible. [components/shared/ConnectionIndicator.tsx]
- [x] [MEDIUM] Token not refreshed on `online` event — cached token could go stale after offline period. Fixed by H1's reconnect handler which also refreshes the token cache. [app/pos/layout.tsx]
- [x] [LOW] `useCallback` for `handleRetry` was unnecessary — removed, replaced with inline `onClick={() => onRetry?.()}`. [components/shared/ConnectionIndicator.tsx]
- [x] [LOW] `cacheClerkToken` stored Response without `Content-Type` — added `Content-Type: text/plain; charset=utf-8` header. [lib/serviceWorker.ts]
- [x] [LOW] `sw.js` AUTH_CACHE preserved in activate cleanup with no explanation — added comment explaining it's written by page context to survive SW upgrades. [public/sw.js]
- [x] [LOW] `useCallback` import removed from ConnectionIndicator.tsx as it became unused. [components/shared/ConnectionIndicator.tsx]

## Change Log

- 2026-02-28: Story implemented by claude-sonnet-4-6. Created PWA manifest, service worker (custom/no-library), SW registration helper, ConnectionIndicator component with useConnectionStatus hook. Modified POS layout to register SW and cache Clerk token. Added SW headers to Next.js config. All verification passed (tsc: 0, lint: 0, build: clean).
- 2026-02-28: Code review by claude-sonnet-4-6. Fixed 1 HIGH (AC #7 reconnect re-auth), 2 MEDIUM (aria-live DOM-swap, token not refreshed on reconnect), 4 LOW (useCallback, Content-Type header, sw.js comment, unused import). All 7 issues resolved. tsc: 0, lint: 0.

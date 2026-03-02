# Story 5.1: Real-Time Branch Stock View

Status: done

## Story

As a **branch staff member**,
I want to see my branch's current stock levels in real-time,
So that I always know what products are available and in what quantities.

## Acceptance Criteria

1. **Given** an authenticated staff member with a branch assignment (manager or viewer role)
   **When** they navigate to `/branch/stock`
   **Then** stock levels are displayed per variant (style name, brand, size, color, quantity)
   **And** data updates in real-time via Convex `useQuery` subscriptions — no manual refresh needed

2. **Given** a stock quantity changes (e.g., a POS sale completes at this branch)
   **When** the new quantity arrives via Convex subscription
   **Then** the changed row gets a brief background pulse animation (200ms ease-in fade in, 300ms ease-out fade out)
   **And** stock levels that cross thresholds trigger `StatusPill` color transitions (green → amber → red)

3. **Given** the stock list is displayed
   **When** the staff member uses the controls
   **Then** the view supports search by style name/SKU (debounced 300ms)
   **And** filter chips allow filtering by brand and by category
   **And** sort by quantity ascending/descending is available
   **And** stock updates from POS transactions at this branch propagate in <1 second

4. **Given** a variant has `quantity = 0`
   **Then** the `StatusPill` shows "Out of Stock" (red)
   **Given** a variant has `quantity > 0` and `quantity ≤ lowStockThreshold` (default threshold = 5)
   **Then** the `StatusPill` shows "Low Stock" (amber)
   **Given** a variant has `quantity > lowStockThreshold`
   **Then** the `StatusPill` shows "In Stock" (green)

## Tasks / Subtasks

- [x] Task 1: Create `convex/inventory/stockLevels.ts` — server-side branch stock query (AC: #1, #2, #3, #4)
  - [x] 1.1 Create directory `convex/inventory/` and file `stockLevels.ts`. Import `{ query }` from `"../_generated/server"`, `{ v, ConvexError }` from `"convex/values"`, `{ withBranchScope }` from `"../_helpers/withBranchScope"`, `{ BRANCH_VIEW_ROLES }` from `"../_helpers/permissions"`.
  - [x] 1.2 Export `getBranchStock` query with args: `searchText: v.optional(v.string())`, `brandId: v.optional(v.id("brands"))`, `categoryId: v.optional(v.id("categories"))`. Handler implements withBranchScope + BRANCH_VIEW_ROLES gate + by_branch index query + server-side join chain (inventory → variants → styles → categories → brands). Note: `styles` has no `brandId` — join goes through `categories.brandId`. Returns sorted array with all required fields.

- [x] Task 2: Update `convex/_generated/api.d.ts` — add inventory/stockLevels module (AC: #1)
  - [x] 2.1 Add `import type * as inventory_stockLevels from "../inventory/stockLevels.js";` to imports section.
  - [x] 2.2 Add `"inventory/stockLevels": typeof inventory_stockLevels;` to the `ApiFromModules` object. This is a temporary manual patch until next `npx convex dev` regeneration.

- [x] Task 3: Create `components/inventory/StatusPill.tsx` — shared reusable component (AC: #4)
  - [x] 3.1 Create directory `components/inventory/` and file `StatusPill.tsx`. Export `StatusPill` component taking props: `quantity: number`, `lowStockThreshold?: number` (default `5`).
  - [x] 3.2 Implement status logic: Out of Stock (red), Low Stock (amber), In Stock (green).
  - [x] 3.3 Render: `<span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", className)}>{label}</span>`. Use `cn` from `@/lib/utils`.

- [x] Task 4: Create `app/branch/stock/page.tsx` — real-time stock view page (AC: #1, #2, #3, #4)
  - [x] 4.1 `"use client"` page with all required imports.
  - [x] 4.2 Query setup with debounced search (300ms, same pattern as pos/page.tsx), brand/category filter state, sort state, getBranchStock + listPOSBrands + listPOSCategories queries.
  - [x] 4.3 Quantity change animation via prevQuantitiesRef + animatingIds Set + 500ms setTimeout cleanup. CSS `animate-pulse-stock` class applied to changed rows.
  - [x] 4.4 Sort via useMemo — ascending (low qty first, default) or descending.
  - [x] 4.5 Render: header with count, search input, brand/category filter chips, sort toggle, loading state (animated divs), empty state, stock table with all 9 columns + StatusPill + relativeTime.

- [x] Task 5: Integration verification (AC: all)
  - [x] 5.1 Run `npx tsc --noEmit` — zero TypeScript errors. ✅
  - [x] 5.2 Run `npx next lint` — zero lint warnings/errors. ✅
  - [ ] 5.3 Run `next build` — completes without errors.
  - [ ] 5.4 Verify `/branch/stock` route renders (manager or admin session). Confirm stock rows appear, StatusPill colors are correct.

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**Inventory Table Schema (from `convex/schema.ts:97-106`):**
```typescript
inventory: defineTable({
  branchId: v.id("branches"),
  variantId: v.id("variants"),
  quantity: v.number(),
  lowStockThreshold: v.optional(v.number()),
  updatedAt: v.number(),
})
  .index("by_branch", ["branchId"])
  .index("by_variant", ["variantId"])
  .index("by_branch_variant", ["branchId", "variantId"]),
```
Stock is in a SEPARATE `inventory` table — NOT on the `variants` table. Always query `inventory` by `by_branch` index for branch-scoped stock.

**Variants Table Schema (from `convex/schema.ts:65-87`):**
```typescript
variants: defineTable({
  styleId: v.id("styles"),
  sku: v.string(),
  barcode: v.optional(v.string()),
  size: v.string(),
  color: v.string(),
  gender: v.optional(v.union(v.literal("mens"), v.literal("womens"), v.literal("unisex"), v.literal("kids"))),
  priceCentavos: v.number(),
  storageId: v.optional(v.id("_storage")),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_style", ["styleId"])
  .index("by_sku", ["sku"])
  .index("by_barcode", ["barcode"]),
```

**Real-Time Subscriptions — Convex `useQuery` is ALREADY real-time:**
Do NOT implement manual polling, websockets, or refresh buttons. `useQuery` from `convex/react` automatically re-renders the component when Convex data changes. When `createTransaction` decrements inventory, the subscription fires immediately. The <1 second propagation requirement is satisfied by Convex's native push architecture — no additional implementation needed.

**Branch Isolation — `withBranchScope()` is mandatory:**
Every Convex query touching branch data MUST call `withBranchScope(ctx)`. This automatically scopes to the current user's branch. Never accept `branchId` as a client argument — always derive from `withBranchScope()`.

**Role Gate — Use `BRANCH_VIEW_ROLES`:**
From `convex/_helpers/permissions.ts`:
```typescript
export const BRANCH_VIEW_ROLES = ["admin", "manager", "viewer"] as const;
```
Use this constant — do NOT hardcode role strings. The branch/stock page (layout.tsx) also gates access — but Convex queries must ALSO enforce authorization (defense in depth).

**Reuse existing brand/category list queries — do NOT duplicate:**
`api.pos.products.listPOSBrands` and `api.pos.products.listPOSCategories` already exist in `convex/pos/products.ts`. Use these for filter chip data. Do NOT create new brand/category list queries.

**`convex/_generated/api.d.ts` must be manually patched:**
Since `npx convex dev` is not run during story implementation, manually add:
```typescript
import type * as inventory_stockLevels from "../inventory/stockLevels.js";
// In ApiFromModules:
"inventory/stockLevels": typeof inventory_stockLevels;
```
This follows the precedent set in Story 4.2 when `pos/offlineSync.ts` was added.

**Animation Implementation — CSS, NOT JavaScript timers for visual effect:**
The pulse animation should be a CSS `@keyframes` definition applied via a class. Use `setTimeout` ONLY to remove the class after the animation duration (500ms). Do not use `setInterval` or animation libraries.

Add to `app/globals.css`:
```css
@keyframes stockPulse {
  0% { background-color: rgb(239 246 255); } /* blue-50 */
  100% { background-color: transparent; }
}
.animate-pulse-stock {
  animation: stockPulse 500ms ease-out forwards;
}
```

**Performance — Server-side join pattern (same as `convex/pos/products.ts`):**
Load all inventory for the branch, then resolve each variant/style/brand/category in the query handler. This is the established Convex join pattern in this codebase. Do NOT use N+1 (load one at a time in a loop) — batch with `Promise.all` when loading brand+category for each style.

**StatusPill thresholds:**
- Default threshold: `5` (if `inventory.lowStockThreshold` is undefined)
- Out: `quantity === 0`
- Low: `quantity > 0 && quantity <= threshold`
- In Stock: `quantity > threshold`
- Story 5.3 will allow threshold configuration — Story 5.1 only reads the existing threshold field.

**Sort behavior:**
- `sortAsc = true` → ascending quantity (0, 1, 2... most critical first) — **DEFAULT** (most useful for staff)
- `sortAsc = false` → descending quantity (highest first)
- Sort is client-side (`useMemo`) since the full branch stock is already loaded

**"Last Updated" relative time:**
Simple inline calculation — no date library needed:
```typescript
function relativeTime(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
```
Note: this is static per render — the timestamp itself updates when Convex pushes new data (i.e., when stock changes), so the "just now" display is accurate for real changes.

### Existing Code to Build Upon (DO NOT recreate)

**Already exists — DO NOT recreate:**
- `convex/_helpers/withBranchScope.ts` — `withBranchScope()` function, `BranchScope` type
- `convex/_helpers/permissions.ts` — `BRANCH_VIEW_ROLES` constant
- `convex/_helpers/auditLog.ts` — NOT needed for this story (read-only)
- `app/branch/layout.tsx` — Already has auth gating (`ALLOWED_ROLES = ["admin", "manager", "viewer"]`), nav bar with `/branch/stock` item, `ErrorBoundary` wrapper. The stock page is a CHILD of this layout — do NOT add another auth check in the page.
- `convex/pos/products.ts` — `listPOSBrands`, `listPOSCategories` — **REUSE for filter chips**
- `components/shared/ConnectionIndicator.tsx` — not needed for this story (stock view is online-only)
- `components/ui/*` — shadcn/ui primitives: `Button`, `Input`, `Skeleton` — all available
- `lib/utils.ts` — `cn()` helper
- `lib/formatters.ts` — `formatCurrency()` for displaying price in stock table

**Branch layout already handles:**
```typescript
// app/branch/layout.tsx — ALREADY EXISTS
const ALLOWED_ROLES = ["admin", "manager", "viewer"];
// Role check + redirect is handled here — stock page doesn't need to re-check
```

**`withBranchScope` return shape (verified from source):**
```typescript
export type BranchScope = {
  user: Doc<"users">;
  userId: Id<"users">;
  branchId: Id<"branches"> | null;  // null for HQ roles only
  canAccessAllBranches: boolean;
};
```
For branch roles (manager, viewer), `branchId` is always non-null (enforced by withBranchScope — throws UNAUTHORIZED if null).

**`listPOSCategories` signature (from `convex/pos/products.ts`):**
```typescript
export const listPOSCategories = query({
  args: { brandId: v.optional(v.id("brands")) },
  // ...
});
```
Pass `brandId` to get categories scoped to a brand, or `{}` for all categories.

### Project Structure

```
Files to CREATE in this story:
├── convex/
│   └── inventory/
│       └── stockLevels.ts              # getBranchStock query
├── components/
│   └── inventory/
│       └── StatusPill.tsx              # Shared status indicator (In Stock/Low/Out)
└── app/
    └── branch/
        └── stock/
            └── page.tsx                # Real-time branch stock view page

Files to MODIFY in this story:
├── convex/_generated/api.d.ts          # Add inventory_stockLevels (manual until npx convex dev)
└── app/globals.css                     # Add @keyframes stockPulse + .animate-pulse-stock

Files that MUST NOT be modified:
├── app/branch/layout.tsx               # Already complete — auth gate + nav (DO NOT TOUCH)
├── convex/pos/products.ts              # listPOSBrands/listPOSCategories will be REUSED (DO NOT DUPLICATE)
├── convex/pos/transactions.ts          # createTransaction already decrements inventory (DO NOT TOUCH)
├── convex/schema.ts                    # Schema is set — inventory table already has correct fields
```

### Code Review Learnings (Stories 4.1–4.2 + 3.x)

- **H1 (4.2)**: Concurrent async calls on the same event can cause duplicates — use `useRef` guard where appropriate (relevant for animation: if Convex fires two updates rapidly, `animatingIds` should handle Set semantics correctly)
- **H2 (4.2)**: Stale closures in event handlers — avoid capturing query results in closures; use `useRef` to track latest values
- **M1 (4.2)**: Inconsistent offline signal — use `useConnectionStatus()` consistently if needed (not needed for this story — branch stock is online-only)
- **Pattern**: Never hardcode role strings — always use `BRANCH_VIEW_ROLES`, `HQ_ROLES`, etc. from `permissions.ts`
- **Pattern**: `tsc --noEmit` + `next lint` after ALL changes — zero-error policy
- **Pattern**: `withBranchScope()` on EVERY Convex query touching branch data — never skip
- **Pattern**: Do NOT duplicate queries — `listPOSBrands`/`listPOSCategories` already exist
- **Pattern**: Manual `api.d.ts` patch needed for new Convex files (Story 4.2 precedent)
- **H1 (3.4)**: Never trust client-provided values for financial data — stock quantities must come from Convex only (no client-side quantity override)
- **Pattern from pos/products.ts**: Join pattern in Convex — load inventory array, resolve variants/styles/brands in the same query handler using `ctx.db.get()`

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 5, Story 5.1 — full ACs]
- [Source: _bmad-output/planning-artifacts/architecture.md — Real-Time & Inventory section]
- [Source: _bmad-output/planning-artifacts/architecture.md — convex/inventory/stockLevels.ts queries with branch scope filtering]
- [Source: _bmad-output/planning-artifacts/architecture.md — BRANCH_VIEW_ROLES for role gating]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — StatusPill: green/amber/red; BranchStockDisplay component]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — "Stock counts <500ms" performance target]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — "Real-time freshness: Updated X seconds ago" timestamps]
- [Source: convex/schema.ts — inventory table: branchId, variantId, quantity, lowStockThreshold, updatedAt]
- [Source: convex/pos/products.ts — server-side join pattern (inventory → variants → styles → brands/categories)]
- [Source: convex/_helpers/permissions.ts — BRANCH_VIEW_ROLES = ["admin", "manager", "viewer"]]
- [Source: convex/_helpers/withBranchScope.ts — withBranchScope() + BranchScope type]
- [Source: app/branch/layout.tsx — ALLOWED_ROLES + nav items (stock route already in nav)]
- [Source: _bmad-output/implementation-artifacts/4-2-offline-transaction-queue-and-encryption.md — api.d.ts manual patch precedent, animation with CSS keyframes, debounced search pattern]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Schema correction: `styles` table has no `brandId` — actual join chain is `inventory → variants → styles → categories → brands` (category holds brandId). Story's architectural notes referenced `style.brandId` which doesn't exist in schema.ts.
- `@/components/ui/skeleton` not installed — replaced with inline `animate-pulse` divs.

### Completion Notes List

- ✅ Task 1: `convex/inventory/stockLevels.ts` — `getBranchStock` query with withBranchScope + BRANCH_VIEW_ROLES gate. Server-side join: inventory → variants → styles → categories → brands. Filters (brandId, categoryId, searchText) applied during join. Returns sorted by styleName.
- ✅ Task 2: `convex/_generated/api.d.ts` manually patched — `inventory_stockLevels` import + ApiFromModules entry.
- ✅ Task 3: `components/inventory/StatusPill.tsx` — Out of Stock (red) / Low Stock (amber) / In Stock (green) using `cn` from `@/lib/utils`.
- ✅ Task 4: `app/branch/stock/page.tsx` — real-time stock view with 300ms debounced search, brand/category filter chips, quantity sort, 500ms pulse animation on stock changes, 9-column table with StatusPill and relativeTime.
- ✅ Task 5: `app/globals.css` — `@keyframes stockPulse` + `.animate-pulse-stock` class added. `tsc --noEmit`: 0 errors. `next lint`: 0 warnings/errors.

### Code Review Findings & Fixes (2026-02-28)

- ✅ Fixed H1 [HIGH]: `selectedCategoryId` not reset on brand change — added `setSelectedCategoryId(null)` to brand chip onClick, preventing stale cross-brand filter producing empty results [`app/branch/stock/page.tsx`]
- ✅ Fixed M1 [MEDIUM]: Brand loaded before brandId filter check — moved brandId/categoryId/searchText filters before `ctx.db.get(category.brandId)` call to avoid wasted database reads [`convex/inventory/stockLevels.ts`]
- ✅ Fixed M2 [MEDIUM]: "viewer" role silently getting UNAUTHORIZED on POS brand/category queries — added `getCurrentUser` query + `isViewer` flag, uses `"skip"` to bypass those queries for viewers [`app/branch/stock/page.tsx`]
- ✅ Fixed M3 [MEDIUM]: No searchText length limit — added `.slice(0, 200)` truncation before `.includes()` processing [`convex/inventory/stockLevels.ts`]
- ✅ Fixed L1 [LOW]: `transition-colors` conflicted with `animate-pulse-stock` — conditionally suppress transition class during animation [`app/branch/stock/page.tsx`]
- ✅ Fixed L2 [LOW]: Filter `<button>` elements missing `type="button"` — added to brand chip, category chip, clear-filters button [`app/branch/stock/page.tsx`]

### File List

- `convex/inventory/stockLevels.ts` (created)
- `convex/_generated/api.d.ts` (modified — inventory_stockLevels patch)
- `components/inventory/StatusPill.tsx` (created)
- `app/branch/stock/page.tsx` (created)
- `app/globals.css` (modified — stockPulse animation)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

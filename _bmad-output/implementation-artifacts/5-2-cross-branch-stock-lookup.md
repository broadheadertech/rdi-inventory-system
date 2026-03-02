# Story 5.2: Cross-Branch Stock Lookup

Status: done

## Story

As a **cashier at the POS**,
I want to check if another branch has a product in stock without leaving my current transaction,
so that I can immediately tell a customer where to find what they need.

## Acceptance Criteria

1. **Given** a cashier is in an active POS transaction
   **When** they tap "Other Branches" on a product card
   **Then** a `BranchStockDisplay` dialog appears inline (NOT a full page navigation)
   **And** the current transaction and cart are fully preserved — no state is cleared
   **And** the dialog shows all branches that have inventory records for the style

2. **Given** the `BranchStockDisplay` dialog is opening
   **When** the query is in-flight
   **Then** a loading skeleton is shown inside the dialog
   **And** the lookup completes in `<5 seconds` for typical branch counts

3. **Given** the dialog is showing stock results
   **When** a branch has inventory records for the style
   **Then** available sizes/colors are listed per branch with quantity and `StatusPill` indicator
   **And** variants with `quantity = 0` show the "Out of Stock" (red) `StatusPill`
   **And** variants with `0 < quantity ≤ lowStockThreshold` show "Low Stock" (amber)
   **And** variants with `quantity > lowStockThreshold` show "In Stock" (green)

4. **Given** the dialog is showing
   **When** there are NO inventory records for the style at any branch
   **Then** an empty state message is shown (not an error)

5. **Given** any authenticated role (cashier, manager, viewer, hqStaff, admin) is using the POS
   **When** the `getAllBranchStockForStyle` query is called
   **Then** ALL branches with inventory records for the style are returned read-only
   **And** no transfer actions are exposed — this is a lookup-only feature

## Tasks / Subtasks

- [x] Task 1: Add `getAllBranchStockForStyle` query to `convex/inventory/stockLevels.ts` (AC: #1, #2, #3, #4, #5)
  - [x] 1.1 In the existing file `convex/inventory/stockLevels.ts`, append a new exported query `getAllBranchStockForStyle` below the existing `getBranchStock` export. Do NOT create a new file.
  - [x] 1.2 Args: `styleId: v.id("styles")`. Auth: call `withBranchScope(ctx)` for authentication only — do NOT add a role restriction (all authenticated users may look up cross-branch stock). No additional `ConvexError` role check needed; `withBranchScope` already throws UNAUTHORIZED for unauthenticated users.
  - [x] 1.3 Step 1 — load active variants: `ctx.db.query("variants").withIndex("by_style", (q) => q.eq("styleId", args.styleId)).collect()` then `.filter((variant) => variant.isActive)`. Use loop variable name `variant` NOT `v` (which is already imported from `"convex/values"`).
  - [x] 1.4 Step 2 — for each active variant, query `ctx.db.query("inventory").withIndex("by_variant", (q) => q.eq("variantId", variant._id)).collect()`. Use `Promise.all` for concurrency. Group results by `branchId` using a `Map<Id<"branches">, { variants: Array<...> }>`. Requires `import type { Id } from "../_generated/dataModel"` — added at top of file.
  - [x] 1.5 Step 3 — resolve branch names: `const branch = await ctx.db.get(branchId)`. Build result array: `{ branchId, branchName: branch?.name ?? "Unknown Branch", variants: [...sorted by size] }`. Return array sorted by `branchName.localeCompare`.
  - [x] 1.6 Return type shape: `Array<{ branchId: Id<"branches">; branchName: string; variants: Array<{ variantId: Id<"variants">; size: string; color: string; quantity: number; lowStockThreshold: number }> }>`.

- [x] Task 2: Create `components/inventory/BranchStockDisplay.tsx` — self-contained Dialog component (AC: #1, #2, #3, #4, #5)
  - [x] 2.1 Create `components/inventory/BranchStockDisplay.tsx` as a `"use client"` component. Props interface: `{ styleId: Id<"styles">; styleName: string }`.
  - [x] 2.2 Imports: `useState` from `"react"`, `useQuery` from `"convex/react"`, `api` from `"@/convex/_generated/api"`, `Id` from `"@/convex/_generated/dataModel"`, `Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger` from `"@/components/ui/dialog"`, `StatusPill` from `"@/components/inventory/StatusPill"`, `Store` from `"lucide-react"`.
  - [x] 2.3 Internal state: `const [open, setOpen] = useState(false)`. Query with lazy-load pattern: `const branchStock = useQuery(api.inventory.stockLevels.getAllBranchStockForStyle, open ? { styleId } : "skip")`. This ensures the query only fires when the dialog is open — critical for POS performance.
  - [x] 2.4 Render a `<Dialog open={open} onOpenChange={setOpen}>` with a `<DialogTrigger asChild>` wrapping a `<button type="button">` with label "Other Branches" and `<Store />` icon. Button has `min-h-14` for POS touch target compliance. Full width `w-full`.
  - [x] 2.5 `<DialogContent className="max-w-md">` with `<DialogHeader><DialogTitle>Other Branch Stock — {styleName}</DialogTitle></DialogHeader>`.
  - [x] 2.6 Inside DialogContent body, three states: Loading (undefined → 3 animate-pulse divs), Empty (length 0 → text message), Results (map branches → cards with variants).
  - [x] 2.7 Variant chip: size always shown, color shown only if `color !== size`, StatusPill with quantity + lowStockThreshold.

- [x] Task 3: Modify `components/pos/POSProductGrid.tsx` — add "Other Branches" button to `ProductCard` (AC: #1)
  - [x] 3.1 Added `import { BranchStockDisplay } from "@/components/inventory/BranchStockDisplay";` at top of file. No changes to `POSProductGridProps`.
  - [x] 3.2 Added `<BranchStockDisplay styleId={product.styleId} styleName={product.styleName} />` as last child in `ProductCard`'s outer div, after the size pills.
  - [x] 3.3 No other changes — props, grid, filter chip logic all untouched.

- [x] Task 4: Integration verification (AC: all)
  - [x] 4.1 `npx tsc --noEmit` → **0 TypeScript errors** ✅
  - [x] 4.2 `npx next lint` → **0 warnings, 0 errors** ✅

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**Inventory Table Schema — `by_variant` index is the key for this story:**
```typescript
// convex/schema.ts
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
Use `by_variant` to find all branches that stock a specific variant. Use `by_style` on the `variants` table to get all variants for a style.

**Variants Table — `by_style` index:**
```typescript
variants: defineTable({
  styleId: v.id("styles"),
  sku: v.string(),
  size: v.string(),
  color: v.string(),
  gender: v.optional(v.union(...)),
  priceCentavos: v.number(),
  isActive: v.boolean(),
  ...
})
  .index("by_style", ["styleId"])
  .index("by_sku", ["sku"])
  .index("by_barcode", ["barcode"]),
```

**`withBranchScope` for auth, no role restriction:**
```typescript
// Auth pattern for getAllBranchStockForStyle:
const scope = await withBranchScope(ctx);
// withBranchScope throws UNAUTHORIZED for unauthenticated users
// No role check needed — ALL roles (cashier, manager, viewer, hqStaff, admin) may look up cross-branch stock
// The `scope` variable is not used further — it's called purely for auth enforcement
```
Using `_ = await withBranchScope(ctx)` or just calling and ignoring is fine. The linter may warn about unused vars — use `void` trick or just call it directly if needed: `await withBranchScope(ctx);`.

**`v` import conflict — CRITICAL:**
The existing `stockLevels.ts` imports `{ v, ConvexError }` from `"convex/values"`. In the new query handler, use `variant` as the loop variable name in `.filter()` and `.map()` callbacks. Never use `v` as a callback parameter name — it shadows the `v` validator import.

**No `api.d.ts` patch needed:**
`convex/inventory/stockLevels.ts` is already registered in `convex/_generated/api.d.ts` (done in Story 5.1). Adding a new export to the same file automatically makes `api.inventory.stockLevels.getAllBranchStockForStyle` available. This is different from Story 5.1 where a new file required a manual patch.

**Dialog is self-contained — no props lifting needed:**
`BranchStockDisplay` manages its own `open` state internally. The `POSProductGridProps` interface does NOT need modification. The `ProductCard` function receives no new props. This is the "encapsulated dialog" pattern — preferred for components that own their own open/close lifecycle.

**Lazy query loading with `"skip"` — CRITICAL for POS performance:**
```typescript
// CORRECT: Only fires query when dialog is actually open
const branchStock = useQuery(
  api.inventory.stockLevels.getAllBranchStockForStyle,
  open ? { styleId } : "skip"
);

// WRONG: Would fire getAllBranchStockForStyle for EVERY product card on mount
const branchStock = useQuery(api.inventory.stockLevels.getAllBranchStockForStyle, { styleId });
```
The POS product grid renders 8-20+ product cards. If each card fires the cross-branch query on mount, that's 8-20 expensive queries running simultaneously. Always use `"skip"` when the dialog is closed.

**Theme-POS touch target compliance:**
From `app/globals.css`:
```css
.theme-pos button, .theme-pos [role="button"], .theme-pos input {
  min-height: 56px;
}
```
The POS page uses `<div className="theme-pos ...">` as the root. Any `<button>` inside the POS must respect the 56px minimum. The trigger button in `BranchStockDisplay` must have `min-h-14` (56px) to meet this requirement.

**Dialog component — available in this project:**
```typescript
// components/ui/dialog.tsx is AVAILABLE — use it
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// NOTE: Sheet and Popover components do NOT exist in this project's components/ui/
// Do NOT use Sheet or Popover — Dialog is the only available overlay primitive.
```

**`StatusPill` reuse — already exists from Story 5.1:**
```typescript
// components/inventory/StatusPill.tsx — ALREADY EXISTS
import { StatusPill } from "@/components/inventory/StatusPill";

// Props: { quantity: number; lowStockThreshold?: number }
// Default threshold: 5
// quantity === 0 → "Out of Stock" (red)
// 0 < quantity ≤ threshold → "Low Stock" (amber)
// quantity > threshold → "In Stock" (green)
```

**Story scope — lookup ONLY:**
This story is a READ-ONLY cross-branch stock lookup. Do NOT implement:
- Transfer initiation from POS (that's Epic 6)
- "Reserve at another branch" (that's Epic 8)
- Any write operations or mutations
The button only opens a dialog showing stock levels. No actions buttons inside the dialog.

**`branches` table schema:**
```typescript
branches: defineTable({
  name: v.string(),
  address: v.optional(v.string()),
  isActive: v.boolean(),
  createdAt: v.number(),
})
```
`branch.name` is the display name. `ctx.db.get(branchId)` returns the full branch document. Use `branch?.name ?? "Unknown Branch"` defensively.

### Existing Code Patterns (DO NOT recreate)

**`getBranchStock` in `convex/inventory/stockLevels.ts` — follow the same file conventions:**
- Same imports already at top of file: `withBranchScope`, `BRANCH_VIEW_ROLES`, `v`, `ConvexError`
- For `getAllBranchStockForStyle`, you do NOT need `BRANCH_VIEW_ROLES` or the role-check pattern — just `withBranchScope` for auth
- Keep `ConvexError` import (already there from `getBranchStock`)

**`useQuery` with `"skip"` — established pattern (Story 5.1 precedent):**
```typescript
// From Story 5.1 code review fix M2:
const brands = useQuery(api.pos.products.listPOSBrands, isViewer ? "skip" : {});
// Same pattern for lazy-load:
const branchStock = useQuery(
  api.inventory.stockLevels.getAllBranchStockForStyle,
  open ? { styleId } : "skip"
);
```

**`Promise.all` for concurrent variant lookups — same pattern as `getBranchStock`:**
```typescript
// getBranchStock uses:
const results = await Promise.all(inventoryItems.map(async (inv) => { ... }));
// getAllBranchStockForStyle should use the same pattern for variant → inventory lookups
```

**ProductCard in POSProductGrid.tsx — where to insert:**
```tsx
// CURRENT end of ProductCard return (add BranchStockDisplay after this):
<div className="flex flex-wrap gap-1.5">
  {product.sizes.map((size) => (
    <button key={size.variantId} ... >
      ...
    </button>
  ))}
</div>
// INSERT HERE:
<BranchStockDisplay styleId={product.styleId} styleName={product.styleName} />
```

**`animate-pulse` for loading skeletons — inline divs pattern (Story 5.1 precedent):**
`@/components/ui/skeleton` does NOT exist in this project. Use:
```tsx
<div className="h-16 animate-pulse rounded bg-muted" />
```

### Project Structure

```
Files to CREATE in this story:
└── components/
    └── inventory/
        └── BranchStockDisplay.tsx    # Self-contained Dialog for cross-branch stock

Files to MODIFY in this story:
├── convex/inventory/stockLevels.ts   # Append getAllBranchStockForStyle query
└── components/pos/POSProductGrid.tsx # Import + add <BranchStockDisplay> to ProductCard

Files that MUST NOT be modified:
├── convex/_generated/api.d.ts        # Already has inventory/stockLevels — no patch needed
├── convex/auth/branches.ts           # listBranches is admin-only — do NOT call it; use ctx.db.get() for branch names
├── app/pos/page.tsx                  # POS page renders POSProductGrid — no changes needed here
├── components/inventory/StatusPill.tsx # Already complete from Story 5.1 — REUSE only
├── app/globals.css                   # Already has stockPulse animation — no additions needed
├── convex/schema.ts                  # Schema is set — do NOT touch
```

### Previous Story Learnings (from 5.1 + 4.x)

- **Schema join chain is critical**: `styles` table has NO `brandId` — it's on `categories.brandId`. Always trace the full chain before assuming field locations.
- **`v` import conflict**: Never use `v` as a callback parameter name in files that import `{ v }` from `"convex/values"`. Story 5.1 had this issue — use `variant`, `inv`, `item` etc.
- **`@/components/ui/skeleton` does not exist**: Use `animate-pulse` divs instead.
- **`useQuery "skip"` pattern**: Pass `"skip"` (string literal) as second arg when you want to conditionally skip a query. DO NOT try `import { skipConvexQuery }` — that doesn't exist in this project's version.
- **Manual `api.d.ts` patch**: Only needed when creating a NEW Convex module file. Adding exports to an existing file (like this story does) requires NO patch.
- **Filter before expensive DB operations**: In the Story 5.1 review, we moved brandId/categoryId/searchText filters BEFORE `ctx.db.get(brand)` to avoid wasted reads. Apply same discipline here — filter inactive variants before querying inventory.
- **Zero-error policy**: `tsc --noEmit` + `next lint` must both pass with 0 errors/warnings before marking story done.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 5, Story 5.2 — full ACs]
- [Source: convex/schema.ts — inventory table: by_variant index, by_branch_variant index]
- [Source: convex/schema.ts — variants table: by_style index, isActive field]
- [Source: convex/schema.ts — branches table: name field]
- [Source: convex/inventory/stockLevels.ts — existing getBranchStock join pattern to follow]
- [Source: convex/_helpers/withBranchScope.ts — withBranchScope() for auth]
- [Source: convex/_helpers/permissions.ts — BRANCH_VIEW_ROLES, POS_ROLES (all roles authenticated)]
- [Source: components/ui/dialog.tsx — Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle]
- [Source: components/inventory/StatusPill.tsx — StatusPill reusable component (Story 5.1)]
- [Source: components/pos/POSProductGrid.tsx — ProductCard structure, POSProduct type, styleId field]
- [Source: app/globals.css — .theme-pos min-height 56px requirement for buttons]
- [Source: _bmad-output/implementation-artifacts/5-1-real-time-branch-stock-view.md — "skip" pattern, animate-pulse pattern, api.d.ts patch rules]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- No errors encountered during implementation. `tsc --noEmit` and `next lint` both passed clean on first run.
- Used `Map<Id<"branches">, { variants: [...] }>` for branch grouping — required `import type { Id }` from `"../_generated/dataModel"` (added to stockLevels.ts imports).
- `Promise.all` on variant map is safe: Map.set/get are synchronous; JS single-thread guarantees no race condition.

### Completion Notes List

- ✅ Task 1: `convex/inventory/stockLevels.ts` — appended `getAllBranchStockForStyle` query. Auth via `withBranchScope(ctx)` only (no role restriction). Uses `by_style` index on variants + `by_variant` index on inventory. Groups by branchId Map, resolves branch names, returns sorted by branchName. Added `import type { Id }` from dataModel.
- ✅ Task 2: `components/inventory/BranchStockDisplay.tsx` — new `"use client"` self-contained Dialog component. Props: `{ styleId, styleName }`. Lazy-load via `"skip"` when dialog is closed (prevents 8-20 simultaneous queries on POS mount). Three-state body: loading (animate-pulse), empty state, results with StatusPill chips. min-h-14 trigger button for theme-pos compliance.
- ✅ Task 3: `components/pos/POSProductGrid.tsx` — added `BranchStockDisplay` import and `<BranchStockDisplay styleId={product.styleId} styleName={product.styleName} />` as last child of ProductCard. No props changes, no grid changes.
- ✅ Task 4: `tsc --noEmit` → 0 errors | `next lint` → 0 warnings/errors.

### Code Review Findings & Fixes (2026-02-28)

- ✅ Fixed M1 [MEDIUM]: No `branch.isActive` filter in `getAllBranchStockForStyle` — added `if (!branch?.isActive) return null` with null-filter on results; closed branches no longer appear in cross-branch lookup [`convex/inventory/stockLevels.ts`]
- ✅ Fixed M2 [MEDIUM]: Alphabetical size sort gave wrong garment order (XL before XS) — added `GARMENT_SIZE_ORDER` const (XS=0, S=1, M=2, L=3, XL=4, XXL=5, XXXL=6) with numeric fallback to `localeCompare` for non-standard sizes [`convex/inventory/stockLevels.ts`]
- ✅ Fixed L1 [LOW]: Missing `<DialogDescription>` caused Radix UI accessibility warning — added `sr-only` DialogDescription to satisfy Radix a11y requirements [`components/inventory/BranchStockDisplay.tsx`]
- ✅ Fixed L2 [LOW]: `variant.color !== variant.size` was dead code (colors and sizes are never equal strings in apparel) — removed conditional, color now always rendered unconditionally [`components/inventory/BranchStockDisplay.tsx`]
- ✅ Fixed L3 [LOW]: No error isolation for BranchStockDisplay — wrapped in `<ErrorBoundary fallback={null}>` so Convex query errors are silently absorbed rather than crashing the entire POS product grid [`components/pos/POSProductGrid.tsx`]

### File List

- `convex/inventory/stockLevels.ts` (modified — added `getAllBranchStockForStyle` query + `GARMENT_SIZE_ORDER` const + `import type { Id }` + inactive branch filter)
- `components/inventory/BranchStockDisplay.tsx` (created + review fixes: DialogDescription, unconditional color display)
- `components/pos/POSProductGrid.tsx` (modified — added BranchStockDisplay + ErrorBoundary wrapper)
- `_bmad-output/implementation-artifacts/5-2-cross-branch-stock-lookup.md` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

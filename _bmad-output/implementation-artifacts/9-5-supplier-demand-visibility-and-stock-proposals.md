# Story 9.5: Supplier Demand Visibility & Stock Proposals

Status: done

## Story

As a **Supplier**,
I want to see demand signals for my brand across RedBox branches,
so that I can understand what's selling and propose stock replenishment.

## Acceptance Criteria

1. **Given** a Supplier role user at `(supplier)/` route
   **When** they sign in
   **Then** they see demand data filtered to their brand(s) only

2. **Given** a Supplier views the portal dashboard
   **When** demand data is available
   **Then** they can view: top-selling variants, demand log entries for their brand, stock levels across branches

3. **Given** a Supplier views demand data
   **When** they want to propose replenishment
   **Then** they can submit stock proposals: proposed items, quantities, pricing
   **And** proposals are submitted to the Owner/Admin for review

4. **Given** a Supplier interacts with the portal
   **When** they attempt to access RedBox data
   **Then** the supplier portal is read-only for data, write-only for proposals (no edits to RedBox data)

5. **Given** a Supplier accesses the portal
   **When** the interface loads
   **Then** the interface is desktop-only, mouse + keyboard optimized

## Tasks / Subtasks

- [x] Task 1: Add `supplier` role to user system (AC: #1)
  - [x] 1.1 Add `v.literal("supplier")` to users table `role` union in `convex/schema.ts`
  - [x] 1.2 Add `SUPPLIER: "supplier"` to `lib/constants.ts` ROLES object
  - [x] 1.3 Add `SUPPLIER_ROLES = ["admin", "supplier"] as const` to `convex/_helpers/permissions.ts`
  - [x] 1.4 Update `ROLE_ROUTE_ACCESS["/supplier"]` in `lib/routes.ts` to `["admin", "supplier"]`
  - [x] 1.5 Add `supplier: "/supplier/portal"` to `ROLE_DEFAULT_ROUTES` in `lib/routes.ts`

- [x] Task 2: Add `supplierProposals` table to `convex/schema.ts` (AC: #3)
  - [x] 2.1 Define table with fields: supplierId (v.id("users")), brand (v.string()), items (array of {description, sku (optional), quantity, unitPriceCentavos}), totalCentavos, notes (optional), status ("pending" | "accepted" | "rejected"), reviewedBy (optional v.id("users")), reviewedAt (optional), reviewNotes (optional), createdAt
  - [x] 2.2 Add indexes: by_supplier (supplierId), by_status (status), by_supplier_status (supplierId, status)

- [x] Task 3: Create `convex/suppliers/portal.ts` — supplier queries + proposal mutation (AC: #1, #2, #3, #4)
  - [x] 3.1 `getSupplierDemandSummary` (query) — returns weekly demand summaries filtered to the supplier's assigned brand(s), enriched with branch names
  - [x] 3.2 `getSupplierBrandStockLevels` (query) — returns current inventory levels for the supplier's brand(s) across all branches
  - [x] 3.3 `getSupplierDemandLogs` (query) — returns recent demand log entries for supplier's brand(s) with branch names, bounded
  - [x] 3.4 `submitProposal` (mutation) — creates a supplierProposal record with "pending" status, validated supplier role + brand
  - [x] 3.5 `getMyProposals` (query) — returns supplier's own proposals sorted by createdAt desc

- [x] Task 4: Create HQ proposal review functions in `convex/suppliers/portal.ts` (AC: #3)
  - [x] 4.1 `getPendingProposals` (query) — HQ-only, returns all pending proposals with supplier name and brand
  - [x] 4.2 `reviewProposal` (mutation) — HQ-only, accepts or rejects a proposal with review notes

- [x] Task 5: Update `app/supplier/layout.tsx` — add supplier role guard (AC: #1)
  - [x] 5.1 Add role check: redirect to "/" if user role is not "supplier" or "admin"

- [x] Task 6: Build `app/supplier/portal/page.tsx` — supplier dashboard (AC: #1, #2, #3, #4, #5)
  - [x] 6.1 Demand summary section: weekly brand demand with top designs, top sizes, branch breakdown
  - [x] 6.2 Recent demand logs section: filterable list of demand entries for supplier's brand(s)
  - [x] 6.3 Stock levels section: current inventory across branches for supplier's brand(s)
  - [x] 6.4 Proposal submission form: items list (description, optional SKU, quantity, unit price), notes, submit button
  - [x] 6.5 My Proposals section: list of submitted proposals with status badges (pending/accepted/rejected)
  - [x] 6.6 Desktop-optimized layout: tab navigation, wide tables, no mobile breakpoints needed

- [x] Task 7: Integration verification (AC: all)
  - [x] 7.1 `npx convex codegen` — passes
  - [x] 7.2 `npx tsc --noEmit` — 0 errors
  - [x] 7.3 `npx next lint` — 0 warnings/errors

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**Supplier role — extend existing user system (NOT a new table):**

Suppliers are users with `role: "supplier"`. They DO NOT need a separate `suppliers` table. The `users` table already has `role` and `branchId` fields. For suppliers, `branchId` is NOT used for branch scoping — instead, supplier brand filtering is done by matching the supplier's assigned brand(s). We need a way to associate a supplier user with their brand(s).

**Brand association approach:** Add a `supplierBrands` field to the users table? NO — this would modify the users table schema for all roles. Instead, use a simpler approach: the supplier's name/company maps to brand names in the `brands` table. For MVP, use a new optional field `assignedBrands` on the users table (array of brand names) that is only populated for supplier role users. This avoids a join table while keeping it simple.

**Updated users table change in `convex/schema.ts`:**
```typescript
// Add to users table definition:
assignedBrands: v.optional(v.array(v.string())), // Supplier brand names (only for supplier role)
```

**New table `supplierProposals` in `convex/schema.ts`:**
```typescript
supplierProposals: defineTable({
  supplierId: v.id("users"),
  brand: v.string(),
  items: v.array(
    v.object({
      description: v.string(),
      sku: v.optional(v.string()),
      quantity: v.number(),
      unitPriceCentavos: v.number(),
    })
  ),
  totalCentavos: v.number(),
  notes: v.optional(v.string()),
  status: v.union(
    v.literal("pending"),
    v.literal("accepted"),
    v.literal("rejected")
  ),
  reviewedBy: v.optional(v.id("users")),
  reviewedAt: v.optional(v.number()),
  reviewNotes: v.optional(v.string()),
  createdAt: v.number(),
})
  .index("by_supplier", ["supplierId"])
  .index("by_status", ["status"])
  .index("by_supplier_status", ["supplierId", "status"]),
```

**New module `convex/suppliers/portal.ts`:**
- Uses `requireRole(ctx, SUPPLIER_ROLES)` for supplier queries/mutations
- Uses `requireRole(ctx, HQ_ROLES)` for HQ proposal review functions
- Import `SUPPLIER_ROLES` and `HQ_ROLES` from `convex/_helpers/permissions.ts`
- Will auto-register as `api.suppliers.portal` after codegen

**Supplier query patterns — how to filter by brand:**
```typescript
// Get supplier's assigned brands
const user = await requireRole(ctx, SUPPLIER_ROLES);
const supplierBrands = user.assignedBrands ?? [];
if (supplierBrands.length === 0) return []; // No brands assigned

// Filter demand summaries by brand
// demandWeeklySummaries has by_week_brand index: ["weekStart", "brand"]
// Query per brand — bounded per brand
for (const brand of supplierBrands) {
  const summaries = await ctx.db
    .query("demandWeeklySummaries")
    .withIndex("by_week_brand", (q) =>
      q.gte("weekStart", fourWeeksAgo).eq("brand", brand) // WRONG — can't .eq after .gte on trailing field
    )
    ...
}
```

**IMPORTANT — Index constraint for `demandWeeklySummaries`:**
The `by_week_brand` index is `["weekStart", "brand"]`. Convex indexes require equality conditions on leading fields before range conditions. To query by brand across multiple weeks, you CANNOT use `.gte("weekStart", X).eq("brand", Y)` — the range on `weekStart` prevents equality on `brand`.

**Solution options:**
1. Query `by_week_brand` with specific weekStart values (iterate known weeks + brand)
2. Query `by_week` index with `.gte("weekStart", fourWeeksAgo)` then client-filter by brand
3. Add a new `by_brand_week` index `["brand", "weekStart"]` for brand-first queries

**Recommended: Option 2 (filter client-side)** — weekly summaries are small (one row per brand per week). A 4-week window yields ~100 rows max. Client-side filtering by brand is trivial and avoids schema changes.

```typescript
// Correct pattern:
const fourWeeksAgo = now - 28 * DAY_MS;
const allSummaries = await ctx.db
  .query("demandWeeklySummaries")
  .withIndex("by_week", (q) => q.gte("weekStart", fourWeeksAgo))
  .collect();
const brandSummaries = allSummaries.filter((s) =>
  supplierBrands.includes(s.brand)
);
```

**Stock levels query — use existing `inventory` table:**
```typescript
// inventory table has by_branch index and by_variant index
// Need to join: inventory → variants → styles → brands to filter by supplier brand
// Pattern: get all variants for supplier's brands, then get inventory for those variants

// Step 1: Get brand IDs for supplier's brands
const allBrands = await ctx.db.query("brands").collect();
const brandIds = allBrands
  .filter((b) => supplierBrands.includes(b.name) && b.isActive)
  .map((b) => b._id);

// Step 2: Get styles for those brands (styles have brandId field)
// styles table has by_brand index: ["brandId"]
const styles = [];
for (const brandId of brandIds) {
  const brandStyles = await ctx.db
    .query("styles")
    .withIndex("by_brand", (q) => q.eq("brandId", brandId))
    .collect();
  styles.push(...brandStyles);
}

// Step 3: Get variants for those styles
// variants table has by_style index: ["styleId"]
const variantIds = [];
for (const style of styles) {
  const styleVariants = await ctx.db
    .query("variants")
    .withIndex("by_style", (q) => q.eq("styleId", style._id))
    .collect();
  variantIds.push(...styleVariants.map(v => v._id)); // NOTE: do NOT use 'v' as param name in Convex — but ok here since it's in .map, not schema builder
}

// Step 4: Get inventory for those variants across branches
// inventory table has by_variant index: ["variantId"]
// NOTE: This is N queries for N variants — bound with .take() and limit variant count
```

**CRITICAL — `v` naming conflict:** NEVER use `v` as a callback parameter name in Convex files where `v` is imported from `convex/values`. Use `item`, `entry`, `variant`, etc. instead.

**Proposal submission mutation:**
```typescript
export const submitProposal = mutation({
  args: {
    brand: v.string(),
    items: v.array(
      v.object({
        description: v.string(),
        sku: v.optional(v.string()),
        quantity: v.number(),
        unitPriceCentavos: v.number(),
      })
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, SUPPLIER_ROLES);

    // Validate supplier has access to this brand
    const supplierBrands = user.assignedBrands ?? [];
    if (!supplierBrands.includes(args.brand)) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Not authorized for this brand" });
    }

    // Calculate total
    const totalCentavos = args.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCentavos, 0
    );

    await ctx.db.insert("supplierProposals", {
      supplierId: user._id,
      brand: args.brand,
      items: args.items,
      totalCentavos,
      notes: args.notes,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});
```

**HQ proposal review:**
```typescript
export const reviewProposal = mutation({
  args: {
    proposalId: v.id("supplierProposals"),
    decision: v.union(v.literal("accepted"), v.literal("rejected")),
    reviewNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.status !== "pending") {
      throw new ConvexError({ code: "NOT_FOUND", message: "Proposal not found or already reviewed" });
    }
    await ctx.db.patch(args.proposalId, {
      status: args.decision,
      reviewedBy: user._id,
      reviewedAt: Date.now(),
      reviewNotes: args.reviewNotes,
    });
  },
});
```

**Supplier layout role guard update (`app/supplier/layout.tsx`):**
```typescript
// Replace auth-only check with role check
const currentUser = useQuery(api.auth.users.getCurrentUser);

useEffect(() => {
  if (currentUser !== undefined) {
    if (!currentUser || (currentUser.role !== "supplier" && currentUser.role !== "admin")) {
      router.replace("/");
    }
  }
}, [currentUser, router]);
```

**Supplier portal page structure (`app/supplier/portal/page.tsx`):**
```
Desktop layout (no mobile breakpoints needed):
┌──────────────────────────────────────────────────────┐
│  Supplier Portal — {brandName}           [My Brands] │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─ Demand Summary (Last 4 Weeks) ────────────────┐  │
│  │  Weekly trend table: brand | week | requests    │  │
│  │  Top designs, top sizes per brand               │  │
│  └────────────────────────────────────────────────-┘  │
│                                                      │
│  ┌─ Recent Demand Logs ──────────────────────────-┐  │
│  │  Table: date | branch | brand | design | size  │  │
│  │  Bounded to last 100 entries                    │  │
│  └────────────────────────────────────────────────-┘  │
│                                                      │
│  ┌─ Stock Levels ────────────────────────────────-┐  │
│  │  Table: branch | variant | current stock       │  │
│  │  Filtered to supplier's brand(s)               │  │
│  └────────────────────────────────────────────────-┘  │
│                                                      │
│  ┌─ Submit Proposal ─────────────────────────────-┐  │
│  │  Brand selector | Items list (add/remove)       │  │
│  │  Per item: description, SKU, qty, unit price    │  │
│  │  Notes textarea | Total display | Submit button │  │
│  └────────────────────────────────────────────────-┘  │
│                                                      │
│  ┌─ My Proposals ────────────────────────────────-┐  │
│  │  List: date | brand | total | status badge      │  │
│  │  StatusPill: pending (gray), accepted (green),  │  │
│  │  rejected (red)                                  │  │
│  └────────────────────────────────────────────────-┘  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Interaction with existing code — MUST NOT modify (except where noted):**
- `convex/schema.ts` — ADD `supplierProposals` table, ADD `assignedBrands` optional field to users, ADD `"supplier"` to role union (do NOT modify existing tables beyond these additions)
- `convex/_helpers/permissions.ts` — ADD `SUPPLIER_ROLES` constant (do NOT modify existing role arrays)
- `lib/constants.ts` — ADD `SUPPLIER` to ROLES object
- `lib/routes.ts` — UPDATE `ROLE_ROUTE_ACCESS["/supplier"]` and ADD supplier to `ROLE_DEFAULT_ROUTES`
- `convex/demand/summaries.ts` — do NOT modify (read-only data source for supplier queries)
- `convex/demand/entries.ts` — do NOT modify
- `convex/dashboards/demandIntelligence.ts` — do NOT modify (HQ-only queries)
- `app/hq/dashboard/page.tsx` — do NOT modify

### Project Structure

```
Files to MODIFY in this story:
├── convex/schema.ts                          # ADD supplierProposals table, ADD assignedBrands to users, ADD "supplier" to role union
├── convex/_helpers/permissions.ts            # ADD SUPPLIER_ROLES constant
├── lib/constants.ts                          # ADD SUPPLIER to ROLES
├── lib/routes.ts                             # UPDATE supplier route access + default route
├── app/supplier/layout.tsx                   # ADD supplier role guard (replace auth-only)
├── app/supplier/portal/page.tsx              # REPLACE placeholder with full supplier portal

Files to CREATE in this story:
├── convex/suppliers/portal.ts                # 7 functions: getSupplierDemandSummary, getSupplierBrandStockLevels, getSupplierDemandLogs, submitProposal, getMyProposals, getPendingProposals, reviewProposal

Files that MUST NOT be modified:
├── convex/_generated/api.d.ts                # Auto-generated
├── convex/demand/summaries.ts                # Read-only data source
├── convex/demand/entries.ts                  # Read-only data source
├── convex/dashboards/demandIntelligence.ts   # HQ-only dashboard queries
├── convex/ai/branchScoring.ts                # Separate AI module
├── convex/ai/restockSuggestions.ts           # Separate AI module
├── convex/crons.ts                           # No new crons needed
├── middleware.ts                             # Already handles /supplier prefix via routes.ts
```

### Previous Story Learnings (Story 9.4)

- **Bounded queries for growing tables**: Use `.take(N)` instead of unbounded `.collect()` for all cron and aggregation queries. For user-facing queries with known small result sets (weekly summaries), `.collect()` is acceptable with time-bounded index range.
- **Precise index range queries**: Use `.gte().lt()` for date ranges instead of `.gte()` + client-side filter when possible.
- **Client-side data merge pattern**: Fetch data from separate queries and merge client-side (by ID Map) to keep modules decoupled.
- **`v` naming conflict**: NEVER use `v` as a callback parameter name in Convex files.
- **`internalMutation` for system jobs, `mutation` for user actions**: Supplier proposal submission is user-facing → use `mutation` (not internalMutation).
- **`requireRole(ctx, ROLES_ARRAY)`**: Standard pattern for all protected queries/mutations.
- **PHT timezone handling**: Not needed for supplier portal (no date-specific scoring).
- **Idempotency**: Not needed for proposal submission (each submission is intentionally unique).
- **Code review feedback**: Always bound queries with `.take(N)` for tables that grow over time.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 9, Story 9.5 ACs (line 1044)]
- [Source: _bmad-output/planning-artifacts/architecture.md — FR61-62: supplier portal, convex/suppliers/portal.ts (line 562-564), app/(supplier)/ (line 672-675)]
- [Source: _bmad-output/planning-artifacts/prd.md — FR61: supplier demand signals (line 664), FR62: stock proposals (line 665), Journey 7: Mang Tony (lines 208-220)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Mang Tony persona (line 43), desktop-only (line 119), StatusPill component (lines 1108-1115)]
- [Source: convex/schema.ts — users table role union (lines 5-25), demandLogs (lines 219-229), demandWeeklySummaries (lines 231-243), brands (lines 49-55)]
- [Source: convex/demand/summaries.ts — generateWeeklySummary, getWeeklySummaries, getLatestWeekTopBrands patterns]
- [Source: convex/demand/entries.ts — listBranchDemandLogs (demand log query pattern)]
- [Source: convex/_helpers/permissions.ts — requireRole, HQ_ROLES, role group patterns (lines 24-30)]
- [Source: lib/constants.ts — ROLES object (lines 4-12)]
- [Source: lib/routes.ts — ROLE_ROUTE_ACCESS, ROLE_DEFAULT_ROUTES (lines 7-29)]
- [Source: app/supplier/layout.tsx — existing auth-only guard (lines 1-43)]
- [Source: app/supplier/portal/page.tsx — placeholder (lines 1-8)]
- [Source: _bmad-output/implementation-artifacts/9-4-branch-performance-scoring.md — bounded query learnings, code review fixes]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Type error during codegen: `roleValidator` in `convex/auth/users.ts` didn't include "supplier" — fixed by adding `v.literal("supplier")` to the validator. `VALID_ROLES` and `ValidRole` in permissions.ts also updated.

### Completion Notes List

- All 7 tasks completed per story ACs
- Supplier role added to: schema (users role union + assignedBrands field), constants, permissions (SUPPLIER_ROLES), routes (access + default)
- `supplierProposals` table added with 3 indexes (by_supplier, by_status, by_supplier_status)
- 7 backend functions in `convex/suppliers/portal.ts`:
  - Supplier: getSupplierDemandSummary, getSupplierBrandStockLevels, getSupplierDemandLogs, submitProposal, getMyProposals
  - HQ: getPendingProposals, reviewProposal
- Demand data sourced from existing `demandWeeklySummaries` + `demandLogs` (client-side brand filter on bounded queries)
- Stock levels resolved via brands → categories → styles → variants → inventory chain (corrected from story Dev Notes which assumed styles have brandId)
- Supplier layout upgraded from auth-only to role-guarded (supplier + admin)
- Portal page: 5-tab layout (Demand Summary, Stock Levels, Demand Logs, New Proposal, My Proposals)
- Desktop-optimized: wide tables, tab navigation, form grid layout
- Proposal form: dynamic item list with add/remove, brand selector, notes, auto-calculated total
- All queries bounded with `.take(N)` per 9-4 learnings
- Branch name caching via per-invocation Map (same pattern as 9-3/9-4)
- Also had to update `convex/auth/users.ts` roleValidator and `convex/_helpers/permissions.ts` ValidRole/VALID_ROLES to include "supplier" for type consistency
- Codegen, tsc (0 errors), lint (0 warnings) all pass

### File List

- convex/schema.ts (MODIFIED — added "supplier" to role union, assignedBrands to users, supplierProposals table)
- convex/_helpers/permissions.ts (MODIFIED — added "supplier" to VALID_ROLES/ValidRole, added SUPPLIER_ROLES)
- convex/auth/users.ts (MODIFIED — added "supplier" to roleValidator)
- convex/suppliers/portal.ts (CREATED — 7 functions: 5 supplier-facing + 2 HQ review)
- lib/constants.ts (MODIFIED — added SUPPLIER to ROLES)
- lib/routes.ts (MODIFIED — updated supplier route access + default route)
- app/supplier/layout.tsx (MODIFIED — replaced auth-only guard with supplier role guard)
- app/supplier/portal/page.tsx (MODIFIED — replaced placeholder with full supplier portal)

### Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-03-01 | Story created (ready-for-dev) | Claude Opus 4.6 |
| 2026-03-02 | Implementation complete (all 7 tasks), moved to review | Claude Opus 4.6 |
| 2026-03-02 | Code review: 1 HIGH, 4 MEDIUM, 2 LOW found — all HIGH/MEDIUM fixed, moved to done | Claude Opus 4.6 |

## Senior Developer Review

### Review Summary

**Reviewer:** Claude Opus 4.6
**Date:** 2026-03-02
**Outcome:** Approved (after fixes)

### Findings (7 total: 1 HIGH, 4 MEDIUM, 2 LOW)

| # | Severity | Description | Status |
|---|----------|-------------|--------|
| H1 | HIGH | `setUserRole` action inline validator missing `v.literal("supplier")` — admins can't assign supplier role | FIXED |
| M1 | MEDIUM | Brand list in ProposalForm derived from demand data instead of `assignedBrands` — empty if no demand data | FIXED |
| M2 | MEDIUM | `submitProposal` missing backend validation for quantity >= 1 and unitPriceCentavos >= 0 | FIXED |
| M3 | MEDIUM | `getSupplierBrandStockLevels` has no result cap — could return thousands of rows | FIXED (capped at 500) |
| M4 | MEDIUM | Stock levels table renders all rows without pagination | FIXED (50-row pagination with "Show more") |
| L1 | LOW | `relativeDate` function name misleading (formats absolute date) | ACCEPTED |
| L2 | LOW | Proposal form unit price input uses raw centavos (UX friction) | ACCEPTED |

### Fixes Applied

1. **H1:** Replaced inline 7-value role union in `setUserRole` action with shared `roleValidator` (convex/auth/users.ts)
2. **M1:** Added `getCurrentUser` query, use `currentUser.assignedBrands` for brand list (app/supplier/portal/page.tsx)
3. **M2:** Added item-level validation loop for quantity >= 1 and price >= 0 (convex/suppliers/portal.ts)
4. **M3:** Added `if (results.length >= 500) break` to both inventory and branch loops (convex/suppliers/portal.ts)
5. **M4:** Added `stockRowsShown` state with 50-row increments and "Show more" button (app/supplier/portal/page.tsx)

### Verification

- `npx convex codegen` — PASS
- `npx tsc --noEmit` — 0 errors
- `npx next lint` — 0 warnings/errors

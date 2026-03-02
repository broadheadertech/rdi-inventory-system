# Story 7.4: Demand Logging at POS

Status: done

## Story

As a Cashier or Branch Manager,
I want to quickly log what customers are asking for that we don't have,
so that HQ can understand demand patterns and make smarter stocking decisions.

## Acceptance Criteria

1. **Given** a Cashier or Manager at the POS or branch interface
   **When** they open the demand log quick-entry
   **Then** a visual quick-tap brand selector shows most-used brands pre-loaded

2. **And** they can select category/design (optional), size (optional), and add optional notes

3. **And** the entire demand log entry completes in <30 seconds (tap-first UI, minimal required fields)

4. **And** the entry records: brand requested, design (optional), size (optional), timestamp, branch, and staff who logged it

5. **And** the `demandLogs` table stores the entry with all metadata

6. **And** the UI uses tap/chip selectors — not free-text fields — for brand and size selection (speed-first design)

## Tasks / Subtasks

- [x] Task 1: Create `convex/demand/entries.ts` with mutation and queries (AC: 4, 5)
  - [x] 1.1 Import `withBranchScope` from `../_helpers/withBranchScope` and `_logAuditEntry` from `../_helpers/auditLog`; import `requireRole, POS_ROLES` from `../_helpers/permissions`
  - [x] 1.2 Implement `createDemandLog` mutation: args `{ brand: v.string(), design: v.optional(v.string()), size: v.optional(v.string()), notes: v.optional(v.string()) }` — call `requireRole(ctx, POS_ROLES)`, call `withBranchScope(ctx)` for `{ userId, branchId }`, guard no-branch case, insert into `demandLogs` with `createdAt: Date.now()`, call `_logAuditEntry` with `action: "demand.log.create"`, return new doc ID
  - [x] 1.3 Implement `listBranchDemandLogs` query: args `{ limit: v.optional(v.number()) }` — call `withBranchScope(ctx)`, guard no-branch, query demandLogs `.withIndex("by_branch", q => q.eq("branchId", branchId))`, order descending, take `limit ?? 20`, batch-fetch user names via Promise.all, return enriched array with `loggedByName`
  - [x] 1.4 Implement `listBrandsForSelector` query: args `{}` — call `withBranchScope(ctx)` (accessible to any authenticated branch user), query `brands` table, filter `isActive: true`, return `{ id: string, name: string }[]` sorted alphabetically

- [x] Task 2: Create `app/pos/demand/page.tsx` — POS Cashier Quick-Entry UI (AC: 1, 2, 3, 4, 6)
  - [x] 2.1 Add `"use client"` directive; import `useState` from React; import `useQuery, useMutation` from `convex/react`; import `api` from `@/convex/_generated/api`
  - [x] 2.2 Load brands via `useQuery(api.demand.entries.listBrandsForSelector)` and render brand chip grid — each chip is a button `min-h-[44px] min-w-[44px]`; selected chip highlighted with `bg-primary text-primary-foreground`; tap again to deselect
  - [x] 2.3 Render size selector chips: pre-defined sizes `["XS", "S", "M", "L", "XL", "XXL", "26", "28", "30", "32", "34", "36"]` — same 44px chip style; allow deselect by tapping again
  - [x] 2.4 Render optional design/style text input (single short text line, max 60 chars)
  - [x] 2.5 Render optional notes textarea (2 rows max, optional)
  - [x] 2.6 Render prominent "Log Demand" submit button — disabled if no brand selected; calls `useMutation(api.demand.entries.createDemandLog)`, on success reset all state and show `toast.success("Demand logged")` via `sonner`
  - [x] 2.7 Handle loading and error states (mutation pending: show "Logging…"; error: `toast.error("Failed to log demand")`)
  - [x] 2.8 Read `app/pos/layout.tsx` (no sidebar nav — complex layout); added "Log Demand" text link to layout header bar alongside ConnectionIndicator

- [x] Task 3: Create `app/branch/demand/page.tsx` — Branch Manager Demand Log UI (AC: 1, 2, 3, 4, 6)
  - [x] 3.1 Read `app/branch/layout.tsx` — confirmed `/branch/demand` nav link with `TrendingUp` icon ALREADY EXISTS in `navItems`; no layout change required
  - [x] 3.2 Brand chip selector (slightly relaxed touch targets vs strict 44px POS requirement; standard `py-1.5` buttons)
  - [x] 3.3 Size selector chips and optional fields (same pattern as POS)
  - [x] 3.4 Submit button with `useMutation(api.demand.entries.createDemandLog)`, success/error handling via `sonner`
  - [x] 3.5 **Below the entry form**: compact recent-entries list via `useQuery(api.demand.entries.listBranchDemandLogs, { limit: 20 })` — columns: Brand, Design, Size, By (loggedByName), Time (relative); animate-pulse skeleton while loading
  - [x] 3.6 Branch layout already has `/branch/demand` nav link — no change needed

- [x] Task 4: Run `npx convex codegen` after creating `convex/demand/entries.ts` → verify codegen succeeds ✅
- [x] Task 5: Validate TypeScript — `npx tsc --noEmit` → 0 errors ✅
- [x] Task 6: Validate linting — `npx next lint` → 0 warnings ✅
- [x] Task 7: Update this story Status to "review" and sprint-status.yaml to "review"

## Dev Notes

### Schema (Already Defined — DO NOT Modify `convex/schema.ts`)

The `demandLogs` table is already present in `convex/schema.ts` (lines 206-216):

```typescript
demandLogs: defineTable({
  branchId: v.id("branches"),
  loggedById: v.id("users"),
  brand: v.string(),            // brand NAME string, NOT brandId reference
  design: v.optional(v.string()),
  size: v.optional(v.string()),
  notes: v.optional(v.string()),
  createdAt: v.number(),
})
  .index("by_branch", ["branchId"])
  .index("by_date", ["createdAt"]),
```

**CRITICAL:** `brand` is a `v.string()` (the brand name), NOT `v.id("brands")`. The architecture doc mentions ID references, but the actual schema uses strings. Load the brands catalog for the UI picker, but store the selected brand's **name string** in the log entry.

### Module Placement

- `convex/demand/entries.ts` — NEW file; follows the same folder-per-feature pattern as `convex/pos/`, `convex/catalog/`, `convex/inventory/`
- `app/pos/demand/page.tsx` — NEW route under existing POS layout (route is `app/pos/`, NOT `app/(pos)/`)
- `app/branch/demand/page.tsx` — NEW route under existing branch layout (route is `app/branch/`, NOT `app/(branch)/`)

### Auth & Branch Isolation Pattern

Use `withBranchScope` to get the current user's branchId AND `requireRole` for role checking:

```typescript
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { withBranchScope } from "../_helpers/withBranchScope";
import { requireRole, POS_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

export const createDemandLog = mutation({
  args: {
    brand: v.string(),
    design: v.optional(v.string()),
    size: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, POS_ROLES); // ["admin", "manager", "cashier"]
    const { userId, branchId } = await withBranchScope(ctx);

    const newId = await ctx.db.insert("demandLogs", {
      branchId,
      loggedById: userId,
      brand: args.brand,
      design: args.design,
      size: args.size,
      notes: args.notes,
      createdAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "demand.log.create",
      userId,
      branchId,
      entityType: "demandLogs",
      entityId: newId as string,
      after: { brand: args.brand, design: args.design, size: args.size },
    });

    return newId;
  },
});
```

**`withBranchScope` returns:**
- `{ user, userId, branchId, canAccessAllBranches }`
- Throws UNAUTHORIZED if not authenticated; throws if non-HQ user has no branch assigned
- [Source: `convex/_helpers/withBranchScope.ts`]

**`requireRole` signature:**
- `requireRole(ctx, roles: string[])` — throws UNAUTHORIZED if user role not in array
- [Source: `convex/_helpers/permissions.ts`]

**Role groups to use:**
- `POS_ROLES = ["admin", "manager", "cashier"]` — for POS demand page mutations
- `BRANCH_MANAGEMENT_ROLES = ["admin", "manager"]` — for branch demand page mutations
- Both groups are exported from `convex/_helpers/permissions.ts`

### Audit Trail Pattern

```typescript
import { _logAuditEntry } from "../_helpers/auditLog";

await _logAuditEntry(ctx, {
  action: "demand.log.create",  // dot-notation action name
  userId,
  branchId,
  entityType: "demandLogs",
  entityId: newId as string,
  after: { brand, design, size, notes },
});
```
[Source: `convex/_helpers/auditLog.ts` — `_logAuditEntry` function signature]

### Brands Selector — Load from Catalog

`catalog/brands.listBrands` uses `HQ_ROLES` — cannot be called from cashier/manager context.
Created `demand.entries.listBrandsForSelector` in `convex/demand/entries.ts` using `withBranchScope` (accessible to all authenticated branch users). Returns active brands sorted alphabetically.

The brand chip renders the brand **name** and on selection stores `brand.name` (string) to state — this is what gets saved to `demandLogs.brand`.

### POS Touch Target Requirement (NFR28)

The POS layout applies 44px minimum touch targets globally. Ensure all interactive elements meet this:

```tsx
// Brand chip button — must be at least 44×44px
<button
  key={brand.id}
  onClick={() => setSelectedBrand(brand.name)}
  className={`min-h-[44px] min-w-[44px] rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
    selectedBrand === brand.name
      ? "bg-primary text-primary-foreground"
      : "border bg-background hover:bg-muted"
  }`}
>
  {brand.name}
</button>
```

Size chips follow the same pattern. Wrap brand/size chip groups in a `flex flex-wrap gap-2` container.

### Sonner for Toast Notifications

`sonner` is the installed toast library (shadcn/ui dependency). Pattern:

```tsx
import { toast } from "sonner";

// On success:
toast.success("Demand logged");

// On error:
toast.error("Failed to log demand");
```

Use `sonner` — do NOT use any other toast library.

### No Card Component

shadcn/ui `card` component is NOT installed. Use div-based markup:
```tsx
<div className="rounded-lg border p-4 space-y-4">
  <h2 className="text-sm font-semibold">...</h2>
</div>
```
[Source: Story 7.3 D1 — card component not installed; use `rounded-lg border p-4` pattern]

### Always Run Codegen After New Convex Files

After creating `convex/demand/entries.ts`, run:
```bash
npx convex codegen
```
This regenerates `convex/_generated/api.ts` so TypeScript can resolve `api.demand.entries.*`.
[Source: Story 7.3 D2 — codegen required before `tsc --noEmit`]

### `by_branch` Index Query Pattern

```typescript
// Query demand logs for current branch, most-recent-first
const logs = await ctx.db
  .query("demandLogs")
  .withIndex("by_branch", (q) => q.eq("branchId", branchId))
  .order("desc")
  .take(limit ?? 50);
```

No composite `by_branch_date` index exists (unlike `transactions.by_branch_date`). For date-range filtering in story 7.4, filter in-memory after fetching by branch (bounded by branch demand volume). Story 7.5's HQ aggregation will use `by_date` index differently.

### Relative Time Display

For the recent-entries list in `app/branch/demand/page.tsx`, display `createdAt` as relative time. Use vanilla JS — no date-fns:

```typescript
function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
```

### Navigation Links

- **POS layout**: No sidebar nav — added a "Log Demand" text link to the header bar alongside `ConnectionIndicator`. Added `import Link from "next/link"` and changed `justify-end` div to `gap-4` with the link prepended.
- **Branch layout**: `/branch/demand` nav link with `TrendingUp` icon was ALREADY PRESENT in `navItems` — no change made.

### Previous Story Context (7.3)

Story 7.3 created `convex/dashboards/birReports.ts` with the `listActiveBranches` query as a reference for how HQ-scoped queries are structured. Story 7.4 uses branch-scoped patterns (via `withBranchScope`) rather than the HQ all-branch pattern.

### Testing Notes

No automated tests required (no testing framework configured). Manual verification:
- Log in as cashier → navigate to `/pos/demand` → verify brand chips load, tap to select, submit succeeds
- Log in as branch manager → navigate to `/branch/demand` → verify entry form + recent-entries list
- Verify `demandLogs` record in Convex dashboard has correct `branchId`, `loggedById`, `brand`, `createdAt`
- Verify `auditLogs` record created for each demand log entry
- TypeScript: `npx tsc --noEmit` → 0 errors
- Lint: `npx next lint` → 0 warnings/errors

### Project Structure Notes

- Route is `app/pos/` (NOT `app/(pos)/`) — confirmed by file structure exploration
- Route is `app/branch/` (NOT `app/(branch)/`) — confirmed by file structure exploration
- `convex/demand/` — created new; `entries.ts` is the first file
- `app/pos/demand/` — created new; demand log quick-entry for cashiers
- `app/branch/demand/` — created new; demand log entry + recent entries list for managers

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 7, Story 7.4]
- [Source: `convex/schema.ts` lines 206-216 — `demandLogs` table definition]
- [Source: `convex/_helpers/withBranchScope.ts` — `withBranchScope()` and `requireBranchScope()` signatures]
- [Source: `convex/_helpers/auditLog.ts` — `_logAuditEntry()` function signature]
- [Source: `convex/_helpers/permissions.ts` — `POS_ROLES`, `BRANCH_MANAGEMENT_ROLES`, `requireRole`]
- [Source: `convex/catalog/brands.ts` — `listBrands` uses HQ_ROLES; created `listBrandsForSelector` in demand module instead]
- [Source: `app/pos/layout.tsx` — no sidebar nav; added Link to header bar]
- [Source: `app/branch/layout.tsx` — `/branch/demand` nav link already present with TrendingUp icon]
- [Source: Story 7.3 Dev Notes — D1 no card component, D2 codegen pattern, D3 requireRole import location]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

**D1 — `catalog/brands.listBrands` is HQ_ROLES only — cannot be reused from POS/branch context**
- Discovered: `convex/catalog/brands.ts` — `listBrands` calls `requireRole(ctx, HQ_ROLES)` (admin/hqStaff only)
- Fix: Created `listBrandsForSelector` in `convex/demand/entries.ts` using `withBranchScope(ctx)` — accessible to cashiers and managers
- Pattern: Check role guards in catalog queries before reusing from non-HQ contexts

**D2 — Branch layout `/branch/demand` nav link already exists**
- Discovered: `app/branch/layout.tsx` has `navItems` array with `{ href: "/branch/demand", label: "Demand", icon: TrendingUp }` already present
- No layout change was needed for task 3.6

**D3 — POS layout has no sidebar nav — added link to header bar**
- POS layout renders a full-screen `theme-pos` div with just a header `<div className="flex items-center justify-end px-4 py-1">` containing `ConnectionIndicator`
- Added `import Link from "next/link"` and a "Log Demand" text link to the left of ConnectionIndicator in that header bar

### Completion Notes List

- Created `convex/demand/entries.ts` with 3 queries/mutations:
  - `listBrandsForSelector` — `withBranchScope(ctx)` auth, fetches active brands sorted alphabetically; accessible to cashiers and managers (unlike catalog/brands.listBrands which is HQ-only)
  - `createDemandLog` — `requireRole(ctx, POS_ROLES)` + `withBranchScope(ctx)` auth; inserts demandLog with `branchId`, `loggedById`, `brand` (string name), `design?`, `size?`, `notes?`, `createdAt`; generates audit trail via `_logAuditEntry`; guards no-branchId case with `ConvexError`
  - `listBranchDemandLogs` — `withBranchScope(ctx)` auth; queries `by_branch` index, order desc, batch-fetches user names for `loggedByName` field in returned docs
- Created `app/pos/demand/page.tsx` — POS cashier demand log quick-entry
  - Brand chip grid (`min-h-[44px] min-w-[44px]`), size chip grid (same 44px targets), optional design text input (max 60 chars), optional notes textarea (2 rows), "Log Demand" submit button
  - Tap-first design: only brand is required; all other fields optional; <30 second entry path
  - `toast.success/error` via sonner; reset state on success; "← Back to POS" link
- Modified `app/pos/layout.tsx` — added `import Link from "next/link"` and "Log Demand" link to header bar alongside ConnectionIndicator
- Created `app/branch/demand/page.tsx` — branch manager demand log
  - Entry form (same structure as POS, slightly relaxed touch targets)
  - Recent-entries table: Brand, Design, Size, By (loggedByName), Time (relative); animate-pulse skeleton; relative time via vanilla JS helper
  - Branch layout `/branch/demand` nav link already present — no layout change needed
- `npx convex codegen` ✅
- `npx tsc --noEmit` → 0 errors ✅
- `npx next lint` → 0 warnings ✅

### File List

- `convex/demand/entries.ts` — NEW: 3 demand log queries/mutations (listBrandsForSelector, createDemandLog, listBranchDemandLogs)
- `app/pos/demand/page.tsx` — NEW: POS cashier demand log quick-entry UI
- `app/branch/demand/page.tsx` — NEW: Branch manager demand log entry + recent entries list
- `app/pos/layout.tsx` — MODIFIED: added Link import + "Log Demand" nav link to header bar

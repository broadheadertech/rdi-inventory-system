# Story 5.3: Low-Stock Alerts & Threshold Configuration

Status: done

## Story

As a **Branch Manager or HQ Staff**,
I want to set low-stock thresholds and receive alerts when inventory runs low,
so that I can reorder or request transfers before products run out.

## Acceptance Criteria

1. **Given** a manager or admin viewing `/branch/stock`
   **When** they look at the stock table
   **Then** each row displays the current `lowStockThreshold` value in a dedicated column
   **And** managers and admins see an inline edit control (pencil icon on row hover)
   **And** clicking edit shows an inline number input; saving calls `setInventoryThreshold`
   **And** the mutation validates threshold is a non-negative whole number and persists to `inventory.lowStockThreshold`

2. **Given** a POS cashier completes a transaction via `createTransaction`
   **When** the inventory decrement loop finishes patching each inventory row
   **Then** `checkInventoryAlert` is scheduled via `ctx.scheduler.runAfter(0, ...)` for each decremented item
   **And** a new `lowStockAlerts` record with `status: "active"` is created if `quantity ≤ threshold` and no active alert already exists for that `(branchId, variantId)` pair
   **And** existing active alerts are auto-resolved (`status: "resolved"`) if quantity recovered above threshold

3. **Given** the hourly cron `sweepLowStock` runs
   **When** it checks all inventory rows
   **Then** new active alerts are created for any row with `quantity ≤ threshold` and no existing active alert
   **And** existing active alerts are resolved when stock has recovered above threshold
   **And** this sweep acts as a fallback for stock changes not triggered by POS transactions

4. **Given** active low-stock alerts exist for a branch
   **When** any branch staff member navigates to `/branch/stock`
   **Then** an amber alerts panel appears above the filters showing each alert: style name, size, color, current quantity, threshold
   **And** managers and admins see a "Dismiss" button per alert
   **And** dismissing calls `dismissLowStockAlert` and removes the alert from the panel immediately

5. **Given** an HQ Staff or Admin user views `/hq/dashboard`
   **When** the page loads
   **Then** all active low-stock alerts across ALL branches are displayed
   **And** each alert shows: branch name, style name, size, color, current quantity, threshold
   **And** admins see a "Dismiss" button; hqStaff can view only
   **And** an empty state is shown when there are no active alerts

## Tasks / Subtasks

- [x] Task 1: Add `lowStockAlerts` table to `convex/schema.ts` (AC: #2, #3, #4, #5)
  - [x] 1.1 Open `convex/schema.ts`. Add `lowStockAlerts` table AFTER the `inventory` table block. Fields: `branchId: v.id("branches")`, `variantId: v.id("variants")`, `quantity: v.number()` (quantity when alert was last updated), `threshold: v.number()` (threshold at time of alert), `status: v.union(v.literal("active"), v.literal("dismissed"), v.literal("resolved"))`, `createdAt: v.number()`, `updatedAt: v.number()`, `dismissedBy: v.optional(v.id("users"))`.
  - [x] 1.2 Add indexes: `.index("by_branch", ["branchId"])`, `.index("by_branch_status", ["branchId", "status"])`, `.index("by_variant", ["variantId"])`, `.index("by_branch_variant", ["branchId", "variantId"])`. The `by_branch_variant` index is critical for deduplication — used to check if an active alert already exists before inserting a new one.

- [x] Task 2: Create `convex/inventory/alerts.ts` — all alert functions (AC: #1, #2, #3, #4, #5)
  - [x] 2.1 Create `convex/inventory/alerts.ts`. Imports: `{ query, mutation, internalMutation }` from `"../_generated/server"`, `{ v, ConvexError }` from `"convex/values"`, `{ withBranchScope }` from `"../_helpers/withBranchScope"`, `{ BRANCH_MANAGEMENT_ROLES, HQ_ROLES }` from `"../_helpers/permissions"`. Do NOT import `v` as a callback variable name.
  - [x] 2.2 Export `getLowStockAlerts` query (public). Auth: `await withBranchScope(ctx)`. If `scope.branchId === null` (HQ/admin): query without branch filter using `.filter((q) => q.eq(q.field("status"), "active")).collect()`. If `scope.branchId` is set: use `by_branch_status` index `.withIndex("by_branch_status", (q) => q.eq("branchId", scope.branchId!).eq("status", "active")).collect()`. For EACH alert, resolve: `const branch = await ctx.db.get(alertRow.branchId)`, `const variant = await ctx.db.get(alertRow.variantId)`, then `const style = variant ? await ctx.db.get(variant.styleId) : null`. Filter out results where branch is null or `!branch.isActive`. Return enriched objects: `{ alertId: alertRow._id, branchId: alertRow.branchId, branchName: branch.name, variantId: alertRow.variantId, styleName: style?.name ?? "Unknown", size: variant?.size ?? "", color: variant?.color ?? "", sku: variant?.sku ?? "", quantity: alertRow.quantity, threshold: alertRow.threshold, createdAt: alertRow.createdAt }` sorted by `createdAt` descending.
  - [x] 2.3 Export `setInventoryThreshold` mutation (public). Args: `{ inventoryId: v.id("inventory"), threshold: v.number() }`. Auth: `await withBranchScope(ctx)`. Role check: `const isHQ = (HQ_ROLES as readonly string[]).includes(scope.user.role)`, `const isBranchManager = (BRANCH_MANAGEMENT_ROLES as readonly string[]).includes(scope.user.role)`. If `!isHQ && !isBranchManager` throw `new ConvexError({ code: "UNAUTHORIZED" })`. Validate: `if (!Number.isInteger(args.threshold) || args.threshold < 0) throw new ConvexError("Threshold must be a non-negative whole number")`. Get inventory row: `const inv = await ctx.db.get(args.inventoryId)`. If null throw NOT_FOUND. If `!isHQ && scope.branchId !== inv.branchId` throw UNAUTHORIZED. Patch: `ctx.db.patch(args.inventoryId, { lowStockThreshold: args.threshold, updatedAt: Date.now() })`. Then schedule check: use the inline alert check logic directly (see 2.5 implementation — copy the logic rather than scheduling, since we're already in a mutation).
  - [x] 2.4 Export `dismissLowStockAlert` mutation (public). Args: `{ alertId: v.id("lowStockAlerts") }`. Auth: `await withBranchScope(ctx)`. Same role check as 2.3 (BRANCH_MANAGEMENT_ROLES or HQ_ROLES). Get alert: `const alertDoc = await ctx.db.get(args.alertId)`. If null throw NOT_FOUND. If `!isHQ && scope.branchId !== alertDoc.branchId` throw UNAUTHORIZED. Patch: `ctx.db.patch(args.alertId, { status: "dismissed", updatedAt: Date.now(), dismissedBy: scope.userId })`.
  - [x] 2.5 Export `checkInventoryAlert` as `internalMutation`. Args: `{ inventoryId: v.id("inventory") }`. No auth (server-internal only). Handler: get the inventory row (return early if null). Compute: `const threshold = invRow.lowStockThreshold ?? 5`. Query existing active alert: `.query("lowStockAlerts").withIndex("by_branch_variant", (q) => q.eq("branchId", invRow.branchId).eq("variantId", invRow.variantId)).filter((q) => q.eq(q.field("status"), "active")).first()`. If `invRow.quantity <= threshold`: no existing alert → `ctx.db.insert("lowStockAlerts", { branchId: invRow.branchId, variantId: invRow.variantId, quantity: invRow.quantity, threshold, status: "active", createdAt: Date.now(), updatedAt: Date.now() })`; existing alert and quantity changed → `ctx.db.patch(existing._id, { quantity: invRow.quantity, updatedAt: Date.now() })`. If `invRow.quantity > threshold` AND existing active alert → `ctx.db.patch(existing._id, { status: "resolved", updatedAt: Date.now() })`.
  - [x] 2.6 Export `sweepLowStock` as `internalMutation`. Args: none. Handler: `const allInventory = await ctx.db.query("inventory").collect()`. Then iterate: `for (const invRow of allInventory)` — apply the SAME logic as in 2.5 inline (copy the check-and-create/resolve logic directly). Do NOT use `ctx.scheduler.runAfter` inside the sweep — keep it as a single sequential mutation to avoid N scheduled function overhead.

- [x] Task 3: Create `convex/crons.ts` — register hourly low-stock sweep (AC: #3)
  - [x] 3.1 Create `convex/crons.ts`. Import: `{ cronJobs }` from `"convex/server"`, `{ internal }` from `"./_generated/api"`. Body: `const crons = cronJobs()`. Register: `crons.interval("low-stock-sweep", { hours: 1 }, internal.inventory.alerts.sweepLowStock)`. Export: `export default crons`. Convex auto-discovers this file — no additional registration needed.

- [x] Task 4: Update `convex/_generated/api.d.ts` — add inventory/alerts module (AC: #1, #2, #3, #4, #5)
  - [x] 4.1 Add import (after `inventory_stockLevels`, alphabetically): `import type * as inventory_alerts from "../inventory/alerts.js";`
  - [x] 4.2 Add to `ApiFromModules` object (after `"inventory/stockLevels"` entry): `"inventory/alerts": typeof inventory_alerts;`
  - [x] 4.3 This single entry covers BOTH public functions (`api.inventory.alerts.*`) AND internal functions (`internal.inventory.alerts.*`) because both `api` and `internal` are derived from `fullApi` via `FilterApi`. No separate `internal` patch is needed.

- [x] Task 5: Modify `convex/pos/transactions.ts` — schedule alert check after inventory decrement (AC: #2)
  - [x] 5.1 Add import at top of `convex/pos/transactions.ts` (after existing imports): `import { internal } from "../_generated/api";`
  - [x] 5.2 Locate the inventory decrement loop (lines ~206-212): `for (const vi of validatedItems) { await ctx.db.patch(vi.inventoryId, { quantity: vi.inventoryQuantity - vi.quantity, updatedAt: Date.now() }); }`. Add scheduler call INSIDE the loop, AFTER the `ctx.db.patch` call: `await ctx.scheduler.runAfter(0, internal.inventory.alerts.checkInventoryAlert, { inventoryId: vi.inventoryId });`
  - [x] 5.3 Do NOT modify any other part of `transactions.ts`. The `runAfter(0, ...)` is non-blocking — it does not slow down POS checkout since it schedules a separate transaction.

- [x] Task 6: Update `app/branch/stock/page.tsx` — alerts panel + threshold editing (AC: #1, #4)
  - [x] 6.1 Add to imports: `useMutation` from `"convex/react"` (alongside existing `useQuery`), `Bell` and `Pencil` from `"lucide-react"` (alongside existing icon imports). Add new queries/mutations: `const alerts = useQuery(api.inventory.alerts.getLowStockAlerts)`, `const setThreshold = useMutation(api.inventory.alerts.setInventoryThreshold)`, `const dismissAlert = useMutation(api.inventory.alerts.dismissLowStockAlert)`.
  - [x] 6.2 Add state below existing state declarations: `const [editingInventoryId, setEditingInventoryId] = useState<string | null>(null)`, `const [thresholdInput, setThresholdInput] = useState("")`, `const [thresholdError, setThresholdError] = useState<string | null>(null)`. Add `isManager` flag (reusing existing `currentUser` query): `const isManager = currentUser?.role === "admin" || currentUser?.role === "manager"`.
  - [x] 6.3 Insert alerts panel ABOVE the existing `{/* Controls */}` section. Render only when `alerts !== undefined && alerts.length > 0`:
    ```tsx
    {alerts !== undefined && alerts.length > 0 && (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 space-y-2">
        <p className="text-sm font-medium text-amber-800 flex items-center gap-1.5">
          <Bell className="h-4 w-4" />
          {alerts.length} Low Stock Alert{alerts.length !== 1 ? "s" : ""}
        </p>
        <ul className="space-y-1">
          {alerts.map((alert) => (
            <li key={alert.alertId} className="flex items-center justify-between text-sm text-amber-700">
              <span>{alert.styleName} — {alert.size} {alert.color}: {alert.quantity} remaining (threshold: {alert.threshold})</span>
              {isManager && (
                <button type="button" onClick={() => void dismissAlert({ alertId: alert.alertId })}
                  className="ml-4 text-xs underline hover:no-underline shrink-0">
                  Dismiss
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    )}
    ```
  - [x] 6.4 Add "Threshold" column header to the stock table `<thead>` row BETWEEN the "Status" and "Last Updated" `<th>` elements.
  - [x] 6.5 In each stock row `<tr>`, add `group` class to enable hover reveal of the pencil icon: change `className={cn("border-b hover:bg-muted/30", ...)}` to `className={cn("border-b group hover:bg-muted/30", ...)}`. Add a new `<td>` for threshold between the Status and Last Updated cells:
    ```tsx
    <td className="px-4 py-3">
      {isManager && editingInventoryId === item.inventoryId ? (
        <span className="flex items-center gap-1">
          <input
            type="number" min="0" value={thresholdInput}
            onChange={(e) => { setThresholdInput(e.target.value); setThresholdError(null); }}
            className="w-16 rounded border px-1 py-0.5 text-sm"
          />
          <button type="button" className="text-xs text-primary" onClick={async () => {
            const val = parseInt(thresholdInput, 10);
            if (isNaN(val) || val < 0) { setThresholdError("Must be ≥ 0"); return; }
            await setThreshold({ inventoryId: item.inventoryId as Id<"inventory">, threshold: val });
            setEditingInventoryId(null);
          }}>✓</button>
          <button type="button" className="text-xs text-muted-foreground" onClick={() => setEditingInventoryId(null)}>✕</button>
          {thresholdError && <span className="text-xs text-destructive">{thresholdError}</span>}
        </span>
      ) : (
        <span className="flex items-center gap-1">
          {item.lowStockThreshold}
          {isManager && (
            <button type="button" className="opacity-0 group-hover:opacity-100 text-muted-foreground"
              onClick={() => { setEditingInventoryId(item.inventoryId); setThresholdInput(String(item.lowStockThreshold)); setThresholdError(null); }}>
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </span>
      )}
    </td>
    ```
  - [x] 6.6 Update the `<colSpan>` on empty/loading state rows from `9` to `10` (now 10 columns with Threshold added).

- [x] Task 7: Update `app/hq/dashboard/page.tsx` — replace placeholder with all-branch alert view (AC: #5)
  - [x] 7.1 Add `"use client"` as the first line. Add imports: `{ useQuery, useMutation }` from `"convex/react"`, `{ api }` from `"@/convex/_generated/api"`. The HQ layout already enforces `ALLOWED_ROLES = ["admin", "hqStaff"]` — no additional auth needed in the page component.
  - [x] 7.2 Add queries/mutations: `const alerts = useQuery(api.inventory.alerts.getLowStockAlerts)`, `const currentUser = useQuery(api.auth.users.getCurrentUser)`, `const dismissAlert = useMutation(api.inventory.alerts.dismissLowStockAlert)`. The `getLowStockAlerts` query returns ALL branches' alerts for HQ users (`scope.branchId === null`). Only admins can dismiss from HQ: `const canDismiss = currentUser?.role === "admin"`.
  - [x] 7.3 Replace the placeholder body with:
    - Page header: `<h1 className="text-2xl font-bold tracking-tight">HQ Dashboard</h1>`, subtitle: `<p className="mt-1 text-sm text-muted-foreground">Multi-branch low-stock alerts</p>`
    - Loading state (`alerts === undefined`): 4 animate-pulse skeleton rows `<div className="h-10 animate-pulse rounded bg-muted" />`
    - Empty state (`alerts.length === 0`): green checkmark + "No active low-stock alerts across all branches"
    - Results: `<div className="rounded-md border overflow-x-auto">` with a table: headers = Branch | Style | Size | Color | Qty | Threshold | Actions. For each alert: one row. Actions cell shows "Dismiss" button if `canDismiss`.

- [x] Task 8: Integration verification (AC: all)
  - [x] 8.1 Run `npx tsc --noEmit` — must complete with **0 TypeScript errors**. Fix any errors before proceeding.
  - [x] 8.2 Run `npx next lint` — must complete with **0 warnings and 0 errors**. Fix any lint issues before proceeding.

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**New `lowStockAlerts` table — exact schema:**
```typescript
// Add to convex/schema.ts AFTER the inventory table block:
lowStockAlerts: defineTable({
  branchId: v.id("branches"),
  variantId: v.id("variants"),
  quantity: v.number(),           // quantity at time of last alert update
  threshold: v.number(),          // threshold at time of alert creation/update
  status: v.union(
    v.literal("active"),          // needs manager attention
    v.literal("dismissed"),       // manually cleared by manager
    v.literal("resolved"),        // auto-resolved when stock recovered above threshold
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
  dismissedBy: v.optional(v.id("users")),
})
  .index("by_branch", ["branchId"])
  .index("by_branch_status", ["branchId", "status"])
  .index("by_variant", ["variantId"])
  .index("by_branch_variant", ["branchId", "variantId"]),
```
The `by_branch_variant` compound index is critical for deduplication in `checkInventoryAlert`. The `by_branch_status` index efficiently fetches only active alerts for a branch.

**`internalMutation` — server-only, not accessible by client:**
```typescript
import { internalMutation } from "../_generated/server";

export const checkInventoryAlert = internalMutation({
  args: { inventoryId: v.id("inventory") },
  handler: async (ctx, args) => { ... },
});

export const sweepLowStock = internalMutation({
  args: {},
  handler: async (ctx) => { ... },
});
```
Client-side `useMutation(api.inventory.alerts.checkInventoryAlert)` would fail — these are internal only. Accessed server-side via `internal.inventory.alerts.checkInventoryAlert` in `ctx.scheduler.runAfter`.

**Single `api.d.ts` entry covers both `api.*` and `internal.*`:**
```typescript
// From the actual api.d.ts structure:
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
// Both filter from the SAME fullApi — adding one entry to ApiFromModules covers both.

// Patch needed (ONE entry only):
import type * as inventory_alerts from "../inventory/alerts.js";  // add to imports
"inventory/alerts": typeof inventory_alerts;  // add to ApiFromModules
```

**`ctx.scheduler.runAfter(0, ...)` from `createTransaction` — non-blocking:**
```typescript
// In convex/pos/transactions.ts, inside the decrement loop:
for (const vi of validatedItems) {
  await ctx.db.patch(vi.inventoryId, {
    quantity: vi.inventoryQuantity - vi.quantity,
    updatedAt: Date.now(),
  });
  // Non-blocking: runs in separate transaction AFTER current mutation commits
  await ctx.scheduler.runAfter(0, internal.inventory.alerts.checkInventoryAlert, {
    inventoryId: vi.inventoryId,
  });
}
```
`runAfter(0, ...)` does NOT slow down checkout — the alert check runs asynchronously in a separate Convex transaction after the current one commits. The `await` here resolves immediately (the scheduling itself is synchronous within the mutation context).

**`sweepLowStock` — inline logic, NOT recursive scheduling:**
```typescript
export const sweepLowStock = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allInventory = await ctx.db.query("inventory").collect();
    for (const invRow of allInventory) {
      // INLINE the checkInventoryAlert logic here — do NOT call ctx.scheduler
      // Scheduling N functions from a cron creates N separate DB transactions and can overload Convex
      const threshold = invRow.lowStockThreshold ?? 5;
      const existing = await ctx.db
        .query("lowStockAlerts")
        .withIndex("by_branch_variant", (q) =>
          q.eq("branchId", invRow.branchId).eq("variantId", invRow.variantId)
        )
        .filter((q) => q.eq(q.field("status"), "active"))
        .first();
      // ... create/update/resolve alert inline
    }
  },
});
```

**`setInventoryThreshold` — inline alert check after threshold change:**
After patching the threshold, check if the current quantity already violates the new threshold. Since we're already in a mutation, call the check logic inline (don't use `ctx.scheduler` here — just execute the logic directly):
```typescript
// After ctx.db.patch(args.inventoryId, { lowStockThreshold: ... }):
// Inline alert check for the new threshold
const updatedInv = await ctx.db.get(args.inventoryId);
if (updatedInv) {
  const threshold = args.threshold;
  const existing = await ctx.db.query("lowStockAlerts")
    .withIndex("by_branch_variant", (q) =>
      q.eq("branchId", updatedInv.branchId).eq("variantId", updatedInv.variantId)
    )
    .filter((q) => q.eq(q.field("status"), "active"))
    .first();
  if (updatedInv.quantity <= threshold && !existing) {
    await ctx.db.insert("lowStockAlerts", {
      branchId: updatedInv.branchId, variantId: updatedInv.variantId,
      quantity: updatedInv.quantity, threshold, status: "active",
      createdAt: Date.now(), updatedAt: Date.now(),
    });
  } else if (updatedInv.quantity > threshold && existing) {
    await ctx.db.patch(existing._id, { status: "resolved", updatedAt: Date.now() });
  }
}
```

**Branch vs HQ scope in `getLowStockAlerts`:**
```typescript
const scope = await withBranchScope(ctx);
if (scope.branchId === null) {
  // HQ/admin: all branches
  const allAlerts = await ctx.db.query("lowStockAlerts")
    .filter((q) => q.eq(q.field("status"), "active"))
    .collect();
  // resolve + filter inactive branches
} else {
  // Branch role: own branch only (indexed query)
  const branchAlerts = await ctx.db.query("lowStockAlerts")
    .withIndex("by_branch_status", (q) =>
      q.eq("branchId", scope.branchId!).eq("status", "active")
    )
    .collect();
  // resolve
}
```

**`isManager` — extend existing `currentUser` pattern in branch/stock page:**
```typescript
// Already in page.tsx from Story 5.1 code review fix M2:
const currentUser = useQuery(api.auth.users.getCurrentUser);
const isViewer = currentUser?.role === "viewer";
// Add alongside:
const isManager = currentUser?.role === "admin" || currentUser?.role === "manager";
```

**Threshold validation — both server and client:**
Server (in `setInventoryThreshold`):
```typescript
if (!Number.isInteger(args.threshold) || args.threshold < 0) {
  throw new ConvexError("Threshold must be a non-negative whole number");
}
```
Client (before calling mutation):
```typescript
const val = parseInt(thresholdInput, 10);
if (isNaN(val) || val < 0) { setThresholdError("Must be ≥ 0"); return; }
```

**`v` import conflict — CRITICAL:**
`alerts.ts` imports `{ v }` from `"convex/values"`. Never use `v` as a callback parameter name (e.g., `.filter((v) => ...)` or `.map((v) => ...)`). Use descriptive names: `invRow`, `alertRow`, `alertDoc`, `existing`.

**crons.ts — `interval` not `daily`:**
```typescript
// Correct — runs every hour:
crons.interval("low-stock-sweep", { hours: 1 }, internal.inventory.alerts.sweepLowStock);
// NOT: crons.daily("...") or crons.hourly("...") — use .interval()
```

**`String | null` branchId non-null assertion:**
When calling `scope.branchId!` in the query (for branch-scoped path), the non-null assertion is safe because you already established `scope.branchId !== null` in the if/else branch.

### Existing Code to Build Upon (DO NOT recreate)

**`getBranchStock` already returns `inventoryId` — use for `setInventoryThreshold`:**
```typescript
// From convex/inventory/stockLevels.ts getBranchStock return:
return {
  inventoryId: inv._id,        // ← use as setInventoryThreshold({ inventoryId: item.inventoryId })
  // ...
  lowStockThreshold: inv.lowStockThreshold ?? 5,  // ← shown in Threshold column
};
```

**`convex/pos/transactions.ts` — inventory decrement at lines ~206-212:**
```typescript
// 11. Decrement inventory
for (const vi of validatedItems) {
  await ctx.db.patch(vi.inventoryId, {
    quantity: vi.inventoryQuantity - vi.quantity,
    updatedAt: Date.now(),
  });
  // ADD scheduler call here (Task 5.2)
}
```

**`withBranchScope` returns `null` branchId for HQ roles — do NOT throw:**
Admin and hqStaff get `scope.branchId = null`. This is expected. The `getLowStockAlerts` query uses this to decide all-branch vs branch-scoped results. Do NOT add a `if (branchId === null) return []` guard in this query (unlike `getBranchStock` which had that guard for Story 5.1).

**`app/hq/dashboard/page.tsx` — current placeholder (lines 1-6):**
```typescript
export default function HqDashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">HQ Dashboard</h1>
      <p className="mt-2 text-muted-foreground">Coming in Epic 7</p>
    </div>
  );
}
```
Replace entirely. Must add `"use client"` as first line.

**`@/components/ui/skeleton` does NOT exist** — use `animate-pulse` divs:
```tsx
<div className="h-10 animate-pulse rounded bg-muted" />
```

### Project Structure

```
Files to CREATE in this story:
├── convex/
│   ├── inventory/
│   │   └── alerts.ts             # getLowStockAlerts (query), setInventoryThreshold (mutation),
│   │                              # dismissLowStockAlert (mutation), checkInventoryAlert (internalMutation),
│   │                              # sweepLowStock (internalMutation)
│   └── crons.ts                  # Hourly sweep registration

Files to MODIFY in this story:
├── convex/schema.ts               # Add lowStockAlerts table
├── convex/_generated/api.d.ts    # Add inventory_alerts module (1 import + 1 ApiFromModules entry)
├── convex/pos/transactions.ts    # Add internal import + ctx.scheduler.runAfter in decrement loop
├── app/branch/stock/page.tsx     # Add alerts panel, threshold column, inline edit UI
└── app/hq/dashboard/page.tsx     # Replace placeholder with multi-branch alert view

Files that MUST NOT be modified:
├── convex/inventory/stockLevels.ts      # Complete — returns inventoryId+lowStockThreshold already
├── convex/_helpers/permissions.ts       # Complete — use BRANCH_MANAGEMENT_ROLES, HQ_ROLES
├── convex/_helpers/withBranchScope.ts   # Complete — use as-is
├── components/inventory/StatusPill.tsx  # Complete — no changes needed
├── components/inventory/BranchStockDisplay.tsx  # Story 5.2 — not related to alerts
├── app/branch/layout.tsx               # Complete — ALLOWED_ROLES already correct
├── app/hq/layout.tsx                   # Complete — ALLOWED_ROLES = ["admin", "hqStaff"]
```

### Previous Story Learnings (5.1 + 5.2 + code reviews)

- **`v` import conflict**: Never use `v` as a callback variable name — use `invRow`, `alertRow`, `alertDoc`, `existing`.
- **`@/components/ui/skeleton` does not exist**: Use `animate-pulse` divs.
- **Manual `api.d.ts` patch needed**: One entry covers both `api.*` and `internal.*` due to `FilterApi` architecture.
- **`withBranchScope` null branchId for HQ is NOT an error**: Use it to branch logic (all-branches vs own-branch queries). Do not throw or return early for HQ users.
- **Filter inactive branches in resolve joins**: Always check `branch?.isActive` when joining branch names (from Story 5.2 review finding M1).
- **Server-side filter BEFORE expensive joins (M1 pattern from 5.1)**: Apply filters before loading brand/category/branch records.
- **`currentUser` query already in branch/stock page**: Just add `isManager` alongside existing `isViewer` — no new query.
- **`ErrorBoundary fallback={null}` for POS components**: If adding any interactive element to ProductCard context, wrap in ErrorBoundary.
- **tsc + lint zero-error policy**: Run AFTER every file change, not just at the end.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 5, Story 5.3 full ACs and user story]
- [Source: _bmad-output/planning-artifacts/architecture.md — FR28-29: convex/inventory/alerts.ts planned module]
- [Source: convex/schema.ts — inventory table + lowStockThreshold field + index patterns]
- [Source: convex/inventory/stockLevels.ts — getBranchStock returns inventoryId for threshold editing]
- [Source: convex/_helpers/permissions.ts — BRANCH_MANAGEMENT_ROLES, HQ_ROLES constants]
- [Source: convex/_helpers/withBranchScope.ts — auth pattern + null branchId for HQ]
- [Source: convex/pos/transactions.ts:206-212 — exact inventory decrement loop location]
- [Source: convex/_generated/api.d.ts — ApiFromModules + FilterApi structure for patch pattern]
- [Source: app/branch/stock/page.tsx — currentUser query, isViewer pattern, stock table structure]
- [Source: app/hq/dashboard/page.tsx — current placeholder to be replaced]
- [Source: app/hq/layout.tsx — ALLOWED_ROLES = ["admin", "hqStaff"]]
- [Source: _bmad-output/implementation-artifacts/5-1-real-time-branch-stock-view.md — animate-pulse pattern, isViewer skip pattern]
- [Source: _bmad-output/implementation-artifacts/5-2-cross-branch-stock-lookup.md — branch.isActive filter, api.d.ts patch, internalMutation pattern]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented `lowStockAlerts` table with 4 indexes including `by_branch_variant` for deduplication
- Created `convex/inventory/alerts.ts` with 5 functions: `getLowStockAlerts` (query), `setInventoryThreshold` (mutation), `dismissLowStockAlert` (mutation), `checkInventoryAlert` (internalMutation), `sweepLowStock` (internalMutation)
- Created `convex/crons.ts` with hourly `sweepLowStock` interval job
- Patched `convex/_generated/api.d.ts` — single `inventory/alerts` entry covers both `api.*` and `internal.*` via FilterApi architecture
- Modified `convex/pos/transactions.ts` — added `ctx.scheduler.runAfter(0, ...)` inside decrement loop (non-blocking)
- Updated `app/branch/stock/page.tsx` — amber alerts panel, Threshold column with group-hover inline edit for managers, colSpan updated from 9→10
- Replaced `app/hq/dashboard/page.tsx` placeholder with full multi-branch alert view (HQ sees all branches, only admins can dismiss)
- tsc: 0 errors | next lint: 0 warnings/errors ✅

### File List

**Created:**
- `convex/inventory/alerts.ts`
- `convex/crons.ts`

**Modified:**
- `convex/schema.ts`
- `convex/_generated/api.d.ts`
- `convex/pos/transactions.ts`
- `app/branch/stock/page.tsx`
- `app/hq/dashboard/page.tsx`

### Change Log

- 2026-02-28: Story 5.3 implemented — low-stock alerts table, alert functions, hourly cron, POS scheduler hook, branch stock UI (alerts panel + threshold editing), HQ dashboard (multi-branch alert view). All ACs satisfied. tsc + lint: clean.
- 2026-02-28: Code review (AI) — 3 MEDIUM + 2 LOW issues found and fixed: M1 dismissLowStockAlert status guard, M2 setInventoryThreshold threshold sync on existing alert, M3 threshold save error surfaced to UI, L1 getLowStockAlerts branch fetch deduped via Map cache, L2 HQ dashboard Actions column stabilised. tsc + lint: clean post-fix.

### Senior Developer Review (AI)

**Reviewer:** claude-sonnet-4-6 (adversarial code review)
**Review Date:** 2026-02-28
**Result:** PASSED after fixes

#### Issues Found and Fixed

| ID | Severity | File | Description | Fix Applied |
|----|----------|------|-------------|-------------|
| M1 | MEDIUM | `convex/inventory/alerts.ts:144` | `dismissLowStockAlert` had no `status === "active"` guard — could corrupt resolved/dismissed alerts | Added early-return guard: `if (alertDoc.status !== "active") return;` |
| M2 | MEDIUM | `convex/inventory/alerts.ts:106` | `setInventoryThreshold` missing case `qty <= threshold && existing` — existing alert's `threshold` field not updated | Replaced `if (!existing)` / `else if (qty > threshold)` with three-way check that patches `threshold` on existing alert |
| M3 | MEDIUM | `app/branch/stock/page.tsx:419` | `void setThreshold(...).then(...)` silently discarded mutation rejections — save failures invisible to user | Changed to `setThreshold(...).then(success, () => setThresholdError("Save failed — try again"))` |
| L1 | LOW | `convex/inventory/alerts.ts:36` | Branch-scoped queries fetched the same branch doc once per alert row (N reads for 1 unique branch) | Pre-fetch deduped with a `Map<Id<"branches">, ...>` cache — also benefits HQ multi-branch case |
| L2 | LOW | `app/hq/dashboard/page.tsx:66` | `canDismiss` toggled Actions `<th>` in/out as `currentUser` loaded — caused table layout shift | Actions column always rendered; dismiss button rendered conditionally inside the `<td>` |

#### Acceptance Criteria Validation

| AC | Status | Evidence |
|----|--------|---------|
| AC1: Threshold column + inline edit for managers | ✅ IMPLEMENTED | `app/branch/stock/page.tsx` lines 332-455 — Threshold `<th>`, `group` class on `<tr>`, pencil icon edit with save/cancel |
| AC2: `checkInventoryAlert` scheduled from `createTransaction` | ✅ IMPLEMENTED | `convex/pos/transactions.ts` — `ctx.scheduler.runAfter(0, internal.inventory.alerts.checkInventoryAlert, ...)` inside decrement loop |
| AC3: Hourly `sweepLowStock` cron | ✅ IMPLEMENTED | `convex/crons.ts` — `crons.interval("low-stock-sweep", { hours: 1 }, internal.inventory.alerts.sweepLowStock)` |
| AC4: Amber alerts panel at `/branch/stock` | ✅ IMPLEMENTED | `app/branch/stock/page.tsx` lines 182-208 — amber panel with dismiss for managers |
| AC5: Multi-branch alert table at `/hq/dashboard` | ✅ IMPLEMENTED | `app/hq/dashboard/page.tsx` — full table with Branch column, dismiss for admins only |

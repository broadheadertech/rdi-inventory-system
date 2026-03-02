# Story 6.1: Transfer Request & Approval

Status: done

## Story

As a **Branch Manager**,
I want to request stock transfers from another branch or warehouse and have HQ approve or reject them,
so that I can restock products that are running low at my location through an auditable approval workflow.

## Acceptance Criteria

1. **Given** an authenticated Manager or Admin user on `/branch/transfers`
   **When** they create a new transfer request
   **Then** they can select a source branch (fromBranch) and destination branch (toBranch), and add one or more line items (product variant + requested quantity)
   **And** the request is saved with status `"requested"` and a creation timestamp
   **And** the request appears in the HQ transfer approval queue immediately (real-time)
   **And** an audit log entry is created for the request action

2. **Given** an authenticated HQ Staff or Admin user on `/hq/transfers`
   **When** they view pending transfer requests (status = `"requested"`)
   **Then** they can approve a request → status changes to `"approved"` (warehouse can now pack)
   **Or** they can reject a request with a required rejection reason → status changes to `"rejected"`
   **And** the requesting branch immediately sees the updated status (real-time via Convex subscription)
   **And** an audit log entry is created for the approve/reject action

3. **Given** a Manager views `/branch/transfers`
   **When** a transfer they requested has been rejected
   **Then** the rejection reason is visible in the transfer row/detail

4. **Given** any active transfer exists
   **When** viewed in the UI
   **Then** a StatusPill shows the current status: Requested → Approved → Packed → In Transit → Delivered (or Rejected — terminal)
   **And** timestamps are shown for each completed stage

## Tasks / Subtasks

- [x] Task 1: Update `convex/schema.ts` — extend `transfers` table for approval workflow (AC: #1, #2, #3, #4)
  - [x] 1.1 Open `convex/schema.ts`. Locate the `transfers` defineTable block. Extend the `status` union by adding `v.literal("approved")` and `v.literal("rejected")` ALONGSIDE the existing four literals. The full updated union: `v.union(v.literal("requested"), v.literal("approved"), v.literal("rejected"), v.literal("packed"), v.literal("inTransit"), v.literal("delivered"))`.
  - [x] 1.2 Add optional approval/rejection fields to the `transfers` table (after `updatedAt`): `approvedById: v.optional(v.id("users"))`, `approvedAt: v.optional(v.number())`, `rejectedById: v.optional(v.id("users"))`, `rejectedAt: v.optional(v.number())`, `rejectedReason: v.optional(v.string())`.
  - [x] 1.3 No new indexes needed — `by_from_branch`, `by_to_branch`, `by_status` already exist in schema and cover all query patterns for this story.

- [x] Task 2: Patch `convex/_generated/api.d.ts` — add `transfers/requests` module (AC: all)
  - [x] 2.1 In `convex/_generated/api.d.ts`, add import ALPHABETICALLY near the other module imports (after `transfers` if it exists, or near `pos` alphabetically): `import type * as transfers_requests from "../transfers/requests.js";`
  - [x] 2.2 Add to the `ApiFromModules` object (one entry covers BOTH `api.*` and `internal.*` via FilterApi): `"transfers/requests": typeof transfers_requests;`
  - [x] 2.3 This is the same pattern used by all previous feature modules (inventory/alerts, inventory/stockLevels, pos/transactions, etc.). Do NOT add a second entry for `internal`.

- [x] Task 3: Create `convex/transfers/requests.ts` — all transfer request functions (AC: #1, #2, #3)
  - [x] 3.1 Create `convex/transfers/requests.ts`. Imports: `{ query, mutation }` from `"../_generated/server"`, `{ v, ConvexError }` from `"convex/values"`, `type { Id }` from `"../_generated/dataModel"`, `{ withBranchScope }` from `"../_helpers/withBranchScope"`, `{ HQ_ROLES, BRANCH_MANAGEMENT_ROLES }` from `"../_helpers/permissions"`, `{ _logAuditEntry }` from `"../_helpers/auditLog"`.
  - [x] 3.2 Export `createTransferRequest` mutation (public). Args: `{ fromBranchId: v.id("branches"), toBranchId: v.id("branches"), notes: v.optional(v.string()), items: v.array(v.object({ variantId: v.id("variants"), requestedQuantity: v.number() })) }`. Auth: `await withBranchScope(ctx)`. Role check: BRANCH_MANAGEMENT_ROLES or HQ_ROLES — throw UNAUTHORIZED otherwise. Validate: `args.items.length > 0` (throw if empty), each `requestedQuantity > 0`. Validate `fromBranchId !== toBranchId` (throw if same). Check both branches exist and are active. Insert `transfers` row with `status: "requested"`, `requestedById: scope.userId`, `createdAt: Date.now()`, `updatedAt: Date.now()`. For each item, insert `transferItems` row with `transferId: newTransferId`, `variantId`, `requestedQuantity`. Call `_logAuditEntry` with `action: "transfer.create"`, `userId: scope.userId`, `branchId: scope.branchId ?? args.toBranchId`, `entityType: "transfers"`, `entityId: newTransferId`. Return `newTransferId`.
  - [x] 3.3 Export `listTransfers` query (public). Args: `{ status: v.optional(v.string()) }`. Auth: `await withBranchScope(ctx)`. If `scope.branchId === null` (HQ/admin): query all transfers and filter status in memory. If `scope.branchId` set: query two indexed lists — `by_from_branch` for `fromBranchId = scope.branchId` AND `by_to_branch` for `toBranchId = scope.branchId` — merge and deduplicate, apply status filter in memory if provided. For each transfer, resolve branch names (`fromBranch.name`, `toBranch.name`), requestor name, approver/rejector name if present. Resolve `transferItems` for each transfer via `by_transfer` index. Resolve variant → style for each item. Return enriched array sorted by `createdAt` descending.
  - [x] 3.4 Export `approveTransfer` mutation (public). Args: `{ transferId: v.id("transfers") }`. Auth: `await withBranchScope(ctx)`. Role check: HQ_ROLES only — throw UNAUTHORIZED otherwise. Get transfer. Throw NOT_FOUND if missing. Throw INVALID_STATE ConvexError if `transfer.status !== "requested"` (only requested transfers can be approved). `ctx.db.patch(args.transferId, { status: "approved", approvedById: scope.userId, approvedAt: Date.now(), updatedAt: Date.now() })`. Call `_logAuditEntry` with `action: "transfer.approve"`. Return void.
  - [x] 3.5 Export `rejectTransfer` mutation (public). Args: `{ transferId: v.id("transfers"), reason: v.string() }`. Auth: `await withBranchScope(ctx)`. Role check: HQ_ROLES only. Validate `args.reason.trim().length > 0` — throw if empty (reason is required). Get transfer. Throw NOT_FOUND if missing. Throw INVALID_STATE if `transfer.status !== "requested"`. `ctx.db.patch(args.transferId, { status: "rejected", rejectedById: scope.userId, rejectedAt: Date.now(), rejectedReason: args.reason.trim(), updatedAt: Date.now() })`. Call `_logAuditEntry` with `action: "transfer.reject"`, `before: { status: "requested" }`, `after: { status: "rejected", reason: args.reason.trim() }`. Return void.

- [x] Task 4: Create `app/branch/transfers/page.tsx` — branch manager transfer view (AC: #1, #3, #4)
  - [x] 4.1 `"use client"` + all required imports.
  - [x] 4.2 `useQuery(api.transfers.requests.listTransfers, {})`, `useQuery(api.transfers.requests.listActiveBranches)`, `useMutation(api.transfers.requests.createTransferRequest)`.
  - [x] 4.3 Collapsible "New Transfer Request" form with source/dest branch dropdowns, notes textarea, line items (variantId + qty), add/remove item buttons. Submit validates, calls mutation, resets on success, shows error on failure using `.then(success, error)` pattern.
  - [x] 4.4 Transfers table: From Branch | To Branch | Status | Items | Requested At | Notes / Reason. animate-pulse skeleton (6 cols). Empty state colSpan=6. StatusBadge with color classes. Rejection reason shown inline when rejected.
  - [x] 4.5 colSpan=6 matches 6 thead columns.

- [x] Task 5: Create `app/hq/transfers/page.tsx` — HQ approval queue (AC: #2, #3)
  - [x] 5.1 `"use client"` + all required imports.
  - [x] 5.2 `useQuery` + `useMutation` for listTransfers, approveTransfer, rejectTransfer. `canApprove` derived from `currentUser?.role`.
  - [x] 5.3 Filter tabs: All | Pending | Approved | Rejected | Packed | In Transit | Delivered. Default = "requested".
  - [x] 5.4 Approve button calls `approve()`. Reject button toggles inline reason input; Confirm calls `reject()` with `.then(success, error)` pattern.
  - [x] 5.5 7-column table (From Branch | To Branch | Requested By | Status | Items | Requested At | Actions). Actions `<th>` always rendered. Empty `<td>` for non-pending rows.
  - [x] 5.6 animate-pulse skeleton (7 cols). Empty state per filter.

- [x] Task 6: Integration verification (AC: all)
  - [x] 6.1 `npx tsc --noEmit` — **0 TypeScript errors** ✓
  - [x] 6.2 `npx next lint` — **0 warnings and 0 errors** ✓

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**`transfers` schema — current state and what to ADD:**

```typescript
// EXISTING in convex/schema.ts (do NOT remove these fields):
transfers: defineTable({
  fromBranchId: v.id("branches"),
  toBranchId: v.id("branches"),
  requestedById: v.id("users"),
  status: v.union(
    v.literal("requested"),
    v.literal("packed"),
    v.literal("inTransit"),
    v.literal("delivered")
  ),
  notes: v.optional(v.string()),
  packedAt: v.optional(v.number()),
  shippedAt: v.optional(v.number()),
  deliveredAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_from_branch", ["fromBranchId"])
  .index("by_to_branch", ["toBranchId"])
  .index("by_status", ["status"]),

// CHANGE: extend status union to add "approved" and "rejected" BEFORE "packed":
status: v.union(
  v.literal("requested"),
  v.literal("approved"),   // ← ADD
  v.literal("rejected"),   // ← ADD
  v.literal("packed"),
  v.literal("inTransit"),
  v.literal("delivered")
),

// ADD these optional fields (after updatedAt):
approvedById: v.optional(v.id("users")),
approvedAt: v.optional(v.number()),
rejectedById: v.optional(v.id("users")),
rejectedAt: v.optional(v.number()),
rejectedReason: v.optional(v.string()),
```

```typescript
// EXISTING in convex/schema.ts (do NOT change):
transferItems: defineTable({
  transferId: v.id("transfers"),
  variantId: v.id("variants"),
  requestedQuantity: v.number(),
  packedQuantity: v.optional(v.number()),
  receivedQuantity: v.optional(v.number()),
  damageNotes: v.optional(v.string()),
}).index("by_transfer", ["transferId"]),
```

**Transfer status lifecycle for this story:**
```
requested → approved (by HQ) → [packed in Story 6.2] → inTransit → delivered
requested → rejected (by HQ, reason required) — terminal
```

**`convex/transfers/` directory — must create this new module directory.**
Architecture mandates: `convex/transfers/requests.ts` (this story), `convex/transfers/fulfillment.ts` (Story 6.2), `convex/transfers/audit.ts` (Story 6.3).

**Branch listing for source/destination selection:**
Check whether `api.admin.branches.listBranches` (or similar) exists before building the form. If not available via client API, create a simple `listActiveBranches` query in `convex/transfers/requests.ts`:
```typescript
export const listActiveBranches = query({
  args: {},
  handler: async (ctx) => {
    await withBranchScope(ctx); // auth check
    return await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});
```

**`listTransfers` — two-index merge for branch scope:**
Convex does NOT support OR queries on indexes. Branch-scoped managers need two separate indexed queries merged:
```typescript
// Branch-scoped: transfers WHERE fromBranch = ownBranch OR toBranch = ownBranch
const outgoing = await ctx.db
  .query("transfers")
  .withIndex("by_from_branch", (q) => q.eq("fromBranchId", scope.branchId!))
  .collect();
const incoming = await ctx.db
  .query("transfers")
  .withIndex("by_to_branch", (q) => q.eq("toBranchId", scope.branchId!))
  .collect();
// Deduplicate (if fromBranch === toBranch corner case):
const seen = new Set<string>();
const combined = [...outgoing, ...incoming].filter((t) => {
  if (seen.has(t._id)) return false;
  seen.add(t._id);
  return true;
});
```

**Enrichment pattern — join branch + user names:**
```typescript
// For each transfer, resolve branch and user names:
const fromBranch = await ctx.db.get(transfer.fromBranchId);
const toBranch = await ctx.db.get(transfer.toBranchId);
const requestor = await ctx.db.get(transfer.requestedById);
// For items, use by_transfer index:
const items = await ctx.db
  .query("transferItems")
  .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
  .collect();
// Resolve each item's variant → style:
const enrichedItems = await Promise.all(
  items.map(async (item) => {
    const variant = await ctx.db.get(item.variantId);
    const style = variant ? await ctx.db.get(variant.styleId) : null;
    return {
      variantId: item.variantId,
      sku: variant?.sku ?? "",
      size: variant?.size ?? "",
      color: variant?.color ?? "",
      styleName: style?.name ?? "Unknown",
      requestedQuantity: item.requestedQuantity,
    };
  })
);
```

**`_logAuditEntry` — correct import and usage:**
```typescript
import { _logAuditEntry } from "../_helpers/auditLog";

// After creating transfer:
await _logAuditEntry(ctx, {
  action: "transfer.create",
  userId: scope.userId,
  branchId: scope.branchId ?? args.toBranchId, // for HQ users, use toBranch as context
  entityType: "transfers",
  entityId: newTransferId,
  after: { fromBranchId: args.fromBranchId, toBranchId: args.toBranchId, status: "requested" },
});
```

**Role constants — from `convex/_helpers/permissions.ts`:**
```typescript
export const HQ_ROLES = ["admin", "hqStaff"] as const;
export const BRANCH_MANAGEMENT_ROLES = ["admin", "manager"] as const;
export const WAREHOUSE_ROLES = ["admin", "warehouseStaff"] as const; // for Story 6.2
```

**`api.d.ts` patch — same pattern as previous stories:**
```typescript
// Before (alphabetically near transfers section):
import type * as transfers_requests from "../transfers/requests.js";

// In ApiFromModules object:
"transfers/requests": typeof transfers_requests;
```
One entry covers both `api.transfers.requests.*` (public) AND `internal.transfers.requests.*` (internal) via FilterApi architecture.

**Status color mapping for UI — use `cn()` directly (no separate StatusPill component needed):**
```tsx
function TransferStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
      status === "requested" && "bg-amber-100 text-amber-800",
      status === "approved" && "bg-blue-100 text-blue-800",
      status === "rejected" && "bg-red-100 text-red-800",
      status === "packed" && "bg-purple-100 text-purple-800",
      status === "inTransit" && "bg-orange-100 text-orange-800",
      status === "delivered" && "bg-green-100 text-green-800",
    )}>
      {status === "inTransit" ? "In Transit" : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
```

**Inline reject reason form — avoid `void promise.then()` pattern (M3 lesson from 5.3):**
```tsx
// Use .then(success, error) pattern, NOT void .then():
reject({ transferId, reason }).then(
  () => { setRejectingId(null); setRejectReason(""); },
  () => setRejectError("Rejection failed — try again")
);
```

**`v` import conflict — CRITICAL (same as all previous stories):**
`requests.ts` imports `{ v }` from `"convex/values"`. NEVER use `v` as a callback variable name. Use `transfer`, `item`, `branch`, `row` etc.

**No `@/components/ui/skeleton`** — use `animate-pulse` divs (same as all previous stories):
```tsx
{transfers === undefined && Array.from({ length: 4 }).map((_, i) => (
  <tr key={i} className="border-b animate-pulse">
    {Array.from({ length: 7 }).map((_, j) => (
      <td key={j} className="px-4 py-3"><div className="h-4 rounded bg-muted w-full" /></td>
    ))}
  </tr>
))}
```

**HQ dashboard Actions column stability (L2 lesson from 5.3):**
Always render the Actions `<th>` column regardless of `currentUser` loading state. Conditionally render the action buttons inside `<td>`, not the column header itself.

### Existing Code to Build Upon (DO NOT recreate)

**`withBranchScope` returns `null` branchId for HQ roles (admin, hqStaff):**
```typescript
// Same pattern used in inventory/alerts.ts getLowStockAlerts:
if (scope.branchId === null) {
  // HQ — query all transfers
} else {
  // Branch — query own branch transfers only (merge from + to)
}
```

**Branch layouts enforce role access — pages do NOT need additional role guards:**
- `app/branch/` layout: ALLOWED_ROLES for branch staff (managers, cashiers, viewers)
- `app/hq/` layout: ALLOWED_ROLES = `["admin", "hqStaff"]`
- Do NOT add redundant role checks in the page components themselves

**Convex subscription — real-time updates are automatic:**
`useQuery(api.transfers.requests.listTransfers, {})` subscribes to real-time updates. No polling needed. HQ sees status changes instantly when branch creates; branch sees approvals instantly when HQ acts.

**`transferItems` already in schema** with correct fields. Do NOT redefine. The `by_transfer` index is already defined.

### Project Structure

```
Files to CREATE in this story:
├── convex/
│   └── transfers/
│       └── requests.ts             # createTransferRequest, listTransfers,
│                                   # listActiveBranches, approveTransfer, rejectTransfer
├── app/
│   ├── branch/
│   │   └── transfers/
│   │       └── page.tsx            # Branch manager: create + list own requests
│   └── hq/
│       └── transfers/
│           └── page.tsx            # HQ: approval queue with approve/reject

Files to MODIFY in this story:
├── convex/schema.ts                # Extend transfers table: 2 new status literals + 5 optional fields
└── convex/_generated/api.d.ts     # Add transfers/requests module (1 import + 1 ApiFromModules entry)

Files that MUST NOT be modified:
├── convex/schema.ts (transferItems table)  # Already correct
├── convex/_helpers/withBranchScope.ts      # Complete — use as-is
├── convex/_helpers/permissions.ts          # Complete — use BRANCH_MANAGEMENT_ROLES, HQ_ROLES
├── convex/_helpers/auditLog.ts             # Complete — call _logAuditEntry()
├── app/warehouse/transfers/page.tsx        # Placeholder — Story 6.2 will replace this
├── app/branch/layout.tsx                   # Complete — role guard already in place
└── app/hq/layout.tsx                       # Complete — role guard already in place
```

### Previous Story Learnings (Epics 1–5 code reviews)

- **`v` import conflict**: NEVER use `v` as a callback variable name in Convex files — use `transfer`, `row`, `item`, `branch`, `existing`.
- **`@/components/ui/skeleton` does not exist**: Use `animate-pulse` divs.
- **Manual `api.d.ts` patch**: One entry in ApiFromModules covers both `api.*` and `internal.*` via FilterApi. Never add two entries.
- **`withBranchScope` null branchId for HQ is NOT an error**: Use it to branch query logic. HQ gets all data.
- **Filter inactive branches in joins**: Always check `branch?.isActive` when joining branch names.
- **`void promise.then()` is silent failure**: Always use `.then(success, error)` for mutations so rejections surface to user.
- **HQ table column stability**: Never toggle column headers based on loading state — always render the column, conditionally render cell contents.
- **tsc + lint zero-error policy**: Run after EVERY file change, not just at the end.
- **`branch.isActive` check on both fromBranch and toBranch**: Filter out inactive branches in enrichment.
- **`internalMutation` for server-only functions**: This story has no scheduled/internal functions — all mutations are public. No need for `ctx.scheduler` here.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 6, Stories 6.1 ACs]
- [Source: _bmad-output/planning-artifacts/architecture.md — FR32-33, convex/transfers/ directory, route groups, RBAC table]
- [Source: convex/schema.ts — existing transfers + transferItems table definitions]
- [Source: convex/_helpers/permissions.ts — HQ_ROLES, BRANCH_MANAGEMENT_ROLES, WAREHOUSE_ROLES]
- [Source: convex/_helpers/auditLog.ts — _logAuditEntry() helper pattern]
- [Source: convex/_helpers/withBranchScope.ts — scope.branchId null = HQ, pattern for two-index merge]
- [Source: convex/inventory/alerts.ts — branch cache pattern (Map), role-scoped query pattern]
- [Source: app/hq/dashboard/page.tsx — stable Actions column pattern (L2 fix)]
- [Source: app/branch/stock/page.tsx — .then(success, error) pattern (M3 fix), isManager flag pattern]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- TS2345: `args.status as string` passed to `withIndex("by_status", ...)` — Convex index expects union literal, not `string`. Fixed by collecting all transfers and filtering in memory instead of using the index for status.

### Completion Notes List

- All 6 tasks completed. `convex/transfers/` module directory created.
- `listTransfers` uses two-index merge pattern for branch-scoped queries (by_from_branch + by_to_branch, deduplicated via Set).
- Status filter for HQ uses in-memory filter (not index) to avoid TypeScript union type mismatch.
- `listActiveBranches` added to `convex/transfers/requests.ts` for branch dropdown in UI.
- `app/branch/transfers/page.tsx` shows collapsible create form (managers/admins only) + transfers table with rejection reason inline.
- `app/hq/transfers/page.tsx` shows filter tabs (default: Pending) + 7-column approval table with stable Actions column and inline reject reason form.
- `npx tsc --noEmit` → 0 errors. `npx next lint` → 0 warnings, 0 errors.

**Code Review Fixes (Senior Developer AI Review):**
- M1: `handleApprove` now uses `.then(success, error)` — inline `approveErrorId` state shows "Approval failed" per row
- M2: Integer validation added to both backend (`Number.isInteger`) and frontend (`step={1}`)
- M3: `createTransferRequest` now accepts `sku: string` items; resolves to `variantId` via `by_sku` index with active check; UI uses SKU text input
- M4: `StageTimestamp` component renders `approvedAt`/`rejectedAt` below StatusBadge in both pages
- L1: `const now = Date.now()` used for both timestamp fields in `approveTransfer` and `rejectTransfer`
- L2: `TRANSFER_CREATE_ROLES` built via `new Set([...BRANCH_MANAGEMENT_ROLES, ...HQ_ROLES])` — no "admin" duplicate
- L3: `getBranch()` closure with `Map<Id<"branches">, ...>` cache in `listTransfers` enrichment loop

### File List

- `convex/schema.ts` (modified — transfers status union extended; 5 optional approval fields added)
- `convex/_generated/api.d.ts` (modified — transfers_requests import + ApiFromModules entry)
- `convex/transfers/requests.ts` (created — listActiveBranches, createTransferRequest, listTransfers, approveTransfer, rejectTransfer)
- `app/branch/transfers/page.tsx` (created — branch manager create + list view)
- `app/hq/transfers/page.tsx` (created — HQ approval queue with filter tabs)

# Story 6.3: Transfer Tracking & Delivery Confirmation

Status: done

## Story

As a **Warehouse Staff member**,
I want to dispatch packed transfers and confirm delivery by scanning received items,
so that inventory is accurately updated at the destination branch and any discrepancies are flagged for HQ review.

## Acceptance Criteria

1. **Given** a Warehouse Staff or Admin user on `/warehouse/transfers`
   **When** they view the page
   **Then** a second section "Ready to Dispatch" shows all `packed` transfers
   **And** each row shows: From Branch | To Branch | Items | Packed At | "Mark Dispatched" button
   **And** clicking "Mark Dispatched" transitions the transfer to `"inTransit"`, records `shippedAt` + `shippedById`, and writes an audit log entry
   **And** the transfer immediately disappears from "Ready to Dispatch" and appears in the HQ filter for "In Transit"

2. **Given** a Warehouse Staff or Admin user on `/warehouse/receiving`
   **When** they view the page
   **Then** they see a queue of all `inTransit` transfers
   **And** each row shows: From Branch | To Branch | Items | Shipped At | "Start Receiving" button
   **And** loading shows animate-pulse skeleton rows; empty state: "No transfers in transit."

3. **Given** the warehouse staff clicks "Start Receiving" on an in-transit transfer
   **When** the receiving view activates
   **Then** the full-screen receiving session replaces the queue (same focus-mode pattern as packing)
   **And** a manifest table shows all items: SKU | Style | Barcode | Packed Qty | Received Qty | Damage Notes | Status
   **And** BarcodeScanner component is shown with its own Start/Stop Camera toggle (`isActive={true}`)
   **And** a manual barcode text input is provided as a fallback
   **And** a "Cancel" button returns to the queue without saving

4. **Given** the receiving view is active and staff scans a barcode
   **When** the scanned barcode matches a variant in the transfer manifest
   **Then** the received quantity for that row increments by 1
   **And** once received qty ≥ packed qty, the row shows a green ✓ "Received" badge
   **When** the scanned barcode does NOT match any variant in the manifest
   **Then** an immediate visual error alert "Not in manifest: [barcode]" is shown
   **And** an audio beep (Web Audio API, 300Hz) is triggered

5. **Given** an item is damaged or missing
   **When** the warehouse staff clicks "Flag Damage" on that item row
   **Then** a notes field appears inline for the damage description
   **And** the item is visually flagged (amber border, "Damaged" badge)
   **And** the item's received quantity can be set to any value (including 0 for completely missing)
   **And** flagged items do NOT block the "Complete Receiving" button

6. **Given** all manifest items are either received, damaged, or skipped
   **When** the warehouse staff clicks "Complete Receiving"
   **Then** `confirmTransferDelivery` mutation is called with all received quantities and damage notes
   **And** each `transferItems.receivedQuantity` is updated
   **And** each `transferItems.damageNotes` is set (if damage was flagged)
   **And** for each item where `receivedQuantity > 0`: the receiving branch's `inventory` is incremented (upsert)
   **And** `transfers.status` → `"delivered"`, `deliveredAt` = now, `deliveredById` = current user ID
   **And** if any item has damage notes OR received < packed: an additional audit entry `"transfer.deliveryDiscrepancy"` is written for HQ visibility
   **And** an audit log entry `"transfer.deliver"` is created
   **And** the view returns to the queue

## Tasks / Subtasks

- [x] Task 1: Update `convex/schema.ts` — add `shippedById` and `deliveredById` to transfers table (AC: #1, #6)
  - [x] 1.1 Added `shippedById: v.optional(v.id("users"))` after `shippedAt` and `deliveredById: v.optional(v.id("users"))` after `deliveredAt`.

- [x] Task 2: Add 5 new functions to `convex/transfers/fulfillment.ts` (AC: #1, #2, #3, #4, #5, #6)
  - [x] 2.1 `listPackedTransfers` — queries `by_status "packed"`, enriches with branch names and itemCount, sorted by createdAt asc.
  - [x] 2.2 `markTransferInTransit` — verifies `status === "packed"`, patches to `inTransit`, writes audit log `transfer.dispatch`.
  - [x] 2.3 `listInTransitTransfers` — queries `by_status "inTransit"`, enriches with branch names, shippedAt, itemCount.
  - [x] 2.4 `getTransferReceivingData` — verifies `status === "inTransit"`, returns manifest with `packedQuantity` (not requestedQuantity).
  - [x] 2.5 `confirmTransferDelivery` — full H1+M3 ownership/completeness checks, inventory upsert via `by_branch_variant`, discrepancy audit log.

- [x] Task 3: Update `app/warehouse/transfers/page.tsx` — add "Ready to Dispatch" section for packed transfers (AC: #1)
  - [x] 3.1–3.5 Added `packedTransfers` query, `markInTransit` mutation, `dispatchErrorId` state, second table section "Ready to Dispatch" with "Mark Dispatched" button and inline error.

- [x] Task 4: Create `app/warehouse/receiving/page.tsx` — full delivery confirmation UI (AC: #2, #3, #4, #5, #6)
  - [x] 4.1–4.8 Full receiving page with queue, session, manifest table, BarcodeScanner (isActive=true), damage flagging, +/− counters, isReadyToComplete logic, confirmDelivery call with proper error handling.

- [x] Task 5: Integration verification (AC: all)
  - [x] 5.1 `npx tsc --noEmit` — 0 TypeScript errors.
  - [x] 5.2 `npx next lint` — 0 warnings/errors.

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**Auth: `requireRole(ctx, WAREHOUSE_ROLES)` for ALL new functions — same as existing fulfillment.ts:**
```typescript
import { requireRole, WAREHOUSE_ROLES } from "../_helpers/permissions";
// WAREHOUSE_ROLES = ["admin", "warehouseStaff"]
const user = await requireRole(ctx, WAREHOUSE_ROLES);
// user._id is the authenticated user ID
```
Warehouse staff are NOT branch-scoped — they handle all cross-branch transfers.

**`confirmTransferDelivery` — complete implementation spec (Task 2.5):**
```typescript
export const confirmTransferDelivery = mutation({
  args: {
    transferId: v.id("transfers"),
    receivedItems: v.array(
      v.object({
        itemId: v.id("transferItems"),
        receivedQuantity: v.number(),
        damageNotes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, WAREHOUSE_ROLES);

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    if (transfer.status !== "inTransit") {
      throw new ConvexError({ code: "INVALID_STATE", message: "Only in-transit transfers can be confirmed." });
    }

    // Validate quantities (same pattern as completeTransferPacking)
    for (const item of args.receivedItems) {
      if (!Number.isInteger(item.receivedQuantity) || item.receivedQuantity < 0) {
        throw new ConvexError({ code: "INVALID_ARGUMENT", message: "receivedQuantity must be a non-negative integer." });
      }
    }

    // H1 fix learned from 6.2 code review: verify item ownership BEFORE patching
    const transferItems = await ctx.db
      .query("transferItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", args.transferId))
      .collect();

    if (args.receivedItems.length !== transferItems.length) {
      throw new ConvexError({ code: "INVALID_ARGUMENT", message: `Expected ${transferItems.length} items, got ${args.receivedItems.length}.` });
    }

    const validItemIds = new Set(transferItems.map((row) => row._id as string));
    for (const item of args.receivedItems) {
      if (!validItemIds.has(item.itemId as string)) {
        throw new ConvexError({ code: "INVALID_ARGUMENT", message: "One or more items do not belong to this transfer." });
      }
    }

    const now = Date.now();

    // Track discrepancies for HQ audit
    let hasDiscrepancy = false;

    // Build map of transferItems for quick lookup
    const itemById = new Map(transferItems.map((row) => [row._id as string, row]));

    // Patch each transferItem and upsert inventory
    for (const item of args.receivedItems) {
      const original = itemById.get(item.itemId as string)!;

      // Patch transferItems row
      await ctx.db.patch(item.itemId, {
        receivedQuantity: item.receivedQuantity,
        ...(item.damageNotes ? { damageNotes: item.damageNotes } : {}),
      });

      // Inventory upsert for this branch+variant (ONLY if receivedQuantity > 0)
      if (item.receivedQuantity > 0) {
        const existing = await ctx.db
          .query("inventory")
          .withIndex("by_branch_variant", (q) =>
            q.eq("branchId", transfer.toBranchId).eq("variantId", original.variantId)
          )
          .unique();

        if (existing) {
          await ctx.db.patch(existing._id, {
            quantity: existing.quantity + item.receivedQuantity,
            updatedAt: now,
          });
        } else {
          await ctx.db.insert("inventory", {
            branchId: transfer.toBranchId,
            variantId: original.variantId,
            quantity: item.receivedQuantity,
            updatedAt: now,
          });
        }
      }

      // Track discrepancy (damage noted OR received less than packed)
      const packedQty = original.packedQuantity ?? original.requestedQuantity;
      if (item.damageNotes || item.receivedQuantity < packedQty) {
        hasDiscrepancy = true;
      }
    }

    // Update transfer status
    await ctx.db.patch(args.transferId, {
      status: "delivered",
      deliveredAt: now,
      deliveredById: user._id,
      updatedAt: now,
    });

    // Primary audit log
    await _logAuditEntry(ctx, {
      action: "transfer.deliver",
      userId: user._id,
      entityType: "transfers",
      entityId: args.transferId,
      before: { status: "inTransit" },
      after: { status: "delivered", deliveredById: user._id },
    });

    // Discrepancy audit log for HQ visibility
    if (hasDiscrepancy) {
      await _logAuditEntry(ctx, {
        action: "transfer.deliveryDiscrepancy",
        userId: user._id,
        entityType: "transfers",
        entityId: args.transferId,
        after: { discrepancy: true, transferId: args.transferId },
      });
    }
  },
});
```

**Inventory upsert pattern — `by_branch_variant` index:**
```typescript
// This index exists: .index("by_branch_variant", ["branchId", "variantId"])
const existing = await ctx.db
  .query("inventory")
  .withIndex("by_branch_variant", (q) =>
    q.eq("branchId", transfer.toBranchId).eq("variantId", original.variantId)
  )
  .unique();
```
If no row exists, `ctx.db.insert("inventory", { branchId, variantId, quantity, updatedAt })`. Note: `inventory` table does NOT have `createdAt` — only `updatedAt`.

**`getTransferReceivingData` — manifest shows `packedQuantity` (not requestedQuantity):**
```typescript
// Receiving staff confirms what was actually PACKED, not what was originally requested
return {
  itemId: item._id,
  variantId: item.variantId,
  sku: variant?.sku ?? "",
  barcode: variant?.barcode ?? null,
  size: variant?.size ?? "",
  color: variant?.color ?? "",
  styleName: style?.name ?? "Unknown",
  packedQuantity: item.packedQuantity ?? item.requestedQuantity, // fallback if packedQuantity not set
};
```

**Schema additions (Task 1) — exact placement:**
```typescript
// Current schema (from convex/schema.ts):
packedAt: v.optional(v.number()),
packedById: v.optional(v.id("users")),  // added in Story 6.2
shippedAt: v.optional(v.number()),
// ADD HERE:
shippedById: v.optional(v.id("users")),
deliveredAt: v.optional(v.number()),
// ADD HERE:
deliveredById: v.optional(v.id("users")),
```

**NO api.d.ts changes needed** — `transfers/fulfillment` is already registered from Story 6.2.

**Warehouse transfers page (Task 3) — dispatch section pattern:**
```tsx
// Add a SECOND section below the existing "Awaiting Packing" section:
<div className="space-y-4">
  <h2 className="text-lg font-semibold">Ready to Dispatch</h2>
  <div className="rounded-lg border bg-card">
    {/* Same table pattern as approvedTransfers — 5 columns */}
    {/* Columns: From Branch | To Branch | Items | Packed At | Actions */}
    {/* Action: "Mark Dispatched" button */}
  </div>
</div>
```
Add `dispatchErrorId` state (same pattern as `approveErrorId` in HQ page):
```tsx
const [dispatchErrorId, setDispatchErrorId] = useState<string | null>(null);

function handleMarkInTransit(transferId: Id<"transfers">) {
  setDispatchErrorId(null);
  markInTransit({ transferId }).then(
    () => undefined,
    () => setDispatchErrorId(transferId)
  );
}
```
Show `{dispatchErrorId === transfer._id && <p className="text-xs text-destructive">Dispatch failed — try again.</p>}` below the button.

**Receiving page — `isReadyToComplete` logic:**
```typescript
const isReadyToComplete =
  receivingData !== undefined &&
  receivingData !== null &&
  receivingData.items.length > 0 &&
  receivingData.items.every(
    (item) =>
      damagedIds.has(item.itemId) ||
      (receivedCounts[item.itemId] ?? 0) >= item.packedQuantity
  );
```

**Receiving page — damage flag state management:**
```typescript
// Toggle damage flag for an item
function toggleDamage(itemId: string) {
  setDamagedIds((prev) => {
    const next = new Set(prev);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    return next;
  });
}
```
When damage is flagged: show inline `<Input>` for damage notes within the table row. When unflagged: clear damage notes for that item.

**BarcodeScanner usage — ALWAYS `isActive={true}` (lesson from 6.2 M2 fix):**
```tsx
{/* Single camera control — BarcodeScanner's built-in Start/Stop Camera toggle */}
<BarcodeScanner onScan={handleScan} isActive={true} />
```
Do NOT add a parent "Start Camera" / "Stop Camera" button. The `BarcodeScanner` component has its own toggle — using both creates duplicate/confusing controls.

**`playBeep` with `setTimeout` AudioContext close (lesson from 6.2 M1 fix):**
```typescript
function playBeep(frequency = 880, durationSec = 0.15) {
  try {
    const audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durationSec);
    osc.start();
    osc.stop(audioCtx.currentTime + durationSec);
    // Close context after beep — prevents browser limit exhaustion
    setTimeout(() => audioCtx.close(), (durationSec + 0.1) * 1000);
  } catch {
    // AudioContext may be blocked — silently ignore
  }
}
```

**`useEffect` reset pattern (same as 6.2):**
```typescript
useEffect(() => {
  setReceivedCounts({});
  setDamagedIds(new Set());
  setDamageNotes({});
  setScanAlert(null);
  setManualBarcode("");
  setSubmitting(false);
  setReceiveError(null);
}, [selectedTransferId]);
```

**`.then(success, error)` pattern — ALWAYS provide error callback:**
```typescript
confirmDelivery({ ... }).then(
  () => { setSelectedTransferId(null); },
  (err: unknown) => {
    setReceiveError(err instanceof Error ? err.message : "Failed — try again.");
    setSubmitting(false);
  }
);
```

**`listPackedTransfers` / `listInTransitTransfers` — same cache pattern as `listApprovedTransfers`:**
```typescript
const branchCache = new Map<Id<"branches">, string>();
async function getBranchName(branchId: Id<"branches">): Promise<string> {
  if (branchCache.has(branchId)) return branchCache.get(branchId) ?? "(inactive)";
  const branch = await ctx.db.get(branchId);
  const name = branch?.isActive ? branch.name : "(inactive)";
  branchCache.set(branchId, name);
  return name;
}
```
Note: Use `?? "(inactive)"` NOT `!` (L1 lesson from 6.2 code review).

**`v` naming conflict — NEVER use `v` as callback parameter name in Convex files.**

**Status badge for manifest row items (receiving page):**
```typescript
function ItemReceiveStatusBadge({
  itemId, packedQty, receivedCounts, damagedIds,
}: { itemId: string; packedQty: number; receivedCounts: Record<string, number>; damagedIds: Set<string>; }) {
  if (damagedIds.has(itemId)) {
    return <span className="...bg-amber-100 text-amber-700">Damaged</span>;
  }
  const received = receivedCounts[itemId] ?? 0;
  if (received >= packedQty) {
    return <span className="...bg-green-100 text-green-700">✓ Received</span>;
  }
  return <span className="...bg-muted text-muted-foreground">Pending ({received}/{packedQty})</span>;
}
```

**HQ visibility of discrepancies:**
The `"transfer.deliveryDiscrepancy"` audit log entry is immediately visible to HQ through the existing audit log system (`audit/logs.ts`). No additional notification infrastructure is needed for this story. The HQ transfers page already shows `"delivered"` status with timestamps.

**Warehouse layout sidebar** (`app/warehouse/layout.tsx`):
- Already has "Transfers" link → `/warehouse/transfers`
- Already has "Receiving" link → `/warehouse/receiving`
- Do NOT modify layout.tsx

### Project Structure

```
Files to MODIFY in this story:
├── convex/schema.ts                      # Add shippedById, deliveredById
├── convex/transfers/fulfillment.ts       # Add 5 new functions
└── app/warehouse/transfers/page.tsx      # Add "Ready to Dispatch" section

Files to CREATE in this story:
└── app/warehouse/receiving/page.tsx      # Full delivery confirmation UI

Files that MUST NOT be modified:
├── convex/_generated/api.d.ts            # transfers/fulfillment already registered — DO NOT touch
├── components/shared/BarcodeScanner.tsx  # Complete — use as-is
├── convex/transfers/requests.ts          # Story 6.1 — do not touch
├── convex/_helpers/permissions.ts        # Complete — use requireRole + WAREHOUSE_ROLES
├── convex/_helpers/auditLog.ts           # Complete — call _logAuditEntry()
├── convex/inventory/stockLevels.ts       # Complete — see by_branch_variant index pattern above
├── app/warehouse/layout.tsx              # Complete — nav already configured
└── app/hq/transfers/page.tsx             # Complete — filter tabs already include packed/inTransit/delivered
```

### Previous Story Learnings (Stories 6.1 + 6.2 + code reviews)

- **H1 (code review must-fix)**: In ANY mutation that patches items by ID, ALWAYS fetch the actual parent records first and verify ownership with a `Set<string>`. Example: `completeTransferPacking` was vulnerable before the fix. Apply the same pattern to `confirmTransferDelivery`.
- **M1 (code review must-fix)**: `playBeep` must close `AudioContext` after beep via `setTimeout`.
- **M2 (code review must-fix)**: Never add a parent "Start Camera" toggle — let `BarcodeScanner` control its own camera. Always pass `isActive={true}`.
- **M3 (code review must-fix)**: Server-side completeness check: verify `args.receivedItems.length === transferItems.length`.
- **L1 (code review)**: Map cache must use `?? "(inactive)"` not `!` non-null assertion.
- **`v` conflict**: NEVER use `v` as a callback variable name in Convex files (imported from `convex/values`).
- **`by_status` index**: Hardcoded literal strings work directly (no in-memory filtering needed).
- **`const now = Date.now()`**: Single call for all timestamp fields in the same mutation.
- **`animate-pulse` divs**: No `@/components/ui/skeleton` — use inline `<div className="h-4 rounded bg-muted w-full" />`.
- **`useQuery("skip")`**: Conditional query when transfer not selected.
- **`.then(success, error)`**: Always provide error callback — never silently swallow mutations.
- **`Number.isInteger()` + `>= 0`**: Required for all quantity fields (0 is valid for missing items).
- **`inventory` table**: Has `branchId`, `variantId`, `quantity`, `lowStockThreshold?`, `updatedAt` — NO `createdAt`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 6, Story 6.3 ACs]
- [Source: _bmad-output/planning-artifacts/architecture.md — FR35-38, fulfillment.ts responsibilities, warehouse receiving route]
- [Source: convex/schema.ts — transfers (shippedAt/deliveredAt exist; shippedById/deliveredById missing), transferItems (receivedQuantity/damageNotes exist), inventory (by_branch_variant index)]
- [Source: convex/transfers/fulfillment.ts — existing functions: listApprovedTransfers, getTransferPackingData, completeTransferPacking; ownership verification pattern]
- [Source: convex/inventory/stockLevels.ts — by_branch_variant index usage pattern]
- [Source: convex/_helpers/permissions.ts — WAREHOUSE_ROLES = ["admin", "warehouseStaff"], requireRole()]
- [Source: app/warehouse/layout.tsx — ALLOWED_ROLES, nav items (Transfers + Receiving already configured)]
- [Source: components/shared/BarcodeScanner.tsx — isActive: boolean, onScan callback, built-in Start/Stop toggle]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — clean implementation pass.

### Completion Notes List

- All 6.2 code review lessons applied: H1 ownership check, M1 AudioContext close, M2 isActive={true}, M3 completeness check, L1 Map ?? pattern.
- `inventory` upsert uses `by_branch_variant` index with `.unique()` — insert if absent, patch if present.
- Schema: `shippedById` and `deliveredById` added after their respective timestamp fields.
- No api.d.ts change needed — `transfers/fulfillment` already registered from Story 6.2.
- `npx tsc --noEmit` → 0 errors. `npx next lint` → 0 warnings/errors.

**Code Review Fixes (6.3 review):**
- M1: Silent damage flag loss — `handleComplete` now always sends `damageNotes` for flagged items (falls back to `"Damaged (no notes provided)"` when notes blank). Server discrepancy detection and audit log now fire reliably.
- M2: React anti-pattern in `toggleDamage` — `setDamageNotes` was called inside `setDamagedIds` updater (fires twice in Strict Mode). Fixed by reading `damagedIds.has(itemId)` before updater and calling `setDamageNotes` independently.
- M3: `getBranchName` duplicated 3× — extracted `makeBranchNameResolver` factory at module level; all 3 query handlers now call `makeBranchNameResolver((id) => ctx.db.get(id))`.

### File List

- convex/schema.ts (modified)
- convex/transfers/fulfillment.ts (modified — 5 functions added)
- app/warehouse/transfers/page.tsx (modified — Ready to Dispatch section)
- app/warehouse/receiving/page.tsx (created)

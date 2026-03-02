# Story 6.2: Warehouse Packing with Barcode Scanning

Status: done

## Story

As a **Warehouse Staff member**,
I want to pick and pack approved transfer orders by scanning item barcodes,
so that I can confirm the correct items and quantities are being shipped and update the transfer to "Packed" status.

## Acceptance Criteria

1. **Given** a Warehouse Staff or Admin user on `/warehouse/transfers`
   **When** they view the page
   **Then** they see a queue of all approved transfer requests (status = `"approved"`)
   **And** each row shows: From Branch | To Branch | # Items | Approved At | "Start Packing" button
   **And** loading shows animate-pulse skeleton rows; empty state shows "No approved transfers to pack."

2. **Given** the warehouse staff clicks "Start Packing" on an approved transfer
   **When** the packing view activates
   **Then** the full-screen packing session replaces the queue (focus mode — UX spec: task dominates screen)
   **And** a manifest table shows all items: SKU | Style | Barcode | Requested Qty | Packed Qty | Status
   **And** BarcodeScanner component is shown (Start/Stop Camera toggle)
   **And** a manual barcode text input is provided as a fallback
   **And** a "Cancel" button returns the user to the queue without saving

3. **Given** the packing view is active and the warehouse staff scans a barcode
   **When** the scanned barcode matches a variant in the transfer manifest
   **Then** the packed quantity for that manifest row increments by 1
   **And** once packed qty ≥ requested qty, the row shows a green ✓ "Packed" badge
   **When** the scanned barcode does NOT match any variant in the manifest
   **Then** an immediate visual error alert "Not in manifest: [barcode]" is shown
   **And** an audio alert (short beep via Web Audio API) is triggered

4. **Given** any manifest item cannot be packed
   **When** the warehouse staff clicks "Skip" for that item
   **Then** the item is flagged as skipped (packedQuantity will be recorded as 0) and marked visually
   **And** skipped items do NOT block the "Complete Packing" button

5. **Given** all manifest items are either fully packed or skipped
   **When** the warehouse staff clicks "Complete Packing"
   **Then** `completeTransferPacking` mutation is called with all packed/skipped quantities
   **And** each `transferItems.packedQuantity` is updated
   **And** `transfers.status` → `"packed"`, `packedAt` = now, `packedById` = current user ID
   **And** an audit log entry is created for the pack action
   **And** the view returns to the queue

## Tasks / Subtasks

- [x] Task 1: Update `convex/schema.ts` — add `packedById` to transfers table (AC: #5)
  - [x] 1.1 Added `packedById: v.optional(v.id("users"))` after `packedAt` in transfers defineTable.

- [x] Task 2: Patch `convex/_generated/api.d.ts` — add `transfers/fulfillment` module (AC: all)
  - [x] 2.1 Added `import type * as transfers_fulfillment from "../transfers/fulfillment.js";`
  - [x] 2.2 Added `"transfers/fulfillment": typeof transfers_fulfillment;` to ApiFromModules.
  - [x] 2.3 Same one-entry-covers-both-api-and-internal pattern used in all previous modules.

- [x] Task 3: Create `convex/transfers/fulfillment.ts` — warehouse packing functions (AC: #1, #5)
  - [x] 3.1 Created with requireRole (NOT withBranchScope) for all warehouse functions.
  - [x] 3.2 `listApprovedTransfers` — by_status index, branch cache, sorted oldest first.
  - [x] 3.3 `getTransferPackingData` — enriched items with sku, barcode, size, color, styleName.
  - [x] 3.4 `completeTransferPacking` — validates non-negative integers, patches items + transfer, audit log.

- [x] Task 4: Replace `app/warehouse/transfers/page.tsx` — full packing UI (AC: #1, #2, #3, #4, #5)
  - [x] 4.1–4.9 Full implementation: queue view, packing session, BarcodeScanner, manual input, manifest table, skip/undo, +/− counters, complete button.

- [x] Task 5: Integration verification (AC: all)
  - [x] 5.1 `npx tsc --noEmit` — 0 TypeScript errors.
  - [x] 5.2 `npx next lint` — 0 ESLint warnings or errors.

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**Use `requireRole` NOT `withBranchScope` for warehouse functions:**
```typescript
import { requireRole, WAREHOUSE_ROLES } from "../_helpers/permissions";

// In listApprovedTransfers handler:
const user = await requireRole(ctx, WAREHOUSE_ROLES);
// user._id is the authenticated user ID — use for packedById
```
Warehouse staff handle all cross-branch transfers (not limited to their assigned branch). `withBranchScope` would incorrectly restrict them to one branch's transfers. The warehouse layout already enforces the role guard via `ALLOWED_ROLES = ["admin", "warehouseStaff"]`.

**Schema addition — `packedById` field:**
```typescript
// ADD to transfers table (after existing packedAt):
packedById: v.optional(v.id("users")),
```
The schema already has `packedAt: v.optional(v.number())` but NOT `packedById`. This must be added.

**`by_status` index for `listApprovedTransfers`:**
```typescript
// This index already exists — use it:
const approved = await ctx.db
  .query("transfers")
  .withIndex("by_status", (q) => q.eq("status", "approved"))
  .collect();
```
Unlike `listTransfers` in requests.ts which needed in-memory status filtering (because args.status is `string`), here "approved" is a hardcoded literal — TypeScript accepts it directly with the index.

**`BarcodeScanner` component — DO NOT recreate:**
```tsx
import { BarcodeScanner } from "@/components/shared/BarcodeScanner";
// Props: onScan: (barcode: string) => void, isActive: boolean
// Handles camera lifecycle, debouncing, cleanup on unmount
// Returns null when isActive=false — use a toggle state:
const [scannerActive, setScannerActive] = useState(false);
// ...
<BarcodeScanner onScan={handleScan} isActive={scannerActive} />
<Button onClick={() => setScannerActive(s => !s)}>
  {scannerActive ? "Stop Scanner" : "Start Scanner"}
</Button>
```

**Audio beep for scan feedback — Web Audio API (no npm package needed):**
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
  } catch {
    // AudioContext may be blocked — silently ignore
  }
}
// Success scan: playBeep(880) — high beep
// Mismatch scan: playBeep(300, 0.3) — low longer beep
```

**Scan → manifest lookup flow:**
```typescript
const handleScan = useCallback((barcode: string) => {
  if (!packingData) return;
  const matched = packingData.items.find(
    (item) => item.barcode === barcode
  );
  if (matched) {
    setPackedCounts((prev) => ({
      ...prev,
      [matched.itemId]: (prev[matched.itemId] ?? 0) + 1,
    }));
    playBeep(880); // success
    setScanAlert(null);
  } else {
    playBeep(300, 0.3); // error
    setScanAlert(`Not in manifest: ${barcode}`);
  }
}, [packingData]);
```

**`completeTransferPacking` — packedQuantity must be non-negative integer:**
```typescript
// Backend validation in handler:
for (const item of args.packedItems) {
  if (!Number.isInteger(item.packedQuantity) || item.packedQuantity < 0) {
    throw new ConvexError({ code: "INVALID_ARGUMENT", message: "packedQuantity must be a non-negative integer." });
  }
}
```
Note: 0 is valid (for skipped items).

**`getTransferPackingData` — item shape returned:**
```typescript
return {
  transferId: transfer._id,
  fromBranchName: fromBranch?.name ?? "(inactive)",
  toBranchName: toBranch?.name ?? "(inactive)",
  notes: transfer.notes ?? null,
  createdAt: transfer.createdAt,
  items: enrichedItems.map(item => ({
    itemId: item._id,         // Id<"transferItems">
    variantId: item.variantId,
    sku: variant?.sku ?? "",
    barcode: variant?.barcode ?? null,  // null if not set
    size: variant?.size ?? "",
    color: variant?.color ?? "",
    styleName: style?.name ?? "Unknown",
    requestedQuantity: item.requestedQuantity,
  })),
};
```

**`listApprovedTransfers` — item count per transfer:**
```typescript
// Efficient: query by_transfer index, count results
const items = await ctx.db
  .query("transferItems")
  .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
  .collect();
return { ..., itemCount: items.length };
```

**`v` import conflict — CRITICAL:**
NEVER use `v` as a callback variable name in Convex files. In `fulfillment.ts`, always use `transfer`, `item`, `row`, etc.

**`useQuery` with `"skip"` for conditional queries:**
```typescript
// When no transfer is selected, skip the query entirely:
const packingData = useQuery(
  api.transfers.fulfillment.getTransferPackingData,
  selectedTransferId ? { transferId: selectedTransferId } : "skip"
);
```

**Complete packing button enabled state:**
```typescript
// Item is done if: packed >= requested OR skipped
const isReadyToComplete =
  packingData !== undefined &&
  packingData !== null &&
  packingData.items.length > 0 &&
  packingData.items.every(
    (item) =>
      skippedIds.has(item.itemId) ||
      (packedCounts[item.itemId] ?? 0) >= item.requestedQuantity
  );
```

**Packing view — full-screen focus mode (UX spec):**
When `selectedTransferId !== null`, render the packing view replacing the queue. Use `fixed inset-0 z-10 bg-background overflow-auto` to create a full-screen overlay feel, OR simply conditionally render instead of the queue. Keep the warehouse sidebar layout intact (packing view fills the `<main>` area).

The simplest approach: conditional render in the `<main>` content area — when `selectedTransferId` is set, show packing UI; otherwise show queue table.

**`packedCounts` reset on transfer selection:**
```typescript
// Use useEffect to reset packing state when a new transfer is selected:
useEffect(() => {
  setPackedCounts({});
  setSkippedIds(new Set());
  setScanAlert(null);
}, [selectedTransferId]);
```

**Status badge for manifest row items:**
```typescript
function ItemStatusBadge({ itemId, requestedQty, packedCounts, skippedIds }) {
  if (skippedIds.has(itemId)) return <span className="...bg-gray-100 text-gray-600">Skipped</span>;
  const packed = packedCounts[itemId] ?? 0;
  if (packed >= requestedQty) return <span className="...bg-green-100 text-green-700">✓ Packed</span>;
  return <span className="...bg-amber-100 text-amber-700">Pending ({packed}/{requestedQty})</span>;
}
```

**No `@/components/ui/skeleton`** — use `animate-pulse` divs (same as all previous stories).

**HQ/Admin can also access `/warehouse/transfers`** (ALLOWED_ROLES includes "admin"). The backend `requireRole(ctx, WAREHOUSE_ROLES)` check will allow both `admin` and `warehouseStaff`.

### Existing Code to Build Upon (DO NOT recreate)

**`BarcodeScanner` component API** (`components/shared/BarcodeScanner.tsx`):
- Props: `onScan: (barcode: string) => void`, `isActive: boolean`
- Camera control: `isActive=true` shows Start Scanner / Stop Scanner toggle
- Auto-stop when `isActive` → `false`
- Returns `null` when `isActive=false`
- Debounces same barcode within 500ms
- Handles all camera lifecycle + cleanup

**`requireRole` helper** (`convex/_helpers/permissions.ts`):
```typescript
export async function requireRole(ctx, allowedRoles: readonly string[]) {
  const user = await requireAuth(ctx);
  if (!allowedRoles.includes(user.role)) throw new ConvexError({ code: "UNAUTHORIZED" });
  return user; // returns full user Doc
}
```

**`variants` schema barcode field**: `barcode: v.optional(v.string())` — may be null/undefined for some variants. Always check nullability before using as scan target.

**Transfer status lifecycle** (full chain after this story):
```
requested → approved → packed → inTransit → delivered
                      ^^^^^^^^^
                      Story 6.2 implements this transition
```
Story 6.3 will implement: `packed → inTransit → delivered`.

**Warehouse layout** (`app/warehouse/layout.tsx`):
- Already enforces `ALLOWED_ROLES = ["admin", "warehouseStaff"]` with redirect
- Sidebar: "Transfers" link → `/warehouse/transfers`, "Receiving" link → `/warehouse/receiving`
- Do NOT modify the layout

### Project Structure

```
Files to CREATE in this story:
└── convex/transfers/fulfillment.ts       # listApprovedTransfers, getTransferPackingData,
                                          # completeTransferPacking

Files to MODIFY in this story:
├── convex/schema.ts                      # Add packedById: v.optional(v.id("users")) to transfers
├── convex/_generated/api.d.ts            # Add transfers/fulfillment module
└── app/warehouse/transfers/page.tsx      # REPLACE placeholder with full packing UI

Files that MUST NOT be modified:
├── components/shared/BarcodeScanner.tsx  # Complete — use as-is
├── convex/transfers/requests.ts          # Story 6.1 — do not touch
├── convex/_helpers/permissions.ts        # Complete — use requireRole + WAREHOUSE_ROLES
├── convex/_helpers/auditLog.ts           # Complete — call _logAuditEntry()
├── app/warehouse/layout.tsx              # Complete — role guard already enforced
└── app/warehouse/receiving/              # Story 6.3 will implement this
```

### Previous Story Learnings (Stories 6.1 + prior)

- **`v` import conflict**: NEVER use `v` as a callback variable name — use `transfer`, `row`, `item`.
- **`by_status` index literal**: Hardcoded literal strings like `"approved"` work directly with `withIndex("by_status", q => q.eq("status", "approved"))`. Only runtime-unknown strings need in-memory filtering.
- **Integer validation**: `Number.isInteger()` for quantity fields — `packedQuantity >= 0` (0 valid for skipped).
- **`.then(success, error)` pattern**: Never use `void promise.then()` — always provide error callback.
- **`const now = Date.now()`**: Use single call for multiple timestamp fields in the same mutation.
- **`Map<Id<...>, ...>` cache**: Use for repeated lookups of the same entity within enrichment loops.
- **`animate-pulse` divs**: No `@/components/ui/skeleton` component exists.
- **`useQuery("skip")`**: Pass `"skip"` as args to skip a Convex query when its input isn't ready.
- **SKU-based item resolution**: The `createTransferRequest` in 6.1 resolves SKUs to variantIds server-side via `by_sku` index.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 6, Story 6.2 ACs]
- [Source: _bmad-output/planning-artifacts/architecture.md — FR33-34, convex/transfers/fulfillment.ts, NFR32 barcode scanning]
- [Source: convex/schema.ts — transfers.packedAt exists; transferItems.packedQuantity exists; variants.barcode optional]
- [Source: convex/_helpers/permissions.ts — WAREHOUSE_ROLES, requireRole()]
- [Source: components/shared/BarcodeScanner.tsx — full html5-qrcode wrapper, onScan+isActive props]
- [Source: app/warehouse/layout.tsx — ALLOWED_ROLES = ["admin", "warehouseStaff"], nav items]
- [Source: convex/transfers/requests.ts — fulfillment.ts same module directory, requireRole pattern for non-branch-scoped]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — 0 TypeScript errors, 0 ESLint warnings/errors on first pass.

### Completion Notes List

- Used `requireRole(ctx, WAREHOUSE_ROLES)` (not `withBranchScope`) for all fulfillment functions — warehouse staff are not branch-scoped.
- `by_status` index used directly with hardcoded `"approved"` literal — no in-memory filtering needed (contrast with Story 6.1's `listTransfers` which needed in-memory filtering for runtime `args.status`).
- Branch name cache (`Map<Id<"branches">, string>`) used in `listApprovedTransfers` to avoid redundant lookups.
- `packedCounts` reset via `useEffect([selectedTransferId])` to cleanly clear state on session change.
- Web Audio API `playBeep()` wrapped in try/catch to silently handle browser autoplay policy.
- `useQuery(..., "skip")` pattern used for `getTransferPackingData` when no transfer selected.
- Manual `+`/`−` buttons provided as barcode scanning fallback for each manifest row.
- "Undo Skip" button available to reverse a skip before completing.

**Code Review Fixes (2026-02-28):**
- H1: `completeTransferPacking` — added ownership verification: fetch all `transferItems` for the transfer via `by_transfer` index, build `validItemIds` Set, check each `packedItems[].itemId` against it. Cross-transfer data corruption prevented.
- M1: `playBeep` — added `setTimeout(() => audioCtx.close(), ...)` after `osc.stop()` to close AudioContext after beep, preventing browser's 6-instance limit from silently killing audio during active scanning.
- M2: Removed duplicate parent "Start Camera" / "Stop Camera" toggle; `BarcodeScanner` always rendered in packing mode with `isActive={true}` — its built-in Start/Stop Camera button is the sole camera control, eliminating two-click confusion.
- M3: `completeTransferPacking` — added completeness check: `args.packedItems.length !== transferItems.length` throws `INVALID_ARGUMENT`, preventing partial pack submissions from the server side.
- L1: `getBranchName` cache — replaced `!` non-null assertion with `?? "(inactive)"` fallback.

### File List

- `convex/schema.ts` — added `packedById: v.optional(v.id("users"))` to transfers table
- `convex/_generated/api.d.ts` — added transfers/fulfillment import + ApiFromModules entry
- `convex/transfers/fulfillment.ts` — created: listApprovedTransfers, getTransferPackingData, completeTransferPacking
- `app/warehouse/transfers/page.tsx` — replaced placeholder with full packing UI

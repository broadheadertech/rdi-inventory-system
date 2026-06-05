# Warehouse & Admin Modules — Draft

A module-level summary of the warehouse rework and admin changes. Each module
lists its purpose, data model, backend, UI, permissions, status, and follow‑ups.

> Convention: stock and money quantities are integers; prices are in centavos.
> Roles referenced: `admin`, `hqStaff`, `warehouseStaff`, `manager`, `cashier`.

---

## 1. Supplier Directory

A simple supplier master maintained from the warehouse.

- **Purpose:** Keep the list of suppliers the warehouse sources stock from.
- **Data model:** `suppliers` — `name`, `address`, `isActive`, `createdById`, timestamps.
- **Backend:** `convex/suppliers/directory.ts`
  - `listSuppliers` (query) — active suppliers, ordered by name.
  - `createSupplier` (mutation) — name + address.
  - Gated to `WAREHOUSE_ROLES` (admin, hqStaff, warehouseStaff).
- **UI:** `app/warehouse/suppliers/page.tsx` — table + "Add Supplier" modal dialog.
- **Nav label:** Supplier List
- **Status:** ✅ Done
- **Follow‑ups:** edit/deactivate supplier; contact person / phone / terms fields.

---

## 2. Goods Receipt (Supplier Receiving)

Receive inbound supplier deliveries against a declared allocation, with
PO number + photo, barcode scanning, and discrepancy reporting.

- **Purpose:** Book in goods from a supplier and reconcile declared vs actual.
- **Data model:**
  - `supplierReceipts` — `supplierId`, `branchId` (warehouse), `poNumber`,
    `receiptPhotoStorageId?`, `deliveryWindowStart/End`, `status`
    (`pending | receiving | completed | discrepancy`), `notes?`, audit fields.
  - `supplierReceiptItems` — `receiptId`, `variantId`, `declaredQuantity`,
    `receivedQuantity`, `isUnexpected?`.
  - `staffNotifications` — new type `supply_discrepancy` + `supplierReceiptId?`.
- **Backend:** `convex/suppliers/receiving.ts`
  - `generateReceiptUploadUrl`, `searchVariants`, `createReceipt`,
    `listReceipts`, `getReceipt`, `scanItem`, `setReceivedQuantity`,
    `completeReceipt`. Gated to `WAREHOUSE_ROLES`.
- **UI:**
  - `app/warehouse/receiving/page.tsx` — list + "Start Receiving / Continue / View".
  - `app/warehouse/receiving/new/page.tsx` — supplier, PO #, date range, photo,
    declared‑allocation builder (SKU search + qty).
  - `app/warehouse/receiving/[receiptId]/page.tsx` — scan (manual + camera),
    each scan = +1; live declared/received/discrepancy; Complete.
- **Behavior:**
  - A scanned SKU not in the declared allocation is added as an **unexpected**
    line (declared 0 → overage).
  - **Complete** adds actual‑received qty to **Central Warehouse** stock as a
    `supplier` inventory batch, then if any line received ≠ declared, sets status
    `discrepancy` and **notifies admins + HQ staff** (bell) with a summary.
- **Nav label:** Goods Receipt
- **Status:** ✅ Done
- **Follow‑ups:** edit a receipt before completion; per‑line damage notes.

---

## 3. Stock Movement (Move In / Out / Branch→Branch)

Warehouse‑centric stock movement that reuses the existing transfer engine,
with two‑step dispatch → confirmation and discrepancy flagging.

- **Purpose:** Move stock **out** to branches, **in** from branches, and
  **branch → branch**, from one warehouse tab.
- **Data model:** reuses `transfers` / `transferItems` (no new tables).
  - Direction derived from branches: from=warehouse → Out (`stockRequest`);
    to=warehouse → In (`return`); neither → `interBranch`.
- **Backend:** `convex/warehouse/movements.ts`
  - `listMovementBranches`, `searchVariants` (with source availability),
    `createMovement`, `listMovements`, `getMovement`. Gated to
    `WAREHOUSE_ROLES + manager`.
  - Confirmation reuses `transfers/fulfillment.ts:confirmTransferDelivery`.
- **UI:**
  - `app/warehouse/movements/page.tsx` — list, direction badges (↑ Out / ↓ In).
  - `app/warehouse/movements/new/page.tsx` — direction toggle, branch picker,
    item builder (shows on‑hand at source).
  - `app/warehouse/movements/[transferId]/page.tsx` — detail + Confirm Receipt.
- **Behavior:**
  - **Dispatch** holds source stock (FIFO consume, reserved), status `inTransit`.
    Stock rule is **enforced** — cannot dispatch more than the source holds.
  - **Other side confirms** receipt → lands stock at destination, clears the
    reservation, and flags any received ≠ sent as a discrepancy.
- **Nav label:** Stock Movement (the old standalone **Transfers** tab folded in).
- **Status:** ✅ Done (list/dispatch/confirm).
- **Follow‑ups:** approve/pack/ship workflow for branch‑initiated `requested`
  transfers inside the Stock Movement detail (today the detail only confirms
  in‑transit movements).

---

## 4. Warehouse POS

The warehouse acts as a store using the existing POS.

- **Purpose:** Let the warehouse sell directly through the full POS.
- **Changes:**
  - `warehouseStaff` granted `/pos` access (`middleware.ts`, `lib/routes.ts`,
    `app/pos/layout.tsx`).
  - Warehouse staff assigned to the **Central Warehouse** branch so POS's
    branch scope resolves (sales/stock/receipts).
- **Nav label:** POS (links to existing `/pos`).
- **Status:** ✅ Done
- **Note:** Other warehouse staff need a branch assignment to use POS.

---

## 5. Admin — View as Branch (Impersonation)

Admin can scope into any branch to inspect and act, fully audited.

- **Purpose:** Transparency — see/operate exactly what a branch sees.
- **Data model:** `users.viewingAsBranchId?`.
- **Backend:** `convex/auth/impersonation.ts`
  - `getViewingAsBranch`, `startViewingAsBranch`, `stopViewingAsBranch`
    (admin only; enter/exit written to `auditLogs`).
  - `withBranchScope` override: an admin with `viewingAsBranchId` becomes
    scoped to that branch (full actions, audited under the admin identity).
- **UI:**
  - `components/shared/ViewAsBranchPicker.tsx` — picker in the admin sidebar.
  - `components/shared/ImpersonationBanner.tsx` — app‑wide "Viewing as … — Exit".
- **Access level:** Full actions while viewing; every action logged as the admin.
- **Status:** ✅ Done
- **Follow‑ups:** optional read‑only mode toggle; stamp `viewingAsBranchId` onto
  each action's audit entry for finer traceability.

---

## 6. Navigation & Access Changes

Cross‑cutting nav/role adjustments.

- **Warehouse — role‑aware nav** (`app/warehouse/layout.tsx`):
  - **HQ Staff + Admin:** full **Operations** (now includes the new tools) +
    **Warehouse Floor**.
  - **Warehouse Staff:** trimmed set — Supplier List, Goods Receipt,
    Stock Movement, POS.
  - Removed **Auto‑Replenish**; folded **Transfers** into Stock Movement;
    merged **New Tools** into **Operations**.
- **Admin — sidebar cleanup** (`app/admin/layout.tsx`), hidden (pages kept):
  - **Seed Data**, **Invoices**, all **Marketing except Promotions**,
    **Expansion Intel**.
- **Status:** ✅ Done
- **Open question:** "remove seed data" — tab hidden; DB wipe not performed.

---

## Open / Pending

- Wipe seeded DB records (if "remove seed data" meant data, not the tab).
- Assign remaining warehouse staff (e.g., Alfred Alarcon) to a branch for POS.
- Stock Movement: in‑tab approve/pack/ship for branch‑initiated requests.
- Phase 2: surface branch → branch stock requests where branches initiate.

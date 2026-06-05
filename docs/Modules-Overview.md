# RedBox Apparel — Modules Overview (Draft)

A module-level map of the whole platform. Each module lists the **interface(s)**
it serves, its **backend domain** (`convex/…`), the **data tables** it owns, and
a one-line scope. `★` marks modules added/expanded in the recent warehouse rework.

**Interfaces:** Customer Storefront `(customer)` · POS `/pos` · Branch `/branch` ·
Warehouse `/warehouse` · Driver `/driver` · Supplier `/supplier` · Admin `/admin`.

---

## A. Foundation / Platform

### A1. Authentication, Roles & Access
- **Interfaces:** all · **Backend:** `auth`, `_helpers/permissions`, `_helpers/withBranchScope`, `middleware.ts`
- **Tables:** `users`, `branches`
- **Scope:** Clerk auth + role-based access (`admin, manager, cashier, warehouseStaff, hqStaff, viewer, driver, supplier`); per-branch data scoping; role→route gating.
- **★ View as Branch:** admin scopes into a branch (full, audited) — `auth/impersonation`, `users.viewingAsBranchId`.

### A2. Audit & Compliance
- **Interfaces:** Admin · **Backend:** `audit`, `_helpers/auditLog`
- **Tables:** `auditLogs`
- **Scope:** Immutable action log (who/what/before/after) across transfers, users, receiving, impersonation, etc.

### A3. Notifications
- **Interfaces:** all staff + customer · **Backend:** `notifications`, `logistics/notifications`
- **Tables:** `staffNotifications`, `notifications`
- **Scope:** Staff bell (transfers, driver events, ★ supply discrepancies) and customer notifications (orders, restock, price drop, promos).

### A4. Background Jobs & Snapshots
- **Interfaces:** system · **Backend:** `snapshots`, `migrations`, crons
- **Tables:** `branchDailySnapshots`, `variantDailySnapshots`, `tradingReminders`
- **Scope:** Pre-computed daily metrics powering dashboards/analytics; data migrations/backfills.

---

## B. Catalog & Inventory

### B1. Product Catalog
- **Interfaces:** Admin, Storefront, POS · **Backend:** `catalog`
- **Tables:** `brands`, `categories`, `productCodes`, `styles`, `variants`, `productImages`, `colors`, `sizes`, `sizeCharts`
- **Scope:** Brand→style→variant hierarchy, product codes, images, size charts, bulk/CSV import.

### B2. Inventory Management
- **Interfaces:** Branch, Warehouse, Admin · **Backend:** `inventory`
- **Tables:** `inventory`, `inventoryBatches`, `lowStockAlerts`, `cycleCounts`
- **Scope:** Per-branch stock + FIFO cost batches, low-stock alerts, cycle counts, quarantine, ghost-stock detection.

### B3. Pricing & Promotions
- **Interfaces:** Admin, POS, Storefront · **Backend:** `pos/promotions`, `admin/promotions`
- **Tables:** `promotions`, `vouchers`, `voucherRedemptions`
- **Scope:** % / fixed / BXGY / tiered / cross-sell / PWP promos, vouchers, VAT & senior/PWD discounts.

---

## C. Sales Channels

### C1. POS / In-Store Selling
- **Interfaces:** POS (`admin, manager, cashier`, ★ `warehouseStaff`) · **Backend:** `pos`, `cashier`
- **Tables:** `transactions`, `transactionItems`, `reconciliations`, `cashierAccounts`, `cashierShifts`, `digitalReceipts`, `crossSellEvents`, `fashionAssistants`
- **Scope:** Offline-capable checkout, shifts & cash reconciliation, returns/voids, digital receipts, cross-sell. ★ Warehouse sells as a store.

### C2. Customer Storefront / E-commerce
- **Interfaces:** Customer · **Backend:** `storefront`
- **Tables:** `customers`, `customerAddresses`, `carts`, `cartItems`, `orders`, `orderItems`, `shipments`, `wishlists`, `savedItems`, `reviews`, `recentlyViewed`, `productVotes`, `restockAlerts`, `checkIns`
- **Scope:** Browse/search, cart & checkout, orders & shipping, wishlist, reviews, recommendations.

### C3. Loyalty & Engagement
- **Interfaces:** Customer · **Backend:** `storefront`
- **Tables:** `loyaltyAccounts`, `loyaltyTransactions`, `vouchers`, `banners`, `announcements`, `hotDeals`
- **Scope:** Points/tiers, daily check-ins, vouchers, merchandising (banners, hot deals, drops).

### C4. Reservations (Click & Reserve)
- **Interfaces:** Customer, Branch · **Backend:** `reservations`
- **Tables:** `reservations`
- **Scope:** Reserve/try-on in branch with confirmation codes and expiry.

---

## D. Supply Chain & Operations

### D1. Supplier Management ★
- **Interfaces:** Warehouse, Supplier, Admin · **Backend:** `suppliers`
- **Tables:** `suppliers` ★, `supplierProposals`
- **Scope:** ★ Supplier directory (name/address); supplier portal demand visibility + stock proposals.

### D2. Goods Receipt (Supplier Receiving) ★
- **Interfaces:** Warehouse · **Backend:** `suppliers/receiving`
- **Tables:** `supplierReceipts` ★, `supplierReceiptItems` ★
- **Scope:** PO + photo receipts, scan-to-count vs declared allocation, stock-in batch, discrepancy → admin alert.

### D3. Stock Movement & Transfers ★
- **Interfaces:** Warehouse, Branch, Admin · **Backend:** `transfers`, `warehouse/movements` ★
- **Tables:** `transfers`, `transferItems`, `transferBoxes`, `transferBoxItems`
- **Scope:** Stock requests, returns, inter-branch & ★ warehouse Move In/Out — two-step dispatch → confirm with box packing and discrepancy handling.

### D4. Logistics & Delivery
- **Interfaces:** Warehouse, Driver · **Backend:** `logistics`
- **Tables:** (`transfers.driverId`, `staffNotifications`)
- **Scope:** Driver assignment, in-transit tracking, delivery confirmation, driver performance analytics.

### D5. Internal Invoicing
- **Interfaces:** Warehouse, Admin · **Backend:** `invoices`
- **Tables:** `internalInvoices`, `internalInvoiceItems`
- **Scope:** Auto-generated inter-branch transfer invoices.

---

## E. Intelligence & Analytics

### E1. Demand Planning
- **Interfaces:** Branch, Warehouse, Supplier · **Backend:** `demand`
- **Tables:** `demandLogs`, `demandWeeklySummaries`
- **Scope:** Logged customer demand, weekly rollups, supplier demand signals.

### E2. AI Replenishment
- **Interfaces:** Warehouse · **Backend:** `ai`
- **Tables:** `restockSuggestions`
- **Scope:** Restock suggestions, surge alerts, auto-replenish (velocity/days-of-supply driven).

### E3. Analytics & Reporting
- **Interfaces:** Admin, Branch, Warehouse · **Backend:** `analytics`, `dashboards`
- **Tables:** `branchScores`, `*DailySnapshots`, `sellThruNotes`
- **Scope:** Sell-through, inventory aging, fulfillment speed, cross-sell, branch scorecards, BIR/sales reports.

---

## F. Administration

### F1. Admin Console
- **Interfaces:** Admin · **Backend:** `admin`, `branches`, `catalog`, `auth`
- **Tables:** `users`, `branches`, `settings`, catalog tables
- **Scope:** Users & branches, catalog management, site settings, seed/bootstrap. ★ Sidebar trimmed (Seed/Invoices/most Marketing/Expansion hidden).

### F2. Trading Calendar
- **Interfaces:** Admin · **Backend:** `admin`
- **Tables:** `tradingEvents`, `tradingReminders`
- **Scope:** Promotions/events/closures calendar with reminders.

---

## Interface → Module quick map

| Interface | Primary modules |
|-----------|-----------------|
| Customer Storefront | C2, C3, C4, B1, B3 |
| POS | C1, B1, B2, B3 |
| Branch | B2, C4, D3, E1, E3 |
| Warehouse | D1, D2, D3, D4, D5, B2, E1, E2, C1 |
| Driver | D4 |
| Supplier | D1, E1 |
| Admin | F1, F2, A1–A4, E3, B1, B3, D3, D5 |

---

## Legend & Notes
- `★` = added/expanded in the recent warehouse rework (see `docs/Warehouse-Modules.md` for detail).
- Companion docs: `docs/Features.md` (feature checklist), `docs/ERD.md` (data model), `docs/SAD.md` (architecture).
- This is a draft map for planning — adjust module boundaries/names to match how you want to track work.

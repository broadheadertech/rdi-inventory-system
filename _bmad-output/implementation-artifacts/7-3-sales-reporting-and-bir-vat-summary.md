# Story 7.3: Sales Reporting & BIR VAT Summary

Status: done

## Story

As an Owner/Admin or HQ Staff,
I want to view sales reports and generate VAT summaries,
so that I can track business performance and comply with BIR filing requirements.

## Acceptance Criteria

1. **Given** an authorized user navigates to `/hq/reports/`
   **When** they view daily sales summaries
   **Then** they can see sales per branch, with filters for date range, branch, and brand
   **And** date range picker defaults to "Today" with quick presets (Yesterday, This Week, This Month)
   **And** brand-level sales data is available (sales by Nike, Adidas, etc. across branches)

2. **Given** an authorized user navigates to `/hq/reports/bir/`
   **When** they request a VAT summary
   **Then** they can generate monthly/quarterly VAT summary data
   **And** the summary shows total taxable sales, total VAT collected, Senior/PWD discount totals
   **And** the data is formatted for BIR filing requirements
   **And** reports can be exported or downloaded

## Tasks / Subtasks

- [x] Task 1: Create `convex/dashboards/birReports.ts` with two HQ-only queries (AC: 1, 2)
  - [x] 1.1 Add module-level `PHT_OFFSET_MS` constant and local `getPhilippineDateRange(dateStr: string)` helper (duplicate pattern from `convex/pos/reconciliation.ts`)
  - [x] 1.2 Implement `getSalesReport` query: args `{ dateStart: v.string(), dateEnd: v.string(), branchId: v.optional(v.id("branches")) }` — requireRole(ctx, HQ_ROLES), parallel `by_branch_date` queries per branch (or single-branch if filtered), return per-branch `{ branchId, branchName, revenueCentavos, txnCount, avgTxnValueCentavos }` array
  - [x] 1.3 Implement `getBrandBreakdown` query: args `{ dateStart: v.string(), dateEnd: v.string(), branchId: v.optional(v.id("branches")) }` — requireRole, collect transactions, join transactionItems → variants → styles → categories → brands (full 4-hop chain), aggregate revenue per brand; return `{ brandId, brandName, revenueCentavos, txnCount }[]` sorted by revenueCentavos desc
  - [x] 1.4 Implement `getBirVatSummary` query: args `{ dateStart: v.string(), dateEnd: v.string() }` — requireRole, parallel `by_branch_date` queries across all branches for date range, aggregate `totalSalesCentavos`, `totalVatCentavos`, `totalSeniorPwdDiscountCentavos` (discountType === "senior" || "pwd"), `netTaxableSalesCentavos`, `txnCount`

- [x] Task 2: Create `app/hq/reports/page.tsx` — Sales Reports UI (AC: 1)
  - [x] 2.1 Add `"use client"` directive; import `useQuery` from `convex/react` and `api` from `convex/_generated/api`
  - [x] 2.2 Implement `toYYYYMMDD(date: Date): string` helper using vanilla JS (no date-fns)
  - [x] 2.3 Implement date preset helpers via `getPresetDates()`: today, yesterday, thisWeek (Monday), thisMonth (first of month)
  - [x] 2.4 Initialize state: `dateStart`, `dateEnd` (YYYYMMDD, default today), `activePreset`, `branchId`
  - [x] 2.5 Call `useQuery(api.dashboards.birReports.getSalesReport, ...)` for main table
  - [x] 2.6 Call `useQuery(api.dashboards.birReports.getBrandBreakdown, ...)` for brand section
  - [x] 2.7 Render quick preset buttons: "Today" | "Yesterday" | "This Week" | "This Month" — active highlighted
  - [x] 2.8 Render date range inputs: two `<input type="date" />` with YYYYMMDD ↔ YYYY-MM-DD conversion
  - [x] 2.9 Render Branch dropdown: populated from `salesData` branches; "All Branches" default
  - [x] 2.10 Render per-branch summary table with animate-pulse skeleton and empty state
  - [x] 2.11 Render brand breakdown section with animate-pulse skeleton and empty state
  - [x] 2.12 Add "BIR VAT Report" link to `/hq/reports/bir`

- [x] Task 3: Create `app/hq/reports/bir/page.tsx` — BIR VAT Summary UI (AC: 2)
  - [x] 3.1 Add `"use client"` directive; import `useQuery`, `api`
  - [x] 3.2 Initialize state: `dateStart` (first of current month), `dateEnd` (today); presets: "This Month", "Last Month", "This Quarter"
  - [x] 3.3 Call `useQuery(api.dashboards.birReports.getBirVatSummary, { dateStart, dateEnd })`
  - [x] 3.4 Render date range controls with "This Month" / "Last Month" / "This Quarter" presets
  - [x] 3.5 Render 4 summary metric cards: Gross Sales, Output VAT, Senior/PWD Discounts, Transactions — animate-pulse skeleton while loading
  - [x] 3.6 Render BIR-style VAT return table: Gross Sales / Less: Discounts / Net Taxable Sales / Output VAT / Transactions
  - [x] 3.7 Implement "Download CSV" button: Blob + `<a download>` — no server-side generation
  - [x] 3.8 Implement "Print" button: `window.print()` with `@media print` inline styles hiding nav
  - [x] 3.9 Add "← Back to Reports" link to `/hq/reports`

- [x] Task 4: Validate TypeScript — `npx tsc --noEmit` → 0 errors ✅
- [x] Task 5: Validate linting — `npx next lint` → 0 warnings ✅
- [x] Task 6: Update this story Status to "review" and sprint-status.yaml to "review"
- [x] Task 7: Code Review Follow-ups (AI adversarial review — all HIGH and MEDIUM issues resolved)
  - [x] H1: Refactored `getBrandBreakdown` — replaced sequential `await` for-loop with 4-wave parallel `Promise.all` batch fetching (collect unique IDs per level → batch fetch → populate Maps → single synchronous aggregation pass)
  - [x] H2: Added `brandFilter` state + search input above brand breakdown table in `page.tsx`; client-side filtering of `brandData` via `.filter()` matching brand name case-insensitively
  - [x] M1: Merged `brandTxnSets` computation into single aggregation pass — eliminated second `allItemArrays` iteration entirely
  - [x] M2: Added `isActive` guard for single-branch path in both `getSalesReport` and `getBrandBreakdown`: `.then((b) => (b && b.isActive ? [b] : []))`
  - [x] M3: Added `listActiveBranches` query to `birReports.ts`; `page.tsx` now uses `useQuery(api.dashboards.birReports.listActiveBranches)` to power branch dropdown independently of `salesData`
  - [x] L1: Variable shadowing resolved automatically — 4-wave refactor eliminated inner `const v = await ctx.db.get(...)` that shadowed `import { v }`
  - [x] Re-ran `npx tsc --noEmit` → 0 errors ✅; `npx next lint` → 0 warnings ✅

## Dev Notes

### Architecture & Module Placement

- `convex/dashboards/birReports.ts` — new file alongside `branchDashboard.ts` and `hqDashboard.ts`
- `app/hq/reports/page.tsx` — new route under existing `(hq)` route group (layout already applies `ALLOWED_ROLES = ["admin", "hqStaff"]`)
- `app/hq/reports/bir/page.tsx` — nested route; no separate layout needed (inherits `app/hq/layout.tsx`)
- Nav link `/hq/reports` already exists in `app/hq/layout.tsx` — no nav changes needed

### HQ Role Guard (requireRole, not withBranchScope)

All birReports.ts queries must use `requireRole`, NOT `withBranchScope`:
```typescript
import { requireRole } from "../_helpers/withBranchScope";
import { HQ_ROLES } from "../_helpers/permissions";

handler: async (ctx, args) => {
  await requireRole(ctx, HQ_ROLES); // throws if not admin/hqStaff
  // ... all-branch queries follow
}
```
[Source: convex/dashboards/hqDashboard.ts — same pattern]

### PHT Date Range Helper (duplicate, do not import from reconciliation.ts)

Add at top of `birReports.ts`:
```typescript
const PHT_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

// YYYYMMDD string → UTC startMs (midnight PHT) and endMs (23:59:59.999 PHT)
function getPhilippineDateRange(dateStr: string): { startMs: number; endMs: number } {
  const year = parseInt(dateStr.slice(0, 4));
  const month = parseInt(dateStr.slice(4, 6)) - 1;
  const day = parseInt(dateStr.slice(6, 8));
  const startMs = Date.UTC(year, month, day) - PHT_OFFSET_MS;
  const endMs = startMs + 86_400_000 - 1;
  return { startMs, endMs };
}
```
[Source: convex/pos/reconciliation.ts — same implementation]

For a date range spanning multiple days:
- `startMs` = `getPhilippineDateRange(dateStart).startMs`
- `endMs` = `getPhilippineDateRange(dateEnd).endMs`
- Convex query: `.withIndex("by_branch_date", q => q.eq("branchId", id).gte("createdAt", startMs).lte("createdAt", endMs))`

### Cross-Branch Query Pattern (getSalesReport, getBirVatSummary)

When no branchId filter → fetch all branches, then parallel queries:
```typescript
const branches = await ctx.db.query("branches").collect();
const results = await Promise.all(
  branches.map(async (branch) => {
    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branch._id).gte("createdAt", startMs).lte("createdAt", endMs)
      )
      .collect();
    return { branch, txns };
  })
);
```
[Source: convex/dashboards/hqDashboard.ts — same parallel branch pattern]

### N+1 Join for Brand Breakdown (getBrandBreakdown)

Brand attribution requires: transaction → transactionItems → variants → styles → brands

Use a Map cache to avoid redundant lookups:
```typescript
const variantCache = new Map<string, Doc<"variants">>();
const styleCache = new Map<string, Doc<"styles">>();
const brandAgg = new Map<string, { brandName: string; revenueCentavos: number; txnCount: number }>();

for (const txn of allTxns) {
  const items = await ctx.db.query("transactionItems")
    .withIndex("by_transaction", q => q.eq("transactionId", txn._id)).collect();
  for (const item of items) {
    const variantKey = item.variantId as string;
    if (!variantCache.has(variantKey)) {
      const v = await ctx.db.get(item.variantId);
      if (v) variantCache.set(variantKey, v);
    }
    const variant = variantCache.get(variantKey);
    if (!variant) continue;
    // similar cache for style...
  }
}
```
**Performance note:** This is a reporting query (not a real-time query). N+1 joins are acceptable for date-bounded reports since transaction counts are bounded by date range (not unbounded). Use Promise.all at the transaction level to parallelise item fetches; cache variants/styles/brands in Map to avoid duplicate lookups across transactions sharing the same products.

### VAT Fields in Transactions Table

```
transactions: {
  totalCentavos: number,        // gross sale amount
  subtotalCentavos: number,     // pre-VAT amount
  vatAmountCentavos: number,    // VAT portion (12%)
  discountAmountCentavos: number, // senior/PWD discount if applied
  discountType: "none" | "senior" | "pwd",
}
```
For BIR summary:
- **Gross Sales** = sum(totalCentavos)
- **Senior/PWD Discounts** = sum(discountAmountCentavos) where discountType in ["senior", "pwd"]
- **Net Taxable Sales** = Gross Sales − Discounts
- **Output VAT (12%)** = sum(vatAmountCentavos)
[Source: convex/schema.ts — transactions table; convex/_helpers/taxCalculations.ts]

### Money Display

All amounts stored as integer centavos. Use:
```typescript
function formatCentavos(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
```
No external currency library needed.

### YYYYMMDD ↔ HTML Date Input

HTML `<input type="date">` uses `YYYY-MM-DD` format; Convex args use `YYYYMMDD` (no dashes):
```typescript
// YYYYMMDD → YYYY-MM-DD for input value
function toInputDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}
// YYYY-MM-DD → YYYYMMDD from input onChange
function fromInputDate(yyyy_mm_dd: string): string {
  return yyyy_mm_dd.replace(/-/g, "");
}
```

### Quick Date Preset Helpers (Client-Side, Local Timezone)

Since the system is deployed in the Philippines, browser local timezone = PHT is an acceptable assumption:
```typescript
function toYYYYMMDD(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
const today = new Date();
const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
const thisWeekStart = new Date(today);
thisWeekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7)); // Monday
const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
const thisQuarterStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
```

### CSV Download (No Server Needed)

```typescript
function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
```

### Recharts (if used for brand breakdown bar chart)

Recharts 3.x Tooltip type pattern (from Story 7.2 debug log):
```tsx
<Tooltip
  formatter={(value: number | undefined) => [
    value !== undefined ? formatCentavos(value) : "—",
    "Revenue",
  ]}
  labelFormatter={(label) => `${label}`}
/>
```

### Testing Notes

No automated tests required for this story (no testing framework configured). Manual verification:
- Navigate to `/hq/reports` as hqStaff — verify data loads and presets work
- Navigate to `/hq/reports/bir` — verify VAT totals match known transactions
- TypeScript: `npx tsc --noEmit` → 0 errors
- Lint: `npx next lint` → 0 warnings/errors

### Project Structure Notes

- Route group `(hq)` already exists at `app/hq/` with `layout.tsx` enforcing `ALLOWED_ROLES`
- `app/hq/reports/` directory does NOT yet exist — create both `page.tsx` files
- `convex/dashboards/birReports.ts` does NOT yet exist — create new file
- `/hq/reports` nav link already present in `app/hq/layout.tsx` nav items

### References

- [Source: _bmad-output/implementation-artifacts/epics.md#Epic 7 Story 7.3]
- [Source: convex/dashboards/hqDashboard.ts — requireRole, cross-branch parallel query pattern]
- [Source: convex/dashboards/branchDashboard.ts — PHT_OFFSET_MS module-level, withBranchScope patterns]
- [Source: convex/pos/reconciliation.ts — getPhilippineDateRange helper, by_branch_date range query]
- [Source: convex/_helpers/taxCalculations.ts — VAT_RATE=0.12, calculateTaxBreakdown]
- [Source: convex/schema.ts — transactions table fields: vatAmountCentavos, discountAmountCentavos, discountType]
- [Source: app/hq/layout.tsx — ALLOWED_ROLES, nav structure]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

**D1 — `@/components/ui/card` does not exist in this project**
- Error: `Cannot find module '@/components/ui/card'` — card component was not installed (shadcn components installed: table, dialog, button, input, select, badge, label, separator, sonner)
- Fix: Replaced all `Card`, `CardHeader`, `CardTitle`, `CardContent` usages with equivalent div-based markup (`rounded-lg border p-4` pattern)
- Pattern for future stories: Check `components/ui/` before importing any shadcn component

**D2 — Convex codegen required before TypeScript validation**
- Error: `Property 'birReports' does not exist on type '{ branchDashboard: ...}` until `npx convex codegen` was run
- Fix: Ran `npx convex codegen` after creating `birReports.ts` to generate updated `convex/_generated/api.ts`
- Pattern: Always run codegen before `tsc --noEmit` when new Convex query files are added

**D3 — `requireRole` and `HQ_ROLES` are both in `permissions.ts` (not `withBranchScope.ts`)**
- Dev Notes erroneously stated `import { requireRole } from "../_helpers/withBranchScope"` — `requireRole` is NOT exported from `withBranchScope.ts`
- Correct import: `import { requireRole, HQ_ROLES } from "../_helpers/permissions";`
- Verified by reading `convex/_helpers/permissions.ts` (lines 81-90)

**D4 — Brand chain is 4 hops: transactionItem → variant → style → category → brand**
- `styles` has `categoryId` (not `brandId` directly)
- `categories` has `brandId` → `brands.name`
- Cache needed at 4 levels: variantCache, styleCache, categoryCache, brandCache

### Completion Notes List

- Created `convex/dashboards/birReports.ts` with 3 queries: `getSalesReport`, `getBrandBreakdown`, `getBirVatSummary`
  - All use `requireRole(ctx, HQ_ROLES)` from `convex/_helpers/permissions.ts`
  - Local `getPhilippineDateRange(YYYYMMDD)` helper duplicated from `reconciliation.ts` pattern
  - `getBrandBreakdown`: 4-level Map cache (variant/style/category/brand) for efficient brand attribution
  - `getBirVatSummary`: Correctly identifies Senior/PWD discounts via `discountType === "senior" || "pwd"` (field is `v.optional(v.union(...))`)
  - Returns `netTaxableSalesCentavos` (pre-computed: totalSales - discounts) for direct BIR table use
- Created `app/hq/reports/page.tsx` — Sales Reports UI
  - Date presets: Today (default), Yesterday, This Week, This Month, + custom date range inputs
  - Branch dropdown populated from `salesData` return (avoids separate query)
  - Per-branch table with totals row; brand breakdown table
  - `toInputDate`/`fromInputDate` helpers for YYYYMMDD ↔ YYYY-MM-DD conversion
- Created `app/hq/reports/bir/page.tsx` — BIR VAT Summary UI
  - Period presets: This Month (default), Last Month, This Quarter
  - 4 summary metric cards + BIR-formatted VAT return table
  - CSV download via Blob + `<a download>` (no server-side generation)
  - Print via `window.print()` with `@media print` CSS hiding `.no-print` elements
  - Back navigation to `/hq/reports`
- `npx tsc --noEmit` → 0 errors ✅
- `npx next lint` → 0 warnings ✅

### File List

- `convex/dashboards/birReports.ts` — NEW: 3 HQ report queries (getSalesReport, getBrandBreakdown, getBirVatSummary)
- `app/hq/reports/page.tsx` — NEW: Sales reports UI with date presets, branch/brand filters, tables
- `app/hq/reports/bir/page.tsx` — NEW: BIR VAT summary UI with CSV download and print support
- `convex/dashboards/birReports.ts` — UPDATED: added `listActiveBranches` query; refactored `getBrandBreakdown` to 4-wave parallel batch fetching; M2 isActive guards; M1 single-pass aggregation

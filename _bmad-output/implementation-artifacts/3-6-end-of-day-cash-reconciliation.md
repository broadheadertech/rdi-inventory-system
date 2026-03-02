# Story 3.6: End-of-Day Cash Reconciliation

Status: done

## Story

As a **Cashier**,
I want to reconcile my cash drawer at the end of the day,
So that I can verify my physical cash matches the system total and report any discrepancies.

## Acceptance Criteria

1. **Given** the cashier navigates to the reconciliation screen in the POS
   **When** the end-of-day view loads
   **Then** it shows a single screen with: system-calculated expected cash total, input field for physical cash count, auto-calculated difference
   **And** the reconciliation can be completed in under 2 minutes

2. **Given** the cashier enters their physical cash count
   **When** the system calculates the difference
   **Then** the difference is displayed instantly with clear visual feedback:
   - Green status if balanced (difference = ₱0.00)
   - Amber/warning status if discrepancy detected (over or short)

3. **Given** the cashier submits the reconciliation with the physical count
   **When** the reconciliation is saved
   **Then** discrepancies (over/short) are logged in the audit trail with the cashier's user ID, branch, and timestamp

4. **Given** a reconciliation record is submitted
   **When** it is stored in the database
   **Then** the reconciliation record is stored for manager/HQ review
   **And** it includes: expected cash, actual cash, difference, transaction count, sales breakdown by payment method, branch, cashier, date

5. **Given** the cashier is on the POS main screen
   **When** they want to perform end-of-day reconciliation
   **Then** there is a clear navigation path to the reconciliation screen

6. **Given** the reconciliation is successfully submitted
   **When** the cashier sees the result
   **Then** a success confirmation is shown with the reconciliation summary

7. **Given** the system calculates expected cash
   **When** it queries the day's transactions
   **Then** expected cash = sum of `totalCentavos` for all cash-method transactions at this branch today (in PHT timezone)
   **And** only completed (non-voided) transactions are included

## Tasks / Subtasks

- [x] Task 1: Add `reconciliations` table to `convex/schema.ts` (AC: #3, #4)
  - [x]1.1 Add `reconciliations` table to `convex/schema.ts` with fields: `branchId: v.id("branches")`, `cashierId: v.id("users")`, `reconciliationDate: v.string()` (YYYYMMDD format in PHT), `expectedCashCentavos: v.number()`, `actualCashCentavos: v.number()`, `differenceCentavos: v.number()`, `transactionCount: v.number()`, `cashSalesCentavos: v.number()`, `gcashSalesCentavos: v.number()`, `mayaSalesCentavos: v.number()`, `totalSalesCentavos: v.number()`, `notes: v.optional(v.string())`, `createdAt: v.number()`.
  - [x]1.2 Add indexes: `.index("by_branch", ["branchId"])`, `.index("by_branch_date", ["branchId", "reconciliationDate"])`, `.index("by_cashier", ["cashierId"])`.
  - [x]1.3 Run `npx convex dev` or `npx convex codegen` to regenerate types after schema change.

- [x] Task 2: Create `convex/pos/reconciliation.ts` with query + mutation (AC: #1, #3, #4, #7)
  - [x]2.1 Create file `convex/pos/reconciliation.ts`. Import: `query`, `mutation` from `../_generated/server`, `v`, `ConvexError` from `convex/values`, `withBranchScope` from `../_helpers/withBranchScope`, `POS_ROLES` from `../_helpers/permissions`, `_logAuditEntry` from `../_helpers/auditLog`.
  - [x]2.2 Create `getDailySummary` query with args: `{ date: v.string() }` (YYYYMMDD format). Auth gate: `withBranchScope(ctx)` + `POS_ROLES` check. Query all transactions for the branch on the given date using the `by_branch_date` index. Calculate: total transaction count, sum of all `totalCentavos`, sum of cash-only `totalCentavos` (where `paymentMethod === "cash"`), sum of gcash `totalCentavos`, sum of maya `totalCentavos`. The date range must be computed as start-of-day and end-of-day timestamps in PHT (UTC+8). Return: `{ transactionCount, totalSalesCentavos, cashSalesCentavos, gcashSalesCentavos, mayaSalesCentavos, expectedCashCentavos }` where `expectedCashCentavos = cashSalesCentavos`.
  - [x]2.3 Create `submitReconciliation` mutation with args: `{ date: v.string(), actualCashCentavos: v.number(), notes: v.optional(v.string()) }`. Auth gate: `withBranchScope(ctx)` + `POS_ROLES` check. Validate `actualCashCentavos >= 0`. Internally call the same daily summary logic to get `expectedCashCentavos` (server-authoritative — do NOT trust client-provided expected amount). Calculate `differenceCentavos = actualCashCentavos - expectedCashCentavos`. Insert into `reconciliations` table. Call `_logAuditEntry` with action `"reconciliation.submit"`, entityType `"reconciliations"`. Return `{ reconciliationId, differenceCentavos, expectedCashCentavos, actualCashCentavos }`.
  - [x]2.4 Create helper `getPhilippineDateRange(dateStr: string): { startMs: number, endMs: number }` that converts a YYYYMMDD string to start-of-day (00:00:00 PHT) and end-of-day (23:59:59.999 PHT) Unix timestamps. PHT = UTC+8 so: start = Date.UTC(year, month-1, day) - 8*60*60*1000. This helper ensures correct timezone-aware date filtering.

- [x] Task 3: Create `app/pos/reconciliation/page.tsx` — the route page (AC: #1, #5)
  - [x]3.1 Create `app/pos/reconciliation/page.tsx` as a "use client" page. Import and render `ReconciliationPanel` component. The page should be minimal — just rendering the panel within the POS layout.
  - [x]3.2 Ensure the page is protected by the existing POS layout's auth guard (already handled by `app/pos/layout.tsx`).

- [x] Task 4: Create `components/pos/ReconciliationPanel.tsx` — single-screen reconciliation UI (AC: #1, #2, #5, #6)
  - [x]4.1 Create `components/pos/ReconciliationPanel.tsx` with `"use client"` directive. Import: `useQuery`, `useMutation` from `convex/react`, `api` from `@/convex/_generated/api`, `Button` from `@/components/ui/button`, `formatCurrency` from `@/lib/formatters`, icons from `lucide-react`.
  - [x]4.2 Compute today's date in PHT (YYYYMMDD format) using the same UTC+8 offset pattern. Pass to `useQuery(api.pos.reconciliation.getDailySummary, { date })`.
  - [x]4.3 **Summary section** (top): Display total transactions count, total sales amount, and breakdown by payment method (Cash / GCash / Maya) with `formatCurrency`. This gives the cashier context before counting.
  - [x]4.4 **Reconciliation form** (center): Display "Expected Cash" (system-calculated, read-only, prominent). Input field for "Physical Cash Count" — numeric input, large (56px min-height), auto-focused. As the cashier types, auto-calculate and display the difference. Use green text/border for balanced (₱0.00), amber for discrepancy.
  - [x]4.5 **Optional notes field**: A small text input for the cashier to add notes (e.g., "₱50 short — customer dispute"). Not required.
  - [x]4.6 **Submit button**: "Submit Reconciliation" — 56px min-height, full-width, disabled until physical count is entered. Calls `useMutation(api.pos.reconciliation.submitReconciliation)`. Loading state with `Loader2` spinner.
  - [x]4.7 **Success state**: After submission, show a success overlay/section with: green checkmark, "Reconciliation Complete", summary (expected, actual, difference), timestamp. Provide a "Back to POS" link/button.
  - [x]4.8 **Error handling**: Catch `ConvexError` from mutation. Display inline error message. Do NOT clear the form on error — let cashier retry.
  - [x]4.9 **Navigation**: Include a "Back to POS" link at the top (using `next/link` to `/pos`).
  - [x]4.10 **Layout**: Single column, centered content, max-width ~480px. White background. Responsive for both tablet and desktop. Follow POS typography (18px base, Major Third scale).

- [x] Task 5: Add navigation link from POS main page to reconciliation (AC: #5)
  - [x]5.1 In `app/pos/page.tsx` or the POS layout, add a navigation element (button or link) to `/pos/reconciliation`. This should be visible but not dominant (secondary action). Use an icon like `ClipboardCheck` or `Calculator` from lucide-react. Label: "End of Day" or "Reconciliation".

- [x] Task 6: Verify integration (AC: all)
  - [x]6.1 Run `npx convex codegen` to regenerate types for new schema + functions.
  - [x]6.2 Run `npx tsc --noEmit` — zero TypeScript errors.
  - [x]6.3 Run `npx next lint` — zero lint warnings/errors.

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**`convex/pos/reconciliation.ts` — Reconciliation Functions:**
This file creates both a query (`getDailySummary`) and a mutation (`submitReconciliation`). Both MUST follow the same auth pattern as `convex/pos/transactions.ts`: call `withBranchScope(ctx)` first, then verify `POS_ROLES`. Branch isolation is automatic via `scope.branchId`.

```typescript
// Auth pattern — replicate exactly from convex/pos/transactions.ts:
const scope = await withBranchScope(ctx);
if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
  throw new ConvexError({ code: "UNAUTHORIZED" });
}
```

**Expected Cash Calculation — Server-Authoritative:**
The mutation MUST recalculate expected cash server-side. Never trust the client-provided expected amount. The query provides the value for display, but the mutation independently computes it for the stored record. This prevents tampering.

```typescript
// In submitReconciliation mutation:
// 1. Independently calculate expectedCashCentavos from transactions
// 2. Store the server-calculated value, NOT any client-provided value
// 3. differenceCentavos = actualCashCentavos - expectedCashCentavos
```

**PHT Date Range Calculation:**
The `by_branch_date` index on transactions uses `createdAt` (Unix timestamp ms). To query "today's transactions in PHT":
- PHT = UTC+8 → offset = 8 * 60 * 60 * 1000 = 28,800,000 ms
- Start of day in PHT: `Date.UTC(year, month, day) - PHT_OFFSET_MS`
- End of day in PHT: start + 86,400,000 - 1 (24h in ms minus 1ms)
- Use these bounds with the `by_branch_date` index range query

```typescript
// Example: querying today's transactions
function getPhilippineDateRange(dateStr: string) {
  const year = parseInt(dateStr.slice(0, 4));
  const month = parseInt(dateStr.slice(4, 6)) - 1; // 0-indexed
  const day = parseInt(dateStr.slice(6, 8));
  const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
  const startMs = Date.UTC(year, month, day) - PHT_OFFSET_MS;
  const endMs = startMs + 86_400_000 - 1;
  return { startMs, endMs };
}

// Use with index range query:
const transactions = await ctx.db
  .query("transactions")
  .withIndex("by_branch_date", (q) =>
    q.eq("branchId", scope.branchId)
      .gte("createdAt", startMs)
      .lte("createdAt", endMs)
  )
  .collect();
```

**Audit Logging Pattern:**
Every reconciliation submission MUST be logged to the audit trail. Use `_logAuditEntry` with the established pattern:

```typescript
await _logAuditEntry(ctx, {
  action: "reconciliation.submit",
  userId: scope.userId,
  branchId: scope.branchId,
  entityType: "reconciliations",
  entityId: reconciliationId.toString(),
  after: {
    expectedCashCentavos,
    actualCashCentavos,
    differenceCentavos,
    reconciliationDate: args.date,
  },
});
```

**Route Structure:**
Per architecture, the reconciliation page lives at `app/pos/reconciliation/page.tsx`. It inherits the POS layout's auth guard from `app/pos/layout.tsx` — no additional auth middleware needed at the page level.

**Schema Addition — `reconciliations` Table:**
This is the ONLY schema change in this story. The table stores one record per branch per day per reconciliation session. Fields use centavos for all money amounts (same as transactions). The `reconciliationDate` field is a string (`"20260228"`) for easy grouping/querying — not a timestamp.

```typescript
reconciliations: defineTable({
  branchId: v.id("branches"),
  cashierId: v.id("users"),
  reconciliationDate: v.string(),      // YYYYMMDD in PHT
  expectedCashCentavos: v.number(),    // System-calculated sum of cash sales
  actualCashCentavos: v.number(),      // Cashier-entered physical count
  differenceCentavos: v.number(),      // actual - expected (positive = over, negative = short)
  transactionCount: v.number(),        // Total transactions for the day
  cashSalesCentavos: v.number(),       // Sum of cash-method totals
  gcashSalesCentavos: v.number(),      // Sum of gcash-method totals
  mayaSalesCentavos: v.number(),       // Sum of maya-method totals
  totalSalesCentavos: v.number(),      // Sum of ALL payment method totals
  notes: v.optional(v.string()),       // Optional cashier notes
  createdAt: v.number(),               // Submission timestamp
})
  .index("by_branch", ["branchId"])
  .index("by_branch_date", ["branchId", "reconciliationDate"])
  .index("by_cashier", ["cashierId"]),
```

**UI Design (single-screen pattern):**
Per UX spec, reconciliation is a "one-screen" interface. No multi-step wizard. Layout:
- **Top**: Back to POS link + "End of Day Reconciliation" header
- **Summary cards**: Transaction count, total sales, breakdown by payment method
- **Reconciliation form**: Expected Cash (read-only), Physical Count (input), Difference (auto-calculated)
- **Submit button**: Full-width, 56px, primary color
- **Success state**: Overlay with green checkmark and summary

All POS touch targets must be 56px minimum (exceeds WCAG 44px requirement). Typography: 18px base with Major Third (1.25) scale.

**Money Display:**
Use `formatCurrency` from `@/lib/formatters` for all currency display in the UI. This uses `Intl.NumberFormat("en-PH")` which produces `₱149.99` format with thousand separators.

**Numeric Input for Cash Count:**
Use a standard `<input type="number">` or `<input inputMode="decimal">` for the physical cash count. The value represents pesos (not centavos) since cashiers think in pesos. Convert to centavos before sending to the mutation: `Math.round(parseFloat(value) * 100)`. Validate: must be >= 0, must be a valid number.

### Scope Boundaries — DO NOT IMPLEMENT

- **Starting cash float / opening balance** → Not in MVP (reconciliation only tracks sales-based expected cash)
- **Manager approval workflow** → Not in this story (records are stored for review, but no approval gate)
- **Historical reconciliation view / reports** → Future story (data is stored, UI can be built later)
- **Multiple reconciliations per day** → Allow it (cashier might need to re-reconcile if they made a mistake)
- **Reconciliation editing / voiding** → Not in scope
- **Offline reconciliation** → Epic 4 (requires online connectivity for accurate transaction totals)
- **Denomination breakdown** → Not in MVP (just total physical count)

### Existing Code to Build Upon (Stories 3.1-3.5)

**Already exists — DO NOT recreate:**
- `convex/pos/transactions.ts` — `createTransaction` mutation (creates the transaction records this story queries)
- `convex/_helpers/withBranchScope.ts` — Auth + branch scoping (returns `{ userId, branchId, user, canAccessAllBranches }`)
- `convex/_helpers/permissions.ts` — `POS_ROLES = ["admin", "manager", "cashier"]`
- `convex/_helpers/auditLog.ts` — `_logAuditEntry()` helper for immutable audit logs
- `app/pos/layout.tsx` — POS layout with auth guard (Clerk + role check)
- `app/pos/page.tsx` — Main POS page (product search + cart)
- `components/pos/POSCartPanel.tsx` — Cart panel with payment flow and receipt viewer
- `lib/formatters.ts` — `formatCurrency(centavos)`, `formatDate(timestamp)`, `formatDateTime(timestamp)`
- `lib/constants.ts` — `PaymentMethod`, `DiscountType`, `VAT_RATE`
- `convex/schema.ts` — All existing tables (transactions, transactionItems, auditLogs, etc.)

**Key Patterns from Stories 3.1-3.5 (follow these):**
- `withBranchScope(ctx)` + `(POS_ROLES as readonly string[]).includes(scope.user.role)` in every POS Convex function
- `"use client"` on all POS UI components
- `formatCurrency` from `@/lib/formatters` for all price display
- `min-h-14` (56px) for all POS touch targets
- `Loader2` spinner for loading states
- Inline error messages via `ConvexError` catch (not toast/modal)
- `import type { PaymentMethod } from "@/lib/constants"` for type imports
- Money stored as centavos (integer), displayed via `formatCurrency`

**Key Schema Indexes (MUST use):**
- `transactions.by_branch_date` — `["branchId", "createdAt"]` for querying daily transactions by branch
- `transactions.by_cashier` — `["cashierId"]` for cashier-specific queries

### Previous Story Learnings (from Stories 3.4 + 3.5 Code Reviews)

- **H1 (3.4)**: Server must look up prices from DB — never trust client-provided values. Apply same principle: server MUST independently calculate expectedCashCentavos, not trust client.
- **H2 (3.4)**: Error messages must be specific. If reconciliation fails, show specific reason.
- **H1 (3.5)**: `formatPrice` needed thousand-separator commas. Use `formatCurrency` from lib/formatters for UI display (already handles this).
- **H2 (3.5)**: Added ErrorBoundary for Convex query errors. Consider error states for the reconciliation query too.
- **M1 (3.5)**: Intl.NumberFormat not available in react-pdf. This story is UI-only (no PDF), so `formatCurrency` with Intl is fine.
- **M2 (3.4)**: Import `DiscountType` and `PaymentMethod` from `lib/constants` instead of repeating literals.
- **M3 (3.4)**: Desktop and mobile variants must have consistent behavior.
- **Pattern**: Run `npx convex codegen` after schema changes to regenerate types.

### Project Structure Notes

```
Files to CREATE in this story:
├── convex/pos/
│   └── reconciliation.ts             # getDailySummary query + submitReconciliation mutation
├── app/pos/
│   └── reconciliation/
│       └── page.tsx                   # Reconciliation route page
├── components/pos/
│   └── ReconciliationPanel.tsx        # Single-screen reconciliation UI

Files to MODIFY in this story:
├── convex/schema.ts                   # Add reconciliations table
├── app/pos/page.tsx                   # Add navigation link to reconciliation (OR layout.tsx)

Files to reference (NOT modify):
├── convex/pos/transactions.ts         # Transaction records to query for daily summary
├── convex/_helpers/withBranchScope.ts  # Auth + branch scoping
├── convex/_helpers/permissions.ts     # POS_ROLES
├── convex/_helpers/auditLog.ts        # _logAuditEntry
├── lib/constants.ts                   # PaymentMethod type
├── lib/formatters.ts                  # formatCurrency, formatDateTime
├── app/pos/layout.tsx                 # POS layout with auth guard
├── components/pos/POSCartPanel.tsx     # Reference for POS UI patterns
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.6]
- [Source: _bmad-output/planning-artifacts/architecture.md — Route: (pos)/reconciliation/page.tsx for FR25]
- [Source: _bmad-output/planning-artifacts/architecture.md — Convex Function Organization: convex/pos/transactions.ts handles FR25]
- [Source: _bmad-output/planning-artifacts/architecture.md — withBranchScope pattern]
- [Source: _bmad-output/planning-artifacts/architecture.md — Money Storage: centavos, Integer math]
- [Source: _bmad-output/planning-artifacts/architecture.md — Audit Log: _logAuditEntry, immutable audit trail]
- [Source: _bmad-output/planning-artifacts/architecture.md — Error Handling: Typed ConvexError]
- [Source: _bmad-output/planning-artifacts/architecture.md — Convex Function Naming: get prefix for queries, verb prefix for mutations]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — One-Screen Reconciliation pattern (Square POS benchmark)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — End-of-Day Drawer Balance: 2 minutes max]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — POS: 56px touch targets, 18px font, Major Third scale]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Never require more than 2 fields for any POS action]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Auto-calculations with clear breakdowns]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Confirmation dialogs restate the action]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — StatusPill: green for success, amber for warning]
- [Source: convex/schema.ts — transactions table with by_branch_date index]
- [Source: convex/schema.ts — auditLogs table]
- [Source: convex/_helpers/auditLog.ts — _logAuditEntry signature and usage pattern]
- [Source: convex/pos/transactions.ts — createTransaction: paymentMethod, totalCentavos, branchId, cashierId fields]
- [Source: _bmad-output/implementation-artifacts/3-4-payment-processing-and-transaction-completion.md — Code review learnings]
- [Source: _bmad-output/implementation-artifacts/3-5-bir-compliant-receipt-generation.md — Code review learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Convex codegen ran twice: once after schema change (Task 1), once for final verification (Task 6)
- tsc: 0 errors on first pass
- lint: 0 warnings/errors on first pass

### Completion Notes List

- Task 1: Added `reconciliations` table to `convex/schema.ts` with 13 fields (branchId, cashierId, reconciliationDate, expectedCashCentavos, actualCashCentavos, differenceCentavos, transactionCount, cashSalesCentavos, gcashSalesCentavos, mayaSalesCentavos, totalSalesCentavos, notes, createdAt) and 3 indexes (by_branch, by_branch_date, by_cashier).
- Task 2: Created `convex/pos/reconciliation.ts` with `getDailySummary` query and `submitReconciliation` mutation. Both use `withBranchScope` + `POS_ROLES` auth gate. `getPhilippineDateRange` helper converts YYYYMMDD to UTC timestamp range for PHT timezone. Query uses `by_branch_date` index with range bounds. Mutation independently recalculates expected cash (server-authoritative), validates `actualCashCentavos >= 0`, inserts reconciliation record, logs to audit trail via `_logAuditEntry`.
- Task 3: Created `app/pos/reconciliation/page.tsx` — minimal "use client" page rendering ReconciliationPanel. Protected by existing POS layout auth guard.
- Task 4: Created `components/pos/ReconciliationPanel.tsx` — single-screen reconciliation UI. Features: daily summary (transaction count, total sales, Cash/GCash/Maya breakdown), expected cash display (read-only), physical cash input (peso-denominated, auto-focused, 56px height), auto-calculated difference with color feedback (green=balanced, amber=discrepancy), optional notes field, submit button with loading state, success overlay with summary and "Back to POS" link, inline error handling via ConvexError catch.
- Task 5: Added "End of Day" link in POS page's scanner header area using ClipboardCheck icon. Secondary styling (border, muted text), text hidden on smallest screens.
- Task 6: tsc 0 errors, lint 0 warnings/errors.

### File List

- `convex/schema.ts` — MODIFIED (added reconciliations table with 3 indexes)
- `convex/pos/reconciliation.ts` — CREATED (getDailySummary query + submitReconciliation mutation)
- `app/pos/reconciliation/page.tsx` — CREATED (reconciliation route page)
- `components/pos/ReconciliationPanel.tsx` — CREATED (single-screen reconciliation UI)
- `app/pos/page.tsx` — MODIFIED (added "End of Day" navigation link)

## Change Log

- 2026-02-28: Story 3.6 implementation complete — end-of-day cash reconciliation with daily summary, physical cash input, auto-calculated difference, audit trail logging, and POS navigation
- 2026-02-28: Code review — 3 MEDIUM + 3 LOW findings. Fixed all 3 MEDIUM:
  - M1: Added `validateDateFormat` with `/^\d{8}$/` regex in submitReconciliation + getDailySummary to prevent malformed date strings producing NaN timestamp bounds
  - M2: Changed cash-short text color from `text-red-600` to `text-amber-600` in ReconciliationPanel (form + success state) to match AC #2 ("amber for all discrepancies")
  - M3: Extracted `_computeDailySummary(ctx, branchId, dateStr)` shared helper to eliminate duplicated transaction aggregation logic between getDailySummary and submitReconciliation. Properly typed with `QueryCtx | MutationCtx` and `Id<"branches">`

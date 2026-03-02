# Story 3.5: BIR-Compliant Receipt Generation

Status: done

## Story

As a **Cashier**,
I want a BIR-compliant receipt generated automatically on sale completion,
So that the business meets Philippine tax authority requirements.

## Acceptance Criteria

1. **Given** a completed transaction
   **When** the receipt is generated
   **Then** the receipt includes all BIR-required fields:
   - Business name (white-label from settings)
   - TIN (Tax Identification Number from settings)
   - Branch address
   - Date/time (Asia/Manila timezone)
   - Itemized breakdown with product name, size, color, unit price, and quantity
   - VAT line (12%)
   - Discount line (if Senior/PWD applied)
   - Grand total
   - Sequential receipt number (YYYYMMDD-NNNN)

2. **Given** a Senior/PWD discounted transaction
   **When** the receipt is generated
   **Then** the receipt shows the discount computation breakdown:
   - Original VAT-inclusive price per item
   - VAT-exempt base price (price / 1.12)
   - Discount amount (20% of VAT-exempt base)
   - Final discounted price per item
   **And** VAT amount shows as ₱0.00 (VAT-exempt)

3. **Given** a completed transaction
   **When** the cashier wants to view the receipt
   **Then** the receipt is viewable on-screen as a styled preview within the POS interface

4. **Given** the receipt is displayed
   **When** the cashier taps "Download PDF"
   **Then** a BIR-compliant PDF is generated via `@react-pdf/renderer` and downloaded
   **And** the PDF layout matches the on-screen preview

5. **Given** a completed transaction
   **When** the receipt data is needed later
   **Then** receipt data is retrievable from Convex via `convex/pos/receipts.ts` query
   **And** the query joins transaction, transactionItems, variant/style names, branch info, and business settings

6. **Given** a cash payment
   **When** the receipt is generated
   **Then** the receipt shows: amount tendered and change given

7. **Given** a GCash or Maya payment
   **When** the receipt is generated
   **Then** the receipt shows the payment method label (no amount tendered/change)

8. **Given** the TransactionSuccess overlay is shown (from Story 3.4)
   **When** the transaction completes
   **Then** a "View Receipt" button is added to the success overlay
   **And** tapping it opens the receipt viewer instead of dismissing

## Tasks / Subtasks

- [x] Task 1: Create `convex/pos/receipts.ts` with `getReceiptData` query (AC: #1, #2, #5, #6, #7)
  - [x]1.1 Create file `convex/pos/receipts.ts`. Import: `query` from `../_generated/server`, `v` from `convex/values`, `withBranchScope` from `../_helpers/withBranchScope`, `POS_ROLES` from `../_helpers/permissions`.
  - [x]1.2 Define `getReceiptData` query with args: `transactionId: v.id("transactions")`. Auth gate: `withBranchScope(ctx)` + `POS_ROLES` check (same pattern as `convex/pos/transactions.ts`).
  - [x]1.3 Load the transaction record: `ctx.db.get(args.transactionId)`. Throw if not found. Verify `transaction.branchId === scope.branchId` to enforce branch isolation.
  - [x]1.4 Load transaction items: `ctx.db.query("transactionItems").withIndex("by_transaction", q => q.eq("transactionId", args.transactionId)).collect()`. For each item, load the variant via `ctx.db.get(item.variantId)`, then load the style via `ctx.db.get(variant.styleId)`. Build enriched items array with: `styleName: style.name`, `sku: variant.sku`, `size: variant.size`, `color: variant.color`, `quantity`, `unitPriceCentavos`, `lineTotalCentavos`.
  - [x]1.5 Load branch info: `ctx.db.get(transaction.branchId)`. Extract `name` and `address`.
  - [x]1.6 Load business settings: query `settings` table with `by_key` index for keys: `"businessName"`, `"tin"`, `"businessAddress"` (fallback to branch address if no business address). Use `ctx.db.query("settings").withIndex("by_key", q => q.eq("key", keyName)).unique()`. Default to empty string if setting not found.
  - [x]1.7 Return structured `ReceiptData` object: `{ transaction: { receiptNumber, createdAt, subtotalCentavos, vatAmountCentavos, discountAmountCentavos, totalCentavos, paymentMethod, discountType, amountTenderedCentavos, changeCentavos }, items: enrichedItems[], branch: { name, address }, business: { name, tin }, cashierName }`. Load cashier name via `ctx.db.get(transaction.cashierId)`.

- [x] Task 2: Create `components/shared/ReceiptPDF.tsx` — BIR-compliant PDF document (AC: #1, #2, #4, #6, #7)
  - [x]2.1 Create file `components/shared/ReceiptPDF.tsx`. Import `Document`, `Page`, `View`, `Text`, `StyleSheet` from `@react-pdf/renderer`. This is a React component that returns a `<Document>` — NOT a "use client" component (react-pdf renders on demand).
  - [x]2.2 Define `ReceiptPDFProps` type matching the `ReceiptData` return shape from Task 1. Create the `ReceiptPDF` component accepting these props.
  - [x]2.3 **PDF Header section**: Business name (bold, 14pt), TIN (10pt), branch address (10pt), horizontal rule separator. If businessName is empty, show "RedBox Apparel" as fallback.
  - [x]2.4 **Receipt metadata**: Receipt number (bold), date/time formatted in Asia/Manila timezone using `new Date(createdAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })`, cashier name. Horizontal rule.
  - [x]2.5 **Itemized breakdown table**: For each item: `{styleName} - {size}/{color}` on first line, `{qty} x {formatPrice(unitPriceCentavos)} = {formatPrice(lineTotalCentavos)}` on second line. Right-align amounts. Use a helper `formatPrice(centavos)` that returns `"₱" + (centavos / 100).toFixed(2)` (cannot use `Intl` in react-pdf, use manual formatting).
  - [x]2.6 **Tax breakdown for regular (discountType === "none")**: Subtotal, "VAT (12%): {vatAmount}", horizontal rule, "TOTAL: {total}" in bold 14pt.
  - [x]2.7 **Tax breakdown for Senior/PWD (discountType === "senior" or "pwd")**: Subtotal (VAT-inclusive), "Less: VAT (VAT Exempt Sale)", "VAT-Exempt Amount: {subtotal - vatAmount}" (show the base price), "Less: SC/PWD Discount (20%): -{discountAmount}", horizontal rule, "TOTAL: {total}" in bold 14pt, "VAT Amount: ₱0.00", "You Save: {savingsAmount}".
  - [x]2.8 **Payment section**: For cash: "Cash Tendered: {amountTendered}", "Change: {change}". For GCash/Maya: "Payment: {GCash|Maya}". Horizontal rule.
  - [x]2.9 **Footer**: "Thank you for your purchase!", "THIS SERVES AS YOUR OFFICIAL RECEIPT", date printed. Style the page as 80mm thermal receipt width (226pt) with minimal margins.

- [x] Task 3: Create `components/pos/ReceiptViewer.tsx` — on-screen receipt preview + download (AC: #3, #4, #8)
  - [x]3.1 Create file `components/pos/ReceiptViewer.tsx` with `"use client"` directive. Import `useQuery` from `convex/react`, `api` from `@/convex/_generated/api`, `dynamic` from `next/dynamic`. Import receipt PDF lazily: `const ReceiptPDF = dynamic(() => import("@/components/shared/ReceiptPDF").then(m => m.ReceiptPDF), { ssr: false })`.
  - [x]3.2 Props: `transactionId: Id<"transactions">`, `onClose: () => void`. Use `useQuery(api.pos.receipts.getReceiptData, { transactionId })` to load receipt data. Show `Loader2` spinner while loading.
  - [x]3.3 **On-screen receipt preview**: Render an HTML-styled receipt that mirrors the PDF layout. Use a `div` styled as a receipt (white background, narrow width ~320px, bordered, monospace-like font). Show all BIR fields: business name, TIN, branch address, date/time, items, tax breakdown, payment, receipt number. Use `formatCurrency` from `@/lib/formatters` and `formatDateTime` for display.
  - [x]3.4 **Download PDF button**: Use `@react-pdf/renderer`'s `BlobProvider` wrapping the `ReceiptPDF` component. Render a "Download PDF" button (56px min-height) that creates a download link. Use `dynamic` import to avoid SSR issues with react-pdf. Button disabled while PDF is generating.
  - [x]3.5 **Close button**: "Close" or X button at the top to dismiss the receipt viewer. Call `onClose`.
  - [x]3.6 Layout: Absolute overlay within the cart panel area (same pattern as `TransactionSuccess`). Scrollable if receipt is long.

- [x] Task 4: Integrate receipt viewer into POS transaction flow (AC: #8)
  - [x]4.1 In `components/pos/POSCartPanel.tsx`, add `viewingReceiptId` state: `useState<Id<"transactions"> | null>(null)`. Import `ReceiptViewer` component and `Id` type.
  - [x]4.2 Modify `TransactionResult` type to include `transactionId: string`. Update `handlePaymentComplete` to pass `transactionId` from the mutation result. Update the `onComplete` callback in `PaymentPanel` to include `transactionId`.
  - [x]4.3 In `TransactionSuccess` component: add a "View Receipt" button below the existing content. Props: add `onViewReceipt: () => void`. Button: 56px min-height, outlined variant. Tapping this button calls `onViewReceipt` instead of `onDismiss`.
  - [x]4.4 In `POSCartPanel`, when `viewingReceiptId` is set, render `<ReceiptViewer transactionId={viewingReceiptId} onClose={() => setViewingReceiptId(null)} />` as an overlay (same position as TransactionSuccess). Wire `onViewReceipt` in TransactionSuccess to set `viewingReceiptId`.
  - [x]4.5 Ensure both desktop and mobile variants support the receipt viewer overlay.

- [x] Task 5: Verify integration (AC: all)
  - [x]5.1 Run `npx tsc --noEmit` — zero TypeScript errors.
  - [x]5.2 Run `npx next lint` — zero lint warnings/errors.

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**`convex/pos/receipts.ts` — Receipt Data Query:**
This file creates a `getReceiptData` query (NOT mutation). It reads transaction data and joins with variant/style/branch/settings for complete receipt information. It MUST follow the same auth pattern as `convex/pos/transactions.ts`: call `withBranchScope(ctx)` first, then verify `POS_ROLES`. Enforce branch isolation by verifying `transaction.branchId === scope.branchId`.

```typescript
// Auth pattern — replicate exactly from convex/pos/transactions.ts:
const scope = await withBranchScope(ctx);
if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
  throw new ConvexError({ code: "UNAUTHORIZED" });
}
```

**`@react-pdf/renderer` — PDF Generation:**
This library is already installed (`^4.3.2` in package.json). Key patterns:
- Use `Document`, `Page`, `View`, `Text`, `StyleSheet` from `@react-pdf/renderer`
- The receipt PDF component is a pure React component (NOT a "use client" component)
- For download: use `BlobProvider` from `@react-pdf/renderer` which provides a `blob` and `url`
- For SSR safety: import the PDF component via `next/dynamic` with `ssr: false`
- `@react-pdf/renderer` does NOT support `Intl.NumberFormat` — use manual `(centavos / 100).toFixed(2)` formatting
- Receipt width: 80mm thermal receipt = 226pt in PDF points

```typescript
// Example @react-pdf/renderer usage:
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { width: 226, padding: 10, fontFamily: "Helvetica" },
  header: { fontSize: 14, fontWeight: "bold", textAlign: "center" },
  // ...
});

export function ReceiptPDF({ data }: { data: ReceiptData }) {
  return (
    <Document>
      <Page size={[226, "auto"]} style={styles.page}>
        <View>
          <Text style={styles.header}>{data.business.name}</Text>
        </View>
      </Page>
    </Document>
  );
}
```

**BIR Receipt Requirements — Philippines:**
Philippine BIR (Bureau of Internal Revenue) requires official receipts to contain:
1. Business name (registered trade name)
2. TIN (Tax Identification Number) — format: `XXX-XXX-XXX-XXX`
3. Business/branch address
4. Date and time of transaction
5. Itemized list with description, quantity, unit price, amount
6. VAT amount (12%) — or "VAT-EXEMPT" for Senior/PWD
7. Discount details (if applicable)
8. Total amount due
9. Sequential receipt number (unique, not reusable)

**Senior/PWD Discount Breakdown on Receipt:**
Per Philippine law (RA 9994 / RA 10754), the receipt must show:
- Original price (VAT-inclusive)
- VAT-exempt sale amount (price / 1.12)
- SC/PWD discount (20% of VAT-exempt amount)
- Net amount due
- "VAT Amount: ₱0.00" (explicitly show VAT is zero for exempt transactions)

```
// Example Senior/PWD receipt section:
Subtotal (VAT-Inclusive):     ₱1,499.00
Less: VAT:                    -₱160.61
VAT-Exempt Amount:            ₱1,338.39
Less: SC Discount (20%):      -₱267.68
                              ──────────
TOTAL:                        ₱1,070.71
VAT Amount:                   ₱0.00
You Save:                     ₱428.29
```

**Settings Table Pattern:**
The `settings` table uses a key-value pattern: `{ key: string, value: string }` with a `by_key` index. Business info settings to query:
- `"businessName"` — e.g., "RedBox Apparel"
- `"tin"` — e.g., "123-456-789-000"
- `"businessAddress"` — fallback to branch address if not set

These may not exist yet in the settings table. The receipt query should gracefully handle missing settings with sensible defaults.

**On-Screen Receipt Preview vs PDF:**
The UX spec requires the receipt to be "viewable on-screen and downloadable as PDF." Implementation:
- **On-screen**: HTML-styled receipt (fast, instant rendering) — NOT a PDF viewer iframe
- **PDF download**: `@react-pdf/renderer` `BlobProvider` generates the PDF on-demand when the user taps "Download PDF"
- This two-track approach avoids slow PDF rendering for the on-screen preview

**Transaction Flow Integration:**
After Story 3.4's `TransactionSuccess` overlay, add a "View Receipt" button. The receipt viewer overlays the cart panel (same `absolute inset-0` pattern). The auto-dismiss timer should be cancelled if the user taps "View Receipt" (they want to stay on that screen).

**Variant/Style Name Resolution:**
Transaction items store `variantId` but receipts need human-readable names. The query must join:
- `transactionItems.variantId` → `variants` table → get `size`, `color`, `sku`
- `variants.styleId` → `styles` table → get `name` (product name)

This means the query does N+1 reads (one per item, each loading variant + style). For typical transactions (5-15 items), this is acceptable in Convex. No optimization needed.

### Scope Boundaries — DO NOT IMPLEMENT

- **Receipt printing to physical printer** → Not in MVP (cashier uses browser print or saves PDF)
- **Email receipt to customer** → Not in current sprint
- **Receipt templates/customization** → Not in MVP (hardcoded BIR format)
- **Receipt reprint/duplicate** → Can be added later with the query (data already persistent)
- **QR code on receipt** → Not in MVP
- **Transaction history / receipt search page** → Can be added later, query already supports it
- **Receipt void/cancellation watermark** → Not in scope (no void feature yet)
- **Offline receipt generation** → Epic 4

### Existing Code to Build Upon (Stories 3.1-3.4)

**Already exists — DO NOT recreate:**
- `convex/pos/transactions.ts` — `createTransaction` mutation (returns `{ transactionId, receiptNumber, totalCentavos, changeCentavos }`)
- `convex/_helpers/withBranchScope.ts` — Auth + branch scoping
- `convex/_helpers/permissions.ts` — `POS_ROLES = ["admin", "manager", "cashier"]`
- `convex/_helpers/taxCalculations.ts` — `calculateTaxBreakdown`, `TaxBreakdown`, `removeVat`, `calculateLineItemDiscount`
- `components/pos/POSCartPanel.tsx` — Cart panel with `TransactionSuccess` overlay, `PaymentPanel`, `TransactionResult` type
- `components/providers/POSCartProvider.tsx` — Cart state, `clearCart`, `taxBreakdown`
- `lib/constants.ts` — `VAT_RATE`, `SENIOR_PWD_DISCOUNT_RATE`, `PaymentMethod`, `DiscountType`
- `lib/formatters.ts` — `formatCurrency(centavos)`, `formatDate(timestamp)`, `formatDateTime(timestamp)` (Asia/Manila timezone)
- `convex/schema.ts` — All tables including `transactions`, `transactionItems`, `variants`, `styles`, `branches`, `settings`

**Key Patterns from Stories 3.1-3.4 (follow these):**
- `withBranchScope(ctx)` + `POS_ROLES` cast + check in every POS Convex function
- `"use client"` on all POS UI components
- `useCallback` with empty deps for dispatch-only callbacks
- `formatCurrency` from `@/lib/formatters` for all price display in UI
- `min-h-14` (56px) for all POS touch targets
- `variant: "desktop" | "mobile"` prop on POSCartPanel
- No Card shadcn component — use `div` with `rounded-md border` classes
- `import type { PaymentMethod } from "@/lib/constants"`
- Absolute overlay pattern for TransactionSuccess (reuse for ReceiptViewer)

**Key Schema Indexes (MUST use):**
- `transactionItems.by_transaction` — `["transactionId"]` for loading all items for a receipt
- `settings.by_key` — `["key"]` for loading business settings
- `variants.by_style` — `["styleId"]` for loading variant details

### Previous Story Learnings (from Story 3.4 Code Review)

- **H1 (3.4)**: Server must look up variant prices from DB — never trust client-provided prices. The receipt query should use the `unitPriceCentavos` stored in `transactionItems` (which was already server-validated in 3.4).
- **H2 (3.4)**: Error messages must be specific. If receipt data can't be loaded, show specific error (e.g., "Transaction not found" vs generic failure).
- **H3 (3.4)**: All quantities validated as positive integers in the mutation. Receipt can trust stored data.
- **M2 (3.4)**: `@react-pdf/renderer` may have client-only APIs — use `next/dynamic` with `ssr: false` for any component that imports it.
- **L1 (3.4)**: Use proper disabled styling (add `disabled:opacity-50 disabled:pointer-events-none` to plain buttons).
- **Pattern**: Desktop and mobile variants must have consistent receipt viewing behavior.

### Project Structure Notes

```
Files to CREATE in this story:
├── convex/pos/
│   └── receipts.ts                 # getReceiptData query (transaction + items + branch + settings)
├── components/shared/
│   └── ReceiptPDF.tsx              # @react-pdf/renderer BIR-compliant PDF document
├── components/pos/
│   └── ReceiptViewer.tsx           # On-screen receipt preview + PDF download

Files to MODIFY in this story:
├── components/pos/POSCartPanel.tsx  # Add "View Receipt" to TransactionSuccess, viewingReceiptId state, ReceiptViewer overlay

Files to reference (NOT modify):
├── convex/schema.ts                # transactions, transactionItems, variants, styles, branches, settings
├── convex/pos/transactions.ts      # createTransaction return type
├── convex/_helpers/withBranchScope.ts  # Auth + branch scoping
├── convex/_helpers/permissions.ts  # POS_ROLES
├── convex/_helpers/taxCalculations.ts  # removeVat, calculateLineItemDiscount
├── lib/constants.ts                # VAT_RATE, SENIOR_PWD_DISCOUNT_RATE, PaymentMethod, DiscountType
├── lib/formatters.ts               # formatCurrency, formatDateTime
├── components/providers/POSCartProvider.tsx  # CartItem type
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.5 (lines 589-604)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Convex Function Organization: convex/pos/receipts.ts]
- [Source: _bmad-output/planning-artifacts/architecture.md — @react-pdf/renderer integration: components/shared/ReceiptViewer.tsx]
- [Source: _bmad-output/planning-artifacts/architecture.md — NFR33: @react-pdf/renderer for BIR-compliant PDF receipts]
- [Source: _bmad-output/planning-artifacts/architecture.md — Money Storage: centavos, Integer math]
- [Source: _bmad-output/planning-artifacts/architecture.md — withBranchScope pattern]
- [Source: _bmad-output/planning-artifacts/architecture.md — Audit Log: _logAuditEntry]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — POS Transaction Flow: Completion stage]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Receipt prominent branding: logo, business name]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Transaction speed: <3 seconds scan-to-receipt]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Perfectly formatted BIR receipt in one tap]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Senior/PWD: auto BIR receipt formatting]
- [Source: convex/schema.ts — transactions, transactionItems, variants, styles, settings tables]
- [Source: convex/pos/transactions.ts — createTransaction return: transactionId, receiptNumber, totalCentavos, changeCentavos]
- [Source: _bmad-output/implementation-artifacts/3-4-payment-processing-and-transaction-completion.md — Code review learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Initial tsc: 3 errors (Convex codegen needed for new `receipts.ts` module + implicit `any` in map callback)
- Ran `npx convex codegen` — regenerated types, resolved all 3 errors
- Final tsc: 0 errors
- Final lint: 0 errors

### Completion Notes List

- Task 1: Created `convex/pos/receipts.ts` with `getReceiptData` query. Joins transaction + transactionItems + variants + styles + branch + settings. Uses `withBranchScope` + `POS_ROLES` auth gate. Branch isolation enforced. Business settings gracefully default if not set (businessName → "RedBox Apparel").
- Task 2: Created `components/shared/ReceiptPDF.tsx` using `@react-pdf/renderer`. BIR-compliant layout at 226pt (80mm thermal). Manual `formatPrice()` helper since `Intl` unavailable in react-pdf. Full Senior/PWD discount breakdown per RA 9994/10754: VAT-inclusive subtotal → Less VAT → VAT-exempt amount → Less SC/PWD 20% → Total → VAT Amount ₱0.00 → You Save.
- Task 3: Created `components/pos/ReceiptViewer.tsx` with on-screen HTML receipt preview (320px, monospace, white bg, dashed borders) + PDF download via `BlobProvider`. Both `ReceiptPDF` and `BlobProvider` loaded via `next/dynamic` with `ssr: false` for SSR safety.
- Task 4: Integrated into `POSCartPanel.tsx`: added `transactionId` to `TransactionResult`, `viewingReceiptId` state, "View Receipt" button in `TransactionSuccess` overlay, `ReceiptViewer` overlay for both desktop and mobile variants. Changed TransactionSuccess from `<button>` to `<div>` to support nested buttons. Increased auto-dismiss timer from 3s to 5s to give time to tap "View Receipt".
- Task 5: tsc 0 errors, lint 0 errors.

### File List

- `convex/pos/receipts.ts` — CREATED (getReceiptData query)
- `components/shared/ReceiptPDF.tsx` — CREATED (BIR-compliant PDF document)
- `components/pos/ReceiptViewer.tsx` — CREATED (on-screen preview + PDF download + ErrorBoundary)
- `components/pos/DownloadPDFSection.tsx` — CREATED (isolated BlobProvider + ReceiptPDF for SSR-safe PDF generation)
- `components/pos/POSCartPanel.tsx` — MODIFIED (receipt viewer integration, TransactionResult type, TransactionSuccess buttons)

## Change Log

- 2026-02-28: Story 3.5 implementation complete — BIR-compliant receipt generation with on-screen preview and PDF download
- 2026-02-28: Code review — 5 fixes applied (3 HIGH, 2 MEDIUM):
  - H1: Added thousand-separator commas to `formatPrice` in ReceiptPDF (₱14,999.00 vs ₱14999.00)
  - H2: Added `ReceiptErrorBoundary` class component wrapping ReceiptViewer to handle Convex query errors gracefully
  - H3: Created separate `DownloadPDFSection.tsx` with direct react-pdf imports loaded via `next/dynamic`; BlobProvider error state checked
  - M1: Replaced `Date.toLocaleString` (Intl-dependent) with manual PHT offset date formatting in ReceiptPDF
  - M2: Removed unnecessary `e.stopPropagation()` from View Receipt button (parent already changed from `<button>` to `<div>`)
  - L1 (accepted): PDF page height 841pt — react-pdf limitation, no "auto" height support
  - L2 (accepted): Business name 12pt vs spec 14pt — better fit for 80mm thermal width

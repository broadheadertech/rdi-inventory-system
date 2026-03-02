# Story 3.3: VAT Calculation & Senior/PWD Discount

Status: done

## Story

As a **Cashier**,
I want VAT automatically calculated and Senior/PWD discounts applied with one tap,
So that every transaction is tax-compliant and discounts are computed correctly.

## Acceptance Criteria

1. **Given** items are in the cart
   **When** the transaction is in progress
   **Then** VAT (12%) is automatically calculated on all taxable items and shown as a line item in the cart footer
   **And** all calculations are in centavos (integer math) to avoid floating-point errors

2. **Given** items are in the cart
   **When** the cashier toggles the Senior/PWD discount (one-tap toggle)
   **Then** VAT is removed first from each item price (price / 1.12)
   **And** 20% discount is applied to the VAT-exempt base price
   **And** the cart footer shows the breakdown: subtotal, discount amount, new total
   **And** a green highlight shows total savings

3. **Given** the discount toggle
   **Then** it is a prominent, easily accessible UI element (not buried in a menu)
   **And** it uses 56px touch targets per POS theme
   **And** it supports three states: Regular (default), Senior, PWD

4. **Given** the tax calculation logic
   **Then** it lives in `convex/_helpers/taxCalculations.ts`
   **And** it is testable independently (pure functions, no Convex ctx dependency)
   **And** it uses `Math.round` for all divisions to maintain integer centavo precision

5. **Given** a transaction with a discount applied
   **When** the cashier taps "Hold"
   **Then** the held transaction preserves its discount type
   **And** resuming the transaction restores the discount toggle state

6. **Given** the discount toggle is set to Senior or PWD
   **When** the cashier taps "Clear Cart"
   **Then** the discount toggle resets to "Regular" (no discount)

7. **Given** any cart state (regular or discounted)
   **When** the "Complete Sale" button is visible
   **Then** it shows the correct total amount (accounting for VAT/discount)
   **And** the button remains a placeholder (Story 3.4 will implement payment processing)

## Tasks / Subtasks

- [x] Task 1: Create tax calculations module (AC: #1, #2, #4)
  - [x] 1.1 Create `convex/_helpers/taxCalculations.ts` — pure TypeScript module with ZERO Convex dependencies. Define constants locally: `const VAT_RATE = 0.12` and `const SENIOR_PWD_DISCOUNT_RATE = 0.20`. Export types: `TaxBreakdown` (subtotalCentavos, vatExemptSubtotalCentavos, vatAmountCentavos, discountAmountCentavos, totalCentavos, savingsCentavos), `LineItemTax` (unitPriceCentavos, vatExemptUnitCentavos, discountPerUnitCentavos, finalUnitCentavos).
  - [x] 1.2 Export `removeVat(priceInclusiveCentavos: number): number` — returns `Math.round(priceInclusiveCentavos / 1.12)`. This is the VAT-exempt base price.
  - [x] 1.3 Export `calculateVat(priceInclusiveCentavos: number): number` — returns `priceInclusiveCentavos - removeVat(priceInclusiveCentavos)`. This is the VAT component.
  - [x] 1.4 Export `calculateLineItemDiscount(unitPriceCentavos: number): LineItemTax` — computes per-item breakdown: remove VAT first, then 20% discount on VAT-exempt base. All values use `Math.round`.
  - [x] 1.5 Export `calculateTaxBreakdown(items: { unitPriceCentavos: number; quantity: number }[], discountType: "senior" | "pwd" | "none"): TaxBreakdown` — main entry point. For "none": computes VAT as informational line (VAT is already included in prices). For "senior"/"pwd": removes VAT per item, applies 20% discount per item, sums across all items. Returns full breakdown with `savingsCentavos = subtotalCentavos - totalCentavos`.

- [x] Task 2: Add SENIOR_PWD_DISCOUNT_RATE to constants (AC: #4)
  - [x] 2.1 Add `export const SENIOR_PWD_DISCOUNT_RATE = 0.20;` to `lib/constants.ts`. This is for reference/documentation only — the actual calculation module defines its own constant to avoid cross-boundary imports.

- [x] Task 3: Extend POSCartProvider with discount state (AC: #2, #5, #6)
  - [x] 3.1 Add `discountType: "senior" | "pwd" | "none"` to `CartState` type. Default: `"none"`.
  - [x] 3.2 Add `SET_DISCOUNT_TYPE` action to `CartAction` union: `{ type: "SET_DISCOUNT_TYPE"; discountType: "senior" | "pwd" | "none" }`.
  - [x] 3.3 Handle `SET_DISCOUNT_TYPE` in `cartReducer` — simply sets `state.discountType`.
  - [x] 3.4 Update `CLEAR_CART` handler in reducer to also reset `discountType` to `"none"` (AC #6).
  - [x] 3.5 Update `HOLD_TRANSACTION` handler — include `discountType` in the `HeldTransaction` type and save it when holding.
  - [x] 3.6 Update `RESUME_TRANSACTION` handler — restore `discountType` from the held transaction. If auto-holding current cart (because it has items), preserve its discountType too.
  - [x] 3.7 Update `HeldTransaction` type to include `discountType: "senior" | "pwd" | "none"`.
  - [x] 3.8 Add `setDiscountType` callback (stable via `useCallback([], [])`) to context value.
  - [x] 3.9 Add computed `taxBreakdown: TaxBreakdown` to `POSCartContextValue`. Compute using `calculateTaxBreakdown(state.items, state.discountType)` inside the provider. Use `useMemo` with `[state.items, state.discountType]` dependencies to avoid recalculating on unrelated state changes.
  - [x] 3.10 Expose `discountType` and `taxBreakdown` in the context value object.

- [x] Task 4: Add discount toggle UI to POSCartPanel (AC: #3)
  - [x] 4.1 Create a `DiscountToggle` sub-component inside `POSCartPanel.tsx`. Renders three buttons in a segmented control row: "Regular", "Senior", "PWD". Uses `usePOSCart()` to read `discountType` and call `setDiscountType`. Active button: solid fill with brand primary color. Inactive buttons: outline style. All buttons 56px min-height (`min-h-14`).
  - [x] 4.2 Position the DiscountToggle above the cart actions bar (Hold/Clear) in both desktop `CartContent` and mobile bottom sheet layouts. It must be easily accessible, NOT buried in a menu.
  - [x] 4.3 When Senior or PWD is active, show a green-tinted banner below the toggle: "Senior Citizen Discount Applied" or "PWD Discount Applied". Use `border-green-500 bg-green-50 text-green-900` (same pattern as ScanConfirmation success state).
  - [x] 4.4 Pass `discountType` and `setDiscountType` through to `CartContent` props for the desktop variant. The mobile bottom sheet accesses them directly via `usePOSCart()`.

- [x] Task 5: Update cart footer with price breakdown (AC: #1, #2, #7)
  - [x] 5.1 Modify `CartActions` component to receive `taxBreakdown: TaxBreakdown` as a prop (from `usePOSCart()` via `POSCartPanel` or `CartContent`).
  - [x] 5.2 **Regular mode display** — show in the cart footer:
    - Subtotal: `formatCurrency(taxBreakdown.subtotalCentavos)`
    - VAT (12%): `formatCurrency(taxBreakdown.vatAmountCentavos)` — informational, as VAT is already included in prices
    - **Total: `formatCurrency(taxBreakdown.totalCentavos)`** (bold, large text)
  - [x] 5.3 **Senior/PWD mode display** — show in the cart footer:
    - Subtotal: `formatCurrency(taxBreakdown.subtotalCentavos)` (original VAT-inclusive prices)
    - Discount (SC/PWD 20%): `-formatCurrency(taxBreakdown.discountAmountCentavos)` (in destructive/red color)
    - **Total: `formatCurrency(taxBreakdown.totalCentavos)`** (bold, large text)
    - You save: `formatCurrency(taxBreakdown.savingsCentavos)` (green text, `text-green-600`)
  - [x] 5.4 Update the "Complete Sale" button label to show the total: `Complete Sale · ₱X,XXX.XX`. Use `formatCurrency(taxBreakdown.totalCentavos)`.
  - [x] 5.5 Update the mobile bottom sheet toggle bar to show the correct total from `taxBreakdown.totalCentavos` instead of the raw sum.

- [x] Task 6: Verify integration (AC: all)
  - [x] 6.1 Run `npx tsc --noEmit` — zero TypeScript errors.
  - [x] 6.2 Run `npx next lint` — zero lint warnings/errors.

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**Tax Calculations Module — Pure Functions at `convex/_helpers/taxCalculations.ts`:**
The AC mandates this exact file path. The module MUST have zero Convex dependencies (no `ctx`, no `v`, no imports from `convex/server`). It's pure TypeScript math that can be imported by both Convex mutations (Story 3.4) and React components (this story). Define `VAT_RATE` and `SENIOR_PWD_DISCOUNT_RATE` locally in the module to avoid cross-boundary import issues.

```typescript
// convex/_helpers/taxCalculations.ts
const VAT_RATE = 0.12;
const SENIOR_PWD_DISCOUNT_RATE = 0.20;

export type TaxBreakdown = {
  subtotalCentavos: number;
  vatExemptSubtotalCentavos: number;
  vatAmountCentavos: number;
  discountAmountCentavos: number;
  totalCentavos: number;
  savingsCentavos: number;
};

export function removeVat(priceInclusiveCentavos: number): number {
  return Math.round(priceInclusiveCentavos / (1 + VAT_RATE));
}

export function calculateTaxBreakdown(
  items: { unitPriceCentavos: number; quantity: number }[],
  discountType: "senior" | "pwd" | "none"
): TaxBreakdown {
  const subtotalCentavos = items.reduce(
    (sum, item) => sum + item.unitPriceCentavos * item.quantity, 0
  );

  if (discountType === "none") {
    const vatAmount = subtotalCentavos - removeVat(subtotalCentavos);
    return {
      subtotalCentavos,
      vatExemptSubtotalCentavos: subtotalCentavos - vatAmount,
      vatAmountCentavos: vatAmount,
      discountAmountCentavos: 0,
      totalCentavos: subtotalCentavos,
      savingsCentavos: 0,
    };
  }

  // Senior/PWD: remove VAT per item, then apply 20% discount per item
  let vatExemptSubtotal = 0;
  let totalDiscount = 0;
  for (const item of items) {
    const vatExemptUnit = removeVat(item.unitPriceCentavos);
    const discountPerUnit = Math.round(vatExemptUnit * SENIOR_PWD_DISCOUNT_RATE);
    vatExemptSubtotal += vatExemptUnit * item.quantity;
    totalDiscount += discountPerUnit * item.quantity;
  }

  const total = vatExemptSubtotal - totalDiscount;
  return {
    subtotalCentavos,
    vatExemptSubtotalCentavos: vatExemptSubtotal,
    vatAmountCentavos: 0,
    discountAmountCentavos: totalDiscount,
    totalCentavos: total,
    savingsCentavos: subtotalCentavos - total,
  };
}
```

**Philippine Tax Rules (MUST follow this order):**
1. All product prices in the system are **VAT-inclusive** (12% VAT already baked into the price)
2. For regular transactions: VAT is informational — `subtotal - removeVat(subtotal)` shows the VAT component
3. For Senior/PWD discount: **Remove VAT FIRST** (price / 1.12), **THEN** apply 20% discount on the VAT-exempt base
4. Senior and PWD discounts are mutually exclusive — only one can apply per transaction
5. Discount cannot be stacked (not Senior + PWD combined)
6. All math in centavos (integers) with `Math.round` for divisions

**Discount State in POSCartProvider — Extend, Don't Replace:**
Add `discountType` to the existing `CartState` alongside `items`, `heldTransactions`, `activeTransactionId`. The `CLEAR_CART` action MUST also reset `discountType` to `"none"`. Held transactions MUST preserve their `discountType`.

```typescript
// Extended CartState
type CartState = {
  items: CartItem[];
  heldTransactions: HeldTransaction[];
  activeTransactionId: string;
  discountType: "senior" | "pwd" | "none"; // NEW
};

// Extended HeldTransaction
type HeldTransaction = {
  id: string;
  items: CartItem[];
  heldAt: number;
  discountType: "senior" | "pwd" | "none"; // NEW
};

// New action
| { type: "SET_DISCOUNT_TYPE"; discountType: "senior" | "pwd" | "none" }
```

**Computed Tax Breakdown — useMemo in Provider:**
The `taxBreakdown` value should be computed with `useMemo` inside `POSCartProvider`, NOT in every consumer. This is the single source of truth for all tax/discount calculations in the UI.

```typescript
const taxBreakdown = useMemo(
  () => calculateTaxBreakdown(state.items, state.discountType),
  [state.items, state.discountType]
);
```

**Discount Toggle UI — Segmented Control Pattern:**
Use three buttons in a row (not a dropdown, not a checkbox). Active state: solid fill. The toggle is positioned in the cart panel above the action buttons (Hold/Clear), making it one tap away. Follow the UX spec: "One tap. Auto VAT exemption."

**Cart Footer Breakdown — Keep It Simple for POS Speed:**
The cart footer shows computed totals, not a verbose accounting breakdown. Regular mode shows Subtotal + VAT (informational) + Total. Discount mode shows Subtotal + Discount + Total + Savings. The detailed per-item breakdown (VAT-exempt price, discount amount per item) is deferred to Story 3.5 (receipts).

**Price Display — Always Use `formatCurrency` from `@/lib/formatters`:**
Never use raw `(centavos / 100).toFixed(2)`. The `formatCurrency` utility returns `₱X,XXX.XX` format with Philippine locale.

### Scope Boundaries — DO NOT IMPLEMENT

- **Payment processing / "Complete Sale" mutation** → Story 3.4
- **Receipt generation with BIR breakdown** → Story 3.5 (per-item VAT/discount breakdown goes on receipt)
- **End-of-day reconciliation** → Story 3.6
- **Offline cart persistence (IndexedDB)** → Epic 4
- **Customer ID / Senior/PWD card number capture** → Not in scope for MVP (policy decision)
- **Multiple discount types on same transaction** → Not supported per Philippine tax rules
- **Item-level discount (only some items discounted)** → Not in scope; discount applies to entire transaction

### Existing Code to Build Upon (Stories 3.1-3.2)

**Already exists — DO NOT recreate:**
- `app/pos/layout.tsx` — POS layout with role guard, ErrorBoundary, `theme-pos` class
- `app/pos/page.tsx` — POS page with POSCartProvider wrapper, BarcodeScanner, ScanConfirmation
- `convex/pos/products.ts` — searchPOSProducts, listPOSBrands, listPOSCategories, getVariantByBarcode
- `components/pos/POSProductGrid.tsx` — Product grid with search and filters
- `components/pos/POSCartPanel.tsx` — Cart panel with variant prop ("desktop" | "mobile"), CartContent, CartItemList, CartActions, HeldTransactionBadges
- `components/pos/ScanConfirmation.tsx` — Scan feedback overlay
- `components/providers/POSCartProvider.tsx` — React Context + useReducer cart state with stable callback refs
- `components/shared/BarcodeScanner.tsx` — html5-qrcode wrapper
- `lib/constants.ts` — VAT_RATE (0.12), DISCOUNT_TYPES, PAYMENT_METHODS, ROLES
- `lib/formatters.ts` — formatCurrency, formatDate, formatDateTime
- `lib/sounds.ts` — Web Audio API tone generators
- `lib/utils.ts` — cn() utility
- `convex/schema.ts` — All tables including transactions with vatAmountCentavos, discountAmountCentavos, discountType
- `convex/_helpers/withBranchScope.ts` — Branch scoping helper
- `convex/_helpers/permissions.ts` — POS_ROLES, requireAuth, requireRole
- `app/globals.css` — POS theme CSS with 56px touch targets, 18px font, shake animation

**Key Patterns from Stories 3.1-3.2 (follow these):**
- `withBranchScope(ctx)` + `POS_ROLES` check in every POS Convex function
- `"use client"` on all POS components
- `useRef` for stable callback identities in POSCartProvider (avoids cascading re-renders)
- `useCallback` with empty deps for dispatch-only callbacks
- `useMemo` for derived computations
- `formatCurrency` from `@/lib/formatters` for all price display
- `min-h-14` (56px) for all POS touch targets
- `variant: "desktop" | "mobile"` prop on POSCartPanel
- No Card shadcn component — use `div` with `rounded-md border` classes
- ScanConfirmation overlay (not toast) for scan feedback

**Key Schema Details (transactions table — Story 3.4 will use these):**
```typescript
transactions: defineTable({
  branchId: v.id("branches"),
  cashierId: v.id("users"),
  receiptNumber: v.string(),
  subtotalCentavos: v.number(),
  vatAmountCentavos: v.number(),
  discountAmountCentavos: v.number(),
  totalCentavos: v.number(),
  paymentMethod: v.union(v.literal("cash"), v.literal("gcash"), v.literal("maya")),
  discountType: v.optional(v.union(v.literal("senior"), v.literal("pwd"), v.literal("none"))),
  // ... other fields
})
```

### Previous Story Learnings (from Stories 3.1-3.2 Code Reviews)

- **H1 (3.2)**: Use `useRef` for stable callback identities — prevents cascading re-renders on state changes. Applied to `addItem` and `holdTransaction`. Apply same pattern to `setDiscountType`.
- **M1 (3.2)**: Add loading states for async operations — users need visual feedback.
- **M3 (3.2)**: POSCartPanel uses `variant` prop — maintain this pattern when adding discount toggle to both desktop and mobile layouts.
- **M4 (3.1)**: Touch targets — ALL interactive elements in POS must be minimum 56px (`min-h-14`).
- **Layout**: Desktop uses `CartContent` sub-component receiving props. Mobile bottom sheet accesses context directly. Both need the discount toggle.

### Project Structure Notes

```
Files to CREATE in this story:
├── convex/_helpers/
│   └── taxCalculations.ts              # Pure tax calculation functions (no Convex deps)

Files to MODIFY in this story:
├── lib/constants.ts                    # Add SENIOR_PWD_DISCOUNT_RATE
├── components/providers/POSCartProvider.tsx  # Add discountType state, SET_DISCOUNT_TYPE action, taxBreakdown
├── components/pos/POSCartPanel.tsx      # Add DiscountToggle, update price breakdown in footer

Files to reference (NOT modify):
├── app/pos/page.tsx                    # POS page (no changes expected)
├── app/pos/layout.tsx                  # POS layout with role guard
├── convex/schema.ts                    # transactions table structure (reference for field names)
├── lib/formatters.ts                   # formatCurrency utility
├── lib/utils.ts                        # cn() utility
├── components/ui/button.tsx            # shadcn Button
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.3 (lines 548-567)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Money Storage: centavos (lines 379-383)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Tax Calculations Helper (line 513)]
- [Source: _bmad-output/planning-artifacts/architecture.md — VAT/Discount Compliance (lines 273-276)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Error Codes: INVALID_DISCOUNT (lines 228-232)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Constants: VAT_RATE, lib/constants.ts (lines 342-346, 363)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — POS Transaction Flow: Discount stage]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — POSCartPanel: "apply discount" action, "discount line" in content]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Senior/PWD toggle: one tap, auto VAT exemption]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — POS typography: 36px/700 for transaction total]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Green highlight on savings; breakdown visible]
- [Source: convex/schema.ts — transactions table with vatAmountCentavos, discountAmountCentavos, discountType]
- [Source: lib/constants.ts — VAT_RATE = 0.12, DISCOUNT_TYPES]
- [Source: lib/formatters.ts — formatCurrency utility]
- [Source: components/providers/POSCartProvider.tsx — CartState, CartAction, cartReducer]
- [Source: components/pos/POSCartPanel.tsx — CartActions, CartContent, variant prop]
- [Source: _bmad-output/implementation-artifacts/3-2-barcode-scanning-and-cart-management.md — Code review fixes H1, M3]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

No debug issues encountered. All implementations compiled and linted cleanly on first pass.

### Completion Notes List

- **Task 1**: Created `convex/_helpers/taxCalculations.ts` with pure functions: `removeVat`, `calculateVat`, `calculateLineItemDiscount`, `calculateTaxBreakdown`. All use integer centavo math with `Math.round`. Zero Convex dependencies. VAT computation is per-item to avoid rounding accumulation across different price points.
- **Task 2**: Added `SENIOR_PWD_DISCOUNT_RATE = 0.20` to `lib/constants.ts` (reference constant).
- **Task 3**: Extended `POSCartProvider` with `discountType` state, `SET_DISCOUNT_TYPE` action, `setDiscountType` callback (stable via `useCallback([], [])`), and `taxBreakdown` computed via `useMemo`. Updated `HeldTransaction` type to include `discountType`. `CLEAR_CART` resets discount to "none". `HOLD_TRANSACTION` saves discountType. `RESUME_TRANSACTION` restores discountType (including auto-hold of current cart).
- **Task 4**: Created `DiscountToggle` segmented control component in `POSCartPanel.tsx` with three buttons (Regular/Senior/PWD), 56px touch targets, solid fill for active state. Green banner shows when discount is active. Positioned above Hold/Clear in both desktop and mobile layouts.
- **Task 5**: Replaced simple total display with full price breakdown in `CartActions`. Regular mode: Subtotal + VAT (12%) + Total. Discount mode: Subtotal + Discount amount (red) + Total + Savings (green). "Complete Sale" button shows total amount. Mobile toggle bar uses `taxBreakdown.totalCentavos`.
- **Task 6**: `npx tsc --noEmit` — zero errors. `npx next lint` — zero warnings/errors.

### Code Review Fixes Applied

- **M1**: HeldTransactionBadges now uses `calculateTaxBreakdown` to show discount-adjusted totals. Added "SC"/"PWD" label on held badges with discounts.
- **M2**: Replaced 11+ repetitions of `"senior" | "pwd" | "none"` literal union with imported `DiscountType` from `lib/constants.ts` across both `POSCartProvider.tsx` and `POSCartPanel.tsx`.
- **M3**: Desktop `CartContent` now hides `DiscountToggle` and `CartActions` when cart is empty, consistent with mobile behavior.
- **L1**: Removed unnecessary React fragment wrapping in `CartActions` discount section.
- **L3**: Removed redundant `as const` assertion on initial state `discountType`.

### File List

**Created:**
- `convex/_helpers/taxCalculations.ts` — Pure tax calculation functions (removeVat, calculateVat, calculateLineItemDiscount, calculateTaxBreakdown)

**Modified:**
- `lib/constants.ts` — Added SENIOR_PWD_DISCOUNT_RATE constant
- `components/providers/POSCartProvider.tsx` — Added discountType state, SET_DISCOUNT_TYPE action, taxBreakdown via useMemo, setDiscountType callback, updated HeldTransaction type, CLEAR_CART/HOLD/RESUME handlers. Code review: imported DiscountType from constants, replaced literal unions.
- `components/pos/POSCartPanel.tsx` — Added DiscountToggle component, updated CartActions with price breakdown, updated CartContent props, updated mobile toggle bar total. Code review: HeldTransactionBadges uses calculateTaxBreakdown for correct totals, imported DiscountType, hide toggle/actions on empty desktop cart, removed unnecessary fragment.

## Change Log

- 2026-02-27: Implemented VAT calculation and Senior/PWD discount (Story 3.3) — tax calculations module, discount state in cart provider, discount toggle UI, price breakdown in cart footer
- 2026-02-27: Code review fixes — M1 (held badge discount-adjusted totals), M2 (DiscountType import), M3 (hide toggle on empty desktop cart), L1 (fragment cleanup), L3 (as const removal)

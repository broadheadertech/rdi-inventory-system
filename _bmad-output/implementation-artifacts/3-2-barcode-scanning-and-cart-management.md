# Story 3.2: Barcode Scanning & Cart Management

Status: done

## Story

As a **Cashier**,
I want to scan product barcodes and manage the cart,
So that I can build a transaction quickly without typing.

## Acceptance Criteria

1. **Given** the POS interface is active
   **When** a barcode is scanned via html5-qrcode (tablet camera)
   **Then** the ScanConfirmation overlay appears within 100ms showing product name, size, color, price
   **And** the product is automatically added to the POSCartPanel

2. **Given** a product is scanned
   **When** the same product (same barcode) is scanned again
   **Then** the quantity increments and a duplicate warning appears in amber ("Already in cart, qty updated")

3. **Given** a barcode is scanned
   **When** the barcode is not found in the system
   **Then** a red shake animation + buzz + "Not found" message appears

4. **Given** the ScanConfirmation overlay
   **Then** audio chimes differ per scan state:
   - Success: pleasant chime
   - Not found: error buzz
   - Duplicate: soft notification tone

5. **Given** items are in the cart
   **When** managing the cart
   **Then** the cashier can adjust quantity via +/- stepper (not text input)
   **And** the cashier can remove items by tapping a delete button
   **And** the cart shows: line items (product name, size, color, qty, unit price, line total), subtotal, and running grand total

6. **Given** a transaction in progress
   **When** the cashier taps "Hold"
   **Then** the current cart is saved (dimmed with "resume" badge) and a new empty cart starts
   **And** the cashier can resume a held transaction by tapping on it

7. **Given** items are in the cart
   **When** the cashier taps "Clear Cart"
   **Then** all items are removed after a confirmation prompt

## Tasks / Subtasks

- [x] Task 1: Create barcode lookup Convex query (AC: #1, #3)
  - [x] 1.1 Add `getVariantByBarcode` query to `convex/pos/products.ts` — accepts `{ barcode: string }`. Uses `withBranchScope(ctx)` + POS_ROLES check (same defense-in-depth pattern as `searchPOSProducts`). Looks up variant via `by_barcode` index. If found, resolves the full product context (style name, brand name, category name, price, stock at branch) by joining variant → style → category → brand + inventory lookup. Returns `{ variantId, sku, barcode, size, color, priceCentavos, styleName, brandName, categoryName, stock } | null`.
  - [x] 1.2 Handle edge cases: barcode not found returns `null`, inactive variant returns `null`, inactive parent style/category/brand returns `null`.

- [x] Task 2: Create BarcodeScanner component (AC: #1, #3, #4)
  - [x] 2.1 Create `components/shared/BarcodeScanner.tsx` — `"use client"` component wrapping html5-qrcode library. Uses `Html5Qrcode` class (NOT `Html5QrcodeScanner` — we build our own UI). Initialize in `useEffect` with `useRef` for the scanner instance. Props: `onScan: (barcode: string) => void`, `isActive: boolean`. Config: `fps: 10`, `qrbox: { width: 250, height: 150 }`, supported formats: `Html5QrcodeSupportedFormats.CODE_128`, `EAN_13`, `UPC_A`, `QR_CODE`. Camera: use `{ facingMode: "environment" }` for rear camera.
  - [x] 2.2 Cleanup: call `scanner.stop()` in useEffect cleanup. Guard against calling stop when not running. Handle camera permission denial gracefully (show message "Camera access needed for scanning").
  - [x] 2.3 Scanner UI: render a `<div id="barcode-reader">` container. Show a toggle button to start/stop the camera (camera icon). When active, show the video feed with a scanning line overlay. Minimum height of 200px for the scanner region.

- [x] Task 3: Create ScanConfirmation overlay component (AC: #1, #2, #3, #4)
  - [x] 3.1 Create `components/pos/ScanConfirmation.tsx` — `"use client"` component. Props: `result: { type: "success" | "not-found" | "duplicate"; styleName?: string; size?: string; color?: string; priceCentavos?: number; stock?: number } | null`, `onDismiss: () => void`. Auto-dismiss after 2 seconds via `useEffect` + `setTimeout`.
  - [x] 3.2 Visual states:
    - **Success** (green flash): product name, size, color, price displayed. Green border/background tint. Chime sound.
    - **Not found** (red shake): "Barcode not found" message. Red border. Shake CSS animation (`@keyframes shake`). Buzz sound.
    - **Duplicate** (amber): "Already in cart, qty updated" message with product info. Amber border. Soft notification sound.
  - [x] 3.3 Position: fixed overlay at bottom of the product grid area (above bottom sheet on mobile, overlay on desktop cart area). Z-index above content but below modals.

- [x] Task 4: Implement audio feedback (AC: #4)
  - [x] 4.1 Create `lib/sounds.ts` utility — exports `playSuccessChime()`, `playErrorBuzz()`, `playDuplicateTone()`. Uses Web Audio API (`AudioContext`) to generate short tones programmatically (no audio file dependencies). Success: 800Hz sine wave 150ms. Error: 200Hz square wave 300ms. Duplicate: 600Hz sine wave 100ms.
  - [x] 4.2 Respect user preference: check `navigator.userActivation.hasBeenActive` before playing (browser autoplay policy). Wrap in try/catch for environments without audio support.

- [x] Task 5: Create POSCartProvider context (AC: #5, #6, #7)
  - [x] 5.1 Create `components/providers/POSCartProvider.tsx` — React Context provider wrapping POS page. Context value: `{ items: CartItem[], addItem, updateQuantity, removeItem, clearCart, holdTransaction, resumeTransaction, heldTransactions, activeTransactionId }`.
  - [x] 5.2 `addItem(variantId, priceCentavos, styleName, size, color)` — if variant already in cart, increment quantity and return `"duplicate"`. If new, add with quantity 1 and return `"added"`. This return value drives the ScanConfirmation type.
  - [x] 5.3 `updateQuantity(variantId, delta)` — adjusts quantity by +1 or -1. If quantity reaches 0, remove the item. Never allow negative quantities.
  - [x] 5.4 `removeItem(variantId)` — removes item from cart.
  - [x] 5.5 `clearCart()` — removes all items (caller should confirm first).
  - [x] 5.6 `holdTransaction()` — saves current cart items + timestamp to `heldTransactions` array (max 5 held). Creates a new empty active cart. Returns the held transaction ID.
  - [x] 5.7 `resumeTransaction(id)` — swaps current cart with the held transaction. If current cart has items, hold it first.
  - [x] 5.8 Cart state uses `useReducer` for predictable state updates (not multiple `useState` calls). Define `CartAction` union type: `ADD_ITEM`, `UPDATE_QUANTITY`, `REMOVE_ITEM`, `CLEAR_CART`, `HOLD_TRANSACTION`, `RESUME_TRANSACTION`.

- [x] Task 6: Upgrade POSCartPanel with full cart management UI (AC: #5, #6, #7)
  - [x] 6.1 Modify `components/pos/POSCartPanel.tsx` — consume `usePOSCart()` context instead of receiving `items` prop. Remove the `items` prop and `CartItem` type export (move `CartItem` type to `components/providers/POSCartProvider.tsx`).
  - [x] 6.2 Cart line items: show product name, size/color, quantity with +/- stepper buttons (56px touch targets), unit price, line total (qty × unit price). Use `formatCurrency` from `@/lib/formatters` for price display.
  - [x] 6.3 Cart footer: subtotal line, grand total (bold), "Complete Sale" button (disabled when cart empty — still placeholder for Story 3.4).
  - [x] 6.4 Cart actions bar: "Hold" button (saves current cart), "Clear Cart" button (with confirmation dialog). Show held transaction badges above the cart (tappable to resume, dimmed appearance, show item count + total).
  - [x] 6.5 Remove item: add a trash icon button on each line item (tap to remove, no swipe needed for tablet simplicity).

- [x] Task 7: Wire barcode scanning into POS page (AC: #1, #2, #3)
  - [x] 7.1 Modify `app/pos/page.tsx` — wrap content with `<POSCartProvider>`. Add `BarcodeScanner` component in the product grid area (above the search bar or as a toggleable panel). Wire `onScan` callback: call `getVariantByBarcode` query, then `addItem` from cart context, then show `ScanConfirmation` overlay.
  - [x] 7.2 Scan flow logic:
    1. Barcode scanned → call Convex query `getVariantByBarcode`
    2. If `null` → show ScanConfirmation with `type: "not-found"`, play error buzz
    3. If found → call `addItem()` from cart context
    4. If addItem returns `"duplicate"` → show ScanConfirmation with `type: "duplicate"`, play duplicate tone
    5. If addItem returns `"added"` → show ScanConfirmation with `type: "success"`, play success chime
  - [x] 7.3 Remove local `useState<CartItem[]>` from page — all cart state now lives in POSCartProvider. Remove `handleAddToCart` callback. Update `POSProductGrid`'s `onAddToCart` to use `usePOSCart().addItem`.
  - [x] 7.4 Add barcode scan debounce: ignore duplicate scans of the same barcode within 500ms (prevent double-scan from camera).

- [x] Task 8: Verify integration (AC: all)
  - [x] 8.1 Run `npx tsc --noEmit` — zero TypeScript errors
  - [x] 8.2 Run `npx next lint` — zero lint warnings/errors

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**BarcodeScanner — Use `Html5Qrcode` class, NOT `Html5QrcodeScanner`:**
The `Html5QrcodeScanner` provides its own built-in UI, but we need custom POS-styled UI. Use the lower-level `Html5Qrcode` class which gives full control over the UI while handling camera access and barcode detection.

```typescript
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

const scanner = new Html5Qrcode("reader-element", {
  formatsToSupport: [
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.QR_CODE,
  ],
});

await scanner.start(
  { facingMode: "environment" },
  { fps: 10, qrbox: { width: 250, height: 150 } },
  (decodedText, result) => { onScan(decodedText); },
  (errorMessage) => { /* ignore scan errors — they fire every frame */ }
);

// Cleanup:
await scanner.stop();
```

**Barcode Lookup — Use `by_barcode` index (already exists in schema):**
```typescript
// convex/pos/products.ts
export const getVariantByBarcode = query({
  args: { barcode: v.string() },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }
    const variant = await ctx.db.query("variants")
      .withIndex("by_barcode", q => q.eq("barcode", args.barcode))
      .first();
    if (!variant || !variant.isActive) return null;
    // Resolve style, category, brand, inventory...
  },
});
```

**POSCartProvider — React Context + useReducer (NO Redux/Zustand):**
Architecture mandates: "No additional state library. Server state via Convex, local UI state via React Context." The cart is local UI state until transaction completion (Story 3.4 will call a Convex mutation).

```typescript
// components/providers/POSCartProvider.tsx
type CartAction =
  | { type: "ADD_ITEM"; payload: CartItem }
  | { type: "UPDATE_QUANTITY"; variantId: Id<"variants">; delta: number }
  | { type: "REMOVE_ITEM"; variantId: Id<"variants"> }
  | { type: "CLEAR_CART" }
  | { type: "HOLD_TRANSACTION" }
  | { type: "RESUME_TRANSACTION"; transactionId: string };
```

**ScanConfirmation Overlay — NOT a toast:**
Per UX spec: "POS Exception: Scan feedback uses ScanConfirmation overlay (not toast) for speed." The overlay appears at the bottom of the product grid, auto-dismisses after 2s, supports tap-to-dismiss.

**Audio Feedback — Web Audio API (programmatic, no files):**
Generate tones using `AudioContext.createOscillator()`. No audio file dependencies needed. Different frequencies and waveforms differentiate success/error/duplicate states.

**Cart State Migration from Story 3.1:**
Story 3.1 used `useState<CartItem[]>` in `app/pos/page.tsx`. Story 3.2 promotes this to `POSCartProvider` context. The `CartItem` type moves from `components/pos/POSCartPanel.tsx` to `components/providers/POSCartProvider.tsx`. The `POSCartPanel` component will consume context via `usePOSCart()` hook instead of receiving items via props.

**Held Transactions — Client-side only (no server persistence):**
Hold/resume is local state within `POSCartProvider`. Held transactions are lost on page refresh. This is acceptable for online mode — Epic 4 (offline mode) will persist to IndexedDB.

**+/- Stepper — NOT text input:**
Per AC: "adjust quantity via +/- stepper (not text input)". Use two buttons (Minus and Plus) flanking the quantity number. Each button is 56px minimum touch target per POS theme.

**Price Display:**
Use `formatCurrency` from `@/lib/formatters` (already exists) for consistent `₱X,XXX.XX` formatting. Do NOT use raw `(price / 100).toFixed(2)` — use the formatter.

**Performance — NFR2: Barcode scan to price display <500ms:**
The `getVariantByBarcode` query uses an index lookup (O(1)). The ScanConfirmation overlay renders immediately with cached/optimistic data. This should be well within the 500ms target.

### Scope Boundaries — DO NOT IMPLEMENT

- **VAT calculation** → Story 3.3
- **Senior/PWD discount toggle** → Story 3.3
- **Payment processing / "Complete Sale" mutation** → Story 3.4
- **Receipt generation** → Story 3.5
- **End-of-day reconciliation** → Story 3.6
- **Offline cart persistence (IndexedDB)** → Epic 4
- **Swipe-to-remove gesture** → not needed, use delete button (simpler for tablet)
- **Barcode scanning for warehouse** → Epic 6

### Existing Code to Build Upon (Story 3.1)

**Already exists — DO NOT recreate:**
- `app/pos/layout.tsx` — POS layout with role guard, ErrorBoundary, `theme-pos` class
- `app/pos/page.tsx` — POS page with split layout, search, filter chips, local cart state (WILL BE MODIFIED)
- `convex/pos/products.ts` — `searchPOSProducts`, `listPOSBrands`, `listPOSCategories` (WILL ADD `getVariantByBarcode`)
- `components/pos/POSProductGrid.tsx` — Product grid with search and filters (NO CHANGES expected)
- `components/pos/POSCartPanel.tsx` — Cart panel with dual rendering (WILL BE HEAVILY MODIFIED)
- `app/globals.css` — POS theme CSS with 56px touch targets and 18px font
- `convex/schema.ts` — All tables defined, `variants.by_barcode` index exists
- `convex/_helpers/withBranchScope.ts` — Branch scoping helper
- `convex/_helpers/permissions.ts` — POS_ROLES, requireAuth, requireRole
- `lib/formatters.ts` — `formatCurrency(centavos)` returns `₱X,XXX.XX`
- `lib/utils.ts` — `cn()` for Tailwind class merging
- `components/ui/button.tsx` — shadcn Button component

**Key Patterns from Story 3.1 (follow these):**
- `withBranchScope(ctx)` + `POS_ROLES` check in every POS query
- Batch-load reference data into `Record<string, T>` lookups for efficient in-memory joins
- `"use client"` on all POS components
- `useRef` for timers/instances (not useState) — proper cleanup in useEffect
- `useCallback` for handler functions passed as props
- `next/image` with `unoptimized` for Convex storage URLs
- No Card shadcn component — use `div` with `rounded-md border` classes
- Toast from `sonner` for non-scan feedback (but scan feedback uses ScanConfirmation overlay)

**Key Schema Details:**
- `variants.barcode` is `v.optional(v.string())` — not all variants have barcodes
- `variants` has `by_barcode` index on `["barcode"]`
- `inventory` has `by_branch_variant` index on `["branchId", "variantId"]`

### Previous Story Learnings (from Story 3.1 Code Review)

- **H1**: Layout responsiveness — always use `lg:` breakpoint classes for desktop vs mobile. Don't assume fixed widths.
- **H2**: Debounce timers — use `useRef` + `useEffect` cleanup, not `useState`. Wrap handlers in `useCallback`.
- **M1**: Defense-in-depth — always add `POS_ROLES` check AFTER `withBranchScope()` in every POS query.
- **M2**: Bottom sheet overflow — ensure collapsible containers have `overflow-hidden`.
- **M3**: Parallel async — use `Promise.all` for independent async calls (e.g., storage URLs), not sequential awaits.
- **M4**: Touch targets — ALL interactive elements in POS must be minimum 56px (`min-h-14` in Tailwind). Don't use arbitrary values like `min-h-[44px]`.

### Project Structure Notes

```
Files to CREATE in this story:
├── components/shared/
│   └── BarcodeScanner.tsx              # html5-qrcode wrapper component
├── components/pos/
│   └── ScanConfirmation.tsx            # Barcode scan feedback overlay
├── components/providers/
│   └── POSCartProvider.tsx             # POS cart context (useReducer)
├── lib/
│   └── sounds.ts                       # Web Audio API tone generators

Files to MODIFY in this story:
├── convex/pos/products.ts              # Add getVariantByBarcode query
├── components/pos/POSCartPanel.tsx      # Full cart UI (stepper, hold, clear)
├── app/pos/page.tsx                    # Wire barcode + POSCartProvider

Files to reference (NOT modify):
├── app/pos/layout.tsx                  # Existing POS layout with role guard
├── convex/schema.ts                    # variants.by_barcode index
├── convex/_helpers/withBranchScope.ts  # Branch scoping helper
├── convex/_helpers/permissions.ts      # POS_ROLES definition
├── components/pos/POSProductGrid.tsx   # Product grid (no changes expected)
├── lib/formatters.ts                   # formatCurrency utility
├── lib/utils.ts                        # cn() utility
├── components/ui/button.tsx            # shadcn Button
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.2]
- [Source: _bmad-output/planning-artifacts/architecture.md — Component Organization, BarcodeScanner.tsx at components/shared/]
- [Source: _bmad-output/planning-artifacts/architecture.md — POSCartProvider.tsx at components/providers/]
- [Source: _bmad-output/planning-artifacts/architecture.md — State Management: Convex-Native + React Context]
- [Source: _bmad-output/planning-artifacts/architecture.md — html5-qrcode integration at Phase 2]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — ScanConfirmation component spec]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Interaction Feedback Table]
- [Source: convex/schema.ts — variants table with by_barcode index]
- [Source: convex/pos/products.ts — existing POS queries pattern]
- [Source: convex/catalog/variants.ts — getVariantBySku pattern (model for getVariantByBarcode)]
- [Source: components/pos/POSCartPanel.tsx — existing cart panel to modify]
- [Source: app/pos/page.tsx — existing POS page with local cart state]
- [Source: lib/formatters.ts — formatCurrency utility]
- [Source: _bmad-output/implementation-artifacts/3-1-pos-layout-and-product-search.md — Story 3.1 learnings and code review fixes]
- [Source: html5-qrcode npm ^2.3.8 — scanapp.org/html5-qrcode-docs/docs/apis/classes/Html5Qrcode]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Zero TypeScript errors (`npx tsc --noEmit`)
- Zero ESLint warnings/errors (`npx next lint`)

### Completion Notes List

- `getVariantByBarcode` query uses `by_barcode` index for O(1) lookup, resolves full product context (style, category, brand, inventory), returns null for inactive/missing entities
- `BarcodeScanner` component uses `Html5Qrcode` class (not `Html5QrcodeScanner`) for custom UI control; dynamically imported to avoid SSR issues; includes 500ms debounce to prevent duplicate scans; required `verbose: false` in config to satisfy TypeScript types
- `ScanConfirmation` overlay renders at bottom of screen with three visual states (green/success, red+shake/not-found, amber/duplicate); auto-dismisses after 2s; plays audio feedback via Web Audio API
- `lib/sounds.ts` generates tones programmatically using `AudioContext.createOscillator()` — no audio file dependencies; different frequencies and waveforms per state (800Hz sine for success, 200Hz square for error, 600Hz sine for duplicate)
- `POSCartProvider` uses `useReducer` with 6 action types for predictable state management; `addItem` returns `"added"` or `"duplicate"` to drive ScanConfirmation type; hold/resume supports max 5 held transactions; resuming with items in cart auto-holds current cart
- `POSCartPanel` completely rewritten: consumes `usePOSCart()` context (no more props); +/- stepper with 56px touch targets; trash icon per line item; Hold/Clear Cart action buttons with confirmation dialog; held transaction badges with resume capability; uses `formatCurrency` from `@/lib/formatters`
- `app/pos/page.tsx` wrapped with `<POSCartProvider>`; BarcodeScanner above product grid; scan handler uses `useConvex().query()` for imperative one-shot barcode lookup; local cart state removed (promoted to context)
- Shake animation added to `globals.css` for not-found scan state (`@keyframes shake`)

### Code Review Fixes Applied

- **H1**: `addItem`/`holdTransaction` in POSCartProvider now use `useRef` for stable callback identities — prevents cascading re-renders on every cart change
- **M1**: Added `"loading"` state to ScanResult — shows "Looking up barcode..." spinner during async Convex query
- **M2**: Changed audio dedup from string key to object reference comparison — fixes silent audio on repeated "not found" scans within 2s window
- **M3**: POSCartPanel now accepts `variant: "desktop" | "mobile"` prop — each instance renders only one layout, halving redundant DOM trees

### File List

- `convex/pos/products.ts` — MODIFIED: Added `getVariantByBarcode` query with by_barcode index lookup
- `components/shared/BarcodeScanner.tsx` — NEW: html5-qrcode wrapper with camera toggle, debounce, cleanup
- `components/pos/ScanConfirmation.tsx` — NEW: Scan feedback overlay (success/not-found/duplicate/loading states)
- `lib/sounds.ts` — NEW: Web Audio API tone generators (success chime, error buzz, duplicate tone)
- `components/providers/POSCartProvider.tsx` — NEW: React Context + useReducer cart state with stable callback refs
- `components/pos/POSCartPanel.tsx` — MODIFIED: Complete rewrite with context consumption, stepper, hold/resume, variant prop
- `app/pos/page.tsx` — MODIFIED: Wrapped with POSCartProvider, added BarcodeScanner + ScanConfirmation, loading state, variant props
- `app/globals.css` — MODIFIED: Added shake animation keyframes for scan not-found state

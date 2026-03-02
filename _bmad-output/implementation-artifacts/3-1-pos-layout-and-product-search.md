# Story 3.1: POS Layout & Product Search

Status: done

## Story

As a **Cashier**,
I want a tablet-optimized POS interface where I can search for products,
So that I can quickly find and add items to a customer's transaction.

## Acceptance Criteria

1. **Given** a Cashier signed in and on the `(pos)/` route
   **When** the POS loads on a tablet (1024px+)
   **Then** the screen shows a split layout: POSProductGrid (65% left) + POSCartPanel (35% right)

2. **Given** a smaller tablet (768-1023px)
   **When** the POS loads
   **Then** the layout is single-column with the cart as a collapsible bottom sheet

3. **Given** the POSProductGrid is displayed
   **Then** it shows product cards with: thumbnail image, style name, price, available sizes as pills, stock count for the cashier's branch
   **And** the grid is 3-column in portrait and 4-column in landscape orientation

4. **Given** the search bar in POSProductGrid
   **When** the cashier types text
   **Then** products are filtered instantly by style name, brand name, or SKU

5. **Given** the category/brand filter chips above the grid
   **When** the cashier taps a chip
   **Then** the grid filters to show only products matching the selected brand or category

6. **Given** the POS interface
   **Then** all touch targets are minimum 56px
   **And** the base font size is 18px per POS theme

## Tasks / Subtasks

- [x] Task 1: Create POS product search Convex queries (AC: #3, #4, #5)
  - [x] 1.1 Create `convex/pos/products.ts` with a `searchPOSProducts` query — accepts `{ branchId, searchText?, brandId?, categoryId? }`. Uses `withBranchScope(ctx)` for auth. Joins variants → styles → categories → brands. Groups by style. Returns array of `{ styleId, styleName, brandName, categoryName, basePriceCentavos, imageUrl?, sizes: { variantId, size, color, priceCentavos, stock }[] }`. Filters active-only entities. Text search filters on `styleName`, `brandName`, or `sku` (case-insensitive `.includes()`). Brand/category filters by ID match.
  - [x] 1.2 Create `listPOSBrands` query — returns active brands with at least one active variant (for filter chips)
  - [x] 1.3 Create `listPOSCategories` query — accepts optional `brandId`, returns active categories with at least one active variant (for filter chips, scoped to selected brand if provided)

- [x] Task 2: Create POSProductGrid component (AC: #3, #4, #5, #6)
  - [x] 2.1 Create `components/pos/POSProductGrid.tsx` — `"use client"` component. Props: `onAddToCart: (variantId: Id<"variants">, priceCentavos: number) => void`. Contains search input (56px height, 18px font, Search icon), brand/category filter chip bar (horizontal scroll, 56px touch targets), and responsive product grid.
  - [x] 2.2 Product card: rounded border, product image (from `getStylePrimaryImageUrl` or placeholder icon), style name (bold), brand name (muted), price in ₱ format (`(price / 100).toFixed(2)`), size pills (each pill is a button that calls `onAddToCart` with the specific variant), stock count badge per size pill (muted if 0, disable pill if out of stock).
  - [x] 2.3 Grid layout: CSS Grid with `grid-cols-3` portrait (< 1024px width) and `grid-cols-4` landscape (>= 1024px width) via Tailwind responsive classes. Gap of 12px. Cards have min-height for consistent rows.
  - [x] 2.4 Filter chips: horizontally scrollable flex row. "All" chip active by default. Brand chips first, then category chips (filtered by selected brand). Active chip uses primary variant, inactive uses outline. Tapping a brand chip filters grid AND updates category chip options.

- [x] Task 3: Create POSCartPanel placeholder component (AC: #1, #2)
  - [x] 3.1 Create `components/pos/POSCartPanel.tsx` — `"use client"` component. For Story 3.1, this is a placeholder panel showing "Cart" header, empty state message "Scan or search to add items", and a disabled "Complete Sale" button at the bottom. Props: `items: CartItem[]` (empty array for now). This will be fully implemented in Story 3.2.
  - [x] 3.2 On smaller tablets (responsive), the cart panel renders as a collapsible bottom sheet — use a fixed-bottom div with a drag handle/toggle button that expands up to 60% screen height. Desktop: full-height right panel.

- [x] Task 4: Build POS main page layout (AC: #1, #2, #6)
  - [x] 4.1 Replace `app/pos/page.tsx` placeholder with `"use client"` POS page. Split layout: `flex` container with POSProductGrid (65% / `flex-[65]`) and POSCartPanel (35% / `flex-[35]`). On screens < 1024px, stack vertically with cart as bottom sheet.
  - [x] 4.2 Page queries: `useQuery(api.pos.products.searchPOSProducts, { branchId, searchText, brandId, categoryId })` with debounced search text (300ms). Get `branchId` from current user's `branchId`. Handle loading states with skeleton placeholders.
  - [x] 4.3 Cart state: Define `CartItem` type `{ variantId: Id<"variants">, styleName: string, size: string, color: string, quantity: number, unitPriceCentavos: number }`. Use `useState<CartItem[]>([])` for local cart state. Wire `onAddToCart` callback from POSProductGrid to add/increment items in cart array. This local state will be promoted to POSCartProvider context in Story 3.2.

- [x] Task 5: Apply POS theme styles (AC: #6)
  - [x] 5.1 Add POS theme CSS rules to `app/globals.css` under `.theme-pos` selector: `font-size: 18px` base, larger touch targets via `min-height: 56px` on buttons/interactive elements within POS.
  - [x] 5.2 Ensure POSProductGrid search input, filter chips, size pills, and cart panel buttons all meet 56px minimum touch target height.

- [x] Task 6: Verify integration (AC: all)
  - [x] 6.1 Run `npx tsc --noEmit` — zero TypeScript errors
  - [x] 6.2 Run `npx next lint` — zero lint warnings/errors

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**POS Route Structure (ALREADY EXISTS — DO NOT recreate):**
The POS layout at `app/pos/layout.tsx` already exists with role guard (`ALLOWED_ROLES = ["admin", "manager", "cashier"]`), ErrorBoundary wrapper, and `theme-pos` CSS class. Only modify `app/pos/page.tsx` (currently a placeholder).

**Branch-Scoped Product Queries (CRITICAL):**
All POS product queries MUST use `withBranchScope(ctx)` from `convex/_helpers/withBranchScope.ts`. This enforces:
- Cashiers see only their assigned branch's stock levels
- Admin/HQ can access all branches (but POS typically operates from one branch)
- Users without a branch assignment are blocked

```typescript
import { withBranchScope } from "../_helpers/withBranchScope";

export const searchPOSProducts = query({
  args: { searchText: v.optional(v.string()), brandId: v.optional(v.id("brands")), categoryId: v.optional(v.id("categories")) },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    // Use branchId to look up inventory quantities
    // ...
  },
});
```

**Product Data Aggregation Pattern:**
POS product display requires joining multiple tables. Since Convex has no JOINs, collect data in steps:
1. Query `variants` (active only) — optionally filter by style/category/brand
2. For each variant, look up `inventory` via `by_branch_variant` index for stock count
3. Group variants by `styleId`
4. For each style group, fetch style name, category, brand, primary image

```typescript
// Inventory lookup per variant per branch:
const inv = await ctx.db.query("inventory")
  .withIndex("by_branch_variant", q => q.eq("branchId", branchId).eq("variantId", variantId))
  .first();
const stock = inv?.quantity ?? 0;
```

**Search Implementation — Client-side filtering is acceptable for Story 3.1:**
Convex doesn't support full-text search natively. For an initial implementation:
- Load all active styles with their variants for the branch
- Filter client-side by `styleName`, `brandName`, or `sku` using `.toLowerCase().includes(search.toLowerCase())`
- This works fine for catalogs up to ~1000 styles
- If performance becomes an issue, move filtering server-side in a later optimization

**POS Layout — Responsive Approach:**
```
Desktop/Large Tablet (>= 1024px):
┌──────────────────────────┬──────────────┐
│   POSProductGrid (65%)   │ POSCartPanel │
│   - Search bar           │    (35%)     │
│   - Filter chips         │  - Cart items│
│   - Product grid         │  - Totals    │
│                          │  - Pay btn   │
└──────────────────────────┴──────────────┘

Small Tablet (768-1023px):
┌────────────────────────────────────────┐
│   POSProductGrid (full width)          │
│   - Search bar                         │
│   - Filter chips                       │
│   - Product grid (3 cols)              │
├────────────────────────────────────────┤
│   POSCartPanel (bottom sheet)          │
│   - Collapsed: shows item count + total│
│   - Expanded: full cart view           │
└────────────────────────────────────────┘
```

**Cart State for Story 3.1 (Local useState ONLY):**
Story 3.1 implements basic `useState<CartItem[]>` for add-to-cart. Do NOT create POSCartProvider context yet — that's Story 3.2 scope. Keep it simple: `onAddToCart` callback in POSProductGrid calls the parent's state updater.

```typescript
// CartItem type (define in lib/types.ts or locally)
type CartItem = {
  variantId: Id<"variants">;
  styleName: string;
  size: string;
  color: string;
  quantity: number;
  unitPriceCentavos: number;
};
```

**POS Theme CSS:**
The `theme-pos` class is already applied in `app/pos/layout.tsx:43`. Add styles under this selector:
```css
.theme-pos {
  font-size: 18px;
}
.theme-pos button,
.theme-pos [role="button"],
.theme-pos input {
  min-height: 56px;
}
```

**Image Display for Products:**
Use existing `api.catalog.images.getStylePrimaryImageUrl` query to get image URLs. If no image exists, show a placeholder (Package icon from lucide-react).

**Price Display Convention:**
All prices are stored in centavos. Display in pesos: `₱${(priceCentavos / 100).toFixed(2)}`.

**Convex File Organization — POS Module:**
```
convex/pos/
└── products.ts          # POS product search queries (Story 3.1)
# Future files (NOT this story):
# ├── transactions.ts    # Story 3.4
# ├── receipts.ts        # Story 3.5
# └── reconciliation.ts  # Story 3.6
```

### Scope Boundaries — DO NOT IMPLEMENT

- **Barcode scanning** → Story 3.2 (html5-qrcode integration)
- **Cart quantity management (+/- stepper, remove, clear)** → Story 3.2
- **Hold/resume transactions** → Story 3.2
- **VAT calculation** → Story 3.3
- **Senior/PWD discount toggle** → Story 3.3
- **Payment processing** → Story 3.4
- **Receipt generation** → Story 3.5
- **End-of-day reconciliation** → Story 3.6
- **Offline mode** → Epic 4
- **POSCartProvider context** → Story 3.2 (use local useState for now)
- **Audio feedback** → Story 3.2

### Existing Code to Build Upon (Epics 1-2)

**Already exists — DO NOT recreate:**
- `app/pos/layout.tsx` — POS layout with role guard, ErrorBoundary, `theme-pos` class
- `app/pos/page.tsx` — Placeholder (WILL BE REPLACED)
- `convex/schema.ts` — All tables defined (variants, inventory, brands, categories, styles, productImages)
- `convex/catalog/variants.ts` — `listVariants`, `getVariantById`, `getVariantBySku`
- `convex/catalog/brands.ts` — `listBrands`, `getBrandById`
- `convex/catalog/categories.ts` — `listCategories`, `getCategoryById`
- `convex/catalog/styles.ts` — `listStyles`, `getStyleById`
- `convex/catalog/images.ts` — `getStylePrimaryImageUrl` (returns URL or null)
- `convex/_helpers/withBranchScope.ts` — `withBranchScope(ctx)` returns `{ user, userId, branchId, canAccessAllBranches }`
- `convex/_helpers/permissions.ts` — `POS_ROLES = ["admin", "manager", "cashier"]`, `requireAuth()`, `requireRole()`
- `lib/constants.ts` — `VAT_RATE = 0.12`, `ROLES`, `PAYMENT_METHODS`, `DISCOUNT_TYPES`
- `lib/types.ts` — Type exports (`User`, `Branch`, `Brand`, `Category`, `Style`, `Variant`)
- `lib/utils.ts` — `getErrorMessage()`, `cn()` (Tailwind merge)
- `components/ui/` — shadcn: button, input, badge, table, dialog, select, label, separator, sonner
- `components/shared/ErrorBoundary.tsx` — Error boundary component

**Key Schema Details (from `convex/schema.ts`):**
- `variants`: `styleId`, `sku`, `barcode?`, `size`, `color`, `gender?`, `priceCentavos`, `storageId?`, `isActive` — indexes: `by_style`, `by_sku`, `by_barcode`
- `inventory`: `branchId`, `variantId`, `quantity`, `lowStockThreshold?`, `updatedAt` — indexes: `by_branch`, `by_variant`, `by_branch_variant`
- `styles`: `categoryId`, `name`, `description?`, `basePriceCentavos`, `isActive` — index: `by_category`
- `categories`: `brandId`, `name`, `isActive` — index: `by_brand`
- `brands`: `name`, `logo?`, `isActive`
- `productImages`: `styleId`, `storageId`, `isPrimary`, `sortOrder` — index: `by_style`

**Convex Query Patterns (follow existing code):**
```typescript
// Index-based lookup:
const inventory = await ctx.db.query("inventory")
  .withIndex("by_branch_variant", q => q.eq("branchId", branchId).eq("variantId", variantId))
  .first();

// Collect all for filtering:
const allBrands = await ctx.db.query("brands").collect();
const activeBrands = allBrands.filter(b => b.isActive);

// withBranchScope (MUST use for POS):
const scope = await withBranchScope(ctx);
```

### Previous Story Learnings (from Epics 1-2)

- **Server-side validation:** Always validate on backend, not just client
- **Case-insensitive search:** Use `.toLowerCase()` comparison
- **`getErrorMessage` from `@/lib/utils`:** Never create local copies
- **`"use client"` directive:** Required on all POS components (they use hooks)
- **shadcn components:** Import from `@/components/ui/` — no Card component exists, use `div` with `rounded-md border` classes instead
- **Toast feedback:** Use `toast` from `sonner` for success/error messages
- **Loading states:** Show loading text while queries return `undefined` (Convex returns `undefined` while loading, then the actual data)

### Project Structure Notes

```
Files to CREATE in this story:
├── convex/pos/
│   └── products.ts               # POS product search queries
├── components/pos/
│   ├── POSProductGrid.tsx         # Product grid with search and filters
│   └── POSCartPanel.tsx           # Cart panel (placeholder for 3.1)

Files to MODIFY in this story:
├── app/pos/page.tsx              # Replace placeholder with POS layout
├── app/globals.css               # Add .theme-pos styles

Files to reference (NOT modify):
├── app/pos/layout.tsx            # Existing POS layout with role guard
├── convex/schema.ts              # Table definitions and indexes
├── convex/catalog/variants.ts    # Existing variant queries
├── convex/catalog/brands.ts      # listBrands query
├── convex/catalog/categories.ts  # listCategories query
├── convex/catalog/images.ts      # getStylePrimaryImageUrl query
├── convex/_helpers/withBranchScope.ts # Branch scoping helper
├── convex/_helpers/permissions.ts # Role definitions
├── lib/constants.ts              # VAT_RATE, ROLES, etc.
├── lib/types.ts                  # Type exports
├── lib/utils.ts                  # getErrorMessage, cn
├── components/ui/                # shadcn components
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.1]
- [Source: _bmad-output/planning-artifacts/architecture.md — POS Requirements FR15-25]
- [Source: _bmad-output/planning-artifacts/architecture.md — Data Architecture, Schema]
- [Source: _bmad-output/planning-artifacts/architecture.md — API & Communication Patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md — POS Route Group Structure]
- [Source: convex/schema.ts — variants, inventory, brands, categories, styles, productImages tables]
- [Source: convex/_helpers/withBranchScope.ts — Branch isolation pattern]
- [Source: convex/_helpers/permissions.ts — POS_ROLES definition]
- [Source: app/pos/layout.tsx — Existing POS layout with theme-pos class]
- [Source: convex/catalog/images.ts — getStylePrimaryImageUrl query]
- [Source: _bmad-output/implementation-artifacts/2-4-bulk-product-import.md — Previous story patterns]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Zero TypeScript errors (`npx tsc --noEmit`)
- Zero ESLint warnings/errors (`npx next lint`)

### Completion Notes List

- `searchPOSProducts` uses `withBranchScope` for auth and batch-loads all reference data (brands, categories, styles, variants, inventory, productImages) for efficient in-memory filtering
- Search matches on any variant SKU will include the entire style group (all variants)
- Admin/HQ users with `branchId: null` will see products but with stock = 0 (no inventory lookup)
- `listPOSBrands` and `listPOSCategories` use `requireRole(ctx, POS_ROLES)` for auth
- POSCartPanel has dual rendering: desktop (full-height right panel) and small tablet (collapsible bottom sheet with toggle)
- Cart state is local `useState` as specified — will be promoted to context in Story 3.2
- Used `next/image` with `unoptimized` for Convex storage URLs to satisfy lint rules
- POS theme CSS adds 18px base font and 56px min-height on touch targets

### Code Review Fixes (2026-02-27)

- **H1 fix**: Made layout responsive — product grid `flex-1 lg:flex-[65]`, cart wrapper `hidden lg:flex lg:flex-[35]`, separate bottom sheet rendering for small screens
- **H2 fix**: Replaced `useState` debounce timer with `useRef` + `useEffect` cleanup; wrapped handlers in `useCallback`
- **M1 fix**: Added POS_ROLES check to `searchPOSProducts` after `withBranchScope` for defense-in-depth
- **M2 fix**: Added `overflow-hidden` to bottom sheet collapsible container to prevent content flash
- **M3 fix**: Parallelized `ctx.storage.getUrl()` calls using `Promise.all` instead of sequential awaits
- **M4 fix**: Changed size pill touch targets from `min-h-[44px]` to `min-h-14` (56px) to match AC#6

### File List

- `convex/pos/products.ts` — NEW: searchPOSProducts, listPOSBrands, listPOSCategories queries
- `components/pos/POSProductGrid.tsx` — NEW: Product grid with search, filter chips, product cards with size pills
- `components/pos/POSCartPanel.tsx` — NEW: Cart panel placeholder (desktop + bottom sheet responsive)
- `app/pos/page.tsx` — MODIFIED: Replaced placeholder with full POS layout
- `app/globals.css` — MODIFIED: Added .theme-pos CSS rules

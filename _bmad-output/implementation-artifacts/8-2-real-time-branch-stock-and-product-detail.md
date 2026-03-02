# Story 8.2: Real-Time Branch Stock & Product Detail

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Customer**,
I want to see which branches have a product in stock in real-time,
so that I know exactly where to go to buy what I want.

## Acceptance Criteria

1. **Given** a customer taps on a ProductCard
   **When** the product detail page loads
   **Then** it shows: image gallery (swipeable, 3-5 images), product name, brand, price, color swatches (circles, not dropdown), size grid (visual selector, not dropdown)

2. **And** the BranchStockDisplay customer variant shows: branch name, distance (if location shared), stock quantity, status (In Stock green / Low amber / Out red / Incoming blue with ETA)

3. **And** stock levels update in real-time via Convex subscriptions

4. **And** out-of-stock variants show a "Notify Me" option

5. **And** sale items show strikethrough original price with red sale badge

## Tasks / Subtasks

- [x] Task 1: Create `getAllBranchStockForStylePublic` query in `convex/catalog/publicBrowse.ts` (AC: 2, 3)
  - [x] 1.1 Implement public query — args `{ styleId: v.id("styles") }`, no auth, replicates logic of `getAllBranchStockForStyle` from `convex/inventory/stockLevels.ts` without `withBranchScope()`
  - [x] 1.2 Return `Array<{ branchId, branchName, variants: Array<{ variantId, size, color, quantity, lowStockThreshold }> }>` — filter inactive branches, sort variants by `GARMENT_SIZE_ORDER`
  - [x] 1.3 Sort branches alphabetically by name (distance sorting deferred to Story 8.3 — branches table has no coordinates)

- [x] Task 2: Enhance `getStyleDetailPublic` query for sale price support (AC: 1, 5)
  - [x] 2.1 Add `basePriceCentavos` to the returned style object (already available from style doc) — VERIFIED: already returned at line 162
  - [x] 2.2 Each variant already returns `priceCentavos` — if `variant.priceCentavos < style.basePriceCentavos`, the variant is "on sale" — VERIFIED: sale logic is client-side
  - [x] 2.3 Add `description` field to returned object (already fetched but verify it's exposed) — VERIFIED: returned at line 161

- [x] Task 3: Create product detail page at `app/(customer)/browse/style/[styleId]/page.tsx` (AC: 1, 3, 5)
  - [x] 3.1 Create directory `app/(customer)/browse/style/[styleId]/`
  - [x] 3.2 "use client" page using `useQuery` for `getStyleDetailPublic` — loading skeleton + null/not-found state
  - [x] 3.3 Image gallery: horizontal scrollable container with dot indicators, `aspect-[3/4]` portrait images, Next.js `<Image>` with `priority` on first image, `sizes="(max-width: 768px) 100vw, 50vw"` for full-width mobile
  - [x] 3.4 Product info section: brand name (small/muted), product name (text-2xl font-bold), description (text-sm text-muted-foreground)
  - [x] 3.5 Price display: `formatPrice(priceCentavos)` for selected variant, sale logic with strikethrough + red sale badge
  - [x] 3.6 Color swatches: render unique colors as tappable circles (`w-8 h-8 rounded-full border-2`), selected state with ring, clicking filters size grid to that color's variants
  - [x] 3.7 Size grid: render sizes as tappable buttons (`min-h-[44px] rounded-md border`), use `GARMENT_SIZE_ORDER` for sort, unavailable sizes grayed out (`opacity-50 cursor-not-allowed`), selected state with primary border/bg
  - [x] 3.8 Back navigation: ArrowLeft button linking to `/browse`
  - [x] 3.9 Responsive: full-width image on mobile, side-by-side layout on `lg:` (image left, details right) with sticky image column

- [x] Task 4: Create `BranchStockDisplay` component at `components/shared/BranchStockDisplay.tsx` (AC: 2, 3)
  - [x] 4.1 Props: `{ styleId: Id<"styles">, selectedVariantId?: Id<"variants"> | null }`
  - [x] 4.2 Uses `useQuery` for `getAllBranchStockForStylePublic` — real-time updates automatic via Convex subscriptions
  - [x] 4.3 Render branch rows: branch name, stock status pill (In Stock green / Low Stock amber / Out of Stock red), quantity number
  - [x] 4.4 Stock status logic: quantity === 0 → "Out of Stock" (red), quantity <= lowStockThreshold → "Low Stock" (amber), else → "In Stock" (green)
  - [x] 4.5 If `selectedVariantId` provided, show stock for that specific variant per branch; otherwise show aggregate style-level stock per branch
  - [x] 4.6 Loading skeleton + empty state ("No stock information available")
  - [x] 4.7 Accessibility: `aria-label` on status indicators, semantic `<ul>/<li>` markup with `aria-label`

- [x] Task 5: Implement "Notify Me" for out-of-stock variants (AC: 4)
  - [x] 5.1 When selected size/color combination has 0 stock across all branches, show "Notify Me" button below size grid
  - [x] 5.2 Visual-only placeholder for MVP: clicking shows a toast "Notifications coming soon!" via sonner
  - [x] 5.3 Style: `border border-primary text-primary` outline button, `min-h-[44px]`

- [x] Task 6: Wire product detail page into existing navigation (AC: 1)
  - [x] 6.1 Verify ProductCard already links to `/browse/style/${styleId}` ✓ (confirmed in ProductCard.tsx line 37)
  - [x] 6.2 No route config changes needed — `/browse(.*)` already in PUBLIC_ROUTES ✓

- [x] Task 7: Run `npx convex codegen` after query changes — SUCCESS
- [x] Task 8: Validate TypeScript — `npx tsc --noEmit` → 0 errors
- [x] Task 9: Validate linting — `npx next lint` → 0 warnings (fixed useMemo for uniqueColors)
- [x] Task 10: Update this story Status to "review" and sprint-status.yaml to "review"

## Dev Notes

### CRITICAL: Public Query for Per-Branch Stock — MUST CREATE

The existing `getAllBranchStockForStyle` in `convex/inventory/stockLevels.ts` (line 112) calls `await withBranchScope(ctx)` which throws UNAUTHORIZED for unauthenticated users. This query CANNOT be used on the public product detail page.

Create a NEW public version in `convex/catalog/publicBrowse.ts`:

```typescript
export const getAllBranchStockForStylePublic = query({
  args: { styleId: v.id("styles") },
  handler: async (ctx, args) => {
    // NO auth check — public query
    const style = await ctx.db.get(args.styleId);
    if (!style || !style.isActive) return [];

    const variants = await ctx.db
      .query("variants")
      .withIndex("by_style", (q) => q.eq("styleId", args.styleId))
      .collect();
    const activeVariants = variants.filter((v) => v.isActive);
    if (activeVariants.length === 0) return [];

    // Get all active branches
    const branches = await ctx.db.query("branches").collect();
    const activeBranches = branches.filter((b) => b.isActive);

    // Build per-branch stock data
    const result = await Promise.all(
      activeBranches.map(async (branch) => {
        const branchVariants = await Promise.all(
          activeVariants.map(async (v) => {
            const inv = await ctx.db
              .query("inventory")
              .withIndex("by_branch_variant", (q) =>
                q.eq("branchId", branch._id).eq("variantId", v._id)
              )
              .unique();
            return {
              variantId: v._id,
              size: v.size,
              color: v.color,
              quantity: inv?.quantity ?? 0,
              lowStockThreshold: inv?.lowStockThreshold ?? 5,
            };
          })
        );
        // Sort by garment size order
        branchVariants.sort((a, b) => {
          const orderA = GARMENT_SIZE_ORDER[a.size.toUpperCase()] ?? 99;
          const orderB = GARMENT_SIZE_ORDER[b.size.toUpperCase()] ?? 99;
          return orderA - orderB;
        });
        return {
          branchId: branch._id,
          branchName: branch.name,
          variants: branchVariants,
        };
      })
    );

    return result.sort((a, b) => a.branchName.localeCompare(b.branchName));
  },
});
```

Copy the `GARMENT_SIZE_ORDER` constant from `convex/inventory/stockLevels.ts` (lines 100-108):
```typescript
const GARMENT_SIZE_ORDER: Record<string, number> = {
  XS: 0, S: 1, M: 2, L: 3, XL: 4, XXL: 5, XXXL: 6,
};
```

### Existing `getStyleDetailPublic` — What It Already Returns

The query at `convex/catalog/publicBrowse.ts` lines 108-169 already returns:
```typescript
{
  _id: Id<"styles">,
  name: string,
  description: string | undefined,
  basePriceCentavos: number,
  brandName: string,        // walked up: style → category → brand
  categoryName: string,
  images: Array<{ url: string | null, isPrimary: boolean }>,
  variants: Array<{
    _id: Id<"variants">,
    size: string,
    color: string,
    priceCentavos: number,
    sku: string,
    branchesInStock: number,  // aggregate count only
  }>,
}
```

**What's already there:** images (sorted by sortOrder), variants with size/color/price, brand name, category name, description, basePriceCentavos.

**What's NOT there but needed for sale logic:** Nothing — `basePriceCentavos` is on the style and `priceCentavos` is per variant. Compare them client-side: `variant.priceCentavos < style.basePriceCentavos` means sale.

### Image Gallery Pattern — Horizontal Scroll with Dots

Use a horizontal scrollable container with CSS snap points:
```tsx
<div className="relative">
  <div
    className="flex snap-x snap-mandatory overflow-x-auto [&::-webkit-scrollbar]:hidden"
    ref={galleryRef}
  >
    {images.map((img, i) => (
      <div key={i} className="relative w-full flex-shrink-0 snap-center aspect-[3/4]">
        <Image
          src={img.url!}
          alt={`${styleName} - image ${i + 1}`}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
          priority={i === 0}
        />
      </div>
    ))}
  </div>
  {/* Dot indicators */}
  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
    {images.map((_, i) => (
      <span key={i} className={cn(
        "h-2 w-2 rounded-full",
        i === activeIndex ? "bg-primary" : "bg-white/60"
      )} />
    ))}
  </div>
</div>
```

Use `IntersectionObserver` or `scroll` event with `scrollLeft` to track `activeIndex` for the dots.

### Color Swatches — Circles Pattern

Extract unique colors from variants, render as tappable circles:
```tsx
const uniqueColors = Array.from(new Set(variants.map((v) => v.color)));

<div className="flex flex-wrap gap-2">
  {uniqueColors.map((color) => (
    <button
      key={color}
      onClick={() => setSelectedColor(color)}
      className={cn(
        "w-8 h-8 rounded-full border-2 transition-all",
        selectedColor === color
          ? "ring-2 ring-primary ring-offset-2"
          : "border-muted-foreground/30"
      )}
      style={{ backgroundColor: colorToHex(color) }}
      aria-label={`Select ${color}`}
      aria-pressed={selectedColor === color}
    />
  ))}
</div>
```

**Color name to hex mapping:** The `color` field in variants is a string (e.g., "White", "Black", "Red"). Create a simple mapping or use a CSS-named-color approach. For unknown colors, show a neutral circle with the color name as text.

### Size Grid — Tappable Buttons

Filter variants by selected color, render sizes:
```tsx
const sizesForColor = variants
  .filter((v) => v.color === selectedColor)
  .sort((a, b) => (GARMENT_SIZE_ORDER[a.size.toUpperCase()] ?? 99) - (GARMENT_SIZE_ORDER[b.size.toUpperCase()] ?? 99));

<div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
  {sizesForColor.map((v) => (
    <button
      key={v._id}
      onClick={() => v.branchesInStock > 0 && setSelectedVariant(v)}
      disabled={v.branchesInStock === 0}
      className={cn(
        "min-h-[44px] rounded-md border text-sm font-medium transition-colors",
        selectedVariant?._id === v._id
          ? "border-primary bg-primary text-primary-foreground"
          : v.branchesInStock > 0
            ? "hover:border-primary"
            : "opacity-50 cursor-not-allowed bg-muted"
      )}
      aria-label={`Size ${v.size}${v.branchesInStock === 0 ? " - out of stock" : ""}`}
    >
      {v.size}
    </button>
  ))}
</div>
```

### Sale Price Display Logic

No explicit `isOnSale` field exists. Determine sale status client-side:
```typescript
const isOnSale = selectedVariant && selectedVariant.priceCentavos < style.basePriceCentavos;
```

Render:
```tsx
{isOnSale ? (
  <div className="flex items-center gap-2">
    <span className="text-sm line-through text-muted-foreground">
      {formatPrice(style.basePriceCentavos)}
    </span>
    <span className="text-xl font-bold text-red-600">
      {formatPrice(selectedVariant.priceCentavos)}
    </span>
    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-600">
      SALE
    </span>
  </div>
) : (
  <span className="text-xl font-bold">
    {formatPrice(selectedVariant?.priceCentavos ?? style.basePriceCentavos)}
  </span>
)}
```

### BranchStockDisplay — Stock Status Logic

```typescript
function getStockStatus(quantity: number, threshold: number) {
  if (quantity === 0) return { label: "Out of Stock", color: "text-red-600 bg-red-50" };
  if (quantity <= threshold) return { label: "Low Stock", color: "text-amber-600 bg-amber-50" };
  return { label: "In Stock", color: "text-green-600 bg-green-50" };
}
```

**AC#2 mentions "Incoming Transfer (blue with ETA)"** — The transfers system exists from Epic 6 but transfer data requires auth (`withBranchScope`). Showing pending transfers publicly would expose internal logistics. For MVP, display only green/amber/red status. Blue "Incoming" status deferred to authenticated views.

**AC#2 mentions "distance (if location shared)"** — The `branches` table has `address` but NO `latitude/longitude` fields. Distance calculation requires geolocation infrastructure from Story 8.3 (Branch Finder). For now, branches are sorted alphabetically by name.

### Real-Time Updates (AC#3) — Already Built Into Convex

Convex `useQuery` hooks automatically subscribe to real-time updates. When inventory changes in the database, all connected clients with active `useQuery` subscriptions on that data will automatically re-render. No additional WebSocket or polling code needed.

```tsx
// This automatically re-renders when ANY inventory record changes for this style
const branchStock = useQuery(
  api.catalog.publicBrowse.getAllBranchStockForStylePublic,
  { styleId }
);
```

### "Notify Me" — MVP Placeholder (AC#4)

No notification system exists yet. Implement as visual-only:
```tsx
import { toast } from "sonner";

<button
  onClick={() => toast.info("Notifications coming soon! Check back later.")}
  className="mt-2 w-full min-h-[44px] rounded-md border border-primary text-primary text-sm font-medium hover:bg-primary/5"
>
  Notify Me When Available
</button>
```

### Responsive Detail Page Layout

```
Mobile (<lg):
┌──────────────────────┐
│   Image Gallery      │  ← Full width, swipeable
│   (aspect-[3/4])     │
├──────────────────────┤
│ Brand · Category     │
│ Product Name         │
│ ₱X,XXX.XX  SALE     │
├──────────────────────┤
│ Color: ○ ○ ○ ○      │
│ Size: [S][M][L][XL]  │
├──────────────────────┤
│ Branch Stock Display │
│ ├ Branch A: In Stock │
│ ├ Branch B: Low (3)  │
│ └ Branch C: Out      │
└──────────────────────┘

Desktop (lg:):
┌────────────────┬────────────────────────┐
│                │ Brand · Category       │
│  Image Gallery │ Product Name           │
│  (sticky)      │ ₱X,XXX.XX  SALE       │
│                │                        │
│                │ Color: ○ ○ ○ ○         │
│                │ Size: [S][M][L][XL]    │
│                │                        │
│                │ Branch Stock Display   │
│                │ ├ Branch A: In Stock   │
│                │ ├ Branch B: Low (3)    │
│                │ └ Branch C: Out        │
└────────────────┴────────────────────────┘
```

Desktop layout: `lg:grid lg:grid-cols-2 lg:gap-8` with image column `lg:sticky lg:top-20`.

### Performance Considerations

- `getAllBranchStockForStylePublic` is O(branches × variants) per request — with ~20 branches and ~10 variants, that's ~200 index lookups. Acceptable for MVP.
- Use `priority` on first gallery image for LCP optimization.
- Use `loading="lazy"` on subsequent gallery images.
- Use `aspect-[3/4]` on image containers to prevent CLS.

### Existing Patterns from Story 8.1 (MUST Follow)

- All public queries in `convex/catalog/publicBrowse.ts` — NO auth, filter `isActive` only
- `"use client"` directive on all interactive pages
- `useQuery` from `convex/react` + `api` from `@/convex/_generated/api`
- Loading: `=== undefined` → skeleton, `=== null` → not found state
- Price: centavos → `₱X,XXX.XX` via `formatPrice()` (reuse from ProductCard or duplicate)
- Touch targets: 44px minimum (`min-h-[44px]`)
- `cn()` from `@/lib/utils` for conditional classes
- `ArrowLeft` from `lucide-react` for back navigation
- Toast: `import { toast } from "sonner"`

### Files That Already Exist (DO NOT Recreate)

- `convex/catalog/publicBrowse.ts` — ADD new query, do NOT recreate file
- `components/shared/ProductCard.tsx` — Already links to `/browse/style/${styleId}`, do NOT modify
- `app/(customer)/layout.tsx` — Customer layout with header + bottom nav, do NOT modify
- `next.config.ts` — Already has Convex image domain, do NOT modify
- `lib/routes.ts` — `/browse(.*)` already covers detail route, do NOT modify

### Files to Create/Modify

- `convex/catalog/publicBrowse.ts` (MODIFY — add `getAllBranchStockForStylePublic` query + enhance `getStyleDetailPublic`)
- `app/(customer)/browse/style/[styleId]/page.tsx` (CREATE — product detail page)
- `components/shared/BranchStockDisplay.tsx` (CREATE — reusable branch stock component)

### No shadcn Card Component

shadcn/ui `card` component is NOT installed. Use div-based markup with `rounded-lg border` pattern established in Story 8.1.

### Project Structure Notes

- Route: `/browse/style/[styleId]` → `app/(customer)/browse/style/[styleId]/page.tsx`
- Uses `[styleId]` (NOT `[slug]`) — styles table has no slug field
- Directory `app/(customer)/browse/style/` does NOT exist yet — must create
- BranchStockDisplay goes in `components/shared/` per architecture doc (shared across customer and potentially staff views)

### References

- [Source: `convex/catalog/publicBrowse.ts` lines 108-169 — `getStyleDetailPublic` existing implementation]
- [Source: `convex/inventory/stockLevels.ts` lines 100-108 — `GARMENT_SIZE_ORDER` constant]
- [Source: `convex/inventory/stockLevels.ts` lines 112-194 — `getAllBranchStockForStyle` auth-gated pattern to replicate]
- [Source: `convex/schema.ts` lines 55-106 — styles, variants, productImages, inventory tables + indexes]
- [Source: `convex/schema.ts` lines 26-37 — branches table (no coordinates/lat/lng)]
- [Source: `components/shared/ProductCard.tsx` line 37 — links to `/browse/style/${styleId}`]
- [Source: `app/(customer)/browse/[brandId]/page.tsx` — loading/null pattern, useQuery with "skip" guard]
- [Source: `lib/routes.ts` line 39 — `/browse(.*)` covers detail route]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — BranchStockDisplay in components/shared/, NFR27 WCAG 2.1 AA]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` — Nike-inspired detail page, color swatches circles, size grid, BranchStockDisplay spec]
- [Source: Story 8.1 — publicBrowse.ts patterns, formatPrice, touch targets, loading skeletons, cn() utility]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Lint warning: `uniqueColors` in useEffect deps — fixed by wrapping in `useMemo`

### Completion Notes List

- Task 1: Created `getAllBranchStockForStylePublic` public query — no auth, per-branch stock per variant, sorted by `GARMENT_SIZE_ORDER` and branch name alphabetically
- Task 2: Verified `getStyleDetailPublic` already returns `basePriceCentavos`, `description`, and per-variant `priceCentavos` — sale logic is client-side comparison
- Task 3: Created full product detail page with image gallery (CSS snap + IntersectionObserver dots), color swatches (circles with hex mapping), size grid (tappable buttons), sale price display, responsive layout (mobile stacked, desktop side-by-side with sticky image)
- Task 4: Created `BranchStockDisplay` shared component with real-time stock via Convex subscriptions, variant-specific or aggregate view, green/amber/red status pills
- Task 5: Integrated "Notify Me" placeholder directly into detail page — sonner toast on click
- Task 6: Routing verified — ProductCard links correct, PUBLIC_ROUTES already covers `/browse(.*)`
- Distance sorting deferred to Story 8.3 (branches table has no coordinates)
- "Incoming Transfer" (blue) status deferred — requires auth-gated transfer data

### Code Review Fixes Applied

- **H1**: Added `error.tsx` error boundary for invalid styleId — prevents white screen crash on malformed URLs
- **M1**: Extracted `formatPrice` to `lib/utils.ts` — removed duplicates from ProductCard.tsx and page.tsx
- **M2**: Fixed BranchStockDisplay aggregate threshold — changed from `Math.min` to sum of thresholds to match summed quantities
- **M3**: Extracted `GARMENT_SIZE_ORDER` to `convex/_helpers/constants.ts` — removed duplicates from stockLevels.ts and publicBrowse.ts

### File List

- `convex/catalog/publicBrowse.ts` (MODIFIED — added `getAllBranchStockForStylePublic` query, imports shared constant)
- `convex/_helpers/constants.ts` (CREATED — shared `GARMENT_SIZE_ORDER` constant)
- `convex/inventory/stockLevels.ts` (MODIFIED — imports `GARMENT_SIZE_ORDER` from shared constants)
- `app/(customer)/browse/style/[styleId]/page.tsx` (CREATED — product detail page with all AC features)
- `app/(customer)/browse/style/[styleId]/error.tsx` (CREATED — error boundary for invalid IDs)
- `components/shared/BranchStockDisplay.tsx` (CREATED — reusable branch stock display component)
- `lib/utils.ts` (MODIFIED — added shared `formatPrice` utility)
- `components/shared/ProductCard.tsx` (MODIFIED — imports `formatPrice` from shared utility)

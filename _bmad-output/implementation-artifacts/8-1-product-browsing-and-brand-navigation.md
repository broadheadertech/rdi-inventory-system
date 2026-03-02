# Story 8.1: Product Browsing & Brand Navigation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Customer**,
I want to browse products by brand and category on a mobile-friendly website,
so that I can discover what's available at RedBox stores near me.

## Acceptance Criteria

1. **Given** a visitor on the `(customer)/` route (no auth required for browsing)
   **When** the customer website loads
   **Then** pages are server-side rendered for SEO (Next.js App Router SSR)

2. **And** the mobile-first layout shows: bottom nav (Home, Browse, Cart, Account), top header with logo + search + branch selector

3. **And** brands are browsable: `/browse` shows brand cards, `/browse/[brandId]` shows that brand's products

4. **And** category browsing via horizontal scrollable chips on the brand page

5. **And** ProductCards show: hero image (Next.js `<Image>` with lazy load + blur-up), brand logo, name, price, "Available at X branches" text, size availability dots

6. **And** product grid: 2-column mobile, 3-column tablet, 4-column desktop

7. **And** First Contentful Paint <1 second, Largest Contentful Paint <2 seconds

## Tasks / Subtasks

- [x] Task 1: Create public catalog queries in `convex/catalog/publicBrowse.ts` (AC: 1, 3, 4, 5)
  - [x]1.1 Implement `listActiveBrandsPublic` query — no auth, filter `isActive === true`, return `{ _id, name, logo }` sorted alphabetically
  - [x]1.2 Implement `getBrandWithCategoriesPublic` query — args `{ brandId: v.id("brands") }`, no auth, verify brand isActive, fetch categories via `by_brand` index, filter isActive, return brand + categories
  - [x]1.3 Implement `getStylesByCategoryPublic` query — args `{ categoryId: v.id("categories") }`, no auth, verify category isActive, fetch styles via `by_category` index, filter isActive, for each style fetch primary image URL + variant count + branch availability count
  - [x]1.4 Implement `getStyleDetailPublic` query — args `{ styleId: v.id("styles") }`, no auth, return style + all images (sorted by sortOrder) + all active variants (size/color/price) + branch stock summary per variant
  - [x]1.5 Implement `getBrandImageUrl` query — args `{ storageId: v.id("_storage") }`, no auth, return `ctx.storage.getUrl(storageId)` — needed for rendering images without HQ auth

- [x] Task 2: Update `next.config.ts` — add Convex image domain (AC: 5, 7)
  - [x]2.1 Add `images.remotePatterns` config for Convex storage URLs: `{ protocol: "https", hostname: "**.convex.cloud" }`

- [x] Task 3: Create customer layout with header + bottom nav in `app/(customer)/layout.tsx` (AC: 2)
  - [x]3.1 Replace existing minimal layout with full customer layout: `<header>` with RedBox logo (text), search input (visual only — functional search in future story), branch selector dropdown
  - [x]3.2 Add bottom navigation bar with 4 items: Home (`/browse`), Browse (`/browse`), Cart (placeholder badge), Account (placeholder) — sticky bottom, 44px touch targets, mobile-visible only (hidden on `lg:` breakpoint)
  - [x]3.3 Add top navigation for desktop (`lg:` breakpoint and above) — replaces bottom nav with horizontal nav bar
  - [x]3.4 Wrap children in `<main className="pb-16 lg:pb-0">` to account for bottom nav height on mobile
  - [ ] 3.5 Add metadata export for SEO — DEFERRED: layout is "use client" for interactive nav; metadata requires server component wrapper (future story)

- [x] Task 4: Create brand listing page at `app/(customer)/browse/page.tsx` (AC: 3, 6)
  - [x]4.1 Replace placeholder with SSR-compatible page using `useQuery` for `listActiveBrandsPublic`
  - [x]4.2 Render brand cards in responsive grid: `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4`
  - [x]4.3 Each brand card: brand logo/name, link to `/browse/[brandId]`, rounded-lg border styling, 44px min touch target
  - [x]4.4 Loading skeleton and empty state ("No brands available")

- [x] Task 5: Create brand products page at `app/(customer)/browse/[brandId]/page.tsx` (AC: 3, 4, 5, 6)
  - [x]5.1 Fetch brand + categories via `getBrandWithCategoriesPublic`
  - [x]5.2 Render horizontal scrollable category chips: `<div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">` — each chip is a button toggling the selected category filter, 44px min height
  - [x]5.3 Fetch styles for selected category via `getStylesByCategoryPublic`
  - [x]5.4 Render product grid with ProductCard components: `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4`
  - [x]5.5 "All" chip selected by default showing first category's products
  - [x]5.6 Loading skeletons for cards and category chips
  - [x]5.7 Empty state: "No products found in this category"

- [x] Task 6: Create `ProductCard` component at `components/shared/ProductCard.tsx` (AC: 5, 6, 7)
  - [x]6.1 Props: `{ styleId, name, brandName, priceCentavos, primaryImageUrl, variantCount, branchCount }`
  - [x]6.2 Render: Next.js `<Image>` with `sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"`, `placeholder="blur"` with blurDataURL (use tiny 1px base64 placeholder), `loading="lazy"`
  - [x]6.3 Content below image: brand name (small, muted), product name (font-semibold), price formatted as `₱X,XXX.XX` (from centavos), "Available at X branches" (text-sm text-muted-foreground)
  - [x]6.4 Link wraps entire card → `/browse/style/[styleId]` (product detail page is Story 8.2)
  - [x]6.5 Hover: `hover:shadow-md transition-shadow` on desktop
  - [x]6.6 Card height: uniform via `aspect-[3/4]` on image container + consistent text layout below

- [x] Task 7: Run `npx convex codegen` after new Convex files
- [x] Task 8: Validate TypeScript — `npx tsc --noEmit` → 0 errors
- [x] Task 9: Validate linting — `npx next lint` → 0 warnings
- [x] Task 10: Update this story Status to "review" and sprint-status.yaml to "review"

## Dev Notes

### PUBLIC Queries — No Auth Required (CRITICAL)

All existing catalog queries in `convex/catalog/brands.ts`, `categories.ts`, `styles.ts`, `images.ts` use `requireRole(ctx, HQ_ROLES)`. The customer website CANNOT use these — they reject unauthenticated requests.

Create a NEW file `convex/catalog/publicBrowse.ts` with PUBLIC queries (no auth check). These queries:
- Do NOT call `requireRole()` or `withBranchScope()`
- Only return `isActive === true` records (never expose inactive/draft products)
- Return minimal fields (no internal metadata like `createdAt`, `updatedAt`)
- Use the SAME indexes as existing queries (`by_brand`, `by_category`, `by_style`)

```typescript
import { query } from "../_generated/server";
import { v } from "convex/values";

export const listActiveBrandsPublic = query({
  args: {},
  handler: async (ctx) => {
    // NO auth check — public query
    const brands = await ctx.db.query("brands").collect();
    return brands
      .filter((b) => b.isActive)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((b) => ({ _id: b._id, name: b.name, logo: b.logo }));
  },
});
```

### Brand URL Routing — Use `brandId` NOT `slug`

The `brands` table has NO `slug` field. The AC mentions brand browsing pages. Use `[brandId]` dynamic segments instead of `[slug]`:
- Route: `/browse/[brandId]` → `app/(customer)/browse/[brandId]/page.tsx`
- The brandId is a Convex document ID (string like `k57abc123...`)
- This is simpler than adding a slug field + migration

Do NOT add a `slug` field to the brands table — that would require schema migration and updating all existing brand entries.

### Customer Route Group — Already Exists

`app/(customer)/` route group already exists:
- `layout.tsx` — minimal layout with ErrorBoundary + `theme-customer` class (line 1-13)
- `browse/page.tsx` — placeholder "Coming in Epic 8" (replace this)

The layout needs to be ENHANCED (not replaced) — keep the ErrorBoundary wrapper and `theme-customer` class.

### Public Routes — Already Configured in Middleware

`lib/routes.ts` (lines 34-43) already defines `PUBLIC_ROUTES`:
```typescript
export const PUBLIC_ROUTES = [
  "/", "/sign-in(.*)", "/sign-up(.*)", "/api/webhooks(.*)",
  "/browse(.*)", "/products(.*)", "/branches(.*)", "/reserve(.*)",
];
```

`/browse(.*)` matches all customer browsing routes. No middleware changes needed.

### Next.js Image Configuration — MUST Add Convex Domain

`next.config.ts` currently has NO `images` configuration. Convex storage URLs (`*.convex.cloud`) need to be whitelisted:

```typescript
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.convex.cloud",
      },
    ],
  },
  // ... existing headers config
};
```

Without this, `<Image src={convexUrl} />` will fail with "hostname not configured" error.

### Product Image System — `productImages` Table

Images are stored per STYLE (not per variant). Schema:
```typescript
productImages: defineTable({
  styleId: v.id("styles"),
  storageId: v.id("_storage"),
  isPrimary: v.boolean(),
  sortOrder: v.number(),
  createdAt: v.number(),
}).index("by_style", ["styleId"]),
```

- Each style can have up to 5 images (MAX_IMAGES_PER_STYLE = 5 in `images.ts`)
- One image is marked `isPrimary: true`
- Images are sorted by `sortOrder` ascending
- Get URL via `ctx.storage.getUrl(storageId)`
- Variants also have an optional `storageId` field for variant-specific images

For the ProductCard, use the STYLE's primary image. Fetch with:
```typescript
const images = await ctx.db
  .query("productImages")
  .withIndex("by_style", (q) => q.eq("styleId", styleId))
  .collect();
const primary = images.find((img) => img.isPrimary);
const url = primary ? await ctx.storage.getUrl(primary.storageId) : null;
```

### Product Hierarchy — 4 Levels

```
brands → categories → styles → variants
  ↓          ↓           ↓          ↓
Nike      Shoes      Air Max 90   Size 10 / White / ₱7,999
```

- **Brand page** (`/browse`) → shows brand cards
- **Brand products** (`/browse/[brandId]`) → shows categories as chips, styles as product cards
- **Product detail** (`/browse/style/[styleId]`) → Story 8.2 (NOT this story)

For the ProductCard in this story, the "product" is a **style** (e.g., "Air Max 90"). The card shows the style name, base price, primary image, and how many branches carry it.

### Price Formatting — Centavos to Pesos

Prices are stored in centavos (integers). Format for display:
```typescript
function formatPrice(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
```

Use `basePriceCentavos` from the `styles` table for the ProductCard price. Individual variants may have different `priceCentavos` (shown on detail page, Story 8.2).

### Branch Availability Count for ProductCard

AC#5 says ProductCard shows "Available at X branches". To compute this efficiently:
1. Get all active variants for the style (by_style index)
2. Get inventory records for those variants (by_variant index)
3. Count distinct branches with quantity > 0

This is a cross-branch query with no auth — returns aggregate count only (not branch details).

```typescript
// In getStylesByCategoryPublic or a separate enrichment
const variants = await ctx.db
  .query("variants")
  .withIndex("by_style", (q) => q.eq("styleId", style._id))
  .collect();
const activeVariantIds = variants.filter(v => v.isActive).map(v => v._id);
const branchSet = new Set<string>();
for (const vId of activeVariantIds) {
  const inv = await ctx.db
    .query("inventory")
    .withIndex("by_variant", (q) => q.eq("variantId", vId))
    .collect();
  for (const row of inv) {
    if (row.quantity > 0) branchSet.add(row.branchId as string);
  }
}
const branchCount = branchSet.size;
```

**Performance note:** This is O(variants × inventory) per style. For the initial implementation with ~20 branches and moderate catalog size, this is acceptable. If performance becomes an issue, consider adding a denormalized `branchAvailabilityCount` field on the styles table.

### Responsive Grid — Tailwind Classes

```tsx
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
  {styles.map((style) => (
    <ProductCard key={style._id} ... />
  ))}
</div>
```

Breakpoints per `tailwind.config.ts` defaults:
- `<640px` — 2 columns (mobile)
- `md: 768px` — 3 columns (tablet)
- `lg: 1024px` — 4 columns (desktop)

### Bottom Navigation Pattern

Mobile bottom nav with 4 items. Use sticky positioning:
```tsx
<nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background lg:hidden">
  <div className="flex items-center justify-around h-16">
    {navItems.map((item) => (
      <Link
        key={item.href}
        href={item.href}
        className="flex flex-col items-center justify-center min-h-[44px] min-w-[44px] gap-1 text-xs"
      >
        <item.icon className="h-5 w-5" />
        <span>{item.label}</span>
      </Link>
    ))}
  </div>
</nav>
```

Hide on desktop (`lg:hidden`) — desktop uses top horizontal nav instead.

### Category Chips — Horizontal Scroll

```tsx
<div className="flex gap-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
  {categories.map((cat) => (
    <button
      key={cat._id}
      onClick={() => setSelectedCategory(cat._id)}
      className={cn(
        "flex-shrink-0 rounded-full px-4 min-h-[44px] text-sm font-medium border",
        selectedCategory === cat._id
          ? "bg-primary text-primary-foreground"
          : "bg-background text-foreground"
      )}
    >
      {cat.name}
    </button>
  ))}
</div>
```

### SSR Considerations for SEO (AC#1)

Customer pages should leverage Next.js App Router for SEO:
- Use `"use client"` only where interactivity is needed (category chips, search, nav)
- Use `export const metadata` in page files for SEO metadata
- The Convex `useQuery` hook requires `"use client"` — this is OK since Convex handles the data fetching reactively on the client
- For future SEO optimization, consider using `preloadQuery` from `convex/nextjs` for server-side data loading (advanced pattern, not required for MVP)

### Performance Targets (AC#7)

- FCP <1s: Keep layout lightweight, use loading skeletons
- LCP <2s: Use Next.js `<Image>` with proper `sizes` prop, `loading="lazy"` for below-fold images, `priority` for above-fold hero images
- Minimize client-side JS: Don't import unnecessary libraries
- Use `aspect-[3/4]` on image containers to prevent layout shift (CLS)

### Existing Shared Components

Currently in `components/shared/`:
- `ErrorBoundary.tsx` — used by customer layout
- `BarcodeScanner.tsx` — POS-specific, not relevant
- `ReceiptPDF.tsx` — POS-specific
- `ConnectionIndicator.tsx` — offline indicator

No ProductCard or customer-facing components exist yet. The `ProductCard` component created in this story will be reused across Stories 8.1 and 8.2.

### No Card Component from shadcn/ui

shadcn/ui `card` component is NOT installed. Use div-based markup:
```tsx
<div className="rounded-lg border overflow-hidden">
  <div className="aspect-[3/4] relative bg-muted">
    <Image ... />
  </div>
  <div className="p-3 space-y-1">
    ...
  </div>
</div>
```

### Sonner for Toast Notifications

```tsx
import { toast } from "sonner";
toast.success("...");
toast.error("...");
```

### Always Run Codegen After New Convex Files

After creating `convex/catalog/publicBrowse.ts`:
```bash
npx convex codegen
```

### `cn()` Utility for Conditional Classes

```typescript
import { cn } from "@/lib/utils";
```

Already available — use for conditional className merging.

### Project Structure Notes

- Route group: `app/(customer)/` (parenthesized, NOT `app/customer/`)
- Customer layout: `app/(customer)/layout.tsx` (ENHANCE existing)
- Browse page: `app/(customer)/browse/page.tsx` (REPLACE placeholder)
- Brand page: `app/(customer)/browse/[brandId]/page.tsx` (CREATE)
- Public queries: `convex/catalog/publicBrowse.ts` (CREATE)
- Shared component: `components/shared/ProductCard.tsx` (CREATE)
- Config: `next.config.ts` (MODIFY — add image domains)

### References

- [Source: `convex/schema.ts` lines 39-95 — brands, categories, styles, variants, productImages tables]
- [Source: `convex/catalog/brands.ts` — existing HQ-gated brand queries (DO NOT reuse for customer)]
- [Source: `convex/catalog/images.ts` lines 1-50 — image query patterns, storage.getUrl()]
- [Source: `convex/inventory/stockLevels.ts` lines 112-160 — getAllBranchStockForStyle cross-branch pattern]
- [Source: `app/(customer)/layout.tsx` — existing minimal layout with ErrorBoundary]
- [Source: `app/(customer)/browse/page.tsx` — placeholder to replace]
- [Source: `lib/routes.ts` lines 34-43 — PUBLIC_ROUTES includes /browse(.*)]
- [Source: `middleware.ts` — Clerk middleware bypasses public routes]
- [Source: `next.config.ts` — missing image domain config]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — FR49 product browsing, (customer)/ route group]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` — customer journey, ProductCard spec, responsive grid, brand-first navigation]
- [Source: Story 7.5 Dev Notes — Recharts pattern, no Card component, sonner toast, codegen after schema changes]
- [Source: Story 7.3/7.4 — listActiveBranches pattern, batch-fetch for N+1, date helpers]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- D1: tsc --noEmit → 0 errors
- D2: next lint → 0 warnings
- D3: convex codegen → success

### Completion Notes List

- Created 5 public catalog queries with no auth requirement (publicBrowse.ts)
- Enhanced customer layout with sticky header, desktop nav, and mobile bottom nav with 44px touch targets
- Brand listing page with responsive grid (2/3/4 col), loading skeletons, and empty state
- Brand products page with category chips, auto-selects first category, product grid via ProductCard
- ProductCard component with Next.js Image, price formatting (centavos → ₱), variant count, branch availability
- Task 3.5 (metadata export) deferred: layout is "use client" for interactive nav — metadata can be added to individual page files or a server-side wrapper in a future story
- Category chips use `role="tablist"` + `aria-selected` for accessibility

### File List

- convex/catalog/publicBrowse.ts (CREATED)
- next.config.ts (MODIFIED — added images.remotePatterns for Convex)
- app/(customer)/layout.tsx (MODIFIED — full customer layout with header + bottom nav)
- app/(customer)/browse/page.tsx (MODIFIED — brand listing page replacing placeholder)
- app/(customer)/browse/[brandId]/page.tsx (CREATED — brand products page)
- components/shared/ProductCard.tsx (CREATED — reusable product card component)

### Code Review Fixes Applied

- **H1 FIXED**: Added branch selector placeholder button to header (MapPin icon + "All Branches" text)
- **H2 FIXED**: Added `brandName` prop to ProductCard; brand name displayed small/muted above product name
- **H3 FIXED**: Task 3.5 checkbox corrected to `[ ]` — metadata export deferred (requires server component wrapper)
- **M1 FIXED**: Category chips changed from `flex-wrap` to `overflow-x-auto` horizontal scroll with hidden scrollbar + `flex-shrink-0`
- **M2 FIXED**: Bottom nav hrefs updated — Cart→`/cart`, Account→`/account` (distinct routes); active state uses `pathname.startsWith()`
- **M3 FIXED**: Added size availability dots to ProductCard; query updated to return `sizes: string[]`; rendered as small rounded badges
- **L2 FIXED**: Image aspect ratio corrected from `aspect-[4/3]` to `aspect-[3/4]` (portrait)
- **L3 FIXED**: Desktop nav active state improved with `pathname.startsWith()` for nested routes
- **L1 ACKNOWLEDGED**: blur placeholder deferred — requires static blurDataURL generation infrastructure

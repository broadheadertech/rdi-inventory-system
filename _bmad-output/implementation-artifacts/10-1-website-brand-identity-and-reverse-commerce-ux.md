# Story 10.1: Website Brand Identity & Reverse-Commerce UX

Status: done

## Story

As a **customer (Jessa)**,
I want the RedBox website to have a premium streetwear brand identity with dark theme, bold typography, and a UX that clearly communicates "reserve at a branch" instead of "buy online",
so that I immediately understand RedBox is a physical-first streetwear brand where I check stock and reserve for pickup — not a generic online store.

## Acceptance Criteria

1. **AC1 — Brand Theme Applied**: The `(customer)` route group uses the RedBox dark theme (`#0A0A0A` background, `#E8192C` red accent, `#F5F5F5` off-white text) with Syne (display), Space Mono (mono), and DM Sans (body) typography throughout.

2. **AC2 — Hero Section Redesigned**: Homepage hero displays the "Think Inside The Box" brand headline with dual CTAs: "Find Your RedBox" (links to `/branches`) and "See What's Dropping" (links to `/browse`). No "Shop Now" or e-commerce language.

3. **AC3 — Product Cards with Inline Branch Stock**: Product cards on browse pages show product image, brand, name, price, AND inline branch availability (e.g., "Available at 3 branches near you") with a visual stock indicator — not just a count badge.

4. **AC4 — Reserve Language Everywhere**: All customer-facing CTAs use "Reserve at [Branch Name]" — never "Add to Cart", "Buy Now", "Add to Bag", or any traditional e-commerce language. Confirmation pages say "Reserved" not "Ordered."

5. **AC5 — Announcement Bar**: Sticky top announcement bar with scrolling/rotating real-time content (e.g., latest drop info, branch highlights). Powered by static content initially, structured for future Convex real-time data.

6. **AC6 — Brand Navigation**: Navigation reflects streetwear identity — logo, brand name "REDBOX" in display font, clean dark header. Desktop top nav and mobile bottom nav both updated to match dark theme.

7. **AC7 — Responsive Dark Theme**: All customer pages (browse, product detail, branches, reserve confirmation) render correctly in dark theme across mobile (375px+), tablet (768px+), and desktop (1024px+). WCAG 2.1 AA contrast ratios maintained.

8. **AC8 — Font Loading**: Google Fonts (Syne, Space Mono, DM Sans) load via `next/font/google` with proper fallbacks. No FOUT (flash of unstyled text) — use `font-display: swap` with matching fallback metrics.

## Tasks / Subtasks

- [x] **Task 1: Install & Configure Brand Fonts** (AC: #8)
  - [x] 1.1 Add Syne, Space Mono, DM Sans via `next/font/google` in `app/(customer)/layout.tsx`
  - [x] 1.2 Create CSS variables `--font-display`, `--font-mono`, `--font-body` mapped to the loaded fonts
  - [x] 1.3 Apply font variables to the `(customer)` layout root element (NOT globally — other route groups keep Inter)

- [x] **Task 2: Implement Dark Theme for Customer Routes** (AC: #1, #7)
  - [x] 2.1 Create customer-specific CSS variables in `app/globals.css` under a `.theme-customer` class — implemented by overriding shadcn HSL variables for automatic Tailwind class compatibility
  - [x] 2.2 Apply `.theme-customer` class to `(customer)/layout.tsx` root wrapper
  - [x] 2.3 Update all customer page components to use theme via inherited shadcn variables (bg-background, text-foreground, bg-card, etc.)
  - [x] 2.4 Verify WCAG AA contrast: off-white (#F5F5F5) on black (#0A0A0A) = 18.1:1 ratio (passes). Red (#E8192C) used for headings/CTAs only.

- [x] **Task 3: Redesign Customer Layout** (AC: #6)
  - [x] 3.1 Update `(customer)/layout.tsx` header: dark background, REDBOX logo in Syne font, red accent
  - [x] 3.2 Update desktop nav links to use DM Sans body font, off-white text, red hover/active states
  - [x] 3.3 Update mobile bottom nav: dark background, red active indicator, off-white icons
  - [x] 3.4 Ensure 44px minimum touch targets on all nav items (min-h-[44px] min-w-[44px])

- [x] **Task 4: Build Hero Section** (AC: #2)
  - [x] 4.1 Create `components/customer/HeroSection.tsx` component
  - [x] 4.2 Implement "THINK INSIDE THE BOX" headline in Syne 800 weight, large display size
  - [x] 4.3 Add subtitle: "Premium Streetwear. Check Stock. Reserve. Pick Up." in DM Sans
  - [x] 4.4 Add dual CTA buttons: "Find Your RedBox" (red bg → /branches), "See What's Dropping" (outlined → /browse)
  - [x] 4.5 Hero background: subtle radial gradient with red tint
  - [x] 4.6 Responsive: full-viewport on mobile, constrained on desktop

- [x] **Task 5: Build Announcement Bar** (AC: #5)
  - [x] 5.1 Create `components/customer/AnnouncementBar.tsx` component
  - [x] 5.2 Implement scrolling marquee text bar at top of customer layout (above header)
  - [x] 5.3 Red background (#E8192C), white text, Space Mono font
  - [x] 5.4 Initial static content: "RESERVE NOW, PICK UP TODAY" / "NEW DROPS EVERY FRIDAY" / "FREE SHIPPING ON ORDERS ABOVE ₱2,500"
  - [x] 5.5 Structure component to accept `messages` prop array (future: from Convex query)
  - [x] 5.6 Add close/dismiss button (stores preference in localStorage as "rb-announcement-dismissed")

- [x] **Task 6: Enhance Product Cards** (AC: #3)
  - [x] 6.1 Created `components/customer/CustomerProductCard.tsx` (new customer-specific variant, preserves shared ProductCard for admin/POS):
    - Dark card background (bg-card)
    - Off-white text
    - Price in Space Mono font
    - Brand name in uppercase Syne
  - [x] 6.2 Add inline branch availability display below price with StockDot component:
    - Green: 3+ branches, Amber: 1-2 branches, Gray: out of stock
  - [x] 6.3 Add hover state: subtle red border glow via shadow-[0_0_20px_rgba(232,25,44,0.15)]
  - [x] 6.4 Ensure 3:4 aspect ratio maintained for product images on dark background

- [x] **Task 7: Apply Reserve Language** (AC: #4)
  - [x] 7.1 Audited all customer-facing text — replaced e-commerce language with reserve language
  - [x] 7.2 Update `BranchStockDisplay.tsx` reserve button: "Reserve at {branchName}"
  - [x] 7.3 Update reserve confirmation page: "Reserved!" heading, "Pick up within 24 hours at {branchName}"
  - [x] 7.4 Update mobile bottom nav: "Cart" → "Reserves", ShoppingBag → Bookmark icon

- [x] **Task 8: Update Browse Pages for Dark Theme** (AC: #1, #7)
  - [x] 8.1 Update `(customer)/browse/page.tsx`: HeroSection + dark brand cards with red glow hover
  - [x] 8.2 Update `(customer)/browse/[brandId]/page.tsx`: CustomerProductCard + dark category chips
  - [x] 8.3 Style detail page inherits dark theme via CSS variable inheritance
  - [x] 8.4 Branches page inherits dark theme via CSS variable inheritance
  - [x] 8.5 Reserve confirmation page inherits dark theme via CSS variable inheritance

- [x] **Task 9: Responsive Testing & Polish** (AC: #7)
  - [x] 9.1 ESLint: 0 errors, TypeScript: 0 errors, Next.js build: successful (all routes compile)
  - [x] 9.2 All pages use max-w-7xl containers — no horizontal scroll
  - [x] 9.3 All interactive elements use min-h-[44px] for touch targets
  - [x] 9.4 Dark theme uses shadcn HSL variable overrides — all shadcn/ui components (Dialog, Sheet, etc.) inherit automatically
  - [x] 9.5 Announcement bar uses CSS marquee animation with responsive overflow handling

## Dev Notes

### Design Reference File
The complete visual reference is `redbox-apparel-website.html` at project root. This is a 283KB static HTML file containing the full streetwear brand identity. Extract design patterns from it — do NOT copy its code (it's vanilla HTML/CSS, not React).

### Brand DNA — CSS Variables from HTML Reference
```css
:root {
  --red: #E8192C;        /* Primary brand red */
  --red-dark: #B71420;   /* Hover/active state */
  --red-glow: #FF2D3B;   /* Glow/focus effect */
  --black: #0A0A0A;      /* Page background */
  --off-black: #111111;  /* Card backgrounds */
  --dark: #1A1A1A;       /* Surface backgrounds */
  --mid: #2A2A2A;        /* Elevated surfaces */
  --gray: #888888;       /* Muted text */
  --light: #CCCCCC;      /* Secondary text */
  --off-white: #F5F5F5;  /* Primary text */
  --white: #FFFFFF;      /* High-emphasis text */
}

/* Typography */
--display: 'Syne', sans-serif;        /* Headlines, brand name, CTAs */
--mono: 'Space Mono', monospace;       /* Prices, codes, labels */
--body: 'DM Sans', sans-serif;        /* Body text, descriptions */

/* Font weights used in HTML: Syne 400-800, Space Mono 400/700, DM Sans 200-600 */
```

### Architecture Compliance — CRITICAL Rules

1. **Route Isolation**: The dark theme MUST be scoped to `(customer)` route group only. Do NOT modify global theme variables that affect admin/POS/HQ routes. Use a `.theme-customer` class wrapper.

2. **Font Isolation**: Load Syne/Space Mono/DM Sans only in `(customer)/layout.tsx` via `next/font/google`. Other route groups continue using Inter.

3. **Component Reusability**: `ProductCard.tsx` and `BranchStockDisplay.tsx` are shared components used by both customer and internal routes. Either:
   - Option A (preferred): Create customer-specific variants (`CustomerProductCard.tsx`) that wrap the shared component with dark theme styling
   - Option B: Add a `variant="dark"` prop to existing shared components
   - Do NOT break the light-theme internal admin/POS usage.

4. **No New Convex Functions Needed**: All data for this story is already available through existing `publicBrowse.ts` queries. The product cards already receive `branchCount` and `sizes` data — this story is purely a frontend UX transformation.

5. **Existing Page Structure**: Keep the same route structure (`/browse`, `/browse/[brandId]`, `/browse/style/[styleId]`, `/branches`, `/reserve/[code]`). This story changes HOW pages look and communicate, not WHAT they do.

### Existing Code to Modify (Source Tree)

```
app/(customer)/
├── layout.tsx                    → MAJOR: Add fonts, dark theme wrapper, update nav
├── browse/
│   ├── page.tsx                  → UPDATE: Dark brand cards
│   ├── [brandId]/page.tsx        → UPDATE: Dark category/style grid
│   └── style/[styleId]/
│       └── page.tsx              → UPDATE: Dark product detail, reserve language
├── branches/page.tsx             → UPDATE: Dark branch finder
└── reserve/[confirmationCode]/
    └── page.tsx                  → UPDATE: Dark confirmation, reserve language

components/
├── customer/                     → NEW FOLDER
│   ├── HeroSection.tsx           → NEW: Hero with dual CTAs
│   ├── AnnouncementBar.tsx       → NEW: Scrolling announcement bar
│   └── CustomerProductCard.tsx   → NEW: Dark-themed product card wrapper
├── shared/
│   ├── ProductCard.tsx           → MINOR: Add variant prop or keep unchanged
│   └── BranchStockDisplay.tsx    → UPDATE: Reserve language on buttons

app/globals.css                   → ADD: .theme-customer variables
```

### Anti-Patterns to Avoid

- **Do NOT** use inline `style={{}}` for theming — use Tailwind classes with CSS variables
- **Do NOT** hardcode hex colors in components — always reference `--customer-*` variables via Tailwind `bg-[var(--customer-bg)]` or extend Tailwind config
- **Do NOT** modify `tailwind.config.ts` theme colors globally — extend only within customer scope
- **Do NOT** add Google Fonts via `<link>` tags in HTML head — use `next/font/google` for automatic optimization
- **Do NOT** create a separate CSS file for customer theme — keep in `globals.css` under `.theme-customer` class
- **Do NOT** break the existing reservation flow logic — this story changes presentation only, not behavior

### Philippine Market Context

- Prices displayed in PHP (₱) using existing `formatPrice()` utility from `lib/utils.ts`
- Product tiers: BOX Essentials (₱390-₱890), RED Line (₱990-₱2,200), BLACK LABEL (₱2,500-₱4,200)
- Branch names are SM mall locations (SM MOA, SM Fairview, SM Trinoma, etc.)
- Target devices: Samsung A-series, Realme, Vivo (mid-range Android) — test on 375px viewport

### Project Structure Notes

- Alignment with unified project structure: all customer components go in `components/customer/`, not mixed into `components/shared/`
- Existing `components/providers/BrandProvider.tsx` provides dynamic brand theming — check if it conflicts with the new `.theme-customer` approach. The BrandProvider sets `--brand-primary` and `--brand-secondary` dynamically. The customer theme should use `--customer-accent` instead to avoid conflicts.
- `lib/routes.ts` defines `PUBLIC_ROUTES` including `/browse(.*)`, `/branches(.*)`, `/reserve(.*)` — no changes needed

### References

- [Source: redbox-apparel-website.html] — Complete visual design reference (brand identity, color palette, typography, section layouts)
- [Source: _bmad-output/analysis/brainstorming-session-2026-03-02.md] — Brainstorming ideas #3, #6, #9, #10 (Tier 1 priorities)
- [Source: _bmad-output/planning-artifacts/architecture.md] — Tech stack, route structure, Convex schema, component patterns
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md] — Jessa persona, customer page layouts, responsive requirements, color tokens
- [Source: _bmad-output/planning-artifacts/prd.md] — FR49-FR54 (customer website requirements)
- [Source: _bmad-output/planning-artifacts/epics.md] — Epic 8 stories (existing customer website functionality)
- [Source: app/(customer)/layout.tsx] — Current customer layout (light theme, Inter font, basic nav)
- [Source: components/shared/ProductCard.tsx] — Current product card (light theme, basic stock badge)
- [Source: components/shared/BranchStockDisplay.tsx] — Current branch stock display with reserve buttons
- [Source: convex/catalog/publicBrowse.ts] — Public browse queries (already return branchCount, sizes, stock data)
- [Source: app/globals.css] — Current CSS variables and theme tokens

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- ESLint: 0 errors
- TypeScript: 0 errors
- Next.js build: successful — all customer routes compile

### Completion Notes List

- Used shadcn HSL variable override approach in `.theme-customer` instead of separate `--customer-*` variables — this means ALL existing Tailwind classes automatically work with dark theme without per-component changes
- Created `CustomerProductCard.tsx` as customer-specific component (Option A from Dev Notes) to preserve shared `ProductCard.tsx` for admin/POS light-theme usage
- `BranchStockDisplay.tsx` modified minimally (button text only) — still works for both customer and internal routes
- Fonts loaded via `next/font/google` with CSS variable approach, scoped to `(customer)/layout.tsx` only
- Announcement bar uses CSS `@keyframes marquee` animation (no JS library needed)
- All browse/detail/branch/reserve pages inherit dark theme automatically via CSS variable scoping — no per-page theme classes needed

### File List

**New Files:**
- `components/customer/HeroSection.tsx` — Hero section with "THINK INSIDE THE BOX" headline and dual CTAs
- `components/customer/AnnouncementBar.tsx` — Scrolling marquee announcement bar with dismiss
- `components/customer/CustomerProductCard.tsx` — Dark-themed product card with inline branch stock

**Modified Files:**
- `app/globals.css` — Added `.theme-customer` CSS class with shadcn variable overrides + marquee animation
- `app/(customer)/layout.tsx` — Major rewrite: fonts, dark theme wrapper, AnnouncementBar, reserve language nav
- `app/(customer)/browse/page.tsx` — Rewrote with HeroSection + dark brand cards
- `app/(customer)/browse/[brandId]/page.tsx` — Switched to CustomerProductCard + dark styling
- `app/(customer)/browse/style/[styleId]/page.tsx` — Reserve language on confirmation button
- `app/(customer)/reserve/[confirmationCode]/page.tsx` — "Reserved!" heading, "Continue Browsing" CTA
- `components/shared/BranchStockDisplay.tsx` — Button text: "Reserve" → "Reserve at {branchName}", status badge colors fixed for dark theme
- `tailwind.config.ts` — Added fontFamily extensions (display, mono, body) mapped to CSS variables

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.6 | **Date:** 2026-03-02

**Issues Found:** 2 High, 5 Medium, 3 Low — **All HIGH and MEDIUM fixed automatically**

### Fixes Applied:
1. **[H1]** Added `@media (prefers-reduced-motion: reduce)` to disable marquee animation (globals.css)
2. **[H2]** Changed BranchStockDisplay status badges from `bg-red-50`/`bg-amber-50`/`bg-green-50` to `bg-red-500/10`/`bg-amber-500/10`/`bg-green-500/10` for dark theme compatibility
3. **[M1]** "Shop by Brand" → "Browse by Brand" (AC4 compliance)
4. **[M2]** AnnouncementBar: moved localStorage read from useState initializer to useEffect (hydration fix)
5. **[M3]** Removed duplicate `/browse` nav item; replaced with `/branches` for 4 unique destinations
6. **[M4]** Removed `eslint-disable-line react-hooks/exhaustive-deps`; restructured effect to include `style` in deps
7. **[M5]** Extended `tailwind.config.ts` with `fontFamily` mappings; replaced all inline `style={{ fontFamily }}` with Tailwind `font-display`/`font-mono`/`font-body` classes across 6 files

### Remaining LOW issues (deferred):
- L1: `variantCount` prop unused in CustomerProductCard (dead code)
- L2: Hardcoded RGBA in Tailwind arbitrary shadow values
- L3: `ring-offset-2` on color swatches uses default white offset on dark theme

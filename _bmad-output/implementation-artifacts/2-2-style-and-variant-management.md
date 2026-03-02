# Story 2.2: Style & Variant Management

Status: done

## Story

As an **HQ Staff member**,
I want to create product styles and their variants (size, color, gender),
So that every physical product in our stores has a digital representation with a unique SKU.

## Acceptance Criteria

1. **Given** an existing brand and category
   **When** the user creates a new style/model
   **Then** they can set the style name, description, and base price
   **And** the style is linked to its parent category (Brand -> Category -> Style hierarchy)

2. **Given** an existing style
   **When** the user adds variants to a style
   **Then** they can specify size, color, and gender for each variant
   **And** a unique SKU is auto-generated or manually assigned per variant
   **And** a unique barcode is assigned to each variant
   **And** pricing can be overridden at the variant level (default inherits from style's base price)
   **And** variant prices are stored in centavos (integer)

3. **Given** the admin catalog UI
   **When** the user navigates the hierarchy
   **Then** the full 4-level hierarchy (Brand -> Category -> Style -> Variant) is navigable
   **And** styles are listed under their parent category
   **And** variants are listed under their parent style

4. **Given** any style or variant mutation
   **Then** an immutable audit log entry is created via `_logAuditEntry()`
   **And** the entry records action type, user ID, entity type, entity ID, before/after values

5. **Given** styles and variants
   **Then** they support deactivate/reactivate (soft delete pattern)
   **And** deactivated items are visually distinguished with status badges

## Tasks / Subtasks

- [x] Task 1: Create style Convex functions (AC: #1, #3, #4, #5)
  - [x] 1.1 Create `convex/catalog/styles.ts` with `listStyles` query — accepts required `categoryId`, uses `by_category` index. Uses `requireRole(ctx, HQ_ROLES)`.
  - [x] 1.2 Add `getStyleById` query — returns single style by ID, uses `requireRole(ctx, HQ_ROLES)`
  - [x] 1.3 Add `createStyle` mutation — inserts with `{ categoryId, name, description?, basePriceCentavos, isActive: true, createdAt, updatedAt }`. Validate category exists and is active. Check duplicate name within same category (case-insensitive). Uses `requireRole(ctx, HQ_ROLES)`. Calls `_logAuditEntry` with `action: "style.create"`.
  - [x] 1.4 Add `updateStyle` mutation — patches style name, description, basePriceCentavos. Only log actually-changed fields in audit diff. Throw `NOT_FOUND` if style doesn't exist. Check duplicate name if renaming.
  - [x] 1.5 Add `deactivateStyle` mutation — sets `isActive: false`. Audit log. Throw if already inactive.
  - [x] 1.6 Add `reactivateStyle` mutation — sets `isActive: true`. Audit log.

- [x] Task 2: Create variant Convex functions (AC: #2, #4, #5)
  - [x] 2.1 Create `convex/catalog/variants.ts` with `listVariants` query — accepts required `styleId`, uses `by_style` index. Uses `requireRole(ctx, HQ_ROLES)`.
  - [x] 2.2 Add `getVariantById` query — returns single variant by ID
  - [x] 2.3 Add `getVariantBySku` query — looks up variant by SKU using `by_sku` index
  - [x] 2.4 Add `createVariant` mutation — inserts with `{ styleId, sku, barcode?, size, color, gender?, priceCentavos, isActive: true, createdAt, updatedAt }`. Validate style exists and is active. Validate SKU uniqueness globally (using `by_sku` index). Validate barcode uniqueness if provided (using `by_barcode` index). Calls `_logAuditEntry` with `action: "variant.create"`.
  - [x] 2.5 Add `updateVariant` mutation — patches variant fields (size, color, gender, priceCentavos, barcode). Only log changed fields. Validate SKU/barcode uniqueness if changed. Throw `NOT_FOUND` if variant doesn't exist.
  - [x] 2.6 Add `deactivateVariant` mutation — sets `isActive: false`. Audit log. Throw if already inactive.
  - [x] 2.7 Add `reactivateVariant` mutation — sets `isActive: true`. Audit log.

- [x] Task 3: Create style management UI page (AC: #1, #3, #5)
  - [x] 3.1 Create `app/admin/catalog/brands/[brandId]/categories/[categoryId]/page.tsx` — style list for a specific category. Uses `getCategoryById` + `getBrandById` + `listStyles` queries.
  - [x] 3.2 Breadcrumb: Catalog > Brand Name > Category Name
  - [x] 3.3 Style list: Table with name, description (truncated), base price (formatted with `formatCurrency`), status badge, action buttons
  - [x] 3.4 Create Style dialog: name (required), description (optional), base price in pesos (required, convert to centavos on submit)
  - [x] 3.5 Edit Style dialog: pre-populated fields
  - [x] 3.6 Deactivate/Reactivate with same patterns as brands/categories
  - [x] 3.7 Style name is clickable — navigates to variant management page

- [x] Task 4: Create variant management UI page (AC: #2, #3, #5)
  - [x] 4.1 Create `app/admin/catalog/brands/[brandId]/categories/[categoryId]/styles/[styleId]/page.tsx` — variant list for a specific style. Uses `getStyleById` + `getCategoryById` + `getBrandById` + `listVariants` queries.
  - [x] 4.2 Breadcrumb: Catalog > Brand > Category > Style Name
  - [x] 4.3 Variant list: Table with SKU, barcode, size, color, gender, price (formatted), status badge, action buttons
  - [x] 4.4 Create Variant dialog: SKU (required), barcode (optional), size (required), color (required), gender (optional select: mens/womens/unisex/kids), price in pesos (required, default to style's base price, convert to centavos on submit)
  - [x] 4.5 Edit Variant dialog: pre-populated fields (SKU is read-only after creation)
  - [x] 4.6 Deactivate/Reactivate with same patterns
  - [x] 4.7 "New Variant" button disabled when style is inactive

- [x] Task 5: Update category page to link to styles (AC: #3)
  - [x] 5.1 Update `app/admin/catalog/brands/[brandId]/page.tsx` — make category names clickable, navigating to `/admin/catalog/brands/[brandId]/categories/[categoryId]`

- [x] Task 6: Verify integration (AC: all)
  - [x] 6.1 Run `npx tsc --noEmit` — zero TypeScript errors
  - [x] 6.2 Run `npx next lint` — zero lint warnings/errors

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**Authorization — HQ_ROLES:**
- FR10-14 specify "Admin/HQ Staff can manage styles/variants"
- Use `requireRole(ctx, HQ_ROLES)` — allows both `admin` and `hqStaff`
- Import from `convex/_helpers/permissions.ts`: `import { requireRole, HQ_ROLES } from "../_helpers/permissions";`

**No Branch Scoping Needed:**
- Styles and variants are GLOBAL catalog entities — not branch-scoped
- Do NOT use `withBranchScope(ctx)` for catalog queries/mutations
- Inventory (branch-level stock) is a separate concern in Epic 5

**Pricing in Centavos (Integer):**
- All prices stored as integers in centavos: `14999` = ₱149.99
- `basePriceCentavos` on styles table, `priceCentavos` on variants table
- UI must convert peso input to centavos: `Math.round(parseFloat(pesoInput) * 100)`
- Display using `formatCurrency()` from `lib/formatters.ts`: `formatCurrency(14999)` → `"₱149.99"`
- NEVER use floating-point for price storage
- [Source: architecture.md — Pricing Patterns, lines 380-383]

**SKU Uniqueness:**
- SKU must be globally unique across all variants (enforced via `by_sku` index lookup)
- SKU should NOT be editable after creation (to prevent referential integrity issues)
- Schema: `sku: v.string()` — required field on variants

**Barcode Uniqueness:**
- Barcode is optional (`barcode: v.optional(v.string())`)
- If provided, must be globally unique (enforced via `by_barcode` index lookup)
- Barcode can be updated after creation

**Gender Field:**
- Optional field: `gender: v.optional(v.union(v.literal("mens"), v.literal("womens"), v.literal("unisex"), v.literal("kids")))`
- Display as human-readable labels in UI: "Men's", "Women's", "Unisex", "Kids"

**Variant Price Inheritance:**
- When creating a variant, default `priceCentavos` to the parent style's `basePriceCentavos`
- User can override the price per variant
- The UI should pre-fill the price field with the style's base price

**Catalog Module Structure (Architecture Mandated):**
```
convex/catalog/
├── brands.ts          # FR8: brand CRUD (Story 2.1 ✓)
├── categories.ts      # FR9: category CRUD (Story 2.1 ✓)
├── styles.ts          # FR10: style/model CRUD (THIS STORY)
├── variants.ts        # FR11-14: variant CRUD, SKU, pricing (THIS STORY)
```
- [Source: architecture.md — Module Structure, lines 519-524]

**Admin Route Structure:**
```
app/admin/catalog/
├── page.tsx                                              # Brand list (Story 2.1 ✓)
└── brands/
    └── [brandId]/
        ├── page.tsx                                      # Category list (Story 2.1 ✓, MODIFY to add links)
        └── categories/
            └── [categoryId]/
                ├── page.tsx                              # Style list (THIS STORY)
                └── styles/
                    └── [styleId]/
                        └── page.tsx                      # Variant list (THIS STORY)
```

**Audit Logging — MUST call `_logAuditEntry()` for every mutation:**
- Import: `import { _logAuditEntry } from "../_helpers/auditLog";`
- Use improved diff pattern from Story 2.1 code review: only log actually-changed fields, early-return if nothing changed
```typescript
const before: Record<string, unknown> = {};
const after: Record<string, unknown> = {};
const patch: Record<string, unknown> = {};

if (args.name !== undefined && args.name !== existing.name) {
  before.name = existing.name;
  after.name = args.name;
  patch.name = args.name;
}

if (Object.keys(patch).length === 0) {
  return; // Nothing changed
}
```

**Duplicate Name Check Pattern (from Story 2.1 code review):**
```typescript
// For create: check within parent scope
const siblings = await ctx.db
  .query("styles")
  .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId))
  .collect();
const duplicate = siblings.find(
  (s) => s.name.toLowerCase() === args.name.toLowerCase()
);
if (duplicate) {
  throw new ConvexError({
    code: "DUPLICATE_NAME",
    message: `A style named "${duplicate.name}" already exists in this category`,
  });
}
```

**Error Handling:**
- Import `getErrorMessage` from `@/lib/utils` (shared utility created in Story 2.1)
- Use `ConvexError({ code: "...", message: "..." })` from `convex/values`
- Error codes: `NOT_FOUND`, `DUPLICATE_NAME`, `DUPLICATE_SKU`, `DUPLICATE_BARCODE`, `CATEGORY_INACTIVE`, `STYLE_INACTIVE`

**UI Patterns — Follow catalog page pattern exactly:**
- `"use client"` directive at top
- Import `getErrorMessage` from `@/lib/utils` (NOT duplicated locally)
- Import `formatCurrency` from `@/lib/formatters` for price display
- shadcn components: Table, Dialog, Button, Input, Badge, Select, Label
- `toast` from `sonner` for success/error feedback
- Search + status filter bar
- Create/Edit dialog with form state, validation, submit
- `isSubmitting` state to disable buttons during mutation
- Loading state: `=== undefined` for Convex query loading
- Empty state with contextual message
- lucide-react icons
- Trim all string inputs before submitting

**Price Input UX:**
- Show price input as pesos (e.g., "149.99") — user thinks in pesos
- Convert to centavos on submit: `Math.round(parseFloat(value) * 100)`
- Display stored centavos using `formatCurrency()`: centavos → "₱149.99"
- Validate: must be a positive number, max 2 decimal places

### Scope Boundaries — DO NOT IMPLEMENT

- **Product images** → Story 2.3 (storageId field exists in schema but don't add image upload)
- **Bulk import** → Story 2.4
- **Inventory/stock levels** → Epic 5
- **POS product search** → Epic 3
- **Customer-facing product pages** → Epic 8
- **SKU auto-generation algorithm** → Not in requirements, manual SKU entry is sufficient
- **Barcode generation/printing** → Not in scope
- **Variant reordering** → Not in scope

### Existing Code to Build Upon (Stories 1.1-2.1)

**Already exists — DO NOT recreate:**
- `convex/schema.ts` — `styles` and `variants` tables with indexes (`by_category`, `by_style`, `by_sku`, `by_barcode`)
- `convex/_helpers/permissions.ts` — `requireAuth()`, `requireRole()`, `HQ_ROLES`
- `convex/_helpers/auditLog.ts` — `_logAuditEntry()` helper
- `convex/catalog/brands.ts` — Brand CRUD (reference pattern)
- `convex/catalog/categories.ts` — Category CRUD (reference pattern, includes parent validation)
- `app/admin/catalog/page.tsx` — Brand list (reference UI pattern)
- `app/admin/catalog/brands/[brandId]/page.tsx` — Category list (WILL BE MODIFIED for clickable links)
- `lib/types.ts` — `Style`, `Variant` type aliases already defined
- `lib/utils.ts` — `getErrorMessage()` shared utility
- `lib/formatters.ts` — `formatCurrency()` for centavos→₱ display
- `lib/constants.ts` — Role constants, error codes
- `components/ui/` — shadcn components

**Schema reference (already in schema.ts):**
```typescript
styles: defineTable({
  categoryId: v.id("categories"),
  name: v.string(),
  description: v.optional(v.string()),
  basePriceCentavos: v.number(),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_category", ["categoryId"]),

variants: defineTable({
  styleId: v.id("styles"),
  sku: v.string(),
  barcode: v.optional(v.string()),
  size: v.string(),
  color: v.string(),
  gender: v.optional(
    v.union(
      v.literal("mens"),
      v.literal("womens"),
      v.literal("unisex"),
      v.literal("kids")
    )
  ),
  priceCentavos: v.number(),
  storageId: v.optional(v.id("_storage")),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_style", ["styleId"])
  .index("by_sku", ["sku"])
  .index("by_barcode", ["barcode"]),
```

### Previous Story Learnings (from Story 2.1)

- **Improved audit diff pattern:** Don't use generic `Object.entries(updates)` loop. Instead, compare each field explicitly and only log fields that actually changed. Early-return if nothing changed.
- **Duplicate name check:** Use case-insensitive comparison within parent scope. For updates, exclude current entity from duplicate check: `s._id !== args.styleId`.
- **Logo clearing pattern:** Empty string means "clear optional field", `undefined` means "no change". Apply same pattern for `description` and `barcode` optional fields.
- **Shared getErrorMessage:** Already extracted to `lib/utils.ts` — import from there, do NOT create local copies.
- **Parent active validation:** When creating a child entity, validate parent exists AND is active. Disable "New" button in UI when parent is inactive.
- **TypeScript strictness:** Always run `tsc --noEmit` before marking complete. The `currentUser` null check pattern is already fixed in admin layout.

### Project Structure Notes

```
Files to CREATE in this story:
├── convex/catalog/
│   ├── styles.ts                  # Style CRUD queries + mutations
│   └── variants.ts               # Variant CRUD queries + mutations
├── app/admin/catalog/brands/[brandId]/categories/
│   └── [categoryId]/
│       ├── page.tsx               # Style list for category
│       └── styles/
│           └── [styleId]/
│               └── page.tsx       # Variant list for style

Files to MODIFY in this story:
├── app/admin/catalog/brands/[brandId]/page.tsx  # Make category names clickable links

Files to reference (NOT modify):
├── convex/schema.ts               # styles, variants table definitions
├── convex/catalog/brands.ts       # Reference CRUD pattern
├── convex/catalog/categories.ts   # Reference CRUD pattern with parent validation
├── convex/_helpers/permissions.ts  # requireRole, HQ_ROLES
├── convex/_helpers/auditLog.ts    # _logAuditEntry helper
├── app/admin/catalog/page.tsx     # Reference UI pattern (brand list)
├── lib/types.ts                   # Style, Variant type aliases
├── lib/utils.ts                   # getErrorMessage utility
├── lib/formatters.ts              # formatCurrency for price display
├── lib/constants.ts               # ERROR_CODES
├── components/ui/                 # shadcn components
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 2.2]
- [Source: _bmad-output/planning-artifacts/architecture.md — Product Hierarchy, lines 159-172]
- [Source: _bmad-output/planning-artifacts/architecture.md — Module Structure (catalog), lines 519-524]
- [Source: _bmad-output/planning-artifacts/architecture.md — Admin Route Group, lines 600-612]
- [Source: _bmad-output/planning-artifacts/architecture.md — Pricing Patterns, lines 380-383]
- [Source: _bmad-output/planning-artifacts/architecture.md — Convex Function Naming, lines 392-396]
- [Source: _bmad-output/planning-artifacts/architecture.md — Naming Patterns, lines 329-347]
- [Source: _bmad-output/planning-artifacts/architecture.md — Error Handling, lines 228-232]
- [Source: convex/schema.ts — styles lines 55-63, variants lines 65-87]
- [Source: convex/_helpers/permissions.ts — HQ_ROLES line 23]
- [Source: convex/_helpers/auditLog.ts — _logAuditEntry signature]
- [Source: convex/catalog/categories.ts — parent validation pattern]
- [Source: lib/formatters.ts — formatCurrency for centavos display]
- [Source: lib/utils.ts — shared getErrorMessage utility]
- [Source: lib/types.ts — Style, Variant type aliases]
- [Source: _bmad-output/implementation-artifacts/2-1-brand-and-category-management.md — previous story learnings and code review fixes]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None

### Completion Notes List

- All 6 tasks completed successfully
- Style CRUD: 2 queries + 4 mutations in `convex/catalog/styles.ts`
- Variant CRUD: 3 queries + 4 mutations in `convex/catalog/variants.ts`
- Style management UI with breadcrumb navigation, search/filter, create/edit dialogs, deactivate/reactivate
- Variant management UI with full CRUD, SKU read-only after creation, price defaults from style base price
- Category page updated with clickable links to style management
- All patterns follow Story 2.1 code review improvements (explicit audit diff, duplicate name checks, shared getErrorMessage)
- `npx tsc --noEmit` — clean (zero errors)
- `npx next lint` — clean (zero warnings/errors)

### File List

**Created:**
- `convex/catalog/styles.ts` — Style queries and mutations
- `convex/catalog/variants.ts` — Variant queries and mutations
- `app/admin/catalog/brands/[brandId]/categories/[categoryId]/page.tsx` — Style management UI
- `app/admin/catalog/brands/[brandId]/categories/[categoryId]/styles/[styleId]/page.tsx` — Variant management UI

**Modified:**
- `app/admin/catalog/brands/[brandId]/page.tsx` — Added clickable category links with ChevronRight icon

### Change Log

| Change | File | Reason |
|--------|------|--------|
| Created style CRUD | `convex/catalog/styles.ts` | AC #1, #3, #4, #5 |
| Created variant CRUD | `convex/catalog/variants.ts` | AC #2, #4, #5 |
| Created style list page | `app/.../[categoryId]/page.tsx` | AC #1, #3, #5 |
| Created variant list page | `app/.../[styleId]/page.tsx` | AC #2, #3, #5 |
| Added clickable category links | `app/.../[brandId]/page.tsx` | AC #3 — full hierarchy navigation |

## Senior Developer Review

**Reviewer:** Code Review Workflow (Claude Opus 4.6)
**Date:** 2026-02-27

### Findings

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| H1 | HIGH | Gender cannot be cleared once set — no mechanism in UI or backend to unset | Added `clearGender: v.optional(v.boolean())` to `updateVariant`, UI sends `clearGender: true` when "Not specified" selected |
| H2 | HIGH | Reactivate mutations create false audit entries — hardcode `before: { isActive: false }` without checking | Added `isActive` guard with `ALREADY_ACTIVE` error in both `reactivateStyle` and `reactivateVariant` |
| H3 | HIGH | No server-side price validation — zero, negative, non-integer centavos accepted | Added `Number.isInteger()` and `> 0` checks in `createStyle`, `updateStyle`, `createVariant`, `updateVariant` |
| M1 | MEDIUM | Empty strings accepted for required fields server-side (name, SKU, size, color) | Added `.trim() === ""` validation in create and update mutations |
| M2 | MEDIUM | Breadcrumb hierarchy not validated — URL params not cross-checked against DB relationships | Added parent ID validation in styles and variants page not-found checks |
| M3 | MEDIUM | Variant search doesn't include barcode | Added barcode to search filter and updated placeholder text |

**All 3 HIGH and 3 MEDIUM issues auto-fixed. tsc + lint clean after fixes.**

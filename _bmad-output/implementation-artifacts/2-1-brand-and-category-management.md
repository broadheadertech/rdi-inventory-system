# Story 2.1: Brand & Category Management

Status: done

## Story

As an **HQ Staff member**,
I want to create and manage brands and product categories,
So that our product catalog is organized by the brands we carry and the types of products we sell.

## Acceptance Criteria

1. **Given** an authenticated HQ Staff or Admin user at `/admin/catalog/`
   **When** they manage brands
   **Then** they can create a new brand with name and optional logo field
   **And** they can edit brand details (name)
   **And** they can deactivate a brand (soft delete — existing products remain, no new products can be added)
   **And** they can reactivate a previously deactivated brand
   **And** brands are displayed in a searchable list with status indicators

2. **Given** an authenticated HQ Staff or Admin user at `/admin/catalog/`
   **When** they manage categories
   **Then** they can create categories linked to a brand (e.g., Shoes, Apparel, Accessories)
   **And** they can edit category name
   **And** they can deactivate and reactivate categories
   **And** the Brand -> Category hierarchy is navigable in the UI (select brand to see its categories)

3. **Given** any brand or category mutation
   **Then** an immutable audit log entry is created via `_logAuditEntry()`
   **And** the entry records action type, user ID, entity type, entity ID, before/after values

4. **Given** the admin layout
   **When** an HQ Staff user navigates to `/admin/`
   **Then** the layout allows both `admin` and `hqStaff` roles (not just admin)
   **And** nav items show role-appropriate links (Users/Branches for admin only, Catalog for both)

## Tasks / Subtasks

- [x] Task 1: Create brand Convex functions (AC: #1, #3)
  - [x] 1.1 Create `convex/catalog/brands.ts` with `listBrands` query — returns all brands, uses `requireRole(ctx, HQ_ROLES)`. No branch-scoping needed (brands are global).
  - [x] 1.2 Add `getBrandById` query — returns single brand by ID, uses `requireRole(ctx, HQ_ROLES)`
  - [x] 1.3 Add `createBrand` mutation — inserts into `brands` table with `{ name, logo?: string, isActive: true, createdAt: Date.now(), updatedAt: Date.now() }`. Uses `requireRole(ctx, HQ_ROLES)`. Calls `_logAuditEntry(ctx, { action: "brand.create", userId, entityType: "brands", entityId: newBrandId, after: { name, isActive: true } })`
  - [x] 1.4 Add `updateBrand` mutation — patches brand name/logo. Capture old values for before/after diff. Calls `_logAuditEntry` with `action: "brand.update"`. Uses `requireRole(ctx, HQ_ROLES)`. Throw `ConvexError({ code: "NOT_FOUND" })` if brand doesn't exist.
  - [x] 1.5 Add `deactivateBrand` mutation — sets `isActive: false`. Calls `_logAuditEntry` with `action: "brand.deactivate"`. Throw if already inactive.
  - [x] 1.6 Add `reactivateBrand` mutation — sets `isActive: true`. Calls `_logAuditEntry` with `action: "brand.reactivate"`.

- [x] Task 2: Create category Convex functions (AC: #2, #3)
  - [x] 2.1 Create `convex/catalog/categories.ts` with `listCategories` query — accepts optional `brandId` filter. If `brandId` provided, use `by_brand` index. Otherwise return all. Uses `requireRole(ctx, HQ_ROLES)`.
  - [x] 2.2 Add `getCategoryById` query — returns single category by ID, uses `requireRole(ctx, HQ_ROLES)`
  - [x] 2.3 Add `createCategory` mutation — inserts with `{ brandId, name, isActive: true, createdAt, updatedAt }`. Validate brand exists and is active before creating. Uses `requireRole(ctx, HQ_ROLES)`. Calls `_logAuditEntry` with `action: "category.create"`.
  - [x] 2.4 Add `updateCategory` mutation — patches category name. Capture old values. Calls `_logAuditEntry` with `action: "category.update"`. Throw `NOT_FOUND` if category doesn't exist.
  - [x] 2.5 Add `deactivateCategory` mutation — sets `isActive: false`. Calls `_logAuditEntry` with `action: "category.deactivate"`. Throw if already inactive.
  - [x] 2.6 Add `reactivateCategory` mutation — sets `isActive: true`. Calls `_logAuditEntry` with `action: "category.reactivate"`.

- [x] Task 3: Update admin layout for HQ Staff access (AC: #4)
  - [x] 3.1 In `app/admin/layout.tsx`: change role check from `role !== "admin"` to `!["admin", "hqStaff"].includes(role)` so both admin and hqStaff can access the admin panel.
  - [x] 3.2 Update `navItems` to be role-aware: Users and Branches nav items visible only to admin, Catalog nav item visible to both admin and hqStaff. Use `currentUser.role` to filter visible nav items.
  - [x] 3.3 Add Catalog nav item: `{ href: "/admin/catalog", label: "Catalog", icon: Package }` (import `Package` from lucide-react)

- [x] Task 4: Create brand management UI (AC: #1)
  - [x] 4.1 Create `app/admin/catalog/page.tsx` — the catalog landing page that shows brand list (same pattern as branches page: Table + search + status filter + create/edit dialogs + deactivate/reactivate actions). Use shadcn Table, Dialog, Button, Input, Badge, Select components.
  - [x] 4.2 Search filter: filter by brand name (client-side on query results)
  - [x] 4.3 Status filter: All / Active / Inactive
  - [x] 4.4 Create Brand dialog: name (required), logo URL (optional)
  - [x] 4.5 Edit Brand dialog: pre-populated with current values
  - [x] 4.6 Deactivate: `window.confirm()` confirmation, then call mutation
  - [x] 4.7 Reactivate: direct call, toast on success
  - [x] 4.8 Each brand row shows: name, logo indicator, category count (if available), status badge, action buttons
  - [x] 4.9 Brand name is clickable — navigates to `/admin/catalog/brands/[brandId]` to show categories for that brand

- [x] Task 5: Create category management UI (AC: #2)
  - [x] 5.1 Create `app/admin/catalog/brands/[brandId]/page.tsx` — shows the brand detail header + category list for that brand. Uses `getBrandById` query + `listCategories` with `brandId` filter.
  - [x] 5.2 Breadcrumb: Catalog > Brand Name > Categories
  - [x] 5.3 Category list: Table with name, status badge, action buttons (edit, deactivate/reactivate)
  - [x] 5.4 Create Category dialog: name (required) — brandId is implicit from URL param
  - [x] 5.5 Edit Category dialog: pre-populated name
  - [x] 5.6 Deactivate/Reactivate with same patterns as brands
  - [x] 5.7 Back link to catalog main page

- [x] Task 6: Verify integration (AC: all)
  - [x] 6.1 Run `npx tsc --noEmit` — zero TypeScript errors
  - [x] 6.2 Run `npx next lint` — zero lint warnings/errors

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**Authorization — HQ_ROLES, not ADMIN_ROLES:**
- FR8-9 specify "Admin/HQ Staff can manage brands/categories"
- Use `requireRole(ctx, HQ_ROLES)` — allows both `admin` and `hqStaff`
- Import from `convex/_helpers/permissions.ts`: `import { requireRole, HQ_ROLES } from "../_helpers/permissions";`
- [Source: architecture.md — Role groups]
- [Source: convex/_helpers/permissions.ts — line 23: `HQ_ROLES = ["admin", "hqStaff"]`]

**No Branch Scoping Needed:**
- Brands and categories are GLOBAL entities — not branch-scoped
- Do NOT use `withBranchScope(ctx)` for catalog queries/mutations
- Use `requireRole(ctx, HQ_ROLES)` instead (role check only, no branch filter)
- This is different from audit logs (which are branch-scoped) or inventory (branch-scoped)
- [Source: schema.ts — brands/categories tables have no branchId field]

**Catalog Module Structure (Architecture Mandated):**
```
convex/catalog/
├── brands.ts          # FR8: brand CRUD
├── categories.ts      # FR9: category CRUD
```
- [Source: architecture.md — Module Structure, lines 519-524]

**Admin Route Structure (Architecture Mandated):**
```
app/admin/catalog/
├── page.tsx                          # Brand list (catalog landing)
└── brands/
    └── [brandId]/
        └── page.tsx                  # Category list for brand
```
- [Source: architecture.md — Admin Route Group, lines 600-612]

**Audit Logging — MUST call `_logAuditEntry()` for every mutation:**
- Import: `import { _logAuditEntry } from "../_helpers/auditLog";`
- Pattern (from Story 1.6):
```typescript
const user = await requireRole(ctx, HQ_ROLES);
// ... business logic
await _logAuditEntry(ctx, {
  action: "brand.create",
  userId: user._id,
  entityType: "brands",
  entityId: brandId,
  after: { name: args.name, isActive: true },
});
```
- [Source: convex/_helpers/auditLog.ts — _logAuditEntry signature]

**Convex Function Naming Conventions:**
- Queries: `get` or `list` prefix — `listBrands`, `getBrandById`, `listCategories`
- Mutations: verb prefix — `createBrand`, `updateBrand`, `deactivateBrand`, `reactivateBrand`
- [Source: architecture.md — Convex Function Naming, lines 392-396]

**Error Handling Pattern (from Story 1.6):**
```typescript
import { v, ConvexError } from "convex/values";

// In mutation handler:
const existing = await ctx.db.get(args.brandId);
if (!existing) {
  throw new ConvexError({ code: "NOT_FOUND", message: "Brand not found" });
}
```

**UI Patterns — Follow branches page exactly:**
- `"use client"` directive at top
- shadcn components: Table, Dialog, Button, Input, Badge, Select, Label, Separator
- `toast` from `sonner` for success/error feedback
- `getErrorMessage()` helper for ConvexError extraction
- Search + status filter bar pattern
- Create/Edit dialog pattern with form state, validation, and submit handling
- `isSubmitting` state to disable buttons during mutation
- Loading state: check `=== undefined` for Convex query loading
- Empty state with contextual message
- lucide-react icons
- [Source: app/admin/branches/page.tsx — full reference implementation]

**Data Formats:**
- `isActive: v.boolean()` — soft delete pattern (not hard delete)
- `createdAt: v.number()` and `updatedAt: v.number()` — Unix timestamp ms via `Date.now()`
- `logo: v.optional(v.string())` — URL string, optional field
- `brandId: v.id("brands")` — Convex ID reference linking categories to brands
- [Source: convex/schema.ts — brands table lines 39-45, categories table lines 47-53]

### Scope Boundaries — DO NOT IMPLEMENT

- **Style/model management** → Story 2.2
- **Variant management (size, color, gender, SKU, barcode)** → Story 2.2
- **Product images** → Story 2.3
- **Bulk import** → Story 2.4
- **Logo image upload via Convex file storage** → Story 2.3 (for now, logo is just an optional text field / URL string)
- **Category reordering or nesting** → Not in scope
- **Brand logo display/preview** → Not in scope for this story
- **Public-facing catalog views** → Epic 8 (customer website)

### Existing Code to Build Upon (Stories 1.1-1.6)

**Already exists — DO NOT recreate:**
- `convex/schema.ts` — `brands` and `categories` tables with indexes (by_brand on categories)
- `convex/_helpers/permissions.ts` — `requireAuth()`, `requireRole()`, `HQ_ROLES`, `ADMIN_ROLES`
- `convex/_helpers/auditLog.ts` — `_logAuditEntry()` helper (Story 1.6)
- `convex/_helpers/withBranchScope.ts` — NOT needed for this story (brands/categories are global)
- `app/admin/layout.tsx` — Admin sidebar layout (will be MODIFIED)
- `app/admin/branches/page.tsx` — Reference implementation for CRUD UI pattern
- `lib/types.ts` — `Brand`, `Category` type aliases already defined
- `lib/constants.ts` — Role constants, error codes
- `lib/formatters.ts` — `formatDate()`, `formatDateTime()`
- `components/ui/` — shadcn components (Table, Dialog, Button, Input, Badge, Select, Label, Separator)

**Schema reference (already in schema.ts):**
```typescript
brands: defineTable({
  name: v.string(),
  logo: v.optional(v.string()),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
}),

categories: defineTable({
  brandId: v.id("brands"),
  name: v.string(),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_brand", ["brandId"]),
```

### Previous Story Learnings (from Story 1.6)

- **Audit logging pattern established:** `_logAuditEntry(ctx, { action, userId, entityType, entityId, before, after })` — follow this exact signature
- **ConvexError pattern:** `ConvexError({ code: "NOT_FOUND", message: "..." })` from `convex/values` — use for all NOT_FOUND guards
- **before/after diff pattern:** Capture old values before patch, build diff objects with only changed fields:
  ```typescript
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      before[key] = existing[key as keyof typeof existing];
      after[key] = value;
    }
  }
  ```
- **`v.optional()` for optional args:** Use `v.optional(v.string())` for logo, not `v.union(v.string(), v.null())`
- **Streaming queries with .take():** For paginated queries (not needed here since brand/category lists are small — `.collect()` is fine for < 200 items)
- **TypeScript strict verification:** Always run `tsc --noEmit` and `next lint` before marking complete
- **Import `ConvexError` from `convex/values`:** Not from `convex/server`

### Admin Layout Update Details

The admin layout at `app/admin/layout.tsx` currently restricts to `admin` role only. This story must update it:

1. **Role check:** Change `currentUser?.role !== "admin"` to `!["admin", "hqStaff"].includes(currentUser?.role ?? "")` — allows hqStaff to access admin panel
2. **Role-based nav items:** Make nav items conditional:
   - Users, Branches: `role === "admin"` only (these use ADMIN_ROLES in Convex)
   - Catalog: `role === "admin" || role === "hqStaff"` (uses HQ_ROLES in Convex)
3. **Redirect:** Update redirect logic to also handle hqStaff

Pattern:
```typescript
const navItems = [
  { href: "/admin/users", label: "Users", icon: Users, roles: ["admin"] },
  { href: "/admin/branches", label: "Branches", icon: Building2, roles: ["admin"] },
  { href: "/admin/catalog", label: "Catalog", icon: Package, roles: ["admin", "hqStaff"] },
];
// Filter: navItems.filter(item => item.roles.includes(currentUser.role))
```

### Project Structure Notes

```
Files to CREATE in this story:
├── convex/catalog/
│   ├── brands.ts                     # Brand CRUD queries + mutations
│   └── categories.ts                # Category CRUD queries + mutations
├── app/admin/catalog/
│   ├── page.tsx                      # Brand list / catalog landing page
│   └── brands/
│       └── [brandId]/
│           └── page.tsx              # Category list for selected brand

Files to MODIFY in this story:
├── app/admin/layout.tsx              # Add hqStaff access + Catalog nav item

Files to reference (NOT modify):
├── convex/schema.ts                  # brands, categories table definitions
├── convex/_helpers/permissions.ts    # requireRole, HQ_ROLES
├── convex/_helpers/auditLog.ts       # _logAuditEntry helper
├── app/admin/branches/page.tsx       # Reference UI pattern (COPY this pattern)
├── lib/types.ts                      # Brand, Category type aliases
├── lib/constants.ts                  # ERROR_CODES
├── lib/formatters.ts                 # formatDate, formatDateTime
├── components/ui/                     # shadcn components
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 2.1, lines 428-446]
- [Source: _bmad-output/planning-artifacts/architecture.md — Product Hierarchy, lines 159-172]
- [Source: _bmad-output/planning-artifacts/architecture.md — Module Structure (catalog), lines 519-524]
- [Source: _bmad-output/planning-artifacts/architecture.md — Admin Route Group, lines 600-612]
- [Source: _bmad-output/planning-artifacts/architecture.md — Convex Function Naming, lines 392-396]
- [Source: _bmad-output/planning-artifacts/architecture.md — Component Organization, lines 278-283]
- [Source: _bmad-output/planning-artifacts/architecture.md — Naming Patterns, lines 329-347]
- [Source: _bmad-output/planning-artifacts/architecture.md — Error Handling, lines 228-232]
- [Source: _bmad-output/planning-artifacts/architecture.md — Audit Trail, line 75]
- [Source: convex/schema.ts — brands lines 39-45, categories lines 47-53]
- [Source: convex/_helpers/permissions.ts — HQ_ROLES line 23]
- [Source: convex/_helpers/auditLog.ts — _logAuditEntry signature]
- [Source: app/admin/layout.tsx — current admin layout implementation]
- [Source: app/admin/branches/page.tsx — reference CRUD UI pattern]
- [Source: lib/types.ts — Brand, Category type aliases]
- [Source: _bmad-output/implementation-artifacts/1-6-audit-trail-foundation.md — previous story learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Fixed TS error in admin layout: `currentUser` possibly null — added explicit null guard before role-based nav filtering

### Completion Notes List

- Created `convex/catalog/brands.ts` with 2 queries (`listBrands`, `getBrandById`) and 4 mutations (`createBrand`, `updateBrand`, `deactivateBrand`, `reactivateBrand`), all using `requireRole(ctx, HQ_ROLES)` and `_logAuditEntry()` for audit trail
- Created `convex/catalog/categories.ts` with 2 queries (`listCategories` with optional `brandId` filter using `by_brand` index, `getCategoryById`) and 4 mutations (`createCategory`, `updateCategory`, `deactivateCategory`, `reactivateCategory`), all with HQ_ROLES auth and audit logging
- `createCategory` validates brand exists and is active before insertion, throws `BRAND_INACTIVE` error for inactive brands
- Updated `app/admin/layout.tsx` to allow both `admin` and `hqStaff` roles, with role-based nav item filtering (Users/Branches admin-only, Catalog for both)
- Created `app/admin/catalog/page.tsx` — brand list with search, status filter, create/edit dialogs, deactivate/reactivate actions, clickable brand names navigating to category view
- Created `app/admin/catalog/brands/[brandId]/page.tsx` — category management for a specific brand with breadcrumb navigation, CRUD operations, and "New Category" disabled for inactive brands
- All UI follows existing branches page pattern: shadcn Table+Dialog, `toast` from sonner, `getErrorMessage()` helper, `isSubmitting` state, loading/empty states
- `tsc --noEmit` and `next lint` both pass with zero errors

### Change Log

- 2026-02-27: Implemented brand & category management — created Convex CRUD functions with audit logging, updated admin layout for HQ Staff access, created brand list UI and category management UI
- 2026-02-27: Code review fixes — fixed logo clearing bug (H1), added duplicate name checks (M1), fixed audit diff to only log changed fields (M2), extracted getErrorMessage to shared utility (M3)

### File List

**Created:**
- `convex/catalog/brands.ts` — Brand CRUD queries + mutations with HQ_ROLES auth and audit logging
- `convex/catalog/categories.ts` — Category CRUD queries + mutations with HQ_ROLES auth and audit logging
- `app/admin/catalog/page.tsx` — Brand list / catalog landing page
- `app/admin/catalog/brands/[brandId]/page.tsx` — Category list for selected brand

**Modified:**
- `app/admin/layout.tsx` — Added hqStaff role access, role-based nav items, Catalog nav entry
- `lib/utils.ts` — Added shared `getErrorMessage()` utility
- `app/admin/branches/page.tsx` — Updated to use shared `getErrorMessage()` from lib/utils

## Senior Developer Review

### Review Date
2026-02-27

### Findings

| ID | Severity | Description | Resolution |
|----|----------|-------------|------------|
| H1 | HIGH | Cannot clear brand logo once set — UI converts empty string to `undefined` (no-op for Convex optional field) | Fixed: Backend `updateBrand` now treats empty string as "clear logo" (patches to `undefined`), UI sends raw string value for edits |
| M1 | MEDIUM | Duplicate brand/category names allowed — no uniqueness validation | Fixed: Added case-insensitive duplicate name checks in `createBrand`, `updateBrand`, `createCategory`, `updateCategory` |
| M2 | MEDIUM | Audit log before/after diff records unchanged fields (value present but identical) | Fixed: Replaced generic diff loop with explicit field comparison — only logs fields that actually changed, early-returns if nothing changed |
| M3 | MEDIUM | `getErrorMessage()` duplicated across 3 pages (branches, catalog, brand categories) | Fixed: Extracted to `lib/utils.ts`, all 3 pages now import from shared utility |
| L1 | LOW | No server-side name length validation | Accepted — low risk for internal admin tool, can add in future story |

### Issues Fixed: 4 (1 HIGH, 3 MEDIUM)
### Issues Accepted: 1 (1 LOW)
### Verification: `tsc --noEmit` and `next lint` both pass clean after fixes

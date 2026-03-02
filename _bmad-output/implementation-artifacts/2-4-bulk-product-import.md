# Story 2.4: Bulk Product Import

Status: done

## Story

As an **Admin**,
I want to import products in bulk via CSV upload,
So that I can quickly populate the catalog with hundreds of products without manual entry.

## Acceptance Criteria

1. **Given** an Admin user at `/admin/catalog/import`
   **When** they upload a CSV file with product data
   **Then** the system parses the CSV and validates each row (brand, category, style, variant fields)
   **And** displays a preview of parsed rows before importing

2. **Given** validated CSV data
   **When** the user clicks Import
   **Then** a Convex action processes up to 500 items per batch using `ctx.runMutation` per item
   **And** for each row, brands/categories/styles are found by name (case-insensitive) or created if new
   **And** a new variant is always created (SKU must be globally unique)

3. **Given** a CSV with more than 500 rows
   **When** the import begins
   **Then** the client automatically splits into batches of 500 and calls the action sequentially

4. **Given** an import in progress
   **Then** the UI shows real-time progress: current batch, success count, failure count, and error details per failed row

5. **Given** a row that fails validation or insertion
   **Then** that row is skipped and the error recorded
   **And** remaining rows continue processing (partial success)

6. **Given** successfully imported products
   **Then** they are immediately visible in the catalog pages

## Tasks / Subtasks

- [x] Task 1: Install CSV parsing dependency (AC: #1)
  - [x] 1.1 Run `npm install papaparse` and `npm install -D @types/papaparse`

- [x] Task 2: Create internal Convex helpers in `convex/catalog/bulkImport.ts` (AC: #2, #5)
  - [x] 2.1 Create `_verifyAdminRole` internal query — calls `ctx.auth.getUserIdentity()`, looks up user via `by_clerkId` index, validates `user.role === "admin"` and `user.isActive`. Returns the user document. Throws `ConvexError({ code: "UNAUTHORIZED" })` on failure.
  - [x] 2.2 Create `_findOrCreateBrand` internal mutation — accepts `{ name: string, userId: Id<"users"> }`. Collects all brands, finds match by `name.toLowerCase()`. If found, returns `{ id, created: false }`. If not found, inserts new brand (isActive: true, timestamps), audit logs `"brand.bulkCreate"`, returns `{ id, created: true }`.
  - [x] 2.3 Create `_findOrCreateCategory` internal mutation — accepts `{ brandId: Id<"brands">, name: string, userId: Id<"users"> }`. Queries categories via `by_brand` index, finds match by `name.toLowerCase()`. If found, returns `{ id, created: false }`. If not found, inserts new category (isActive: true, timestamps), audit logs `"category.bulkCreate"`, returns `{ id, created: true }`.
  - [x] 2.4 Create `_findOrCreateStyle` internal mutation — accepts `{ categoryId: Id<"categories">, name: string, description: string | undefined, basePriceCentavos: number, userId: Id<"users"> }`. Queries styles via `by_category` index, finds match by `name.toLowerCase()`. If found, returns `{ id, created: false }` (ignores description/price — preserves existing). If not found, validates price > 0, inserts new style (isActive: true, timestamps), audit logs `"style.bulkCreate"`, returns `{ id, created: true }`.
  - [x] 2.5 Create `_createImportedVariant` internal mutation — accepts `{ styleId: Id<"styles">, sku: string, barcode: string | undefined, size: string, color: string, gender: string | undefined, priceCentavos: number, userId: Id<"users"> }`. Validates: non-empty sku/size/color, price > 0 integer, gender in allowed values if present. Checks SKU uniqueness via `by_sku` index. Checks barcode uniqueness via `by_barcode` index if provided. Inserts variant (isActive: true, timestamps), audit logs `"variant.bulkCreate"`, returns variant ID.

- [x] Task 3: Create `bulkImportProducts` action (AC: #2, #3, #5)
  - [x] 3.1 Define action in `convex/catalog/bulkImport.ts` with `action({ args: { items: v.array(v.object({...})) }, handler: ... })`. Arg validator for each item: `brand: v.string(), category: v.string(), styleName: v.string(), styleDescription: v.optional(v.string()), basePriceCentavos: v.number(), sku: v.string(), barcode: v.optional(v.string()), size: v.string(), color: v.string(), gender: v.optional(v.string()), priceCentavos: v.number()`. Enforce max 500 items via validation.
  - [x] 3.2 First call: `ctx.runQuery(internal.catalog.bulkImport._verifyAdminRole)` — get the user
  - [x] 3.3 Initialize caches: `brandCache = new Map<string, Id<"brands">>()`, `categoryCache = new Map<string, Id<"categories">>()`, `styleCache = new Map<string, Id<"styles">>()`. Cache keys are lowercase composite strings (brand name, brand+category, brand+category+style).
  - [x] 3.4 Loop through items sequentially. For each row: find/create brand (check cache first) → find/create category (check cache first) → find/create style (check cache first) → create variant. Wrap each row in try/catch. On success: increment `successCount`. On error: increment `failureCount`, push `{ rowIndex, sku, error: message }` to errors array. Continue to next row.
  - [x] 3.5 Return `{ successCount: number, failureCount: number, errors: Array<{ rowIndex: number, sku: string, error: string }>, brandsCreated: number, categoriesCreated: number, stylesCreated: number }`.

- [x] Task 4: Create import page UI at `app/admin/catalog/import/page.tsx` (AC: #1, #3, #4, #5, #6)
  - [x] 4.1 Page layout: `"use client"`, breadcrumb (Catalog > Bulk Import), page heading with description, and "Download Sample CSV" button that generates a sample CSV file via Blob URL.
  - [x] 4.2 File upload zone: Drop zone (`<div>` with drag/drop handlers) + hidden `<input type="file" accept=".csv">`. Validates file extension. On file select, parse with PapaParse (`Papa.parse(file, { header: true, skipEmptyLines: true })`). Validate required columns exist. Validate max 5000 rows total. Show validation errors as toast.
  - [x] 4.3 Preview section: After parsing, show total row count, unique brands/categories/styles counts. Display first 5 rows in a `<Table>` with all columns. "Clear" button to reset.
  - [x] 4.4 Import button: Disabled during import or when no data. Splits parsed rows into 500-item batches. For each batch, calls `bulkImportProducts` action with items converted to centavos (multiply peso fields by 100, round to integer). Processes batches sequentially (await each before starting next).
  - [x] 4.5 Progress display: Show during import — "Importing batch X of Y...", running success/failure totals, spinner.
  - [x] 4.6 Results display: After all batches complete — summary card (total success, total failures, brands/categories/styles created). If errors exist, show error table with row number, SKU, error message. "Import More" button to reset.
  - [x] 4.7 Import from `@/lib/utils` for `getErrorMessage`. Use `toast` from `sonner`. Use `useAction` from `convex/react` for the action call. Use shadcn `Button`, `Table`, `Badge` components.

- [x] Task 5: Add navigation link to import page (AC: #6)
  - [x] 5.1 Update `app/admin/catalog/page.tsx` — add an "Import Products" button/link that navigates to `/admin/catalog/import`

- [x] Task 6: Verify integration (AC: all)
  - [x] 6.1 Run `npx tsc --noEmit` — zero TypeScript errors
  - [x] 6.2 Run `npx next lint` — zero lint warnings/errors

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**Convex Action Pattern (CRITICAL — NOT a mutation):**
Bulk import MUST use a Convex `action` (not `mutation`). Actions can call multiple mutations via `ctx.runMutation()` in a loop. Each `ctx.runMutation` call is a separate transaction — if one fails, others still succeed (partial success).

```typescript
import { action, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

export const bulkImportProducts = action({
  args: { items: v.array(v.object({ ... })) },
  handler: async (ctx, args) => {
    // Auth check first
    const user = await ctx.runQuery(internal.catalog.bulkImport._verifyAdminRole);

    // Caches to avoid redundant find-or-create calls
    const brandCache = new Map<string, Id<"brands">>();

    for (let i = 0; i < args.items.length; i++) {
      try {
        const row = args.items[i];
        // Find or create brand (check cache first)
        const brandKey = row.brand.toLowerCase();
        let brandId = brandCache.get(brandKey);
        if (!brandId) {
          const result = await ctx.runMutation(
            internal.catalog.bulkImport._findOrCreateBrand,
            { name: row.brand, userId: user._id }
          );
          brandId = result.id;
          brandCache.set(brandKey, brandId);
        }
        // ... same for category, style, then create variant
        successCount++;
      } catch (error) {
        failureCount++;
        errors.push({ rowIndex: i, sku: row.sku, error: getErrorMessage(error) });
      }
    }
  },
});
```

**Auth in Actions (CRITICAL — `requireRole` does NOT work in ActionCtx):**
- `requireRole()` from `convex/_helpers/permissions.ts` accepts `QueryCtx | MutationCtx` — NOT `ActionCtx`
- Instead, create `_verifyAdminRole` as an `internalQuery` that:
  1. Calls `ctx.auth.getUserIdentity()` for the auth token
  2. Looks up user via `by_clerkId` index
  3. Validates role === "admin" and isActive === true
  4. Returns the user document for userId in audit logs
- Internal mutations (`_findOrCreateBrand`, etc.) skip auth checks — already verified at action level

**Admin-Only Access (CRITICAL):**
- Use `ADMIN_ROLES` (only `["admin"]`), NOT `HQ_ROLES`
- The `_verifyAdminRole` query must check `user.role === "admin"` specifically
- Route protection is handled by Clerk middleware but Convex must also enforce

**Internal Functions vs Public Functions:**
- All find-or-create helpers MUST use `internalMutation` / `internalQuery` (not `mutation` / `query`)
- Import from `"../_generated/server"`: `internalMutation`, `internalQuery`, `action`
- Reference via `internal.catalog.bulkImport._functionName` (not `api.`)
- Internal functions are NOT exposed to the client — only callable from other server-side code

**Find-or-Create Pattern (reuse existing patterns):**
- Brands: collect all → `find()` by `name.toLowerCase()` (same as `brands.ts:createBrand`)
- Categories: query by `by_brand` index → `find()` by `name.toLowerCase()` (same as `categories.ts:createCategory`)
- Styles: query by `by_category` index → `find()` by `name.toLowerCase()` (same as `styles.ts:createStyle`)
- Variants: ALWAYS create (never find-or-create). SKU must be globally unique via `by_sku` index check.

**Cache Keys for Action-Level Caching:**
```typescript
// Brand: just the name
const brandKey = row.brand.toLowerCase();

// Category: brand name + category name (categories are scoped to brand)
const categoryKey = `${row.brand.toLowerCase()}::${row.category.toLowerCase()}`;

// Style: brand + category + style name (styles are scoped to category)
const styleKey = `${row.brand.toLowerCase()}::${row.category.toLowerCase()}::${row.styleName.toLowerCase()}`;
```

**Prices in CSV = Philippine Pesos → Stored as Centavos:**
- CSV: `basePricePesos=299.99`, `pricePesos=349.50`
- Convert on client before sending to action: `Math.round(parseFloat(pricePesos) * 100)`
- Action receives and stores as integer centavos: `29999`, `34950`

**Batch Limit:**
- Max 500 items per action invocation (enforced in action args validation)
- Client splits larger CSVs into 500-item chunks and calls action sequentially
- Max total rows: 5000 per file (client-side validation)

**CSV Column Specification:**
| Column | Required | Description |
|--------|----------|-------------|
| brand | Yes | Brand name (find or create) |
| category | Yes | Category name within brand (find or create) |
| styleName | Yes | Style/model name within category (find or create) |
| styleDescription | No | Style description (used only when creating a new style) |
| basePricePesos | Yes | Style base price in pesos (used only when creating a new style) |
| sku | Yes | Variant SKU (must be globally unique) |
| barcode | No | Variant barcode (must be globally unique if provided) |
| size | Yes | Variant size (e.g., "S", "M", "L", "XL") |
| color | Yes | Variant color (e.g., "Red", "Blue") |
| gender | No | One of: mens, womens, unisex, kids |
| pricePesos | Yes | Variant unit price in pesos |

**PapaParse Usage (MUST install — not in package.json yet):**
```typescript
import Papa from "papaparse";

Papa.parse(file, {
  header: true,
  skipEmptyLines: true,
  complete: (results) => {
    // results.data = array of objects keyed by header names
    // results.errors = parse errors
    // results.meta.fields = column names
  },
});
```

**`useAction` Hook (NOT `useMutation`):**
```typescript
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

const bulkImport = useAction(api.catalog.bulkImport.bulkImportProducts);
// Call: const result = await bulkImport({ items: batch });
```

**Audit Logging — use `"*.bulkCreate"` actions to distinguish from manual CRUD:**
- `"brand.bulkCreate"`, `"category.bulkCreate"`, `"style.bulkCreate"`, `"variant.bulkCreate"`
- Import `_logAuditEntry` from `../_helpers/auditLog` in each internal mutation
- `_logAuditEntry` requires `MutationCtx` — which `internalMutation` provides

**Error Handling:**
- Per-row errors: catch in the action loop, record `{ rowIndex, sku, error }`, continue
- Use `ConvexError({ code, message })` for business errors in internal mutations
- Client extracts error messages via `getErrorMessage()` from `@/lib/utils`
- Error codes: `DUPLICATE_SKU`, `DUPLICATE_BARCODE`, `VALIDATION_ERROR`, `INVALID_PRICE`

**Gender Validation in Internal Mutation:**
```typescript
const VALID_GENDERS = ["mens", "womens", "unisex", "kids"];
if (args.gender && !VALID_GENDERS.includes(args.gender)) {
  throw new ConvexError({ code: "VALIDATION_ERROR", message: `Invalid gender: ${args.gender}` });
}
```

**Sample CSV Content (for download template):**
```csv
brand,category,styleName,styleDescription,basePricePesos,sku,barcode,size,color,gender,pricePesos
RedBox,T-Shirts,Classic Crew,Basic crew neck tee,299,RB-CC-S-RED,8901234567890,S,Red,unisex,299
RedBox,T-Shirts,Classic Crew,,299,RB-CC-M-RED,,M,Red,unisex,299
RedBox,T-Shirts,Classic Crew,,299,RB-CC-L-BLU,,L,Blue,unisex,319
RedBox,Polo Shirts,Sport Polo,Breathable sport polo,499,RB-SP-M-WHT,8901234567891,M,White,mens,499
```

**UI Patterns — Follow existing admin catalog pages:**
- `"use client"` directive at top
- Import `getErrorMessage` from `@/lib/utils`
- shadcn components: `Button`, `Table`, `TableHeader`, `TableRow`, `TableHead`, `TableBody`, `TableCell`, `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Badge`
- `toast` from `sonner` for success/error feedback
- `isImporting` state to disable buttons during import
- lucide-react icons: `Upload`, `FileSpreadsheet`, `Download`, `AlertCircle`, `CheckCircle2`

### Scope Boundaries — DO NOT IMPLEMENT

- **Column mapping UI** → Auto-detect from CSV headers only, no manual column mapping
- **Edit rows before import** → Preview is read-only, no inline editing
- **Undo/rollback import** → Not required; admin can deactivate items individually
- **Image upload via CSV** → Images are handled separately (Story 2.3)
- **Update existing variants via import** → Always create new; duplicate SKU is an error
- **Inventory/stock quantities** → This imports catalog data only, not inventory levels (Epic 5)

### Existing Code to Build Upon (Stories 1.1-2.3)

**Already exists — DO NOT recreate:**
- `convex/schema.ts` — All tables defined (brands, categories, styles, variants)
- `convex/catalog/brands.ts` — Brand CRUD with case-insensitive duplicate check pattern
- `convex/catalog/categories.ts` — Category CRUD with `by_brand` index + case-insensitive check
- `convex/catalog/styles.ts` — Style CRUD with `by_category` index + case-insensitive check
- `convex/catalog/variants.ts` — Variant CRUD with `by_sku` and `by_barcode` index checks
- `convex/_helpers/permissions.ts` — `requireAuth()`, `requireRole()`, `ADMIN_ROLES`, `HQ_ROLES`
- `convex/_helpers/auditLog.ts` — `_logAuditEntry()` helper (requires `MutationCtx`)
- `app/admin/catalog/page.tsx` — Catalog listing page (WILL BE MODIFIED to add Import link)
- `lib/utils.ts` — `getErrorMessage()` shared utility
- `components/ui/` — shadcn components

**Key Schema Details (from `convex/schema.ts`):**
- `brands`: `name`, `logo?`, `isActive`, `createdAt`, `updatedAt`
- `categories`: `brandId`, `name`, `isActive`, `createdAt`, `updatedAt` — index: `by_brand`
- `styles`: `categoryId`, `name`, `description?`, `basePriceCentavos`, `isActive`, `createdAt`, `updatedAt` — index: `by_category`
- `variants`: `styleId`, `sku`, `barcode?`, `size`, `color`, `gender?`, `priceCentavos`, `storageId?`, `isActive`, `createdAt`, `updatedAt` — indexes: `by_style`, `by_sku`, `by_barcode`
- `gender` union: `"mens"` | `"womens"` | `"unisex"` | `"kids"`

### Previous Story Learnings (from Stories 2.1-2.3)

- **Server-side validation:** Always validate on the backend, not just client. Validate empty strings, price ranges, etc.
- **Case-insensitive duplicate check:** Existing code uses `.toLowerCase()` comparison — replicate exactly.
- **Audit diff pattern:** Only log actually-changed fields. For bulk create, log the `after` object only.
- **Shared getErrorMessage:** Import from `@/lib/utils` — never create local copies.
- **HTTP response validation:** Always check `result.ok` when doing fetch calls (Story 2.3 learning).

### Project Structure Notes

```
Files to CREATE in this story:
├── convex/catalog/
│   └── bulkImport.ts              # Action + internal mutations/queries
├── app/admin/catalog/
│   └── import/
│       └── page.tsx               # Bulk import UI

Files to MODIFY in this story:
├── app/admin/catalog/page.tsx     # Add "Import Products" navigation link
├── package.json                   # Add papaparse dependency

Files to reference (NOT modify):
├── convex/catalog/brands.ts       # Find-or-create pattern reference
├── convex/catalog/categories.ts   # by_brand index + duplicate check pattern
├── convex/catalog/styles.ts       # by_category index + duplicate check pattern
├── convex/catalog/variants.ts     # SKU/barcode uniqueness pattern
├── convex/_helpers/permissions.ts # ADMIN_ROLES, requireAuth pattern
├── convex/_helpers/auditLog.ts    # _logAuditEntry signature (MutationCtx)
├── convex/schema.ts               # Table definitions and indexes
├── lib/utils.ts                   # getErrorMessage utility
├── components/ui/                 # shadcn components
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 2.4]
- [Source: _bmad-output/planning-artifacts/architecture.md — Addendum 3: Bulk Import Operations]
- [Source: _bmad-output/planning-artifacts/architecture.md — Convex Action Pattern]
- [Source: _bmad-output/planning-artifacts/architecture.md — Batch Processing Pattern]
- [Source: _bmad-output/planning-artifacts/architecture.md — Error Handling]
- [Source: convex/catalog/brands.ts — case-insensitive duplicate check pattern]
- [Source: convex/catalog/categories.ts — by_brand index + find pattern]
- [Source: convex/catalog/styles.ts — by_category index + find pattern]
- [Source: convex/catalog/variants.ts — SKU/barcode uniqueness validation]
- [Source: convex/_helpers/permissions.ts — ADMIN_ROLES, requireRole signature]
- [Source: convex/_helpers/auditLog.ts — _logAuditEntry signature]
- [Source: _bmad-output/implementation-artifacts/2-3-product-image-management.md — previous story learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Zero TypeScript errors on `npx tsc --noEmit`
- Zero ESLint warnings/errors on `npx next lint`

### Completion Notes List

- Task 1: Installed `papaparse@5.5.3` and `@types/papaparse@5.5.2` as dependencies.
- Task 2: Created `convex/catalog/bulkImport.ts` with 5 internal functions: `_verifyAdminRole` (internalQuery — auth via getUserIdentity + by_clerkId index, admin-only), `_findOrCreateBrand` (internalMutation — collect all + case-insensitive find, create with audit log), `_findOrCreateCategory` (internalMutation — by_brand index + case-insensitive find, create with audit log), `_findOrCreateStyle` (internalMutation — by_category index + case-insensitive find, create with price validation and audit log), `_createImportedVariant` (internalMutation — validates SKU/size/color/price/gender, checks SKU and barcode uniqueness via indexes, creates with audit log). All use `_logAuditEntry` with `*.bulkCreate` action names.
- Task 3: Created `bulkImportProducts` action in same file. Enforces 500-item batch limit. Verifies admin role via internal query. Uses three Maps as caches (brand, category, style) with composite lowercase keys. Sequential loop with per-row try/catch for partial success. Returns success/failure counts, error details, and created entity counts.
- Task 4: Created `app/admin/catalog/import/page.tsx` with full import UI. Drag-and-drop upload zone + file input. PapaParse CSV parsing with required column validation and 5000-row limit. Preview section showing summary stats (row count, unique brands/categories/styles) and first 5 rows in table. Import button that splits into 500-item batches, converts pesos to centavos, and processes sequentially. Progress display with batch counter and spinner. Results section with success/failure metrics and error table. Sample CSV download via Blob URL.
- Task 5: Updated `app/admin/catalog/page.tsx` — added "Import Products" outline button with Upload icon linking to `/admin/catalog/import`, placed next to existing "New Brand" button.
- Task 6: Verified zero TypeScript errors and zero ESLint warnings. Fixed one TS error: `ParsedRow` to `Record<string, string>` cast needed intermediate `unknown`.

### Change Log

- 2026-02-27: Implemented Story 2.4 — Bulk Product Import. Created `convex/catalog/bulkImport.ts` with Convex action + internal mutations/queries for admin-only CSV import. Created `app/admin/catalog/import/page.tsx` with drag-drop upload, CSV parsing, preview, batch processing, progress display, and error reporting. Added "Import Products" navigation link on catalog page.
- 2026-02-27: Code review fixes — H1: partial batch results now shown on mid-import failure (moved setResults to finally block). H2: added PapaParse error callback for file read failures. M1: gender lowercased client-side for case-insensitive matching. M2: added client-side duplicate SKU detection. M3: non-fatal PapaParse errors (FieldMismatch) now warn instead of rejecting entire file.

### File List

**Created:**
- `convex/catalog/bulkImport.ts` — Bulk import action + internal find-or-create mutations/queries
- `app/admin/catalog/import/page.tsx` — Bulk import UI page

**Modified:**
- `app/admin/catalog/page.tsx` — Added "Import Products" button linking to `/admin/catalog/import`
- `package.json` — Added `papaparse` dependency and `@types/papaparse` devDependency
- `package-lock.json` — Updated lockfile

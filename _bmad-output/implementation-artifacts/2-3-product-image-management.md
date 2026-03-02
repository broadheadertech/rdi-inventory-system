# Story 2.3: Product Image Management

Status: done

## Story

As an **HQ Staff member**,
I want to upload product images for styles and variants,
So that products are visually identifiable across all interfaces (POS lookup, customer website, dashboards).

## Acceptance Criteria

1. **Given** an existing style or variant
   **When** the user uploads an image via the admin catalog form
   **Then** the image is stored via Convex file storage using `storage.generateUploadUrl()`
   **And** the `storageId` is saved as a reference on the style/variant record
   **And** images are served via `storage.getUrl()` with automatic CDN caching

2. **Given** an existing style
   **When** the user uploads multiple images
   **Then** up to 5 images can be uploaded per style (product gallery)
   **And** a primary image can be designated for thumbnails
   **And** images have a display order (sortOrder)

3. **Given** an existing variant
   **When** the user uploads an image
   **Then** the variant's `storageId` field is updated with the uploaded image reference
   **And** the image is displayed as a thumbnail in the variant table row

4. **Given** any image upload or delete operation
   **Then** an immutable audit log entry is created via `_logAuditEntry()`
   **And** the entry records action type, user ID, entity type, entity ID

5. **Given** the admin catalog UI
   **Then** style images are manageable on the style management page (gallery section)
   **And** variant images are manageable in the variant edit dialog
   **And** `convex/catalog/images.ts` provides upload URL generation, save, and delete mutations

## Tasks / Subtasks

- [x] Task 1: Add `productImages` table to schema (AC: #1, #2)
  - [x] 1.1 Add `productImages` table to `convex/schema.ts` with fields: `styleId`, `storageId`, `isPrimary`, `sortOrder`, `createdAt`. Index: `by_style` on `["styleId"]`.
  - [x] 1.2 Add `ProductImage` type alias to `lib/types.ts`

- [x] Task 2: Create image Convex functions (AC: #1, #2, #3, #4, #5)
  - [x] 2.1 Create `convex/catalog/images.ts` with `generateUploadUrl` mutation — calls `ctx.storage.generateUploadUrl()`. Uses `requireRole(ctx, HQ_ROLES)`.
  - [x] 2.2 Add `listStyleImages` query — accepts `styleId`, returns images sorted by `sortOrder`. Uses `requireRole(ctx, HQ_ROLES)`.
  - [x] 2.3 Add `saveStyleImage` mutation — inserts into `productImages` table with `styleId`, `storageId`, `isPrimary` (auto-set true if first image), `sortOrder`. Validate style exists. Max 5 images per style. Audit log with `action: "image.create"`.
  - [x] 2.4 Add `deleteStyleImage` mutation — deletes from `productImages` and calls `ctx.storage.delete(storageId)`. If deleted image was primary, auto-promote next image. Audit log with `action: "image.delete"`.
  - [x] 2.5 Add `setPrimaryImage` mutation — sets `isPrimary: true` on target, `isPrimary: false` on all others for that style. Audit log with `action: "image.setPrimary"`.
  - [x] 2.6 Add `saveVariantImage` mutation — patches variant's `storageId` field. Validate variant exists. If variant already has an image, delete the old one from storage. Audit log with `action: "image.variantUpdate"`.
  - [x] 2.7 Add `deleteVariantImage` mutation — clears variant's `storageId` and deletes from storage. Audit log with `action: "image.variantDelete"`.
  - [x] 2.8 Add `getImageUrl` query — accepts `storageId`, returns URL via `ctx.storage.getUrl()`.

- [x] Task 3: Add image gallery to style management page (AC: #1, #2, #5)
  - [x] 3.1 Update `app/admin/catalog/brands/[brandId]/categories/[categoryId]/page.tsx` — add image gallery section below the styles table for a selected style, or add image thumbnails inline in the style table
  - [x] 3.2 Image upload: file input that accepts image types (JPEG, PNG, WebP), max 5MB
  - [x] 3.3 Gallery display: show uploaded images as thumbnails with primary badge
  - [x] 3.4 Actions per image: set as primary, delete (with confirmation)
  - [x] 3.5 Show thumbnail of primary image in the styles table row

- [x] Task 4: Add variant image upload to variant management page (AC: #3, #5)
  - [x] 4.1 Update `app/admin/catalog/brands/[brandId]/categories/[categoryId]/styles/[styleId]/page.tsx` — add image thumbnail column to variants table
  - [x] 4.2 Add image upload in the edit variant dialog (file input with preview)
  - [x] 4.3 Show image thumbnail (or placeholder icon) in each variant row
  - [x] 4.4 Add delete image button in edit dialog when image exists

- [x] Task 5: Verify integration (AC: all)
  - [x] 5.1 Run `npx tsc --noEmit` — zero TypeScript errors
  - [x] 5.2 Run `npx next lint` — zero lint warnings/errors

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**Convex File Storage Pattern (CRITICAL):**
The upload flow uses a 3-step pattern:
```
1. Client calls generateUploadUrl mutation → gets a temporary upload URL
2. Client uploads file directly to that URL via fetch POST → gets { storageId } back
3. Client calls save mutation with storageId → persists reference in DB
```

Implementation in client:
```typescript
// Step 1: Get upload URL
const uploadUrl = await generateUploadUrl();

// Step 2: Upload file
const result = await fetch(uploadUrl, {
  method: "POST",
  headers: { "Content-Type": file.type },
  body: file,
});
const { storageId } = await result.json();

// Step 3: Save reference
await saveStyleImage({ styleId, storageId });
```

**Serving images:**
```typescript
// In a query, get the URL for a storageId
const url = await ctx.storage.getUrl(storageId);
// Returns a CDN-cached URL string or null
```

**Authorization — HQ_ROLES:**
- Use `requireRole(ctx, HQ_ROLES)` — allows both `admin` and `hqStaff`
- Import from `convex/_helpers/permissions.ts`

**No Branch Scoping Needed:**
- Product images are GLOBAL catalog entities — not branch-scoped
- Do NOT use `withBranchScope(ctx)` for image mutations

**Schema — `storageId` on Variants:**
- Already exists in schema: `storageId: v.optional(v.id("_storage"))`
- This is for variant-specific images (e.g., color-specific photos)
- Do NOT modify the variants table schema — just use the existing field

**Schema — New `productImages` Table:**
- Needs to be ADDED to `convex/schema.ts` for style-level gallery images
- Fields: `styleId: v.id("styles")`, `storageId: v.id("_storage")`, `isPrimary: v.boolean()`, `sortOrder: v.number()`, `createdAt: v.number()`
- Index: `by_style` on `["styleId"]`
- Max 5 images per style enforced in mutation

**Audit Logging — MUST call `_logAuditEntry()` for every mutation:**
- Import: `import { _logAuditEntry } from "../_helpers/auditLog";`
- Actions: `"image.create"`, `"image.delete"`, `"image.setPrimary"`, `"image.variantUpdate"`, `"image.variantDelete"`

**Error Handling:**
- Import `getErrorMessage` from `@/lib/utils` (shared utility)
- Error codes: `NOT_FOUND`, `MAX_IMAGES_REACHED`, `IMAGE_NOT_FOUND`, `STYLE_NOT_FOUND`, `VARIANT_NOT_FOUND`
- Use `ConvexError({ code: "...", message: "..." })` from `convex/values`

**File Validation (Client-Side):**
- Accepted types: `image/jpeg`, `image/png`, `image/webp`
- Max file size: 5MB (validate before upload)
- Do NOT validate file type server-side — Convex storage accepts any file. Validate on client.

**UI Patterns — Follow existing catalog page patterns exactly:**
- `"use client"` directive at top
- Import `getErrorMessage` from `@/lib/utils`
- shadcn components: existing + potentially new components
- `toast` from `sonner` for success/error feedback
- `isSubmitting` state to disable buttons during upload
- lucide-react icons: `ImagePlus`, `Trash2`, `Star`, `Image` for image operations

### Scope Boundaries — DO NOT IMPLEMENT

- **Image cropping/resizing** → Not in requirements, Convex stores as-is
- **Image optimization/compression** → Leave to Next.js `<Image>` component (customer-facing, future epic)
- **Drag-and-drop reordering** → Use simple sortOrder, no drag-and-drop UI
- **Bulk image upload** → Story 2.4 handles bulk import
- **Customer-facing image display** → Epic 8 (customer website)
- **POS product thumbnails** → Epic 3 (POS interface)

### Existing Code to Build Upon (Stories 1.1-2.2)

**Already exists — DO NOT recreate:**
- `convex/schema.ts` — `variants` table with `storageId: v.optional(v.id("_storage"))` field already defined
- `convex/_helpers/permissions.ts` — `requireAuth()`, `requireRole()`, `HQ_ROLES`
- `convex/_helpers/auditLog.ts` — `_logAuditEntry()` helper
- `convex/catalog/styles.ts` — Style CRUD (reference pattern)
- `convex/catalog/variants.ts` — Variant CRUD with `clearGender` pattern and server-side validation
- `app/admin/catalog/brands/[brandId]/categories/[categoryId]/page.tsx` — Style list page (WILL BE MODIFIED for image gallery)
- `app/admin/catalog/brands/[brandId]/categories/[categoryId]/styles/[styleId]/page.tsx` — Variant list page (WILL BE MODIFIED for image column)
- `lib/types.ts` — Type aliases (add `ProductImage`)
- `lib/utils.ts` — `getErrorMessage()` shared utility
- `lib/formatters.ts` — `formatCurrency()` for price display
- `components/ui/` — shadcn components

**Schema reference (already in schema.ts — variants table):**
```typescript
variants: defineTable({
  styleId: v.id("styles"),
  sku: v.string(),
  barcode: v.optional(v.string()),
  size: v.string(),
  color: v.string(),
  gender: v.optional(v.union(...)),
  priceCentavos: v.number(),
  storageId: v.optional(v.id("_storage")),  // ← USE THIS for variant images
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

### Previous Story Learnings (from Stories 2.1 and 2.2)

- **Server-side validation:** Always validate on the backend, not just client. Validate empty strings, price ranges, etc.
- **Audit diff pattern:** Only log actually-changed fields. Use explicit field comparison, not generic loops.
- **Reactivation guard:** Always check current state before toggling. Prevents false audit entries.
- **Shared getErrorMessage:** Import from `@/lib/utils` — never create local copies.
- **Breadcrumb validation:** Cross-check URL params against DB relationships.
- **Optional field clearing:** Empty string = "clear field", undefined = "no change".

### Project Structure Notes

```
Files to CREATE in this story:
├── convex/catalog/
│   └── images.ts                  # Image upload/delete/query mutations

Files to MODIFY in this story:
├── convex/schema.ts               # Add productImages table
├── lib/types.ts                   # Add ProductImage type alias
├── app/admin/catalog/brands/[brandId]/categories/
│   └── [categoryId]/
│       ├── page.tsx               # Add image gallery for styles
│       └── styles/
│           └── [styleId]/
│               └── page.tsx       # Add image column/upload for variants

Files to reference (NOT modify):
├── convex/catalog/styles.ts       # Style queries for validation
├── convex/catalog/variants.ts     # Variant mutations pattern reference
├── convex/_helpers/permissions.ts  # requireRole, HQ_ROLES
├── convex/_helpers/auditLog.ts    # _logAuditEntry helper
├── lib/utils.ts                   # getErrorMessage utility
├── components/ui/                 # shadcn components
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 2.3]
- [Source: _bmad-output/planning-artifacts/architecture.md — Addendum 7: Product Image Storage]
- [Source: _bmad-output/planning-artifacts/architecture.md — Module Structure (catalog), lines 519-524]
- [Source: _bmad-output/planning-artifacts/architecture.md — Convex Function Naming]
- [Source: _bmad-output/planning-artifacts/architecture.md — Error Handling]
- [Source: convex/schema.ts — variants table storageId field]
- [Source: _bmad-output/implementation-artifacts/2-2-style-and-variant-management.md — previous story learnings and code review fixes]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Zero TypeScript errors on `npx tsc --noEmit`
- Zero ESLint warnings/errors on `npx next lint`

### Completion Notes List

- Task 1: Added `productImages` table to `convex/schema.ts` with `styleId`, `storageId`, `isPrimary`, `sortOrder`, `createdAt` fields and `by_style` index. Added `ProductImage` type alias to `lib/types.ts`.
- Task 2: Created `convex/catalog/images.ts` with 8 functions: `generateUploadUrl`, `listStyleImages`, `getImageUrl`, `saveStyleImage`, `deleteStyleImage`, `setPrimaryImage`, `saveVariantImage`, `deleteVariantImage`. All mutations use `requireRole(ctx, HQ_ROLES)` and `_logAuditEntry()`. Max 5 images per style enforced. Auto-primary on first image. Auto-promote next image when primary deleted.
- Task 3: Updated styles page with image gallery. Added `StylePrimaryThumbnail` and `ImageThumbnail` helper components. Added Image column to styles table showing primary thumbnail. Added gallery section below table with upload (file validation: JPEG/PNG/WebP, 5MB max), set primary, and delete actions. Uses Convex 3-step upload pattern.
- Task 4: Updated variants page with image support. Added `VariantImageThumbnail` component. Added Image column to variants table. Added image upload/replace/delete in edit variant dialog using existing `storageId` field on variants table.
- Task 5: Verified zero TypeScript errors and zero ESLint warnings. Fixed lucide `Image` icon rename to `ImageIcon` to avoid JSX accessibility linter conflicts. Added `eslint-disable-next-line @next/next/no-img-element` for Convex CDN image URLs.

### Code Review Fixes (2026-02-27)

- **[H1] Fixed stale `editingVariant` state** — Variant image upload/delete now updates local `editingVariant` state so the edit dialog reflects changes immediately without needing to close and reopen.
- **[M1] Added HTTP response validation** — Both upload handlers now check `result.ok` after the `fetch` POST to Convex storage, throwing a clear "Image upload failed" error instead of passing undefined `storageId`.
- **[M2] Added orphaned storage file cleanup** — If `saveStyleImage`/`saveVariantImage` mutation fails after file upload succeeds, the catch block now attempts best-effort cleanup via `deleteStorageFile` mutation.
- **[M3] Fixed N+1 query in `StylePrimaryThumbnail`** — Replaced 2-query pattern (`listStyleImages` + `getImageUrl`) with single `getStylePrimaryImageUrl` query that resolves the primary image URL server-side, reducing subscriptions from 2N to N.
- **Added `getStylePrimaryImageUrl` query** to `convex/catalog/images.ts` — combines image lookup + URL resolution in one server-side query.
- **Added `deleteStorageFile` mutation** to `convex/catalog/images.ts` — lightweight cleanup helper for orphaned storage files.

### Change Log

- 2026-02-27: Implemented Story 2.3 — Product Image Management. Created `convex/catalog/images.ts` with full CRUD for style gallery and variant images. Modified schema, types, styles page (image gallery), and variants page (image column + edit dialog upload).
- 2026-02-27: Code review fixes — Fixed 1 HIGH (stale variant edit state), 3 MEDIUM (HTTP response check, orphan cleanup, N+1 queries). Added `getStylePrimaryImageUrl` query and `deleteStorageFile` mutation.

### File List

**Created:**
- `convex/catalog/images.ts` — Image upload URL generation, style image CRUD, variant image CRUD, image URL query

**Modified:**
- `convex/schema.ts` — Added `productImages` table definition
- `lib/types.ts` — Added `ProductImage` type alias
- `app/admin/catalog/brands/[brandId]/categories/[categoryId]/page.tsx` — Added image gallery section, primary thumbnail column, upload/delete/set-primary UI
- `app/admin/catalog/brands/[brandId]/categories/[categoryId]/styles/[styleId]/page.tsx` — Added image thumbnail column, variant image upload/delete in edit dialog

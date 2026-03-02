# Story 8.4: Reserve-for-Pickup Flow

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Customer**,
I want to reserve a product for in-store pickup without creating an account or paying upfront,
so that I can guarantee the item will be held for me when I visit the store.

## Acceptance Criteria

1. **Given** a customer is viewing a product with available stock at a branch
   **When** they tap "Reserve for Pickup"
   **Then** a bottom sheet opens (stays in context) asking for: name and phone number only (no account creation)

2. **And** a real-time stock check occurs on reserve tap — if stock is gone, show alternative branches

3. **And** on submission, the reservation is created with 24-hour auto-expiry

4. **And** the customer sees a confirmation with: reserved item, branch name, pickup deadline

5. **And** branch staff see the reservation in `(branch)/reservations/`

## Tasks / Subtasks

- [x] Task 1: Add `reservations` table to `convex/schema.ts` (AC: 1, 2, 3, 4, 5)
  - [x]1.1 Add `reservations` table: `customerName: v.string()`, `customerPhone: v.string()`, `variantId: v.id("variants")`, `branchId: v.id("branches")`, `quantity: v.number()`, `status: v.string()` (enum: "pending", "fulfilled", "expired", "cancelled"), `expiresAt: v.number()`, `confirmationCode: v.string()`, `createdAt: v.number()`, `updatedAt: v.number()`
  - [x]1.2 Add indexes: `by_branch` (branchId), `by_status` (status), `by_branch_status` (branchId, status), `by_confirmation` (confirmationCode), `by_expiresAt` (expiresAt)
  - [x]1.3 Run `npx convex codegen` to regenerate types

- [x] Task 2: Create `convex/reservations/reservations.ts` with public mutation + internal helpers (AC: 1, 2, 3)
  - [x]2.1 Create `convex/reservations/` directory
  - [x]2.2 Create `createReservationPublic` mutation — NO auth required (public mutation, not query):
    - Args: `variantId: v.id("variants")`, `branchId: v.id("branches")`, `customerName: v.string()`, `customerPhone: v.string()`
    - Validate: name is non-empty (trim), phone matches Philippine format (starts with `09` or `+639`, 11-13 digits)
    - Real-time stock check: query `inventory` table for (branchId, variantId) — if quantity <= 0, throw `ConvexError({ code: "OUT_OF_STOCK" })` with message including alternative branches that have stock
    - Decrement inventory: `ctx.db.patch(inventoryId, { quantity: currentQty - 1, updatedAt: Date.now() })`
    - Generate 6-character alphanumeric confirmation code (uppercase, e.g., `RBX-A3K7P2`)
    - Create reservation record: status "pending", expiresAt = `Date.now() + 24 * 60 * 60 * 1000`, quantity 1
    - Return: `{ reservationId, confirmationCode, expiresAt, branchName, variantDetails }`
  - [x]2.3 Create `getAlternativeBranches` internal query — given a variantId, return branches with stock > 0 (used for OUT_OF_STOCK error context)
  - [x]2.4 Create `getReservationByConfirmation` public query — lookup by confirmationCode for customer status check page

- [x] Task 3: Create `convex/reservations/manage.ts` with branch staff mutations (AC: 5)
  - [x]3.1 Create `listBranchReservations` query — requires `POS_ROLES` or `BRANCH_MANAGEMENT_ROLES`, uses `withBranchScope` to filter by staff's branch, returns pending/fulfilled/expired reservations sorted by createdAt desc
  - [x]3.2 Create `fulfillReservation` mutation — requires branch role, validates reservation belongs to staff's branch, updates status to "fulfilled", logs audit entry
  - [x]3.3 Create `cancelReservation` mutation — requires branch role, validates ownership, updates status to "cancelled", restores inventory quantity +1, logs audit entry

- [x] Task 4: Create `expireReservations` scheduled function (AC: 3)
  - [x]4.1 Create `convex/reservations/expiry.ts` with `expireReservations` internal mutation:
    - Query all reservations where `status === "pending"` AND `expiresAt < Date.now()`
    - For each: update status to "expired", restore inventory quantity +1
    - Log count of expired reservations
  - [x]4.2 Register in `convex/crons.ts`: `crons.interval("expire-reservations", { hours: 1 }, internal.reservations.expiry.expireReservations)`

- [x] Task 5: Add "Reserve for Pickup" button to BranchStockDisplay component (AC: 1)
  - [x]5.1 Extend `BranchStockDisplayProps` to accept optional `onReserve?: (branchId: Id<"branches">, branchName: string) => void` callback
  - [x]5.2 When `onReserve` is provided AND variant is selected AND branch has stock > 0: show a "Reserve" button per branch row
  - [x]5.3 Button styling: `text-sm font-medium text-primary hover:underline` — small, inline, not dominating the stock display
  - [x]5.4 When no variant selected, do NOT show reserve buttons (need specific size/color to reserve)

- [x] Task 6: Create reservation bottom sheet on product detail page (AC: 1, 2)
  - [x]6.1 In `app/(customer)/browse/style/[styleId]/page.tsx`, add state for `reserveBranch: { id: Id<"branches">; name: string } | null`
  - [x]6.2 Pass `onReserve` callback to `BranchStockDisplay` that sets `reserveBranch`
  - [x]6.3 Create bottom sheet (Dialog from shadcn/ui or custom div with fixed bottom positioning):
    - Shows when `reserveBranch` is set
    - Title: "Reserve for Pickup at {branchName}"
    - Fields: Customer Name (text, required), Phone Number (tel, required, placeholder "09XX XXX XXXX")
    - Inline validation: name non-empty, phone format (on blur)
    - Submit button: "Confirm Reservation" (min-h-[44px])
    - Cancel/close button
  - [x]6.4 On submit: call `createReservationPublic` mutation
    - Loading state on submit button ("Reserving...")
    - On success: close sheet, show confirmation (navigate to confirmation or show inline)
    - On `OUT_OF_STOCK` error: show toast with "Item no longer available at this branch" + list alternative branches from error data
    - On other errors: show toast with error message

- [x] Task 7: Create reservation confirmation page `app/(customer)/reserve/[confirmationCode]/page.tsx` (AC: 4)
  - [x]7.1 Create `app/(customer)/reserve/` directory
  - [x]7.2 Create confirmation page that accepts `confirmationCode` param
  - [x]7.3 Use `useQuery` with `getReservationByConfirmation` to load reservation details
  - [x]7.4 Display: confirmation code (large, copyable), reserved item name + size + color, branch name + address, pickup deadline with countdown timer, status badge (Pending/Fulfilled/Expired)
  - [x]7.5 Loading skeleton while data loads
  - [x]7.6 "Not found" state if confirmation code is invalid
  - [x]7.7 Create `app/(customer)/reserve/[confirmationCode]/error.tsx` error boundary

- [x] Task 8: Create branch staff reservations page `app/branch/reservations/page.tsx` (AC: 5)
  - [x]8.1 Create `app/branch/reservations/` directory
  - [x]8.2 Page layout: title "Reservations", filter tabs (All / Pending / Fulfilled / Expired)
  - [x]8.3 Reservation list: cards or table rows showing customer name, phone, product (style name + variant size/color), reservation time, expiry countdown, status badge, action buttons
  - [x]8.4 "Fulfill" button on pending reservations — calls `fulfillReservation` mutation, shows success toast
  - [x]8.5 "Cancel" button on pending reservations — confirm dialog → calls `cancelReservation`, shows success toast with "Stock restored"
  - [x]8.6 Loading skeleton, empty state ("No reservations")
  - [x]8.7 Wire into branch layout navigation if not already present

- [x] Task 9: Run `npx convex codegen` after all query/mutation changes
- [x] Task 10: Validate TypeScript — `npx tsc --noEmit` → 0 errors
- [x] Task 11: Validate linting — `npx next lint` → 0 warnings
- [x] Task 12: Update this story Status to "review" and sprint-status.yaml to "review"

## Dev Notes

### CRITICAL: Reservation is a PUBLIC Feature — No Auth Required

The reserve-for-pickup flow is accessible WITHOUT Clerk authentication. The customer provides only name + phone. This means:
- The `createReservationPublic` mutation must NOT call `requireAuth()` or `requireRole()`
- Follow the pattern in `convex/catalog/publicBrowse.ts` — public queries/mutations without auth gates
- The `/reserve(.*)` route is already in `PUBLIC_ROUTES` in `lib/routes.ts` (line ~41)
- The customer layout `app/(customer)/layout.tsx` does NOT require auth

However, the **branch staff** reservations page (`app/branch/reservations/`) IS authenticated and uses `withBranchScope` for data isolation.

### Schema Design — `reservations` Table

```typescript
reservations: defineTable({
  customerName: v.string(),
  customerPhone: v.string(),
  variantId: v.id("variants"),
  branchId: v.id("branches"),
  quantity: v.number(),        // Always 1 for MVP
  status: v.string(),          // "pending" | "fulfilled" | "expired" | "cancelled"
  confirmationCode: v.string(),
  expiresAt: v.number(),       // Date.now() + 24h
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_branch", ["branchId"])
  .index("by_status", ["status"])
  .index("by_branch_status", ["branchId", "status"])
  .index("by_confirmation", ["confirmationCode"])
  .index("by_expiresAt", ["expiresAt"]),
```

No `userId` field — this is a public feature. Customer identity is just name + phone.

### Inventory Decrement on Reserve — Stock Locking Pattern

When a reservation is created:
1. **Atomically check + decrement** inventory in the `createReservationPublic` mutation
2. Convex mutations are transactional — if two customers reserve simultaneously, one will succeed and the other will get an `OUT_OF_STOCK` error (Convex serializes conflicting writes)
3. On expiry/cancellation: increment inventory back by +1

Query pattern for stock check:
```typescript
const inv = await ctx.db
  .query("inventory")
  .withIndex("by_branch_variant", (q) =>
    q.eq("branchId", args.branchId).eq("variantId", args.variantId)
  )
  .unique();

if (!inv || inv.quantity <= 0) {
  // Fetch alternative branches with stock
  throw new ConvexError({ code: "OUT_OF_STOCK", message: "..." });
}

// Decrement
await ctx.db.patch(inv._id, {
  quantity: inv.quantity - 1,
  updatedAt: Date.now(),
});
```

### Confirmation Code Generation

Generate a 6-character uppercase alphanumeric code prefixed with "RBX-":
```typescript
function generateConfirmationCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I, O, 0, 1 (ambiguity)
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `RBX-${code}`;
}
```

Check uniqueness against existing codes before insert. If collision, regenerate.

### Cron Job — Reservation Expiry

Architecture specifies hourly expiry sweep. Add to existing `convex/crons.ts`:
```typescript
crons.interval(
  "expire-reservations",
  { hours: 1 },
  internal.reservations.expiry.expireReservations
);
```

The internal mutation queries `reservations` where `status === "pending"` AND `expiresAt < Date.now()`, marks them "expired", and restores inventory.

### Phone Validation — Philippine Format

Accept these formats:
- `09XXXXXXXXX` (11 digits, starts with 09)
- `+639XXXXXXXXX` (13 chars, starts with +639)
- With or without spaces/dashes (strip before validation)

Regex: `/^(\+?63|0)9\d{9}$/` after stripping non-digit chars (except leading +).

### Bottom Sheet Pattern — UX Specification

Per UX spec:
- Bottom sheet for reservation form (stays in context, doesn't navigate away)
- 3 fields only: name + phone + confirm button
- "Error prevention > error recovery" — disable "Reserve" if stock gone
- Real-time stock check on reserve tap
- Use shadcn/ui `Sheet` component (already in project) or `Dialog` positioned at bottom

Shadcn Sheet from bottom:
```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

<Sheet open={!!reserveBranch} onOpenChange={(open) => !open && setReserveBranch(null)}>
  <SheetContent side="bottom" className="rounded-t-xl">
    ...form...
  </SheetContent>
</Sheet>
```

Check if `Sheet` component exists in `components/ui/`. If not, install: `npx shadcn@latest add sheet`.

### Confirmation Page — Countdown Timer

Display a live countdown to expiry:
```typescript
function useCountdown(expiresAt: number) {
  const [remaining, setRemaining] = useState(expiresAt - Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(expiresAt - Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return remaining;
}
```

Format as "Xh Ym remaining" or "Expired" if <= 0.

### Branch Staff Reservations Page

- Route: `app/branch/reservations/page.tsx`
- Auth: `requireRole(ctx, [...BRANCH_MANAGEMENT_ROLES, ...POS_ROLES])` — managers and cashiers can view
- Data: `listBranchReservations` uses `withBranchScope` for branch isolation
- Display: filter tabs for status, action buttons for fulfill/cancel
- Follow existing branch page patterns (check `app/branch/` for layout conventions)

### Existing Patterns from Stories 8.1/8.2/8.3 (MUST Follow)

- All public queries in `convex/catalog/publicBrowse.ts` — NO auth, filter `isActive` only
- `"use client"` directive on all interactive pages
- `useQuery` from `convex/react` + `api` from `@/convex/_generated/api`
- `useMutation` from `convex/react` for write operations
- Loading: `=== undefined` → skeleton, empty array → empty state
- Touch targets: 44px minimum (`min-h-[44px]`)
- `cn()` from `@/lib/utils` for conditional classes
- `formatPrice()` from `@/lib/utils` for centavos → ₱ display
- Toast: `import { toast } from "sonner"`
- Loading skeletons with `animate-pulse rounded bg-muted`
- `rounded-lg border` card pattern (no shadcn Card component)
- Error boundary pattern: `error.tsx` in route directory
- `ConvexError` with typed error codes for all mutations
- Audit logging via `_logAuditEntry` for staff mutations

### Error Handling — ConvexError Codes

Use existing error code pattern from architecture:
- `OUT_OF_STOCK` — variant not available at selected branch
- `INVALID_INPUT` — name or phone validation failed
- `NOT_FOUND` — reservation not found (for confirmation lookup)
- `RESERVATION_EXPIRED` — trying to fulfill an expired reservation
- `UNAUTHORIZED` — for staff mutations if role check fails

### Real-Time Stock Check on Reserve Tap (AC 2)

The UX spec is explicit: "real-time check on reserve tap; show alternative branches". This means:
1. When user taps "Reserve" on a branch → the mutation does a fresh stock check
2. If stock is 0 (sold since page loaded), the error response includes alternative branches
3. The frontend shows: "Item no longer available at {branch}. Available at: {list of branches with stock}"

### Project Structure Notes

- `convex/reservations/` — NEW directory (follow `convex/transfers/` pattern for feature modules)
- `convex/reservations/reservations.ts` — public mutation for creating reservations
- `convex/reservations/manage.ts` — branch staff queries/mutations
- `convex/reservations/expiry.ts` — internal expiry function
- `app/(customer)/reserve/[confirmationCode]/page.tsx` — confirmation page
- `app/branch/reservations/page.tsx` — staff management page
- `components/shared/BranchStockDisplay.tsx` — MODIFY to add reserve button callback

### Files That Already Exist (DO NOT Recreate)

- `convex/schema.ts` — MODIFY to add reservations table
- `convex/catalog/publicBrowse.ts` — DO NOT modify (reservation queries go in reservations/)
- `convex/crons.ts` — MODIFY to add expiry cron
- `app/(customer)/browse/style/[styleId]/page.tsx` — MODIFY to add reservation flow
- `components/shared/BranchStockDisplay.tsx` — MODIFY to add reserve callback
- `lib/routes.ts` — `/reserve(.*)` already in PUBLIC_ROUTES, do NOT modify
- `convex/_helpers/permissions.ts` — reference for role constants, do NOT modify
- `convex/_helpers/auditLog.ts` — use `_logAuditEntry` for staff mutations

### Files to Create

- `convex/reservations/reservations.ts` (CREATE — public reservation mutation + confirmation query)
- `convex/reservations/manage.ts` (CREATE — branch staff queries/mutations)
- `convex/reservations/expiry.ts` (CREATE — internal expiry function)
- `app/(customer)/reserve/[confirmationCode]/page.tsx` (CREATE — confirmation page)
- `app/(customer)/reserve/[confirmationCode]/error.tsx` (CREATE — error boundary)
- `app/branch/reservations/page.tsx` (CREATE — staff management page)

### Files to Modify

- `convex/schema.ts` (MODIFY — add reservations table)
- `convex/crons.ts` (MODIFY — add expire-reservations cron)
- `app/(customer)/browse/style/[styleId]/page.tsx` (MODIFY — add reserve flow + bottom sheet)
- `components/shared/BranchStockDisplay.tsx` (MODIFY — add onReserve callback + reserve buttons)

### Deferred / Out of Scope

- **SMS confirmation** — AC mentions "sends SMS confirmation" but architecture uses Resend (email). SMS integration is not set up. For MVP: show confirmation page with code. SMS can be a follow-up.
- **Payment integration** — AC explicitly says "without paying upfront". PayMongo is deferred (Phase 4+).
- **"Notify Me When Available"** — already a placeholder from Story 8.2, not part of 8.4 ACs.
- **Reservation history page** — customers can only view by confirmation code, no account-based history.
- **Multiple quantity** — MVP reserves 1 unit. Multi-quantity can be added later.

### Previous Story Intelligence (8.3 Branch Finder)

Key learnings from Story 8.3:
- Code review found audit log incomplete (H1) — ensure ALL new fields are included in audit logs for staff mutations
- `hourCycle: "h23"` preferred over `hour12: false` for Intl.DateTimeFormat
- Convex `db.patch` ignores `undefined` values — use empty string `""` for clearable string fields
- Phone field added to branches schema (Story 8.3) — branches now have contact info
- `listActiveBranchesPublic` query already returns branch address — can be used for confirmation page display

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 8, Story 8.4 ACs]
- [Source: `_bmad-output/planning-artifacts/architecture.md` lines 551-553 — reservations module structure]
- [Source: `_bmad-output/planning-artifacts/architecture.md` lines 806-811 — expireReservations cron]
- [Source: `_bmad-output/planning-artifacts/architecture.md` lines 891-896 — reservation email pattern]
- [Source: `_bmad-output/planning-artifacts/architecture.md` lines 228-232 — ConvexError codes]
- [Source: `_bmad-output/planning-artifacts/architecture.md` lines 656-665 — customer route structure]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` lines 571-579 — Reserve-for-Pickup mechanic]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` lines 876-917 — Jessa journey flow]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` lines 1301-1331 — form patterns]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` lines 1246-1270 — touch targets]
- [Source: `convex/schema.ts` — current schema without reservations table]
- [Source: `convex/crons.ts` — existing cron pattern]
- [Source: `convex/catalog/publicBrowse.ts` — public query pattern]
- [Source: `convex/_helpers/permissions.ts` — role constants]
- [Source: `lib/routes.ts` line ~41 — /reserve already in PUBLIC_ROUTES]
- [Source: `components/shared/BranchStockDisplay.tsx` — branch stock component to extend]
- [Source: `app/(customer)/browse/style/[styleId]/page.tsx` — product detail page to modify]
- [Source: Story 8.3 dev notes — audit log completeness, phone validation patterns]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- Convex codegen: passed after schema change (Task 1) and after all backend files (Task 9)
- TypeScript: `npx tsc --noEmit` — 0 errors
- Linting: `npx next lint` — 0 warnings/errors
- Code review: 2 HIGH, 3 MEDIUM issues found and auto-fixed

### Completion Notes List

- Reservation creation is fully public (no auth) — follows `publicBrowse.ts` pattern
- Stock locking uses atomic check + decrement in Convex transactional mutation
- Confirmation codes use "RBX-" prefix with 6-char alphanumeric (no ambiguous chars I/O/0/1)
- Philippine phone validation: `/^(\+?63|0)9\d{9}$/` after stripping spaces/dashes
- OUT_OF_STOCK error includes alternative branches for frontend display
- Hourly cron job expires pending reservations and restores inventory
- Branch staff page uses filter tabs with inline fulfill/cancel actions
- Cancel includes inline confirmation UI (Confirm/No buttons)
- Sheet component installed via `npx shadcn@latest add sheet`
- SMS confirmation deferred — MVP shows confirmation page with code

### Code Review Fixes Applied

- **H1**: Added toast success/error feedback to branch staff fulfill/cancel handlers (was silently swallowing errors)
- **H2**: Added expiry time check in `fulfillReservation` — auto-expires and restores stock if past 24h before cron cleanup
- **M1**: Added 60-second periodic refresh for countdown values in branch reservations page
- **M2**: Added `.slice(0, 200)` limit to `listBranchReservations` to prevent performance degradation
- **M3**: Changed schema `status` from `v.string()` to `v.union(v.literal(...))` for type safety (and updated `statusFilter` arg to match)

### File List

**Created:**
- `convex/reservations/reservations.ts` — public reservation mutation + confirmation query
- `convex/reservations/manage.ts` — branch staff queries/mutations (list, fulfill, cancel)
- `convex/reservations/expiry.ts` — internal expiry mutation for cron
- `app/(customer)/reserve/[confirmationCode]/page.tsx` — reservation confirmation page
- `app/(customer)/reserve/[confirmationCode]/error.tsx` — error boundary
- `app/branch/reservations/page.tsx` — branch staff reservations management page
- `components/ui/sheet.tsx` — shadcn Sheet component (installed via CLI)

**Modified:**
- `convex/schema.ts` — added `reservations` table with 10 fields, 5 indexes
- `convex/crons.ts` — added hourly `expire-reservations` cron job
- `app/(customer)/browse/style/[styleId]/page.tsx` — added reservation flow + bottom sheet
- `components/shared/BranchStockDisplay.tsx` — added `onReserve` callback prop + Reserve buttons
- `app/branch/layout.tsx` — added Reservations nav item with CalendarCheck icon

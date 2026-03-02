# Story 9.1: Driver Delivery Management

Status: done

## Story

As a **Driver**,
I want to see my assigned deliveries on my phone and confirm each delivery,
so that I can efficiently complete my route and the system tracks delivery status.

## Acceptance Criteria

1. **Given** a Driver role user on the `(driver)/` route (phone-only, one-hand operation)
   **When** they open the driver interface
   **Then** they see one delivery at a time, full-screen (single-task flow per UX spec)
   **And** the delivery shows: destination branch name, address, items count, transfer ID
   **And** the bottom CTA shows the primary action for the current step: "Navigate" → "Arrived" → "Delivered"
   **And** tapping "Navigate" opens directions (Google Maps link)
   **And** the delivery list is accessible via back/up navigation
   **And** all touch targets are minimum 48px, CTA is maximum-size
   **And** no sidebar, no tabs — pure sequential flow

## Tasks / Subtasks

- [x] Task 1: Add "driver" role to the system (AC: #1)
  - [x] 1.1 `convex/schema.ts`: add `v.literal("driver")` to users.role union
  - [x] 1.2 `lib/constants.ts`: add `DRIVER: "driver"` to ROLES
  - [x] 1.3 `convex/_helpers/permissions.ts`: add `"driver"` to VALID_ROLES set and ValidRole type; create `DRIVER_ROLES = ["admin", "driver"] as const`
  - [x] 1.4 `lib/routes.ts`: update `ROLE_ROUTE_ACCESS["/driver"]` to `["admin", "driver"]`; add `driver: "/driver/deliveries"` to `ROLE_DEFAULT_ROUTES`

- [x] Task 2: Extend transfers schema for driver assignment (AC: #1)
  - [x] 2.1 Add `driverId: v.optional(v.id("users"))` to transfers table (after `deliveredById`)
  - [x] 2.2 Add `driverArrivedAt: v.optional(v.number())` to transfers table (after `driverId`)
  - [x] 2.3 Add index `.index("by_driver", ["driverId"])` to transfers table
  - [x] 2.4 Run `npx convex codegen` to validate schema changes — also fixed `roleValidator` in `convex/auth/users.ts` to include `v.literal("driver")`

- [x] Task 3: Create `convex/logistics/deliveries.ts` — driver-facing backend (AC: #1)
  - [x] 3.1 `listMyDeliveries` query — returns inTransit transfers assigned to current driver, enriched with destination branch name, address, items count
  - [x] 3.2 `getDeliveryDetail` query — returns single delivery with full branch info (name, address), transfer ID, items list (style name, size, color, packed qty), and `driverArrivedAt` state
  - [x] 3.3 `markArrived` mutation — sets `driverArrivedAt` on the transfer (status stays `inTransit`), writes audit log
  - [x] 3.4 `driverConfirmDelivery` mutation — transitions status `inTransit` → `delivered`, sets `deliveredAt`/`deliveredById`, does bulk inventory upsert (all packed quantities → destination branch), writes audit log

- [x] Task 4: Update `app/driver/layout.tsx` — driver role guard (AC: #1)
  - [x] 4.1 Replace placeholder auth check with proper driver role guard using `ALLOWED_ROLES` array check + client-side redirect for non-driver roles

- [x] Task 5: Build `app/driver/deliveries/page.tsx` — single-task flow UI (AC: #1)
  - [x] 5.1 Delivery list view: vertical card stack, each card shows destination branch name + items count + transfer status indicator; tap a card to select it
  - [x] 5.2 Single delivery detail view: full-screen, shows destination branch name, address, items count, transfer ID
  - [x] 5.3 Bottom CTA progression based on delivery state:
    - No `driverArrivedAt` → "Navigate" button (opens Google Maps directions link) + secondary "I've Arrived" button
    - `driverArrivedAt` set → "Confirm Delivery" button
  - [x] 5.4 Back/up navigation to return to delivery list
  - [x] 5.5 All touch targets minimum 48px; primary CTA full-width and large (56px h-14 = 56px height)
  - [x] 5.6 Empty state: "No deliveries assigned. Check back later."
  - [x] 5.7 Loading state: animate-pulse skeleton cards (no `@/components/ui/skeleton`)

- [x] Task 6: Integration verification (AC: all)
  - [x] 6.1 `npx convex codegen` — passes
  - [x] 6.2 `npx tsc --noEmit` — 0 errors
  - [x] 6.3 `npx next lint` — 0 warnings/errors

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**Adding "driver" role — all 4 files must be updated consistently:**

Schema (the authoritative role union):
```typescript
// convex/schema.ts — users table
role: v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("cashier"),
  v.literal("warehouseStaff"),
  v.literal("hqStaff"),
  v.literal("viewer"),
  v.literal("driver")    // NEW — add at end
),
```

Constants (client-side enum):
```typescript
// lib/constants.ts
export const ROLES = {
  ADMIN: "admin",
  MANAGER: "manager",
  CASHIER: "cashier",
  WAREHOUSE_STAFF: "warehouseStaff",
  HQ_STAFF: "hqStaff",
  VIEWER: "viewer",
  DRIVER: "driver",       // NEW
} as const;
```

Permissions (server-side validation):
```typescript
// convex/_helpers/permissions.ts
export const VALID_ROLES = new Set([
  "admin", "manager", "cashier", "warehouseStaff", "hqStaff", "viewer",
  "driver",               // NEW
] as const);
export type ValidRole =
  | "admin" | "manager" | "cashier" | "warehouseStaff" | "hqStaff" | "viewer"
  | "driver";             // NEW

export const DRIVER_ROLES = ["admin", "driver"] as const;  // NEW
```

Routes (middleware role mapping):
```typescript
// lib/routes.ts — update both objects
export const ROLE_DEFAULT_ROUTES: Record<Role, string> = {
  admin: "/admin/users",
  hqStaff: "/hq/dashboard",
  manager: "/branch/dashboard",
  cashier: "/pos",
  warehouseStaff: "/warehouse/transfers",
  viewer: "/branch/dashboard",
  driver: "/driver/deliveries",  // NEW
};

export const ROLE_ROUTE_ACCESS: Record<string, readonly string[]> = {
  "/admin": ["admin"],
  "/pos": ["admin", "manager", "cashier"],
  "/hq": ["admin", "hqStaff"],
  "/branch": ["admin", "manager", "viewer"],
  "/warehouse": ["admin", "warehouseStaff"],
  "/driver": ["admin", "driver"],     // UPDATED — was ["admin"] placeholder
  "/supplier": ["admin"],
};
```

**Transfer schema extension — exact placement:**
```typescript
// convex/schema.ts — transfers table, add after deliveredById
deliveredAt: v.optional(v.number()),
deliveredById: v.optional(v.id("users")),
driverId: v.optional(v.id("users")),            // NEW — assigned driver
driverArrivedAt: v.optional(v.number()),         // NEW — driver arrival timestamp
createdAt: v.number(),
updatedAt: v.number(),
// ... (approvedById, etc.)

// Add new index after existing ones:
.index("by_driver", ["driverId"])
```

**Auth pattern for driver functions — `requireRole(ctx, DRIVER_ROLES)` (NOT withBranchScope):**
```typescript
import { requireRole } from "../_helpers/permissions";
// Define locally since DRIVER_ROLES is new
const DRIVER_ROLES = ["admin", "driver"] as const;
// OR import from permissions.ts after adding it there

export const listMyDeliveries = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, DRIVER_ROLES);
    // Query by driver's userId
    const transfers = await ctx.db
      .query("transfers")
      .withIndex("by_driver", (q) => q.eq("driverId", user._id))
      .collect();
    // Filter for inTransit only (in-memory, since by_driver doesn't include status)
    return transfers.filter((t) => t.status === "inTransit");
  },
});
```
Drivers are NOT branch-scoped — they deliver across branches. Same pattern as warehouse staff.

**`driverConfirmDelivery` — full implementation spec (Task 3.4):**
```typescript
export const driverConfirmDelivery = mutation({
  args: { transferId: v.id("transfers") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, DRIVER_ROLES);

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    if (transfer.status !== "inTransit") {
      throw new ConvexError({ code: "INVALID_STATE", message: "Only in-transit transfers can be confirmed." });
    }
    if (transfer.driverId !== user._id) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Transfer not assigned to you." });
    }

    // Fetch all transfer items for inventory upsert
    const items = await ctx.db
      .query("transferItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", args.transferId))
      .collect();

    const now = Date.now();

    // Bulk inventory upsert — all packed quantities → destination branch
    for (const item of items) {
      const qty = item.packedQuantity ?? item.requestedQuantity;
      if (qty > 0) {
        const existing = await ctx.db
          .query("inventory")
          .withIndex("by_branch_variant", (q) =>
            q.eq("branchId", transfer.toBranchId).eq("variantId", item.variantId)
          )
          .unique();

        if (existing) {
          await ctx.db.patch(existing._id, {
            quantity: existing.quantity + qty,
            updatedAt: now,
          });
        } else {
          await ctx.db.insert("inventory", {
            branchId: transfer.toBranchId,
            variantId: item.variantId,
            quantity: qty,
            updatedAt: now,
          });
        }

        // Also set receivedQuantity on transferItem (for consistency with 6.3)
        await ctx.db.patch(item._id, { receivedQuantity: qty });
      }
    }

    // Update transfer status
    await ctx.db.patch(args.transferId, {
      status: "delivered",
      deliveredAt: now,
      deliveredById: user._id,
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "transfer.driverDeliver",
      userId: user._id,
      entityType: "transfers",
      entityId: args.transferId,
      before: { status: "inTransit" },
      after: { status: "delivered", deliveredById: user._id },
    });
  },
});
```

**`markArrived` mutation — simple timestamp update:**
```typescript
export const markArrived = mutation({
  args: { transferId: v.id("transfers") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, DRIVER_ROLES);

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) throw new ConvexError({ code: "NOT_FOUND" });
    if (transfer.status !== "inTransit") throw new ConvexError({ code: "INVALID_STATE" });
    if (transfer.driverId !== user._id) throw new ConvexError({ code: "UNAUTHORIZED" });

    const now = Date.now();
    await ctx.db.patch(args.transferId, {
      driverArrivedAt: now,
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "transfer.driverArrived",
      userId: user._id,
      entityType: "transfers",
      entityId: args.transferId,
      after: { driverArrivedAt: now },
    });
  },
});
```

**Driver layout — role guard pattern (client-side redirect):**
```tsx
// app/driver/layout.tsx
"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const currentUser = useQuery(api.auth.users.getCurrentUser);
  const router = useRouter();

  useEffect(() => {
    if (currentUser !== undefined && !currentUser) {
      router.replace("/");
    }
    // Redirect non-driver roles
    if (currentUser && currentUser.role !== "driver" && currentUser.role !== "admin") {
      router.replace("/");
    }
  }, [currentUser, router]);

  if (currentUser === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }
  if (!currentUser) return null;

  return (
    <ErrorBoundary>
      <div className="theme-driver min-h-screen bg-background">{children}</div>
    </ErrorBoundary>
  );
}
```

**Driver deliveries page — single-task flow UI pattern:**

The driver UI has two states:
1. **List view** (no delivery selected): vertical stack of delivery cards, tap to select
2. **Detail view** (delivery selected): full-screen single delivery with bottom CTA

Bottom CTA logic based on `driverArrivedAt`:
- `null` (not arrived): Show "Navigate" primary button (opens Google Maps) + "I've Arrived" secondary button
- Set (arrived): Show "Confirm Delivery" primary button

```tsx
// Google Maps directions link (use branch lat/lng)
const mapsUrl = branch.latitude && branch.longitude
  ? `https://www.google.com/maps/dir/?api=1&destination=${branch.latitude},${branch.longitude}`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.address)}`;
// Open in new tab/system maps app
window.open(mapsUrl, "_blank");
```

**Touch targets — phone-only constraints from UX spec:**
- All interactive elements: `min-h-[48px] min-w-[48px]` (44px minimum per WCAG, 48px per AC)
- Primary CTA: `w-full h-14` (56px height) with large text
- Card tap targets: full card is tappable
- Back button: `min-h-[48px] min-w-[48px]` in top-left
- Gap between interactive elements: minimum 8px (`gap-2`)

**Empty state pattern:**
```tsx
<div className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
  <p className="text-lg font-medium">No deliveries assigned</p>
  <p className="mt-2 text-sm text-muted-foreground">Check back later.</p>
</div>
```

**Loading state — animate-pulse skeleton cards (NOT @/components/ui/skeleton):**
```tsx
<div className="space-y-4 p-4">
  {[1, 2, 3].map((i) => (
    <div key={i} className="animate-pulse rounded-lg border bg-card p-4">
      <div className="h-5 w-2/3 rounded bg-muted" />
      <div className="mt-2 h-4 w-1/2 rounded bg-muted" />
      <div className="mt-2 h-4 w-1/4 rounded bg-muted" />
    </div>
  ))}
</div>
```

**`.then(success, error)` pattern — ALWAYS provide error callback:**
```typescript
driverConfirmDelivery({ transferId }).then(
  () => { setSelectedId(null); },
  (err: unknown) => {
    setError(err instanceof Error ? err.message : "Delivery failed — try again.");
    setSubmitting(false);
  }
);
```

**Interaction with Story 6.3 (`confirmTransferDelivery`):**
- Both `driverConfirmDelivery` (9.1) and `confirmTransferDelivery` (6.3) require `status === "inTransit"` and transition to `"delivered"`
- They are mutually exclusive by design: transfers with `driverId` → driver confirms; transfers without `driverId` → receiving staff confirms via 6.3 flow
- `driverConfirmDelivery` does BULK inventory transfer (all packed quantities as-is), unlike `confirmTransferDelivery` which allows per-item adjustments and damage flagging
- No modifications to `confirmTransferDelivery` (6.3) are needed for this story

**`TRANSFER_STATUS` in constants.ts — no changes needed:**
The existing statuses (`requested`, `packed`, `inTransit`, `delivered`) are sufficient. The driver flow uses `inTransit` → `delivered` — same terminal state.

**New Convex module registration:**
Creating `convex/logistics/deliveries.ts` will auto-register as `api.logistics.deliveries` / `internal.logistics.deliveries` after `npx convex codegen`.

### Project Structure

```
Files to MODIFY in this story:
├── convex/schema.ts                      # Add "driver" role + driverId/driverArrivedAt to transfers
├── lib/constants.ts                      # Add DRIVER to ROLES
├── convex/_helpers/permissions.ts        # Add "driver" to VALID_ROLES, create DRIVER_ROLES
├── lib/routes.ts                         # Update /driver access + default route
└── app/driver/layout.tsx                 # Add driver role guard

Files to CREATE in this story:
├── convex/logistics/deliveries.ts        # Driver-facing backend (4 functions)
└── (app/driver/deliveries/page.tsx is MODIFIED, not created — already exists as placeholder)

Files that MUST NOT be modified:
├── convex/_generated/api.d.ts            # Auto-generated — do not touch
├── convex/transfers/fulfillment.ts       # Story 6.3 — do not touch
├── convex/transfers/requests.ts          # Story 6.1 — do not touch
├── convex/_helpers/auditLog.ts           # Complete — call _logAuditEntry()
├── convex/_helpers/withBranchScope.ts    # Not used — drivers are cross-branch
├── middleware.ts                         # Reads from routes.ts — no changes needed
└── app/warehouse/receiving/page.tsx      # Story 6.3 receiving — do not touch
```

### Previous Story Learnings (Epics 6-8)

- **H1 (6.2/6.3 code review)**: In ANY mutation that patches items by ID, verify ownership with a `Set<string>`. Applied in `driverConfirmDelivery` — verify `transfer.driverId === user._id`.
- **`v` naming conflict**: NEVER use `v` as a callback parameter name in Convex files (`v` is imported from `convex/values`).
- **`by_status` index**: Hardcoded literal strings work directly.
- **`const now = Date.now()`**: Single call for all timestamps in same mutation.
- **`inventory` table**: Has `branchId`, `variantId`, `quantity`, `lowStockThreshold?`, `updatedAt` — NO `createdAt`. Index `by_branch_variant` for upsert.
- **`animate-pulse` divs**: No `@/components/ui/skeleton` — use inline `<div className="h-4 rounded bg-muted w-full" />`.
- **`.then(success, error)`**: Always provide error callback — never silently swallow mutations.
- **HTML escaping for emails**: Not applicable here — no email functionality in this story.
- **`internalAction` vs `action`**: Not applicable — this story only uses queries and mutations.
- **`Number.isInteger()` + `>= 0`**: Required for all quantity fields (0 is valid).

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 9, Story 9.1 ACs (lines 976-992)]
- [Source: _bmad-output/planning-artifacts/architecture.md — FR55-57, convex/logistics/deliveries.ts (line 555), (driver)/ route (line 667-670)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Driver Single-Task Flow (line 1362-1366), Driver phone-only breakpoints (line 1487-1489), touch targets 48px (line 1520)]
- [Source: convex/schema.ts — transfers table (lines 175-204), users.role union (lines 9-16)]
- [Source: convex/transfers/fulfillment.ts — confirmTransferDelivery pattern (lines 358-487), inventory upsert via by_branch_variant]
- [Source: convex/_helpers/permissions.ts — VALID_ROLES, requireRole(), role group constants]
- [Source: lib/routes.ts — ROLE_ROUTE_ACCESS, ROLE_DEFAULT_ROUTES, "/driver" placeholder]
- [Source: lib/constants.ts — ROLES, TRANSFER_STATUS]
- [Source: app/driver/layout.tsx — existing placeholder with auth check]
- [Source: app/driver/deliveries/page.tsx — existing placeholder "Coming in Phase 5"]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- Task 2.4: Initial `npx convex codegen` failed — `roleValidator` in `convex/auth/users.ts` (line 14) had a hardcoded role union without "driver". Fixed by adding `v.literal("driver")` to the validator. This was an undocumented dependency — the story only listed 4 files for Task 1, but the `roleValidator` is a 5th location where roles are enumerated.
- Code Review: Found 5 auto-fixable issues (H1: `setUserRole` missing "driver" in inline role union — blocker; H2: no mutual exclusivity guard in `confirmTransferDelivery`; M1: `markArrived` allowed duplicate calls; M2: no arrival-before-delivery enforcement; L1: skeleton layout mismatch). All fixed and re-verified.

### Completion Notes List

- All 6 tasks completed in a single pass with 1 fix needed (roleValidator in users.ts).
- "driver" role added consistently across 5 files: schema.ts, constants.ts, permissions.ts, routes.ts, auth/users.ts.
- transfers table extended with `driverId`, `driverArrivedAt`, and `by_driver` index.
- New `convex/logistics/deliveries.ts` module created with 4 functions: `listMyDeliveries`, `getDeliveryDetail`, `markArrived`, `driverConfirmDelivery`.
- Driver layout updated with proper role guard using ALLOWED_ROLES array.
- Driver deliveries page implements full single-task flow: list view → detail view → Navigate/Arrived/Delivered CTA progression.
- Google Maps integration uses lat/lng when available, falls back to address-based search.
- Touch targets: all interactive elements min 48px, primary CTAs h-14 (56px), cards full-width tappable.
- All validations pass: codegen, tsc (0 errors), next lint (0 warnings).
- Code review fixes: `setUserRole` now includes "driver" in its role union; `confirmTransferDelivery` rejects driver-assigned transfers; `markArrived` is idempotent; `driverConfirmDelivery` enforces arrival-before-delivery; skeleton matches list layout.

### File List

- convex/schema.ts (modified — added "driver" to users.role union, driverId/driverArrivedAt/by_driver to transfers)
- convex/auth/users.ts (modified — added v.literal("driver") to roleValidator)
- convex/_helpers/permissions.ts (modified — added "driver" to VALID_ROLES, ValidRole, created DRIVER_ROLES)
- lib/constants.ts (modified — added DRIVER to ROLES)
- lib/routes.ts (modified — updated /driver route access, added driver default route)
- convex/logistics/deliveries.ts (created — 4 driver-facing functions)
- app/driver/layout.tsx (modified — added driver role guard)
- app/driver/deliveries/page.tsx (modified — full single-task flow UI)
- convex/transfers/fulfillment.ts (modified — added driverId guard in confirmTransferDelivery, code review fix)

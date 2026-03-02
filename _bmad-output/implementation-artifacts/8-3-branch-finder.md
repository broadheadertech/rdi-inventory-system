# Story 8.3: Branch Finder

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Customer**,
I want to find RedBox branches near me,
so that I can visit the closest store that has what I'm looking for.

## Acceptance Criteria

1. **Given** a customer navigates to the branch finder
   **When** the branch list loads
   **Then** all active branches are displayed with name, address, and contact info

2. **And** if the customer shares their location, branches are sorted by distance

3. **And** each branch card shows a brief status (open/closed if business hours are configured)

4. **And** tapping a branch shows directions (link to Google Maps)

## Tasks / Subtasks

- [x] Task 1: Extend `branches` schema with phone, coordinates, and business hours (AC: 1, 2, 3)
  - [x] 1.1 Add optional fields to `branches` table in `convex/schema.ts`: `phone: v.optional(v.string())`, `latitude: v.optional(v.number())`, `longitude: v.optional(v.number())`
  - [x] 1.2 Extend `configuration` object to include `businessHours: v.optional(v.object({ openTime: v.string(), closeTime: v.string() }))` — times in 24hr format ("09:00", "21:00")
  - [x] 1.3 Run `npx convex codegen` to regenerate types after schema change

- [x] Task 2: Update `createBranch` and `updateBranch` mutations in `convex/auth/branches.ts` (AC: 1, 2, 3)
  - [x] 2.1 Add `phone: v.optional(v.string())`, `latitude: v.optional(v.number())`, `longitude: v.optional(v.number())` to `createBranch` args
  - [x] 2.2 Update `createBranch` handler to spread new fields into `ctx.db.insert` and include in audit log
  - [x] 2.3 Add same new fields to `updateBranch` args
  - [x] 2.4 Update `configuration` validator in both mutations to include `businessHours` sub-object
  - [x] 2.5 The `updateBranch` handler already uses `ctx.db.patch` with spread — new optional fields will work automatically

- [x] Task 3: Extend admin branch management UI (AC: 1, 2, 3) — `app/admin/branches/page.tsx`
  - [x] 3.1 Add phone number input to the branch create/edit form
  - [x] 3.2 Add latitude/longitude inputs (two number fields) to the form
  - [x] 3.3 Add business hours inputs (openTime + closeTime, both `<input type="time">`) to the form
  - [x] 3.4 Ensure new fields display in the branch table list view
  - [x] 3.5 Ensure edit mode pre-fills the new fields from existing branch data

- [x] Task 4: Create `listActiveBranchesPublic` query in `convex/catalog/publicBrowse.ts` (AC: 1, 2, 3)
  - [x] 4.1 Public query (no auth) with no args
  - [x] 4.2 Filter `isActive === true`, return: `_id`, `name`, `address`, `phone`, `latitude`, `longitude`, `configuration` (for businessHours)
  - [x] 4.3 Sort alphabetically by name (client-side sorts by distance when location available)
  - [x] 4.4 Do NOT return `createdAt`, `updatedAt` — follow established public query pattern

- [x] Task 5: Create branch finder page at `app/(customer)/branches/page.tsx` (AC: 1, 2, 3, 4)
  - [x] 5.1 Create directory `app/(customer)/branches/`
  - [x] 5.2 "use client" page using `useQuery` for `listActiveBranchesPublic`
  - [x] 5.3 Page title "Find a Branch" with page description
  - [x] 5.4 Loading skeleton mimicking branch card grid
  - [x] 5.5 Geolocation prompt: "Enable location to sort by nearest" button — uses `navigator.geolocation.getCurrentPosition()`, stores lat/lng in state
  - [x] 5.6 When user location available, sort branches by Haversine distance (client-side)
  - [x] 5.7 When no location, sort alphabetically by name (default from query)
  - [x] 5.8 Branch card grid: responsive `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
  - [x] 5.9 Each branch card renders: name, address, phone (if set), open/closed status (if businessHours configured), distance (if user location available), "Get Directions" button
  - [x] 5.10 Open/closed logic: compare current time (in branch timezone or Asia/Manila) against `openTime`/`closeTime` — show green "Open" or red "Closed" badge
  - [x] 5.11 "Get Directions" button: if lat/lng exist, link to `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`; else use `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
  - [x] 5.12 Empty state: "No branches available" message
  - [x] 5.13 Accessibility: semantic `<article>` for cards, `aria-label` on status badges, `target="_blank" rel="noopener noreferrer"` on Maps links

- [x] Task 6: Create `error.tsx` for branches route (robustness)
  - [x] 6.1 Create `app/(customer)/branches/error.tsx` following the pattern from Story 8.2's error boundary

- [x] Task 7: Wire header "All Branches" button to `/branches` (AC: 1)
  - [x] 7.1 In `app/(customer)/layout.tsx`, change the branch selector placeholder `<button>` to a `<Link href="/branches">` — preserving the same styling
  - [x] 7.2 Import `Link` (already imported) — just change the element

- [x] Task 8: Run `npx convex codegen` after all query/mutation changes
- [x] Task 9: Validate TypeScript — `npx tsc --noEmit` → 0 errors
- [x] Task 10: Validate linting — `npx next lint` → 0 warnings
- [x] Task 11: Update this story Status to "review" and sprint-status.yaml to "review"

## Dev Notes

### CRITICAL: Schema Migration — Backward-Compatible

The `branches` table needs new optional fields. Since all new fields are `v.optional(...)`, existing branch records will NOT break — they'll simply have `undefined` for new fields.

**Schema change in `convex/schema.ts` (lines 26-37):**
```typescript
branches: defineTable({
  name: v.string(),
  address: v.string(),
  isActive: v.boolean(),
  phone: v.optional(v.string()),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  configuration: v.optional(
    v.object({
      timezone: v.optional(v.string()),
      businessHours: v.optional(
        v.object({
          openTime: v.string(),  // "09:00" (24hr format)
          closeTime: v.string(), // "21:00" (24hr format)
        })
      ),
    })
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
}),
```

Convex handles schema evolution — adding optional fields does NOT require data migration.

### Admin Mutation Updates — Pattern

The `createBranch` mutation at `convex/auth/branches.ts` (line 26) currently accepts: `name`, `address`, `configuration`. Add: `phone`, `latitude`, `longitude`. The handler uses `...args` spread into `ctx.db.insert`, so new fields flow through automatically.

The `updateBranch` mutation at line 57 uses `ctx.db.patch` with spread — same pattern. Just add new args to the validator.

The `configuration` validator in both mutations needs to be expanded to include `businessHours`:
```typescript
configuration: v.optional(
  v.object({
    timezone: v.optional(v.string()),
    businessHours: v.optional(
      v.object({
        openTime: v.string(),
        closeTime: v.string(),
      })
    ),
  })
),
```

### Public Query — `listActiveBranchesPublic`

```typescript
export const listActiveBranchesPublic = query({
  args: {},
  handler: async (ctx) => {
    // NO auth — public query
    const branches = await ctx.db.query("branches").collect();
    return branches
      .filter((b) => b.isActive)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((b) => ({
        _id: b._id,
        name: b.name,
        address: b.address,
        phone: b.phone,
        latitude: b.latitude,
        longitude: b.longitude,
        businessHours: b.configuration?.businessHours,
        timezone: b.configuration?.timezone,
      }));
  },
});
```

### Client-Side Geolocation + Haversine Distance

Browser Geolocation API (`navigator.geolocation`) is used client-side. No library needed.

```typescript
function useGeolocation() {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, []);

  return { position, error, loading, requestLocation };
}
```

**Haversine formula for distance (km):**
```typescript
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

### Open/Closed Status Logic

Compare current time against branch's `businessHours.openTime` / `closeTime`:
```typescript
function isBranchOpen(
  businessHours: { openTime: string; closeTime: string } | undefined,
  timezone?: string
): { isOpen: boolean; label: string } | null {
  if (!businessHours) return null; // No hours configured — don't show status

  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone ?? "Asia/Manila",
  });
  const currentTime = formatter.format(now); // "14:30"

  const isOpen = currentTime >= businessHours.openTime && currentTime < businessHours.closeTime;
  return {
    isOpen,
    label: isOpen ? "Open" : "Closed",
  };
}
```

### Google Maps Directions Link

No Google Maps API key needed — just external links:
- **With coordinates:** `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
- **Address only fallback:** `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`

### Branch Card Layout

```
┌────────────────────────────────────┐
│ Branch Name              🟢 Open   │
│ 123 Rizal Ave, Manila              │
│ 📞 +63 2 1234 5678                 │
│ 📍 2.3 km away                     │
│                                    │
│        [Get Directions →]          │
└────────────────────────────────────┘
```

Use `rounded-lg border` card pattern (no shadcn Card), `p-4`, `space-y-2` internal layout. MapPin + Navigation2 icons from lucide-react.

### Responsive Layout

```
Mobile (<sm):
┌──────────────────────┐
│ Find a Branch         │
│ [📍 Enable Location] │
├──────────────────────┤
│ ┌──────────────────┐ │
│ │ Branch Card 1    │ │
│ └──────────────────┘ │
│ ┌──────────────────┐ │
│ │ Branch Card 2    │ │
│ └──────────────────┘ │
└──────────────────────┘

Desktop (lg:):
┌──────────────────────────────────┐
│ Find a Branch  [📍 Enable]      │
├──────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐     │
│ │Card 1│ │Card 2│ │Card 3│     │
│ └──────┘ └──────┘ └──────┘     │
│ ┌──────┐ ┌──────┐               │
│ │Card 4│ │Card 5│               │
│ └──────┘ └──────┘               │
└──────────────────────────────────┘
```

### Admin Branch Form Extension

The admin page at `app/admin/branches/page.tsx` uses a form with `name`, `address`, `timezone` fields. Add:
- Phone: `<input type="tel" placeholder="+63 2 1234 5678" />`
- Latitude: `<input type="number" step="any" placeholder="14.5995" />`
- Longitude: `<input type="number" step="any" placeholder="120.9842" />`
- Business Hours: `<input type="time" />` for openTime + `<input type="time" />` for closeTime

**Philippine branch coordinates reference (for dev testing):**
- Manila (SM Mall of Asia): 14.5352, 120.9822
- Quezon City (SM North EDSA): 14.6564, 121.0296
- Makati (Greenbelt): 14.5524, 121.0197
- Cebu (SM Cebu): 10.3116, 123.8854

### Header Button Wiring

The customer layout at `app/(customer)/layout.tsx` lines 58-66 has a `<button>` placeholder. Change to:
```tsx
<Link
  href="/branches"
  className="flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm text-muted-foreground hover:bg-accent"
  aria-label="Find branches"
>
  <MapPin className="h-4 w-4" />
  <span className="hidden sm:inline">All Branches</span>
</Link>
```

### Existing Patterns from Stories 8.1/8.2 (MUST Follow)

- All public queries in `convex/catalog/publicBrowse.ts` — NO auth, filter `isActive` only
- `"use client"` directive on all interactive pages
- `useQuery` from `convex/react` + `api` from `@/convex/_generated/api`
- Loading: `=== undefined` → skeleton, empty array → empty state
- Touch targets: 44px minimum (`min-h-[44px]`)
- `cn()` from `@/lib/utils` for conditional classes
- `formatPrice()` from `@/lib/utils` (not needed here — no prices)
- Toast: `import { toast } from "sonner"`
- Loading skeletons with `animate-pulse rounded bg-muted`
- `rounded-lg border` card pattern (no shadcn Card component)
- `ArrowLeft` from `lucide-react` for back navigation (not needed — this is a top-level page)
- `MapPin` from `lucide-react` — already imported in customer layout
- Error boundary pattern: `error.tsx` in route directory

### Files That Already Exist (DO NOT Recreate)

- `convex/catalog/publicBrowse.ts` — ADD new query, do NOT recreate
- `convex/auth/branches.ts` — MODIFY mutations, do NOT recreate
- `convex/schema.ts` — MODIFY branches table, do NOT recreate
- `app/(customer)/layout.tsx` — MODIFY header button, do NOT recreate
- `app/admin/branches/page.tsx` — MODIFY form fields, do NOT recreate
- `lib/routes.ts` — `/branches(.*)` already in PUBLIC_ROUTES, do NOT modify

### Files to Create/Modify

- `convex/schema.ts` (MODIFY — add phone, latitude, longitude, businessHours to branches)
- `convex/auth/branches.ts` (MODIFY — extend createBranch/updateBranch args)
- `convex/catalog/publicBrowse.ts` (MODIFY — add listActiveBranchesPublic query)
- `app/admin/branches/page.tsx` (MODIFY — add form fields for new branch data)
- `app/(customer)/branches/page.tsx` (CREATE — branch finder page)
- `app/(customer)/branches/error.tsx` (CREATE — error boundary)
- `app/(customer)/layout.tsx` (MODIFY — wire header button to /branches)

### No Embedded Map for MVP

The AC says "tapping a branch shows directions (link to Google Maps)" — this is an external link, NOT an embedded map. No map library (Leaflet, Mapbox, Google Maps SDK) needed. The UX spec mentions a "Map view (customer)" variant for BranchStockDisplay but that's aspirational and NOT in the ACs.

### Deferred / Out of Scope

- **Embedded map view** — not in ACs, would require map library
- **Update BranchStockDisplay distance sorting** — deferred from 8.2, not in 8.3 ACs (can be a follow-up)
- **Branch search/filter** — not in ACs, branches count (~20) is small enough for a simple list
- **"Incoming Transfer" blue status** — still requires auth for transfer data

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` lines 922-935 — Story 8.3 ACs and user story]
- [Source: `_bmad-output/planning-artifacts/architecture.md` lines 656-664 — Route structure, `(customer)/branches/page.tsx`]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` — BranchStockDisplay variants, customer persona Jessa, mobile-first]
- [Source: `convex/schema.ts` lines 26-37 — Current branches table (no lat/lng/phone/hours)]
- [Source: `convex/auth/branches.ts` — createBranch/updateBranch mutations with current args]
- [Source: `convex/catalog/publicBrowse.ts` — Public query patterns, no auth, isActive filter]
- [Source: `app/(customer)/layout.tsx` lines 58-66 — Branch selector placeholder for Story 8.3]
- [Source: `lib/routes.ts` line 41 — `/branches(.*)` already in PUBLIC_ROUTES]
- [Source: Story 8.2 — Distance sorting deferred, BranchStockDisplay component, error.tsx pattern]
- [Source: Story 8.1 — Customer layout, navigation patterns, loading skeletons, card patterns]
- [Source: `_bmad-output/planning-artifacts/implementation-readiness-report` MED-10 — Geolocation missing from schema]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- TypeScript error: `distance` variable typed as `{}` from `"in" operator narrowing` — fixed by using explicit `number | null` annotation with direct Haversine calculation

### Completion Notes List

- Extended `branches` schema with optional `phone`, `latitude`, `longitude`, and `businessHours` (openTime/closeTime in 24hr format)
- Updated `createBranch` and `updateBranch` mutations to accept new fields — existing `...args` spread handles persistence automatically
- Extended admin branch management UI with phone, lat/lng, business hours inputs in both create and edit dialogs, plus table columns
- Created `listActiveBranchesPublic` query — no auth, filters active, returns flattened businessHours/timezone from configuration
- Created branch finder page with geolocation (Haversine distance sorting), open/closed status (Intl.DateTimeFormat timezone-aware), Google Maps directions links, responsive grid, loading skeleton, empty state, and accessibility
- Created error boundary for branches route
- Wired header "All Branches" placeholder button to `/branches` Link
- All validations pass: codegen, tsc (0 errors), lint (0 warnings)

### File List

- `convex/schema.ts` (MODIFIED — added phone, latitude, longitude, businessHours to branches table)
- `convex/auth/branches.ts` (MODIFIED — extended createBranch/updateBranch args with new fields)
- `convex/catalog/publicBrowse.ts` (MODIFIED — added listActiveBranchesPublic query)
- `app/admin/branches/page.tsx` (MODIFIED — added form fields, table columns for phone/hours)
- `app/(customer)/branches/page.tsx` (CREATED — branch finder page with geolocation, distance, open/closed, Maps links)
- `app/(customer)/branches/error.tsx` (CREATED — error boundary)
- `app/(customer)/layout.tsx` (MODIFIED — changed header button to Link)

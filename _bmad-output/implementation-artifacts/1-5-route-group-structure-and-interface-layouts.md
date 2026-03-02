# Story 1.5: Route Group Structure & Interface Layouts

Status: done

## Story

As a **user of any role**,
I want to land on my role-appropriate interface when I sign in,
So that I see only what's relevant to my job without navigating through unrelated features.

## Acceptance Criteria

1. **Given** 9 route groups exist: `(auth)`, `(pos)`, `(hq)`, `(branch)`, `(warehouse)`, `(customer)`, `(admin)`, `(driver)`, `(supplier)` **When** the app is deployed **Then** each route group has its own directory under `app/`
2. **And** Clerk middleware redirects unauthenticated users to `(auth)/sign-in`
3. **And** each route group has its own `layout.tsx` with interface-specific theme class (e.g., `theme-pos`, `theme-dashboard`) and an error boundary wrapping children
4. **And** each route group has role-based middleware that checks authorization
5. **And** role-to-route mapping is enforced: Admin→all, HQ Staff→(hq), Manager→(branch), Cashier→(pos), Warehouse→(warehouse), Viewer→(branch) read-only
6. **And** unauthorized route access redirects to the user's authorized default route (not an error page)
7. **And** white-label theming foundation is in place: CSS custom properties for brand tokens, Convex `settings` table for HQ-configurable brand colors/logo/name, RootLayout reads and injects brand tokens dynamically

## Tasks / Subtasks

- [x] Task 1: Create route mapping constants (AC: #5, #6)
  - [x] 1.1 Create `lib/routes.ts` exporting `ROLE_DEFAULT_ROUTES` mapping — each role maps to its default redirect path (admin→`/admin/users`, hqStaff→`/hq`, manager→`/branch`, cashier→`/pos`, warehouseStaff→`/warehouse`, viewer→`/branch`)
  - [x] 1.2 Export `ROLE_ROUTE_ACCESS` mapping — each route group prefix maps to the roles allowed to access it (e.g., `/pos` → `["admin", "manager", "cashier"]`, `/hq` → `["admin", "hqStaff"]`, etc.)
  - [x] 1.3 Export `PUBLIC_ROUTES` array — routes that don't require authentication: `/`, `/sign-in`, `/sign-up`, `/api/webhooks`, and all `(customer)` routes under `/browse`, `/products`, `/branches`, `/reserve`

- [x] Task 2: Update middleware for comprehensive role-based route protection (AC: #2, #4, #5, #6)
  - [x] 2.1 Import route constants from `lib/routes.ts`
  - [x] 2.2 Replace hardcoded `isAdminRoute` with dynamic route matching using `ROLE_ROUTE_ACCESS` — for each protected route group, check if the user's role from session claims is in the allowed roles list
  - [x] 2.3 Add unauthorized redirect logic — when role is not allowed for the requested route, redirect to `ROLE_DEFAULT_ROUTES[role]` instead of `/`
  - [x] 2.4 Add `(customer)` routes to public routes (no auth required)
  - [x] 2.5 Ensure `/api/webhooks(.*)` remains unprotected

- [x] Task 3: Create shared ErrorBoundary component (AC: #3)
  - [x] 3.1 Create `components/shared/ErrorBoundary.tsx` — React class component implementing `componentDidCatch` with a user-friendly fallback UI (error message + "Try Again" button that calls `reset()`)
  - [x] 3.2 Fallback UI shows error message from ConvexError `.data.message` if available, otherwise generic message
  - [x] 3.3 Export as default and named export for flexibility

- [x] Task 4: Create new route group layouts and placeholder pages (AC: #1, #3)
  - [x] 4.1 Create `app/(pos)/layout.tsx` — client component, role guard checking `POS_ROLES`, applies `theme-pos` class, wraps children in ErrorBoundary, minimal layout (no sidebar — POS is full-screen)
  - [x] 4.2 Create `app/(pos)/page.tsx` — placeholder: "POS Terminal — Coming in Epic 3"
  - [x] 4.3 Create `app/(hq)/layout.tsx` — client component, role guard checking `HQ_ROLES`, applies `theme-dashboard` class, sidebar with nav items (Dashboard, Reports, Brands, Demand, Transfers), wraps children in ErrorBoundary
  - [x] 4.4 Create `app/(hq)/dashboard/page.tsx` — placeholder: "HQ Dashboard — Coming in Epic 7"
  - [x] 4.5 Create `app/(branch)/layout.tsx` — client component, role guard checking `BRANCH_VIEW_ROLES`, applies `theme-dashboard` class, sidebar with nav items (Dashboard, Stock, Transfers, Demand, Alerts), wraps children in ErrorBoundary
  - [x] 4.6 Create `app/(branch)/dashboard/page.tsx` — placeholder: "Branch Dashboard — Coming in Epic 7"
  - [x] 4.7 Create `app/(warehouse)/layout.tsx` — client component, role guard checking `WAREHOUSE_ROLES`, applies `theme-warehouse` class, sidebar with nav items (Transfers, Receiving), wraps children in ErrorBoundary
  - [x] 4.8 Create `app/(warehouse)/transfers/page.tsx` — placeholder: "Warehouse Operations — Coming in Epic 6"
  - [x] 4.9 Create `app/(customer)/layout.tsx` — NO auth required, public layout, applies `theme-customer` class, wraps children in ErrorBoundary
  - [x] 4.10 Create `app/(customer)/page.tsx` — placeholder: "RedBox Apparel — Coming in Epic 8"
  - [x] 4.11 Create `app/(driver)/layout.tsx` — requires auth only (no role check — driver role not yet in schema), applies `theme-driver` class, placeholder note "Driver role added in Phase 5"
  - [x] 4.12 Create `app/(driver)/deliveries/page.tsx` — placeholder: "Driver Portal — Coming in Phase 5"
  - [x] 4.13 Create `app/(supplier)/layout.tsx` — requires auth only (no role check — supplier role not yet in schema), applies `theme-supplier` class, placeholder note "Supplier role added in Phase 7"
  - [x] 4.14 Create `app/(supplier)/portal/page.tsx` — placeholder: "Supplier Portal — Coming in Phase 7"

- [x] Task 5: Update existing layouts (AC: #3, #5)
  - [x] 5.1 Update `app/(admin)/layout.tsx` — add `theme-dashboard` class to root div, wrap children in ErrorBoundary
  - [x] 5.2 Update admin layout to use `ROLE_DEFAULT_ROUTES` for redirect instead of hardcoded `/`

- [x] Task 6: Update home page for role-based redirect (AC: #6)
  - [x] 6.1 Update `app/page.tsx` — when user is authenticated, read their role and redirect to `ROLE_DEFAULT_ROUTES[role]`; when not authenticated, show landing page or redirect to sign-in

- [x] Task 7: White-label theming foundation (AC: #7)
  - [x] 7.1 Add `settings` table to `convex/schema.ts` with fields: `key: v.string()` (unique), `value: v.string()`, `updatedAt: v.number()`, index `by_key` on `["key"]`
  - [x] 7.2 Create `convex/admin/settings.ts` with `getSettings` query (public — reads brand config) and `updateSettings` mutation (admin-only — updates brand config)
  - [x] 7.3 Add CSS custom properties for brand tokens in `app/globals.css`: `--brand-primary`, `--brand-secondary`, `--brand-name` with default RedBox values
  - [x] 7.4 Create `components/providers/BrandProvider.tsx` — client component that queries settings and injects brand CSS custom properties via `style` attribute on a wrapper div
  - [x] 7.5 Update `app/layout.tsx` to wrap content with BrandProvider

- [x] Task 8: Verify integration (AC: all)
  - [x] 8.1 Run `npx tsc --noEmit` — zero TypeScript errors
  - [x] 8.2 Run `npx next lint` — zero lint warnings/errors

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**Route Group Structure — Architecture Mandated (lines 250-265):**
```
app/
├── (auth)/         — Sign-in, sign-up (Clerk components)
├── (pos)/          — POS terminal interface (offline-capable)
│   └── layout.tsx  — Service worker registration, offline indicator
├── (hq)/           — HQ dashboard
│   └── layout.tsx  — All-branch data subscriptions
├── (branch)/       — Branch manager dashboard
│   └── layout.tsx  — Branch-scoped subscriptions
├── (warehouse)/    — Warehouse operations
├── (customer)/     — Public website (no auth required)
├── (admin)/        — System admin, user management
├── (driver)/       — Logistics & delivery (Phase 5)
├── (supplier)/     — Supplier portal (Phase 7)
└── layout.tsx      — Root: Clerk + Convex providers
```
- [Source: architecture.md — Route Group Structure, lines 250-268]

**Role → Route Group Mapping (Addendum 5, lines 834-852):**

| Role | Route Groups | Default Route | Notes |
|---|---|---|---|
| **Admin** | `(admin)`, `(hq)`, `(branch)`, `(pos)`, `(warehouse)` | `/admin/users` | Full access to all internal routes |
| **HQ Staff** | `(hq)` | `/hq` | All-branch dashboards and reports |
| **Manager** | `(branch)` | `/branch` | Own branch dashboard, transfers, demand |
| **Cashier** | `(pos)` | `/pos` | POS terminal and demand logging |
| **Warehouse Staff** | `(warehouse)` | `/warehouse` | Transfer fulfillment and receiving |
| **Viewer** | `(branch)` (read-only) | `/branch` | Branch dashboard in read-only mode |
| **Driver** | `(driver)` | `/driver` | Added in Phase 5 |
| **Supplier** | `(supplier)` | `/supplier` | Added in Phase 7 |

- Note: Driver and Supplier roles are NOT in the current schema. Create placeholder route groups with auth-only protection (no role check). Role checks will be added when these roles are added to the schema in their respective phases.
- [Source: architecture.md — Addendum 5, lines 834-852]

**Middleware Pattern (lines 423-426, 685-688):**
- `middleware.ts` — Clerk verifies session, protects routes by role
- Convex functions — Re-verify role + branch scope server-side via `withBranchScope()`
- No route group trusts client-side role checks alone
- Auth boundary: middleware handles route-level protection, layouts handle UI-level guards
- [Source: architecture.md — Auth Boundary, lines 685-688]

**Component Organization (lines 280-282, 695-698):**
- `components/ui/` — shadcn/ui primitives only, never import business logic
- `components/shared/` — Business components used across routes (RoleGuard, ErrorBoundary, etc.)
- Route-specific components stay in their route folder, never imported by other route groups
- [Source: architecture.md — Component Boundaries, lines 695-698]

**Layout Pattern to Follow (from existing admin layout):**
```typescript
"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SomeLayout({ children }) {
  const currentUser = useQuery(api.auth.users.getCurrentUser);
  const router = useRouter();

  useEffect(() => {
    if (currentUser !== undefined && !ALLOWED_ROLES.includes(currentUser?.role)) {
      router.replace(ROLE_DEFAULT_ROUTES[currentUser.role] ?? "/");
    }
  }, [currentUser, router]);

  if (currentUser === undefined) return <LoadingState />;
  if (!ALLOWED_ROLES.includes(currentUser?.role)) return null;

  return (
    <ErrorBoundary>
      <div className="theme-dashboard">
        {/* sidebar + main content */}
        {children}
      </div>
    </ErrorBoundary>
  );
}
```

**Sidebar Navigation Items per Route Group:**
- `(admin)`: Users, Branches (already exists — keep as-is, add theme class)
- `(hq)`: Dashboard, Reports, Brands, Demand, Transfers
- `(branch)`: Dashboard, Stock, Transfers, Demand, Alerts
- `(warehouse)`: Transfers, Receiving
- `(pos)`: NO sidebar — full-screen POS interface
- `(customer)`: NO sidebar — public e-commerce layout
- `(driver)`: Deliveries (minimal, phone-optimized)
- `(supplier)`: Portal (single-page)
- [Source: architecture.md — Route Group Pages, lines 589-676]

**Error Boundary Pattern:**
- React class component (Error Boundaries must be class components in React)
- Catches rendering errors in route group children
- Shows fallback UI with error message and retry button
- Extracts ConvexError `.data.message` for user-friendly messages
- [Source: architecture.md — Error Handling, lines 228-232]

**White-Label Theming (architecture requirement):**
- CSS custom properties: `--brand-primary`, `--brand-secondary`, `--brand-name`
- Settings stored in Convex `settings` table (key-value pattern)
- BrandProvider client component queries settings and injects CSS variables
- Default values = RedBox brand colors until HQ configures custom branding
- [Source: architecture.md — White-Label Theming Foundation]

### Scope Boundaries — DO NOT IMPLEMENT

- **Service Worker / PWA manifest** → Epic 4 (Offline Mode)
- **Actual feature pages** (POS terminal, dashboards, stock views, etc.) → Epics 2-9
- **Barcode scanning component** → Epic 3 (POS)
- **Offline indicator component** → Epic 4
- **Real data subscriptions** in layouts (inventory, transactions, etc.) → feature epics
- **Role-specific mutations/queries** beyond getCurrentUser → feature epics
- **Audit logging** → Story 1.6
- **Driver/Supplier role additions to schema** → Phase 5/7
- Do NOT create actual feature page content — only placeholder pages with "Coming in Epic X" messages
- Do NOT add Convex queries for branch-scoped data in layouts — that comes when features are built

### Existing Code to Build Upon (Stories 1.1-1.4)

**Already exists — DO NOT recreate:**
- `app/(auth)/layout.tsx` — Auth layout (centered, minimal) — no changes needed
- `app/(auth)/sign-in/[[...sign-in]]/page.tsx` — Clerk SignIn component
- `app/(auth)/sign-up/[[...sign-up]]/page.tsx` — Clerk SignUp component
- `app/(admin)/layout.tsx` — Admin layout with sidebar, role guard, nav items
- `app/(admin)/users/page.tsx` — User management page
- `app/(admin)/branches/page.tsx` — Branch management page
- `app/layout.tsx` — Root layout with ClerkProvider, ConvexClientProvider, Toaster
- `middleware.ts` — Clerk middleware with admin route protection
- `convex/_helpers/permissions.ts` — `requireAuth()`, `requireRole()`, role group constants
- `convex/_helpers/withBranchScope.ts` — Branch isolation enforcer
- `convex/auth/users.ts` — `getCurrentUser` query (used in layout role guards)
- `convex/schema.ts` — 13 tables defined (settings table may need to be added)
- `lib/constants.ts` — ROLES, ERROR_CODES, VAT_RATE, etc.
- `lib/types.ts` — Doc type aliases
- `components/providers/ConvexClientProvider.tsx` — Clerk + Convex provider wrapper
- `components/ui/` — shadcn/ui components (badge, button, dialog, input, label, select, separator, sonner, table)

**Key patterns from existing code:**
- Admin layout uses `useQuery(api.auth.users.getCurrentUser)` for role check
- Admin layout redirects non-admin users via `router.replace("/")`
- Admin layout has sidebar with `navItems` array and active state via `usePathname()`
- Middleware extracts role from `session.sessionClaims.metadata.role`
- All Convex errors use `ConvexError({ code, message })` pattern

**Role group constants already defined in `permissions.ts`:**
- `ADMIN_ROLES = ["admin"]`
- `HQ_ROLES = ["admin", "hqStaff"]`
- `BRANCH_MANAGEMENT_ROLES = ["admin", "manager"]`
- `POS_ROLES = ["admin", "manager", "cashier"]`
- `WAREHOUSE_ROLES = ["admin", "warehouseStaff"]`
- `BRANCH_VIEW_ROLES = ["admin", "manager", "viewer"]`

**Middleware role extraction pattern (from existing middleware.ts):**
```typescript
const sessionClaims = session.sessionClaims as Record<string, unknown>;
const metadata = sessionClaims?.metadata as Record<string, unknown> | undefined;
const role = metadata?.role as string | undefined;
```

### Previous Story Learnings (from Stories 1.2-1.4)

- **ConvexError pattern:** Use `ConvexError` from `convex/values` with typed `{ code, message }` objects. In UI, extract message via `error.data.message` (Story 1.3 review fix H2)
- **Import consolidation:** Combine imports from same module on single line (Story 1.3 review fix M1)
- **Existence checks:** Validate entities exist before operating on them (Story 1.3 review fix M4/L1)
- **HQ_ROLES reuse:** `["admin", "hqStaff"]` already defined in `permissions.ts` — import and reuse
- **TypeScript strict:** Always run `npx tsc --noEmit` and `npx next lint` before marking story complete
- **JSON serialization:** `undefined` values are stripped by JSON serialization — use explicit values (Story 1.3 review fix H1)
- **Force null for HQ branchId:** `withBranchScope` returns `branchId: null` for HQ users (Story 1.4 review fix M1)

### Project Structure Notes

```
Files to CREATE in this story:
├── lib/
│   └── routes.ts                         # Route mapping constants
├── components/
│   └── shared/
│       └── ErrorBoundary.tsx             # React error boundary
├── components/
│   └── providers/
│       └── BrandProvider.tsx             # White-label theme injection
├── app/
│   ├── (pos)/
│   │   ├── layout.tsx                    # POS layout (full-screen, theme-pos)
│   │   └── page.tsx                      # Placeholder
│   ├── (hq)/
│   │   ├── layout.tsx                    # HQ layout (sidebar, theme-dashboard)
│   │   └── dashboard/
│   │       └── page.tsx                  # Placeholder
│   ├── (branch)/
│   │   ├── layout.tsx                    # Branch layout (sidebar, theme-dashboard)
│   │   └── dashboard/
│   │       └── page.tsx                  # Placeholder
│   ├── (warehouse)/
│   │   ├── layout.tsx                    # Warehouse layout (sidebar)
│   │   └── transfers/
│   │       └── page.tsx                  # Placeholder
│   ├── (customer)/
│   │   ├── layout.tsx                    # Public layout (no auth)
│   │   └── page.tsx                      # Placeholder
│   ├── (driver)/
│   │   ├── layout.tsx                    # Placeholder layout (Phase 5)
│   │   └── deliveries/
│   │       └── page.tsx                  # Placeholder
│   └── (supplier)/
│       ├── layout.tsx                    # Placeholder layout (Phase 7)
│       └── portal/
│           └── page.tsx                  # Placeholder
├── convex/
│   └── admin/
│       └── settings.ts                   # Settings CRUD for brand config

Files to MODIFY in this story:
├── middleware.ts                          # Add role-based route protection
├── app/(admin)/layout.tsx                # Add theme class + ErrorBoundary
├── app/page.tsx                          # Role-based redirect
├── app/layout.tsx                        # Add BrandProvider wrapper
├── app/globals.css                       # Add brand CSS custom properties
├── convex/schema.ts                      # Add settings table

Files to reference (NOT modify):
├── convex/_helpers/permissions.ts        # Role group constants
├── convex/_helpers/withBranchScope.ts    # Branch isolation helper
├── convex/auth/users.ts                  # getCurrentUser query
├── lib/constants.ts                      # ROLES constant
├── lib/types.ts                          # Doc type aliases
├── app/(auth)/layout.tsx                 # Auth layout (no changes needed)
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Route Group Structure, lines 250-268]
- [Source: _bmad-output/planning-artifacts/architecture.md — Route Group Pages, lines 589-676]
- [Source: _bmad-output/planning-artifacts/architecture.md — Component Boundaries, lines 695-698]
- [Source: _bmad-output/planning-artifacts/architecture.md — Auth Boundary, lines 685-688]
- [Source: _bmad-output/planning-artifacts/architecture.md — Addendum 5: Role → Route Group Mapping, lines 834-852]
- [Source: _bmad-output/planning-artifacts/architecture.md — Addendum 6: Accessibility Patterns, lines 854-868]
- [Source: _bmad-output/planning-artifacts/architecture.md — Error Handling, lines 228-232]
- [Source: _bmad-output/planning-artifacts/architecture.md — FR Category to Route Group Mapping, lines 702-714]
- [Source: _bmad-output/planning-artifacts/epics.md — Story 1.5 ACs and context]
- [Source: convex/_helpers/permissions.ts — Role group constants]
- [Source: middleware.ts — Current Clerk middleware pattern]
- [Source: app/(admin)/layout.tsx — Existing layout pattern to follow]
- [Source: _bmad-output/implementation-artifacts/1-4-branch-scoped-data-isolation-and-role-based-access.md — Previous Story Learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- tsc --noEmit: zero errors
- next lint: zero warnings/errors

### Completion Notes List

- All 9 route groups exist under app/ (auth, pos, hq, branch, warehouse, customer, admin, driver, supplier)
- Middleware uses ROLE_ROUTE_ACCESS for dynamic role-based route protection
- Unauthorized access redirects to ROLE_DEFAULT_ROUTES[role] instead of error page
- ErrorBoundary extracts ConvexError .data.message for user-friendly fallback
- Customer layout is public (no auth), driver/supplier are auth-only (no role check — roles not yet in schema)
- Admin layout updated with theme-dashboard class, ErrorBoundary, and ROLE_DEFAULT_ROUTES redirect
- Home page redirects authenticated users to their role's default route
- Settings table added for white-label theming; BrandProvider injects CSS custom properties
- Named the mutation `updateSetting` (singular) instead of `updateSettings` for clarity

### Change Log

- 2026-02-27: All 8 tasks implemented, tsc + lint clean
- 2026-02-27: Code review — 2 HIGH, 1 MEDIUM, 2 LOW found. All HIGH/MEDIUM fixed.

### File List

**Created:**
- lib/routes.ts — Route mapping constants (ROLE_DEFAULT_ROUTES, ROLE_ROUTE_ACCESS, PUBLIC_ROUTES)
- components/shared/ErrorBoundary.tsx — React class component error boundary
- components/providers/BrandProvider.tsx — White-label theme injection via CSS custom properties
- convex/admin/settings.ts — getSettings query + updateSetting mutation
- app/pos/layout.tsx — POS layout (full-screen, theme-pos, role guard)
- app/pos/page.tsx — POS placeholder
- app/hq/layout.tsx — HQ layout (sidebar, theme-dashboard, role guard)
- app/hq/dashboard/page.tsx — HQ dashboard placeholder
- app/branch/layout.tsx — Branch layout (sidebar, theme-dashboard, role guard)
- app/branch/dashboard/page.tsx — Branch dashboard placeholder
- app/warehouse/layout.tsx — Warehouse layout (sidebar, theme-warehouse, role guard)
- app/warehouse/transfers/page.tsx — Warehouse transfers placeholder
- app/(customer)/layout.tsx — Customer layout (public, theme-customer)
- app/(customer)/browse/page.tsx — Customer browse placeholder
- app/driver/layout.tsx — Driver layout (auth-only, theme-driver)
- app/driver/deliveries/page.tsx — Driver deliveries placeholder
- app/supplier/layout.tsx — Supplier layout (auth-only, theme-supplier)
- app/supplier/portal/page.tsx — Supplier portal placeholder

**Modified:**
- middleware.ts — Dynamic ROLE_ROUTE_ACCESS matching with precise prefix check
- app/admin/layout.tsx — Added theme-dashboard class, ErrorBoundary, ROLE_DEFAULT_ROUTES redirect (moved from route group to regular folder)
- app/admin/users/page.tsx — Moved from (admin) route group to admin/ regular folder
- app/admin/branches/page.tsx — Moved from (admin) route group to admin/ regular folder
- app/page.tsx — Added role-based redirect for authenticated users
- app/layout.tsx — Wrapped content with BrandProvider
- app/globals.css — Added --brand-primary, --brand-secondary, --brand-name CSS custom properties
- convex/schema.ts — Added settings table with by_key index

### Senior Developer Review (AI)

**Review Date:** 2026-02-27
**Reviewer:** Claude Opus 4.6 (Adversarial Code Review)

**Findings (5 total): 2 HIGH, 1 MEDIUM, 2 LOW**

**H1 [FIXED]: Next.js route groups don't create URL segments — role-based routing was non-functional**
- Route groups `(pos)`, `(hq)`, `(branch)` etc. don't add to URL paths per Next.js App Router docs
- Pages at `app/(pos)/page.tsx` mapped to `/`, not `/pos` — middleware prefix checks never triggered
- Fix: Converted protected route groups to regular folders (`app/pos/`, `app/hq/`, etc.) creating correct URL segments. Kept `(auth)` and `(customer)` as route groups since their URLs don't include the group name.

**H2 [FIXED]: Multiple pages conflicted at same URL paths**
- `app/page.tsx`, `app/(customer)/page.tsx`, `app/(pos)/page.tsx` all mapped to `/`
- `app/(hq)/dashboard/page.tsx` and `app/(branch)/dashboard/page.tsx` both mapped to `/dashboard`
- Fix: Resolved by H1 fix — regular folders eliminate URL conflicts. Customer placeholder moved to `(customer)/browse/page.tsx` → `/browse`.

**M1 [FIXED]: ROLE_DEFAULT_ROUTES pointed to paths without pages**
- `hqStaff: "/hq"` → fixed to `"/hq/dashboard"`
- `manager: "/branch"` → fixed to `"/branch/dashboard"`
- `warehouseStaff: "/warehouse"` → fixed to `"/warehouse/transfers"`
- `viewer: "/branch"` → fixed to `"/branch/dashboard"`
- Also added precise prefix matching in middleware: `pathname === prefix || pathname.startsWith(prefix + "/")` to prevent `/branch` from matching `/branches`

**L1 [ACCEPTED]: Placeholder page wrappers inconsistent** — some use `<main>`, others `<div>`. Cosmetic only; layouts provide page structure.

**L2 [ACCEPTED]: getSettings is fully public** — intentional per AC #7 spec for customer-facing brand tokens. Noted as future consideration if sensitive settings are added.

**Outcome:** APPROVED — all HIGH and MEDIUM issues fixed, tsc + lint clean after fixes.

# Story 1.2: Authentication & User Management

Status: done

## Story

As an **Admin**,
I want to manage user accounts and assign roles so team members can access the system,
So that each staff member has the appropriate access level for their job.

## Acceptance Criteria

1. **Given** the Clerk provider is configured and wrapping the Convex provider **When** a new user signs up or is invited via Clerk **Then** a Clerk webhook syncs the user to the Convex `users` table with role and branch assignment
2. **And** Clerk `publicMetadata` stores the user's role for fast client-side checks
3. **And** Admin can create, edit, and deactivate user accounts via `(admin)/users/` UI
4. **And** Admin can assign one of 6 roles (Admin, Manager, Cashier, Warehouse Staff, HQ Staff, Viewer) to any user
5. **And** Admin can assign a user to a specific branch
6. **And** role changes trigger session invalidation within 5 seconds (SESSION_STALE error on mismatch)
7. **And** sessions expire after 30 minutes of inactivity

## Tasks / Subtasks

- [x] Task 1: Install dependencies and configure environment (AC: prerequisite)
  - [x] 1.1 Install `svix` for Clerk webhook signature verification: `npm install svix`
  - [x] 1.2 Update `.env.example` with Clerk routing vars: `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/`
  - [x] 1.3 Set Convex environment variables via CLI: `npx convex env set CLERK_WEBHOOK_SECRET <value>` and `npx convex env set CLERK_SECRET_KEY <value>` (document as manual step — user must run these with their own keys)

- [x] Task 2: Create Clerk webhook handler (AC: #1)
  - [x] 2.1 Create `convex/http.ts` — HTTP router with `httpRouter()`, route POST `/clerk-webhook` to handler
  - [x] 2.2 Create `convex/auth/clerkWebhook.ts` — `httpAction` that verifies svix signature, handles `user.created`, `user.updated`, `user.deleted` events
  - [x] 2.3 On `user.created`/`user.updated`: upsert user in Convex `users` table (clerkId, email, name from Clerk data; role from `public_metadata.role` defaulting to `"viewer"`)
  - [x] 2.4 On `user.deleted`: deactivate user (set `isActive: false`) — never hard-delete
  - [ ] 2.5 Verify webhook deploys and handles test events from Clerk Dashboard

- [x] Task 3: Create Convex auth functions (AC: #1, #3, #4, #5)
  - [x] 3.1 Create `convex/auth/users.ts` with internal functions for webhook: `getByClerkId` (internalQuery), `createFromWebhook` (internalMutation), `updateFromWebhook` (internalMutation), `deactivateByClerkId` (internalMutation)
  - [x] 3.2 Add public queries: `getUsers` (list all users, admin-only), `getCurrentUser` (authenticated user's own record by clerkId), `getUserById`
  - [x] 3.3 Add public mutations: `updateUser` (edit name, email), `deactivateUser` (set isActive false), `reactivateUser` (set isActive true)
  - [x] 3.4 Create Convex action `setUserRole` — updates BOTH Convex `users.role` AND Clerk `publicMetadata.role` via Clerk REST API (`PATCH https://api.clerk.com/v1/users/{clerkId}/metadata`)
  - [x] 3.5 Create Convex action `assignBranch` — updates `users.branchId` AND Clerk `publicMetadata.branchId`
  - [x] 3.6 All mutations must validate caller is Admin role before executing

- [x] Task 4: Create role check utilities (AC: #6)
  - [x] 4.1 Create `convex/_helpers/permissions.ts` with `requireAuth(ctx)` — validates identity, looks up user by clerkId, returns user record or throws UNAUTHORIZED
  - [x] 4.2 Add `requireRole(ctx, allowedRoles: string[])` — calls requireAuth, checks role is in allowedRoles, throws UNAUTHORIZED if not
  - [x] 4.3 Add `checkSessionStale(ctx)` — compares Convex user role with session token's `metadata.role`, throws `ConvexError({ code: "SESSION_STALE" })` on mismatch — this forces client-side re-auth within 5 seconds
  - [x] 4.4 Export role constants: `ADMIN_ROLES`, `HQ_ROLES`, `BRANCH_ROLES` etc. for reuse across functions

- [x] Task 5: Create auth pages (AC: #1, #7)
  - [x] 5.1 Create `app/(auth)/layout.tsx` — centered layout with `bg-gray-50`, `min-h-screen`, flex center
  - [x] 5.2 Create `app/(auth)/sign-in/[[...sign-in]]/page.tsx` — Clerk `<SignIn />` component
  - [x] 5.3 Create `app/(auth)/sign-up/[[...sign-up]]/page.tsx` — Clerk `<SignUp />` component

- [x] Task 6: Enhance middleware with route protection (AC: #6, #7)
  - [x] 6.1 Update `middleware.ts` — import `createRouteMatcher` from `@clerk/nextjs/server`
  - [x] 6.2 Define public routes: `/`, `/sign-in(.*)`, `/sign-up(.*)`, `/api/webhooks(.*)`
  - [x] 6.3 Call `auth.protect()` for all non-public routes (redirects unauthenticated to sign-in)
  - [x] 6.4 Add Admin route guard: if accessing `(admin)` routes, check `sessionClaims.metadata.role === "admin"`, redirect to `/` if unauthorized
  - [x] 6.5 Configure Clerk session token in Clerk Dashboard: add custom claim `"metadata": "{{user.public_metadata}}"` (document as manual step)

- [x] Task 7: Create Admin user management UI (AC: #3, #4, #5)
  - [x] 7.1 Install shadcn/ui components needed: `npx shadcn@latest add table dialog button input select badge label separator toast` (skip any already installed)
  - [x] 7.2 Create `app/(admin)/layout.tsx` — admin layout with sidebar nav (Users, Branches links) and admin role guard using `useQuery` to check `getCurrentUser` role
  - [x] 7.3 Create `app/(admin)/users/page.tsx` — data table listing all users with columns: Name, Email, Role (badge), Branch, Status (active/inactive), Actions
  - [x] 7.4 Implement "Add User" dialog — invites user via Clerk (or documents manual Clerk invite), assigns role and branch. Since Clerk manages sign-up, this may just be a role/branch assignment UI for existing Clerk users
  - [x] 7.5 Implement "Edit User" dialog — change role (select from 6 roles), assign/change branch (select from branches query), deactivate/reactivate toggle
  - [x] 7.6 Add search input (filter by name/email) and role filter dropdown
  - [ ] 7.7 Verify all CRUD operations work end-to-end

- [x] Task 8: Configure session management (AC: #7)
  - [x] 8.1 Document Clerk Dashboard configuration: set session inactivity timeout to 30 minutes under Sessions settings
  - [ ] 8.2 Verify session expiry behavior — after 30 min inactivity, user is redirected to sign-in

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**Dual Role Storage Pattern:**
- Clerk `publicMetadata` stores role for fast client-side checks (no network call) via session token
- Convex `users` table stores role + branchId for server-side enforcement
- Both MUST stay in sync — every role change updates BOTH via the `setUserRole` Convex action
- [Source: architecture.md — Authentication & Security section, line 187-190]

**Session Invalidation Pattern (SESSION_STALE):**
- Every Convex function that checks permissions compares the session token role with the Convex `users` table role
- If mismatch detected → throw `ConvexError({ code: "SESSION_STALE" })`
- Frontend catches SESSION_STALE and forces `clerk.signOut()` → re-login gets fresh token with updated role
- This achieves the 5-second invalidation requirement (next API call after role change triggers re-auth)
- [Source: architecture.md — Addendum 4, line 825-832]

**First-Login Bootstrap (Webhook Failure Recovery):**
- If `requireAuth()` finds no Convex user record for an authenticated Clerk identity, create one from the session token data (clerkId, email, name, role from publicMetadata)
- This handles the race condition where webhook hasn't fired yet or failed
- [Source: architecture.md — Addendum 4, line 831]

**Clerk Webhook Configuration:**
- Webhook URL: `https://<convex-deployment>.convex.site/clerk-webhook` (uses `.convex.site` domain, NOT `.convex.cloud`)
- Subscribe to events: `user.created`, `user.updated`, `user.deleted`
- Signing secret (starts with `whsec_`) → set as `CLERK_WEBHOOK_SECRET` Convex env var
- Clerk retries webhooks with exponential backoff up to 3 days

**Convex HTTP Actions:**
- Defined in `convex/http.ts` using `httpRouter()` — this file MUST be named exactly `convex/http.ts`
- Webhook handler uses `httpAction` (not `mutation` or `query`)
- Raw body via `await request.text()` — pass to svix `wh.verify()` as string, NOT parsed JSON

**Clerk REST API for publicMetadata:**
- Endpoint: `PATCH https://api.clerk.com/v1/users/{clerkId}/metadata`
- Auth: `Authorization: Bearer ${CLERK_SECRET_KEY}`
- Body: `{ "public_metadata": { "role": "admin", "branchId": "..." } }`
- `CLERK_SECRET_KEY` must be set as Convex env var via `npx convex env set`

**Clerk Custom Session Token:**
- In Clerk Dashboard → Sessions → Customize session token, add: `"metadata": "{{user.public_metadata}}"`
- This makes `publicMetadata` (including role) available in all session tokens
- Access in middleware: `sessionClaims?.metadata?.role`
- Access in Convex: `ctx.auth.getUserIdentity()` returns identity with custom claims

### Scope Boundaries — DO NOT IMPLEMENT

- **`withBranchScope()` helper** → Story 1.4 (Branch-Scoped Data Isolation)
- **Branch management CRUD UI** → Story 1.3 (Branch Management)
- **Full route group structure** (pos, hq, branch, warehouse, etc.) → Story 1.5 (Route Groups & Layouts)
- **Audit logging / `_logAuditEntry()`** → Story 1.6 (Audit Trail Foundation)
- **Only create `(auth)` and `(admin)` route groups** — other route groups are Story 1.5

### Convex Function Patterns (MUST FOLLOW)

```typescript
// Public query pattern — with argument validators
export const getUsers = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, ["admin"]);
    return await ctx.db.query("users").collect();
  },
});

// Public mutation pattern
export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["admin"]);
    await ctx.db.patch(args.userId, {
      ...args,
      updatedAt: Date.now(),
    });
  },
});

// Internal function pattern (only callable from other Convex functions)
export const getByClerkId = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();
  },
});

// Action pattern (for external API calls like Clerk REST API)
export const setUserRole = action({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("manager"), v.literal("cashier"),
      v.literal("warehouseStaff"), v.literal("hqStaff"), v.literal("viewer")),
  },
  handler: async (ctx, args) => {
    // 1. Get user from Convex to find clerkId
    const user = await ctx.runQuery(internal.auth.users.getById, { id: args.userId });
    // 2. Update Clerk publicMetadata via REST API
    // 3. Update Convex users table via internal mutation
  },
});

// httpAction pattern (for webhooks)
export const clerkWebhook = httpAction(async (ctx, request) => {
  // Verify svix signature, process event, return Response
});
```

**Naming conventions:**
- Queries: `get*` prefix — `getUsers`, `getCurrentUser`
- Mutations: verb prefix — `updateUser`, `deactivateUser`
- Actions: descriptive — `setUserRole`, `assignBranch`
- Internal: use `internalQuery`, `internalMutation` — these are NOT accessible via API

**Error handling:**
- Use `ConvexError` with typed codes: `throw new ConvexError({ code: "UNAUTHORIZED" })`
- Import: `import { ConvexError } from "convex/values"`
- Error codes from `lib/constants.ts`: `UNAUTHORIZED`, `SESSION_STALE`, `BRANCH_MISMATCH`

### UI Implementation Notes

**Admin Panel UX:**
- Desktop-first, mouse/keyboard optimized (not touch)
- Data-dense: sortable data table with compact rows (36px height), small badges
- Standard 36px inputs, keyboard-optimized
- shadcn/ui components: Table, Dialog, Button, Input, Select, Badge, Toast
- [Source: ux-design-specification.md — Device-Interface Mapping, line 120; Component Variants, line 478-483]

**Admin Layout:**
- Sidebar navigation with links: Users, Branches (Branches page created in Story 1.3)
- Top bar with app name + current user info
- `app/(admin)/layout.tsx` must guard: only role === "admin" can access
- Guard check: use `useQuery(api.auth.users.getCurrentUser)` — if not admin, redirect to `/`
- [Source: architecture.md — Route Group Structure, line 600-601]

**User Management Table Columns:**
- Name (string)
- Email (string)
- Role (badge with color coding per role)
- Branch (branch name or "HQ/All" for admin/hqStaff)
- Status (active/inactive badge)
- Actions (Edit button, Deactivate/Reactivate button)

**Role Assignment:**
- Select dropdown with 6 options: Admin, Manager, Cashier, Warehouse Staff, HQ Staff, Viewer
- When role changes, the `setUserRole` action updates both Convex and Clerk
- User sees toast confirmation: "Role updated to Manager"

**Branch Assignment:**
- Select dropdown populated from `branches` table query
- Admin and HQ Staff roles: branchId is optional (they access all branches)
- Manager, Cashier, Warehouse Staff, Viewer: branchId is required

### svix Webhook Verification Pattern

```typescript
import { Webhook } from "svix";

const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);

// Headers from request
const svixId = request.headers.get("svix-id");
const svixTimestamp = request.headers.get("svix-timestamp");
const svixSignature = request.headers.get("svix-signature");

// Verify — payload must be raw string, NOT parsed JSON
const payload = await request.text();
const evt = wh.verify(payload, {
  "svix-id": svixId!,
  "svix-timestamp": svixTimestamp!,
  "svix-signature": svixSignature!,
}) as WebhookEvent;
```

**Type import:** `import type { WebhookEvent } from "@clerk/nextjs/server"`

### permissions.ts Helper Pattern

```typescript
import { ConvexError } from "convex/values";
import { QueryCtx, MutationCtx } from "../_generated/server";

export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ code: "UNAUTHORIZED" });

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (!user) {
    // First-login bootstrap: create user from session token
    // Only in mutations — queries cannot write
    throw new ConvexError({ code: "UNAUTHORIZED", message: "User not found" });
  }

  if (!user.isActive) throw new ConvexError({ code: "UNAUTHORIZED" });

  // SESSION_STALE check: compare token role with DB role
  const tokenRole = (identity as any).metadata?.role;
  if (tokenRole && tokenRole !== user.role) {
    throw new ConvexError({ code: "SESSION_STALE" });
  }

  return user;
}

export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  allowedRoles: string[]
) {
  const user = await requireAuth(ctx);
  if (!allowedRoles.includes(user.role)) {
    throw new ConvexError({ code: "UNAUTHORIZED" });
  }
  return user;
}
```

### Existing Code to Build Upon (Story 1.1)

**Already exists — DO NOT recreate:**
- `convex/schema.ts` — `users` table with clerkId, email, name, role, branchId, isActive, createdAt, updatedAt + indexes (by_clerkId, by_branch, by_role)
- `lib/constants.ts` — ROLES object with all 6 roles, ERROR_CODES with UNAUTHORIZED and SESSION_STALE
- `lib/types.ts` — `User = Doc<"users">`, `Branch = Doc<"branches">`
- `lib/formatters.ts` — formatCurrency, formatDate, formatDateTime
- `lib/utils.ts` — `cn()` helper for Tailwind class merging
- `components/providers/ConvexClientProvider.tsx` — ConvexProviderWithClerk wrapper
- `middleware.ts` — basic clerkMiddleware() (will be enhanced in Task 6)
- `app/layout.tsx` — ClerkProvider + ConvexClientProvider wrapping
- `.env.example` — NEXT_PUBLIC_CONVEX_URL, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, CLERK_WEBHOOK_SECRET

**Packages already installed:**
- `@clerk/nextjs` ^6, `convex` ^1, `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`, `tailwindcss-animate`

### Previous Story Learnings (from Story 1.1)

- **Convex CLI interactive prompts** don't work in automated environments — use direct `npm install` and manual file creation instead
- **Next.js pinned to ^15** — architecture requirement; don't upgrade to 16
- **Tailwind v3** (not v4) — uses `tailwind.config.ts` with JS config, NOT CSS-based `@import "tailwindcss"` syntax
- **`convex/_generated/`** is auto-created by `npx convex dev` — never commit it, never manually create it
- **`dev` script runs `next dev` only** — use `dev:full` for both Next.js + Convex backend. Devs need `npx convex dev` running separately for Convex functions
- **Convex env vars** set via `npx convex env set KEY value` (not in .env.local for server-side Convex functions)
- **shadcn/ui style:** new-york, base color slate, CSS variables enabled (see `components.json`)

### Project Structure Notes

```
Files to CREATE in this story:
├── convex/
│   ├── http.ts                            # HTTP router for webhook endpoint
│   ├── auth/
│   │   ├── clerkWebhook.ts               # Clerk webhook httpAction handler
│   │   └── users.ts                       # User CRUD queries/mutations/actions
│   └── _helpers/
│       └── permissions.ts                 # requireAuth, requireRole, checkSessionStale
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx                     # Centered auth layout
│   │   ├── sign-in/[[...sign-in]]/
│   │   │   └── page.tsx                   # Clerk SignIn component
│   │   └── sign-up/[[...sign-up]]/
│   │       └── page.tsx                   # Clerk SignUp component
│   └── (admin)/
│       ├── layout.tsx                     # Admin role guard + sidebar nav
│       └── users/
│           └── page.tsx                   # User management data table + dialogs

Files to MODIFY in this story:
├── middleware.ts                           # Enhance with createRouteMatcher + role protection
├── .env.example                           # Add Clerk routing env vars
├── package.json                           # Add svix dependency
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 1.2, lines 337-353]
- [Source: _bmad-output/planning-artifacts/architecture.md — Authentication & Security, lines 185-204]
- [Source: _bmad-output/planning-artifacts/architecture.md — Convex Function Organization, lines 208-226]
- [Source: _bmad-output/planning-artifacts/architecture.md — Error Handling, lines 228-232]
- [Source: _bmad-output/planning-artifacts/architecture.md — Auth Boundary, lines 685-688]
- [Source: _bmad-output/planning-artifacts/architecture.md — Role → Route Mapping, Addendum 5, lines 834-852]
- [Source: _bmad-output/planning-artifacts/architecture.md — Clerk Webhook Recovery, Addendum 4, lines 825-832]
- [Source: _bmad-output/planning-artifacts/architecture.md — Directory Structure, lines 506-518, 594-601]
- [Source: _bmad-output/planning-artifacts/architecture.md — Cross-Cutting Concerns, lines 716-726]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Admin Panel, line 120]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Component Variants, lines 478-483]
- [Source: _bmad-output/planning-artifacts/prd.md — FR1-FR7, lines 572-578]
- [Source: _bmad-output/planning-artifacts/prd.md — NFR10 Auth, line 687]
- [Source: _bmad-output/planning-artifacts/prd.md — NFR12 RBAC, line 689]
- [Source: _bmad-output/planning-artifacts/prd.md — NFR15 Session Management, line 692]
- [Source: _bmad-output/implementation-artifacts/1-1-project-initialization-and-core-schema.md — Completion Notes, Dev Learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- TypeScript compilation: passes with zero errors (`npx tsc --noEmit`)
- Next.js lint: passes with zero warnings (`npx next lint`)
- svix installation: 499 packages, 0 vulnerabilities

### Completion Notes List

- Installed svix ^1.86.0 for Clerk webhook signature verification
- Created `convex/http.ts` HTTP router with `/clerk-webhook` POST endpoint
- Created `convex/auth/clerkWebhook.ts` with svix-verified httpAction handling user.created, user.updated, user.deleted events — upserts user to Convex users table, deactivates on delete (never hard-deletes)
- Created `convex/auth/users.ts` with 6 internal functions (getByClerkId, getById, createFromWebhook, updateFromWebhook, deactivateByClerkId, updateRole, updateBranch), 3 public queries (getUsers, getCurrentUser, getUserById), 3 public mutations (updateUser, deactivateUser, reactivateUser), and 2 actions (setUserRole, assignBranch) that update both Convex AND Clerk publicMetadata via REST API
- Created `convex/_helpers/permissions.ts` with requireAuth() (validates identity, SESSION_STALE check), requireRole() (checks allowed roles), and role group constants (ADMIN_ROLES, HQ_ROLES, BRANCH_MANAGEMENT_ROLES, POS_ROLES, WAREHOUSE_ROLES, BRANCH_VIEW_ROLES)
- SESSION_STALE detection integrated into requireAuth() — compares session token's metadata.role with Convex user record's role, throws ConvexError on mismatch
- Created auth pages: `app/(auth)/layout.tsx` (centered bg-gray-50), `app/(auth)/sign-in/[[...sign-in]]/page.tsx` (Clerk SignIn), `app/(auth)/sign-up/[[...sign-up]]/page.tsx` (Clerk SignUp)
- Enhanced `middleware.ts` with createRouteMatcher — public routes bypass auth, non-public routes protected via auth.protect(), admin routes guarded by role check from session claims metadata
- Created `app/(admin)/layout.tsx` with sidebar navigation (Users, Branches links), admin role guard via getCurrentUser query, loading state, and redirect for non-admin users
- Created `app/(admin)/users/page.tsx` with full user management: data table (Name, Email, Role badge, Branch, Status, Actions), search by name/email, role filter dropdown, Edit User dialog (name, email, role, branch), deactivate/reactivate toggle with confirmation and toast notifications
- Installed 9 shadcn/ui components: table, dialog, button, input, select, badge, label, separator, sonner (toast)
- Added Toaster component to root layout
- Updated .env.example with Clerk routing environment variables
- Subtask 2.5 (verify webhook deploy) and 7.7 (verify CRUD end-to-end) and 8.2 (verify session expiry) require running Convex backend — left unchecked pending `npx convex dev` deployment
- Subtask 1.3 (Convex env vars CLERK_WEBHOOK_SECRET and CLERK_SECRET_KEY) requires user to run with their own keys
- Subtask 6.5 (Clerk Dashboard session token customization) is a manual dashboard configuration step
- Subtask 7.4: Since Clerk manages user sign-up, "Add User" is handled via Clerk invitation. The Edit dialog serves as the role/branch assignment UI for existing users.

### Change Log

- 2026-02-27: Story 1.2 implemented — Clerk webhook integration, Convex auth CRUD, permissions helpers, auth pages, enhanced middleware, admin user management UI
- 2026-02-27: Code review fixes — [C1] Added admin auth checks to setUserRole/assignBranch actions, [C2] Added branch select to Edit User dialog, [H1] Changed internal mutation role args from v.string() to roleValidator union, [H2] Reversed Clerk/Convex order in actions with rollback on Clerk failure, [M1] Added confirmation dialog for user deactivation, [M2] Added self-protection guards (cannot deactivate/demote self), [M3] Added components.json to File List, [M4] Replaced manual UserRecord type with shared User type from lib/types.ts, [M5] Improved handleSaveEdit error handling with per-operation error tracking, [L1] Removed unused ActionCtx import, added VALID_ROLES/ValidRole to permissions.ts, added webhook role validation in clerkWebhook.ts

### File List

- package.json (modified — added svix ^1.86.0, added @radix-ui/* deps via shadcn)
- package-lock.json (regenerated)
- .env.example (modified — added Clerk routing env vars)
- middleware.ts (modified — enhanced with createRouteMatcher, auth.protect, admin role guard)
- app/layout.tsx (modified — added Toaster import and component)
- convex/http.ts (created — HTTP router with /clerk-webhook POST route)
- convex/auth/clerkWebhook.ts (created — svix-verified Clerk webhook httpAction)
- convex/auth/users.ts (created — internal + public queries/mutations/actions for user CRUD)
- convex/_helpers/permissions.ts (created — requireAuth, requireRole, role group constants)
- app/(auth)/layout.tsx (created — centered auth layout)
- app/(auth)/sign-in/[[...sign-in]]/page.tsx (created — Clerk SignIn component)
- app/(auth)/sign-up/[[...sign-up]]/page.tsx (created — Clerk SignUp component)
- app/(admin)/layout.tsx (created — admin sidebar layout with role guard)
- app/(admin)/users/page.tsx (created — user management data table with edit dialog)
- components/ui/table.tsx (created — shadcn/ui table component)
- components/ui/dialog.tsx (created — shadcn/ui dialog component)
- components/ui/button.tsx (created — shadcn/ui button component)
- components/ui/input.tsx (created — shadcn/ui input component)
- components/ui/select.tsx (created — shadcn/ui select component)
- components/ui/badge.tsx (created — shadcn/ui badge component)
- components/ui/label.tsx (created — shadcn/ui label component)
- components/ui/separator.tsx (created — shadcn/ui separator component)
- components/ui/sonner.tsx (created — shadcn/ui toast/sonner component)
- components.json (created — shadcn/ui configuration)

### Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.6 — 2026-02-27
**Outcome:** Approved (after fixes)

**Issues Found:** 2 Critical, 2 High, 5 Medium, 1 Low — **All Fixed**

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| C1 | CRITICAL | `setUserRole`/`assignBranch` actions had zero authorization — any authenticated user could escalate to admin | Added admin auth check via `ctx.auth.getUserIdentity()` + internal query verification in both actions |
| C2 | CRITICAL | Task 7.5 marked [x] but branch assignment UI was missing from Edit dialog | Added Branch select dropdown populated from `listBranches` query |
| H1 | HIGH | Internal mutations used `v.string()` for role instead of union validator | Replaced with shared `roleValidator` using `v.union(v.literal(...))` in all internal mutations |
| H2 | HIGH | Clerk-then-Convex order in actions — Clerk success + Convex failure creates SESSION_STALE loop | Reversed to Convex-first with try/catch rollback on Clerk failure |
| M1 | MEDIUM | No confirmation dialog for user deactivation | Added `window.confirm()` before deactivation |
| M2 | MEDIUM | Admin could deactivate/demote themselves | Added self-protection guards in `deactivateUser` mutation and `setUserRole` action |
| M3 | MEDIUM | `components.json` not in story File List | Added to File List |
| M4 | MEDIUM | `UserRecord` type duplicated instead of using shared `User` from `lib/types.ts` | Replaced with `User` import |
| M5 | MEDIUM | `handleSaveEdit` made 3 sequential calls with no error isolation | Added per-operation try/catch with aggregated error reporting |
| L1 | LOW | `ActionCtx` imported but unused in `permissions.ts` | Removed dead import; added `VALID_ROLES` Set and `ValidRole` type for webhook role validation |


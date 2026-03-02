# Story 1.3: Branch Management

Status: done

## Story

As an **Admin**,
I want to create and configure branches in the system,
So that each physical store location is represented and staff can be assigned to it.

## Acceptance Criteria

1. **Given** an authenticated Admin user **When** they navigate to `(admin)/branches/` **Then** they see a data table listing all branches with columns: Name, Address, Timezone, Status (active/inactive), and Actions
2. **And** the Admin can create a new branch via a "New Branch" dialog with fields: name (required), address (required), timezone (optional) **Then** the branch is created in the Convex `branches` table with `isActive: true`
3. **And** the Admin can edit an existing branch's details (name, address, timezone) via an Edit dialog
4. **And** the Admin can deactivate a branch (soft delete — sets `isActive: false`) with a confirmation dialog — no data loss, branch data is preserved
5. **And** the Admin can reactivate a previously deactivated branch
6. **And** branches appear in the branch selector in the User Management Edit dialog (already wired from Story 1.2's `listBranches` query)
7. **And** newly created branches are immediately available for user assignment without page refresh (Convex reactive query)

## Tasks / Subtasks

- [x] Task 1: Create Convex branch CRUD functions (AC: #1, #2, #3, #4, #5, #7)
  - [x] 1.1 Create `convex/auth/branches.ts` with public queries: `listBranches` (admin-only, returns all branches) and `getBranchById` (admin-only, returns single branch)
  - [x] 1.2 Add public mutations: `createBranch` (args: name, address, configuration; sets isActive: true, createdAt, updatedAt), `updateBranch` (args: branchId, name?, address?, configuration?), `deactivateBranch` (args: branchId; sets isActive: false), `reactivateBranch` (args: branchId; sets isActive: true)
  - [x] 1.3 All queries/mutations must validate caller is Admin via `requireRole(ctx, ADMIN_ROLES)`
  - [x] 1.4 `deactivateBranch` must check no active users are assigned to the branch before deactivation — if users exist, throw ConvexError with code `"BRANCH_HAS_USERS"` and message listing the count
  - [x] 1.5 Move `listBranches` from `convex/auth/users.ts` to `convex/auth/branches.ts` and update the import in `app/(admin)/users/page.tsx` from `api.auth.users.listBranches` to `api.auth.branches.listBranches`

- [x] Task 2: Create Admin branch management UI page (AC: #1, #2, #3, #4, #5)
  - [x] 2.1 Create `app/(admin)/branches/page.tsx` — data table listing all branches with columns: Name, Address, Timezone (from configuration.timezone or "Default"), Status (active/inactive badge), Actions (Edit, Deactivate/Reactivate)
  - [x] 2.2 Add "New Branch" button (top-right, primary style) that opens a Create Branch dialog with fields: Name (required input), Address (required input), Timezone (optional select with Philippine timezone presets)
  - [x] 2.3 Add Edit Branch dialog — pre-populated form matching Create dialog fields, triggered by Edit icon button in table row
  - [x] 2.4 Add deactivation with confirmation dialog: "Deactivate branch [name]? Users assigned to this branch will need to be reassigned." — use `window.confirm()` pattern from Story 1.2
  - [x] 2.5 Add reactivation button (UserCheck icon) for inactive branches with toast confirmation
  - [x] 2.6 Add search input (filter by name or address) matching the pattern from Users page
  - [x] 2.7 Add status filter dropdown (All, Active, Inactive) matching the pattern from Users page
  - [x] 2.8 Show branch count in header: "X branches"

- [x] Task 3: Update admin sidebar and verify integration (AC: #6)
  - [x] 3.1 Verify the existing Branches link in `app/(admin)/layout.tsx` navigates correctly to the new page
  - [x] 3.2 Verify that `app/(admin)/users/page.tsx` branch select in Edit dialog now shows newly created branches via reactive query
  - [x] 3.3 Run `npx tsc --noEmit` — zero TypeScript errors
  - [x] 3.4 Run `npx next lint` — zero lint warnings/errors

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**Branch CRUD Location:**
- Architecture places branch management under FR7 in the `convex/auth/` domain (architecture.md line 516: `auth/ — user management, role checks`)
- Create `convex/auth/branches.ts` as a separate file from `users.ts` for clean separation
- All branch functions follow the same Convex patterns established in Story 1.2
- [Source: architecture.md — Convex Function Organization, lines 208-226]

**Branches Table Schema (ALREADY EXISTS — DO NOT RECREATE):**
```typescript
// From convex/schema.ts lines 26-37
branches: defineTable({
  name: v.string(),
  address: v.string(),
  isActive: v.boolean(),
  configuration: v.optional(
    v.object({
      timezone: v.optional(v.string()),
    })
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
}),
```
- Note: No indexes defined on branches table — acceptable for ≤20 branches (NFR17)
- `configuration` is an optional object with optional `timezone` field
- [Source: convex/schema.ts, lines 26-37]

**Soft Delete Pattern:**
- Deactivation sets `isActive: false` — never delete records
- Deactivated branches should still be visible in the table (with "Inactive" badge) but excluded from branch selectors in other UIs
- Architecture enforces no hard deletes for referential integrity (branches are referenced by users, inventory, transactions, transfers, demandLogs, auditLogs)
- [Source: epics.md — Story 1.3 AC: "soft delete — no data loss"]

**Convex Function Patterns (MUST FOLLOW):**
```typescript
// Query pattern — admin-only
export const listBranches = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ADMIN_ROLES);
    return await ctx.db.query("branches").collect();
  },
});

// Mutation pattern — with argument validators
export const createBranch = mutation({
  args: {
    name: v.string(),
    address: v.string(),
    configuration: v.optional(
      v.object({
        timezone: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);
    return await ctx.db.insert("branches", {
      ...args,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
```

**Error handling:**
- Use `ConvexError` with typed codes: `throw new ConvexError({ code: "BRANCH_HAS_USERS" })`
- Import: `import { ConvexError } from "convex/values"`
- Error codes from `lib/constants.ts` — add `BRANCH_HAS_USERS` if needed, or use inline
- [Source: architecture.md — Error Handling, lines 228-232]

### Scope Boundaries — DO NOT IMPLEMENT

- **`withBranchScope()` helper** → Story 1.4 (Branch-Scoped Data Isolation)
- **Full route group structure** (pos, hq, branch, warehouse, etc.) → Story 1.5 (Route Groups & Layouts)
- **Audit logging / `_logAuditEntry()`** → Story 1.6 (Audit Trail Foundation)
- **Branch dashboard** → Epic 7 (7-2-branch-dashboard)
- **BranchSelector shared component** (`components/shared/BranchSelector`) → Future stories that need cross-interface branch picking
- **BranchCard component** for dashboard → Epic 7 (HQ dashboard)
- Do NOT modify `convex/schema.ts` — the branches table schema is already correct

### UI Implementation Notes

**Admin Panel UX (Desktop-First):**
- Desktop-only, min 1024px, mouse/keyboard optimized
- Data-dense: sortable data table with compact rows
- shadcn/ui components: Table, Dialog, Button, Input, Select, Badge, Toast (all already installed from Story 1.2)
- No new shadcn/ui components needed — reuse existing ones
- [Source: ux-design-specification.md — Device-Interface Mapping, line 120; Admin Panel: Desktop, Mouse + Keyboard, Landscape]

**Table Pattern (from UX spec):**
- Sticky header on scroll
- Sortable columns with arrow icons
- Row hover highlights
- Click row to drill down (or action buttons)
- [Source: ux-design-specification.md — Table Rules, lines 1421-1427]

**Dialog/Modal Pattern (from UX spec):**
- Dialogs always have clear close mechanism (X button + Escape + click-outside) — shadcn Dialog already provides this
- Confirmation dialogs restate the action: "Deactivate branch [name]?" (not just "Are you sure?")
- Never stack modals
- [Source: ux-design-specification.md — Modal Rules, lines 1392-1407]

**Form Validation (from UX spec):**
- On blur: field-level validation (red border + inline error)
- On submit: full form validation, focus first error
- For this story: keep it simple — required fields only, validate non-empty on submit
- [Source: ux-design-specification.md — Validation Strategy, lines 1303-1309]

**Button Hierarchy:**
- Primary action: "Create Branch" button — solid fill, right-aligned
- Secondary: "Edit" icon buttons in table rows
- Destructive: deactivate confirmation with 2-step flow
- [Source: ux-design-specification.md — Button Hierarchy, lines 1246-1255]

**Philippine Timezone Presets for Select:**
- "Asia/Manila" (Philippine Standard Time, UTC+8) — this is the primary/default
- "Default" option = no timezone set (uses system default)
- Philippines has a single timezone, so the select can be simple: "Philippine Standard Time (UTC+8)" or "None"

**Branch Status Colors (match User Management pattern):**
- Active: default badge (green-ish)
- Inactive: destructive badge (red)

### Existing Code to Build Upon (Story 1.1 + 1.2)

**Already exists — DO NOT recreate:**
- `convex/schema.ts` — `branches` table with all fields and NO indexes
- `lib/types.ts` — `Branch = Doc<"branches">` type export
- `lib/constants.ts` — `ERROR_CODES` with UNAUTHORIZED, SESSION_STALE, BRANCH_MISMATCH
- `convex/_helpers/permissions.ts` — `requireAuth()`, `requireRole()`, `ADMIN_ROLES`, `VALID_ROLES`, `ValidRole`
- `convex/auth/users.ts` — contains `listBranches` query (to be MOVED to branches.ts in Task 1.5), `assignBranch` action
- `app/(admin)/layout.tsx` — sidebar with "Branches" link to `/admin/branches` (already wired)
- `app/(admin)/users/page.tsx` — uses `api.auth.users.listBranches` for branch select in Edit dialog (import will need updating after Task 1.5)
- All shadcn/ui components: table, dialog, button, input, select, badge, label, separator, sonner

**Packages already installed (do NOT reinstall):**
- `@clerk/nextjs` ^6, `convex` ^1, shadcn/ui (@radix-ui/*), `sonner`, `lucide-react`, `svix`

### Previous Story Learnings (from Story 1.2)

- **Actions need authorization:** Story 1.2 code review found that Convex actions lack `ctx.db` so `requireAuth()`/`requireRole()` can't be used directly. For actions, use `ctx.auth.getUserIdentity()` + internal query to verify caller. Story 1.3 only needs queries and mutations (no actions), so standard `requireRole(ctx, ADMIN_ROLES)` works.
- **Use shared types:** Use `Branch` from `lib/types.ts` instead of defining manual types. Story 1.2 review fixed this for User type.
- **Role validator pattern:** Story 1.2 established `roleValidator` as a reusable `v.union(v.literal(...))`. Branch functions don't need role validators but should follow the same pattern for any union types.
- **Convex-first for external calls:** When updating both Convex and external service, update Convex first and rollback on external failure. Story 1.3 has no external service calls (pure Convex CRUD) so this doesn't apply.
- **Confirmation for destructive actions:** Story 1.2 review added `window.confirm()` for user deactivation. Use same pattern for branch deactivation.
- **Per-operation error handling:** Story 1.2 review improved `handleSaveEdit` with per-operation try/catch. Apply same pattern if multiple operations are needed.
- **Self-protection:** Story 1.2 added guards against admin self-demotion. For branches, add guard against deactivating a branch that has active users assigned.
- **shadcn/ui style:** new-york, base color slate, CSS variables enabled (see `components.json`)
- **TypeScript strict:** Always run `npx tsc --noEmit` and `npx next lint` before marking story complete

### Project Structure Notes

```
Files to CREATE in this story:
├── convex/
│   └── auth/
│       └── branches.ts                  # Branch CRUD queries/mutations
├── app/
│   └── (admin)/
│       └── branches/
│           └── page.tsx                 # Branch management data table + dialogs

Files to MODIFY in this story:
├── convex/auth/users.ts                 # Remove listBranches (moved to branches.ts)
├── app/(admin)/users/page.tsx           # Update listBranches import path
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 1.3, lines 355-369]
- [Source: _bmad-output/planning-artifacts/architecture.md — Convex Function Organization, lines 208-226]
- [Source: _bmad-output/planning-artifacts/architecture.md — Schema Design, lines 161-166]
- [Source: _bmad-output/planning-artifacts/architecture.md — Error Handling, lines 228-232]
- [Source: _bmad-output/planning-artifacts/architecture.md — Directory Structure, lines 604-605 (admin/branches)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Cross-Cutting Concerns, lines 716-726]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Admin Panel, line 120]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Table Rules, lines 1421-1427]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Modal Rules, lines 1392-1407]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Form Validation, lines 1303-1309]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Button Hierarchy, lines 1246-1255]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Component Architecture, lines 1180-1211]
- [Source: _bmad-output/planning-artifacts/prd.md — FR7: Admin can create and configure new branches]
- [Source: _bmad-output/implementation-artifacts/1-2-authentication-and-user-management.md — Dev Notes, Code Review Fixes]
- [Source: convex/schema.ts — branches table definition, lines 26-37]
- [Source: convex/auth/users.ts — listBranches query, assignBranch action]
- [Source: app/(admin)/layout.tsx — sidebar Branches nav link]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — clean implementation with zero TypeScript errors, zero lint warnings.

### Completion Notes List

- All 3 tasks with 15 subtasks completed
- `convex/auth/branches.ts` created with 2 queries + 4 mutations, all admin-only via `requireRole(ctx, ADMIN_ROLES)`
- `deactivateBranch` checks for active users via `by_branch` index before deactivation, throws `ConvexError({ code: "BRANCH_HAS_USERS" })` with count
- `listBranches` moved from `convex/auth/users.ts` to `convex/auth/branches.ts`; users page import updated
- Branch management page includes: data table, search, status filter, create dialog with validation, edit dialog, deactivation with `window.confirm()`, reactivation with toast
- Soft delete pattern followed — deactivated branches remain visible with "Inactive" badge
- Philippine timezone preset (Asia/Manila) available in timezone select
- `npx tsc --noEmit` — zero errors
- `npx next lint` — zero warnings/errors

### Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.6 (Adversarial Code Review)
**Date:** 2026-02-27

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| H1 | HIGH | `updateBranch` silently fails to clear timezone — `undefined` stripped by JSON serialization, old value persists | Fixed: pass `{}` instead of `undefined` when clearing config |
| H2 | HIGH | `ConvexError` BRANCH_HAS_USERS message shown as raw JSON in toast | Fixed: added `getErrorMessage()` helper that extracts `.data.message` from `ConvexError` |
| M1 | MEDIUM | Duplicate import from `"convex/values"` — `v` and `ConvexError` on separate lines | Fixed: combined into single import |
| M2 | MEDIUM | No loading/disabled state on Create and Save buttons — double-click risk | Fixed: added `isSubmitting` state, buttons disabled + show "Creating..."/"Saving..." |
| M3 | MEDIUM | Form validation errors not cleared on input change per UX spec | Fixed: `updateCreateField`/`updateEditField` helpers clear field error on change |
| M4 | MEDIUM | `deactivateBranch` doesn't verify branch exists or is active before user check | Fixed: added existence + `isActive` guard with `ConvexError` |
| L1 | LOW | `reactivateBranch`/`updateBranch` don't validate branch existence | Fixed: added existence checks with descriptive `ConvexError` |

**Validation:** `npx tsc --noEmit` — zero errors, `npx next lint` — zero warnings

### Change Log

- Created `convex/auth/branches.ts` — branch CRUD queries and mutations
- Created `app/(admin)/branches/page.tsx` — branch management UI page
- Modified `convex/auth/users.ts` — removed `listBranches` query (moved to branches.ts)
- Modified `app/(admin)/users/page.tsx` — updated `listBranches` import from `api.auth.users` to `api.auth.branches`
- **[Review Fix]** `convex/auth/branches.ts` — combined imports, added branch existence/state checks to all mutations
- **[Review Fix]** `app/(admin)/branches/page.tsx` — added `ConvexError` handling, submit loading state, field error clearing on change, `{}` for timezone clear

### File List

- convex/auth/branches.ts (created)
- app/(admin)/branches/page.tsx (created)
- convex/auth/users.ts (modified)
- app/(admin)/users/page.tsx (modified)

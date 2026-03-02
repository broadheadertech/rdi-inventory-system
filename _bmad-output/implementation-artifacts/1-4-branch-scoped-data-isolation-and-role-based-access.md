# Story 1.4: Branch-Scoped Data Isolation & Role-Based Access

Status: done

## Story

As a **branch staff member**,
I want to only see data for my assigned branch,
So that I'm not overwhelmed by irrelevant data and branch security is maintained.

## Acceptance Criteria

1. **Given** a user with a branch assignment (e.g., Cashier at Branch 1) **When** they query any data via Convex functions **Then** the `withBranchScope(ctx)` helper automatically filters all queries by their branch
2. **And** HQ Staff and Admin roles bypass the branch filter and access all branches
3. **And** branch-scoping is enforced server-side in every Convex query/mutation — impossible to bypass from the client
4. **And** attempting to access data outside assigned branch returns an UNAUTHORIZED error
5. **And** users without a branch assignment who are not Admin or HQ Staff are blocked from data access with a descriptive error
6. **And** the helper returns a scope object that downstream functions use to filter queries (branchId, userId, canAccessAllBranches)
7. **And** the `withBranchScope()` helper is importable from `convex/_helpers/withBranchScope.ts` and usable by all future Convex functions

## Tasks / Subtasks

- [x] Task 1: Create `withBranchScope` helper (AC: #1, #2, #3, #4, #5, #6, #7)
  - [x] 1.1 Create `convex/_helpers/withBranchScope.ts` exporting `withBranchScope(ctx: QueryCtx | MutationCtx)` async function
  - [x] 1.2 The helper calls `requireAuth(ctx)` to get the authenticated user record
  - [x] 1.3 Return a `BranchScope` object: `{ user, userId, branchId, canAccessAllBranches }` where:
    - `user` = full user document (for downstream use)
    - `userId` = `user._id`
    - `branchId` = `user.branchId` (or `null` for HQ/Admin)
    - `canAccessAllBranches` = `true` if role is `admin` or `hqStaff`, `false` otherwise
  - [x] 1.4 If user role is NOT `admin` or `hqStaff` AND `branchId` is `undefined`/`null`, throw `ConvexError({ code: "UNAUTHORIZED", message: "No branch assigned. Contact your administrator." })`
  - [x] 1.5 Export `BranchScope` TypeScript type for use by consumers
  - [x] 1.6 Export `HQ_BYPASS_ROLES` constant (`["admin", "hqStaff"] as const`) used for bypass check — reuse `HQ_ROLES` from `permissions.ts` if identical

- [x] Task 2: Create `requireBranchScope` convenience variant (AC: #1, #4)
  - [x] 2.1 Add `requireBranchScope(ctx, branchId: Id<"branches">)` that calls `withBranchScope(ctx)` then validates the user's branch matches the provided branchId (or user can access all branches)
  - [x] 2.2 If user cannot access all branches AND their branchId does not match the provided branchId, throw `ConvexError({ code: "BRANCH_MISMATCH", message: "You do not have access to this branch" })`
  - [x] 2.3 This is a convenience for mutations that receive an explicit `branchId` argument (e.g., `createTransaction({ branchId, ... })`)

- [x] Task 3: Verify integration and validate (AC: #7)
  - [x] 3.1 Verify that `withBranchScope` can be imported from `convex/_helpers/withBranchScope` — create a minimal example query in a comment block or verify via `npx tsc --noEmit`
  - [x] 3.2 Run `npx tsc --noEmit` — zero TypeScript errors
  - [x] 3.3 Run `npx next lint` — zero lint warnings/errors

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**withBranchScope() Pattern — THE Core Security Mechanism:**
- Architecture mandates: "Every Convex query/mutation wraps data access through a `withBranchScope(ctx)` helper" (architecture.md line 193)
- Single enforcement point — impossible to accidentally bypass branch isolation (architecture.md line 934)
- Located at `convex/_helpers/withBranchScope.ts` (architecture.md line 510)
- [Source: architecture.md — Branch-Scoping Pattern, lines 193-198]

**Behavior:**
- Reads authenticated user's branch assignment from `users` table
- Injects as filter on all queries
- HQ/Admin bypass: Users with HQ Staff or Admin role skip branch filter, access all data
- [Source: architecture.md — Branch-Scoping Pattern, lines 193-198]

**Role → Branch Access Mapping (from architecture.md Addendum 5):**

| Role | Branch Access | Notes |
|---|---|---|
| **Admin** | All branches | Full access to all internal routes |
| **HQ Staff** | All branches | All-branch dashboards and reports |
| **Manager** | Own branch only | Own branch dashboard, transfers, demand |
| **Cashier** | Own branch only | POS terminal and demand logging |
| **Warehouse Staff** | Own branch only | Transfer fulfillment and receiving |
| **Viewer** | Own branch only (read-only) | Branch dashboard in read-only mode |

- [Source: architecture.md — Addendum 5: Role → Route Group Mapping, lines 834-852]

**Data Flow with Branch Scoping (architecture.md line 739):**
```
User Action → Next.js Client Component
  → useQuery/useMutation → Convex Function
    → withBranchScope(ctx) → Branch-filtered query/mutation
      → schema.ts tables → Real-time subscription update
```

**Error Codes:**
- `UNAUTHORIZED` — user not authenticated, not active, or no branch assigned (non-HQ role)
- `SESSION_STALE` — role mismatch between session token and DB (already implemented in `requireAuth`)
- `BRANCH_MISMATCH` — attempted cross-branch access (already defined in `lib/constants.ts`)
- [Source: architecture.md — Error Handling, lines 228-232; lib/constants.ts]

**withBranchScope Implementation Pattern:**
```typescript
import { QueryCtx, MutationCtx } from "../_generated/server";
import { ConvexError } from "convex/values";
import { requireAuth } from "./permissions";
import type { Id, Doc } from "../_generated/dataModel";

const HQ_BYPASS_ROLES = ["admin", "hqStaff"] as const;

export type BranchScope = {
  user: Doc<"users">;
  userId: Id<"users">;
  branchId: Id<"branches"> | null;
  canAccessAllBranches: boolean;
};

export async function withBranchScope(
  ctx: QueryCtx | MutationCtx
): Promise<BranchScope> {
  const user = await requireAuth(ctx);

  const canAccessAllBranches = (HQ_BYPASS_ROLES as readonly string[]).includes(user.role);

  if (!canAccessAllBranches && !user.branchId) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "No branch assigned. Contact your administrator.",
    });
  }

  return {
    user,
    userId: user._id,
    branchId: user.branchId ?? null,
    canAccessAllBranches,
  };
}
```

**Usage Pattern (for all future Convex functions):**
```typescript
// Query: list branch-scoped data
export const listInventory = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);

    if (scope.canAccessAllBranches) {
      return await ctx.db.query("inventory").collect();
    }

    return await ctx.db
      .query("inventory")
      .withIndex("by_branch", (q) => q.eq("branchId", scope.branchId!))
      .collect();
  },
});

// Mutation: verify branch access for explicit branchId arg
export const createTransaction = mutation({
  args: { branchId: v.id("branches"), ... },
  handler: async (ctx, args) => {
    await requireBranchScope(ctx, args.branchId);
    // ... business logic
  },
});
```

### Scope Boundaries — DO NOT IMPLEMENT

- **Route group structure** (pos, hq, branch, warehouse, etc.) → Story 1.5 (Route Groups & Layouts)
- **Audit logging / `_logAuditEntry()`** → Story 1.6 (Audit Trail Foundation)
- **Actual feature-level Convex functions** (inventory, transactions, etc.) → Epics 2-9
- **Client-side branch context provider** → Story 1.5 (will use Clerk session metadata for client-side)
- **Comprehensive automated test suite** → Test architecture stories (tests will be added per-feature as each epic is implemented)
- Do NOT modify `convex/schema.ts` — schema is already correct
- Do NOT modify existing admin-only functions in `convex/auth/users.ts` or `convex/auth/branches.ts` — they use `requireRole(ctx, ADMIN_ROLES)` which is correct for admin-only operations

### Tables That Will Use Branch Scoping (Reference for Future Stories)

These tables have `branchId` fields and will be filtered by `withBranchScope` in future Convex functions:
- `inventory` — `branchId: v.id("branches")` (required), index: `by_branch`
- `transactions` — `branchId: v.id("branches")` (required), index: `by_branch`, `by_branch_date`
- `transfers` — `fromBranchId` and `toBranchId` (both required), indexes: `by_from_branch`, `by_to_branch`
- `demandLogs` — `branchId: v.id("branches")` (required), index: `by_branch`
- `auditLogs` — `branchId: v.optional(v.id("branches"))`, index: `by_branch`
- [Source: convex/schema.ts — all table definitions]

### Existing Code to Build Upon (Stories 1.1-1.3)

**Already exists — DO NOT recreate:**
- `convex/_helpers/permissions.ts` — `requireAuth()`, `requireRole()`, `ADMIN_ROLES`, `HQ_ROLES`, `BRANCH_MANAGEMENT_ROLES`, `POS_ROLES`, `WAREHOUSE_ROLES`, `BRANCH_VIEW_ROLES`, `VALID_ROLES`, `ValidRole`
- `convex/schema.ts` — all 14 tables with branch-related indexes
- `convex/auth/users.ts` — user CRUD, `assignBranch` action with Clerk sync
- `convex/auth/branches.ts` — branch CRUD with admin-only access
- `lib/types.ts` — `User`, `Branch`, and other Doc types
- `lib/constants.ts` — `ERROR_CODES` with `UNAUTHORIZED`, `SESSION_STALE`, `BRANCH_MISMATCH`
- `middleware.ts` — Clerk route protection with role checks

**Key patterns from `permissions.ts` to follow:**
- `requireAuth(ctx)` returns the full user document after validating auth + active + SESSION_STALE
- `requireRole(ctx, allowedRoles)` calls `requireAuth` then checks role inclusion
- Both use `ConvexError` with typed `{ code }` objects
- Both accept `QueryCtx | MutationCtx` union type
- `HQ_ROLES` is already defined as `["admin", "hqStaff"] as const` — reuse this for HQ bypass check

**`requireAuth` already handles (DO NOT DUPLICATE in withBranchScope):**
- Authentication check (identity exists)
- User record lookup via `by_clerkId` index
- `isActive` check (deactivated users blocked)
- `SESSION_STALE` check (token role vs DB role)

### Previous Story Learnings (from Stories 1.2 + 1.3)

- **ConvexError pattern:** Use `ConvexError` from `convex/values` with typed `{ code, message }` objects. In UI, extract message via `error.data.message` (Story 1.3 review fix H2)
- **Import consolidation:** Combine imports from same module on single line (Story 1.3 review fix M1)
- **Existence checks:** Validate entities exist before operating on them (Story 1.3 review fix M4/L1)
- **Actions vs Mutations:** Actions lack `ctx.db` — use `ctx.auth.getUserIdentity()` + internal queries. Story 1.4 only needs `QueryCtx | MutationCtx` which have `ctx.db` — no action needed.
- **HQ_ROLES already matches:** `HQ_ROLES = ["admin", "hqStaff"] as const` in `permissions.ts` — this is exactly the bypass roles for branch scoping
- **TypeScript strict:** Always run `npx tsc --noEmit` and `npx next lint` before marking story complete

### Project Structure Notes

```
Files to CREATE in this story:
├── convex/
│   └── _helpers/
│       └── withBranchScope.ts          # Branch isolation enforcer

Files to reference (NOT modify):
├── convex/_helpers/permissions.ts       # requireAuth() called by withBranchScope
├── convex/schema.ts                    # Table definitions with branchId fields
├── lib/constants.ts                    # ERROR_CODES (BRANCH_MISMATCH, UNAUTHORIZED)
├── lib/types.ts                        # User, Branch types
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Branch-Scoping Pattern, lines 193-198]
- [Source: _bmad-output/planning-artifacts/architecture.md — Convex Function Organization, lines 208-226]
- [Source: _bmad-output/planning-artifacts/architecture.md — Enforcement Guidelines, lines 428-440]
- [Source: _bmad-output/planning-artifacts/architecture.md — Code Example with withBranchScope, lines 457-462]
- [Source: _bmad-output/planning-artifacts/architecture.md — _helpers/ directory, lines 509-514]
- [Source: _bmad-output/planning-artifacts/architecture.md — Data Flow, lines 739-753]
- [Source: _bmad-output/planning-artifacts/architecture.md — Cross-Cutting Concerns, lines 716-725]
- [Source: _bmad-output/planning-artifacts/architecture.md — Addendum 4: First-Login Bootstrap, lines 825-832]
- [Source: _bmad-output/planning-artifacts/architecture.md — Addendum 5: Role → Route Group Mapping, lines 834-852]
- [Source: _bmad-output/planning-artifacts/architecture.md — Single Enforcement Point, line 934]
- [Source: _bmad-output/planning-artifacts/epics.md — Story 1.4, lines 371-385]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1 Overview, lines 315-317]
- [Source: convex/_helpers/permissions.ts — requireAuth, requireRole, HQ_ROLES]
- [Source: convex/schema.ts — all table definitions with branchId fields and indexes]
- [Source: lib/constants.ts — ERROR_CODES with BRANCH_MISMATCH]
- [Source: _bmad-output/implementation-artifacts/1-3-branch-management.md — Previous Story Learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

No issues encountered during implementation.

### Completion Notes List

- Created `convex/_helpers/withBranchScope.ts` with two exported functions and one exported type
- `withBranchScope(ctx)` — core branch isolation enforcer. Calls `requireAuth(ctx)`, checks if role is in `HQ_ROLES` (admin/hqStaff) for bypass, blocks non-HQ users without branch assignment
- `requireBranchScope(ctx, branchId)` — convenience variant for mutations with explicit branchId args. Validates user's branch matches or user has all-branch access
- `BranchScope` type exported for downstream consumers: `{ user, userId, branchId, canAccessAllBranches }`
- Reused `HQ_ROLES` from `permissions.ts` instead of creating duplicate `HQ_BYPASS_ROLES` constant (per subtask 1.6 guidance)
- Applied Story 1.3 learning M1: consolidated imports from `permissions.ts` on single line
- `npx tsc --noEmit` — zero errors
- `npx next lint` — zero warnings/errors
- No tests created (per scope boundaries: "Comprehensive automated test suite → Test architecture stories")

### Change Log

- 2026-02-27: Created `convex/_helpers/withBranchScope.ts` with `withBranchScope`, `requireBranchScope`, and `BranchScope` type
- 2026-02-27: Code review fixes — M1: force null branchId for HQ users, L1: remove trailing period from BRANCH_MISMATCH message

## Senior Developer Review (AI)

**Review Date:** 2026-02-27
**Reviewer Model:** Claude Opus 4.6
**Review Outcome:** Approve (with fixes applied)

### Findings Summary

| # | Severity | Issue | Resolution |
|---|---|---|---|
| M1 | MEDIUM | HQ user branchId passthrough — admin/hqStaff with branchId set returned that value instead of null | Fixed: `branchId: canAccessAllBranches ? null : (user.branchId ?? null)` |
| L1 | LOW | BRANCH_MISMATCH message trailing period vs spec | Fixed: removed trailing period |
| L2 | LOW | BranchScope type requires unsafe `!` assertions downstream | Accepted: matches spec design, usage pattern handles safely |

### Action Items

- [x] M1: Force null branchId for HQ/Admin users [withBranchScope.ts:43]
- [x] L1: Remove trailing period from BRANCH_MISMATCH message [withBranchScope.ts:67]
- [x] L2: Accepted as-is — usage pattern documents safe access via `canAccessAllBranches` check

### File List

- `convex/_helpers/withBranchScope.ts` (created, then review-fixed)

# Story 1.6: Audit Trail Foundation

Status: done

## Story

As a **system administrator**,
I want every significant action logged with immutable timestamps,
So that we have a complete audit trail for BIR compliance and fraud prevention.

## Acceptance Criteria

1. **Given** the `auditLogs` table exists in Convex schema **When** any mutation creates, updates, or deletes user/branch/settings data **Then** `_logAuditEntry()` helper in `convex/_helpers/auditLog.ts` creates an immutable log entry
2. **And** each entry records: action type, user ID, branch ID, timestamp, affected entity type, entity ID, before/after values
3. **And** audit logs are append-only (no update or delete mutations exist for this table)
4. **And** `convex/audit/logs.ts` provides query functions for viewing audit trails with branch-scoped access control
5. **And** log write latency is <500ms (simple `ctx.db.insert` — inherently fast)
6. **And** the system is designed for 5-year log retention (Convex retains all data; no TTL needed)

## Tasks / Subtasks

- [x] Task 1: Create `_logAuditEntry()` helper function (AC: #1, #2, #5)
  - [x] 1.1 Create `convex/_helpers/auditLog.ts` exporting `_logAuditEntry(ctx, args)` — takes `MutationCtx` and inserts into `auditLogs` table with `Date.now()` timestamp
  - [x] 1.2 Function signature: `_logAuditEntry(ctx: MutationCtx, args: { action: string; userId: Id<"users">; branchId?: Id<"branches">; entityType: string; entityId: string; before?: Record<string, unknown>; after?: Record<string, unknown> })`
  - [x] 1.3 Handle `branchId` as optional — HQ-initiated actions pass no branchId (stored as `undefined`, omitted by Convex)
  - [x] 1.4 Use `v.optional(v.any())` schema fields for `before`/`after` — pass `undefined` (not `null`) when not applicable so the field is omitted from storage

- [x] Task 2: Create audit log query functions (AC: #4)
  - [x] 2.1 Create `convex/audit/logs.ts` with `getAuditLogs` query — paginated via `.order("desc")` on `by_timestamp` index, returns latest N entries. Uses `withBranchScope(ctx)` — HQ users see all logs, branch users see only their branch logs.
  - [x] 2.2 Add `getAuditLogsByEntity` query — filters by `entityType` and `entityId` using `by_entity` index. Branch-scoped.
  - [x] 2.3 Add `getAuditLogsByUser` query — filters by target `userId` using `by_user` index. Branch-scoped (HQ can query any user, branch users can only query users in their branch).
  - [x] 2.4 All queries return `{ logs: Doc<"auditLogs">[], hasMore: boolean }` pattern for pagination
  - [x] 2.5 Accept `limit` argument (default 50, max 200) and optional `cursor` (timestamp of last item) for offset-based pagination

- [x] Task 3: Ensure append-only constraint (AC: #3)
  - [x] 3.1 Verify NO update or delete mutations exist for `auditLogs` table — the only write path is `_logAuditEntry()` which only calls `ctx.db.insert()`
  - [x] 3.2 This is enforced by convention (no code writes update/delete for auditLogs) — document in helper JSDoc

- [x] Task 4: Integrate audit logging into branch mutations (AC: #1, #2)
  - [x] 4.1 In `convex/auth/branches.ts` → `createBranch`: after insert, call `_logAuditEntry(ctx, { action: "branch.create", userId, entityType: "branches", entityId: newBranchId, after: { name, address, isActive: true } })`
  - [x] 4.2 In `updateBranch`: capture old values before patch, call `_logAuditEntry(ctx, { action: "branch.update", userId, branchId, entityType: "branches", entityId, before: oldValues, after: newValues })`
  - [x] 4.3 In `deactivateBranch`: call `_logAuditEntry(ctx, { action: "branch.deactivate", userId, entityType: "branches", entityId, before: { isActive: true }, after: { isActive: false } })`
  - [x] 4.4 In `reactivateBranch`: call `_logAuditEntry(ctx, { action: "branch.reactivate", userId, entityType: "branches", entityId, before: { isActive: false }, after: { isActive: true } })`

- [x] Task 5: Integrate audit logging into user mutations (AC: #1, #2)
  - [x] 5.1 In `convex/auth/users.ts` → `updateUser`: capture old values, call `_logAuditEntry` with `action: "user.update"`, before/after for changed fields
  - [x] 5.2 In `deactivateUser`: call with `action: "user.deactivate"`, before: `{ isActive: true }`, after: `{ isActive: false }`
  - [x] 5.3 In `reactivateUser`: call with `action: "user.reactivate"`, before: `{ isActive: false }`, after: `{ isActive: true }`
  - [x] 5.4 In `updateRole` (internalMutation): add `actingUserId: v.id("users")` argument. The `setUserRole` action passes the admin's userId. Call `_logAuditEntry` with `action: "user.roleChange"`, before: `{ role: oldRole }`, after: `{ role: newRole }`
  - [x] 5.5 In `updateBranch` (internalMutation — the user branch assignment one): add `actingUserId: v.id("users")` argument. The `assignBranch` action passes the admin's userId. Call `_logAuditEntry` with `action: "user.branchAssign"`, before: `{ branchId: oldBranchId }`, after: `{ branchId: newBranchId }`
  - [x] 5.6 Update `setUserRole` action to pass `actingUserId` to `updateRole` internal mutation
  - [x] 5.7 Update `assignBranch` action to pass `actingUserId` to `updateBranch` internal mutation

- [x] Task 6: Integrate audit logging into settings mutations (AC: #1, #2)
  - [x] 6.1 In `convex/admin/settings.ts` → `updateSetting`: capture old value (if exists), call `_logAuditEntry` with `action: "setting.update"`, entityType: `"settings"`, entityId: the key, before/after values

- [x] Task 7: Verify integration (AC: all)
  - [x] 7.1 Run `npx tsc --noEmit` — zero TypeScript errors
  - [x] 7.2 Run `npx next lint` — zero lint warnings/errors

## Dev Notes

### Architecture Decisions (MUST FOLLOW)

**Audit Log Helper — Architecture Mandated (line 434, 512):**
- Internal function naming: `_` prefix → `_logAuditEntry`
- Location: `convex/_helpers/auditLog.ts`
- Called from every mutation that modifies data
- Pattern: `await _logAuditEntry(ctx, "transaction.created", transactionId);`
- [Source: architecture.md — Core Enforcement, line 434]

**Audit Log Table Schema (already exists from Story 1.1):**
```typescript
auditLogs: defineTable({
  action: v.string(),
  userId: v.id("users"),
  branchId: v.optional(v.id("branches")),
  entityType: v.string(),
  entityId: v.string(),
  before: v.optional(v.any()),
  after: v.optional(v.any()),
  timestamp: v.number(),
})
  .index("by_branch", ["branchId"])
  .index("by_user", ["userId"])
  .index("by_entity", ["entityType", "entityId"])
  .index("by_timestamp", ["timestamp"]),
```
- [Source: convex/schema.ts — lines 181-194]

**Audit Query Module (architecture line 548-550):**
```
├── audit/
│   ├── logs.ts                    # Audit log queries, retention
```
- [Source: architecture.md — Module Structure, lines 548-550]

**Immutability Constraint (architecture line 75):**
- "Immutable logs for all financial transactions and stock movements. 5-year retention."
- Append-only: NO update or delete mutations for `auditLogs` table
- Convex retains all data indefinitely; 5-year retention is automatic
- [Source: architecture.md — Audit Trail, line 75]

**Action Naming Convention:**
Use dot-notation for action types to make them filterable:
- `branch.create`, `branch.update`, `branch.deactivate`, `branch.reactivate`
- `user.update`, `user.deactivate`, `user.reactivate`, `user.roleChange`, `user.branchAssign`
- `setting.update`
- Future epics will add: `transaction.create`, `inventory.update`, `transfer.request`, etc.

**Branch Scope for Queries:**
- HQ users (admin, hqStaff): see all audit logs across all branches
- Branch users: see only audit logs for their branch
- Use `withBranchScope(ctx)` in every query
- Branch mutations pass the branch being modified as the `branchId` for the audit entry
- User mutations pass the target user's `branchId` (if assigned)
- [Source: architecture.md — Auth Boundary, lines 685-688]

### Scope Boundaries — DO NOT IMPLEMENT

- **UI for viewing audit logs** → Future admin dashboard story
- **Audit logging for transactions/inventory/transfers** → Epics 3-6 (when those mutations are created)
- **Audit log export or download** → Future reporting story
- **Automated alerts based on audit patterns** → Future monitoring story
- **Audit log cleanup/archival** → Not needed (Convex retains data indefinitely)
- Do NOT audit webhook-initiated mutations (createFromWebhook, updateFromWebhook, deactivateByClerkId) — these are system events without a user actor; they can be audited later if needed

### Existing Code to Build Upon (Stories 1.1-1.5)

**Already exists — DO NOT recreate:**
- `convex/schema.ts` — `auditLogs` table with 4 indexes (by_branch, by_user, by_entity, by_timestamp)
- `convex/_helpers/permissions.ts` — `requireAuth()`, `requireRole()`, role group constants
- `convex/_helpers/withBranchScope.ts` — Branch isolation helper (use in audit queries)
- `convex/auth/users.ts` — User mutations to instrument with audit logging
- `convex/auth/branches.ts` — Branch mutations to instrument with audit logging
- `convex/admin/settings.ts` — Settings mutations to instrument with audit logging
- `lib/constants.ts` — ERROR_CODES, ROLES constants

**Existing mutations to instrument (13 total):**

| File | Mutation | Action Type | Notes |
|------|----------|-------------|-------|
| `convex/auth/branches.ts` | `createBranch` | `branch.create` | Capture new branch data in `after` |
| `convex/auth/branches.ts` | `updateBranch` | `branch.update` | Capture old/new values |
| `convex/auth/branches.ts` | `deactivateBranch` | `branch.deactivate` | before: active, after: inactive |
| `convex/auth/branches.ts` | `reactivateBranch` | `branch.reactivate` | before: inactive, after: active |
| `convex/auth/users.ts` | `updateUser` | `user.update` | Capture changed fields only |
| `convex/auth/users.ts` | `deactivateUser` | `user.deactivate` | before: active, after: inactive |
| `convex/auth/users.ts` | `reactivateUser` | `user.reactivate` | before: inactive, after: active |
| `convex/auth/users.ts` | `updateRole` (internal) | `user.roleChange` | Add `actingUserId` arg |
| `convex/auth/users.ts` | `updateBranch` (internal) | `user.branchAssign` | Add `actingUserId` arg |
| `convex/admin/settings.ts` | `updateSetting` | `setting.update` | Capture old/new key-value |

**NOT audited (out of scope):**
- `createFromWebhook` — system event, no user actor
- `updateFromWebhook` — system event, no user actor
- `deactivateByClerkId` — system event, no user actor
- `setUserRole` action — audit happens in `updateRole` internal mutation
- `assignBranch` action — audit happens in `updateBranch` internal mutation

**Key patterns from existing code:**
- `requireAuth(ctx)` returns user document with `_id` (use as `userId` for audit entries)
- `requireRole(ctx, ADMIN_ROLES)` validates admin access before mutation
- `withBranchScope(ctx)` returns `{ user, userId, branchId, canAccessAllBranches }` for queries
- Convex `v.optional(v.any())` for before/after fields — pass `undefined` to omit
- `Doc<"auditLogs">` type for query return values

### Previous Story Learnings (from Stories 1.2-1.5)

- **ConvexError pattern:** Use `ConvexError` from `convex/values` with `{ code, message }` — relevant for audit query error handling
- **Import consolidation:** Combine imports from same module on single line
- **JSON serialization:** `undefined` values stripped — use explicit `undefined` (not `null`) for optional fields in Convex to omit them from storage
- **Force null for HQ branchId:** `withBranchScope` returns `branchId: null` for HQ users — audit queries must handle `branchId === null` meaning "show all branches"
- **TypeScript strict:** Always run `tsc --noEmit` and `next lint` before marking complete
- **Route groups vs regular folders:** Route groups `(name)` don't create URL segments — Story 1.5 review fix. Not directly relevant to audit trail but good to know for any future UI work.

### Project Structure Notes

```
Files to CREATE in this story:
├── convex/
│   ├── _helpers/
│   │   └── auditLog.ts              # _logAuditEntry() helper function
│   └── audit/
│       └── logs.ts                   # Audit log query functions

Files to MODIFY in this story:
├── convex/
│   ├── auth/
│   │   ├── branches.ts              # Add audit logging to 4 mutations
│   │   └── users.ts                 # Add audit logging to 5 mutations + update 2 actions
│   └── admin/
│       └── settings.ts              # Add audit logging to updateSetting

Files to reference (NOT modify):
├── convex/schema.ts                  # auditLogs table definition
├── convex/_helpers/permissions.ts    # requireAuth, requireRole, role constants
├── convex/_helpers/withBranchScope.ts # Branch scope helper for queries
├── lib/constants.ts                  # ERROR_CODES, ROLES
├── lib/types.ts                      # Doc type aliases
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Audit Trail, line 75]
- [Source: _bmad-output/planning-artifacts/architecture.md — Core Enforcement, line 434]
- [Source: _bmad-output/planning-artifacts/architecture.md — Internal Function Naming, line 396]
- [Source: _bmad-output/planning-artifacts/architecture.md — Module Structure, lines 548-550]
- [Source: _bmad-output/planning-artifacts/architecture.md — Auth Boundary, lines 685-688]
- [Source: _bmad-output/planning-artifacts/architecture.md — NFR16 5-year retention, line 775]
- [Source: _bmad-output/planning-artifacts/epics.md — Story 1.6, lines 405-421]
- [Source: convex/schema.ts — auditLogs table, lines 181-194]
- [Source: convex/_helpers/permissions.ts — requireAuth, role constants]
- [Source: convex/_helpers/withBranchScope.ts — Branch scope helper]
- [Source: convex/auth/users.ts — User mutations to instrument]
- [Source: convex/auth/branches.ts — Branch mutations to instrument]
- [Source: convex/admin/settings.ts — Settings mutation to instrument]
- [Source: _bmad-output/implementation-artifacts/1-5-route-group-structure-and-interface-layouts.md — Previous Story Learnings]

## Senior Developer Review (AI)

**Review Date:** 2026-02-27
**Reviewer:** Claude Opus 4.6 (adversarial code review)
**Outcome:** Approve (after fixes)

### Findings Summary

| # | Severity | Description | Status |
|---|----------|-------------|--------|
| H1 | HIGH | `.collect()` in 3 query paths loads unbounded audit data into memory | [x] Fixed — replaced with streaming `.filter()` + `.take(limit + 1)` |
| H2 | HIGH | HQ cursor uses `.filter()` instead of index range bounds — full scan | [x] Fixed — uses `.withIndex("by_timestamp", q => q.lt(...))` |
| M1 | MEDIUM | Phantom audit entries on Clerk API failure (rollback doesn't reverse audit) | [x] Fixed — documented as accepted trade-off via JSDoc |
| M2 | MEDIUM | `updateUser` doesn't verify target user exists before patching | [x] Fixed — added `NOT_FOUND` ConvexError guard |
| L1 | LOW | Inconsistent ordering between HQ (timestamp index) and branch (creation time) paths | Accepted — ordering is close enough and cursor filtering works correctly as streaming filter |

### Action Items

- [x] H1: Replace `.collect()` with `.filter()` + `.take(limit + 1)` in `getAuditLogs` branch path, `getAuditLogsByEntity`, `getAuditLogsByUser`
- [x] H2: Use index range bounds in `getAuditLogs` HQ path: `.withIndex("by_timestamp", q => q.lt(...))`
- [x] M1: Add JSDoc to `setUserRole` and `assignBranch` documenting phantom audit entry trade-off
- [x] M2: Add `if (!existing) throw new ConvexError({ code: "NOT_FOUND" })` in `updateUser`

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- Created `_logAuditEntry()` helper with full JSDoc documenting append-only constraint and usage patterns
- Implemented 3 paginated audit log query functions (getAuditLogs, getAuditLogsByEntity, getAuditLogsByUser) with branch-scoped access control via `withBranchScope()`
- Instrumented 10 mutations across 3 files with audit logging: 4 branch mutations, 5 user mutations (including 2 internal mutations with new `actingUserId` parameter), 1 settings mutation
- Updated `setUserRole` and `assignBranch` actions to pass `actingUserId` (caller._id) to internal mutations for audit attribution
- Internal mutations `updateRole` and `updateBranch` use `v.optional(v.id("users"))` for `actingUserId` to maintain backward compatibility with rollback calls (which don't pass actingUserId)
- Audit logging only fires when `actingUserId` is provided, preventing duplicate audit entries during rollback scenarios
- All queries use cursor-based pagination with `{ logs, hasMore }` return pattern, limit clamped to 1-200
- `tsc --noEmit` and `next lint` both pass with zero errors

### Change Log

- 2026-02-27: Implemented audit trail foundation — created helper, queries, and instrumented 10 mutations
- 2026-02-27: Code review fixes — replaced .collect() with streaming .filter()+.take() in all queries, added index range bounds for HQ cursor, added NOT_FOUND guard to updateUser, documented phantom audit entry trade-off on Clerk actions

### File List

**Created:**
- `convex/_helpers/auditLog.ts` — `_logAuditEntry()` helper function
- `convex/audit/logs.ts` — Audit log query functions (getAuditLogs, getAuditLogsByEntity, getAuditLogsByUser)

**Modified:**
- `convex/auth/branches.ts` — Added audit logging to createBranch, updateBranch, deactivateBranch, reactivateBranch
- `convex/auth/users.ts` — Added audit logging to updateUser, deactivateUser, reactivateUser, updateRole (internal), updateBranch (internal); updated setUserRole and assignBranch actions to pass actingUserId
- `convex/admin/settings.ts` — Added audit logging to updateSetting

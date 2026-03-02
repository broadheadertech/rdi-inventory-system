# Story 8.5: Reservation Management & Expiry

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Branch Staff member**,
I want to receive notifications when customer reservations expire unfulfilled,
so that I am aware of missed pickups and can follow up if needed.

## Pre-Implementation Analysis

**CRITICAL FINDING:** Most acceptance criteria from the epics file for Story 8.5 were **already implemented in Story 8.4**:

| AC | Description | Status |
|---|---|---|
| Staff see pending reservations with details | `app/branch/reservations/page.tsx` — filter tabs, table with all fields | **Done in 8.4** |
| Mark reservation as "Fulfilled" | `convex/reservations/manage.ts` → `fulfillReservation` mutation | **Done in 8.4** |
| `expireReservations` runs hourly | `convex/crons.ts` → hourly cron calling `expiry.ts` | **Done in 8.4** |
| Expired reservations release stock | `convex/reservations/expiry.ts` restores inventory +1 | **Done in 8.4** |
| Status tracked: Pending → Fulfilled/Expired | Schema uses typed union, all transitions work | **Done in 8.4** |
| **Staff receive notification when reservation expires** | NOT implemented — no email/notification system exists | **THIS STORY** |

**This story's unique scope:** Implement staff notification when reservations expire, using Resend email per architecture spec.

## Acceptance Criteria

1. **Given** a reservation expires (via the hourly `expireReservations` cron)
   **When** the reservation status changes from "pending" to "expired"
   **Then** branch staff (manager and admin roles for that branch) receive an email notification with: customer name, phone, product details, confirmation code, and branch name

2. **Given** the Resend API key is configured in Convex environment variables
   **When** an expiry notification email is sent
   **Then** it uses the `send[Event]Email` Convex action pattern per architecture spec (Addendum 9)
   **And** the email is formatted with clear subject and body identifying the expired reservation

3. **Given** the Resend API key is NOT configured (dev/staging environments)
   **When** an expiry notification would be sent
   **Then** the action logs a warning and does NOT throw an error (graceful degradation)

4. **Given** multiple reservations expire in a single cron run
   **When** notifications are sent
   **Then** each expired reservation triggers its own notification email

## Tasks / Subtasks

- [x] Task 1: Create `convex/reservations/notifications.ts` — Resend email action (AC: 1, 2, 3)
  - [x] 1.1 Create `sendReservationExpiredEmail` as a Convex **action** (not mutation — email is external side effect per architecture convention)
  - [x] 1.2 Args: `reservationId: v.id("reservations")` — action fetches all needed data internally via `ctx.runQuery`
  - [x] 1.3 Import and initialize Resend with `process.env.RESEND_API_KEY` inside the action handler
  - [x] 1.4 Fetch reservation, variant, style, branch data to build email content
  - [x] 1.5 Query staff users (role: "admin" or "manager") assigned to the reservation's branch (`users` table, filter by `branchId` and role)
  - [x] 1.6 Send email via `resend.emails.send()` with: from `noreply@yourdomain.com` (configurable), to staff email(s), subject: `[RedBox] Reservation Expired — {confirmationCode}`, HTML body with: customer name, phone, product (style + size + color), branch name, confirmation code, expiry time
  - [x] 1.7 If `RESEND_API_KEY` is not set, `console.warn` and return early — do NOT throw
  - [x] 1.8 If Resend API call fails, log error but do NOT throw (email failure should not block cron)

- [x] Task 2: Update `convex/reservations/expiry.ts` to trigger notification action (AC: 1, 4)
  - [x] 2.1 Import `api` from `../_generated/api` for action reference
  - [x] 2.2-2.4 Used preferred simpler approach: kept `expireReservations` as `internalMutation` and used `ctx.scheduler.runAfter` to schedule email action (mutations CAN schedule actions, avoiding internalAction wrapping complexity)
  - [x] 2.5 For each expired reservation ID, call `ctx.scheduler.runAfter(0, api.reservations.notifications.sendReservationExpiredEmail, { reservationId })` to schedule the email
  - [x] 2.6 No changes needed to `convex/crons.ts` — still points to `internal.reservations.expiry.expireReservations` (remains internalMutation)

- [x] Task 3: Add `RESEND_API_KEY` to environment configuration (AC: 2, 3)
  - [x] 3.1 Add `RESEND_API_KEY` to `.env.example` with comment: `# Resend API key for email notifications (optional — emails disabled if not set)`
  - [x] 3.2 Document in story completion notes that `npx convex env set RESEND_API_KEY <key>` must be run for production

- [x] Task 4: Validation (AC: all)
  - [x] 4.1 Run `npx convex codegen` — verify 0 errors
  - [x] 4.2 Run `npx tsc --noEmit` — verify 0 errors
  - [x] 4.3 Run `npx next lint` — verify 0 errors/warnings

## Dev Notes

### Architecture Compliance

- **Email actions are Convex actions, NOT mutations** — per architecture Addendum 9: "All use Resend via Convex actions (not mutations, since email is an external side effect)"
- **Naming convention:** `send[Event]Email` — so `sendReservationExpiredEmail`
- **Co-location:** Email action goes in `convex/reservations/notifications.ts` — per architecture: "Email-sending actions co-located with feature modules"
- **Resend package** already installed: `resend@^6.9.2` in `package.json`

### Critical Implementation Details

- **Action vs Mutation architecture:** The current `expireReservations` is an `internalMutation`. To call a Convex action (email), you can't call actions from mutations directly. The pattern is:
  1. Convert `expireReservations` to an `internalAction`
  2. Extract the DB work into a separate `_expireReservationsBatch` internal mutation that returns expired IDs
  3. The action calls the mutation, gets the IDs, then schedules email actions
  - **Alternative simpler approach:** Keep `expireReservations` as a mutation and use `ctx.scheduler.runAfter(0, ...)` to schedule the action. Mutations CAN schedule actions — this avoids the action-wrapping complexity. **This is the PREFERRED approach.**

- **Preferred approach (simpler):** Keep `expireReservations` as `internalMutation`. After each reservation is expired, use `ctx.scheduler.runAfter(0, api.reservations.notifications.sendReservationExpiredEmail, { reservationId })` directly from the mutation. This is valid because `ctx.scheduler.runAfter` can schedule actions from mutations.

- **Resend initialization:** `new Resend(process.env.RESEND_API_KEY)` — must be inside the action handler, not at module level
- **"use node"** directive: Resend requires Node.js runtime. Add `"use node";` at the top of `notifications.ts`
- **From address:** Use Resend's default `onboarding@resend.dev` for development, or configure a domain-verified sender for production
- **Staff email lookup:** Query `users` table where `branchId === reservation.branchId` AND role is "admin" or "manager". Users have an `email` field (confirmed in schema)

### Existing Code to Reference

- **Reservation schema:** `convex/schema.ts:275-296` — `reservations` table with status union type, all indexes
- **Expiry cron:** `convex/crons.ts:15-20` — hourly `expire-reservations` interval
- **Expiry mutation:** `convex/reservations/expiry.ts` — current implementation queries pending, filters expired, patches status, restores inventory
- **Manage mutations:** `convex/reservations/manage.ts` — `fulfillReservation`, `cancelReservation` with role checks and audit logging
- **Action example:** `convex/catalog/bulkImport.ts:280` — existing `action()` pattern in codebase
- **User schema:** `convex/schema.ts:5-7` — users have `email: v.string()`, `role`, `branchId` fields

### What NOT To Do

- Do NOT create a new branch staff UI — `app/branch/reservations/page.tsx` already exists with full management UI (done in Story 8.4)
- Do NOT duplicate expiry logic — enhance the existing `expiry.ts`, don't create a parallel flow
- Do NOT make email failures block the cron — graceful degradation is critical
- Do NOT use `console.log` in production code except for the existing expiry count log — use `console.warn` for missing API key

### Project Structure Notes

- Alignment: `convex/reservations/notifications.ts` follows the co-location pattern used by all other feature modules
- No new route groups or pages needed — this is purely backend notification work
- The `"use node"` directive is required for Resend SDK (Node.js runtime, not Convex edge runtime)

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Addendum 9] — Email notification triggers, naming convention, Resend pattern
- [Source: _bmad-output/planning-artifacts/architecture.md#Convex Function Naming] — `send[Event]Email` convention for actions
- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.5] — Acceptance criteria, user story
- [Source: convex/reservations/expiry.ts] — Current expiry implementation to enhance
- [Source: convex/catalog/bulkImport.ts:280] — Existing action() pattern reference
- [Source: package.json] — resend@^6.9.2 confirmed installed

## Previous Story Intelligence

### Story 8.4 Learnings (Reserve-for-Pickup Flow)

- **Code review found 8 issues** — 2 HIGH, 3 MEDIUM, 3 LOW. Key fixes applied:
  - H1: Silent error swallowing in branch staff page — fixed with toast notifications
  - H2: `fulfillReservation` didn't check expiry time — added auto-expire check before fulfilling
  - M3: Schema `status` was `v.string()` — changed to `v.union(v.literal(...))` for type safety
  - The `statusFilter` arg type had to be updated to match the new schema union type
- **Pattern established:** Branch staff pages use `requireRole()` + `withBranchScope()` for access control
- **Toast pattern:** Import `toast` from `"sonner"`, use `toast.success()` / `toast.error()` for user feedback
- **Audit logging:** All state-changing mutations call `_logAuditEntry()` with before/after snapshots

### Git Intelligence

- Only 1 commit exists (initial Next.js scaffolding). All implementation work is uncommitted.
- No granular git history to analyze for patterns.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Codegen, tsc, lint all passed with 0 errors on first run

### Completion Notes List

- Created `sendReservationExpiredEmail` Convex action in `convex/reservations/notifications.ts` with `"use node"` directive for Resend SDK
- Data-fetching internal query `_getReservationNotificationData` added to `manage.ts` (queries can't run in Node.js runtime, so separated from action file)
- Used preferred simpler approach: kept `expireReservations` as `internalMutation` with `ctx.scheduler.runAfter` to schedule email actions (avoids internalAction wrapping complexity)
- Each expired reservation schedules its own email notification independently
- Graceful degradation: missing RESEND_API_KEY logs warning and skips; Resend API failures are caught and logged without throwing
- Email includes: confirmation code, customer name/phone, product details (style + size + color), branch name, expiry timestamp in PHT
- Staff recipients: active users with role "admin" or "manager" assigned to the reservation's branch
- Production setup: `npx convex env set RESEND_API_KEY <key>` required for email delivery

### Code Review Fixes Applied

- **H1 (XSS):** Added `escapeHtml()` helper — all user-provided values (customerName, customerPhone, confirmationCode, product, branch, date) are HTML-escaped before embedding in email template
- **H2 (Security):** Changed `sendReservationExpiredEmail` from public `action` to `internalAction` — prevents unauthorized client invocation. Updated `expiry.ts` to use `internal.` reference instead of `api.`
- **M1 (Config):** Made email "from" address configurable via `RESEND_FROM_EMAIL` env var, with fallback to Resend sandbox (`onboarding@resend.dev`)
- **M2 (Audit):** Not fixed — `_logAuditEntry` requires `userId` which is unavailable in cron context. Existing `console.log` provides basic logging. Full audit support for system-initiated actions would require modifying the audit helper (out of scope)

### File List

- `convex/reservations/notifications.ts` (NEW) — Resend internalAction for expiry notifications with HTML escaping
- `convex/reservations/manage.ts` (MODIFIED) — Added `_getReservationNotificationData` internalQuery, added `internalQuery` import
- `convex/reservations/expiry.ts` (MODIFIED) — Added `internal` import and `ctx.scheduler.runAfter` call for email notification after each expiry
- `.env.example` (MODIFIED) — Added `RESEND_API_KEY` and `RESEND_FROM_EMAIL` environment variable documentation

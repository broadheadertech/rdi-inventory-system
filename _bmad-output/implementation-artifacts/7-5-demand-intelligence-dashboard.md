# Story 7.5: Demand Intelligence Dashboard

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As **HQ Staff**,
I want to view demand trends across all branches,
so that I can identify what products customers want and make informed purchasing decisions.

## Acceptance Criteria

1. **Given** an HQ Staff user navigates to the demand intelligence section
   **When** they view the demand dashboard
   **Then** they can see all demand log entries across branches, filterable by date, branch, brand

2. **And** a weekly summary shows top-requested items/brands (top 10 trending)

3. **And** the `generateDemandSummary` scheduled function aggregates data weekly (Monday 6 AM PHT)

4. **And** demand trends are visualized with Recharts (bar charts, trend lines)

5. **And** DemandLogEntry components show: product, size, branch, timestamp, status (Logged/Trending/Fulfilled)

6. **And** entries marked as "Trending" (multiple requests for same item) are highlighted

## Tasks / Subtasks

- [x] Task 1: Add `demandWeeklySummaries` table to `convex/schema.ts` (AC: 2, 3)
  - [x] 1.1 Add table definition: `weekStart: v.number()` (Monday 00:00 PHT as UTC ms), `brand: v.string()`, `requestCount: v.number()`, `topDesigns: v.array(v.object({ design: v.string(), count: v.number() }))`, `topSizes: v.array(v.object({ size: v.string(), count: v.number() }))`, `branchBreakdown: v.array(v.object({ branchId: v.id("branches"), count: v.number() }))`, `generatedAt: v.number()`
  - [x] 1.2 Add indexes: `.index("by_week", ["weekStart"])` and `.index("by_week_brand", ["weekStart", "brand"])`
  - [x] 1.3 Insert table AFTER `demandLogs` definition (line 216) and BEFORE `auditLogs` definition (line 218)

- [x] Task 2: Create `convex/demand/summaries.ts` — weekly aggregation + queries (AC: 2, 3)
  - [x] 2.1 Import `internalMutation, query` from `../_generated/server`; import `internal` from `../_generated/api`; import `requireRole, HQ_ROLES` from `../_helpers/permissions`; import `v` from `convex/values`
  - [x] 2.2 Implement `generateWeeklySummary` as `internalMutation` (no args) — compute the Monday-to-Sunday window for the PREVIOUS week (PHT), query all `demandLogs` in that window using `by_date` index, aggregate by brand (count requests, top designs, top sizes, branch breakdown), insert one `demandWeeklySummaries` row per brand, set `generatedAt: Date.now()`
  - [x] 2.3 Implement `getWeeklySummaries` as `query` — args `{ weeks: v.optional(v.number()) }` (default 8), `requireRole(ctx, HQ_ROLES)`, query `demandWeeklySummaries` using `by_week` index, order desc, take N weeks of data, return array ready for Recharts consumption (grouped by week → brands)
  - [x] 2.4 Implement `getLatestWeekTopBrands` as `query` — args `{ limit: v.optional(v.number()) }` (default 10), `requireRole(ctx, HQ_ROLES)`, query latest week's summaries, sort by `requestCount` desc, take top N, return with branch breakdown

- [x] Task 3: Update `convex/crons.ts` — add weekly demand summary cron (AC: 3)
  - [x] 3.1 Add: `crons.weekly("demand-summary", { dayOfWeek: "sunday", hourUTC: 22, minuteUTC: 0 }, internal.demand.summaries.generateWeeklySummary)` — this is Monday 6:00 AM PHT (UTC+8)
  - [x] 3.2 Place AFTER the existing `low-stock-sweep` cron entry

- [x] Task 4: Create `convex/dashboards/demandIntelligence.ts` — HQ real-time queries (AC: 1, 4, 5, 6)
  - [x] 4.1 Implement `getDemandEntries` query — args `{ dateStart: v.number(), dateEnd: v.number(), branchId: v.optional(v.id("branches")), brand: v.optional(v.string()), limit: v.optional(v.number()) }` — `requireRole(ctx, HQ_ROLES)`, query `demandLogs` using `by_date` index with `.gte("createdAt", dateStart).lte("createdAt", dateEnd)`, filter by branchId/brand if provided, take `limit ?? 50`, batch-fetch branch names and user names via `Promise.all`, compute `trendingKey = brand + "|" + (design ?? "")` for each entry
  - [x] 4.2 Implement `getDemandMetrics` query — args `{ dateStart: v.number(), dateEnd: v.number() }` — `requireRole(ctx, HQ_ROLES)`, collect ALL demandLogs in range via `by_date` index, compute: `totalEntries`, `uniqueBrands` (Set size), `topBrand` (brand with highest count), `trendingCount` (brand+design combos with 3+ occurrences)
  - [x] 4.3 Implement `getTopDemandedBrands` query — args `{ dateStart: v.number(), dateEnd: v.number(), limit: v.optional(v.number()) }` — `requireRole(ctx, HQ_ROLES)`, aggregate demandLogs by brand, sort desc by count, take top `limit ?? 10`, return `{ brand: string, count: number }[]` ready for Recharts BarChart
  - [x] 4.4 Implement `getDemandTrendByDay` query — args `{ dateStart: v.number(), dateEnd: v.number() }` — `requireRole(ctx, HQ_ROLES)`, collect all demandLogs in range, bucket by PHT calendar day, return `{ date: string, count: number }[]` (YYYY-MM-DD format) ready for Recharts LineChart

- [x] Task 5: Create `app/hq/demand/page.tsx` — Demand Intelligence Dashboard UI (AC: 1, 2, 4, 5, 6)
  - [x] 5.1 Add `"use client"` directive; import `useState` from React; import `useQuery` from `convex/react`; import `api` from `@/convex/_generated/api`; import Recharts components: `{ BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend }` from `recharts`
  - [x] 5.2 Reuse the date helper pattern from `app/hq/reports/page.tsx`: `toYYYYMMDD`, `toInputDate`, `fromInputDate`, `getPresetDates` — copy inline (do NOT import from reports page; keep pages self-contained)
  - [x] 5.3 Add `dateToMs(yyyymmdd: string): number` helper — converts YYYYMMDD to PHT midnight UTC ms (same logic as `getPHTDayStartMs` from `hqDashboard.ts` but for arbitrary dates) — needed for Convex query args that expect millisecond timestamps
  - [x] 5.4 Wire date range state: `dateStart`, `dateEnd`, `activePreset`, `branchId`, `brandFilter` — same pattern as reports page
  - [x] 5.5 Wire 4 queries: `getDemandMetrics(dateStart, dateEnd)`, `getTopDemandedBrands(dateStart, dateEnd)`, `getDemandTrendByDay(dateStart, dateEnd)`, `getDemandEntries(dateStart, dateEnd, branchId, brand, limit: 50)`
  - [x] 5.6 Render metric cards row: Total Demand Entries, Unique Brands Requested, Top Brand (name + count), Trending Items (3+ requests)
  - [x] 5.7 Render Recharts `<BarChart>` inside `<ResponsiveContainer width="100%" height={300}>` — Top 10 Demanded Brands; use `<Bar dataKey="count" fill="hsl(var(--primary))" />` with `<XAxis dataKey="brand" />` and `<YAxis />`
  - [x] 5.8 Render Recharts `<LineChart>` inside `<ResponsiveContainer width="100%" height={300}>` — Daily Demand Trend; use `<Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" />` with date XAxis
  - [x] 5.9 Render demand entries table: Brand, Design, Size, Branch, Logged By, Time, Status badge — "Trending" badge (amber background) when `trendingKey` has 3+ occurrences in the current result set, else "Logged" (default)
  - [x] 5.10 Loading states: animate-pulse skeletons for metric cards, chart containers, and table rows; empty state messages when no data
  - [x] 5.11 All date range filter controls: preset buttons (Today, Yesterday, This Week, This Month) + custom date inputs + branch dropdown (load branches from `api.dashboards.birReports.listActiveBranches`) + brand text filter

- [x] Task 6: Run `npx convex codegen` after schema change + new Convex files
- [x] Task 7: Validate TypeScript — `npx tsc --noEmit` → 0 errors
- [x] Task 8: Validate linting — `npx next lint` → 0 warnings
- [x] Task 9: Update this story Status to "review" and sprint-status.yaml to "review"

## Dev Notes

### Schema Change — `demandWeeklySummaries` Table

This story REQUIRES adding a new table to `convex/schema.ts`. Insert it between `demandLogs` (line 216) and `auditLogs` (line 218):

```typescript
demandWeeklySummaries: defineTable({
  weekStart: v.number(),        // Monday 00:00 PHT as UTC ms
  brand: v.string(),            // Brand name (string, not ID — matches demandLogs.brand)
  requestCount: v.number(),     // Total requests for this brand in this week
  topDesigns: v.array(v.object({
    design: v.string(),
    count: v.number(),
  })),
  topSizes: v.array(v.object({
    size: v.string(),
    count: v.number(),
  })),
  branchBreakdown: v.array(v.object({
    branchId: v.id("branches"),
    count: v.number(),
  })),
  generatedAt: v.number(),
})
  .index("by_week", ["weekStart"])
  .index("by_week_brand", ["weekStart", "brand"]),
```

**One row per brand per week.** The weekly cron generates these rows. The HQ dashboard queries them for trend charts.

### Existing `demandLogs` Table (DO NOT Modify)

Already defined in `convex/schema.ts` (lines 206-216):

```typescript
demandLogs: defineTable({
  branchId: v.id("branches"),
  loggedById: v.id("users"),
  brand: v.string(),            // brand NAME string, NOT brandId reference
  design: v.optional(v.string()),
  size: v.optional(v.string()),
  notes: v.optional(v.string()),
  createdAt: v.number(),
})
  .index("by_branch", ["branchId"])
  .index("by_date", ["createdAt"]),
```

**`by_date` index** is the key index for this story. Use for date-range queries:
```typescript
const logs = await ctx.db
  .query("demandLogs")
  .withIndex("by_date", (q) => q.gte("createdAt", startMs).lte("createdAt", endMs))
  .collect();
```

### HQ Query Pattern (DO NOT use `withBranchScope`)

HQ dashboard queries use `requireRole(ctx, HQ_ROLES)` — NOT `withBranchScope`. HQ staff see ALL branches. Follow the pattern from `convex/dashboards/hqDashboard.ts`:

```typescript
import { query } from "../_generated/server";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";

export const getDemandMetrics = query({
  args: { dateStart: v.number(), dateEnd: v.number() },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES); // ["admin", "hqStaff"]
    // Query all branches' data — no branch scoping
    const logs = await ctx.db
      .query("demandLogs")
      .withIndex("by_date", (q) =>
        q.gte("createdAt", args.dateStart).lte("createdAt", args.dateEnd)
      )
      .collect();
    // Aggregate in-memory...
  },
});
```

[Source: `convex/dashboards/hqDashboard.ts` lines 1-7 — HQ_ROLES pattern, no withBranchScope]

### PHT Timezone Handling (UTC+8)

All date/time calculations must account for Philippine Time. The established pattern is in `hqDashboard.ts`:

```typescript
const PHT_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

function getPHTDayStartMs(): number {
  const nowUtcMs = Date.now();
  const nowPhtMs = nowUtcMs + PHT_OFFSET_MS;
  const todayPhtStartMs = nowPhtMs - (nowPhtMs % (24 * 60 * 60 * 1000));
  return todayPhtStartMs - PHT_OFFSET_MS; // convert back to UTC ms
}
```

For the weekly cron, compute Monday 00:00 PHT → Sunday 23:59:59 PHT for the PREVIOUS week.

For the frontend `dateToMs` helper, convert YYYYMMDD string to PHT midnight UTC ms:
```typescript
function dateToMs(yyyymmdd: string): number {
  const y = parseInt(yyyymmdd.slice(0, 4));
  const m = parseInt(yyyymmdd.slice(4, 6)) - 1;
  const d = parseInt(yyyymmdd.slice(6, 8));
  // Construct PHT midnight, convert to UTC ms
  const phtMidnight = Date.UTC(y, m, d, 0, 0, 0) - (8 * 60 * 60 * 1000);
  return phtMidnight;
}
```

Use `dateToMs(dateStart)` and `dateToMs(dateEnd) + 86400000 - 1` for inclusive day ranges.

### Recharts v3 — First Usage in Codebase

`recharts@^3.7.0` is installed (`package.json` line 32) but NOT used anywhere yet. This page establishes the Recharts pattern.

**Import pattern:**
```tsx
import {
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
```

**Wrapper pattern** (responsive container is REQUIRED — bare charts don't resize):
```tsx
<div className="rounded-lg border p-4">
  <h2 className="mb-4 text-sm font-semibold">Top Demanded Brands</h2>
  <ResponsiveContainer width="100%" height={300}>
    <BarChart data={topBrandsData}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="brand" tick={{ fontSize: 12 }} />
      <YAxis />
      <Tooltip />
      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
</div>
```

**Color tokens:** Use `hsl(var(--primary))` for primary bar/line color, `hsl(var(--muted-foreground))` for secondary. These integrate with the existing Tailwind/shadcn theme.

**Empty chart state:** When data is `undefined` or `[]`, show skeleton or "No demand data for this period." message — do NOT render an empty chart.

### Cron Job Pattern

Existing cron in `convex/crons.ts`:
```typescript
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("low-stock-sweep", { hours: 1 }, internal.inventory.alerts.sweepLowStock);

// Add weekly demand summary here:
// Monday 6 AM PHT = Sunday 22:00 UTC
crons.weekly(
  "demand-summary",
  { dayOfWeek: "sunday", hourUTC: 22, minuteUTC: 0 },
  internal.demand.summaries.generateWeeklySummary
);

export default crons;
```

**CRITICAL:** `crons.weekly()` `dayOfWeek` is in UTC. Monday 6 AM PHT = Sunday 10 PM UTC → `dayOfWeek: "sunday"`, `hourUTC: 22`.

### `internalMutation` Pattern for Cron Handlers

The cron handler must be an `internalMutation` (not a regular mutation — crons can't pass auth context):

```typescript
import { internalMutation } from "../_generated/server";

export const generateWeeklySummary = internalMutation({
  args: {},
  handler: async (ctx) => {
    // No auth check — internal mutations are trusted (called by cron system)
    // Compute previous week's Monday-Sunday boundary (PHT)
    // Query demandLogs by_date index
    // Aggregate and insert into demandWeeklySummaries
  },
});
```

[Source: `convex/inventory/alerts.ts` — `sweepLowStock` is an internalMutation called by the existing cron]

### "Trending" Status Logic

AC#5 says entries show status: Logged/Trending/Fulfilled. AC#6 says "Trending" entries are highlighted.

**Trending definition:** A demand entry is "Trending" when 3+ entries exist with the same `brand + design` combination within the current date range.

**Implementation:**
1. In `getDemandEntries` backend query: build a frequency map of `brand + "|" + (design ?? "")` keys, count occurrences
2. Mark each entry with `isTrending: count >= 3`
3. Frontend renders amber badge for trending, default badge for logged

**Fulfilled status:** The `demandLogs` schema has no `status` field. "Fulfilled" is a future enhancement (would require schema change + UI to mark entries as fulfilled). For now, implement Logged and Trending only. Note this in completion notes.

### Branch Selector for Filters

Reuse `api.dashboards.birReports.listActiveBranches` query (created in Story 7.3) for the branch dropdown. This query returns all active branches sorted alphabetically — already used in the reports page.

```tsx
const allBranches = useQuery(api.dashboards.birReports.listActiveBranches);
```

Do NOT create a new branch listing query.

### Date Filter UI Pattern (Copy from Reports Page)

`app/hq/reports/page.tsx` has the established date filter pattern:
- Preset buttons: Today, Yesterday, This Week, This Month
- Custom date inputs: `<input type="date" />`
- `toYYYYMMDD`, `toInputDate`, `fromInputDate`, `getPresetDates` helpers
- `activePreset` state tracks which preset is active (or "custom")

Copy these helpers inline into the demand page — do NOT extract to shared module (pages are self-contained).

[Source: `app/hq/reports/page.tsx` lines 12-61 — date helpers and preset logic]

### No Card Component

shadcn/ui `card` component is NOT installed. Use div-based markup:
```tsx
<div className="rounded-lg border p-4 space-y-4">
  <h2 className="text-sm font-semibold">...</h2>
</div>
```
[Source: Story 7.3 D1, Story 7.4 Dev Notes]

### Navigation — Already Wired

`app/hq/layout.tsx` already has the demand nav link:
```typescript
const navItems = [
  { href: "/hq/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/hq/reports", label: "Reports", icon: BarChart3 },
  { href: "/hq/brands", label: "Brands", icon: Tags },
  { href: "/hq/demand", label: "Demand", icon: TrendingUp },  // ALREADY EXISTS
  { href: "/hq/transfers", label: "Transfers", icon: ArrowRightLeft },
];
```

No layout modification needed — just create `app/hq/demand/page.tsx`.

### Sonner for Toast Notifications

```tsx
import { toast } from "sonner";
toast.success("...");
toast.error("...");
```

Use `sonner` — do NOT use any other toast library.
[Source: Story 7.4 Dev Notes]

### Always Run Codegen After Schema Changes

After modifying `convex/schema.ts` and creating new Convex files, run:
```bash
npx convex codegen
```
This regenerates `convex/_generated/api.ts` and `convex/_generated/dataModel.ts`.
[Source: Story 7.3 D2, Story 7.4 Dev Notes]

### Batch Fetching Pattern for N+1 Prevention

When enriching demand entries with branch names and user names, use the established batch-fetch pattern:

```typescript
// Batch-fetch branch names
const uniqueBranchIds = [...new Set(logs.map((l) => l.branchId))];
const branchDocs = await Promise.all(uniqueBranchIds.map((id) => ctx.db.get(id)));
const branchNameMap = new Map<string, string>();
uniqueBranchIds.forEach((id, i) => {
  const doc = branchDocs[i];
  if (doc) branchNameMap.set(id as string, doc.name);
});
```

[Source: `convex/demand/entries.ts` lines 96-102 — batch-fetch user names pattern]

### File/Module Placement

| File | Status | Purpose |
|------|--------|---------|
| `convex/schema.ts` | MODIFY | Add `demandWeeklySummaries` table |
| `convex/demand/summaries.ts` | CREATE | Weekly aggregation internalMutation + HQ queries |
| `convex/dashboards/demandIntelligence.ts` | CREATE | Real-time HQ demand dashboard queries |
| `convex/crons.ts` | MODIFY | Add weekly demand summary cron |
| `app/hq/demand/page.tsx` | CREATE | Demand Intelligence Dashboard UI with Recharts |

### Previous Story Context (7.4)

Story 7.4 created:
- `convex/demand/entries.ts` — `listBrandsForSelector`, `createDemandLog`, `listBranchDemandLogs`
- `app/pos/demand/page.tsx` — POS quick-entry UI
- `app/branch/demand/page.tsx` — Branch demand log + recent entries

**Key learnings from 7.4:**
- `brand` field is `v.string()` (name, NOT ID) — match this in aggregation
- `listBrandsForSelector` uses `withBranchScope` (branch-scoped) — do NOT reuse for HQ dashboard
- POS_ROLES guard on mutations; HQ dashboard needs HQ_ROLES guard on queries
- Code review findings fixed: brand validation guard, notes in audit trail, empty state handling

**Key learnings from 7.3:**
- `birReports.ts` `getBrandBreakdown` was refactored to 4-wave parallel batch fetching — same pattern may be useful for enriching demand entries
- `listActiveBranches` query already exists for branch dropdown reuse
- No card component — use `rounded-lg border p-4` pattern
- Date format: YYYYMMDD for Convex args, YYYY-MM-DD for HTML inputs

### Project Structure Notes

- Route is `app/hq/` (NOT `app/(hq)/`) — confirmed by file structure
- Convex modules: `convex/demand/` (entries.ts exists, summaries.ts to create), `convex/dashboards/` (hqDashboard.ts, birReports.ts exist, demandIntelligence.ts to create)
- `convex/crons.ts` is the single cron file — add entries there, not a new file

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 7, Story 7.5: FR47, FR48]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — `convex/demand/summaries.ts` for FR48 weekly aggregation]
- [Source: `convex/schema.ts` lines 206-216 — `demandLogs` table with `by_date` index]
- [Source: `convex/dashboards/hqDashboard.ts` lines 1-58 — HQ_ROLES pattern, PHT timezone, parallel branch queries]
- [Source: `app/hq/reports/page.tsx` lines 12-61 — date helpers, preset buttons, YYYYMMDD format]
- [Source: `convex/crons.ts` — existing cron infrastructure with `cronJobs()` pattern]
- [Source: `convex/_helpers/permissions.ts` lines 22-27 — HQ_ROLES, requireRole]
- [Source: `convex/demand/entries.ts` — existing demand queries, batch-fetch pattern]
- [Source: `app/hq/layout.tsx` — `/hq/demand` nav link already present with TrendingUp icon]
- [Source: `package.json` line 32 — `recharts@^3.7.0` installed]
- [Source: Story 7.4 completion notes — brand is v.string() name not ID, POS/branch layout nav findings]
- [Source: Story 7.3 code review — listActiveBranches reuse, no card component, date helpers pattern]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- D1: `convex/demand/summaries.ts:104` — TypeScript error: `branchId as typeof log.branchId` failed because `log` variable from `for...of` loop was out of scope inside `.map()` callback. Fixed by importing `Id` type and using `branchId as Id<"branches">`.
- D2: `app/hq/demand/page.tsx:202` — TypeScript error: `b._id` does not exist on `{ id: string; name: string }`. The `listActiveBranches` query returns `{ id, name }` (explicit string cast), not Convex document shape `{ _id }`. Fixed by changing `b._id` to `b.id`.

### Completion Notes List

- All 9 tasks completed successfully.
- First Recharts usage in the codebase — establishes pattern for future chart pages.
- "Fulfilled" status (AC#5) not implemented — `demandLogs` schema has no `status` field. Only "Logged" and "Trending" statuses are rendered. "Fulfilled" would require a schema change + mutation + UI workflow (future enhancement). **[Review: AC gap acknowledged — requires separate story]**
- Weekly cron fires at Sunday 22:00 UTC = Monday 6:00 AM PHT — aggregates PREVIOUS week's demand data.
- `getWeeklySummaries` and `getLatestWeekTopBrands` queries are implemented in `summaries.ts` but not yet wired to the frontend page (the page uses real-time queries from `demandIntelligence.ts`). These summary queries are available for future weekly trend visualization. **[Review: AC#2 effectively met via real-time queries for any date range; weekly summary infrastructure ready for future week-over-week comparison UI]**
- Branch dropdown reuses `listActiveBranches` from `birReports.ts` — no new branch query created.

### Code Review Fixes Applied

- **M1 FIXED**: `app/hq/demand/page.tsx` — Removed `useState` misuse (lines 87-92) that caused extra render cycle on mount. `dateStart`/`dateEnd` now initialize directly via `getPresetDates("thisMonth")` in their own initializers, eliminating wasted Convex query.
- **M2 ACKNOWLEDGED**: Weekly summary queries (`getWeeklySummaries`, `getLatestWeekTopBrands`) not wired to UI — kept as infrastructure for future week-over-week trend visualization. AC#2 met via real-time queries.
- **M3 ACKNOWLEDGED**: AC#5 "Fulfilled" status requires schema change (`demandLogs` has no `status` field) — deferred to future story.

### File List

- `convex/schema.ts` — MODIFIED: Added `demandWeeklySummaries` table with `by_week` and `by_week_brand` indexes
- `convex/demand/summaries.ts` — CREATED: `generateWeeklySummary` internalMutation + `getWeeklySummaries` + `getLatestWeekTopBrands` queries
- `convex/crons.ts` — MODIFIED: Added `demand-summary` weekly cron (Sunday 22:00 UTC)
- `convex/dashboards/demandIntelligence.ts` — CREATED: `getDemandEntries`, `getDemandMetrics`, `getTopDemandedBrands`, `getDemandTrendByDay` queries
- `app/hq/demand/page.tsx` — CREATED: Demand Intelligence Dashboard with Recharts charts, metric cards, filters, and entries table

# Story 7.2: Branch Dashboard

Status: done

## Story

As a **Branch Manager (Kuya Renz)**,
I want to see my branch's performance dashboard,
so that I can monitor sales, stock, and staff activity for my location.

## Acceptance Criteria

1. **Given** a Manager (or Viewer/Admin) navigates to `/branch/dashboard`
   **When** the dashboard loads
   **Then** 4 MetricCards display: today's revenue, today's transaction count, items sold today, average transaction value — each with trend arrows vs yesterday
   **And** loading state shows animate-pulse skeleton rows

2. **Given** the dashboard is loaded
   **Then** a Recharts BarChart shows hourly sales (revenue in ₱) for today in PHT
   **And** X-axis labels are PHT hour labels (12am, 1am … 11pm), Y-axis shows ₱ amounts
   **And** hovering a bar shows a tooltip with exact hour revenue
   **And** hours with no sales show a zero bar (chart always renders 24 buckets)

3. **Given** the dashboard is loaded
   **Then** an Alerts section shows all active low-stock alerts for this branch
   **And** each alert shows: SKU, style name, current quantity, minimum threshold
   **And** if no active alerts: empty state "✅ No active stock alerts"

4. **Given** the dashboard is loaded
   **Then** a Transfers section shows pending transfers involving this branch
   **And** outgoing transfers (FROM this branch) display: destination branch, status, relative time
   **And** incoming transfers (TO this branch) display: source branch, status, relative time
   **And** excludes delivered and rejected transfers
   **And** if no pending transfers: empty state "No pending transfers"

5. **Given** all Convex subscriptions are active
   **Then** all dashboard data updates in real time via `useQuery` — no manual refresh

6. **Given** the dashboard is scoped per branch
   **Then** a Manager only sees data for their own assigned branch (`withBranchScope` enforces isolation)
   **And** an Admin visiting `/branch/dashboard` with no branch context sees empty sections (queries return null/empty gracefully)

## Tasks / Subtasks

- [x] Task 1: Create `convex/dashboards/branchDashboard.ts` with 4 query functions (AC: #1–#6)
  - [x] 1.1 `getBranchMetrics` — today/yesterday: revenue, txn count, items sold (via transactionItems join), avg txn value
  - [x] 1.2 `getHourlySalesChart` — 24-bucket hourly revenue array for today in PHT
  - [x] 1.3 `getBranchAlerts` — active low-stock alerts for this branch, enriched with variant SKU + style name
  - [x] 1.4 `getPendingTransfers` — outgoing and incoming transfers (excluding delivered + rejected), enriched with branch names

- [x] Task 2: Replace `app/branch/dashboard/page.tsx` stub with full Branch Dashboard UI (AC: #1–#6)
  - [x] 2.1 4 MetricCards row: revenue, txn count, items sold, avg txn value — all with trend arrows
  - [x] 2.2 Hourly sales BarChart using Recharts `<BarChart>` inside `<ResponsiveContainer>`
  - [x] 2.3 Alerts section: table/list with SKU, style name, quantity vs threshold; empty state
  - [x] 2.4 Transfers section: two sub-lists (Outgoing, Incoming) with status badge and relative time; empty state
  - [x] 2.5 Skeleton loading for all 4 sections using animate-pulse divs

- [x] Task 3: Integration verification (AC: all)
  - [x] 3.1 `npx convex codegen` → regenerates `convex/_generated/api.d.ts` (MUST run after creating branchDashboard.ts)
  - [x] 3.2 `npx tsc --noEmit` → 0 TypeScript errors
  - [x] 3.3 `npx next lint` → 0 warnings/errors

## Dev Notes

### Auth: `withBranchScope(ctx)` — ALL 4 Query Functions

```typescript
import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { withBranchScope } from "../_helpers/withBranchScope";

export const getBranchMetrics = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null; // Admin with no branch context — frontend handles null gracefully
    // ... rest of query
  },
});
```

> ⚠️ **DO NOT use `requireRole(ctx, HQ_ROLES)`** — that's for HQ-only queries with all-branch access.
> Branch dashboard queries MUST use `withBranchScope(ctx)` for branch isolation.
> `scope.branchId` is null for admins (HQ_ROLES bypass) — always guard with `if (!branchId) return null`.

### Critical: Philippine Time (UTC+8) Day Boundary

Same helper as Story 7.1 — copy verbatim into branchDashboard.ts:

```typescript
function getPHTDayStartMs(): number {
  const PHT_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8
  const nowUtcMs = Date.now();
  const nowPhtMs = nowUtcMs + PHT_OFFSET_MS;
  const todayPhtStartMs = nowPhtMs - (nowPhtMs % (24 * 60 * 60 * 1000));
  return todayPhtStartMs - PHT_OFFSET_MS; // convert back to UTC ms
}
const PHT_OFFSET_MS = 8 * 60 * 60 * 1000; // also needed for hourly chart
```

### Task 1.1 — `getBranchMetrics` Query

```typescript
export const getBranchMetrics = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const todayStart = getPHTDayStartMs();
    const yesterdayStart = todayStart - 86400000;

    // Single indexed query covering today + yesterday — partition in memory
    const recentTxns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", yesterdayStart)
      )
      .collect();

    const todayTxns = recentTxns.filter((t) => t.createdAt >= todayStart);
    const yesterdayTxns = recentTxns.filter((t) => t.createdAt < todayStart);

    const todayRevenueCentavos = todayTxns.reduce((s, t) => s + t.totalCentavos, 0);
    const yesterdayRevenueCentavos = yesterdayTxns.reduce((s, t) => s + t.totalCentavos, 0);
    const todayTransactionCount = todayTxns.length;
    const yesterdayTransactionCount = yesterdayTxns.length;
    const todayAvgTxnValueCentavos =
      todayTransactionCount > 0
        ? Math.round(todayRevenueCentavos / todayTransactionCount)
        : 0;
    const yesterdayAvgTxnValueCentavos =
      yesterdayTransactionCount > 0
        ? Math.round(yesterdayRevenueCentavos / yesterdayTransactionCount)
        : 0;

    // Items sold: N+1 join on transactionItems (bounded by daily txn count ~50-200, acceptable)
    const todayItems = await Promise.all(
      todayTxns.map((txn) =>
        ctx.db
          .query("transactionItems")
          .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
          .collect()
      )
    );
    const todayItemsSold = todayItems.flat().reduce((s, item) => s + item.quantity, 0);

    const yesterdayItems = await Promise.all(
      yesterdayTxns.map((txn) =>
        ctx.db
          .query("transactionItems")
          .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
          .collect()
      )
    );
    const yesterdayItemsSold = yesterdayItems.flat().reduce((s, item) => s + item.quantity, 0);

    return {
      todayRevenueCentavos,
      yesterdayRevenueCentavos,
      todayTransactionCount,
      yesterdayTransactionCount,
      todayItemsSold,
      yesterdayItemsSold,
      todayAvgTxnValueCentavos,
      yesterdayAvgTxnValueCentavos,
    };
  },
});
```

> ⚠️ **N+1 warning is intentional and acceptable**: transactionItems join is O(daily_txn_count). With ~50-200 transactions/day and `Promise.all` for parallelism, this completes well within Convex's 10,000 read limit. No schema change needed.

### Task 1.2 — `getHourlySalesChart` Query

```typescript
export const getHourlySalesChart = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
    const todayStart = getPHTDayStartMs();

    const todayTxns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", todayStart)
      )
      .collect();

    // Initialize 24 hourly buckets (0 = midnight PHT … 23 = 11pm PHT)
    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: formatHourLabel(hour), // "12am", "1am", ..., "12pm", "1pm", ...
      revenueCentavos: 0,
      txnCount: 0,
    }));

    for (const txn of todayTxns) {
      // Convert UTC timestamp to PHT hour
      const txnPhtMs = txn.createdAt + PHT_OFFSET_MS;
      const hour = Math.floor(txnPhtMs / (1000 * 60 * 60)) % 24;
      hourly[hour].revenueCentavos += txn.totalCentavos;
      hourly[hour].txnCount += 1;
    }

    return hourly;
  },
});

// Helper — define before the query or at module level
function formatHourLabel(hour: number): string {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}
```

### Task 1.3 — `getBranchAlerts` Query

```typescript
export const getBranchAlerts = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return [];

    // Use by_branch_status index (per-branch) — NOT full table scan (that's for HQ)
    const alerts = await ctx.db
      .query("lowStockAlerts")
      .withIndex("by_branch_status", (q) =>
        q.eq("branchId", branchId).eq("status", "active")
      )
      .collect();

    // Enrich with variant SKU + style name for display
    return await Promise.all(
      alerts.map(async (alert) => {
        const variant = await ctx.db.get(alert.variantId);
        const style = variant ? await ctx.db.get(variant.styleId) : null;
        return {
          id: alert._id as string,
          variantSku: variant?.sku ?? "(unknown)",
          styleName: style?.name ?? "(unknown)",
          currentQuantity: alert.quantity,
          threshold: alert.threshold,
        };
      })
    );
  },
});
```

> ✅ `by_branch_status` index on `lowStockAlerts` confirmed in schema: `.index("by_branch_status", ["branchId", "status"])` — use this for all per-branch alert queries (unlike HQ-wide which uses `.filter()`).

### Task 1.4 — `getPendingTransfers` Query

```typescript
export const getPendingTransfers = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return { outgoing: [], incoming: [] };

    // Indexes confirmed in schema: by_from_branch and by_to_branch
    const [outgoingAll, incomingAll] = await Promise.all([
      ctx.db
        .query("transfers")
        .withIndex("by_from_branch", (q) => q.eq("fromBranchId", branchId))
        .collect(),
      ctx.db
        .query("transfers")
        .withIndex("by_to_branch", (q) => q.eq("toBranchId", branchId))
        .collect(),
    ]);

    // Exclude terminal states (type-safe — avoids Array.includes union type mismatch)
    const outgoing = outgoingAll.filter(
      (t) => t.status !== "delivered" && t.status !== "rejected"
    );
    const incoming = incomingAll.filter(
      (t) => t.status !== "delivered" && t.status !== "rejected"
    );

    // Branch name cache (same pattern as hqDashboard.ts — use ?? not !)
    const branchCache = new Map<string, string>();
    async function getBranchName(id: Id<"branches">): Promise<string> {
      const key = id as string;
      if (branchCache.has(key)) return branchCache.get(key) ?? "(unknown)";
      const branch = await ctx.db.get(id);
      const name = branch?.name ?? "(unknown)";
      branchCache.set(key, name);
      return name;
    }

    const [outgoingEnriched, incomingEnriched] = await Promise.all([
      Promise.all(
        outgoing.map(async (t) => ({
          id: t._id as string,
          toBranchName: await getBranchName(t.toBranchId),
          status: t.status,
          createdAt: t.createdAt,
        }))
      ),
      Promise.all(
        incoming.map(async (t) => ({
          id: t._id as string,
          fromBranchName: await getBranchName(t.fromBranchId),
          status: t.status,
          createdAt: t.createdAt,
        }))
      ),
    ]);

    return { outgoing: outgoingEnriched, incoming: incomingEnriched };
  },
});
```

### Task 2 — Frontend UI Patterns

**File to replace:** `app/branch/dashboard/page.tsx` (currently a stub: "Coming in Epic 7")

**Import list for the page:**
```tsx
"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
```

> ✅ **recharts `^3.7.0`** is installed. The BarChart API is stable across 2.x→3.x for basic usage. No breaking changes for `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`.

**Money formatting (same as Story 7.1 — copy verbatim):**
```typescript
function formatCentavos(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
```

**TrendArrow component (same as Story 7.1 — copy verbatim):**
```tsx
function TrendArrow({ current, previous, higherIsBetter = true }: {
  current: number; previous: number; higherIsBetter?: boolean;
}) {
  if (previous === 0 || current === previous) return null;
  const isUp = current > previous;
  const isGood = higherIsBetter ? isUp : !isUp;
  return (
    <span className={isGood ? "text-green-600 text-sm" : "text-red-600 text-sm"}>
      {isUp ? " ↑" : " ↓"}
    </span>
  );
}
```

**MetricCard component (same as Story 7.1 — copy verbatim):**
```tsx
function MetricCard({ title, value, trendCurrent, trendPrevious, higherIsBetter }: {
  title: string; value: string;
  trendCurrent?: number; trendPrevious?: number; higherIsBetter?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-1">
      <p className="text-sm text-muted-foreground">{title}</p>
      <div className="flex items-baseline gap-1">
        <p className="text-2xl font-bold">{value}</p>
        {trendCurrent !== undefined && trendPrevious !== undefined && (
          <TrendArrow current={trendCurrent} previous={trendPrevious} higherIsBetter={higherIsBetter} />
        )}
      </div>
    </div>
  );
}
```

**Relative time helper (same as Story 7.1 — copy verbatim):**
```typescript
function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

**useQuery pattern — handle null for admin without branch context:**
```tsx
export default function BranchDashboardPage() {
  const metrics = useQuery(api.dashboards.branchDashboard.getBranchMetrics);
  const chartData = useQuery(api.dashboards.branchDashboard.getHourlySalesChart);
  const alerts = useQuery(api.dashboards.branchDashboard.getBranchAlerts);
  const transfers = useQuery(api.dashboards.branchDashboard.getPendingTransfers);

  // Convex convention: undefined = loading, null = admin with no branch context
  // Note: alerts and getPendingTransfers return [] (not null) for no-branch case
```

**Hourly chart render pattern:**
```tsx
{chartData === undefined ? (
  <div className="h-48 animate-pulse rounded-lg bg-muted" />
) : !chartData ? (
  <p className="text-sm text-muted-foreground">No branch context</p>
) : (
  <ResponsiveContainer width="100%" height={200}>
    <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
      <XAxis
        dataKey="label"
        tick={{ fontSize: 10 }}
        interval={2} // Show every 3rd hour label to avoid crowding
      />
      <YAxis
        tickFormatter={(v: number) =>
          v >= 100000 ? `₱${(v / 100 / 1000).toFixed(0)}k` : `₱${(v / 100).toFixed(0)}`
        }
        tick={{ fontSize: 10 }}
        width={50}
      />
      <Tooltip
        formatter={(value: number) => [formatCentavos(value), "Revenue"]}
        labelFormatter={(label: string) => `Hour: ${label}`}
      />
      <Bar dataKey="revenueCentavos" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
)}
```

**Transfer status badge:**
```tsx
const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  approved: "Approved",
  packed: "Packed",
  inTransit: "In Transit",
};

// Usage:
<span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
  {STATUS_LABEL[transfer.status] ?? transfer.status}
</span>
```

**Skeleton loading pattern (same as Story 7.1):**
```tsx
// MetricCards (4 cards):
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
  {Array.from({ length: 4 }).map((_, i) => (
    <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
  ))}
</div>

// Chart skeleton:
<div className="h-48 animate-pulse rounded-lg bg-muted" />

// List skeleton:
<div className="space-y-2">
  {Array.from({ length: 3 }).map((_, i) => (
    <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
  ))}
</div>
```

> ⚠️ **NO `@/components/ui/skeleton`** — use inline animate-pulse divs only (confirmed in Story 7.1).

**Page structure:**
```tsx
return (
  <div className="p-6 space-y-8">
    {/* Header */}
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Branch Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">{todayLabel}</p>
    </div>

    {/* MetricCards */}
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Today&apos;s Overview</h2>
      {/* 4 cards: Revenue, Transactions, Items Sold, Avg Transaction Value */}
    </section>

    {/* Hourly Sales Chart */}
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Hourly Sales</h2>
      {/* Recharts BarChart */}
    </section>

    {/* Stock Alerts */}
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Stock Alerts</h2>
      {/* Alert list or empty state */}
    </section>

    {/* Pending Transfers */}
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Pending Transfers</h2>
      {/* Outgoing + Incoming sub-sections */}
    </section>
  </div>
);
```

### Key Patterns from Story 7.1 (MUST follow)

- **NEVER use `v` as variable name** in Convex files (`v` is imported from `convex/values`)
- **`const now = Date.now()`** — single call for all timestamp uses in same handler
- **`animate-pulse` divs** — NOT `@/components/ui/skeleton` (confirmed absent from project)
- **`<Link>` not `useRouter`** — for any clickable navigation elements
- **`?? "(unknown)"`** — use nullish coalescing, NEVER `!` non-null assertion
- **`npx convex codegen`** after creating new Convex module — regenerates `api.d.ts`

### Schema Indexes Confirmed (from convex/schema.ts)

| Table | Index | Fields |
|-------|-------|--------|
| `transactions` | `by_branch_date` | `["branchId", "createdAt"]` |
| `transactionItems` | `by_transaction` | `["transactionId"]` |
| `lowStockAlerts` | `by_branch_status` | `["branchId", "status"]` |
| `transfers` | `by_from_branch` | `["fromBranchId"]` |
| `transfers` | `by_to_branch` | `["toBranchId"]` |
| `variants` | (by `_id` via ctx.db.get) | n/a |
| `styles` | (by `_id` via ctx.db.get) | n/a |

All indexes used in this story are confirmed present in schema.ts. No schema changes needed.

### File Location — Existing Stub to Replace

```
app/branch/dashboard/page.tsx   ← REPLACE (currently stub: "Coming in Epic 7")
```

The branch layout (`app/branch/layout.tsx`) is already complete — DO NOT modify it. It provides:
- Role guard: `ALLOWED_ROLES = ["admin", "manager", "viewer"]`
- Sidebar nav with Dashboard, Stock, Transfers, Demand, Alerts links
- `ErrorBoundary` wrapper

### Project Structure

```
Files to CREATE:
└── convex/dashboards/branchDashboard.ts     # 4 query functions

Files to REPLACE:
└── app/branch/dashboard/page.tsx            # Replace stub with Branch Dashboard UI

Files that MUST NOT be modified:
├── app/branch/layout.tsx                    # Complete — do not touch
├── convex/schema.ts                         # No schema changes needed
├── convex/_helpers/withBranchScope.ts       # Complete — import and use
├── convex/_helpers/permissions.ts           # Complete — BRANCH_VIEW_ROLES if needed
├── convex/dashboards/hqDashboard.ts         # Complete — reference patterns only
└── convex/_generated/api.d.ts              # Auto-generated — run codegen, never edit

Post-creation: Run `npx convex codegen` to update api.d.ts with branchDashboard exports.
```

### References

- [Source: epics.md — Epic 7, Story 7.2 ACs and requirements]
- [Source: architecture.md — convex/dashboards/branchDashboard.ts module, app/(branch)/ route group, Recharts integration, withBranchScope pattern, real-time subscriptions]
- [Source: ux-design-specification.md — Branch Dashboard UX: MetricCards, hourly BarChart, alerts display, transfer list, skeleton loading]
- [Source: convex/schema.ts — All confirmed indexes: by_branch_date, by_transaction, by_branch_status, by_from_branch, by_to_branch]
- [Source: convex/_helpers/withBranchScope.ts — withBranchScope() implementation, branchId null for admin bypass]
- [Source: convex/_helpers/permissions.ts — BRANCH_VIEW_ROLES = ["admin", "manager", "viewer"]]
- [Source: convex/dashboards/hqDashboard.ts — getPHTDayStartMs(), formatHourLabel pattern, branch name caching, PHT offset]
- [Source: app/branch/layout.tsx — ALLOWED_ROLES, nav items, ErrorBoundary wrapper]
- [Source: app/branch/dashboard/page.tsx — Current stub to replace]
- [Source: 7-1-hq-morning-command-center.md — Dev notes: animate-pulse, Link navigation, ?? pattern, no skeleton component, codegen requirement]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Recharts 3.x Tooltip `formatter` and `labelFormatter` have stricter types than documented in Dev Notes. `value` is `number | undefined` (not `number`), and `label` is `ReactNode` (not `string`). Fixed by typing `value: number | undefined` with undefined guard and removing explicit string type from `labelFormatter`. This pattern should be used in future stories using Recharts Tooltip.
- Code review H1: `PHT_OFFSET_MS` should always be declared at module level before `getPHTDayStartMs()` — never as a local variable that shadows the module constant. Future stories copying this pattern must NOT redeclare inside the function.
- Code review M3: For branch-scoped queries where admin bypass is `if (!branchId)`, ALL queries should return `null` (not `[]` or `{}`) so the frontend can show a single consistent "No branch context." message. Pattern: `return null` for admin bypass in all 4 query types.

### Completion Notes List

- Created `convex/dashboards/branchDashboard.ts` with 4 query functions: `getBranchMetrics`, `getHourlySalesChart`, `getBranchAlerts`, `getPendingTransfers`. All use `withBranchScope(ctx)` with `if (!branchId) return null` guard for admin bypass.
- `getBranchMetrics`: Single `by_branch_date` indexed query covering yesterday + today, partitioned in memory. N+1 `by_transaction` join for items sold (bounded by ~50-200 daily txns, acceptable via Promise.all).
- `getHourlySalesChart`: 24-bucket array initialized to zero; UTC→PHT conversion via `txn.createdAt + PHT_OFFSET_MS`, then `% 24` for hour-of-day.
- `getBranchAlerts`: Uses `by_branch_status` index for per-branch active alerts.
- `getPendingTransfers`: Parallel `by_from_branch` + `by_to_branch` queries ordered desc (most recent first); terminal states excluded with type-safe `!== "delivered" && !== "rejected"`. Branch name cache reuses hqDashboard.ts pattern.
- Replaced `app/branch/dashboard/page.tsx` stub with full dashboard. 4 MetricCards with TrendArrow, Recharts BarChart, Alerts list, Transfers (Outgoing/Incoming) with status badges, animate-pulse skeletons for all 4 sections.
- `npx convex codegen` + `npx tsc --noEmit` → 0 errors. `npx next lint` → 0 warnings.
- Code Review Fix (H1): Moved `PHT_OFFSET_MS` to module level before `getPHTDayStartMs()`; removed local shadow inside function — eliminates maintenance hazard of two constants with same name.
- Code Review Fix (M2): Added `.order("desc")` to both `by_from_branch` and `by_to_branch` transfer queries — most recent transfers now appear first.
- Code Review Fix (M3): `getBranchAlerts` and `getPendingTransfers` now return `null` (not `[]`/`{}`) for admin bypass. Frontend shows consistent "No branch context." across all 4 sections (MetricCards, Chart, Alerts, Transfers). tsc + lint: 0 errors after fixes.

### File List

- `convex/dashboards/branchDashboard.ts` (created)
- `app/branch/dashboard/page.tsx` (replaced stub)
- `convex/_generated/api.d.ts` (auto-updated by codegen)

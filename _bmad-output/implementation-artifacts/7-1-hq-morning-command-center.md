# Story 7.1: HQ Morning Command Center

Status: done

## Story

As an **HQ Staff member (Ate Lisa)**,
I want to see an all-branch overview dashboard when I open the system each morning,
so that I can quickly identify what needs my attention across all branches.

## Acceptance Criteria

1. **Given** an HQ Staff user navigates to `/hq/dashboard`
   **When** the dashboard loads
   **Then** the top row shows 4 MetricCards: total revenue today, transaction count, stock alerts count, transfer status summary
   **And** Revenue and Transactions cards show trend arrows vs yesterday
   **And** Active Stock Alerts card shows trend arrow based on new alerts triggered today vs yesterday (`higherIsBetter=false`)
   **And** Transfers card shows current workflow state ("N pending / M in flight") — no trend arrow (compound status snapshot, not a single trending metric)
   **And** loading state shows animate-pulse skeleton rows for each section (MetricCards, BranchCards, AttentionItems)

2. **Given** the dashboard is displayed
   **Then** a BranchCards grid shows each active branch with: today's revenue, transaction count, stock health indicator, alerts badge count
   **And** branch health states: Healthy (green), Needs Attention (amber), Critical (red), Offline (gray + last activity timestamp)
   **And** health logic: `offline` = no transactions in last 24h; `critical` = ≥3 active low-stock alerts; `attention` = ≥1 active alert; `healthy` = 0 alerts AND at least 1 transaction today

3. **Given** the dashboard is displayed
   **Then** an AttentionItems list shows actionable alerts, priority-sorted: Critical (red left border) > Warning (amber left border) > Info (blue left border)
   **And** attention item types: low-stock alerts (`priority: "warning"`), pending transfer requests (status=`"requested"`, `priority: "warning"`), unsynced offline transactions (`isOffline: true AND syncedAt: null`, `priority: "critical"`)
   **And** if no attention items: empty state "✅ All clear — no attention items"

4. **Given** an AttentionItem of type `"low-stock"` is displayed
   **Then** clicking it navigates to `/hq/dashboard` (alerts remain visible on the same page)

5. **Given** an AttentionItem of type `"pending-transfer"` is displayed
   **Then** clicking it navigates to `/hq/transfers`

6. **Given** an AttentionItem of type `"sync-conflict"` is displayed
   **Then** clicking it navigates to `/hq/transfers` (placeholder — no dedicated sync conflict page in this story)

7. **Given** a BranchCard is clicked
   **Then** it navigates to `/hq/transfers` (full per-branch detail view is deferred to a future story — AC noted as partial scope)

8. **Given** all Convex subscriptions are active
   **Then** all dashboard data (MetricCards, BranchCards, AttentionItems) updates in real time via Convex `useQuery` — no manual refresh required

## Tasks / Subtasks

- [x] Task 1: Create `convex/dashboards/hqDashboard.ts` with 3 query functions (AC: #1, #2, #3, #8)
  - [x] 1.1 `getHqMetrics` — today + yesterday revenue/transaction counts (Philippine Time UTC+8), active alerts count, transfer counts by status
  - [x] 1.2 `getBranchStatusCards` — per-branch: today revenue, today transaction count, alert count, health status, last activity timestamp
  - [x] 1.3 `getAttentionItems` — prioritized list combining low-stock alerts, pending transfer requests, unsynced offline transactions

- [x] Task 2: Replace `app/hq/dashboard/page.tsx` with full Morning Command Center UI (AC: #1–#8)
  - [x] 2.1 Top row: 4 MetricCards with trend arrows (up/down chevron from lucide-react; green = improvement, red = worse)
  - [x] 2.2 BranchCards grid: 3-column grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`), each card shows branch name, revenue, txn count, health badge, alert count, clickable → `/hq/transfers`
  - [x] 2.3 AttentionItems list: priority-sorted rows with colored left border (`border-l-4 border-red-500/border-amber-500/border-blue-500`), each row clickable
  - [x] 2.4 Skeleton loading state for all 3 sections using animate-pulse divs (same pattern as Story 6.x)
  - [x] 2.5 Empty state for AttentionItems: `<div className="py-8 text-center text-sm text-muted-foreground">✅ All clear — no attention items</div>`

- [x] Task 3: Integration verification (AC: all)
  - [x] 3.1 `npx tsc --noEmit` → 0 TypeScript errors
  - [x] 3.2 `npx next lint` → 0 warnings/errors

## Dev Notes

### Critical: Philippine Time (UTC+8) Day Boundary Calculation

All "today" queries must use PHT midnight as the start timestamp. Use this exact helper inside each Convex query handler:

```typescript
function getPHTDayStartMs(): number {
  const PHT_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8
  const nowUtcMs = Date.now();
  const nowPhtMs = nowUtcMs + PHT_OFFSET_MS;
  // Floor to midnight PHT
  const todayPhtStartMs = nowPhtMs - (nowPhtMs % (24 * 60 * 60 * 1000));
  return todayPhtStartMs - PHT_OFFSET_MS; // convert back to UTC ms
}
```

"Yesterday" = `getPHTDayStartMs() - 86400000` to `getPHTDayStartMs() - 1`.

### Auth: `requireRole(ctx, HQ_ROLES)` — All 3 new query functions

```typescript
import { query } from "../_generated/server";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";

// HQ_ROLES = ["admin", "hqStaff"]
// HQ staff bypass branch scoping — they see ALL branches' data
// Do NOT use withBranchScope() for HQ dashboard queries
```

### Task 1.1 — `getHqMetrics` Query Structure

> ⚠️ **CRITICAL — DO NOT use a full table scan on `transactions`**. The system retains 3+ years of transaction history (BIR compliance). A full `.collect()` on transactions would scan millions of rows. Use per-branch `by_branch_date` indexed queries instead.

```typescript
export const getHqMetrics = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    const todayStart = getPHTDayStartMs();
    const yesterdayStart = todayStart - 86400000;
    const todayEnd = todayStart + 86400000;

    // Get all active branches — then query each by index (bounded by branch count ≤20)
    const branches = await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    let todayRevenueCentavos = 0;
    let todayTransactionCount = 0;
    let yesterdayRevenueCentavos = 0;
    let yesterdayTransactionCount = 0;

    await Promise.all(branches.map(async (branch) => {
      const todayTxns = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", branch._id).gte("createdAt", todayStart)
        )
        .collect();
      // Only count transactions created before end of today
      const todayFiltered = todayTxns.filter((t) => t.createdAt < todayEnd);
      todayRevenueCentavos += todayFiltered.reduce((sum, t) => sum + t.totalCentavos, 0);
      todayTransactionCount += todayFiltered.length;

      const yesterdayTxns = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", branch._id).gte("createdAt", yesterdayStart)
        )
        .collect();
      const yesterdayFiltered = yesterdayTxns.filter((t) => t.createdAt < todayStart);
      yesterdayRevenueCentavos += yesterdayFiltered.reduce((sum, t) => sum + t.totalCentavos, 0);
      yesterdayTransactionCount += yesterdayFiltered.length;
    }));

    // Active alerts — full scan (HQ path; consistent with getLowStockAlerts)
    // ⚠️ Verify exact table name in convex/schema.ts — it may be "lowStockAlerts"
    // Run: await ctx.db.query("lowStockAlerts").withIndex("by_status", q => q.eq("status", "active")).collect()
    const activeAlerts = await ctx.db
      .query("lowStockAlerts")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    // Transfer counts by status — by_status index is efficient
    const [requestedTransfers, approvedTransfers, packedTransfers, inTransitTransfers] =
      await Promise.all([
        ctx.db.query("transfers").withIndex("by_status", (q) => q.eq("status", "requested")).collect(),
        ctx.db.query("transfers").withIndex("by_status", (q) => q.eq("status", "approved")).collect(),
        ctx.db.query("transfers").withIndex("by_status", (q) => q.eq("status", "packed")).collect(),
        ctx.db.query("transfers").withIndex("by_status", (q) => q.eq("status", "inTransit")).collect(),
      ]);

    return {
      todayRevenueCentavos,
      yesterdayRevenueCentavos,
      todayTransactionCount,
      yesterdayTransactionCount,
      activeAlertsCount: activeAlerts.length,
      transferSummary: {
        pendingApproval: requestedTransfers.length,   // needs HQ action
        inFlight: approvedTransfers.length + packedTransfers.length + inTransitTransfers.length,
      },
    };
  },
});
```

> ⚠️ **lowStockAlerts table name**: Before writing the query, open `convex/inventory/alerts.ts` and find the exact `ctx.db.query("...")` call. Also confirm the `by_status` index name exists on that table. The table is created in Story 5.3.

### Task 1.2 — `getBranchStatusCards` Query Structure

```typescript
export const getBranchStatusCards = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    const todayStart = getPHTDayStartMs();
    const yesterday24hAgo = Date.now() - 24 * 60 * 60 * 1000;

    const branches = await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    return await Promise.all(branches.map(async (branch) => {
      // Use by_branch_date index for efficient per-branch today query
      const todayTxns = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", branch._id).gte("createdAt", todayStart)
        )
        .collect();

      const todayRevenueCentavos = todayTxns.reduce((sum, t) => sum + t.totalCentavos, 0);
      const todayTransactionCount = todayTxns.length;

      // Last activity = most recent transaction timestamp
      const allBranchTxns = await ctx.db
        .query("transactions")
        .withIndex("by_branch", (q) => q.eq("branchId", branch._id))
        .order("desc")
        .first();
      const lastActivityAt = allBranchTxns?.createdAt ?? null;

      // Active alerts for this branch
      const branchAlerts = await ctx.db
        .query("lowStockAlerts")
        .withIndex("by_branch_status", (q) =>
          q.eq("branchId", branch._id).eq("status", "active")
        )
        .collect();
      const activeAlertCount = branchAlerts.length;

      // Determine health status
      let healthStatus: "healthy" | "attention" | "critical" | "offline";
      if (!lastActivityAt || lastActivityAt < yesterday24hAgo) {
        healthStatus = "offline";
      } else if (activeAlertCount >= 3) {
        healthStatus = "critical";
      } else if (activeAlertCount >= 1) {
        healthStatus = "attention";
      } else {
        healthStatus = "healthy";
      }

      return {
        branchId: branch._id,
        branchName: branch.name,
        todayRevenueCentavos,
        todayTransactionCount,
        activeAlertCount,
        healthStatus,
        lastActivityAt,
      };
    }));
  },
});
```

> ⚠️ **Confirm index names** — `by_branch_date` on `transactions` and `by_branch_status` on `lowStockAlerts` are assumed from Story 5.x patterns. Verify against `convex/schema.ts` before using. If `by_branch_status` doesn't exist on `lowStockAlerts`, fall back to `by_branch` index + in-memory status filter.

### Task 1.3 — `getAttentionItems` Query Structure

```typescript
type AttentionItem = {
  id: string;                                               // React key
  type: "low-stock" | "pending-transfer" | "sync-conflict";
  priority: "critical" | "warning" | "info";
  title: string;
  description: string;
  branchName: string;
  linkTo: string;
};

export const getAttentionItems = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    const items: AttentionItem[] = [];

    // 1. Low-stock alerts (warning priority)
    const activeAlerts = await ctx.db
      .query("lowStockAlerts")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    // Branch name cache — same pattern as fulfillment.ts (use ?? not ! per L1 lesson from Story 6.2)
    const branchCache = new Map<string, string>();
    async function getBranchName(branchId: Id<"branches">): Promise<string> {
      const key = branchId as string;
      if (branchCache.has(key)) return branchCache.get(key) ?? "(inactive)";
      const branch = await ctx.db.get(branchId);
      const name = branch?.isActive ? branch.name : "(inactive)";
      branchCache.set(key, name);
      return name;
    }

    for (const alert of activeAlerts) {
      const branchName = await getBranchName(alert.branchId);
      // ⚠️ lowStockAlerts rows store variantId (not variantSku directly).
      // To get a human-readable label: ctx.db.get(alert.variantId) → variant.sku
      // For MVP simplicity, just use the count in the title — don't fetch each variant here.
      // (getAttentionItems already has per-branch alert counts from getBranchStatusCards)
      items.push({
        id: alert._id as string,
        type: "low-stock",
        priority: "warning",
        title: `Low stock at ${branchName}`,
        description: "Stock level below minimum threshold — click to review",
        branchName,
        linkTo: "/hq/dashboard",
      });
    }

    // 2. Pending transfer requests (warning priority)
    const requestedTransfers = await ctx.db
      .query("transfers")
      .withIndex("by_status", (q) => q.eq("status", "requested"))
      .collect();

    for (const transfer of requestedTransfers) {
      const fromBranchName = await getBranchName(transfer.fromBranchId);
      const toBranchName = await getBranchName(transfer.toBranchId);
      items.push({
        id: transfer._id as string,
        type: "pending-transfer",
        priority: "warning",
        title: `Transfer awaiting approval`,
        description: `${fromBranchName} → ${toBranchName}`,
        branchName: fromBranchName,
        linkTo: "/hq/transfers",
      });
    }

    // 3. Unsynced offline transactions (critical priority)
    const unsyncedTxns = await ctx.db
      .query("transactions")
      .filter((q) => q.eq(q.field("isOffline"), true))
      .collect();
    const actualUnsynced = unsyncedTxns.filter((t) => !t.syncedAt);

    for (const txn of actualUnsynced) {
      const branchName = await getBranchName(txn.branchId);
      items.push({
        id: txn._id as string,
        type: "sync-conflict",
        priority: "critical",
        title: `Offline transaction not synced`,
        description: `Branch: ${branchName} — Receipt ${txn.receiptNumber}`,
        branchName,
        linkTo: "/hq/transfers",
      });
    }

    // Sort: critical first, then warning, then info
    const PRIORITY_ORDER = { critical: 0, warning: 1, info: 2 };
    return items.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  },
});
```

> ⚠️ **lowStockAlerts schema**: Check `convex/inventory/alerts.ts` to confirm the exact fields stored on `lowStockAlerts` rows (e.g., `variantId`, `branchId`, `status`, `threshold`, `quantity`). The `variantSku` field shown above may not exist directly — you may need to `ctx.db.get(alert.variantId)` then `ctx.db.get(variant.styleId)` for a human-readable label.

> ⚠️ **No `syncedAt` compound index**: Full table scan with `filter` for unsynced offline transactions is intentional — this is a small, infrequent set. Do not add a new schema index for this.

### Task 2 — Frontend Dashboard UI Patterns

**Money formatting (centavos → ₱):**
```typescript
function formatCentavos(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
```

**Trend arrow component:**
```tsx
function TrendArrow({
  current, previous, higherIsBetter = true,
}: { current: number; previous: number; higherIsBetter?: boolean }) {
  if (previous === 0) return null;
  const isUp = current >= previous;
  const isGood = higherIsBetter ? isUp : !isUp;
  return (
    <span className={isGood ? "text-green-600" : "text-red-600"}>
      {isUp ? "↑" : "↓"}
    </span>
  );
}
// Revenue, transaction count: higherIsBetter=true
// Alerts count: higherIsBetter=false (fewer alerts = better)
```

**Health status badge:**
```tsx
const HEALTH_CONFIG = {
  healthy:   { label: "Healthy",         className: "bg-green-100 text-green-700" },
  attention: { label: "Needs Attention", className: "bg-amber-100 text-amber-700" },
  critical:  { label: "Critical",        className: "bg-red-100 text-red-700" },
  offline:   { label: "Offline",         className: "bg-gray-100 text-gray-600" },
};
```

**MetricCard component (inline, no separate file):**
```tsx
function MetricCard({
  title, value, trendCurrent, trendPrevious, higherIsBetter,
}: {
  title: string; value: string;
  trendCurrent?: number; trendPrevious?: number; higherIsBetter?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-1">
      <p className="text-sm text-muted-foreground">{title}</p>
      <div className="flex items-center gap-2">
        <p className="text-2xl font-bold">{value}</p>
        {trendCurrent !== undefined && trendPrevious !== undefined && (
          <TrendArrow current={trendCurrent} previous={trendPrevious} higherIsBetter={higherIsBetter} />
        )}
      </div>
    </div>
  );
}
```

**Skeleton loading (same pattern as Story 6.x):**
```tsx
// Section skeleton:
<div className="space-y-3">
  {Array.from({ length: 3 }).map((_, i) => (
    <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
  ))}
</div>

// MetricCards skeleton (4 cards):
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
  {Array.from({ length: 4 }).map((_, i) => (
    <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
  ))}
</div>
```

**AttentionItem border colors:**
```tsx
const PRIORITY_BORDER = {
  critical: "border-l-4 border-l-red-500",
  warning:  "border-l-4 border-l-amber-500",
  info:     "border-l-4 border-l-blue-500",
};
```

**useQuery pattern — loading check:**
```tsx
// Convex convention: data === undefined = loading, null/[] = loaded
const metrics = useQuery(api.dashboards.hqDashboard.getHqMetrics);
const branchCards = useQuery(api.dashboards.hqDashboard.getBranchStatusCards);
const attentionItems = useQuery(api.dashboards.hqDashboard.getAttentionItems);

const isLoading = metrics === undefined || branchCards === undefined || attentionItems === undefined;
```

**Page structure:**
```tsx
export default function HqDashboardPage() {
  // ... queries above

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Morning Command Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All-branch overview — {new Date().toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* MetricCards row */}
      {/* BranchCards grid */}
      {/* AttentionItems list */}
    </div>
  );
}
```

**"last activity" timestamp display for Offline branches:**
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

**Transfer summary MetricCard value string:**
```typescript
// Value: "3 pending / 5 in flight"
value={`${metrics.transferSummary.pendingApproval} pending / ${metrics.transferSummary.inFlight} in flight`}
```

### Recharts — NOT needed for Story 7.1

Recharts (`recharts: "^3.7.0"`) is installed but not required for this story. MetricCards use text + trend arrows. Charts (hourly sales bars, trend lines) are implemented in Story 7.2 (Branch Dashboard). Do NOT add charts to 7.1 to keep it focused.

### File Location for new Convex module

The `convex/dashboards/` directory does NOT currently exist. Create it:
```
convex/dashboards/
└── hqDashboard.ts       # New file — 3 exported query functions
```

No need to manually register in `convex/_generated/api.d.ts` — Convex auto-discovers all `.ts` files under `convex/`.

### Existing file to REPLACE (not create)

`app/hq/dashboard/page.tsx` currently only shows low-stock alerts in a table. **Replace the entire file** with the new Morning Command Center. The low-stock alerts are surfaced through `getAttentionItems` — no need to keep the old `api.inventory.alerts.getLowStockAlerts` query on this page.

> ⚠️ **Intentional removal**: The old stub page had a "Dismiss" button (`api.inventory.alerts.dismissLowStockAlert`) for admins. The new Morning Command Center does NOT include individual alert dismissal — it's a read-only overview. If admins need to dismiss alerts, they do so via the inventory management pages. This is intentional scope for this story.

### Navigation: Use `<Link>` not `useRouter`

BranchCards and AttentionItems are clickable links. Use Next.js `<Link>` for navigation, not `useRouter`:

```tsx
import Link from "next/link";

// BranchCard — wrap the card div in a Link:
<Link href="/hq/transfers" key={branch.branchId}>
  <div className="rounded-lg border bg-card p-4 cursor-pointer hover:bg-muted/30 transition-colors">
    {/* card content */}
  </div>
</Link>

// AttentionItem — wrap each row in a Link:
<Link href={item.linkTo} key={item.id}>
  <div className={`p-4 flex items-start gap-3 cursor-pointer hover:bg-muted/30 ${PRIORITY_BORDER[item.priority]}`}>
    {/* item content */}
  </div>
</Link>
```

Do NOT use `onClick={() => router.push(...)}` — `<Link>` is the idiomatic Next.js pattern and correctly handles cmd+click to open in new tab.

### Key Patterns from Previous Stories

- **`animate-pulse` divs**: No `@/components/ui/skeleton` — use `<div className="h-N animate-pulse rounded bg-muted" />` (confirmed from Story 5.x and 6.x)
- **`v` naming conflict**: NEVER use `v` as a callback parameter in Convex files (imported from `convex/values`)
- **`const now = Date.now()`**: Single call for all timestamps in same mutation
- **Branch name caching**: Use `Map<string, string>` within a query handler to avoid duplicate `ctx.db.get()` calls for the same branch — same pattern used in `fulfillment.ts`
- **`requireRole` returns user**: `const user = await requireRole(ctx, HQ_ROLES);` — returns the user object; for queries you can use `await requireRole(ctx, HQ_ROLES)` (no need to store return value if userId isn't needed)
- **`.filter((q) => q.eq(...))` vs `.withIndex(...)`**: Use `.withIndex()` whenever possible for performance; `.filter()` only when no suitable index exists

### Role check for the existing page

The page lives in `app/hq/` which is guarded by `app/hq/layout.tsx` with `ALLOWED_ROLES = ["admin", "hqStaff"]`. No additional role check needed in the page itself — layout handles redirection. Convex functions enforce role server-side via `requireRole`.

### Project Structure

```
Files to CREATE in this story:
└── convex/dashboards/hqDashboard.ts     # New module — 3 queries

Files to REPLACE in this story:
└── app/hq/dashboard/page.tsx            # Replace stub with Morning Command Center

Files that MUST NOT be modified:
├── app/hq/layout.tsx                    # Nav + role guard — already configured with Dashboard link
├── convex/schema.ts                     # No schema changes needed for this story
├── convex/inventory/alerts.ts           # Complete — read for index/table name reference only
├── convex/transfers/fulfillment.ts      # Complete — read by_status index pattern only
├── convex/_helpers/permissions.ts       # Complete — import HQ_ROLES from here
├── convex/_helpers/auditLog.ts          # Not needed for queries
└── convex/_generated/api.d.ts          # Auto-generated — never touch manually
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 7, Story 7.1 ACs and requirements]
- [Source: _bmad-output/planning-artifacts/architecture.md — FR39, FR40, FR42, FR44; convex/dashboards/ module structure; HQ route group; Recharts integration; withBranchScope bypass for HQ roles; real-time subscriptions]
- [Source: convex/schema.ts — transactions (branchId, totalCentavos, createdAt, isOffline, syncedAt, by_branch_date index); branches (name, isActive); transfers (by_status index)]
- [Source: convex/_helpers/permissions.ts — HQ_ROLES = ["admin", "hqStaff"], requireRole()]
- [Source: convex/inventory/alerts.ts — getLowStockAlerts: table name, by_branch_status index, active status literal]
- [Source: convex/transfers/requests.ts — branch name caching pattern, by_status index usage]
- [Source: app/hq/layout.tsx — nav items (Dashboard → /hq/dashboard), ALLOWED_ROLES]
- [Source: app/hq/dashboard/page.tsx — current stub: only shows getLowStockAlerts; REPLACE entire file]
- [Source: app/hq/transfers/page.tsx — HQ interface pattern: loading skeleton, inline errors, filter tabs, relativeTime helper]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

N/A

### Completion Notes List

- `lowStockAlerts` table has NO global `by_status` index — only `by_branch_status`. HQ-wide queries use `.filter((q) => q.eq(q.field("status"), "active"))`. Per-branch queries use `.withIndex("by_branch_status", ...)`.
- `getHqMetrics` uses a single per-branch query from `yesterdayStart` then in-memory partition into today/yesterday — avoids 2N queries, prevents full table scan on 3yr BIR transaction history.
- `convex/_generated/api.d.ts` required regeneration via `npx convex codegen` after creating `convex/dashboards/hqDashboard.ts` — types are now updated.
- Trend arrow uses `current === previous` as no-change guard to avoid showing arrows on equal values.
- Old stub page had Dismiss button (`api.inventory.alerts.dismissLowStockAlert`) — intentionally removed; Morning Command Center is read-only overview. Alert dismissal remains in inventory management pages.
- **[Code Review Fix]** Active Stock Alerts trend arrow: uses `_creationTime` to count new alerts created today vs yesterday (active-only approximation — dismissed alerts excluded since no historical snapshot). `higherIsBetter=false` so ↓ shows green.
- **[Code Review Fix]** Transfers MetricCard: no trend arrow — "pending / in flight" is a compound workflow STATUS snapshot, not a single trending metric. AC updated accordingly.
- **[Code Review Fix]** Health status logic: "healthy" now requires `todayTransactionCount > 0` (AC #2 compliance). Branches with recent activity but zero today-sales show "offline" (e.g., branch not yet open at 8am). This is a known edge case — early-morning false-offline — to be revisited in a future story if needed.
- **[Code Review Note — M1]** `getAttentionItems` full table scan on `transactions` for offline detection: scan size is bounded by ALL transactions (not just isOffline=true rows). With 3yr BIR history this may degrade. Mitigation: add `isOffline` index to schema in a future performance story.
- **[Code Review Note — M2]** `lowStockAlerts` is fully scanned twice per dashboard load (once in `getHqMetrics`, once in `getAttentionItems`). Acceptable now; adding a global `by_status` index in future would benefit both queries.
- **[Code Review Note — L2]** "overdue reservations" AttentionItem type mentioned in epics.md AC — deferred to Epic 8 (Reservations feature not yet implemented).

### File List

- `convex/dashboards/hqDashboard.ts` — Created: 3 query functions (getHqMetrics, getBranchStatusCards, getAttentionItems)
- `app/hq/dashboard/page.tsx` — Replaced: full Morning Command Center UI (MetricCards, BranchCards, AttentionItems)
- `convex/_generated/api.d.ts` — Auto-updated via `npx convex codegen` (not manually edited)

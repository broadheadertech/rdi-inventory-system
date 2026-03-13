"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useMemo } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── TrendArrow ───────────────────────────────────────────────────────────────

function TrendArrow({
  current,
  previous,
  higherIsBetter = true,
}: {
  current: number;
  previous: number;
  higherIsBetter?: boolean;
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

// ─── MetricCard ───────────────────────────────────────────────────────────────

function MetricCard({
  title,
  value,
  trendCurrent,
  trendPrevious,
  higherIsBetter,
  colorClass,
}: {
  title: string;
  value: string;
  trendCurrent?: number;
  trendPrevious?: number;
  higherIsBetter?: boolean;
  colorClass?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-1">
      <p className="text-sm text-muted-foreground">{title}</p>
      <div className="flex items-baseline gap-1">
        <p className={`text-2xl font-bold ${colorClass ?? ""}`}>{value}</p>
        {trendCurrent !== undefined && trendPrevious !== undefined && (
          <TrendArrow
            current={trendCurrent}
            previous={trendPrevious}
            higherIsBetter={higherIsBetter}
          />
        )}
      </div>
    </div>
  );
}

// ─── PipelineCard ─────────────────────────────────────────────────────────────

function PipelineCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-lg border bg-card p-4 text-center space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{count}</p>
    </div>
  );
}

// ─── Transfer status label map ────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  approved: "Approved",
  packed: "Packed",
  inTransit: "In Transit",
};

// ─── StockAlerts ──────────────────────────────────────────────────────────────

function StockAlerts() {
  const alerts = useQuery(api.dashboards.branchDashboard.getBranchAlerts);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Stock Alerts</h2>

      {alerts === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : !alerts ? (
        <p className="text-sm text-muted-foreground">No branch context.</p>
      ) : alerts.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No active stock alerts
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden divide-y">
          {alerts.map((alert) => (
            <div key={alert.id} className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{alert.styleName}</p>
                <p className="text-xs text-muted-foreground">{alert.variantSku}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium text-amber-600">
                  {alert.currentQuantity} units
                </p>
                <p className="text-xs text-muted-foreground">
                  min {alert.threshold}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── WarehouseDashboard ───────────────────────────────────────────────────────

function WarehouseDashboard({ todayLabel }: { todayLabel: string }) {
  const metrics = useQuery(api.dashboards.branchDashboard.getWarehouseMetrics);
  const pipeline = useQuery(api.dashboards.branchDashboard.getWarehouseTransferPipeline);
  const recentInvoices = useQuery(api.dashboards.branchDashboard.getRecentWarehouseInvoices);
  const transfers = useQuery(api.dashboards.branchDashboard.getPendingTransfers);

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Warehouse Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">{todayLabel}</p>
      </div>

      {/* ── Today's Overview ── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Today&apos;s Overview</h2>

        {metrics === undefined ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : !metrics ? (
          <p className="text-sm text-muted-foreground">No branch context.</p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Transfer Revenue"
              value={`₱${(metrics.todayRevenueCentavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`}
              trendCurrent={metrics.todayRevenueCentavos}
              trendPrevious={metrics.yesterdayRevenueCentavos}
              higherIsBetter
            />
            <MetricCard
              title="Invoices Generated"
              value={String(metrics.todayInvoiceCount)}
              trendCurrent={metrics.todayInvoiceCount}
              trendPrevious={metrics.yesterdayInvoiceCount}
              higherIsBetter
            />
            <MetricCard
              title="Dispatched Today"
              value={String(metrics.todayDispatched)}
              trendCurrent={metrics.todayDispatched}
              trendPrevious={metrics.yesterdayDispatched}
              higherIsBetter
            />
            <MetricCard
              title="Pending Queue"
              value={String(metrics.pendingCount)}
            />
          </div>
        )}
      </section>

      {/* ── Transfer Pipeline ── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Transfer Pipeline</h2>

        {pipeline === undefined ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : !pipeline ? (
          <p className="text-sm text-muted-foreground">No branch context.</p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <PipelineCard label="Awaiting Approval" count={pipeline.awaitingApproval} />
            <PipelineCard label="Awaiting Packing" count={pipeline.awaitingPacking} />
            <PipelineCard label="Ready to Dispatch" count={pipeline.readyToDispatch} />
            <PipelineCard label="In Transit" count={pipeline.inTransit} />
          </div>
        )}
      </section>

      {/* ── Recent Invoices ── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Recent Invoices</h2>

        {recentInvoices === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : !recentInvoices ? (
          <p className="text-sm text-muted-foreground">No branch context.</p>
        ) : recentInvoices.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No invoices yet
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden divide-y">
            {recentInvoices.map((inv) => (
              <div key={inv.id} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{inv.invoiceNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    &rarr; {inv.toBranchName}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium">
                    ₱{(inv.totalCentavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {relativeTime(inv.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Stock Alerts (reused) ── */}
      <StockAlerts />

      {/* ── Pending Transfers ── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Pending Transfers</h2>

        {transfers === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : !transfers ? (
          <p className="text-sm text-muted-foreground">No branch context.</p>
        ) : (transfers.outgoing.length === 0 && transfers.incoming.length === 0) ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No pending transfers
          </div>
        ) : (
          <div className="space-y-4">
            {transfers.outgoing.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Outgoing
                </p>
                <div className="rounded-lg border overflow-hidden divide-y">
                  {transfers.outgoing.map((transfer) => (
                    <div
                      key={transfer.id}
                      className="px-4 py-3 flex items-center justify-between gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          &rarr; {transfer.toBranchName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {relativeTime(transfer.createdAt)}
                        </p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground whitespace-nowrap shrink-0">
                        {STATUS_LABEL[transfer.status] ?? transfer.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {transfers.incoming.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Incoming
                </p>
                <div className="rounded-lg border overflow-hidden divide-y">
                  {transfers.incoming.map((transfer) => (
                    <div
                      key={transfer.id}
                      className="px-4 py-3 flex items-center justify-between gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          &larr; {transfer.fromBranchName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {relativeTime(transfer.createdAt)}
                        </p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground whitespace-nowrap shrink-0">
                        {STATUS_LABEL[transfer.status] ?? transfer.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── RetailDashboard ──────────────────────────────────────────────────────────

function RetailDashboard({ todayLabel }: { todayLabel: string }) {
  const metrics = useQuery(api.dashboards.branchDashboard.getBranchMetrics);
  const inventoryHealth = useQuery(api.dashboards.branchAnalytics.getInventoryHealth, {});
  const transfers = useQuery(api.dashboards.branchDashboard.getPendingTransfers);

  // Weekly range for top sellers and velocity
  const weekRange = useMemo(() => {
    const PHT = 8 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const nowPht = nowMs + PHT;
    const todayMidnightPht = nowPht - (nowPht % (24 * 60 * 60 * 1000));
    const todayStartMs = todayMidnightPht - PHT;
    const dow = new Date(nowPht).getUTCDay();
    const daysSinceMon = dow === 0 ? 6 : dow - 1;
    return { startMs: todayStartMs - daysSinceMon * 86400000, endMs: nowMs };
  }, []);

  const topProducts = useQuery(
    api.dashboards.branchAnalytics.getTopSellingProducts,
    { startMs: weekRange.startMs, endMs: weekRange.endMs }
  );
  const velocity = useQuery(
    api.dashboards.branchAnalytics.getProductVelocity,
    { startMs: weekRange.startMs, endMs: weekRange.endMs }
  );

  const slowMovers = velocity
    ? [...(velocity.slowMoving ?? []), ...(velocity.noMovement ?? [])].slice(0, 8)
    : null;

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Branch Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">{todayLabel}</p>
      </div>

      {/* ── Inventory Overview ── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Today&apos;s Overview</h2>

        {metrics === undefined || inventoryHealth === undefined ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Items Sold Today"
              value={metrics ? String(metrics.todayItemsSold) : "—"}
              trendCurrent={metrics?.todayItemsSold}
              trendPrevious={metrics?.yesterdayItemsSold}
              higherIsBetter
            />
            <MetricCard
              title="Total SKUs"
              value={inventoryHealth ? String(inventoryHealth.totalSkus) : "—"}
            />
            <MetricCard
              title="Low Stock SKUs"
              value={inventoryHealth ? String(inventoryHealth.lowStockCount) : "—"}
              colorClass={inventoryHealth && inventoryHealth.lowStockCount > 0 ? "text-amber-600" : undefined}
            />
            <MetricCard
              title="Out of Stock"
              value={inventoryHealth ? String(inventoryHealth.outOfStockCount) : "—"}
              colorClass={inventoryHealth && inventoryHealth.outOfStockCount > 0 ? "text-red-600" : undefined}
            />
          </div>
        )}
      </section>

      {/* ── Upcoming Deliveries ── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Upcoming Deliveries</h2>

        {transfers === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : !transfers || transfers.incoming.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No incoming transfers
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden divide-y">
            {transfers.incoming.map((transfer) => (
              <div
                key={transfer.id}
                className="px-4 py-3 flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    From {transfer.fromBranchName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {relativeTime(transfer.createdAt)}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${
                  transfer.status === "inTransit"
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {STATUS_LABEL[transfer.status] ?? transfer.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Most Sold This Week ── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Most Sold This Week</h2>

        {topProducts === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : !topProducts || topProducts.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No sales data this week
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">#</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Product</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Units</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.slice(0, 5).map((p, i) => (
                  <tr key={p.variantId} className="border-b last:border-0">
                    <td className="px-4 py-3 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{p.styleName}</p>
                      <p className="text-xs text-muted-foreground">{p.size} / {p.color}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{p.totalQuantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Slow Movers ── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Slow & Dead Stock</h2>
        <p className="text-xs text-muted-foreground -mt-1">Items with low or no movement this week</p>

        {velocity === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : !slowMovers || slowMovers.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No slow-moving stock this week
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Product</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Stock</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Sold</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">DSI</th>
                </tr>
              </thead>
              <tbody>
                {slowMovers.map((item) => (
                  <tr key={item.variantId} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{item.styleName}</p>
                      <p className="text-xs text-muted-foreground">{item.size} / {item.color}</p>
                    </td>
                    <td className="px-4 py-3 text-right">{item.currentStock}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{item.totalSold}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-medium ${
                        item.classification === "NO_MOVEMENT" ? "text-gray-500" : "text-red-600"
                      }`}>
                        {item.dsi >= 999 ? "∞" : `${item.dsi}d`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Stock Alerts ── */}
      <StockAlerts />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BranchDashboardPage() {
  const branchContext = useQuery(api.dashboards.branchDashboard.getBranchContext);

  const todayLabel = new Date().toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Loading state
  if (branchContext === undefined) {
    return (
      <div className="p-6 space-y-8">
        <div>
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  // No branch context (admin bypass)
  if (!branchContext) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">No branch context.</p>
      </div>
    );
  }

  if (branchContext.branchType === "warehouse") {
    return <WarehouseDashboard todayLabel={todayLabel} />;
  }

  return <RetailDashboard todayLabel={todayLabel} />;
}

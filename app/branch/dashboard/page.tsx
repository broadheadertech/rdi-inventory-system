"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCentavos(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

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
}: {
  title: string;
  value: string;
  trendCurrent?: number;
  trendPrevious?: number;
  higherIsBetter?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-1">
      <p className="text-sm text-muted-foreground">{title}</p>
      <div className="flex items-baseline gap-1">
        <p className="text-2xl font-bold">{value}</p>
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

// ─── StockAlerts (shared between both dashboards) ─────────────────────────────

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
              value={formatCentavos(metrics.todayRevenueCentavos)}
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
                    {formatCentavos(inv.totalCentavos)}
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
  const chartData = useQuery(api.dashboards.branchDashboard.getHourlySalesChart);
  const transfers = useQuery(api.dashboards.branchDashboard.getPendingTransfers);

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Branch Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">{todayLabel}</p>
      </div>

      {/* ── MetricCards ── */}
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
              title="Revenue Today"
              value={formatCentavos(metrics.todayRevenueCentavos)}
              trendCurrent={metrics.todayRevenueCentavos}
              trendPrevious={metrics.yesterdayRevenueCentavos}
              higherIsBetter
            />
            <MetricCard
              title="Transactions Today"
              value={String(metrics.todayTransactionCount)}
              trendCurrent={metrics.todayTransactionCount}
              trendPrevious={metrics.yesterdayTransactionCount}
              higherIsBetter
            />
            <MetricCard
              title="Items Sold Today"
              value={String(metrics.todayItemsSold)}
              trendCurrent={metrics.todayItemsSold}
              trendPrevious={metrics.yesterdayItemsSold}
              higherIsBetter
            />
            <MetricCard
              title="Avg Transaction Value"
              value={formatCentavos(metrics.todayAvgTxnValueCentavos)}
              trendCurrent={metrics.todayAvgTxnValueCentavos}
              trendPrevious={metrics.yesterdayAvgTxnValueCentavos}
              higherIsBetter
            />
          </div>
        )}
      </section>

      {/* ── Hourly Sales Chart ── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Hourly Sales</h2>

        {chartData === undefined ? (
          <div className="h-48 animate-pulse rounded-lg bg-muted" />
        ) : !chartData ? (
          <p className="text-sm text-muted-foreground">No branch context.</p>
        ) : (
          <div className="rounded-lg border bg-card p-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  interval={2}
                />
                <YAxis
                  tickFormatter={(val: number) =>
                    val >= 100000
                      ? `₱${(val / 100 / 1000).toFixed(0)}k`
                      : `₱${(val / 100).toFixed(0)}`
                  }
                  tick={{ fontSize: 10 }}
                  width={50}
                />
                <Tooltip
                  formatter={(value: number | undefined) => [
                    value !== undefined ? formatCentavos(value) : "—",
                    "Revenue",
                  ]}
                  labelFormatter={(label) => `Hour: ${label}`}
                />
                <Bar
                  dataKey="revenueCentavos"
                  fill="hsl(var(--primary))"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
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

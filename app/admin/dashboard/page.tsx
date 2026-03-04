"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

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

// ─── MetricCard ───────────────────────────────────────────────────────────────

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

// ─── Health config ────────────────────────────────────────────────────────────

const HEALTH_CONFIG: Record<
  "healthy" | "attention" | "critical" | "offline",
  { label: string; className: string }
> = {
  healthy: {
    label: "Healthy",
    className: "bg-green-100 text-green-700 border border-green-200",
  },
  attention: {
    label: "Needs Attention",
    className: "bg-amber-100 text-amber-700 border border-amber-200",
  },
  critical: {
    label: "Critical",
    className: "bg-red-100 text-red-700 border border-red-200",
  },
  offline: {
    label: "Offline",
    className: "bg-gray-100 text-gray-600 border border-gray-200",
  },
};

// ─── Priority border colours ──────────────────────────────────────────────────

const PRIORITY_BORDER: Record<"critical" | "warning" | "info", string> = {
  critical: "border-l-4 border-l-red-500",
  warning: "border-l-4 border-l-amber-500",
  info: "border-l-4 border-l-blue-500",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HqDashboardPage() {
  const metrics = useQuery(api.dashboards.hqDashboard.getHqMetrics);
  const branchCards = useQuery(api.dashboards.hqDashboard.getBranchStatusCards);
  const attentionItems = useQuery(api.dashboards.hqDashboard.getAttentionItems);
  const branchScores = useQuery(api.ai.branchScoring.getLatestBranchScores);

  // Product Movers snapshot — 30-day window
  const moversOverview = useQuery(api.dashboards.productMovers.getMoversOverview, useMemo(() => {
    const now = new Date();
    const end = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const start = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    return { dateStart: start, dateEnd: end };
  }, []));

  const [sortBy, setSortBy] = useState<"score" | "name">("score");

  const enrichedBranches = useMemo(() => {
    if (!branchCards) return undefined;
    const scoreMap = new Map(
      (branchScores ?? []).map((s) => [s.branchId as string, s])
    );
    const merged = branchCards.map((branch) => ({
      ...branch,
      score: scoreMap.get(branch.branchId as string) ?? null,
    }));
    if (sortBy === "score") {
      merged.sort(
        (a, b) =>
          (b.score?.compositeScore ?? -1) - (a.score?.compositeScore ?? -1)
      );
    } else {
      merged.sort((a, b) => a.branchName.localeCompare(b.branchName));
    }
    return merged;
  }, [branchCards, branchScores, sortBy]);

  const todayLabel = new Date().toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Morning Command Center
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{todayLabel}</p>
      </div>

      {/* ── MetricCards ── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Today&apos;s Overview</h2>

        {metrics === undefined ? (
          /* Loading skeleton */
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
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
              title="Active Stock Alerts"
              value={String(metrics.activeAlertsCount)}
              trendCurrent={metrics.todayNewAlertsCount}
              trendPrevious={metrics.yesterdayNewAlertsCount}
              higherIsBetter={false}
            />
            <MetricCard
              title="Warehouse Sales"
              value={formatCentavos(metrics.warehouseTodayRevenueCentavos)}
              trendCurrent={metrics.warehouseTodayRevenueCentavos}
              trendPrevious={metrics.warehouseYesterdayRevenueCentavos}
              higherIsBetter
            />
          </div>
        )}
      </section>

      {/* ── Branch Status ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Branch Status</h2>
          <div className="flex gap-1">
            <button
              onClick={() => setSortBy("score")}
              className={cn(
                "px-2 py-1 text-xs rounded",
                sortBy === "score"
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-gray-100"
              )}
            >
              By Score
            </button>
            <button
              onClick={() => setSortBy("name")}
              className={cn(
                "px-2 py-1 text-xs rounded",
                sortBy === "name"
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-gray-100"
              )}
            >
              By Name
            </button>
          </div>
        </div>

        {enrichedBranches === undefined ? (
          /* Loading skeleton */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : enrichedBranches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active branches.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {enrichedBranches.map((branch) => {
              const health = HEALTH_CONFIG[branch.healthStatus];
              return (
                <Link
                  href="/admin/transfers"
                  key={String(branch.branchId)}
                >
                  <div className="rounded-lg border bg-card p-4 space-y-2 cursor-pointer hover:bg-muted/30 transition-colors h-full">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-semibold text-sm leading-tight truncate">
                          {branch.branchName}
                        </p>
                        {branch.score?.compositeScore != null && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <span
                              className={cn(
                                "text-lg font-bold",
                                branch.score.compositeScore >= 80
                                  ? "text-green-600"
                                  : branch.score.compositeScore >= 60
                                    ? "text-amber-600"
                                    : "text-red-600"
                              )}
                            >
                              {branch.score.compositeScore}
                            </span>
                            {branch.score.trendDirection === "up" && (
                              <span className="text-green-600 text-xs">↑</span>
                            )}
                            {branch.score.trendDirection === "down" && (
                              <span className="text-red-600 text-xs">↓</span>
                            )}
                            {branch.score.trendDirection === "flat" && (
                              <span className="text-gray-400 text-xs">&mdash;</span>
                            )}
                          </div>
                        )}
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${health.className}`}
                      >
                        {health.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Revenue:{" "}
                        <span className="font-medium text-foreground">
                          {formatCentavos(branch.todayRevenueCentavos)}
                        </span>
                      </span>
                      <span>
                        Txns:{" "}
                        <span className="font-medium text-foreground">
                          {branch.todayTransactionCount}
                        </span>
                      </span>
                      <span>
                        Alerts:{" "}
                        <span
                          className={
                            branch.activeAlertCount > 0
                              ? "font-medium text-amber-600"
                              : "font-medium text-foreground"
                          }
                        >
                          {branch.activeAlertCount}
                        </span>
                      </span>
                      {branch.healthStatus === "offline" &&
                        branch.lastActivityAt && (
                          <span>
                            Last seen:{" "}
                            <span className="font-medium text-foreground">
                              {relativeTime(branch.lastActivityAt)}
                            </span>
                          </span>
                        )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Attention Required ── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Attention Required</h2>

        {attentionItems === undefined ? (
          /* Loading skeleton */
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : attentionItems.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            All clear — no attention items
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden divide-y">
            {attentionItems.map((item) => (
              <Link href={item.linkTo} key={item.id}>
                <div
                  className={`px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-muted/30 transition-colors ${PRIORITY_BORDER[item.priority]}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.description}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {item.branchName}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Product Movers Snapshot ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Product Movers</h2>
          <Link
            href="/admin/reports/movers"
            className="text-sm text-primary hover:underline"
          >
            View Full Report &rarr;
          </Link>
        </div>

        {moversOverview === undefined ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-lg border bg-card p-4 space-y-1">
                <p className="text-sm text-muted-foreground">Fast Movers</p>
                <p className="text-2xl font-bold text-green-600">{moversOverview.fastMovers}</p>
              </div>
              <div className="rounded-lg border bg-card p-4 space-y-1">
                <p className="text-sm text-muted-foreground">Normal</p>
                <p className="text-2xl font-bold text-blue-600">{moversOverview.normal}</p>
              </div>
              <div className="rounded-lg border bg-card p-4 space-y-1">
                <p className="text-sm text-muted-foreground">Slow Movers</p>
                <p className="text-2xl font-bold text-amber-600">{moversOverview.slowMovers}</p>
              </div>
              <div className="rounded-lg border bg-card p-4 space-y-1">
                <p className="text-sm text-muted-foreground">Dead Stock</p>
                <p className="text-2xl font-bold text-red-600">{moversOverview.deadStock}</p>
              </div>
            </div>

            {moversOverview.urgentRestock.length > 0 && (
              <div className="rounded-md border-l-4 border-l-red-500 bg-red-50 p-3 text-sm">
                <p className="font-medium text-red-800">Urgent Restock Needed</p>
                {moversOverview.urgentRestock.map((item, i) => (
                  <p key={i} className="text-red-700 mt-0.5">
                    {item.styleName} ({item.size}/{item.color}) &mdash; {item.daysOfSupply}d left
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCentavos(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatUnits(units: number): string {
  return `${units.toLocaleString("en-PH")} pcs`;
}

function formatPercent(percent: number): string {
  return `${percent.toFixed(1)}%`;
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
  valueClassName,
  footer,
  trendCurrent,
  trendPrevious,
  higherIsBetter,
}: {
  title: string;
  value: string;
  valueClassName?: string;
  footer?: string;
  trendCurrent?: number;
  trendPrevious?: number;
  higherIsBetter?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-1">
      <p className="text-sm text-muted-foreground">{title}</p>
      <div className="flex items-baseline gap-1">
        <p className={cn("text-2xl font-bold", valueClassName)}>{value}</p>
        {trendCurrent !== undefined && trendPrevious !== undefined && (
          <TrendArrow
            current={trendCurrent}
            previous={trendPrevious}
            higherIsBetter={higherIsBetter}
          />
        )}
      </div>
      {footer && <p className="text-xs text-muted-foreground">{footer}</p>}
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

type Period = "daily" | "monthly" | "yearly";
const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];
const PERIOD_SECTION_LABEL: Record<Period, string> = {
  daily: "Today's Overview",
  monthly: "This Month's Overview",
  yearly: "This Year's Overview",
};

export default function HqDashboardPage() {
  const [period, setPeriod] = useState<Period>("monthly");
  const [graphTab, setGraphTab] = useState<"sales" | "soh">("sales");

  // Store Ranking — independent filter (default: yesterday, PHT)
  const [rankingDate, setRankingDate] = useState<string>(() => {
    const y = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yy = y.getFullYear();
    const mm = String(y.getMonth() + 1).padStart(2, "0");
    const dd = String(y.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  });
  const [rankingLimit, setRankingLimit] = useState<10 | 20>(10);
  const storeRanking = useQuery(api.dashboards.hqDashboard.getStoreRanking, {
    date: rankingDate,
    limit: rankingLimit,
  }) as
    | {
        date: string;
        totalSalesCentavos: number;
        items: {
          rank: number;
          branchId: string;
          branchName: string;
          channel: string | null;
          salesCentavos: number;
          transactionCount: number;
          itemsSold: number;
          sharePercent: number;
        }[];
      }
    | undefined;
  const salesBreakdown = useQuery(api.dashboards.hqDashboard.getHqSalesBreakdown, { period });
  const inventoryBreakdown = useQuery(api.dashboards.hqDashboard.getHqInventoryBreakdown, { period });
  const salesTimeSeries = useQuery(api.dashboards.hqDashboard.getHqSalesTimeSeries, { period });
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
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-base font-semibold">{PERIOD_SECTION_LABEL[period]}</h2>
          <div className="flex gap-1 rounded-md border bg-muted/30 p-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={cn(
                  "px-3 py-1 text-xs rounded font-medium transition-colors",
                  period === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-gray-100"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {salesBreakdown === undefined ? (
          /* Loading skeleton */
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Overall Sales"
              value={formatCentavos(salesBreakdown.totalSalesCentavos)}
            />
            <MetricCard
              title={
                salesBreakdown.brands[0]
                  ? `${salesBreakdown.brands[0].brandName} Sales`
                  : "Brand A Sales"
              }
              value={formatCentavos(
                salesBreakdown.brands[0]?.salesCentavos ?? 0
              )}
            />
            <MetricCard
              title={
                salesBreakdown.brands[1]
                  ? `${salesBreakdown.brands[1].brandName} Sales`
                  : "Brand B Sales"
              }
              value={formatCentavos(
                salesBreakdown.brands[1]?.salesCentavos ?? 0
              )}
            />
            <MetricCard
              title="Gross Profit"
              value={formatCentavos(salesBreakdown.grossProfitCentavos)}
            />
          </div>
        )}

        {inventoryBreakdown === undefined ? (
          /* Loading skeleton */
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Overall SOH"
              value={formatUnits(inventoryBreakdown.totalSohUnits)}
            />
            {[0, 1].map((i) => {
              const brand = inventoryBreakdown.brands[i];
              const fallbackTitle = i === 0 ? "Brand A SOH" : "Brand B SOH";
              const soh = brand?.sohUnits ?? 0;
              const par = brand?.parLevel ?? 0;
              const hasPar = par > 0;
              const isHealthy = hasPar ? soh >= par : true;
              return (
                <MetricCard
                  key={i}
                  title={brand ? `${brand.brandName} SOH` : fallbackTitle}
                  value={formatUnits(soh)}
                  valueClassName={
                    hasPar
                      ? isHealthy
                        ? "text-green-600"
                        : "text-red-600"
                      : undefined
                  }
                  footer={hasPar ? `PAR: ${formatUnits(par)}` : "PAR: not set"}
                />
              );
            })}
            <MetricCard
              title="Liquidation Rate"
              value={formatPercent(inventoryBreakdown.liquidationRatePercent)}
            />
          </div>
        )}
      </section>

      {/* ── Graph ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-base font-semibold">
            {graphTab === "sales" ? "Sales Graph" : "SOH Graph"}
          </h2>
          <div className="flex gap-1 rounded-md border bg-muted/30 p-1">
            <button
              onClick={() => setGraphTab("sales")}
              className={cn(
                "px-3 py-1 text-xs rounded font-medium transition-colors",
                graphTab === "sales"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-gray-100"
              )}
            >
              Sales Graph
            </button>
            <button
              onClick={() => setGraphTab("soh")}
              className={cn(
                "px-3 py-1 text-xs rounded font-medium transition-colors",
                graphTab === "soh"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-gray-100"
              )}
            >
              SOH Graph
            </button>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          {graphTab === "sales" ? (
            salesTimeSeries === undefined ? (
              <div className="h-72 animate-pulse rounded bg-muted" />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={salesTimeSeries.buckets.map((b) => ({
                      label: b.label,
                      sales: b.totalCentavos / 100,
                    }))}
                    margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `₱${(v / 1000).toFixed(0)}k` : `₱${v}`
                      }
                    />
                    <Tooltip
                      formatter={(v: number | undefined) =>
                        `₱${(v ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="sales"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )
          ) : inventoryBreakdown === undefined ? (
            <div className="h-72 animate-pulse rounded bg-muted" />
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-2">
                Current stock-on-hand per brand. PAR line shows the configured target.
              </p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={inventoryBreakdown.brands.map((b) => ({
                      label: b.brandName,
                      soh: b.sohUnits,
                      par: b.parLevel,
                    }))}
                    margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(v: number | undefined, name: string | undefined) =>
                        `${(v ?? 0).toLocaleString("en-PH")} pcs${name === "par" ? " (PAR)" : ""}`
                      }
                    />
                    <Bar dataKey="soh" name="SOH">
                      {inventoryBreakdown.brands.map((b, i) => {
                        const below = b.parLevel > 0 && b.sohUnits < b.parLevel;
                        return (
                          <Cell
                            key={i}
                            fill={below ? "#dc2626" : "#16a34a"}
                          />
                        );
                      })}
                    </Bar>
                    {inventoryBreakdown.brands.some((b) => b.parLevel > 0) && (
                      <ReferenceLine
                        y={Math.max(
                          ...inventoryBreakdown.brands.map((b) => b.parLevel)
                        )}
                        stroke="#9ca3af"
                        strokeDasharray="4 4"
                        label={{
                          value: "Max PAR",
                          position: "right",
                          fontSize: 11,
                          fill: "#6b7280",
                        }}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── Store Ranking ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-base font-semibold">Store Ranking</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={rankingDate}
              onChange={(e) => setRankingDate(e.target.value)}
              className="rounded-md border px-3 py-1 text-xs"
            />
            <div className="flex gap-1 rounded-md border bg-muted/30 p-1">
              {([10, 20] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setRankingLimit(n)}
                  className={cn(
                    "px-3 py-1 text-xs rounded font-medium transition-colors",
                    rankingLimit === n
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-gray-100",
                  )}
                >
                  Top {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          {storeRanking === undefined ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : storeRanking.items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No sales on {rankingDate}.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium w-12">#</th>
                  <th className="px-3 py-2 font-medium">Branch</th>
                  <th className="px-3 py-2 font-medium">Channel</th>
                  <th className="px-3 py-2 font-medium text-right">Sales</th>
                  <th className="px-3 py-2 font-medium text-right">Txns</th>
                  <th className="px-3 py-2 font-medium text-right">Items</th>
                  <th className="px-3 py-2 font-medium text-right">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {storeRanking.items.map((r) => (
                  <tr key={r.branchId} className="hover:bg-muted/30">
                    <td className="px-3 py-2 tabular-nums font-semibold">
                      {r.rank <= 3 ? (
                        <span
                          className={cn(
                            "inline-flex items-center justify-center h-6 w-6 rounded-full text-xs",
                            r.rank === 1
                              ? "bg-yellow-100 text-yellow-700"
                              : r.rank === 2
                                ? "bg-gray-100 text-gray-700"
                                : "bg-amber-100 text-amber-700",
                          )}
                        >
                          {r.rank}
                        </span>
                      ) : (
                        r.rank
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium">{r.branchName}</td>
                    <td className="px-3 py-2 text-muted-foreground capitalize">
                      {r.channel ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCentavos(r.salesCentavos)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.transactionCount.toLocaleString("en-PH")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.itemsSold.toLocaleString("en-PH")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {r.sharePercent.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
              {storeRanking.totalSalesCentavos > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/20 font-semibold">
                    <td className="px-3 py-2" colSpan={3}>
                      Total (shown)
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" colSpan={4}>
                      {formatCentavos(storeRanking.totalSalesCentavos)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
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
                    {item.styleName} ({item.size}/{item.color}) &mdash; {item.dsi}d left
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

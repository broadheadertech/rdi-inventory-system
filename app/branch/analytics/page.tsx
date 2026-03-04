"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCentavos(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className ?? ""}`} />;
}

// ─── Confidence Badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const colors: Record<string, string> = {
    high: "bg-red-50 text-red-700 border-red-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-gray-50 text-gray-600 border-gray-200",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[confidence] ?? colors.low}`}
    >
      {confidence.toUpperCase()}
    </span>
  );
}

// ─── Payment method colors ────────────────────────────────────────────────────

const PAYMENT_COLORS: Record<string, string> = {
  cash: "hsl(var(--primary))",
  gcash: "#3b82f6",
  maya: "#10b981",
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  gcash: "GCash",
  maya: "Maya",
};

// ─── Date Preset helpers ──────────────────────────────────────────────────────

type DatePreset = "today" | "weekly" | "monthly" | "yearly";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

function getPresetMs(preset: DatePreset): { startMs: number; endMs: number; label: string } {
  const PHT = 8 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const nowPht = nowMs + PHT;
  const todayMidnightPht = nowPht - (nowPht % (24 * 60 * 60 * 1000));
  const todayStartMs = todayMidnightPht - PHT;

  if (preset === "today") {
    return { startMs: todayStartMs, endMs: nowMs, label: "Today" };
  }
  if (preset === "weekly") {
    // Monday of this week
    const dayOfWeek = new Date(nowPht).getUTCDay();
    const daysSinceMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    return { startMs: todayStartMs - daysSinceMon * 24 * 60 * 60 * 1000, endMs: nowMs, label: "This Week" };
  }
  if (preset === "monthly") {
    const d = new Date(nowPht);
    const monthStartPht = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    return { startMs: monthStartPht - PHT, endMs: nowMs, label: "This Month" };
  }
  // yearly
  const d = new Date(nowPht);
  const yearStartPht = Date.UTC(d.getUTCFullYear(), 0, 1);
  return { startMs: yearStartPht - PHT, endMs: nowMs, label: "This Year" };
}

// ─── Velocity Day Presets ─────────────────────────────────────────────────────

const VELOCITY_DAYS = [1, 7, 14, 30, 60, 90] as const;

const MI_COLORS = {
  FAST_MOVING: { badge: "bg-green-100 text-green-800 border-green-200", text: "text-green-600", label: "Fast" },
  MEDIUM_MOVING: { badge: "bg-amber-100 text-amber-800 border-amber-200", text: "text-amber-600", label: "Medium" },
  SLOW_MOVING: { badge: "bg-red-100 text-red-800 border-red-200", text: "text-red-600", label: "Slow" },
  NO_MOVEMENT: { badge: "bg-gray-100 text-gray-800 border-gray-200", text: "text-gray-500", label: "Dead Stock" },
} as const;

// ─── Tab Types ────────────────────────────────────────────────────────────────

type AnalyticsTab = "descriptive" | "diagnostic" | "predictive";

const ANALYTICS_TABS: { value: AnalyticsTab; label: string; description: string }[] = [
  { value: "descriptive", label: "Descriptive", description: "What happened" },
  { value: "diagnostic", label: "Diagnostic", description: "Why it happened" },
  { value: "predictive", label: "Predictive", description: "What will happen" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function BranchAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("descriptive");
  const [datePreset, setDatePreset] = useState<DatePreset>("weekly");
  const [velocityDays, setVelocityDays] = useState<(typeof VELOCITY_DAYS)[number]>(7);

  const { startMs, endMs, label: periodLabel } = useMemo(() => getPresetMs(datePreset), [datePreset]);

  const velocityPeriod = useMemo(() => {
    const PHT = 8 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const nowPht = nowMs + PHT;
    const todayMidnightPht = nowPht - (nowPht % (24 * 60 * 60 * 1000));
    const todayStartMs = todayMidnightPht - PHT;
    return { startMs: todayStartMs - (velocityDays - 1) * 24 * 60 * 60 * 1000, endMs: nowMs };
  }, [velocityDays]);

  const branchContext = useQuery(api.dashboards.branchDashboard.getBranchContext);

  // Descriptive
  const weeklySales = useQuery(
    api.dashboards.branchAnalytics.getWeeklySalesSummary,
    activeTab === "descriptive" ? { startMs, endMs } : "skip"
  );
  const topProducts = useQuery(
    api.dashboards.branchAnalytics.getTopSellingProducts,
    activeTab === "descriptive" ? { startMs, endMs } : "skip"
  );
  const inventoryHealth = useQuery(
    api.dashboards.branchAnalytics.getInventoryHealth,
    activeTab === "descriptive" ? {} : "skip"
  );
  const paymentBreakdown = useQuery(
    api.dashboards.branchAnalytics.getPaymentMethodBreakdown,
    activeTab === "descriptive" ? { startMs, endMs } : "skip"
  );

  // Diagnostic
  const velocity = useQuery(
    api.dashboards.branchAnalytics.getProductVelocity,
    activeTab === "diagnostic" ? { startMs: velocityPeriod.startMs, endMs: velocityPeriod.endMs } : "skip"
  );
  const demandGap = useQuery(
    api.dashboards.branchAnalytics.getDemandGapAnalysis,
    activeTab === "diagnostic" ? { startMs, endMs } : "skip"
  );
  const transferEff = useQuery(
    api.dashboards.branchAnalytics.getTransferEfficiency,
    activeTab === "diagnostic" ? {} : "skip"
  );

  // Predictive
  const restockSuggestions = useQuery(
    api.dashboards.branchAnalytics.getBranchRestockSuggestions,
    activeTab === "predictive" ? {} : "skip"
  );
  const projectedRevenue = useQuery(
    api.dashboards.branchAnalytics.getProjectedWeeklyRevenue,
    activeTab === "predictive" ? {} : "skip"
  );
  const demandForecast = useQuery(
    api.dashboards.branchAnalytics.getDemandForecast,
    activeTab === "predictive" ? { startMs, endMs } : "skip"
  );

  const todayLabel = new Date().toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const isWarehouse = branchContext?.branchType === "warehouse";

  // Loading
  if (branchContext === undefined) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  if (!branchContext) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">No branch context.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isWarehouse ? "Warehouse" : "Branch"} Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{todayLabel}</p>
        </div>

        {/* Date preset pills */}
        <div className="flex gap-1.5 flex-wrap">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDatePreset(p.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                datePreset === p.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ Top-level Analytics Tabs ═══════════════════════════════════════ */}
      <div className="flex gap-2">
        {ANALYTICS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "flex flex-col items-start rounded-lg border px-4 py-3 text-left transition-colors",
              activeTab === tab.value
                ? "border-primary bg-primary/5"
                : "border-muted bg-background hover:bg-muted/50"
            )}
          >
            <span
              className={cn(
                "text-sm font-semibold",
                activeTab === tab.value ? "text-primary" : "text-foreground"
              )}
            >
              {tab.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {tab.description}
            </span>
          </button>
        ))}
      </div>

      {/* ═══ DESCRIPTIVE TAB ══════════════════════════════════════════════ */}
      {activeTab === "descriptive" && (
        <div className="space-y-6">
          {/* Weekly Sales Summary */}
          {weeklySales === undefined ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : !weeklySales ? (
            <p className="text-sm text-muted-foreground">No data available.</p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                title={isWarehouse ? `Transfer Revenue (${periodLabel})` : `Revenue (${periodLabel})`}
                value={formatCentavos(weeklySales.thisWeek.revenueCentavos)}
                trendCurrent={weeklySales.thisWeek.revenueCentavos}
                trendPrevious={weeklySales.lastWeek.revenueCentavos}
                higherIsBetter
              />
              <MetricCard
                title={isWarehouse ? `Invoices (${periodLabel})` : `Transactions (${periodLabel})`}
                value={String(weeklySales.thisWeek.transactionCount)}
                trendCurrent={weeklySales.thisWeek.transactionCount}
                trendPrevious={weeklySales.lastWeek.transactionCount}
                higherIsBetter
              />
              {!isWarehouse && (
                <MetricCard
                  title={`Items Sold (${periodLabel})`}
                  value={String(weeklySales.thisWeek.itemsSold)}
                  trendCurrent={weeklySales.thisWeek.itemsSold}
                  trendPrevious={weeklySales.lastWeek.itemsSold}
                  higherIsBetter
                />
              )}
              <MetricCard
                title={isWarehouse ? "Avg Invoice Value" : "Avg Transaction"}
                value={formatCentavos(weeklySales.thisWeek.avgTxnValueCentavos)}
                trendCurrent={weeklySales.thisWeek.avgTxnValueCentavos}
                trendPrevious={weeklySales.lastWeek.avgTxnValueCentavos}
                higherIsBetter
              />
            </div>
          )}

          {/* Top Selling Products + Inventory Health side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Selling Products */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Top Selling Products ({periodLabel})</h3>
              {topProducts === undefined ? (
                <Skeleton className="h-48" />
              ) : !topProducts || topProducts.length === 0 ? (
                <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                  No sales data this week
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">#</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Product</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Qty</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.map((p, i) => (
                        <tr key={p.variantId} className="border-b last:border-0">
                          <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2">
                            <p className="font-medium">{p.styleName}</p>
                            <p className="text-muted-foreground">{p.size} / {p.color}</p>
                          </td>
                          <td className="px-3 py-2 text-right">{p.totalQuantity}</td>
                          <td className="px-3 py-2 text-right font-medium">{formatCentavos(p.totalRevenueCentavos)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Inventory Health + Payment Methods */}
            <div className="space-y-6">
              {/* Inventory Health */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Inventory Health</h3>
                {inventoryHealth === undefined ? (
                  <div className="grid grid-cols-3 gap-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : !inventoryHealth ? (
                  <p className="text-sm text-muted-foreground">No data.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border bg-card p-3 text-center">
                      <p className="text-xl font-bold text-green-600">{inventoryHealth.inStockCount}</p>
                      <p className="text-xs text-muted-foreground">In Stock</p>
                    </div>
                    <div className="rounded-lg border bg-card p-3 text-center">
                      <p className="text-xl font-bold text-amber-600">{inventoryHealth.lowStockCount}</p>
                      <p className="text-xs text-muted-foreground">Low Stock</p>
                    </div>
                    <div className="rounded-lg border bg-card p-3 text-center">
                      <p className="text-xl font-bold text-red-600">{inventoryHealth.outOfStockCount}</p>
                      <p className="text-xs text-muted-foreground">Out of Stock</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Methods (retail only) */}
              {!isWarehouse && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Payment Methods ({periodLabel})</h3>
                  {paymentBreakdown === undefined ? (
                    <Skeleton className="h-32" />
                  ) : !paymentBreakdown ? (
                    <p className="text-sm text-muted-foreground">No data.</p>
                  ) : (
                    <div className="rounded-lg border bg-card p-4">
                      <ResponsiveContainer width="100%" height={120}>
                        <BarChart
                          data={paymentBreakdown.map((p) => ({
                            name: PAYMENT_LABELS[p.method] ?? p.method,
                            revenue: p.revenueCentavos,
                            percentage: p.percentage,
                            method: p.method,
                          }))}
                          layout="vertical"
                          margin={{ top: 0, right: 4, left: 50, bottom: 0 }}
                        >
                          <XAxis type="number" hide />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={50} />
                          <Tooltip
                            formatter={(value: number | undefined) => [
                              value !== undefined ? formatCentavos(value) : "—",
                              "Revenue",
                            ]}
                          />
                          <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                            {paymentBreakdown.map((p) => (
                              <Cell
                                key={p.method}
                                fill={PAYMENT_COLORS[p.method] ?? "hsl(var(--muted))"}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="flex gap-4 mt-2 justify-center">
                        {paymentBreakdown.map((p) => (
                          <span key={p.method} className="text-xs text-muted-foreground">
                            {PAYMENT_LABELS[p.method] ?? p.method}: {p.percentage}%
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ DIAGNOSTIC TAB ═══════════════════════════════════════════════ */}
      {activeTab === "diagnostic" && (
        <div className="space-y-6">
          {/* Product Movement Index */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Product Movement Index</h3>
                <p className="text-xs text-muted-foreground">MI = ADS / DSI — classifies inventory movement speed</p>
              </div>
              <div className="flex items-center gap-1 rounded-lg border p-1">
                {VELOCITY_DAYS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setVelocityDays(d)}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded-md font-medium transition-colors",
                      velocityDays === d
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {d}D
                  </button>
                ))}
              </div>
            </div>

            {velocity === undefined ? (
              <Skeleton className="h-60" />
            ) : !velocity ? (
              <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                No movement data available
              </div>
            ) : (
              <div className="space-y-4">
                {(["FAST_MOVING", "MEDIUM_MOVING", "SLOW_MOVING", "NO_MOVEMENT"] as const).map((tier) => {
                  const items = (tier === "FAST_MOVING" ? velocity.fastMoving : tier === "MEDIUM_MOVING" ? velocity.mediumMoving : tier === "SLOW_MOVING" ? velocity.slowMoving : velocity.noMovement) ?? [];
                  const colors = MI_COLORS[tier];
                  return (
                    <div key={tier} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors.badge}`}>
                          {colors.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {items.length} product{items.length !== 1 ? "s" : ""}
                          {tier === "FAST_MOVING" && " — MI ≥ 0.30"}
                          {tier === "MEDIUM_MOVING" && " — MI 0.10–0.29"}
                          {tier === "SLOW_MOVING" && " — MI < 0.10"}
                          {tier === "NO_MOVEMENT" && " — No sales in period"}
                        </span>
                      </div>
                      {items.length === 0 ? (
                        <div className="rounded-lg border p-4 text-center text-xs text-muted-foreground">
                          No {colors.label.toLowerCase()}-moving products
                        </div>
                      ) : (
                        <div className="rounded-lg border overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-muted/50 border-b">
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Product</th>
                                <th className="text-right px-3 py-2 font-medium text-muted-foreground">ADS</th>
                                <th className="text-right px-3 py-2 font-medium text-muted-foreground">DSI</th>
                                <th className="text-right px-3 py-2 font-medium text-muted-foreground">MI</th>
                                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Stock</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((item) => (
                                <tr key={item.variantId} className="border-b last:border-0">
                                  <td className="px-3 py-2">
                                    <p className="font-medium">{item.styleName}</p>
                                    <p className="text-muted-foreground">{item.size} / {item.color}</p>
                                  </td>
                                  <td className="px-3 py-2 text-right">{item.ads}/day</td>
                                  <td className="px-3 py-2 text-right">{item.dsi}d</td>
                                  <td className={`px-3 py-2 text-right font-medium ${colors.text}`}>{item.mi}</td>
                                  <td className="px-3 py-2 text-right">{item.currentStock}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Demand Gap + Transfer Efficiency */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Demand Gap */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Demand Gap</h3>
              <p className="text-xs text-muted-foreground">Items customers ask for vs what&apos;s in stock</p>
              {demandGap === undefined ? (
                <Skeleton className="h-40" />
              ) : !demandGap || demandGap.length === 0 ? (
                <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                  No demand gaps detected this week
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Brand / Design</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Requests</th>
                        <th className="text-center px-3 py-2 font-medium text-muted-foreground">In Stock?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {demandGap.map((item, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <p className="font-medium">{item.brand}</p>
                            {item.design && <p className="text-muted-foreground">{item.design} {item.size && `(${item.size})`}</p>}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">{item.requestCount}</td>
                          <td className="px-3 py-2 text-center">
                            {item.inStock ? (
                              <span className="text-green-600 font-medium">{item.currentQuantity} units</span>
                            ) : (
                              <span className="text-red-600 font-medium">No</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Transfer Efficiency */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Transfer Efficiency</h3>
              <p className="text-xs text-muted-foreground">
                {isWarehouse ? "Outgoing transfer fulfillment (last 30 days)" : "Incoming transfer fulfillment (last 30 days)"}
              </p>
              {transferEff === undefined ? (
                <Skeleton className="h-32" />
              ) : !transferEff ? (
                <p className="text-sm text-muted-foreground">No data.</p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border bg-card p-4 text-center">
                    <p className="text-2xl font-bold">
                      {transferEff.avgFulfillmentHours > 0
                        ? `${transferEff.avgFulfillmentHours}h`
                        : "N/A"}
                    </p>
                    <p className="text-xs text-muted-foreground">Avg Fulfillment</p>
                  </div>
                  <div className="rounded-lg border bg-card p-4 text-center">
                    <p className="text-2xl font-bold text-green-600">{transferEff.completedCount}</p>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                  <div className="rounded-lg border bg-card p-4 text-center">
                    <p className="text-2xl font-bold text-amber-600">{transferEff.pendingCount}</p>
                    <p className="text-xs text-muted-foreground">Pending</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ PREDICTIVE TAB ═══════════════════════════════════════════════ */}
      {activeTab === "predictive" && (
        <div className="space-y-6">
          {/* Revenue Projection */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Revenue Projection</h3>
            {projectedRevenue === undefined ? (
              <Skeleton className="h-20" />
            ) : !projectedRevenue ? (
              <p className="text-sm text-muted-foreground">No data.</p>
            ) : (
              <div className="rounded-lg border bg-card p-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">This Week So Far ({projectedRevenue.daysElapsed}d)</p>
                    <p className="text-lg font-bold">{formatCentavos(projectedRevenue.currentWeekRevenueCentavos)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Daily Average</p>
                    <p className="text-lg font-bold">{formatCentavos(projectedRevenue.dailyAverageCentavos)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Projected Week Total</p>
                    <p className="text-lg font-bold text-primary">{formatCentavos(projectedRevenue.projectedWeekTotalCentavos)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last Week Actual</p>
                    <p className="text-lg font-bold">{formatCentavos(projectedRevenue.lastWeekTotalCentavos)}</p>
                    {projectedRevenue.projectedWeekTotalCentavos > 0 && projectedRevenue.lastWeekTotalCentavos > 0 && (
                      <TrendArrow
                        current={projectedRevenue.projectedWeekTotalCentavos}
                        previous={projectedRevenue.lastWeekTotalCentavos}
                        higherIsBetter
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Restock Suggestions */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Restock Suggestions (7-day velocity)</h3>
            {restockSuggestions === undefined ? (
              <Skeleton className="h-48" />
            ) : !restockSuggestions || restockSuggestions.length === 0 ? (
              <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                No active restock suggestions for this branch
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Product</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Stock</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Velocity</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Days Left</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Suggest</th>
                        <th className="text-center px-3 py-2 font-medium text-muted-foreground">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {restockSuggestions.map((s) => (
                        <tr key={s.id} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <p className="font-medium">{s.styleName}</p>
                            <p className="text-muted-foreground">{s.sku} &middot; {s.size} / {s.color}</p>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {s.currentStock}
                            {s.incomingStock > 0 && (
                              <span className="text-muted-foreground"> (+{s.incomingStock})</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">{s.avgDailyVelocity}/day</td>
                          <td className="px-3 py-2 text-right">
                            <span className={s.daysUntilStockout <= 2 ? "text-red-600 font-medium" : s.daysUntilStockout <= 5 ? "text-amber-600 font-medium" : ""}>
                              {s.daysUntilStockout}d
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-medium">{s.suggestedQuantity}</td>
                          <td className="px-3 py-2 text-center">
                            <ConfidenceBadge confidence={s.confidence} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Demand Forecast */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Demand Forecast</h3>
            <p className="text-xs text-muted-foreground">Trending items from customer demand logs — may need stocking</p>
            {demandForecast === undefined ? (
              <Skeleton className="h-40" />
            ) : !demandForecast || demandForecast.length === 0 ? (
              <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                No demand signals this week
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Brand / Design</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Requests</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground">Trending</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground">In Stock?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demandForecast.map((item, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <p className="font-medium">{item.brand}</p>
                          {item.design && <p className="text-muted-foreground">{item.design}</p>}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{item.requestCount}</td>
                        <td className="px-3 py-2 text-center">
                          {item.isTrending ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                              TRENDING
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {item.inStock ? (
                            <span className="text-green-600 font-medium">Yes</span>
                          ) : (
                            <span className="text-red-600 font-medium">No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCentavos(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

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

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className ?? ""}`} />;
}

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

function SeverityBadge({ severity }: { severity: "critical" | "warning" | "info" }) {
  const colors: Record<string, string> = {
    critical: "bg-red-50 text-red-700 border-red-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    info: "bg-blue-50 text-blue-600 border-blue-200",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[severity]}`}
    >
      {severity.toUpperCase()}
    </span>
  );
}

const CATEGORY_ICONS: Record<string, string> = {
  revenue: "\u{1F4B0}",
  stock: "\u{1F4E6}",
  velocity: "\u{26A1}",
  transfer: "\u{1F69A}",
  stockout: "\u{1F534}",
};

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

type AnalyticsTab = "descriptive" | "comparisons" | "diagnostic" | "predictive" | "prescriptive";

const ANALYTICS_TABS: { value: AnalyticsTab; label: string; description: string }[] = [
  { value: "descriptive", label: "Descriptive", description: "What happened" },
  { value: "comparisons", label: "Comparisons", description: "Brand vs Category vs Product" },
  { value: "diagnostic", label: "Diagnostic", description: "Why it happened" },
  { value: "predictive", label: "Predictive", description: "What will happen" },
  { value: "prescriptive", label: "Prescriptive", description: "Smart alerts & intelligence" },
];

// ─── Comparison chart colors ─────────────────────────────────────────────────

const CHART_COLORS = [
  "hsl(var(--primary))",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
];

const VERDICT_COLORS = {
  restock: "bg-green-100 text-green-800 border-green-200",
  lay_low: "bg-red-100 text-red-800 border-red-200",
  hold: "bg-gray-100 text-gray-800 border-gray-200",
};

const VERDICT_LABELS = {
  restock: "Restock",
  lay_low: "Lay Low",
  hold: "Hold",
};

type ComparisonView = "brand" | "category" | "product";
type ComparisonMetric = "units" | "revenue";

// ═══════════════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function HQAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("descriptive");
  const [datePreset, setDatePreset] = useState<DatePreset>("weekly");
  const [velocityDays, setVelocityDays] = useState<(typeof VELOCITY_DAYS)[number]>(7);
  const [comparisonView, setComparisonView] = useState<ComparisonView>("brand");
  const [comparisonMetric, setComparisonMetric] = useState<ComparisonMetric>("units");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const { startMs, endMs, label: periodLabel } = useMemo(() => getPresetMs(datePreset), [datePreset]);

  const velocityPeriod = useMemo(() => {
    const PHT = 8 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const nowPht = nowMs + PHT;
    const todayMidnightPht = nowPht - (nowPht % (24 * 60 * 60 * 1000));
    const todayStartMs = todayMidnightPht - PHT;
    return { startMs: todayStartMs - (velocityDays - 1) * 24 * 60 * 60 * 1000, endMs: nowMs };
  }, [velocityDays]);

  // Descriptive
  const salesSummary = useQuery(
    api.dashboards.hqDdpAnalytics.getHQSalesSummary,
    activeTab === "descriptive" ? { startMs, endMs } : "skip"
  );
  const topProducts = useQuery(
    api.dashboards.hqDdpAnalytics.getHQTopSellingProducts,
    activeTab === "descriptive" ? { startMs, endMs } : "skip"
  );
  const inventoryHealth = useQuery(
    api.dashboards.hqAnalytics.getHQInventoryHealth,
    activeTab === "descriptive" ? {} : "skip"
  );
  const paymentBreakdown = useQuery(
    api.dashboards.hqDdpAnalytics.getHQPaymentMethodBreakdown,
    activeTab === "descriptive" ? { startMs, endMs } : "skip"
  );

  // Diagnostic
  const velocity = useQuery(
    api.dashboards.hqDdpAnalytics.getHQProductVelocity,
    activeTab === "diagnostic" ? { startMs: velocityPeriod.startMs, endMs: velocityPeriod.endMs } : "skip"
  );
  const demandGap = useQuery(
    api.dashboards.hqDdpAnalytics.getHQDemandGapAnalysis,
    activeTab === "diagnostic" ? { startMs, endMs } : "skip"
  );
  const transferEff = useQuery(
    api.dashboards.hqDdpAnalytics.getHQTransferEfficiency,
    activeTab === "diagnostic" ? {} : "skip"
  );

  // Predictive
  const salesForecast = useQuery(
    api.dashboards.hqDdpAnalytics.getHQSalesForecast,
    activeTab === "predictive" ? {} : "skip"
  );
  const restockSuggestions = useQuery(
    api.dashboards.hqDdpAnalytics.getHQRestockSuggestions,
    activeTab === "predictive" ? {} : "skip"
  );
  const projectedRevenue = useQuery(
    api.dashboards.hqDdpAnalytics.getHQProjectedRevenue,
    activeTab === "predictive" ? {} : "skip"
  );
  const demandForecast = useQuery(
    api.dashboards.hqDdpAnalytics.getHQDemandForecast,
    activeTab === "predictive" ? { startMs, endMs } : "skip"
  );

  // Prescriptive — Smart Alerts & Cross-Branch Intelligence
  const smartAlerts = useQuery(
    api.dashboards.hqIntelligence.getSmartAlerts,
    activeTab === "prescriptive" ? { startMs, endMs } : "skip"
  );
  const branchRanking = useQuery(
    api.dashboards.hqIntelligence.getBranchPerformanceRanking,
    activeTab === "prescriptive" ? { startMs, endMs } : "skip"
  );
  const stockMatrix = useQuery(
    api.dashboards.hqIntelligence.getStockDistributionMatrix,
    activeTab === "prescriptive" ? { startMs, endMs } : "skip"
  );
  const transferOpps = useQuery(
    api.dashboards.hqIntelligence.getTransferOpportunities,
    activeTab === "prescriptive" ? {} : "skip"
  );
  const fulfillmentComparison = useQuery(
    api.dashboards.hqIntelligence.getFulfillmentSpeedComparison,
    activeTab === "prescriptive" ? {} : "skip"
  );

  // Comparisons tab
  const topBrands = useQuery(
    api.dashboards.comparisonAnalytics.getHQTopBrandsComparison,
    activeTab === "comparisons" ? { startMs, endMs } : "skip"
  );
  const topCategories = useQuery(
    api.dashboards.comparisonAnalytics.getHQTopCategoriesComparison,
    activeTab === "comparisons" ? { startMs, endMs } : "skip"
  );
  const topProductsComparison = useQuery(
    api.dashboards.comparisonAnalytics.getHQTopProductsComparison,
    activeTab === "comparisons" ? { startMs, endMs } : "skip"
  );

  // Descriptive — category donut
  const salesByCategory = useQuery(
    api.dashboards.comparisonAnalytics.getHQSalesByCategory,
    activeTab === "descriptive" ? { startMs, endMs } : "skip"
  );
  const salesBySubcategory = useQuery(
    api.dashboards.comparisonAnalytics.getHQSalesBySubcategory,
    activeTab === "descriptive" && selectedCategoryId
      ? { categoryId: selectedCategoryId as Id<"categories">, startMs, endMs }
      : "skip"
  );

  // Diagnostic — restock vs lay low
  const restockVsLayLow = useQuery(
    api.dashboards.comparisonAnalytics.getHQRestockVsLayLow,
    activeTab === "diagnostic" ? { startMs, endMs } : "skip"
  );

  // Descriptive — daily revenue trend
  const dailyTrend = useQuery(
    api.dashboards.hqDdpAnalytics.getHQDailyRevenueTrend,
    activeTab === "descriptive" ? { startMs, endMs } : "skip"
  );

  const todayLabel = new Date().toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Business Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Whole-business DDP analytics across all branches &middot; {todayLabel}
          </p>
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

      {/* DDP Tabs */}
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
            <span className="text-xs text-muted-foreground">{tab.description}</span>
          </button>
        ))}
      </div>

      {/* ═══ DESCRIPTIVE TAB ══════════════════════════════════════════════ */}
      {activeTab === "descriptive" && (
        <div className="space-y-6">
          {/* Sales Summary */}
          {salesSummary === undefined ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : !salesSummary ? (
            <p className="text-sm text-muted-foreground">No data available.</p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                title={`Total Sales (${periodLabel})`}
                value={formatCentavos(salesSummary.thisWeek.revenueCentavos)}
                trendCurrent={salesSummary.thisWeek.revenueCentavos}
                trendPrevious={salesSummary.lastWeek.revenueCentavos}
                higherIsBetter
              />
              <MetricCard
                title={`Transactions (${periodLabel})`}
                value={String(salesSummary.thisWeek.transactionCount)}
                trendCurrent={salesSummary.thisWeek.transactionCount}
                trendPrevious={salesSummary.lastWeek.transactionCount}
                higherIsBetter
              />
              <MetricCard
                title={`Items Sold (${periodLabel})`}
                value={String(salesSummary.thisWeek.itemsSold)}
                trendCurrent={salesSummary.thisWeek.itemsSold}
                trendPrevious={salesSummary.lastWeek.itemsSold}
                higherIsBetter
              />
              <MetricCard
                title="Avg Transaction"
                value={formatCentavos(salesSummary.thisWeek.avgTxnValueCentavos)}
                trendCurrent={salesSummary.thisWeek.avgTxnValueCentavos}
                trendPrevious={salesSummary.lastWeek.avgTxnValueCentavos}
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
                  No sales data for this period
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">#</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Product</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Qty</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Sales</th>
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
                <h3 className="text-sm font-semibold">Inventory Health (All Branches)</h3>
                {inventoryHealth === undefined ? (
                  <div className="grid grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : !inventoryHealth ? (
                  <p className="text-sm text-muted-foreground">No data.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-3">
                    <div className="rounded-lg border bg-card p-3 text-center">
                      <p className="text-xl font-bold">{inventoryHealth.totals.totalSkus}</p>
                      <p className="text-xs text-muted-foreground">Total SKUs</p>
                    </div>
                    <div className="rounded-lg border bg-card p-3 text-center">
                      <p className="text-xl font-bold text-green-600">{inventoryHealth.totals.healthy}</p>
                      <p className="text-xs text-muted-foreground">Healthy</p>
                    </div>
                    <div className="rounded-lg border bg-card p-3 text-center">
                      <p className="text-xl font-bold text-amber-600">{inventoryHealth.totals.lowStock}</p>
                      <p className="text-xs text-muted-foreground">Low Stock</p>
                    </div>
                    <div className="rounded-lg border bg-card p-3 text-center">
                      <p className="text-xl font-bold text-red-600">{inventoryHealth.totals.outOfStock}</p>
                      <p className="text-xs text-muted-foreground">Out of Stock</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Methods */}
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
                            "Sales",
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
            </div>
          </div>

          {/* Daily Sales Trend */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Sales Trend ({periodLabel})</h3>
              <p className="text-xs text-muted-foreground">Current period vs prior period of the same length — across all retail branches</p>
            </div>
            {dailyTrend === undefined ? (
              <Skeleton className="h-56" />
            ) : !dailyTrend || dailyTrend.trend.length === 0 ? (
              <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                No trend data for this period
              </div>
            ) : (
              <div className="rounded-lg border bg-card p-4">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={dailyTrend.trend} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `₱${(v / 100).toLocaleString("en-PH", { notation: "compact", maximumFractionDigits: 1 })}`}
                      width={56}
                    />
                    <Tooltip
                      formatter={(value: number | undefined, name: string | undefined) => [
                        value !== undefined ? formatCentavos(value) : "—",
                        name === "currentCentavos" ? "This Period" : "Prior Period",
                      ]}
                    />
                    <Legend
                      formatter={(value) => value === "currentCentavos" ? "This Period" : "Prior Period"}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="currentCentavos"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="priorCentavos"
                      stroke="hsl(var(--muted-foreground))"
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Sales by Category Donut */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Sales by Category ({periodLabel})</h3>
            {salesByCategory === undefined ? (
              <Skeleton className="h-64" />
            ) : !salesByCategory || salesByCategory.length === 0 ? (
              <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                No category data for this period
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-lg border bg-card p-4">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={salesByCategory.map((c) => ({
                          name: c.name,
                          value: c.revenueCentavos,
                          units: c.unitsSold,
                        }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={110}
                        dataKey="value"
                        nameKey="name"
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onClick={(entry: any) => {
                          const cat = salesByCategory.find((c) => c.name === entry.name);
                          if (cat) setSelectedCategoryId(selectedCategoryId === cat.categoryId ? null : cat.categoryId);
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        {salesByCategory.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(value: any) => [formatCentavos(value), "Sales"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-3 justify-center mt-2">
                    {salesByCategory.map((c, i) => (
                      <button
                        key={c.categoryId}
                        onClick={() => setSelectedCategoryId(selectedCategoryId === c.categoryId ? null : c.categoryId)}
                        className={cn(
                          "flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors",
                          selectedCategoryId === c.categoryId ? "bg-muted font-medium" : "hover:bg-muted/50"
                        )}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                        {c.name} ({c.percentage}%)
                      </button>
                    ))}
                  </div>
                </div>

                {/* Category detail / subcategory drill-down */}
                <div className="space-y-3">
                  {selectedCategoryId ? (
                    <>
                      <h4 className="text-sm font-semibold">
                        {salesByCategory.find((c) => c.categoryId === selectedCategoryId)?.name} — Styles
                      </h4>
                      {salesBySubcategory === undefined ? (
                        <Skeleton className="h-48" />
                      ) : !salesBySubcategory || salesBySubcategory.length === 0 ? (
                        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                          No style data for this category
                        </div>
                      ) : (
                        <div className="rounded-lg border overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-muted/50 border-b">
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Style</th>
                                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Units</th>
                                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Sales</th>
                                <th className="text-right px-3 py-2 font-medium text-muted-foreground">%</th>
                              </tr>
                            </thead>
                            <tbody>
                              {salesBySubcategory.map((s, i) => (
                                <tr key={i} className="border-b last:border-0">
                                  <td className="px-3 py-2 font-medium">{s.name}</td>
                                  <td className="px-3 py-2 text-right">{s.unitsSold}</td>
                                  <td className="px-3 py-2 text-right">{formatCentavos(s.revenueCentavos)}</td>
                                  <td className="px-3 py-2 text-right text-muted-foreground">{s.percentage}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/50 border-b">
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Category</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Units</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Sales</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {salesByCategory.map((c) => (
                            <tr
                              key={c.categoryId}
                              className="border-b last:border-0 cursor-pointer hover:bg-muted/30"
                              onClick={() => setSelectedCategoryId(c.categoryId)}
                            >
                              <td className="px-3 py-2 font-medium">{c.name}</td>
                              <td className="px-3 py-2 text-right">{c.unitsSold}</td>
                              <td className="px-3 py-2 text-right">{formatCentavos(c.revenueCentavos)}</td>
                              <td className="px-3 py-2 text-right text-muted-foreground">{c.percentage}%</td>
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
        </div>
      )}

      {/* ═══ COMPARISONS TAB ═══════════════════════════════════════════════ */}
      {activeTab === "comparisons" && (
        <div className="space-y-6">
          {/* View toggles */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex gap-1 rounded-lg border p-1">
              {([
                { value: "brand" as const, label: "By Brand" },
                { value: "category" as const, label: "By Category" },
                { value: "product" as const, label: "By Product" },
              ]).map((v) => (
                <button
                  key={v.value}
                  onClick={() => setComparisonView(v.value)}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-md font-medium transition-colors",
                    comparisonView === v.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 rounded-lg border p-1">
              {([
                { value: "units" as const, label: "Units Sold" },
                { value: "revenue" as const, label: "Sales" },
              ]).map((m) => (
                <button
                  key={m.value}
                  onClick={() => setComparisonMetric(m.value)}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-md font-medium transition-colors",
                    comparisonMetric === m.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Chart + Table */}
          {(() => {
            const data =
              comparisonView === "brand"
                ? topBrands
                : comparisonView === "category"
                  ? topCategories
                  : topProductsComparison;

            if (data === undefined) return <Skeleton className="h-80" />;
            if (!data || data.length === 0)
              return (
                <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
                  No data for this period
                </div>
              );

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const chartData = data.map((item: any) => ({
              name: item.name.length > 18 ? item.name.slice(0, 18) + "…" : item.name,
              fullName: item.name,
              value: comparisonMetric === "units" ? item.unitsSold : item.revenueCentavos,
              units: item.unitsSold,
              revenue: item.revenueCentavos,
              percent: comparisonMetric === "units" ? item.percentUnits : item.percentRevenue,
            }));

            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Bar chart */}
                <div className="rounded-lg border bg-card p-4">
                  <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 40)}>
                    <BarChart
                      data={chartData}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        width={100}
                      />
                      <Tooltip
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(value: any) => [
                          comparisonMetric === "revenue" ? formatCentavos(value) : `${value} units`,
                          comparisonMetric === "revenue" ? "Sales" : "Units Sold",
                        ]}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        labelFormatter={(label: any) => {
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const item = chartData.find((d: any) => d.name === label);
                          return item?.fullName ?? label;
                        }}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {chartData.map((_: any, i: number) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Table */}
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">#</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                          {comparisonView === "brand" ? "Brand" : comparisonView === "category" ? "Category" : "Product"}
                        </th>
                        {comparisonView === "product" && (
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Brand</th>
                        )}
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Units</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Sales</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {data.map((item: any, i: number) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2 font-medium">
                            {item.name}
                            {comparisonView === "product" && item.categoryName && (
                              <p className="text-muted-foreground">{item.categoryName}</p>
                            )}
                          </td>
                          {comparisonView === "product" && (
                            <td className="px-3 py-2 text-muted-foreground">{item.brandName}</td>
                          )}
                          <td className="px-3 py-2 text-right">{item.unitsSold}</td>
                          <td className="px-3 py-2 text-right">{formatCentavos(item.revenueCentavos)}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${comparisonMetric === "units" ? item.percentUnits : item.percentRevenue}%`,
                                    backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                                  }}
                                />
                              </div>
                              <span className="text-muted-foreground w-8 text-right">
                                {comparisonMetric === "units" ? item.percentUnits : item.percentRevenue}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══ DIAGNOSTIC TAB ═══════════════════════════════════════════════ */}
      {activeTab === "diagnostic" && (
        <div className="space-y-6">
          {/* Product Movement Index */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Product Movement Index (All Branches)</h3>
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
              <h3 className="text-sm font-semibold">Demand Gap (All Branches)</h3>
              <p className="text-xs text-muted-foreground">Items customers ask for vs total stock across all branches</p>
              {demandGap === undefined ? (
                <Skeleton className="h-40" />
              ) : !demandGap || demandGap.length === 0 ? (
                <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                  No demand gaps detected for this period
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
                            {item.design && (
                              <p className="text-muted-foreground">
                                {item.design} {item.size && `(${item.size})`}
                              </p>
                            )}
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
              <p className="text-xs text-muted-foreground">All transfer fulfillment metrics (last 30 days)</p>
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

          {/* Restock vs Lay Low */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Restock vs Lay Low</h3>
              <p className="text-xs text-muted-foreground">
                Products classified by velocity and stock levels — what to restock and what to reduce
              </p>
            </div>

            {restockVsLayLow === undefined ? (
              <Skeleton className="h-60" />
            ) : !restockVsLayLow ? (
              <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                No data available
              </div>
            ) : (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg border bg-card p-4 text-center">
                    <p className="text-2xl font-bold text-green-600">{restockVsLayLow.summary.restockCount}</p>
                    <p className="text-xs text-muted-foreground">Need Restock</p>
                  </div>
                  <div className="rounded-lg border bg-card p-4 text-center">
                    <p className="text-2xl font-bold text-red-600">{restockVsLayLow.summary.layLowCount}</p>
                    <p className="text-xs text-muted-foreground">Lay Low</p>
                  </div>
                  <div className="rounded-lg border bg-card p-4 text-center">
                    <p className="text-2xl font-bold text-gray-600">{restockVsLayLow.summary.holdCount}</p>
                    <p className="text-xs text-muted-foreground">Hold</p>
                  </div>
                </div>

                {/* Table */}
                {restockVsLayLow.items.length === 0 ? (
                  <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                    No items to display
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/50 border-b">
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Product</th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Brand</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Stock</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Sold</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Velocity</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Days Left</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Sell-Through</th>
                            <th className="text-center px-3 py-2 font-medium text-muted-foreground">Verdict</th>
                          </tr>
                        </thead>
                        <tbody>
                          {restockVsLayLow.items.map((item, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="px-3 py-2">
                                <p className="font-medium">{item.name}</p>
                                <p className="text-muted-foreground">{item.size} / {item.color}</p>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{item.brandName}</td>
                              <td className="px-3 py-2 text-right">{item.currentStock}</td>
                              <td className="px-3 py-2 text-right">{item.unitsSold}</td>
                              <td className="px-3 py-2 text-right">{item.velocity}/day</td>
                              <td className="px-3 py-2 text-right">
                                <span className={item.daysOfStock <= 7 ? "text-red-600 font-medium" : item.daysOfStock <= 14 ? "text-amber-600" : ""}>
                                  {item.daysOfStock >= 999 ? "∞" : `${item.daysOfStock}d`}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">{item.sellThrough}%</td>
                              <td className="px-3 py-2 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${VERDICT_COLORS[item.verdict]}`}>
                                  {VERDICT_LABELS[item.verdict]}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ PREDICTIVE TAB ═══════════════════════════════════════════════ */}
      {activeTab === "predictive" && (
        <div className="space-y-6">
          {/* Sales Forecast (Monthly + Yearly) */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Sales Forecast</h3>
            <p className="text-xs text-muted-foreground">Monthly and yearly projections based on daily average sales across all retail branches</p>
            {salesForecast === undefined ? (
              <Skeleton className="h-40" />
            ) : !salesForecast ? (
              <p className="text-sm text-muted-foreground">No data.</p>
            ) : (
              <div className="space-y-3">
                {/* Monthly Forecast */}
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Monthly Forecast</p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">This Month ({salesForecast.monthly.daysElapsed}/{salesForecast.monthly.totalDays}d)</p>
                      <p className="text-lg font-bold">{formatCentavos(salesForecast.monthly.currentRevenueCentavos)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Daily Average</p>
                      <p className="text-lg font-bold">{formatCentavos(salesForecast.monthly.dailyAverageCentavos)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Projected Month</p>
                      <p className="text-lg font-bold text-primary">{formatCentavos(salesForecast.monthly.projectedCentavos)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Last Month Actual</p>
                      <p className="text-lg font-bold">{formatCentavos(salesForecast.monthly.lastPeriodCentavos)}</p>
                      {salesForecast.monthly.projectedCentavos > 0 && salesForecast.monthly.lastPeriodCentavos > 0 && (
                        <TrendArrow
                          current={salesForecast.monthly.projectedCentavos}
                          previous={salesForecast.monthly.lastPeriodCentavos}
                          higherIsBetter
                        />
                      )}
                    </div>
                  </div>
                </div>
                {/* Yearly Forecast */}
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Yearly Forecast</p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">This Year ({salesForecast.yearly.daysElapsed}/{salesForecast.yearly.totalDays}d)</p>
                      <p className="text-lg font-bold">{formatCentavos(salesForecast.yearly.currentRevenueCentavos)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Daily Average</p>
                      <p className="text-lg font-bold">{formatCentavos(salesForecast.yearly.dailyAverageCentavos)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Projected Year</p>
                      <p className="text-lg font-bold text-primary">{formatCentavos(salesForecast.yearly.projectedCentavos)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Last Year Actual</p>
                      <p className="text-lg font-bold">{formatCentavos(salesForecast.yearly.lastPeriodCentavos)}</p>
                      {salesForecast.yearly.projectedCentavos > 0 && salesForecast.yearly.lastPeriodCentavos > 0 && (
                        <TrendArrow
                          current={salesForecast.yearly.projectedCentavos}
                          previous={salesForecast.yearly.lastPeriodCentavos}
                          higherIsBetter
                        />
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Across {salesForecast.branchCount} retail branches
                </p>
              </div>
            )}
          </div>

          {/* Sales Projection */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Sales Projection (All Retail Branches)</h3>
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
                <p className="text-xs text-muted-foreground mt-3">
                  Across {projectedRevenue.branchCount} retail branches
                </p>
              </div>
            )}
          </div>

          {/* Restock Suggestions */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Restock Suggestions (All Branches)</h3>
            {restockSuggestions === undefined ? (
              <Skeleton className="h-48" />
            ) : !restockSuggestions || restockSuggestions.length === 0 ? (
              <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                No active restock suggestions
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Product</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Branch</th>
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
                          <td className="px-3 py-2 text-muted-foreground">{s.branchName}</td>
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
            <h3 className="text-sm font-semibold">Demand Forecast (All Branches)</h3>
            <p className="text-xs text-muted-foreground">Trending items from customer demand logs across all branches</p>
            {demandForecast === undefined ? (
              <Skeleton className="h-40" />
            ) : !demandForecast || demandForecast.length === 0 ? (
              <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                No demand signals for this period
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

      {/* ═══ PRESCRIPTIVE TAB ═════════════════════════════════════════════ */}
      {activeTab === "prescriptive" && (
        <div className="space-y-8">
          {/* ── SMART ALERTS ─────────────────────────────────────────────── */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Smart Alerts
            </h3>

            {smartAlerts === undefined ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
                <Skeleton className="h-32" />
              </div>
            ) : !smartAlerts || smartAlerts.length === 0 ? (
              <div className="rounded-lg border p-8 text-center">
                <p className="text-sm text-muted-foreground">No alerts detected for this period</p>
                <p className="text-xs text-muted-foreground mt-1">All systems operating normally</p>
              </div>
            ) : (
              <>
                {/* Alert summary cards */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg border bg-card p-4 space-y-1">
                    <p className="text-sm text-muted-foreground">Critical</p>
                    <p className="text-2xl font-bold text-red-600">
                      {smartAlerts.filter((a) => a.severity === "critical").length}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-card p-4 space-y-1">
                    <p className="text-sm text-muted-foreground">Warnings</p>
                    <p className="text-2xl font-bold text-amber-600">
                      {smartAlerts.filter((a) => a.severity === "warning").length}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-card p-4 space-y-1">
                    <p className="text-sm text-muted-foreground">Info</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {smartAlerts.filter((a) => a.severity === "info").length}
                    </p>
                  </div>
                </div>

                {/* Alert list */}
                <div className="space-y-2">
                  {smartAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={cn(
                        "rounded-lg border p-4 flex items-start gap-3",
                        alert.severity === "critical" && "border-red-200 bg-red-50/50",
                        alert.severity === "warning" && "border-amber-200 bg-amber-50/50",
                        alert.severity === "info" && "border-blue-200 bg-blue-50/50"
                      )}
                    >
                      <span className="text-lg shrink-0" role="img">
                        {CATEGORY_ICONS[alert.category] ?? ""}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <SeverityBadge severity={alert.severity} />
                          <span className="text-sm font-semibold">{alert.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{alert.description}</p>
                        {alert.affectedBranches.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {alert.affectedBranches.map((b) => (
                              <span
                                key={b}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground"
                              >
                                {b}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── CROSS-BRANCH INTELLIGENCE ─────────────────────────────── */}
          <div className="space-y-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Cross-Branch Intelligence
            </h3>

            {/* Branch Ranking + Fulfillment Speed side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Branch Performance Ranking */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Branch Performance Ranking ({periodLabel})</h4>
                {branchRanking === undefined ? (
                  <Skeleton className="h-48" />
                ) : !branchRanking || branchRanking.length === 0 ? (
                  <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                    No branch data available
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">#</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Branch</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Sales</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Txns</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Avg Ticket</th>
                          <th className="text-center px-3 py-2 font-medium text-muted-foreground">Trend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {branchRanking.map((b) => (
                          <tr key={b.branchId} className="border-b last:border-0">
                            <td className="px-3 py-2 text-muted-foreground font-medium">{b.rank}</td>
                            <td className="px-3 py-2 font-medium">{b.branchName}</td>
                            <td className="px-3 py-2 text-right">{formatCentavos(b.revenueCentavos)}</td>
                            <td className="px-3 py-2 text-right">{b.transactionCount}</td>
                            <td className="px-3 py-2 text-right">{formatCentavos(b.avgTicketCentavos)}</td>
                            <td className="px-3 py-2 text-center">
                              <TrendArrow
                                current={b.revenueCentavos}
                                previous={b.previousRevenueCentavos}
                                higherIsBetter
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Fulfillment Speed Comparison */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Fulfillment Speed by Branch (30 days)</h4>
                {fulfillmentComparison === undefined ? (
                  <Skeleton className="h-48" />
                ) : !fulfillmentComparison || fulfillmentComparison.branches.length === 0 ? (
                  <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                    No transfer data available
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Overall avg: <span className="font-medium text-foreground">{fulfillmentComparison.overallAvgHours}h</span>
                    </p>
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/50 border-b">
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Branch</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Avg Hours</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Completed</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Pending</th>
                            <th className="text-center px-3 py-2 font-medium text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fulfillmentComparison.branches.map((b) => (
                            <tr key={b.branchId} className="border-b last:border-0">
                              <td className="px-3 py-2 font-medium">{b.branchName}</td>
                              <td className="px-3 py-2 text-right">
                                <span className={b.isOutlier ? "text-red-600 font-medium" : ""}>
                                  {b.avgFulfillmentHours > 0 ? `${b.avgFulfillmentHours}h` : "N/A"}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right text-green-600">{b.completedCount}</td>
                              <td className="px-3 py-2 text-right text-amber-600">{b.pendingCount}</td>
                              <td className="px-3 py-2 text-center">
                                {b.isOutlier ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                                    SLOW
                                  </span>
                                ) : b.completedCount > 0 ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                    OK
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Stock Distribution Matrix */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Stock Distribution — Top Selling Products ({periodLabel})</h4>
              <p className="text-xs text-muted-foreground">
                Current stock levels across branches for your best-selling products. Red cells indicate out-of-stock imbalances.
              </p>
              {stockMatrix === undefined ? (
                <Skeleton className="h-48" />
              ) : !stockMatrix || stockMatrix.products.length === 0 ? (
                <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                  No sales data for this period
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-muted/50 min-w-[180px]">
                            Product
                          </th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Sold</th>
                          {stockMatrix.branches.map((b) => (
                            <th key={b.branchId} className="text-center px-3 py-2 font-medium text-muted-foreground min-w-[80px]">
                              {b.branchName}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {stockMatrix.products.map((p) => (
                          <tr key={p.variantId} className="border-b last:border-0">
                            <td className="px-3 py-2 sticky left-0 bg-white">
                              <p className="font-medium">{p.styleName}</p>
                              <p className="text-muted-foreground">{p.size} / {p.color}</p>
                            </td>
                            <td className="px-3 py-2 text-right font-medium">{p.totalSold}</td>
                            {p.stockByBranch.map((sb) => (
                              <td
                                key={sb.branchId}
                                className={cn(
                                  "px-3 py-2 text-center font-medium",
                                  sb.isImbalanced && "bg-red-100 text-red-700",
                                  !sb.isImbalanced && sb.quantity <= 0 && "text-muted-foreground",
                                  !sb.isImbalanced && sb.quantity > 0 && sb.quantity <= 5 && "text-amber-600",
                                  !sb.isImbalanced && sb.quantity > 5 && "text-green-600"
                                )}
                              >
                                {sb.quantity}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Transfer Opportunities */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Transfer Opportunities</h4>
              <p className="text-xs text-muted-foreground">
                Branches with excess stock that could fulfill restock needs at other branches
              </p>
              {transferOpps === undefined ? (
                <Skeleton className="h-40" />
              ) : !transferOpps || transferOpps.length === 0 ? (
                <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                  No transfer opportunities detected
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Product</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">From</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">To</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Suggested Qty</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Rationale</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transferOpps.map((opp, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="px-3 py-2">
                              <p className="font-medium">{opp.styleName}</p>
                              <p className="text-muted-foreground">{opp.size} / {opp.color}</p>
                            </td>
                            <td className="px-3 py-2">
                              <p className="font-medium">{opp.fromBranch.branchName}</p>
                              <p className="text-muted-foreground">{opp.fromBranch.excessQuantity} in stock</p>
                            </td>
                            <td className="px-3 py-2">
                              <p className="font-medium">{opp.toBranch.branchName}</p>
                              <p className="text-red-600">{Math.round(opp.toBranch.daysUntilStockout)}d left</p>
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-primary">{opp.suggestedTransferQty}</td>
                            <td className="px-3 py-2 text-muted-foreground max-w-[200px]">{opp.rationale}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

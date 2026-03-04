"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import {
  FileText,
  TrendingUp,
  ShoppingCart,
  Receipt,
  Trophy,
  Users,
  Package,
  AlertTriangle,
  BarChart2,
  Lightbulb,
} from "lucide-react";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";

// ─── Date helpers (vanilla JS — no date-fns) ──────────────────────────────────

function toYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function toInputDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}
function fromInputDate(yyyy_mm_dd: string): string {
  return yyyy_mm_dd.replace(/-/g, "");
}

function formatCentavos(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ─── Preset helpers ───────────────────────────────────────────────────────────

function getPresetDates(
  preset: "daily" | "yesterday" | "weekly" | "monthly" | "yearly"
): { start: string; end: string } {
  const now = new Date();
  const today = toYYYYMMDD(now);

  if (preset === "daily") return { start: today, end: today };

  if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    const yd = toYYYYMMDD(y);
    return { start: yd, end: yd };
  }

  if (preset === "weekly") {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return { start: toYYYYMMDD(weekStart), end: today };
  }

  if (preset === "monthly") {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: toYYYYMMDD(monthStart), end: today };
  }

  // yearly — Jan 1 to today
  const yearStart = new Date(now.getFullYear(), 0, 1);
  return { start: toYYYYMMDD(yearStart), end: today };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Preset = "daily" | "yesterday" | "weekly" | "monthly" | "yearly" | "custom";
type ReportTab = "branches" | "brands" | "invoices" | "insights";

// ─── InsightsPanel — only mounts when Insights tab is active ─────────────────

function InsightsPanel({
  dateStart,
  dateEnd,
  branchId,
  salesData,
  brandData,
}: {
  dateStart: string;
  dateEnd: string;
  branchId: string | undefined;
  salesData: Array<{ branchId: string; branchName: string; revenueCentavos: number; txnCount: number; avgTxnValueCentavos: number }> | undefined;
  brandData: Array<{ brandId: string; brandName: string; revenueCentavos: number; txnCount: number }> | undefined;
}) {
  const inventoryHealth = useQuery(api.dashboards.hqAnalytics.getHQInventoryHealth, {
    ...(branchId ? { branchId: branchId as Id<"branches"> } : {}),
  });

  const slowMovers = useQuery(api.dashboards.hqAnalytics.getHQSlowMovers, {
    dateStart,
    dateEnd,
    ...(branchId ? { branchId: branchId as Id<"branches"> } : {}),
  });

  // ── 1. Sales Intelligence (derived from salesData) ─────────────────────────
  const totalRevenue = salesData?.reduce((s, r) => s + r.revenueCentavos, 0) ?? 0;
  const totalTxns = salesData?.reduce((s, r) => s + r.txnCount, 0) ?? 0;
  const topBranch = salesData?.[0];
  const topBranchShare =
    topBranch && totalRevenue > 0
      ? Math.round((topBranch.revenueCentavos / totalRevenue) * 100)
      : 0;
  const avgTxnAllBranches = totalTxns > 0 ? Math.round(totalRevenue / totalTxns) : 0;

  // Branches below the average transaction value
  const belowAvgBranches = (salesData ?? []).filter(
    (b) => b.txnCount > 0 && b.avgTxnValueCentavos < avgTxnAllBranches * 0.8
  );

  // Top brand
  const topBrand = brandData?.[0];
  const totalBrandRevenue = brandData?.reduce((s, b) => s + b.revenueCentavos, 0) ?? 0;
  const topBrandShare =
    topBrand && totalBrandRevenue > 0
      ? Math.round((topBrand.revenueCentavos / totalBrandRevenue) * 100)
      : 0;

  // ── 2. Staffing Recommendations (derived from salesData.txnCount) ──────────
  function staffingClassify(txnCount: number): {
    level: "High" | "Medium" | "Low";
    color: string;
    suggestion: string;
  } {
    if (txnCount >= 50)
      return {
        level: "High",
        color: "text-red-600 bg-red-50",
        suggestion:
          "Consider deploying an additional cashier or extending shift hours to handle peak volume.",
      };
    if (txnCount >= 20)
      return {
        level: "Medium",
        color: "text-yellow-600 bg-yellow-50",
        suggestion:
          "Current staffing appears adequate. Monitor for weekend or holiday surges.",
      };
    return {
      level: "Low",
      color: "text-green-600 bg-green-50",
      suggestion:
        "Low transaction volume. Consider adjusting operating hours, running a local promotion, or reviewing store placement.",
    };
  }

  return (
    <div className="space-y-6">

      {/* ── Section 1: Sales Intelligence ──────────────────────────────────── */}
      <div className="rounded-lg border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Sales Intelligence</h2>
        </div>

        {salesData === undefined ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : salesData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sales data for this period.</p>
        ) : (
          <div className="space-y-3 text-sm">
            {/* Revenue concentration */}
            <div className="flex items-start gap-3 rounded-md bg-muted/40 p-3">
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="font-medium">Revenue Concentration</p>
                <p className="text-muted-foreground mt-0.5">
                  <span className="font-semibold text-foreground">{topBranch?.branchName}</span> accounts for{" "}
                  <span className="font-semibold text-foreground">{topBranchShare}%</span> of total revenue
                  ({formatCentavos(topBranch?.revenueCentavos ?? 0)}).
                  {topBranchShare > 60 && (
                    <span className="ml-1 text-amber-600">
                      High concentration — consider stronger promotion at lower-performing branches.
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Brand performance */}
            {topBrand && (
              <div className="flex items-start gap-3 rounded-md bg-muted/40 p-3">
                <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="font-medium">Top Brand</p>
                  <p className="text-muted-foreground mt-0.5">
                    <span className="font-semibold text-foreground">{topBrand.brandName}</span> leads with{" "}
                    {formatCentavos(topBrand.revenueCentavos)} ({topBrandShare}% of brand revenue).
                    {topBrandShare > 50 && (
                      <span className="ml-1 text-amber-600">
                        Consider expanding stock of other brands to diversify revenue.
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Below-average branches */}
            {belowAvgBranches.length > 0 && (
              <div className="flex items-start gap-3 rounded-md bg-amber-50 border border-amber-200 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800">Below-Average Transaction Value</p>
                  <p className="text-amber-700 mt-0.5">
                    {belowAvgBranches.map((b) => b.branchName).join(", ")}{" "}
                    {belowAvgBranches.length === 1 ? "has" : "have"} an avg transaction value more than 20%
                    below the network average ({formatCentavos(avgTxnAllBranches)}).
                    Review product mix or upselling training at {belowAvgBranches.length === 1 ? "this branch" : "these branches"}.
                  </p>
                </div>
              </div>
            )}

            {/* All good */}
            {belowAvgBranches.length === 0 && topBranchShare <= 60 && (
              <div className="flex items-start gap-3 rounded-md bg-green-50 border border-green-200 p-3">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <p className="text-green-800 text-sm">
                  Revenue is well-distributed and transaction values are consistent across branches. No immediate action required.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section 2: Staffing Recommendations ────────────────────────────── */}
      <div className="rounded-lg border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Staffing Recommendations</h2>
          <span className="text-xs text-muted-foreground ml-1">Based on transaction volume this period</span>
        </div>

        {salesData === undefined ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : salesData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No branch data available.</p>
        ) : (
          <div className="space-y-2">
            {salesData.map((branch) => {
              const cls = staffingClassify(branch.txnCount);
              return (
                <div key={branch.branchId} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{branch.branchName}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls.color}`}>
                      {cls.level} Volume · {branch.txnCount.toLocaleString()} txns
                    </span>
                  </div>
                  <p className="text-muted-foreground">{cls.suggestion}</p>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground pt-1">
              Thresholds: High ≥ 50 transactions, Medium 20–49, Low &lt; 20. Adjust based on your typical staffing ratio.
            </p>
          </div>
        )}
      </div>

      {/* ── Section 3: Inventory Health ────────────────────────────────────── */}
      <div className="rounded-lg border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Inventory Health</h2>
          <span className="text-xs text-muted-foreground ml-1">Current stock snapshot (not date-filtered)</span>
        </div>

        {inventoryHealth === undefined ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : (
          <>
            {/* Totals */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Total SKUs", value: inventoryHealth.totals.totalSkus, color: "" },
                { label: "Healthy", value: inventoryHealth.totals.healthy, color: "text-green-600" },
                { label: "Low Stock", value: inventoryHealth.totals.lowStock, color: "text-amber-600" },
                { label: "Out of Stock", value: inventoryHealth.totals.outOfStock, color: "text-red-600" },
              ].map((card) => (
                <div key={card.label} className="rounded-md border bg-muted/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className={`text-xl font-bold ${card.color}`}>{card.value.toLocaleString()}</p>
                </div>
              ))}
            </div>

            {/* Per-branch table */}
            {inventoryHealth.byBranch.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Branch</th>
                      <th className="pb-2 text-right font-medium">Total SKUs</th>
                      <th className="pb-2 text-right font-medium text-green-600">Healthy</th>
                      <th className="pb-2 text-right font-medium text-amber-600">Low Stock</th>
                      <th className="pb-2 text-right font-medium text-red-600">Out of Stock</th>
                      <th className="pb-2 text-right font-medium">Health %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryHealth.byBranch.map((row) => (
                      <tr key={row.branchId} className="border-b last:border-0">
                        <td className="py-2 font-medium">{row.branchName}</td>
                        <td className="py-2 text-right tabular-nums">{row.totalSkus}</td>
                        <td className="py-2 text-right tabular-nums text-green-600">{row.healthy}</td>
                        <td className="py-2 text-right tabular-nums text-amber-600">{row.lowStock}</td>
                        <td className="py-2 text-right tabular-nums text-red-600">{row.outOfStock}</td>
                        <td className="py-2 text-right tabular-nums">
                          <span
                            className={
                              row.healthScore >= 80
                                ? "text-green-600 font-semibold"
                                : row.healthScore >= 60
                                ? "text-amber-600 font-semibold"
                                : "text-red-600 font-semibold"
                            }
                          >
                            {row.healthScore}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {inventoryHealth.totals.lowStock + inventoryHealth.totals.outOfStock > 0 && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-amber-800">
                  <span className="font-semibold">{inventoryHealth.totals.outOfStock}</span> SKUs are out of stock
                  and <span className="font-semibold">{inventoryHealth.totals.lowStock}</span> are running low.
                  {" "}Request a warehouse transfer or review your reorder points to prevent stockouts.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Section 4: Slow Movers & Aged Stock ────────────────────────────── */}
      <div className="rounded-lg border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h2 className="font-semibold">Slow Movers & Aged Stock</h2>
          <span className="text-xs text-muted-foreground ml-1">
            Items with ≥5 units in stock but zero sales in the selected period
          </span>
        </div>

        {slowMovers === undefined ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : slowMovers.length === 0 ? (
          <div className="flex items-start gap-2 rounded-md bg-green-50 border border-green-200 p-3 text-sm">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            <p className="text-green-800">
              No significant slow movers detected. All stocked items (≥5 units) had at least one sale in this period.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Product</th>
                    <th className="pb-2 font-medium">Size / Color</th>
                    <th className="pb-2 font-medium">Branch</th>
                    <th className="pb-2 text-right font-medium">Stock</th>
                    <th className="pb-2 font-medium">Price</th>
                    <th className="pb-2 font-medium">Suggested Action</th>
                  </tr>
                </thead>
                <tbody>
                  {slowMovers.map((item, i) => (
                    <tr key={`${item.variantId}-${item.branchId}-${i}`} className="border-b last:border-0 align-top">
                      <td className="py-2 font-medium">{item.styleName}</td>
                      <td className="py-2 text-muted-foreground">
                        {item.size} · {item.color}
                      </td>
                      <td className="py-2">{item.branchName}</td>
                      <td className="py-2 text-right tabular-nums font-semibold text-amber-600">
                        {item.quantity}
                      </td>
                      <td className="py-2 tabular-nums text-muted-foreground">
                        {formatCentavos(item.priceCentavos)}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground max-w-xs">
                        {item.suggestion}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: Items with the most idle stock are listed first. Consider markdowns, bundle deals, or
              cross-branch transfers to move aged inventory before it becomes a write-off.
            </p>
          </>
        )}
      </div>

    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function HqReportsPage() {
  const [dateStart, setDateStart] = useState(() => toYYYYMMDD(new Date()));
  const [dateEnd, setDateEnd] = useState(() => toYYYYMMDD(new Date()));
  const [activePreset, setActivePreset] = useState<Preset>("daily");
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<ReportTab>("branches");
  const [brandFilter, setBrandFilter] = useState("");

  function applyPreset(preset: "daily" | "yesterday" | "weekly" | "monthly" | "yearly") {
    const { start, end } = getPresetDates(preset);
    setDateStart(start);
    setDateEnd(end);
    setActivePreset(preset);
  }

  const allBranches = useQuery(api.dashboards.birReports.listActiveBranches);

  const salesData = useQuery(api.dashboards.birReports.getSalesReport, {
    dateStart,
    dateEnd,
    ...(branchId ? { branchId: branchId as Id<"branches"> } : {}),
  });

  const brandData = useQuery(api.dashboards.birReports.getBrandBreakdown, {
    dateStart,
    dateEnd,
    ...(branchId ? { branchId: branchId as Id<"branches"> } : {}),
  });

  const invoiceData = useQuery(api.dashboards.birReports.getWarehouseInvoiceSummary, {
    dateStart,
    dateEnd,
    ...(branchId ? { branchId: branchId as Id<"branches"> } : {}),
  });

  const filteredBrandData = brandFilter
    ? brandData?.filter((b) =>
        b.brandName.toLowerCase().includes(brandFilter.toLowerCase())
      )
    : brandData;

  // ── Summary card computations (derived from salesData, no extra query) ────
  const totalRevenueCentavos = salesData?.reduce((s, r) => s + r.revenueCentavos, 0) ?? 0;
  const totalTxnCount = salesData?.reduce((s, r) => s + r.txnCount, 0) ?? 0;
  const avgTxnValueCentavos = totalTxnCount > 0 ? Math.round(totalRevenueCentavos / totalTxnCount) : 0;
  const topBranch = salesData?.[0];

  const salesPagination = usePagination(salesData);
  const brandPagination = usePagination(filteredBrandData);
  const invoicePagination = usePagination(invoiceData?.byBranch);

  const presets: { key: "daily" | "yesterday" | "weekly" | "monthly" | "yearly"; label: string }[] = [
    { key: "daily", label: "Daily" },
    { key: "yesterday", label: "Yesterday" },
    { key: "weekly", label: "Weekly" },
    { key: "monthly", label: "Monthly" },
    { key: "yearly", label: "Yearly" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales Reports</h1>
          <p className="text-sm text-muted-foreground">
            Revenue and transaction summaries by branch and brand
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/reports/movers"
            className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <TrendingUp className="h-4 w-4" />
            Product Movers
          </Link>
          <Link
            href="/admin/reports/aging"
            className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <Package className="h-4 w-4" />
            Inventory Aging
          </Link>
          <Link
            href="/admin/reports/bir"
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <FileText className="h-4 w-4" />
            BIR VAT Report
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg border p-4 space-y-4">
        <h2 className="text-sm font-semibold">Filters</h2>
        {/* Date presets */}
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activePreset === p.key
                  ? "bg-primary text-primary-foreground"
                  : "border bg-background text-foreground hover:bg-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Date range inputs + branch filter */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">From</label>
            <input
              type="date"
              value={toInputDate(dateStart)}
              onChange={(e) => {
                setDateStart(fromInputDate(e.target.value));
                setActivePreset("custom");
              }}
              className="rounded-md border px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">To</label>
            <input
              type="date"
              value={toInputDate(dateEnd)}
              onChange={(e) => {
                setDateEnd(fromInputDate(e.target.value));
                setActivePreset("custom");
              }}
              className="rounded-md border px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Branch</label>
            <select
              value={branchId ?? ""}
              onChange={(e) => setBranchId(e.target.value || undefined)}
              className="rounded-md border px-3 py-1.5 text-sm"
            >
              <option value="">All Branches</option>
              {(allBranches ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Total Sales Revenue */}
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <p className="text-sm font-medium">Sales Revenue</p>
            <TrendingUp className="h-4 w-4" />
          </div>
          {salesData === undefined ? (
            <div className="h-8 w-32 animate-pulse rounded bg-muted" />
          ) : (
            <p className="text-2xl font-bold tabular-nums">{formatCentavos(totalRevenueCentavos)}</p>
          )}
          <p className="text-xs text-muted-foreground">Gross revenue for selected period</p>
        </div>

        {/* Total Transactions */}
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <p className="text-sm font-medium">Total Transactions</p>
            <ShoppingCart className="h-4 w-4" />
          </div>
          {salesData === undefined ? (
            <div className="h-8 w-20 animate-pulse rounded bg-muted" />
          ) : (
            <p className="text-2xl font-bold tabular-nums">{totalTxnCount.toLocaleString()}</p>
          )}
          <p className="text-xs text-muted-foreground">Sales processed across all branches</p>
        </div>

        {/* Avg Transaction Value */}
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <p className="text-sm font-medium">Avg Transaction Value</p>
            <Receipt className="h-4 w-4" />
          </div>
          {salesData === undefined ? (
            <div className="h-8 w-24 animate-pulse rounded bg-muted" />
          ) : (
            <p className="text-2xl font-bold tabular-nums">
              {totalTxnCount > 0 ? formatCentavos(avgTxnValueCentavos) : "—"}
            </p>
          )}
          <p className="text-xs text-muted-foreground">Revenue ÷ transactions</p>
        </div>

        {/* Best Performing Branch */}
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <p className="text-sm font-medium">Best Branch</p>
            <Trophy className="h-4 w-4" />
          </div>
          {salesData === undefined ? (
            <div className="h-8 w-28 animate-pulse rounded bg-muted" />
          ) : topBranch ? (
            <>
              <p className="text-xl font-bold leading-tight truncate">{topBranch.branchName}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatCentavos(topBranch.revenueCentavos)} &middot; {topBranch.txnCount.toLocaleString()} txns
              </p>
            </>
          ) : (
            <p className="text-2xl font-bold">—</p>
          )}
        </div>
      </div>

      {/* Report tabs */}
      <div className="flex gap-1 border-b">
        {([
          { key: "branches" as const, label: "Branch Performance" },
          { key: "brands" as const, label: "Brand Breakdown" },
          { key: "invoices" as const, label: "Invoices" },
          { key: "insights" as const, label: "Analytics & Insights" },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Per-branch summary table */}
      {activeTab === "branches" && (
      <div className="rounded-lg border p-4">
        <h2 className="mb-4 text-sm font-semibold">Branch Performance</h2>
          {salesData === undefined ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : salesData.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No transactions found for the selected period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Branch</th>
                    <th className="pb-2 text-right font-medium">Revenue</th>
                    <th className="pb-2 text-right font-medium">Transactions</th>
                    <th className="pb-2 text-right font-medium">Avg Txn Value</th>
                  </tr>
                </thead>
                <tbody>
                  {salesPagination.paginatedData.map((row) => (
                    <tr key={row.branchId} className="border-b last:border-0">
                      <td className="py-2 font-medium">{row.branchName}</td>
                      <td className="py-2 text-right tabular-nums">
                        {formatCentavos(row.revenueCentavos)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {row.txnCount.toLocaleString()}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatCentavos(row.avgTxnValueCentavos)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold">
                    <td className="pt-2">Total</td>
                    <td className="pt-2 text-right tabular-nums">
                      {formatCentavos(
                        salesData.reduce((s, r) => s + r.revenueCentavos, 0)
                      )}
                    </td>
                    <td className="pt-2 text-right tabular-nums">
                      {salesData
                        .reduce((s, r) => s + r.txnCount, 0)
                        .toLocaleString()}
                    </td>
                    <td className="pt-2 text-right tabular-nums text-muted-foreground">—</td>
                  </tr>
                </tfoot>
              </table>
              <TablePagination
                currentPage={salesPagination.currentPage}
                totalPages={salesPagination.totalPages}
                totalItems={salesPagination.totalItems}
                hasNextPage={salesPagination.hasNextPage}
                hasPrevPage={salesPagination.hasPrevPage}
                onNextPage={salesPagination.nextPage}
                onPrevPage={salesPagination.prevPage}
                noun="branch"
              />
            </div>
          )}
      </div>
      )}

      {/* Brand breakdown */}
      {activeTab === "brands" && (
      <div className="rounded-lg border p-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold">Brand Breakdown</h2>
          <input
            type="search"
            placeholder="Filter by brand…"
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="rounded-md border px-3 py-1.5 text-sm w-48"
          />
        </div>
          {filteredBrandData === undefined ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : filteredBrandData.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No brand data found for the selected period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Brand</th>
                    <th className="pb-2 text-right font-medium">Revenue</th>
                    <th className="pb-2 text-right font-medium">Transactions</th>
                  </tr>
                </thead>
                <tbody>
                  {brandPagination.paginatedData.map((row) => (
                    <tr key={row.brandId} className="border-b last:border-0">
                      <td className="py-2 font-medium">{row.brandName}</td>
                      <td className="py-2 text-right tabular-nums">
                        {formatCentavos(row.revenueCentavos)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {row.txnCount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination
                currentPage={brandPagination.currentPage}
                totalPages={brandPagination.totalPages}
                totalItems={brandPagination.totalItems}
                hasNextPage={brandPagination.hasNextPage}
                hasPrevPage={brandPagination.hasPrevPage}
                onNextPage={brandPagination.nextPage}
                onPrevPage={brandPagination.prevPage}
                noun="brand"
              />
            </div>
          )}
      </div>
      )}

      {/* Invoices */}
      {activeTab === "invoices" && (
      <div className="rounded-lg border p-4">
        <h2 className="mb-4 text-sm font-semibold">Warehouse Transfer Invoices</h2>
          {invoiceData === undefined ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : invoiceData.totalInvoiceCount === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No invoices found for the selected period.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="text-sm text-muted-foreground">Total Warehouse Revenue</p>
                  <p className="text-2xl font-bold">{formatCentavos(invoiceData.totalRevenueCentavos)}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="text-sm text-muted-foreground">Invoices Issued</p>
                  <p className="text-2xl font-bold">{invoiceData.totalInvoiceCount}</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Destination Branch</th>
                      <th className="pb-2 text-right font-medium">Revenue</th>
                      <th className="pb-2 text-right font-medium">Invoices</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoicePagination.paginatedData.map((row) => (
                      <tr key={row.branchId} className="border-b last:border-0">
                        <td className="py-2 font-medium">{row.branchName}</td>
                        <td className="py-2 text-right tabular-nums">
                          {formatCentavos(row.revenueCentavos)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {row.invoiceCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-semibold">
                      <td className="pt-2">Total</td>
                      <td className="pt-2 text-right tabular-nums">
                        {formatCentavos(invoiceData.totalRevenueCentavos)}
                      </td>
                      <td className="pt-2 text-right tabular-nums">
                        {invoiceData.totalInvoiceCount}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              <TablePagination
                currentPage={invoicePagination.currentPage}
                totalPages={invoicePagination.totalPages}
                totalItems={invoicePagination.totalItems}
                hasNextPage={invoicePagination.hasNextPage}
                hasPrevPage={invoicePagination.hasPrevPage}
                onNextPage={invoicePagination.nextPage}
                onPrevPage={invoicePagination.prevPage}
                noun="branch"
              />
              </div>

              <p className="mt-4 text-xs text-muted-foreground">
                Revenue from warehouse-to-branch transfers at cost price.{" "}
                <Link href="/admin/invoices" className="text-primary hover:underline">
                  View all invoices →
                </Link>
              </p>
            </>
          )}
      </div>
      )}

      {/* Analytics & Insights — separate component so hooks only fire when tab is active */}
      {activeTab === "insights" && (
        <InsightsPanel
          dateStart={dateStart}
          dateEnd={dateEnd}
          branchId={branchId}
          salesData={salesData}
          brandData={brandData}
        />
      )}
    </div>
  );
}

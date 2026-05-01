"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api as _api } from "@/convex/_generated/api";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = _api as any;
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import {
  FileText,
  TrendingUp,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
function formatPercent(v: number): string {
  return `${v.toFixed(1)}%`;
}

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
  const yearStart = new Date(now.getFullYear(), 0, 1);
  return { start: toYYYYMMDD(yearStart), end: today };
}

type Preset = "daily" | "yesterday" | "weekly" | "monthly" | "yearly" | "custom";
type Channel = "inline" | "online" | "outlet" | "popup" | "dtc" | "warehouse" | "outright";
type Dimension = "people" | "store" | "department" | "category" | "sku" | "size" | "color" | "fit";

const CHANNEL_LABELS: Record<Channel, string> = {
  inline: "Inline",
  online: "Online",
  outlet: "Outlet",
  popup: "Popup",
  dtc: "Direct To Consumer (DTC)",
  warehouse: "Warehouse",
  outright: "Outright",
};

const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: "people", label: "People Performance" },
  { value: "store", label: "Store Performance" },
  { value: "department", label: "Department Performance" },
  { value: "category", label: "Category Performance" },
  { value: "sku", label: "SKU Performance" },
  { value: "size", label: "Size Performance" },
  { value: "color", label: "Color Performance" },
  { value: "fit", label: "Fit Performance" },
];

// ─── People performance tiers ────────────────────────────────────────────────

type PerfTier = "outstanding" | "satisfactory" | "average" | "below" | "fail";

const PERF_TIERS: {
  key: PerfTier;
  label: string;
  range: string;
  action: string;
  chip: string;
}[] = [
  {
    key: "outstanding",
    label: "Outstanding",
    range: "above 102%",
    action: "Incentive & Recognition",
    chip: "bg-green-100 text-green-700 border border-green-200",
  },
  {
    key: "satisfactory",
    label: "Satisfactory",
    range: "100% - 102%",
    action: "Incentive",
    chip: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  },
  {
    key: "average",
    label: "Average",
    range: "80% - 99%",
    action: "Needs pep talk",
    chip: "bg-amber-100 text-amber-700 border border-amber-200",
  },
  {
    key: "below",
    label: "Below Average",
    range: "50% - 79%",
    action: "Coach",
    chip: "bg-orange-100 text-orange-700 border border-orange-200",
  },
  {
    key: "fail",
    label: "Fail",
    range: "below 50%",
    action: "45 days notice",
    chip: "bg-red-100 text-red-700 border border-red-200",
  },
];

function classifyPerformance(pct: number): PerfTier {
  if (pct > 102) return "outstanding";
  if (pct >= 100) return "satisfactory";
  if (pct >= 80) return "average";
  if (pct >= 50) return "below";
  return "fail";
}

const PERF_TIER_MAP: Record<PerfTier, (typeof PERF_TIERS)[number]> = PERF_TIERS.reduce(
  (acc, t) => ({ ...acc, [t.key]: t }),
  {} as Record<PerfTier, (typeof PERF_TIERS)[number]>,
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HqReportsPage() {
  const [dateStart, setDateStart] = useState(() => getPresetDates("monthly").start);
  const [dateEnd, setDateEnd] = useState(() => getPresetDates("monthly").end);
  const [activePreset, setActivePreset] = useState<Preset>("monthly");
  const [brandId, setBrandId] = useState<string | undefined>(undefined);
  const [channel, setChannel] = useState<Channel | undefined>(undefined);
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const [dimension, setDimension] = useState<Dimension>("people");

  function applyPreset(preset: Exclude<Preset, "custom">) {
    const { start, end } = getPresetDates(preset);
    setDateStart(start);
    setDateEnd(end);
    setActivePreset(preset);
  }

  // Filter data sources
  const allBranches = useQuery(api.dashboards.birReports.listActiveBranches) as
    | { id: string; name: string }[]
    | undefined;
  const allBrands = useQuery(api.catalog.brands.listBrands) as
    | { _id: string; name: string; isActive: boolean }[]
    | undefined;
  const activeBrands = useMemo(
    () => (allBrands ?? []).filter((b) => b.isActive).sort((a, b) => a.name.localeCompare(b.name)),
    [allBrands],
  );

  // Build the filter args (shared by both queries)
  // Pass the preset kind so the backend can show full-period targets (Monthly = full month).
  const periodKind =
    activePreset === "yesterday"
      ? "daily"
      : activePreset === "custom"
        ? "custom"
        : activePreset;
  const filterArgs = useMemo(
    () => ({
      dateStart,
      dateEnd,
      periodKind,
      ...(brandId ? { brandId: brandId as Id<"brands"> } : {}),
      ...(branchId ? { branchId: branchId as Id<"branches"> } : {}),
      ...(channel ? { channel } : {}),
    }),
    [dateStart, dateEnd, brandId, branchId, channel, periodKind],
  );

  const summary = useQuery(api.dashboards.reportsV2.getReportsSummary, filterArgs);
  const performance = useQuery(api.dashboards.reportsV2.getPerformanceByDimension, {
    ...filterArgs,
    dimension,
  }) as
    | {
        key: string;
        label: string;
        region?: string | null;
        revenueCentavos: number;
        unitsSold: number;
        currentSohUnits?: number;
        targetCentavos?: number;
        performancePercent?: number;
        topCalendarCode?: string | null;
        calendarCodeMix?: { code: string; revenueCentavos: number }[];
      }[]
    | undefined;
  const promoContribs = useQuery(api.dashboards.reportsV2.getPromotionContributions, filterArgs) as
    | {
        totalSalesCentavos: number;
        promotions: {
          promotionId: string;
          offer: string;
          salesCentavos: number;
          sharePercent: number;
          redemptions: number;
        }[];
      }
    | undefined;
  const movements = useQuery(api.dashboards.reportsV2.getMovementsSummary, filterArgs) as
    | {
        bom: number;
        received: number;
        sold: number;
        transferredOut: number;
        outgoing: number;
        netChange: number;
        currentSohUnits: number;
        liquidationRatePercent: number;
        byBranch: {
          branchId: string;
          branchName: string;
          channel: string | null;
          bom: number;
          sold: number;
          transferredOut: number;
          netChange: number;
        }[];
      }
    | undefined;

  // Total revenue across the full performance dataset (used for "% of Total")
  const totalPerformanceRevenue = useMemo(
    () => (performance ?? []).reduce((s, r) => s + r.revenueCentavos, 0),
    [performance],
  );
  const performancePagination = usePagination(performance ?? [], 10);

  const presets: { key: Exclude<Preset, "custom">; label: string }[] = [
    { key: "daily", label: "Daily" },
    { key: "yesterday", label: "Yesterday" },
    { key: "weekly", label: "Weekly" },
    { key: "monthly", label: "Monthly" },
    { key: "yearly", label: "Yearly" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Sales Reports</h1>
          <p className="text-sm text-muted-foreground">
            Performance across brands, channels, stores, and people
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
            href="/admin/reports/print"
            className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <FileText className="h-4 w-4" />
            Print Report
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

      {/* ── Filters ── */}
      <div className="rounded-lg border p-4 space-y-4">
        <h2 className="text-sm font-semibold">Filters</h2>

        {/* Date presets */}
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                activePreset === p.key
                  ? "bg-primary text-primary-foreground"
                  : "border bg-background text-foreground hover:bg-muted",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Date range + brand/channel/store */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">From</label>
            <input
              type="date"
              value={toInputDate(dateStart)}
              onChange={(e) => {
                setDateStart(fromInputDate(e.target.value));
                setActivePreset("custom");
              }}
              className="rounded-md border px-3 py-1.5 text-sm w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">To</label>
            <input
              type="date"
              value={toInputDate(dateEnd)}
              onChange={(e) => {
                setDateEnd(fromInputDate(e.target.value));
                setActivePreset("custom");
              }}
              className="rounded-md border px-3 py-1.5 text-sm w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">Brand</label>
            <select
              value={brandId ?? ""}
              onChange={(e) => setBrandId(e.target.value || undefined)}
              className="rounded-md border px-3 py-1.5 text-sm w-full"
            >
              <option value="">All Brands</option>
              {activeBrands.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">Channel</label>
            <select
              value={channel ?? ""}
              onChange={(e) => setChannel((e.target.value as Channel) || undefined)}
              className="rounded-md border px-3 py-1.5 text-sm w-full"
            >
              <option value="">All Channels</option>
              {(Object.keys(CHANNEL_LABELS) as Channel[]).map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">Store</label>
            <select
              value={branchId ?? ""}
              onChange={(e) => setBranchId(e.target.value || undefined)}
              className="rounded-md border px-3 py-1.5 text-sm w-full"
            >
              <option value="">All Stores</option>
              {(allBranches ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          title="Sales"
          value={summary ? formatCentavos(summary.salesCentavos) : undefined}
          footer={(() => {
            if (!summary) return undefined;
            if (summary.targetCentavos <= 0) return "No target set";
            const label =
              activePreset === "daily" || activePreset === "yesterday"
                ? "Daily Target"
                : activePreset === "weekly"
                  ? "Weekly Target"
                  : activePreset === "monthly"
                    ? "Monthly Target"
                    : activePreset === "yearly"
                      ? "Yearly Target"
                      : "Period Target";
            const pct = (summary.salesCentavos / summary.targetCentavos) * 100;
            const pctClass =
              pct >= 100
                ? "text-green-600"
                : pct >= 50
                  ? "text-amber-600"
                  : "text-red-600";
            return (
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">
                  {label}: {formatCentavos(summary.targetCentavos)}
                </p>
                <p className={cn("text-xs font-medium", pctClass)}>
                  You are {pct.toFixed(1)}% to your target
                </p>
              </div>
            );
          })()}
        />
        <KpiCard
          title="Units Sold"
          value={summary ? summary.unitsSold.toLocaleString("en-PH") : undefined}
        />
        <KpiCard
          title="Against Target"
          value={
            summary
              ? summary.targetCentavos > 0
                ? formatPercent(summary.targetPercent)
                : "—"
              : undefined
          }
          footer={
            summary && summary.targetCentavos > 0
              ? `Target: ${formatCentavos(summary.targetCentavos)}`
              : "Target not set"
          }
          valueClassName={
            summary && summary.targetCentavos > 0
              ? summary.targetPercent >= 100
                ? "text-green-600"
                : "text-red-600"
              : undefined
          }
        />
        <KpiCard
          title="Against LY"
          value={
            summary
              ? summary.lyRevenueCentavos > 0
                ? formatPercent(summary.lyPercent)
                : "—"
              : undefined
          }
          footer={
            summary && summary.lyRevenueCentavos > 0
              ? `LY: ${formatCentavos(summary.lyRevenueCentavos)}`
              : "No LY data"
          }
          valueClassName={
            summary && summary.lyRevenueCentavos > 0
              ? summary.lyPercent >= 100
                ? "text-green-600"
                : "text-red-600"
              : undefined
          }
        />
        <KpiCard
          title="Projection"
          value={summary ? formatCentavos(summary.projectedCentavos) : undefined}
          footer="Straight-line run rate"
        />
      </div>

      {/* ── Performance pill ── */}
      <div>
        <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
          <h2 className="text-base font-semibold">Performance</h2>
        </div>
        <div className="flex flex-wrap gap-1 mb-4">
          {DIMENSIONS.map((d) => (
            <button
              key={d.value}
              onClick={() => setDimension(d.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors border",
                dimension === d.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground hover:bg-muted",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="rounded-lg border p-4">
          {performance === undefined ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : performance.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No data for the selected filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">
                      {DIMENSIONS.find((d) => d.value === dimension)?.label.replace(" Performance", "") ?? ""}
                    </th>
                    {dimension === "store" && (
                      <th className="pb-2 font-medium">Region</th>
                    )}
                    <th className="pb-2 text-right font-medium">Sales</th>
                    <th className="pb-2 text-right font-medium">Units</th>
                    <th className="pb-2 text-right font-medium">% of Total</th>
                    <th className="pb-2 font-medium">Calendar Code</th>
                    {dimension !== "people" && (
                      <th className="pb-2 text-right font-medium">SOH %</th>
                    )}
                    {(dimension === "people" || dimension === "store") && (
                      <>
                        <th className="pb-2 text-right font-medium">Target</th>
                        <th className="pb-2 text-right font-medium">Performance</th>
                        <th className="pb-2 font-medium">Tier</th>
                        <th className="pb-2 font-medium">Action</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {performancePagination.paginatedData.map((row) => {
                    const perf = row.performancePercent ?? 0;
                    const tier = classifyPerformance(perf);
                    const tierCfg = PERF_TIER_MAP[tier];
                    const hasTarget = (row.targetCentavos ?? 0) > 0;
                    return (
                      <tr key={row.key} className="border-b last:border-0">
                        <td className="py-2 font-medium">{row.label}</td>
                        {dimension === "store" && (
                          <td className="py-2">
                            {row.region ? (
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                                  row.region === "luzon"
                                    ? "bg-rose-100 text-rose-700 border border-rose-200"
                                    : row.region === "visayas"
                                      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                      : "bg-yellow-100 text-yellow-800 border border-yellow-200",
                                )}
                              >
                                {row.region}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        )}
                        <td className="py-2 text-right tabular-nums">
                          {formatCentavos(row.revenueCentavos)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {row.unitsSold.toLocaleString("en-PH")}
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {totalPerformanceRevenue > 0
                            ? `${((row.revenueCentavos / totalPerformanceRevenue) * 100).toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className="py-2">
                          {row.topCalendarCode ? (
                            <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                              {row.topCalendarCode}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        {dimension !== "people" && (() => {
                          const soh = row.currentSohUnits ?? 0;
                          const flow = soh + row.unitsSold;
                          const sohPct = flow > 0 ? (soh / flow) * 100 : 0;
                          return (
                            <td className="py-2 text-right tabular-nums text-muted-foreground">
                              {flow > 0 ? `${sohPct.toFixed(1)}%` : "—"}
                            </td>
                          );
                        })()}
                          {(dimension === "people" || dimension === "store") && (
                            <>
                              <td className="py-2 text-right tabular-nums text-muted-foreground">
                                {hasTarget ? formatCentavos(row.targetCentavos ?? 0) : "—"}
                              </td>
                              <td
                                className={cn(
                                  "py-2 text-right tabular-nums font-medium",
                                  hasTarget
                                    ? perf > 102
                                      ? "text-green-600"
                                      : perf >= 100
                                        ? "text-emerald-600"
                                        : perf >= 80
                                          ? "text-amber-600"
                                          : perf >= 50
                                            ? "text-orange-600"
                                            : "text-red-600"
                                    : "text-muted-foreground",
                                )}
                              >
                                {hasTarget ? formatPercent(perf) : "—"}
                              </td>
                              <td className="py-2">
                                {hasTarget ? (
                                  <span
                                    className={cn(
                                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                      tierCfg.chip,
                                    )}
                                  >
                                    {tierCfg.label}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="py-2 text-xs text-muted-foreground">
                                {hasTarget ? tierCfg.action : "—"}
                              </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {performance && performance.length > 10 && (
          <TablePagination
            currentPage={performancePagination.currentPage}
            totalPages={performancePagination.totalPages}
            totalItems={performancePagination.totalItems}
            hasNextPage={performancePagination.hasNextPage}
            hasPrevPage={performancePagination.hasPrevPage}
            onNextPage={performancePagination.nextPage}
            onPrevPage={performancePagination.prevPage}
          />
        )}

        {(dimension === "people" || dimension === "store") && (
          <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Performance Tiers</h3>
              <p className="text-xs text-muted-foreground">
                Performance % = {dimension === "store" ? "store" : "cashier"} sales ÷ prorated target (scope target ÷ active {dimension === "store" ? "stores" : "cashiers"}).
                {" "}Missing targets mean no monthly sales target is configured in{" "}
                <Link href="/admin/settings" className="underline hover:text-foreground">
                  Settings
                </Link>
                .
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border">
                <thead>
                  <tr className="border-b bg-background/50 text-left">
                    <th className="px-3 py-2 font-medium">Tier</th>
                    <th className="px-3 py-2 font-medium">Range</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {PERF_TIERS.map((t) => (
                    <tr key={t.key} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            t.chip,
                          )}
                        >
                          {t.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{t.range}</td>
                      <td className="px-3 py-2 font-medium">{t.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Movements ── */}
      <div>
        <h2 className="text-base font-semibold mb-3">Movements</h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <KpiCard
            title="BOM"
            value={movements ? `${movements.bom.toLocaleString("en-PH")} pcs` : undefined}
            footer="Beginning of the Month Stocks"
          />
          <KpiCard
            title="Outgoing"
            value={movements ? `${movements.outgoing.toLocaleString("en-PH")} pcs` : undefined}
            footer={
              movements
                ? `Sold: ${movements.sold.toLocaleString("en-PH")} · Transferred: ${movements.transferredOut.toLocaleString("en-PH")}`
                : undefined
            }
          />
          <KpiCard
            title="Net Movement"
            value={
              movements
                ? `${movements.netChange >= 0 ? "+" : ""}${movements.netChange.toLocaleString("en-PH")} pcs`
                : undefined
            }
            valueClassName={
              movements
                ? movements.netChange >= 0
                  ? "text-green-600"
                  : "text-red-600"
                : undefined
            }
            footer="Received − Outgoing"
          />
          <KpiCard
            title="Liquidation Rate"
            value={movements ? formatPercent(movements.liquidationRatePercent) : undefined}
            footer="(BOM − MTD Stock) ÷ BOM"
          />
        </div>

        <div className="rounded-lg border p-4">
          {movements === undefined ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : movements.byBranch.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No movement data for the selected filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Branch</th>
                    <th className="pb-2 font-medium">Channel</th>
                    <th className="pb-2 text-right font-medium">BOM</th>
                    <th className="pb-2 text-right font-medium">Sold</th>
                    <th className="pb-2 text-right font-medium">Transferred Out</th>
                    <th className="pb-2 text-right font-medium">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.byBranch.map((row) => (
                    <tr key={row.branchId} className="border-b last:border-0">
                      <td className="py-2 font-medium">{row.branchName}</td>
                      <td className="py-2 text-muted-foreground capitalize">
                        {row.channel ?? "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {row.bom.toLocaleString("en-PH")}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {row.sold.toLocaleString("en-PH")}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {row.transferredOut.toLocaleString("en-PH")}
                      </td>
                      <td
                        className={cn(
                          "py-2 text-right tabular-nums font-medium",
                          row.netChange > 0
                            ? "text-green-600"
                            : row.netChange < 0
                              ? "text-red-600"
                              : "",
                        )}
                      >
                        {row.netChange >= 0 ? "+" : ""}
                        {row.netChange.toLocaleString("en-PH")}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold">
                    <td className="pt-2" colSpan={2}>
                      Total
                    </td>
                    <td className="pt-2 text-right tabular-nums">
                      {movements.bom.toLocaleString("en-PH")}
                    </td>
                    <td className="pt-2 text-right tabular-nums">
                      {movements.sold.toLocaleString("en-PH")}
                    </td>
                    <td className="pt-2 text-right tabular-nums">
                      {movements.transferredOut.toLocaleString("en-PH")}
                    </td>
                    <td
                      className={cn(
                        "pt-2 text-right tabular-nums",
                        movements.netChange > 0
                          ? "text-green-600"
                          : movements.netChange < 0
                            ? "text-red-600"
                            : "",
                      )}
                    >
                      {movements.netChange >= 0 ? "+" : ""}
                      {movements.netChange.toLocaleString("en-PH")}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Promotion Contributions ── */}
      <div>
        <h2 className="text-base font-semibold mb-3">Promotion Contributions</h2>
        <div className="rounded-lg border p-4">
          {promoContribs === undefined ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : promoContribs.promotions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No promotion-attributable sales for the selected filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Offers</th>
                    <th className="pb-2 text-right font-medium">Sales Amount</th>
                    <th className="pb-2 text-right font-medium">
                      % of {(() => {
                        switch (activePreset) {
                          case "daily":
                            return "DTD";
                          case "yesterday":
                            return "Yesterday";
                          case "weekly":
                            return "WTD";
                          case "monthly":
                            return "MTD";
                          case "yearly":
                            return "YTD";
                          default:
                            return "Range";
                        }
                      })()}
                    </th>
                    <th className="pb-2 text-right font-medium">Redemption</th>
                  </tr>
                </thead>
                <tbody>
                  {promoContribs.promotions.map((p) => (
                    <tr key={p.promotionId} className="border-b last:border-0">
                      <td className="py-2 font-medium">{p.offer}</td>
                      <td className="py-2 text-right tabular-nums">
                        {formatCentavos(p.salesCentavos)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {p.sharePercent.toFixed(1)}%
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {p.redemptions.toLocaleString("en-PH")}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold">
                    <td className="pt-2">Total</td>
                    <td className="pt-2 text-right tabular-nums">
                      {formatCentavos(
                        promoContribs.promotions.reduce((s, p) => s + p.salesCentavos, 0),
                      )}
                    </td>
                    <td className="pt-2 text-right tabular-nums">
                      {promoContribs.totalSalesCentavos > 0
                        ? `${(
                            (promoContribs.promotions.reduce((s, p) => s + p.salesCentavos, 0) /
                              promoContribs.totalSalesCentavos) *
                            100
                          ).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="pt-2 text-right tabular-nums">
                      {promoContribs.promotions
                        .reduce((s, p) => s + p.redemptions, 0)
                        .toLocaleString("en-PH")}
                    </td>
                  </tr>
                </tfoot>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">
                Attribution: a discounted line is credited to a promo when its scope
                (branch/brand/variant) and date window match the transaction. Lines
                matching multiple promos are split equally so totals reconcile.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  valueClassName,
  footer,
}: {
  title: string;
  value: string | undefined;
  valueClassName?: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-1">
      <p className="text-sm text-muted-foreground">{title}</p>
      {value === undefined ? (
        <div className="h-8 w-24 animate-pulse rounded bg-muted" />
      ) : (
        <p className={cn("text-2xl font-bold tabular-nums", valueClassName)}>{value}</p>
      )}
      {footer && (typeof footer === "string"
        ? <p className="text-xs text-muted-foreground">{footer}</p>
        : footer)}
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";
import type { Id } from "@/convex/_generated/dataModel";

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

function formatDisplayDate(yyyymmdd: string): string {
  const year = parseInt(yyyymmdd.slice(0, 4));
  const month = parseInt(yyyymmdd.slice(4, 6)) - 1;
  const day = parseInt(yyyymmdd.slice(6, 8));
  return new Date(year, month, day).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Classification config ───────────────────────────────────────────────────

const CLASS_CONFIG = {
  fast: { label: "Fast Mover", className: "bg-green-100 text-green-700 border border-green-200" },
  normal: { label: "Normal", className: "bg-blue-100 text-blue-700 border border-blue-200" },
  slow: { label: "Slow Mover", className: "bg-amber-100 text-amber-700 border border-amber-200" },
  dead: { label: "Dead Stock", className: "bg-red-100 text-red-700 border border-red-200" },
} as const;

const SUBCLASS_LABELS: Record<string, string> = {
  "fast-restock": "Restock urgently!",
  "fast-healthy": "Healthy stock level",
  "fast-overstocked": "Overstocked for demand",
  "normal-watch": "Watch — low stock",
  "normal": "Normal",
  "normal-low": "Low velocity, low stock",
  "slow-overstock": "Excess inventory",
  "slow-critical": "Critical — no demand, high stock",
  "dead": "No sales in period",
};

// ─── CSV download helper ─────────────────────────────────────────────────────

function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Preset helper ───────────────────────────────────────────────────────────

function getMoversPresetDates(preset: "7d" | "30d" | "90d") {
  const now = new Date();
  const end = toYYYYMMDD(now);
  const d = new Date();
  if (preset === "7d") d.setDate(d.getDate() - 7);
  else if (preset === "30d") d.setDate(d.getDate() - 30);
  else d.setDate(d.getDate() - 90);
  return { start: toYYYYMMDD(d), end };
}

// ─── Component ───────────────────────────────────────────────────────────────

type Preset = "7d" | "30d" | "90d" | "custom";

export default function ProductMoversPage() {
  const [dateStart, setDateStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toYYYYMMDD(d);
  });
  const [dateEnd, setDateEnd] = useState(() => toYYYYMMDD(new Date()));
  const [activePreset, setActivePreset] = useState<Preset>("30d");
  const [branchId, setBranchId] = useState<string>("");
  const [classFilter, setClassFilter] = useState<
    "all" | "fast" | "normal" | "slow" | "dead"
  >("all");
  const [sortCol, setSortCol] = useState<string>("classification");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // ─── Queries ─────────────────────────────────────────────────────────────────

  const allBranches = useQuery(api.dashboards.birReports.listActiveBranches);
  const moversData = useQuery(api.dashboards.productMovers.getProductMovers, {
    dateStart,
    dateEnd,
    ...(branchId ? { branchId: branchId as Id<"branches"> } : {}),
  });

  // ─── Client-side filtering + sorting ─────────────────────────────────────────

  const filteredItems = useMemo(() => {
    if (!moversData?.items) return [];
    let items = moversData.items;
    if (classFilter !== "all")
      items = items.filter((i) => i.classification === classFilter);
    // Sort
    const dir = sortDir === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      switch (sortCol) {
        case "stock":
          return (a.currentStock - b.currentStock) * dir;
        case "sold":
          return (a.totalSold - b.totalSold) * dir;
        case "rate":
          return (a.dailySalesRate - b.dailySalesRate) * dir;
        case "dos": {
          const dosA =
            a.daysOfSupply === null
              ? a.currentStock > 0
                ? 999999
                : -1
              : a.daysOfSupply;
          const dosB =
            b.daysOfSupply === null
              ? b.currentStock > 0
                ? 999999
                : -1
              : b.daysOfSupply;
          return (dosA - dosB) * dir;
        }
        default:
          return 0; // classification = default sort from server
      }
    });
  }, [moversData, classFilter, sortCol, sortDir]);

  const pagination = usePagination(filteredItems);

  // ─── Summary counts ──────────────────────────────────────────────────────────

  const counts = useMemo(() => {
    if (!moversData?.items) return null;
    const items = moversData.items;
    return {
      fast: items.filter((i) => i.classification === "fast").length,
      normal: items.filter((i) => i.classification === "normal").length,
      slow: items.filter((i) => i.classification === "slow").length,
      dead: items.filter((i) => i.classification === "dead").length,
    };
  }, [moversData]);

  // ─── Sort handler ────────────────────────────────────────────────────────────

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  // ─── CSV export ──────────────────────────────────────────────────────────────

  function handleCsvExport() {
    if (!filteredItems.length) return;
    const rows = [
      [
        "Product",
        "SKU",
        "Size",
        "Color",
        "Brand",
        "Stock",
        "Units Sold",
        "Daily Rate",
        "Days of Supply",
        "Classification",
      ],
      ...filteredItems.map((item) => [
        item.styleName,
        item.sku,
        item.size,
        item.color,
        item.brandName,
        String(item.currentStock),
        String(item.totalSold),
        item.dailySalesRate.toFixed(1),
        item.daysOfSupply === null
          ? "\u2014"
          : item.daysOfSupply >= 999999
            ? "\u221E"
            : String(item.daysOfSupply),
        item.classification,
      ]),
    ];
    downloadCsv(`Product-Movers-${dateStart}-${dateEnd}.csv`, rows);
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between no-print">
          <Link
            href="/admin/reports"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Reports
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCsvExport}
              disabled={!moversData}
              className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Download CSV
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              <Printer className="h-4 w-4" /> Print
            </button>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold">Product Movers Analysis</h1>
          <p className="text-sm text-muted-foreground">
            2-axis classification: sales velocity &times; days of supply
          </p>
        </div>

        {/* Period selector */}
        <div className="rounded-lg border p-4 space-y-4 no-print">
          <h2 className="text-sm font-semibold">Analysis Period</h2>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: "7d", label: "7 Days" },
                { key: "30d", label: "30 Days" },
                { key: "90d", label: "90 Days" },
              ] as const
            ).map((p) => (
              <button
                key={p.key}
                onClick={() => {
                  const dates = getMoversPresetDates(p.key);
                  setDateStart(dates.start);
                  setDateEnd(dates.end);
                  setActivePreset(p.key);
                }}
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
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="rounded-md border px-3 py-1.5 text-sm"
              >
                <option value="">All Branches</option>
                {allBranches?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Print header */}
        <div className="print-only text-center pb-4 border-b">
          <h2 className="text-xl font-bold">Product Movers Analysis</h2>
          <p className="text-sm">
            Period: {formatDisplayDate(dateStart)} &ndash;{" "}
            {formatDisplayDate(dateEnd)}
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(
            [
              { key: "fast", label: "Fast Movers", color: "text-green-600" },
              { key: "normal", label: "Normal", color: "text-blue-600" },
              { key: "slow", label: "Slow Movers", color: "text-amber-600" },
              { key: "dead", label: "Dead Stock", color: "text-red-600" },
            ] as const
          ).map((card) => (
            <button
              key={card.key}
              onClick={() =>
                setClassFilter(classFilter === card.key ? "all" : card.key)
              }
              className={`rounded-lg border p-4 text-left transition-colors ${
                classFilter === card.key
                  ? "ring-2 ring-primary"
                  : "hover:bg-muted/50"
              }`}
            >
              <p className="text-xs text-muted-foreground">{card.label}</p>
              {counts === null ? (
                <div className="mt-1 h-7 animate-pulse rounded bg-muted" />
              ) : (
                <p
                  className={`mt-1 text-2xl font-bold tabular-nums ${card.color}`}
                >
                  {counts[card.key]}
                </p>
              )}
            </button>
          ))}
        </div>

        {/* Classification filter pills */}
        <div className="flex flex-wrap gap-1.5 no-print">
          {(
            [
              { key: "all", label: "All" },
              { key: "fast", label: "Fast Movers" },
              { key: "normal", label: "Normal" },
              { key: "slow", label: "Slow Movers" },
              { key: "dead", label: "Dead Stock" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              onClick={() => setClassFilter(f.key)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                classFilter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "border hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Paginated table */}
        <div className="rounded-lg border overflow-hidden">
          {moversData === undefined ? (
            <div className="p-8 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No items match the current filters
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Brand</th>
                  <th
                    className="px-4 py-3 font-medium cursor-pointer hover:text-primary"
                    onClick={() => handleSort("stock")}
                  >
                    Stock{" "}
                    {sortCol === "stock"
                      ? sortDir === "asc"
                        ? "\u2191"
                        : "\u2193"
                      : ""}
                  </th>
                  <th
                    className="px-4 py-3 font-medium cursor-pointer hover:text-primary"
                    onClick={() => handleSort("sold")}
                  >
                    Sold{" "}
                    {sortCol === "sold"
                      ? sortDir === "asc"
                        ? "\u2191"
                        : "\u2193"
                      : ""}
                  </th>
                  <th
                    className="px-4 py-3 font-medium cursor-pointer hover:text-primary"
                    onClick={() => handleSort("rate")}
                  >
                    Daily Rate{" "}
                    {sortCol === "rate"
                      ? sortDir === "asc"
                        ? "\u2191"
                        : "\u2193"
                      : ""}
                  </th>
                  <th
                    className="px-4 py-3 font-medium cursor-pointer hover:text-primary"
                    onClick={() => handleSort("dos")}
                  >
                    DOS{" "}
                    {sortCol === "dos"
                      ? sortDir === "asc"
                        ? "\u2191"
                        : "\u2193"
                      : ""}
                  </th>
                  <th className="px-4 py-3 font-medium">Classification</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pagination.paginatedData.map((item) => {
                  const classConfig =
                    CLASS_CONFIG[
                      item.classification as keyof typeof CLASS_CONFIG
                    ];
                  const subLabel =
                    SUBCLASS_LABELS[item.subClassification] ?? "";
                  return (
                    <tr key={item.variantId} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-medium">{item.styleName}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.sku} &middot; {item.size} / {item.color}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {item.brandName}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {item.currentStock}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {item.totalSold}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {item.dailySalesRate.toFixed(1)}/day
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {item.daysOfSupply === null
                          ? "\u2014"
                          : item.daysOfSupply >= 999999
                            ? "\u221E"
                            : `${item.daysOfSupply}d`}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${classConfig.className}`}
                          title={subLabel}
                        >
                          {classConfig.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {filteredItems.length > 0 && (
          <TablePagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            hasNextPage={pagination.hasNextPage}
            hasPrevPage={pagination.hasPrevPage}
            onNextPage={pagination.nextPage}
            onPrevPage={pagination.prevPage}
          />
        )}

        {/* Meta info */}
        {moversData?.meta && (
          <p className="text-xs text-muted-foreground text-center">
            {moversData.meta.totalVariants} variants analyzed over{" "}
            {moversData.meta.periodDays} days
            {moversData.meta.p25 > 0 &&
              ` \u00B7 Velocity thresholds: P25=${moversData.meta.p25.toFixed(1)}, P75=${moversData.meta.p75.toFixed(1)} units/day`}
          </p>
        )}
      </div>
    </>
  );
}

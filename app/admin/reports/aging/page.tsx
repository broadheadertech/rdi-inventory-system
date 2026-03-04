"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";
import type { Id } from "@/convex/_generated/dataModel";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCentavos(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

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

// ─── Tier config ─────────────────────────────────────────────────────────────

const TIER_CONFIG = {
  green: {
    label: "New (0-90d)",
    className: "bg-green-100 text-green-700 border border-green-200",
  },
  yellow: {
    label: "Mid (91-180d)",
    className: "bg-yellow-100 text-yellow-700 border border-yellow-200",
  },
  red: {
    label: "Old (180d+)",
    className: "bg-red-100 text-red-700 border border-red-200",
  },
} as const;

// ─── Component ───────────────────────────────────────────────────────────────

type TierFilter = "all" | "green" | "yellow" | "red";

export default function InventoryAgingPage() {
  const [branchId, setBranchId] = useState<string>("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [sortCol, setSortCol] = useState<string>("tier");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // ─── Queries ───────────────────────────────────────────────────────────────

  const allBranches = useQuery(api.dashboards.birReports.listActiveBranches);
  const agingData = useQuery(api.dashboards.inventoryAging.getAgingReport, {
    ...(branchId ? { branchId: branchId as Id<"branches"> } : {}),
  });

  // ─── Client-side filtering + sorting ───────────────────────────────────────

  const filteredItems = useMemo(() => {
    if (!agingData?.items) return [];
    let items = agingData.items;
    if (tierFilter !== "all")
      items = items.filter((i) => i.dominantTier === tierFilter);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      switch (sortCol) {
        case "totalQty":
          return (a.totalQty - b.totalQty) * dir;
        case "redQty":
          return (a.redQty - b.redQty) * dir;
        case "oldestAge":
          return (a.oldestAgeDays - b.oldestAgeDays) * dir;
        case "cost":
          return (a.totalCostCentavos - b.totalCostCentavos) * dir;
        default:
          return 0; // default server sort by tier
      }
    });
  }, [agingData, tierFilter, sortCol, sortDir]);

  const pagination = usePagination(filteredItems);

  // ─── Sort handler ──────────────────────────────────────────────────────────

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  // ─── CSV export ────────────────────────────────────────────────────────────

  function handleCsvExport() {
    if (!filteredItems.length) return;
    const rows = [
      [
        "Product",
        "SKU",
        "Size",
        "Color",
        "Brand",
        "Total Stock",
        "Green Qty",
        "Yellow Qty",
        "Red Qty",
        "Oldest Batch (days)",
        "Avg Age (days)",
        "Cost Exposure (PHP)",
        "Aging Status",
      ],
      ...filteredItems.map((item) => [
        item.styleName,
        item.sku,
        item.size,
        item.color,
        item.brandName,
        String(item.totalQty),
        String(item.greenQty),
        String(item.yellowQty),
        String(item.redQty),
        String(item.oldestAgeDays),
        String(item.weightedAvgAge),
        (item.totalCostCentavos / 100).toFixed(2),
        item.dominantTier === "green"
          ? "New"
          : item.dominantTier === "yellow"
            ? "Mid-Cycle"
            : "Old",
      ]),
    ];
    downloadCsv("Inventory-Aging-Report.csv", rows);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const summary = agingData?.summary;

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
              disabled={!agingData}
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
          <h1 className="text-2xl font-bold">Inventory Aging Report</h1>
          <p className="text-sm text-muted-foreground">
            6-month production cycle: Green (0-90d) / Yellow (91-180d) / Red
            (180d+)
          </p>
        </div>

        {/* Branch filter */}
        <div className="rounded-lg border p-4 space-y-4 no-print">
          <h2 className="text-sm font-semibold">Filter</h2>
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

        {/* Print header */}
        <div className="print-only text-center pb-4 border-b">
          <h2 className="text-xl font-bold">Inventory Aging Report</h2>
          <p className="text-sm">
            Generated:{" "}
            {new Date().toLocaleDateString("en-PH", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>

        {/* Summary cards — SKU counts */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(
            [
              { key: "total" as const, label: "Total SKUs", color: "text-foreground" },
              { key: "green" as const, label: "New Stock", color: "text-green-600" },
              { key: "yellow" as const, label: "Mid-Cycle", color: "text-yellow-600" },
              { key: "red" as const, label: "Old Stock", color: "text-red-600" },
            ] as const
          ).map((card) => (
            <button
              key={card.key}
              onClick={() => {
                if (card.key === "total") setTierFilter("all");
                else
                  setTierFilter(
                    tierFilter === card.key ? "all" : card.key
                  );
              }}
              className={`rounded-lg border p-4 text-left transition-colors ${
                (card.key === "total" && tierFilter === "all") ||
                tierFilter === card.key
                  ? "ring-2 ring-primary"
                  : "hover:bg-muted/50"
              }`}
            >
              <p className="text-xs text-muted-foreground">{card.label}</p>
              {summary === undefined ? (
                <div className="mt-1 h-7 animate-pulse rounded bg-muted" />
              ) : (
                <p
                  className={`mt-1 text-2xl font-bold tabular-nums ${card.color}`}
                >
                  {card.key === "total"
                    ? summary.totalSkus
                    : card.key === "green"
                      ? summary.greenSkus
                      : card.key === "yellow"
                        ? summary.yellowSkus
                        : summary.redSkus}
                </p>
              )}
            </button>
          ))}
        </div>

        {/* Cost exposure cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {(
            [
              {
                label: "New Stock Value",
                key: "greenCostCentavos" as const,
                color: "text-green-600",
              },
              {
                label: "Mid-Cycle Value",
                key: "yellowCostCentavos" as const,
                color: "text-yellow-600",
              },
              {
                label: "Old Stock (At-Risk)",
                key: "redCostCentavos" as const,
                color: "text-red-600",
              },
            ] as const
          ).map((card) => (
            <div key={card.key} className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              {summary === undefined ? (
                <div className="mt-1 h-7 animate-pulse rounded bg-muted" />
              ) : (
                <p
                  className={`mt-1 text-xl font-bold tabular-nums ${card.color}`}
                >
                  {formatCentavos(summary[card.key])}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Tier filter pills */}
        <div className="flex flex-wrap gap-1.5 no-print">
          {(
            [
              { key: "all" as const, label: "All" },
              { key: "green" as const, label: "New (0-90d)" },
              { key: "yellow" as const, label: "Mid-Cycle (91-180d)" },
              { key: "red" as const, label: "Old (180d+)" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              onClick={() => setTierFilter(f.key)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                tierFilter === f.key
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
          {agingData === undefined ? (
            <div className="p-8 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded bg-muted"
                />
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
                    onClick={() => handleSort("totalQty")}
                  >
                    Stock{" "}
                    {sortCol === "totalQty"
                      ? sortDir === "asc"
                        ? "\u2191"
                        : "\u2193"
                      : ""}
                  </th>
                  <th className="px-4 py-3 font-medium">Green</th>
                  <th className="px-4 py-3 font-medium">Yellow</th>
                  <th
                    className="px-4 py-3 font-medium cursor-pointer hover:text-primary"
                    onClick={() => handleSort("redQty")}
                  >
                    Red{" "}
                    {sortCol === "redQty"
                      ? sortDir === "asc"
                        ? "\u2191"
                        : "\u2193"
                      : ""}
                  </th>
                  <th
                    className="px-4 py-3 font-medium cursor-pointer hover:text-primary"
                    onClick={() => handleSort("oldestAge")}
                  >
                    Oldest{" "}
                    {sortCol === "oldestAge"
                      ? sortDir === "asc"
                        ? "\u2191"
                        : "\u2193"
                      : ""}
                  </th>
                  <th
                    className="px-4 py-3 font-medium cursor-pointer hover:text-primary"
                    onClick={() => handleSort("cost")}
                  >
                    Cost{" "}
                    {sortCol === "cost"
                      ? sortDir === "asc"
                        ? "\u2191"
                        : "\u2193"
                      : ""}
                  </th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pagination.paginatedData.map((item) => {
                  const tierConfig =
                    TIER_CONFIG[
                      item.dominantTier as keyof typeof TIER_CONFIG
                    ];
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
                        {item.totalQty}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-green-600">
                        {item.greenQty > 0 ? item.greenQty : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-yellow-600">
                        {item.yellowQty > 0 ? item.yellowQty : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-red-600">
                        {item.redQty > 0 ? item.redQty : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {item.oldestAgeDays}d
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatCentavos(item.totalCostCentavos)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tierConfig.className}`}
                        >
                          {tierConfig.label}
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

        {/* Meta */}
        {summary && (
          <p className="text-xs text-muted-foreground text-center">
            {summary.totalSkus} variants with stock &middot;{" "}
            {summary.totalUnits.toLocaleString()} total units &middot;
            At-risk value: {formatCentavos(summary.atRiskCostCentavos)}
          </p>
        )}
      </div>
    </>
  );
}

"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { FileText } from "lucide-react";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";

// ─── Date helpers (vanilla JS — no date-fns) ──────────────────────────────────

function toYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// HTML <input type="date"> uses YYYY-MM-DD; Convex args use YYYYMMDD (no dashes)
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

// ─── Preset helpers (local timezone = PHT assumed for Philippines deployment) ─

function getPresetDates(
  preset: "today" | "yesterday" | "thisWeek" | "thisMonth"
): { start: string; end: string } {
  const now = new Date();
  const today = toYYYYMMDD(now);

  if (preset === "today") return { start: today, end: today };

  if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    const yd = toYYYYMMDD(y);
    return { start: yd, end: yd };
  }

  if (preset === "thisWeek") {
    const weekStart = new Date(now);
    // Monday = (getDay() + 6) % 7 days ago
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return { start: toYYYYMMDD(weekStart), end: today };
  }

  // thisMonth
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: toYYYYMMDD(monthStart), end: today };
}

// ─── Component ────────────────────────────────────────────────────────────────

type Preset = "today" | "yesterday" | "thisWeek" | "thisMonth" | "custom";
type ReportTab = "branches" | "brands" | "invoices";

export default function HqReportsPage() {
  // L3 fix: lazy initializer prevents stale date value past midnight
  const [dateStart, setDateStart] = useState(() => toYYYYMMDD(new Date()));
  const [dateEnd, setDateEnd] = useState(() => toYYYYMMDD(new Date()));
  const [activePreset, setActivePreset] = useState<Preset>("today");
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<ReportTab>("branches");
  // H2 fix: brand filter state for client-side filtering of brand breakdown
  const [brandFilter, setBrandFilter] = useState("");

  function applyPreset(preset: "today" | "yesterday" | "thisWeek" | "thisMonth") {
    const { start, end } = getPresetDates(preset);
    setDateStart(start);
    setDateEnd(end);
    setActivePreset(preset);
  }

  // M3 fix: separate query for all active branches — branch dropdown always
  // reflects the full active branch list regardless of the date filter.
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

  // H2 fix: client-side brand filter applied to brandData results
  const filteredBrandData = brandFilter
    ? brandData?.filter((b) =>
        b.brandName.toLowerCase().includes(brandFilter.toLowerCase())
      )
    : brandData;

  const salesPagination = usePagination(salesData);
  const brandPagination = usePagination(filteredBrandData);
  const invoicePagination = usePagination(invoiceData?.byBranch);

  const presets: { key: "today" | "yesterday" | "thisWeek" | "thisMonth"; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "yesterday", label: "Yesterday" },
    { key: "thisWeek", label: "This Week" },
    { key: "thisMonth", label: "This Month" },
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
        <Link
          href="/admin/reports/bir"
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <FileText className="h-4 w-4" />
          BIR VAT Report
        </Link>
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
          {/* M3 fix: branch dropdown uses allBranches query, independent of salesData */}
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

      {/* Report tabs */}
      <div className="flex gap-1 border-b">
        {([
          { key: "branches" as const, label: "Branch Performance" },
          { key: "brands" as const, label: "Brand Breakdown" },
          { key: "invoices" as const, label: "Invoices" },
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
          {/* H2 fix: brand filter input for client-side filtering */}
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

      {/* Invoices — warehouse transfer revenue */}
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
              {/* Summary cards */}
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

              {/* Per-branch breakdown */}
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
    </div>
  );
}

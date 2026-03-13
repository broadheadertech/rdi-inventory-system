"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api as _api } from "@/convex/_generated/api";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = _api as any;
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import {
  FileText,
  TrendingUp,
  ShoppingCart,
  Receipt,
  Trophy,
  Package,
  Users,
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
type ReportTab = "branches" | "brands" | "invoices" | "cashiers";

type SalesRow = { branchId: string; branchName: string; revenueCentavos: number; txnCount: number; avgTxnValueCentavos: number };
type BrandRow = { brandId: string; brandName: string; revenueCentavos: number; txnCount: number };
type InvoiceBranchRow = { branchId: string; branchName: string; revenueCentavos: number; invoiceCount: number };
type CashierShiftRow = {
  shiftId: string;
  cashierName: string;
  branchName: string;
  openedAt: number;
  closedAt: number | null;
  status: string;
  closeType: string | null;
  changeFundCentavos: number;
  cashSalesCentavos: number;
  gcashSalesCentavos: number;
  mayaSalesCentavos: number;
  totalSalesCentavos: number;
  transactionCount: number;
  voidedCount: number;
};

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
    ? brandData?.filter((b: { brandName: string }) =>
        b.brandName.toLowerCase().includes(brandFilter.toLowerCase())
      )
    : brandData;

  // ── Summary card computations (derived from salesData, no extra query) ────
  const totalRevenueCentavos = salesData?.reduce((s: number, r: { revenueCentavos: number }) => s + r.revenueCentavos, 0) ?? 0;
  const totalTxnCount = salesData?.reduce((s: number, r: { txnCount: number }) => s + r.txnCount, 0) ?? 0;
  const avgTxnValueCentavos = totalTxnCount > 0 ? Math.round(totalRevenueCentavos / totalTxnCount) : 0;
  const topBranch = salesData?.[0];

  const cashierReport = useQuery(api.admin.cashierReports.getCashierShiftReport, {
    dateStart,
    dateEnd,
    ...(branchId ? { branchId: branchId as Id<"branches"> } : {}),
  });

  const salesPagination = usePagination(salesData as SalesRow[] | undefined);
  const brandPagination = usePagination(filteredBrandData as BrandRow[] | undefined);
  const invoicePagination = usePagination(invoiceData?.byBranch as InvoiceBranchRow[] | undefined);
  const cashierPagination = usePagination(cashierReport as CashierShiftRow[] | undefined);

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
              {(allBranches ?? []).map((b: { id: string; name: string }) => (
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
          { key: "cashiers" as const, label: "Cashiers" },
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
                        (salesData as SalesRow[]).reduce((s, r) => s + r.revenueCentavos, 0)
                      )}
                    </td>
                    <td className="pt-2 text-right tabular-nums">
                      {(salesData as SalesRow[])
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

      {/* Cashier shift report */}
      {activeTab === "cashiers" && (
      <div className="rounded-lg border p-4">
        <h2 className="mb-4 text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          Cashier Shift Report
        </h2>
        {cashierReport === undefined ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : cashierReport.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No shifts found for the selected period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Cashier</th>
                  <th className="pb-2 font-medium">Branch</th>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Open</th>
                  <th className="pb-2 font-medium">Close</th>
                  <th className="pb-2 text-right font-medium">Change Fund</th>
                  <th className="pb-2 text-right font-medium">Cash</th>
                  <th className="pb-2 text-right font-medium">GCash</th>
                  <th className="pb-2 text-right font-medium">Maya</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                  <th className="pb-2 text-right font-medium">Txns</th>
                  <th className="pb-2 text-right font-medium">Voided</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {cashierPagination.paginatedData.map((row) => {
                  const openDate = new Date(row.openedAt);
                  const closeDate = row.closedAt ? new Date(row.closedAt) : null;
                  const fmt = (d: Date) =>
                    d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true });
                  const fmtDate = (d: Date) =>
                    d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
                  return (
                    <tr key={String(row.shiftId)} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 font-medium">{row.cashierName}</td>
                      <td className="py-2 text-muted-foreground">{row.branchName}</td>
                      <td className="py-2 text-muted-foreground">{fmtDate(openDate)}</td>
                      <td className="py-2 tabular-nums">{fmt(openDate)}</td>
                      <td className="py-2 tabular-nums">
                        {closeDate ? fmt(closeDate) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatCentavos(row.changeFundCentavos)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatCentavos(row.cashSalesCentavos)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatCentavos(row.gcashSalesCentavos)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatCentavos(row.mayaSalesCentavos)}
                      </td>
                      <td className="py-2 text-right tabular-nums font-semibold">
                        {formatCentavos(row.totalSalesCentavos)}
                      </td>
                      <td className="py-2 text-right tabular-nums">{row.transactionCount}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {row.voidedCount > 0 ? row.voidedCount : "—"}
                      </td>
                      <td className="py-2">
                        {row.closeType === "endOfDay" ? (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                            End of Day
                          </span>
                        ) : row.closeType === "turnover" ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            Turnover
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2">
                        {row.status === "open" ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
                            Open
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            Closed
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <TablePagination
              currentPage={cashierPagination.currentPage}
              totalPages={cashierPagination.totalPages}
              totalItems={cashierPagination.totalItems}
              hasNextPage={cashierPagination.hasNextPage}
              hasPrevPage={cashierPagination.hasPrevPage}
              onNextPage={cashierPagination.nextPage}
              onPrevPage={cashierPagination.prevPage}
              noun="shift"
            />
          </div>
        )}
      </div>
      )}

    </div>
  );
}

"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";

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

// Format YYYYMMDD for display: "Feb 1, 2026"
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

// ─── Period preset helpers ────────────────────────────────────────────────────

type Preset = "thisMonth" | "lastMonth" | "thisQuarter" | "custom";

function getPresetDates(preset: "thisMonth" | "lastMonth" | "thisQuarter"): {
  start: string;
  end: string;
} {
  const now = new Date();
  const today = toYYYYMMDD(now);

  if (preset === "thisMonth") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: toYYYYMMDD(start), end: today };
  }

  if (preset === "lastMonth") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month
    return { start: toYYYYMMDD(start), end: toYYYYMMDD(end) };
  }

  // thisQuarter: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
  const quarter = Math.floor(now.getMonth() / 3);
  const quarterStart = new Date(now.getFullYear(), quarter * 3, 1);
  return { start: toYYYYMMDD(quarterStart), end: today };
}

// ─── CSV download helper ──────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function BirVatReportPage() {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [dateStart, setDateStart] = useState(toYYYYMMDD(thisMonthStart));
  const [dateEnd, setDateEnd] = useState(toYYYYMMDD(now));
  const [activePreset, setActivePreset] = useState<Preset>("thisMonth");

  function applyPreset(preset: "thisMonth" | "lastMonth" | "thisQuarter") {
    const { start, end } = getPresetDates(preset);
    setDateStart(start);
    setDateEnd(end);
    setActivePreset(preset);
  }

  const summary = useQuery(api.dashboards.birReports.getBirVatSummary, {
    dateStart,
    dateEnd,
  });

  function handleDownloadCsv() {
    if (!summary) return;
    const rows = [
      ["BIR VAT Summary Report"],
      ["Period", `${formatDisplayDate(dateStart)} – ${formatDisplayDate(dateEnd)}`],
      [],
      ["Line Item", "Amount (PHP)"],
      ["Gross Sales", (summary.totalSalesCentavos / 100).toFixed(2)],
      [
        "Less: Senior/PWD Discounts",
        (summary.totalSeniorPwdDiscountCentavos / 100).toFixed(2),
      ],
      ["Net Taxable Sales", (summary.netTaxableSalesCentavos / 100).toFixed(2)],
      ["Output VAT (12%)", (summary.totalVatCentavos / 100).toFixed(2)],
      ["Number of Transactions", String(summary.txnCount)],
    ];
    downloadCsv(
      `BIR-VAT-${dateStart}-${dateEnd}.csv`,
      rows
    );
  }

  const presets: { key: "thisMonth" | "lastMonth" | "thisQuarter"; label: string }[] = [
    { key: "thisMonth", label: "This Month" },
    { key: "lastMonth", label: "Last Month" },
    { key: "thisQuarter", label: "This Quarter" },
  ];

  return (
    <>
      {/* Print-only styles */}
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
          <div className="flex items-center gap-3">
            <Link
              href="/admin/reports"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Reports
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadCsv}
              disabled={!summary}
              className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Download CSV
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold">BIR VAT Summary</h1>
          <p className="text-sm text-muted-foreground">
            Monthly/quarterly VAT summary for BIR filing
          </p>
        </div>

        {/* Period selector */}
        <div className="rounded-lg border p-4 space-y-4 no-print">
          <h2 className="text-sm font-semibold">Reporting Period</h2>
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
          </div>
        </div>

        {/* Report header (visible in print) */}
        <div className="print-only text-center pb-4 border-b">
          <h2 className="text-xl font-bold">BIR VAT Summary Report</h2>
          <p className="text-sm">
            Period: {formatDisplayDate(dateStart)} – {formatDisplayDate(dateEnd)}
          </p>
        </div>

        {/* Summary metric cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            {
              label: "Gross Sales",
              value: summary?.totalSalesCentavos,
              format: formatCentavos,
            },
            {
              label: "Output VAT (12%)",
              value: summary?.totalVatCentavos,
              format: formatCentavos,
            },
            {
              label: "Senior/PWD Discounts",
              value: summary?.totalSeniorPwdDiscountCentavos,
              format: formatCentavos,
            },
            {
              label: "Transactions",
              value: summary?.txnCount,
              format: (v: number) => v.toLocaleString(),
            },
          ].map((card) => (
            <div key={card.label} className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              {card.value === undefined ? (
                <div className="mt-1 h-7 animate-pulse rounded bg-muted" />
              ) : (
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {card.format(card.value)}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* BIR-formatted VAT return table */}
        <div className="rounded-lg border p-4">
          <h2 className="mb-4 text-sm font-semibold">VAT Return Summary</h2>
            {summary === undefined ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Line Item</th>
                    <th className="pb-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2">Gross Sales</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatCentavos(summary.totalSalesCentavos)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pl-4 text-muted-foreground">
                      Less: Senior/PWD Discounts
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      ({formatCentavos(summary.totalSeniorPwdDiscountCentavos)})
                    </td>
                  </tr>
                  <tr className="border-b font-medium">
                    <td className="py-2">Net Taxable Sales</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatCentavos(summary.netTaxableSalesCentavos)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">Output VAT (12%)</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatCentavos(summary.totalVatCentavos)}
                    </td>
                  </tr>
                  <tr className="border-b text-muted-foreground">
                    <td className="py-2">Number of Transactions</td>
                    <td className="py-2 text-right tabular-nums">
                      {summary.txnCount.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
        </div>
      </div>
    </>
  );
}

"use client";

// app/admin/movement-report/page.tsx — the stock card, one store, one month.
//
// This is the report the business already reads, in the column order it
// already reads it in. RDI could import that file from the old system and
// never produce it; this produces it from what RDI recorded.
//
// The two honest things on the page:
//
//   The balances are derived. Nothing stores a month-end snapshot, so the
//   current month ends on today's shelf figure and an earlier month is unwound
//   back to it. The header says which, every time.
//
//   A negative beginning balance is not hidden. Stock cannot have been below
//   zero, so each one is a movement the system never saw, and the count sits at
//   the top rather than being clamped away.

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeftRight, Download, FileSpreadsheet, AlertTriangle } from "lucide-react";

function num(value: number): string {
  return value.toLocaleString("en-PH");
}

/** A movement column: zero is nothing, so it reads as a dash. */
function cell(value: number): string {
  return value === 0 ? "—" : num(value);
}

function readablePeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Kpi({ label, value, foot, tone }: {
  label: string;
  value: string;
  foot?: string;
  tone?: "bad" | "warn";
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-xl font-semibold tabular-nums",
          tone === "bad" && "text-red-600",
          tone === "warn" && "text-amber-600"
        )}
      >
        {value}
      </p>
      {foot && <p className="text-[11px] text-muted-foreground">{foot}</p>}
    </div>
  );
}

export default function MovementReportPage() {
  const meta = useQuery(api.inventory.movementReport.listMovementPeriods);

  const [period, setPeriod] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [brandId, setBrandId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [includeIdle, setIncludeIdle] = useState(false);

  const brands = useQuery(api.catalog.brands.listBrands) as
    | { _id: string; name: string; isActive: boolean }[]
    | undefined;

  // Default to the newest month and the first store the caller may read.
  const activePeriod = period ?? meta?.current ?? null;
  const activeBranchId = branchId ?? (meta?.branches[0]?._id as string | undefined) ?? null;

  const report = useQuery(
    api.inventory.movementReport.getStockMovementReport,
    activePeriod && activeBranchId
      ? {
          period: activePeriod,
          branchId: activeBranchId as Id<"branches">,
          ...(brandId !== "all" ? { brandId: brandId as Id<"brands"> } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(includeIdle ? { includeIdle: true } : {}),
        }
      : "skip"
  );

  const selectClass = "rounded-md border bg-background px-2 py-1 text-xs";

  function exportCsv() {
    if (!report) return;
    downloadCsv(
      `stock-movement-${report.branchName.replace(/\s+/g, "-").toLowerCase()}-${report.period}.csv`,
      [
        ["Store", report.branchName],
        ["Period", report.period],
        ["Balances", report.basis === "live"
          ? "Ending balance is the current shelf figure"
          : "Ending balance unwound from the current shelf figure"],
        [],
        ["ProductCode", "ProductDesc", "Size", "Color", "Brand", "BeginningInv",
         "Sale", "Container", "Return", "MovementOut", "MovementIn", "RPO",
         "EndingBalance", "UploadedEndingBalance", "Variance"],
        ...report.rows.map((row) => [
          row.sku, row.productName, row.size, row.color, row.brandName ?? "",
          row.beginningInv, row.sale, row.container, row.customerReturn,
          row.movementOut, row.movementIn, row.rpo, row.endingBalance,
          row.uploadedEndingBalance ?? "", row.variance ?? "",
        ]),
        [],
        ["TOTAL", "", "", "", "", report.totals.beginningInv, report.totals.sale,
         report.totals.container, report.totals.customerReturn,
         report.totals.movementOut, report.totals.movementIn, report.totals.rpo,
         report.totals.endingBalance, "", ""],
      ]
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Inventory Movement</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          One row per product per month for one store: what it opened with, what
          moved, and what it closed with. The same columns as the file from the
          old system.
        </p>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Period</span>
          <select
            value={activePeriod ?? ""}
            onChange={(e) => setPeriod(e.target.value)}
            className={selectClass}
          >
            {(meta?.periods ?? []).map((p) => (
              <option key={p.period} value={p.period}>
                {readablePeriod(p.period)}
                {p.hasUpload ? " · uploaded" : ""}
              </option>
            ))}
          </select>
        </label>

        {meta?.canPickBranch ? (
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Store</span>
            <select
              value={activeBranchId ?? ""}
              onChange={(e) => setBranchId(e.target.value)}
              className={cn(selectClass, "max-w-[12rem] truncate")}
            >
              {(meta?.branches ?? []).map((b) => (
                <option key={b._id as string} value={b._id as string}>{b.name}</option>
              ))}
            </select>
          </label>
        ) : (
          meta && (
            <span className="text-xs text-muted-foreground">
              Store {meta.branches[0]?.name ?? "—"}
            </span>
          )
        )}

        <label className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Brand</span>
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className={cn(selectClass, "max-w-[10rem] truncate")}
          >
            <option value="all">All</option>
            {(brands ?? [])
              .filter((b) => b.isActive)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((b) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
          </select>
        </label>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="SKU or product"
          className="h-7 w-44 text-xs"
        />

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={includeIdle}
            onChange={(e) => setIncludeIdle(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300"
          />
          Show products with no movement and no stock
        </label>

        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={!report || report.rows.length === 0}
          onClick={exportCsv}
        >
          <Download className="mr-1.5 h-4 w-4" />
          CSV
        </Button>
      </div>

      {report === undefined ? (
        <div className="h-64 animate-pulse rounded-lg border bg-muted/40" />
      ) : (
        <>
          {/* ── How to read the balances ──────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="font-normal">
              {report.branchName} · {readablePeriod(report.period)}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "font-normal",
                report.basis === "live"
                  ? "border-emerald-500 text-emerald-700"
                  : "border-sky-500 text-sky-700"
              )}
            >
              {report.basis === "live"
                ? "Ending balance is today's shelf figure"
                : "Ending balance unwound from today's shelf figure"}
            </Badge>
            {report.hasUpload && (
              <Badge variant="outline" className="border-amber-500 font-normal text-amber-800">
                <FileSpreadsheet className="mr-1 h-3 w-3" />
                {report.uploadedRowCount} uploaded row
                {report.uploadedRowCount === 1 ? "" : "s"} for this month
              </Badge>
            )}
          </div>

          {/* ── Totals ───────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            <Kpi label="Beginning" value={num(report.totals.beginningInv)}
                 foot={`${report.totals.products} products`} />
            <Kpi label="In" value={num(report.totals.unitsIn)}
                 foot={`${num(report.totals.container)} container · ${num(report.totals.movementIn)} movement`} />
            <Kpi label="Out" value={num(report.totals.unitsOut)}
                 foot={`${num(report.totals.sale)} sold · ${num(report.totals.rpo)} RPO`} />
            <Kpi label="Net change"
                 value={`${report.totals.netChange >= 0 ? "+" : ""}${num(report.totals.netChange)}`} />
            <Kpi label="Ending" value={num(report.totals.endingBalance)} />
            <Kpi
              label="Needs explaining"
              value={num(report.totals.negativeBeginning + report.totals.variances)}
              foot={`${report.totals.negativeBeginning} impossible · ${report.totals.variances} variance`}
              tone={
                report.totals.negativeBeginning > 0
                  ? "bad"
                  : report.totals.variances > 0
                    ? "warn"
                    : undefined
              }
            />
          </div>

          {report.totals.negativeBeginning > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/60 p-3 text-xs text-red-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <span className="font-medium">
                  {report.totals.negativeBeginning} product
                  {report.totals.negativeBeginning === 1 ? "" : "s"} opened below zero.
                </span>{" "}
                Stock cannot have been negative, so each one is stock that changed
                hands without a movement being recorded — a count correction, or a
                receipt booked outside the system. The rows are marked below.
              </p>
            </div>
          )}

          {report.truncated && (
            <p className="text-xs text-amber-700">
              Only the first rows are shown. Narrow by brand or search to see the rest.
            </p>
          )}

          {/* ── The card ─────────────────────────────────────────────────── */}
          {report.rows.length === 0 ? (
            <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
              Nothing moved and nothing was held in this month.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Begin</TableHead>
                    <TableHead className="text-right">Sale</TableHead>
                    <TableHead className="text-right">Container</TableHead>
                    <TableHead className="text-right">Return</TableHead>
                    <TableHead className="text-right">Mv Out</TableHead>
                    <TableHead className="text-right">Mv In</TableHead>
                    <TableHead className="text-right">RPO</TableHead>
                    <TableHead className="text-right">Ending</TableHead>
                    {report.hasUpload && (
                      <TableHead className="text-right">Uploaded</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={row.variantId as string}>
                      <TableCell>
                        <p className="font-mono text-xs">{row.sku}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.productName}
                          {(row.size || row.color) && (
                            <span> · {[row.size, row.color].filter(Boolean).join("/")}</span>
                          )}
                        </p>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          row.beginningInv < 0 && "font-medium text-red-600"
                        )}
                        title={
                          row.beginningInv < 0
                            ? "Stock cannot have been negative — a movement was never recorded"
                            : undefined
                        }
                      >
                        {num(row.beginningInv)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{cell(row.sale)}</TableCell>
                      <TableCell className="text-right tabular-nums">{cell(row.container)}</TableCell>
                      <TableCell className="text-right tabular-nums">{cell(row.customerReturn)}</TableCell>
                      <TableCell className="text-right tabular-nums">{cell(row.movementOut)}</TableCell>
                      <TableCell className="text-right tabular-nums">{cell(row.movementIn)}</TableCell>
                      <TableCell className="text-right tabular-nums">{cell(row.rpo)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {num(row.endingBalance)}
                      </TableCell>
                      {report.hasUpload && (
                        <TableCell className="text-right tabular-nums">
                          {row.uploadedEndingBalance === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <>
                              {num(row.uploadedEndingBalance)}
                              {row.variance !== null && row.variance !== 0 && (
                                <span
                                  className="ml-1 text-[11px] text-amber-700"
                                  title="Uploaded figure less the computed one"
                                >
                                  ({row.variance > 0 ? "+" : ""}{num(row.variance)})
                                </span>
                              )}
                              {row.uploadDoesNotClose && (
                                <span
                                  className="ml-1 text-[11px] text-red-700"
                                  title="The uploaded row's own columns do not add up"
                                >
                                  ✕
                                </span>
                              )}
                            </>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
                <TableBody>
                  <TableRow className="border-t-2 bg-muted/40 font-medium">
                    <TableCell>Total · {report.totals.products} products</TableCell>
                    <TableCell className="text-right tabular-nums">{num(report.totals.beginningInv)}</TableCell>
                    <TableCell className="text-right tabular-nums">{cell(report.totals.sale)}</TableCell>
                    <TableCell className="text-right tabular-nums">{cell(report.totals.container)}</TableCell>
                    <TableCell className="text-right tabular-nums">{cell(report.totals.customerReturn)}</TableCell>
                    <TableCell className="text-right tabular-nums">{cell(report.totals.movementOut)}</TableCell>
                    <TableCell className="text-right tabular-nums">{cell(report.totals.movementIn)}</TableCell>
                    <TableCell className="text-right tabular-nums">{cell(report.totals.rpo)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(report.totals.endingBalance)}</TableCell>
                    {report.hasUpload && <TableCell />}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Ending = Begin + Container + Return + Mv In − Sale − Mv Out − RPO.
            Transfers count on the day they were received, so one transfer leaves
            the sender and reaches the receiver in the same month; stock on a
            truck is still the sender&apos;s balance. In is what was counted in,
            Out is what was packed — where they disagree, units went missing in
            transit and the Logistics Report prices the gap.
          </p>
        </>
      )}
    </div>
  );
}

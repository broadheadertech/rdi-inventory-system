"use client";

// app/warehouse/logistics-report/page.tsx — what the chain actually did.
//
// Four sections, because logistics gets asked four questions and the system
// could answer none of them: did what was packed arrive, where do the days go,
// are the differences counting errors or real loss, and how much moved.
//
// Accuracy is first and is open by default. It is the one with money attached,
// and it is the one that had no answer anywhere in RDI before this page.
//
// Each section exports to CSV, because the figures get argued about in a
// meeting and nobody argues from a screenshot.

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { downloadCsv, csvAmount, csvPercent, reportFilename } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart3, Download, Timer, Scale, Truck, AlertTriangle, Handshake,
} from "lucide-react";

// ─── Dates ───────────────────────────────────────────────────────────────────

function toYmd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
function toInputDate(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}
function fromInputDate(value: string): string {
  return value.replace(/-/g, "");
}
function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

const PRESETS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
];

// ─── Small pieces ────────────────────────────────────────────────────────────

function num(value: number): string {
  return value.toLocaleString("en-PH");
}

function pct(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

/**
 * A duration. Zero is a real answer — an auto-approved request takes no time
 * at all — so it reads "0h" and never a dash. The dash belongs to stages that
 * were never recorded, which the caller decides from measuredOn; the two must
 * not look alike or a gap in the data reads as instant work.
 */
function hrs(value: number): string {
  if (value < 24) return `${value.toFixed(1)}h`;
  return `${(value / 24).toFixed(1)}d`;
}

function Kpi({
  label,
  value,
  foot,
  tone,
}: {
  label: string;
  value: string;
  foot?: string;
  tone?: "good" | "bad" | "warn";
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "good" && "text-emerald-600",
          tone === "bad" && "text-red-600",
          tone === "warn" && "text-amber-600"
        )}
      >
        {value}
      </p>
      {foot && <p className="mt-0.5 text-xs text-muted-foreground">{foot}</p>}
    </div>
  );
}

function Section({
  title,
  icon,
  blurb,
  onExport,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  blurb: string;
  onExport?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="mr-auto">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {icon}
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{blurb}</p>
        </div>
        {onExport && (
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="mr-1.5 h-4 w-4" />
            CSV
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ line }: { line: string }) {
  return (
    <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
      {line}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LogisticsReportPage() {
  const [dateStart, setDateStart] = useState(toYmd(daysAgo(90)));
  const [dateEnd, setDateEnd] = useState(toYmd(new Date()));
  const [fromBranchId, setFromBranchId] = useState<string>("all");
  const [toBranchId, setToBranchId] = useState<string>("all");

  const report = useQuery(api.analytics.logisticsReport.getLogisticsReport, {
    dateStart,
    dateEnd,
    ...(fromBranchId !== "all" ? { fromBranchId: fromBranchId as Id<"branches"> } : {}),
    ...(toBranchId !== "all" ? { toBranchId: toBranchId as Id<"branches"> } : {}),
  });

  function applyPreset(days: number) {
    setDateStart(toYmd(daysAgo(days)));
    setDateEnd(toYmd(new Date()));
  }

  const branches = report?.branches ?? [];
  const selectClass = "rounded-md border bg-background px-2 py-1 text-xs";

  return (
    <div className="space-y-8 p-6">
      <div>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Logistics Report</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Accuracy, cycle time, disputes and throughput across the transfer
          chain. Measured on transfers received in the window.
        </p>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset.days)}
              className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {preset.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">From</span>
          <input
            type="date"
            value={toInputDate(dateStart)}
            onChange={(e) => setDateStart(fromInputDate(e.target.value))}
            className={selectClass}
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">To</span>
          <input
            type="date"
            value={toInputDate(dateEnd)}
            onChange={(e) => setDateEnd(fromInputDate(e.target.value))}
            className={selectClass}
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Source</span>
          <select
            value={fromBranchId}
            onChange={(e) => setFromBranchId(e.target.value)}
            className={cn(selectClass, "max-w-[11rem] truncate")}
          >
            <option value="all">All</option>
            {branches.map((b) => (
              <option key={b._id as string} value={b._id as string}>{b.name}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Destination</span>
          <select
            value={toBranchId}
            onChange={(e) => setToBranchId(e.target.value)}
            className={cn(selectClass, "max-w-[11rem] truncate")}
          >
            <option value="all">All</option>
            {branches.map((b) => (
              <option key={b._id as string} value={b._id as string}>{b.name}</option>
            ))}
          </select>
        </label>
      </div>

      {report === undefined ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg border bg-muted/40" />
          ))}
        </div>
      ) : (
        <>
          {/* ── 1. Accuracy ──────────────────────────────────────────────── */}
          <Section
            title="Accuracy and shrink"
            icon={<Scale className="h-4 w-4 text-muted-foreground" />}
            blurb="What was packed against what was scanned in. Short and over are counted separately — two short on one SKU and two over on another is two mistakes, not a clean transfer."
            onExport={
              report.accuracy.lanes.length > 0
                ? () =>
                    downloadCsv(
                      reportFilename("logistics-accuracy", dateStart, dateEnd),
                      [
                        ["From", "To", "Transfers", "Packed units", "Received units",
                         "Short", "Over", "Accuracy %", "Damaged lines", "Boxes",
                         "Flagged boxes", "Wrong-item scans", "Unknown codes",
                         "Short value", "Unvalued short units", "Disputed transfers",
                         "Median total hours"],
                        ...report.accuracy.lanes.map((lane) => [
                          lane.fromBranchName, lane.toBranchName, lane.transfers,
                          lane.packedUnits, lane.receivedUnits, lane.shortUnits,
                          lane.overUnits, csvPercent(lane.accuracyPercent),
                          lane.damagedLines, lane.boxCount, lane.flaggedBoxes,
                          lane.wrongItemScans, lane.unknownCodeScans,
                          csvAmount(lane.shortValueCentavos), lane.unvaluedShortUnits,
                          lane.disputedTransfers, lane.medianTotalHours,
                        ]),
                      ]
                    )
                : undefined
            }
          >
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi
                label="Arrived as packed"
                value={pct(report.accuracy.accuracyPercent)}
                foot={`${num(report.accuracy.receivedUnits)} of ${num(report.accuracy.packedUnits)} units`}
                tone={
                  report.accuracy.accuracyPercent === null
                    ? undefined
                    : report.accuracy.accuracyPercent >= 99.5
                      ? "good"
                      : report.accuracy.accuracyPercent >= 97
                        ? "warn"
                        : "bad"
                }
              />
              <Kpi
                label="Short"
                value={num(report.accuracy.shortUnits)}
                foot={
                  report.accuracy.shortValueCentavos > 0
                    ? `${formatCurrency(report.accuracy.shortValueCentavos)} at cost` +
                      (report.accuracy.unvaluedShortUnits > 0
                        ? ` · ${num(report.accuracy.unvaluedShortUnits)} units have no cost price`
                        : "")
                    : report.accuracy.unvaluedShortUnits > 0
                      ? `${num(report.accuracy.unvaluedShortUnits)} units have no cost price`
                      : "nothing missing"
                }
                tone={report.accuracy.shortUnits > 0 ? "bad" : "good"}
              />
              <Kpi
                label="Over and damaged"
                value={`${num(report.accuracy.overUnits)} / ${num(report.accuracy.damagedLines)}`}
                foot="units over · lines damaged"
                tone={
                  report.accuracy.overUnits + report.accuracy.damagedLines > 0
                    ? "warn"
                    : undefined
                }
              />
              <Kpi
                label="Clean transfers"
                value={
                  report.accuracy.transfers === 0
                    ? "—"
                    : `${report.accuracy.cleanTransfers} of ${report.accuracy.transfers}`
                }
                foot={`${report.accuracy.disputedTransfers} raised a dispute`}
              />
            </div>

            {(report.accuracy.wrongItemScans > 0 || report.accuracy.unknownCodeScans > 0) && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  <span className="font-medium">
                    {num(report.accuracy.wrongItemScans)} wrong-item scan
                    {report.accuracy.wrongItemScans === 1 ? "" : "s"}
                  </span>
                  {report.accuracy.unknownCodeScans > 0 && (
                    <> and {num(report.accuracy.unknownCodeScans)} unrecognised code
                      {report.accuracy.unknownCodeScans === 1 ? "" : "s"}</>
                  )}
                  {" "}were refused at receiving. A run of these in one lane is the
                  sign of boxes packed into the wrong shipment.
                </p>
              </div>
            )}

            {report.accuracy.lanes.length === 0 ? (
              <Empty line="No transfers were received in this window." />
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lane</TableHead>
                      <TableHead className="text-right">Transfers</TableHead>
                      <TableHead className="text-right">Packed</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                      <TableHead className="text-right">Short</TableHead>
                      <TableHead className="text-right">Over</TableHead>
                      <TableHead className="text-right">Accuracy</TableHead>
                      <TableHead className="text-right">Short value</TableHead>
                      <TableHead className="text-right">Flagged</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.accuracy.lanes.map((lane) => (
                      <TableRow key={lane.laneKey}>
                        <TableCell>
                          <span className="font-medium">{lane.fromBranchName}</span>
                          <span className="text-muted-foreground"> to </span>
                          <span className="font-medium">{lane.toBranchName}</span>
                          {lane.disputedTransfers > 0 && (
                            <p className="mt-0.5 text-[11px] text-red-700">
                              {lane.disputedTransfers} disputed
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{lane.transfers}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(lane.packedUnits)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(lane.receivedUnits)}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            lane.shortUnits > 0 && "font-medium text-red-600"
                          )}
                        >
                          {lane.shortUnits > 0 ? num(lane.shortUnits) : "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            lane.overUnits > 0 && "text-amber-700"
                          )}
                        >
                          {lane.overUnits > 0 ? num(lane.overUnits) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pct(lane.accuracyPercent)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {lane.shortValueCentavos > 0
                            ? formatCurrency(lane.shortValueCentavos)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {lane.flaggedBoxes > 0 ? `${lane.flaggedBoxes}/${lane.boxCount}` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Section>

          {/* ── 2. Cycle time ────────────────────────────────────────────── */}
          <Section
            title="Cycle time"
            icon={<Timer className="h-4 w-4 text-muted-foreground" />}
            blurb="Where the days go, stage by stage. The three handshake stages are custody changing hands — nothing measured them before. A stage measured on fewer transfers than the total is a recording gap, not a fast stage."
            onExport={() =>
              downloadCsv(
                reportFilename("logistics-cycle-time", dateStart, dateEnd),
                [
                  ["Stage", "Handshake", "Measured on", "Of transfers", "Avg hours",
                   "Median hours", "p90 hours", "Max hours"],
                  ...report.cycleTime.stages.map((stage) => [
                    stage.label, stage.handshake ? "yes" : "no", stage.measuredOn,
                    stage.ofTransfers, stage.avgHours, stage.medianHours,
                    stage.p90Hours, stage.maxHours,
                  ]),
                ]
              )
            }
          >
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Median</TableHead>
                    <TableHead className="text-right">p90</TableHead>
                    <TableHead className="text-right">Max</TableHead>
                    <TableHead className="text-right">Measured on</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.cycleTime.stages.map((stage) => {
                    const isTotal = stage.key === "total";
                    const missing = stage.ofTransfers - stage.measuredOn;
                    return (
                      <TableRow
                        key={stage.key}
                        className={cn(isTotal && "border-t-2 bg-muted/40 font-medium")}
                      >
                        <TableCell>
                          <span className="flex items-center gap-1.5">
                            {stage.handshake && (
                              <Handshake className="h-3.5 w-3.5 shrink-0 text-sky-600" />
                            )}
                            {stage.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {stage.measuredOn === 0 ? "—" : hrs(stage.medianHours)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {stage.measuredOn === 0 ? "—" : hrs(stage.p90Hours)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {stage.measuredOn === 0 ? "—" : hrs(stage.maxHours)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {stage.measuredOn}
                          {missing > 0 && stage.ofTransfers > 0 && (
                            <span className="ml-1 text-[11px] text-amber-700">
                              ({missing} unrecorded)
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {report.cycleTime.slowestLanes.length > 0 && (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Slowest lanes, end to end</TableHead>
                      <TableHead className="text-right">Transfers</TableHead>
                      <TableHead className="text-right">Median</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.cycleTime.slowestLanes.map((lane) => (
                      <TableRow key={`${lane.fromBranchName}-${lane.toBranchName}`}>
                        <TableCell>
                          {lane.fromBranchName}
                          <span className="text-muted-foreground"> to </span>
                          {lane.toBranchName}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{lane.transfers}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {hrs(lane.medianTotalHours)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Section>

          {/* ── 3. Disputes ──────────────────────────────────────────────── */}
          <Section
            title="Dispute ledger"
            icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
            blurb="Open differences are counted wherever they were raised — an unanswered one from two months ago is still unanswered. Settled figures are bounded by the window."
            onExport={
              report.disputes.byCause.length > 0 || report.disputes.openNow > 0
                ? () =>
                    downloadCsv(
                      reportFilename("logistics-disputes", dateStart, dateEnd),
                      [
                        ["Measure", "Count", "Units difference"],
                        ["Open now", report.disputes.openNow, ""],
                        ["Raised in window", report.disputes.raisedInWindow, ""],
                        ["Settled in window", report.disputes.settledInWindow, ""],
                        ...report.disputes.ageing.map((b) => [
                          `Open: ${b.label}`, b.count, b.unitsDifference,
                        ]),
                        ...report.disputes.byCause.map((c) => [
                          `Settled: ${c.label}`, c.count, c.unitsDifference,
                        ]),
                        ...report.disputes.byStage.map((s) => [
                          `Raised at: ${s.label}`, s.count, "",
                        ]),
                      ]
                    )
                : undefined
            }
          >
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi
                label="Open now"
                value={num(report.disputes.openNow)}
                foot={
                  report.disputes.openNow > 0
                    ? `oldest is ${report.disputes.oldestOpenDays} days old`
                    : "nothing outstanding"
                }
                tone={report.disputes.openNow > 0 ? "bad" : "good"}
              />
              <Kpi label="Raised in window" value={num(report.disputes.raisedInWindow)} />
              <Kpi label="Settled in window" value={num(report.disputes.settledInWindow)} />
              <Kpi
                label="Median time to settle"
                value={
                  report.disputes.medianDaysToSettle === null
                    ? "—"
                    : `${report.disputes.medianDaysToSettle}d`
                }
                foot="raised to settled"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border">
                <p className="border-b px-3 py-2 text-xs font-medium">
                  Open, by age
                </p>
                {report.disputes.openNow === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    No open receiving disputes.
                  </p>
                ) : (
                  <div className="divide-y">
                    {report.disputes.ageing.map((bucket) => (
                      <div
                        key={bucket.label}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                      >
                        <span
                          className={cn(
                            bucket.label === "Over 30 days" && bucket.count > 0 && "text-red-700"
                          )}
                        >
                          {bucket.label}
                        </span>
                        <span className="tabular-nums">
                          {bucket.count}
                          {bucket.unitsDifference !== 0 && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {bucket.unitsDifference > 0 ? "+" : ""}
                              {bucket.unitsDifference} units
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border">
                <p className="border-b px-3 py-2 text-xs font-medium">
                  Settled, by what it turned out to be
                </p>
                {report.disputes.byCause.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    Nothing was settled in this window.
                  </p>
                ) : (
                  <div className="divide-y">
                    {report.disputes.byCause.map((cause) => (
                      <div
                        key={cause.key}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                      >
                        <span
                          className={cn(
                            (cause.key === "writtenOff" || cause.key === "chargedToStaff") &&
                              "text-red-700"
                          )}
                        >
                          {cause.label}
                        </span>
                        <span className="tabular-nums">
                          {cause.count}
                          {cause.unitsDifference !== 0 && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {cause.unitsDifference > 0 ? "+" : ""}
                              {cause.unitsDifference} units
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
                  Counting error is a training problem. Written off and charged to
                  staff are real loss.
                </p>
              </div>
            </div>
          </Section>

          {/* ── 4. Throughput ────────────────────────────────────────────── */}
          <Section
            title="Throughput and fill"
            icon={<Truck className="h-4 w-4 text-muted-foreground" />}
            blurb="Requests raised against what landed, and what the chain is holding right now. In-transit stock is off a source shelf and not yet on a destination one."
            onExport={
              report.throughput.pushes.length > 0
                ? () =>
                    downloadCsv(
                      reportFilename("logistics-allocation-fill", dateStart, dateEnd),
                      [
                        ["File", "Requests", "Branches", "Requested units",
                         "Delivered units", "Fill %", "Still open", "Rejected"],
                        ...report.throughput.pushes.map((push) => [
                          push.fileName, push.transfers, push.branches,
                          push.requestedUnits, push.deliveredUnits,
                          csvPercent(push.fillPercent), push.stillOpen, push.rejected,
                        ]),
                      ]
                    )
                : undefined
            }
          >
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi
                label="Requests raised"
                value={num(report.throughput.raised)}
                foot={report.throughput.raisedByType
                  .filter((t) => t.count > 0)
                  .map((t) => `${t.count} ${t.label.toLowerCase()}`)
                  .join(" · ") || "none"}
              />
              <Kpi
                label="Refused"
                value={pct(report.throughput.rejectionPercent)}
                foot={`${report.throughput.rejectedInWindow} rejected · ${report.throughput.cancelledInWindow} cancelled`}
                tone={
                  report.throughput.rejectionPercent !== null &&
                  report.throughput.rejectionPercent > 20
                    ? "warn"
                    : undefined
                }
              />
              <Kpi
                label="Units received"
                value={num(report.throughput.deliveredUnits)}
                foot={`over ${report.throughput.deliveredTransfers} transfer${report.throughput.deliveredTransfers === 1 ? "" : "s"}`}
              />
              <Kpi
                label="Held in transit now"
                value={num(report.throughput.inTransitUnits)}
                foot={
                  report.throughput.inTransitValueCentavos > 0
                    ? `${formatCurrency(report.throughput.inTransitValueCentavos)} at cost · ${report.throughput.openNow} open`
                    : `${report.throughput.openNow} open transfer${report.throughput.openNow === 1 ? "" : "s"}`
                }
              />
            </div>

            <div className="rounded-lg border">
              <p className="border-b px-3 py-2 text-xs font-medium">
                Allocation pushes raised in this window
              </p>
              {report.throughput.pushes.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No uploaded allocation was raised in this window.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File</TableHead>
                        <TableHead className="text-right">Branches</TableHead>
                        <TableHead className="text-right">Requested</TableHead>
                        <TableHead className="text-right">Delivered</TableHead>
                        <TableHead className="text-right">Fill</TableHead>
                        <TableHead className="text-right">Still open</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.throughput.pushes.map((push) => (
                        <TableRow key={push.fileName}>
                          <TableCell className="font-mono text-xs">{push.fileName}</TableCell>
                          <TableCell className="text-right tabular-nums">{push.branches}</TableCell>
                          <TableCell className="text-right tabular-nums">{num(push.requestedUnits)}</TableCell>
                          <TableCell className="text-right tabular-nums">{num(push.deliveredUnits)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {pct(push.fillPercent)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {push.stillOpen > 0 ? (
                              <Badge variant="outline" className="text-[10px]">
                                {push.stillOpen}
                              </Badge>
                            ) : (
                              "—"
                            )}
                            {push.rejected > 0 && (
                              <span className="ml-1 text-[11px] text-red-700">
                                {push.rejected} rejected
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

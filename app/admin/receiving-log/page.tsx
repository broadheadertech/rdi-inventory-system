"use client";

// app/admin/receiving-log/page.tsx — what each store took in, and when.
//
// Store, then day, then the deliveries of that day; click one to see the
// products inside it. The Inventory Movement report answers the month and the
// Logistics Report answers the lane — this answers "what landed at Cebu on the
// 3rd, and off whom", which neither could.
//
// Expected sits next to received on every line. The two disagreeing is the
// finding, not a detail: a short line is stock that left somewhere and arrived
// nowhere, and the date beside it is what makes it answerable.

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { downloadCsv, reportFilename } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronRight, Download, Inbox, PackageCheck, Truck, Store, AlertTriangle,
} from "lucide-react";

function toYmd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
function toInputDate(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}
function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}
/** YYYYMMDD → "Fri 3 Oct 2026". */
function readableYmd(ymd: string): string {
  return new Date(
    Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)))
  ).toLocaleDateString("en-PH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
function phtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}
function num(value: number): string {
  return value.toLocaleString("en-PH");
}

const KIND_ICON = {
  supplier: PackageCheck,
  container: Truck,
  movementIn: Store,
} as const;

const PRESETS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

export default function ReceivingLogPage() {
  const [dateStart, setDateStart] = useState(toYmd(daysAgo(30)));
  const [dateEnd, setDateEnd] = useState(toYmd(new Date()));
  const [branchId, setBranchId] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const log = useQuery(api.analytics.receivingLog.getReceivingLog, {
    dateStart,
    dateEnd,
    ...(branchId !== "all" ? { branchId: branchId as Id<"branches"> } : {}),
    ...(kind !== "all"
      ? { kind: kind as "supplier" | "container" | "movementIn" }
      : {}),
  });

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportCsv() {
    if (!log) return;
    downloadCsv(reportFilename("receiving-log", dateStart, dateEnd), [
      ["Store", "Date", "Time", "From", "Source", "Reference", "Received by",
       "SKU", "Product", "Expected", "Received", "Variance"],
      ...log.stores.flatMap((store) =>
        store.days.flatMap((day) =>
          day.events.flatMap((e) =>
            e.lines.map((line) => [
              store.branchName, readableYmd(day.date), phtTime(e.receivedAt),
              e.sourceName, e.kindLabel, e.reference, e.receiverName ?? "",
              line.sku, line.label, line.expected, line.received, line.variance,
            ])
          )
        )
      ),
    ]);
  }

  const selectClass = "rounded-md border bg-background px-2 py-1 text-xs";

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Inbox className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Receiving Log</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Every delivery into every store, by the day it was received. Open one
          to see the products in it and what was expected against what arrived.
        </p>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setDateStart(toYmd(daysAgo(p.days)));
                setDateEnd(toYmd(new Date()));
              }}
              className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">From</span>
          <input
            type="date"
            value={toInputDate(dateStart)}
            onChange={(e) => setDateStart(e.target.value.replace(/-/g, ""))}
            className={selectClass}
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">To</span>
          <input
            type="date"
            value={toInputDate(dateEnd)}
            onChange={(e) => setDateEnd(e.target.value.replace(/-/g, ""))}
            className={selectClass}
          />
        </label>
        {log?.canPickBranch !== false && (
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Store</span>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className={cn(selectClass, "max-w-[12rem] truncate")}
            >
              <option value="all">All</option>
              {(log?.branches ?? []).map((b) => (
                <option key={b._id as string} value={b._id as string}>{b.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Source</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={selectClass}
          >
            <option value="all">All</option>
            <option value="supplier">Supplier</option>
            <option value="container">Warehouse</option>
            <option value="movementIn">Another store</option>
          </select>
        </label>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={!log || log.totals.deliveries === 0}
          onClick={exportCsv}
        >
          <Download className="mr-1.5 h-4 w-4" />
          CSV
        </Button>
      </div>

      {log === undefined ? (
        <div className="h-64 animate-pulse rounded-lg border bg-muted/40" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Deliveries</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums">
                {num(log.totals.deliveries)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                into {log.totals.stores} store{log.totals.stores === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Units received</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums">
                {num(log.totals.unitsReceived)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                of {num(log.totals.unitsExpected)} expected
              </p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">With a variance</p>
              <p
                className={cn(
                  "mt-0.5 text-xl font-semibold tabular-nums",
                  log.totals.withVariance > 0 && "text-amber-600"
                )}
              >
                {num(log.totals.withVariance)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                arrived different from expected
              </p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">By source</p>
              <div className="mt-1 space-y-0.5">
                {log.totals.byKind.length === 0 ? (
                  <p className="text-xs text-muted-foreground">—</p>
                ) : (
                  log.totals.byKind.map((row) => (
                    <p key={row.kind} className="text-[11px] tabular-nums">
                      {row.label}: {row.deliveries} · {num(row.unitsReceived)} units
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>

          {log.truncated && (
            <p className="text-xs text-amber-700">
              Only the first deliveries are shown. Narrow the window or pick a
              store to see the rest.
            </p>
          )}

          {log.stores.length === 0 ? (
            <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
              Nothing was received in this window.
            </div>
          ) : (
            <div className="space-y-4">
              {log.stores.map((store) => (
                <div key={store.branchId as string} className="rounded-lg border">
                  <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
                    <h2 className="mr-auto text-sm font-semibold">
                      {store.branchName}
                    </h2>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {store.deliveries} deliver
                      {store.deliveries === 1 ? "y" : "ies"} ·{" "}
                      {num(store.unitsReceived)} of {num(store.unitsExpected)} units
                    </span>
                    {store.withVariance > 0 && (
                      <Badge
                        variant="outline"
                        className="border-amber-400 text-[10px] text-amber-700"
                      >
                        {store.withVariance} with a variance
                      </Badge>
                    )}
                  </div>

                  <div className="divide-y">
                    {store.days.map((day) => (
                      <div key={day.date}>
                        <div className="flex items-center gap-2 bg-background px-4 py-1.5">
                          <p className="mr-auto text-xs font-medium">
                            {readableYmd(day.date)}
                          </p>
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            {day.deliveries} in · {num(day.unitsReceived)} units
                          </span>
                        </div>

                        {day.events.map((event) => {
                          const Icon = KIND_ICON[event.kind];
                          const isOpen = open.has(event.id);
                          return (
                            <div key={event.id} className="border-t">
                              <button
                                type="button"
                                onClick={() => toggle(event.id)}
                                aria-expanded={isOpen}
                                className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-muted/40"
                              >
                                <ChevronRight
                                  className={cn(
                                    "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                                    isOpen && "rotate-90"
                                  )}
                                />
                                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1 truncate text-xs">
                                  <span className="font-medium">{event.sourceName}</span>
                                  <span className="text-muted-foreground">
                                    {" "}· {event.reference}
                                    {event.receiverName && <> · taken by {event.receiverName}</>}
                                  </span>
                                </span>
                                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                  {phtTime(event.receivedAt)}
                                </span>
                                <span
                                  className={cn(
                                    "shrink-0 text-xs tabular-nums",
                                    event.hasVariance && "font-medium text-amber-700"
                                  )}
                                >
                                  {num(event.unitsReceived)}/{num(event.unitsExpected)}
                                </span>
                                {event.hasVariance && (
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                                )}
                              </button>

                              {isOpen && (
                                <div className="bg-muted/20 px-4 pb-3 pt-1">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-left text-muted-foreground">
                                        <th className="py-1 font-medium">SKU</th>
                                        <th className="py-1 font-medium">Product</th>
                                        <th className="py-1 text-right font-medium">Expected</th>
                                        <th className="py-1 text-right font-medium">Received</th>
                                        <th className="py-1 text-right font-medium">Variance</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {event.lines.map((line) => (
                                        <tr key={line.sku} className="border-t">
                                          <td className="py-1 font-mono">{line.sku}</td>
                                          <td className="py-1 text-muted-foreground">
                                            {line.label}
                                          </td>
                                          <td className="py-1 text-right tabular-nums">
                                            {line.expected}
                                          </td>
                                          <td className="py-1 text-right tabular-nums">
                                            {line.received}
                                          </td>
                                          <td
                                            className={cn(
                                              "py-1 text-right tabular-nums",
                                              line.variance < 0 && "font-medium text-red-600",
                                              line.variance > 0 && "text-amber-700"
                                            )}
                                          >
                                            {line.variance === 0
                                              ? "—"
                                              : `${line.variance > 0 ? "+" : ""}${line.variance}`}
                                          </td>
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
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

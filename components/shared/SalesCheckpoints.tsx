"use client";

// components/shared/SalesCheckpoints.tsx — the trading day, now and before.
//
// One live figure for where the day stands, and under it the last thirty days
// read at the same fixed points: 12NN, 3PM, 6PM and close. Every reading is a
// running total from opening, so "as of 3PM" includes the morning — which is
// how the number is read on a shop floor.
//
// Nothing is stored or reset here. The figures are the transactions themselves,
// asked about a date, so at midnight the live card starts from zero while every
// earlier day stays exactly as it was. A register closing does not zero the
// card either — the trading day is the calendar date everywhere in this system.
// The register's state sits beside the figure instead, to say whether it is
// still moving.

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Circle, TrendingDown, TrendingUp } from "lucide-react";

type Channel =
  | "inline"
  | "online"
  | "outlet"
  | "popup"
  | "dtc"
  | "warehouse"
  | "outright";

function pesos(centavos: number): string {
  return `₱${Math.round(centavos / 100).toLocaleString("en-PH")}`;
}

/** Compact for a dense table — ₱412,500 reads as ₱412.5k. */
function pesosShort(centavos: number): string {
  const p = centavos / 100;
  if (Math.abs(p) >= 1000) return `₱${(p / 1000).toFixed(1)}k`;
  return `₱${Math.round(p).toLocaleString("en-PH")}`;
}

function ymdToDate(ymd: string): Date {
  return new Date(
    Date.UTC(
      Number(ymd.slice(0, 4)),
      Number(ymd.slice(4, 6)) - 1,
      Number(ymd.slice(6, 8))
    )
  );
}

/** YYYYMMDD → "Tue 16 Sep". */
function readableYmd(ymd: string): string {
  if (ymd.length !== 8) return ymd;
  return ymdToDate(ymd).toLocaleDateString("en-PH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** A PHT wall-clock time, e.g. "9:04 PM". */
function phtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

// ─── As of now ───────────────────────────────────────────────────────────────

function AsOfNowCard({
  branchId,
  channel,
}: {
  branchId?: Id<"branches">;
  channel?: Channel;
}) {
  const now = useQuery(api.dashboards.reportsV2.getSalesAsOfNow, {
    ...(branchId ? { branchId } : {}),
    ...(channel ? { channel } : {}),
  });

  if (now === undefined) {
    return <div className="h-[104px] animate-pulse rounded-lg border bg-muted/40" />;
  }

  const up = (now.changePercent ?? 0) >= 0;
  const allClosed = now.registersOpen === 0;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">As of Now</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {phtTime(now.asOfMs)}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-baseline gap-3">
        <p className="text-3xl font-semibold tabular-nums">{pesos(now.salesCentavos)}</p>
        {now.changePercent !== null && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-sm font-medium tabular-nums",
              up ? "text-emerald-600" : "text-red-600"
            )}
          >
            {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {up ? "+" : ""}
            {now.changePercent.toFixed(1)}%
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        {now.transactionCount.toLocaleString("en-PH")} transaction
        {now.transactionCount === 1 ? "" : "s"} ·{" "}
        {readableYmd(now.comparedTo)} at this hour {pesos(now.priorSalesCentavos)}
      </p>

      {/* Whether the figure is still moving. */}
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Circle
          className={cn(
            "h-2 w-2 shrink-0",
            allClosed ? "fill-muted-foreground text-muted-foreground" : "fill-emerald-500 text-emerald-500"
          )}
        />
        {allClosed ? (
          now.lastClosedAt ? (
            <>All registers closed · last at {phtTime(now.lastClosedAt)}</>
          ) : (
            <>No register opened today</>
          )
        ) : (
          <>
            {now.registersOpen} register{now.registersOpen === 1 ? "" : "s"} open
            {now.registersTotal > 1 ? ` of ${now.registersTotal} store${now.registersTotal === 1 ? "" : "s"}` : ""}
          </>
        )}
      </p>
    </div>
  );
}

// ─── The days before ─────────────────────────────────────────────────────────

function HistoryTable({
  days,
  branchId,
  channel,
}: {
  days: number;
  branchId?: Id<"branches">;
  channel?: Channel;
}) {
  const history = useQuery(api.dashboards.reportsV2.getCheckpointHistory, {
    days,
    ...(branchId ? { branchId } : {}),
    ...(channel ? { channel } : {}),
  });

  if (history === undefined) {
    return <div className="h-48 animate-pulse rounded-lg border bg-muted/40" />;
  }

  return (
    <div className="rounded-lg border">
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Day</th>
              {history.hours.map((h) => (
                <th key={h.hour} className="px-3 py-2 text-right font-medium">
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.days.map((row) => (
              <tr
                key={row.date}
                className={cn(
                  "border-b last:border-0",
                  row.isToday && "bg-primary/5 font-medium"
                )}
              >
                <td className="whitespace-nowrap px-3 py-1.5">
                  {row.isToday ? "Today" : readableYmd(row.date)}
                </td>
                {row.checkpoints.map((point) => (
                  <td
                    key={point.hour}
                    className={cn(
                      "px-3 py-1.5 text-right tabular-nums",
                      !point.reached && "text-muted-foreground/40"
                    )}
                    title={
                      point.reached
                        ? `${point.transactionCount.toLocaleString("en-PH")} transactions`
                        : "Not reached yet"
                    }
                  >
                    {point.reached ? pesosShort(point.salesCentavos) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── The card ────────────────────────────────────────────────────────────────

export function SalesCheckpoints({
  branchId,
  channel,
  days = 30,
  className,
  title = "Time Report",
}: {
  branchId?: Id<"branches">;
  channel?: Channel;
  /** How many trading days of history to show. */
  days?: number;
  className?: string;
  title?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">
          Running totals through the day · against the same weekday a week before
        </p>
      </div>
      <AsOfNowCard branchId={branchId} channel={channel} />
      <HistoryTable days={days} branchId={branchId} channel={channel} />
    </div>
  );
}

"use client";

// components/shared/SalesCheckpoints.tsx — the trading day, now and before.
//
// One card, closed by default: where the day stands right now, and whether the
// tills are still ringing. Click it and it opens onto the last thirty days read
// at the same fixed points — 12NN, 3PM, 6PM and close. Every reading is a
// running total from opening, so "as of 3PM" includes the morning, which is how
// the number is read on a shop floor.
//
// It sits first on the page because where the day stands is what a manager
// opens the screen to find out; it stays closed so it costs a glance, not a
// scroll. The history only loads once it is opened.
//
// Above the figure sits "Time Report for", with a brand and a location. The two
// are independent: one brand across every store, one store across every brand,
// or one of each. Under a brand the figures are summed from the matching lines
// rather than from receipt totals, because a receipt holding two brands cannot
// be attributed by its total; a receipt with no matching line drops out of the
// count rather than counting as a zero sale.
//
// Nothing is stored or reset here. The figures are the transactions themselves,
// asked about a date, so at midnight the card starts from zero while every
// earlier day stays exactly as it was. A register closing does not zero it
// either — the trading day is the calendar date everywhere in this system. The
// register's state sits beside the figure instead, to say whether it is still
// moving.

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { ChevronDown, Circle, TrendingDown, TrendingUp } from "lucide-react";

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

/** What both queries are being asked about. */
type Scope = {
  brandId?: Id<"brands">;
  branchId?: Id<"branches">;
  channel?: Channel;
};

const SELECT_CLASS =
  "max-w-[11rem] truncate rounded-md border bg-background px-2 py-1 text-xs font-medium";

// ─── The days before ─────────────────────────────────────────────────────────
// Its own component so the query only runs once the card is opened.

function HistoryTable({ days, scope }: { days: number; scope: Scope }) {
  const history = useQuery(api.dashboards.reportsV2.getCheckpointHistory, {
    days,
    ...scope,
  });

  if (history === undefined) {
    return <div className="h-48 animate-pulse rounded-md border bg-muted/40" />;
  }

  return (
    <div className="rounded-md border">
      <div className="max-h-[360px] overflow-auto">
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
  brandId,
  branchId,
  channel,
  days = 30,
  className,
  title = "Time Report",
  showFilters = true,
}: {
  /** Starting brand. A page filter, which the card's own dropdown can change. */
  brandId?: Id<"brands">;
  branchId?: Id<"branches">;
  channel?: Channel;
  /** How many trading days of history to show once opened. */
  days?: number;
  className?: string;
  title?: string;
  /** False where the page's own filters are the only ones wanted. */
  showFilters?: boolean;
}) {
  const [open, setOpen] = useState(false);

  // The dropdowns start from whatever the page is filtered to and can then be
  // moved independently. When the page's own filter changes the card follows
  // it, so the two never sit silently disagreeing.
  const propBrand = (brandId as string | undefined) ?? "all";
  const propBranch = (branchId as string | undefined) ?? "all";

  const [pickedBrand, setPickedBrand] = useState(propBrand);
  const [pickedBranch, setPickedBranch] = useState(propBranch);
  const [fromProps, setFromProps] = useState({ brand: propBrand, branch: propBranch });

  if (fromProps.brand !== propBrand || fromProps.branch !== propBranch) {
    setFromProps({ brand: propBrand, branch: propBranch });
    if (fromProps.brand !== propBrand) setPickedBrand(propBrand);
    if (fromProps.branch !== propBranch) setPickedBranch(propBranch);
  }

  const filters = useQuery(
    api.dashboards.reportsV2.getTimeReportFilters,
    showFilters ? {} : "skip"
  );

  // A named store overrides an inherited channel rather than stacking with it:
  // "outlet stores" AND "this inline store in Manila" is nothing at all, and a
  // card reading ₱0 for that reason looks broken rather than empty.
  const scope: Scope = {
    ...(pickedBrand !== "all" ? { brandId: pickedBrand as Id<"brands"> } : {}),
    ...(pickedBranch !== "all"
      ? { branchId: pickedBranch as Id<"branches"> }
      : channel
        ? { channel }
        : {}),
  };

  const now = useQuery(api.dashboards.reportsV2.getSalesAsOfNow, scope);

  const up = (now?.changePercent ?? 0) >= 0;
  const allClosed = now ? now.registersOpen === 0 : false;
  const showLocation = (filters?.canPickLocation ?? false) && (filters?.branches.length ?? 0) > 1;
  const narrowed = pickedBrand !== "all" || pickedBranch !== "all";
  const brandName =
    pickedBrand === "all"
      ? null
      : (filters?.brands.find((b) => (b.id as string) === pickedBrand)?.name ?? null);

  return (
    <div className={cn("rounded-lg border", className)}>
      {showFilters && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5">
          <span className="text-xs font-medium text-muted-foreground">
            {title} for
          </span>

          <label className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Brand</span>
            <select
              value={pickedBrand}
              onChange={(e) => setPickedBrand(e.target.value)}
              className={SELECT_CLASS}
              aria-label="Brand"
            >
              <option value="all">All</option>
              {(filters?.brands ?? []).map((b) => (
                <option key={b.id as string} value={b.id as string}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          {showLocation && (
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Location</span>
              <select
                value={pickedBranch}
                onChange={(e) => setPickedBranch(e.target.value)}
                className={SELECT_CLASS}
                aria-label="Location"
              >
                <option value="all">
                  {channel ? `All ${channel} stores` : "All"}
                </option>
                {(filters?.branches ?? []).map((b) => (
                  <option key={b.id as string} value={b.id as string}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {!showLocation && filters?.branches.length === 1 && (
            <span className="text-xs text-muted-foreground">
              Location {filters.branches[0].name}
            </span>
          )}

          {narrowed && (
            <button
              type="button"
              onClick={() => {
                setPickedBrand("all");
                setPickedBranch("all");
              }}
              className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-xs font-medium text-muted-foreground">
              {showFilters ? "As of Now" : `${title} · As of Now`}
            </span>
            {now && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {phtTime(now.asOfMs)}
              </span>
            )}
          </div>

          {now === undefined ? (
            <div className="mt-1.5 h-8 w-40 animate-pulse rounded bg-muted" />
          ) : (
            <>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-3">
                <p className="text-3xl font-semibold tabular-nums">
                  {pesos(now.salesCentavos)}
                </p>
                {now.changePercent !== null && (
                  <span
                    className={cn(
                      "flex items-center gap-0.5 text-sm font-medium tabular-nums",
                      up ? "text-emerald-600" : "text-red-600"
                    )}
                  >
                    {up ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                    {up ? "+" : ""}
                    {now.changePercent.toFixed(1)}%
                  </span>
                )}
              </div>

              <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {now.transactionCount.toLocaleString("en-PH")} transaction
                {now.transactionCount === 1 ? "" : "s"} ·{" "}
                {readableYmd(now.comparedTo)} at this hour{" "}
                {pesos(now.priorSalesCentavos)}
              </p>

              {brandName && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {brandName}&apos;s share of each sale it was part of · discounts
                  included
                </p>
              )}

              {/* Whether the figure is still moving. A brand filter does not
                  change which registers are open — that belongs to the store. */}
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Circle
                  className={cn(
                    "h-2 w-2 shrink-0",
                    allClosed
                      ? "fill-muted-foreground text-muted-foreground"
                      : "fill-emerald-500 text-emerald-500"
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
                    {now.registersOpen} register
                    {now.registersOpen === 1 ? "" : "s"} open
                    {now.registersTotal > 1
                      ? ` of ${now.registersTotal} store${now.registersTotal === 1 ? "" : "s"}`
                      : ""}
                  </>
                )}
              </p>
            </>
          )}
        </div>

        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          {open ? "Hide" : "History"}
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          />
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t p-4 pt-3">
          <p className="text-xs text-muted-foreground">
            Running totals through each day · the last {days} days
          </p>
          <HistoryTable days={days} scope={scope} />
        </div>
      )}
    </div>
  );
}

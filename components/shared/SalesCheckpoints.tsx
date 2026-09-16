"use client";

// components/shared/SalesCheckpoints.tsx — the trading day read at fixed points.
//
// Where sales stood as of 12 noon, 3pm, 6pm and at close, each a running total
// from opening rather than the slot on its own: "as of 3pm" includes the
// morning. Beside each is the same weekday a week ago at the same hour, which
// is the only fair like-for-like — a Saturday noon is nothing like a Tuesday
// noon.
//
// Checkpoints the clock has not reached yet are shown as pending, so a day in
// progress does not read as a day that collapsed.

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp } from "lucide-react";

type Checkpoint = {
  hour: number;
  label: string;
  reached: boolean;
  salesCentavos: number;
  transactionCount: number;
  priorSalesCentavos: number;
  changePercent: number | null;
};

function pesos(centavos: number): string {
  return `₱${Math.round(centavos / 100).toLocaleString("en-PH")}`;
}

/** YYYYMMDD → "Tue, 16 Sep" — the day being compared against. */
function readableYmd(ymd: string): string {
  if (ymd.length !== 8) return ymd;
  const date = new Date(
    Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)))
  );
  return date.toLocaleDateString("en-PH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function CheckpointCard({ point }: { point: Checkpoint }) {
  const up = (point.changePercent ?? 0) >= 0;
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        point.hour === 24 && "border-foreground/20 bg-muted/40",
        !point.reached && "opacity-60"
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {point.hour === 24 ? "Close" : `As of ${point.label}`}
        </span>
        {point.reached && point.changePercent !== null && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-[11px] font-medium tabular-nums",
              up ? "text-emerald-600" : "text-red-600"
            )}
          >
            {up ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {up ? "+" : ""}
            {point.changePercent.toFixed(1)}%
          </span>
        )}
      </div>

      {point.reached ? (
        <>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {pesos(point.salesCentavos)}
          </p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {point.transactionCount.toLocaleString("en-PH")} txn
            {point.transactionCount === 1 ? "" : "s"} · last week{" "}
            {pesos(point.priorSalesCentavos)}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-lg font-semibold text-muted-foreground">—</p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            not yet · last week {pesos(point.priorSalesCentavos)}
          </p>
        </>
      )}
    </div>
  );
}

export function SalesCheckpoints({
  date,
  branchId,
  channel,
  className,
  title = "Time Report",
}: {
  /** YYYYMMDD. Omitted: today. */
  date?: string;
  branchId?: Id<"branches">;
  channel?:
    | "inline"
    | "online"
    | "outlet"
    | "popup"
    | "dtc"
    | "warehouse"
    | "outright";
  className?: string;
  title?: string;
}) {
  const data = useQuery(api.dashboards.reportsV2.getSalesCheckpoints, {
    ...(date ? { date } : {}),
    ...(branchId ? { branchId } : {}),
    ...(channel ? { channel } : {}),
  });

  return (
    <div className={cn("rounded-lg border p-4", className)}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">
            Running totals through the day
            {data ? ` · against ${readableYmd(data.comparedTo)}` : ""}
          </p>
        </div>
      </div>

      {data === undefined ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[86px] animate-pulse rounded-lg border bg-muted/40" />
          ))}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {data.checkpoints.map((point) => (
            <CheckpointCard key={point.hour} point={point as Checkpoint} />
          ))}
        </div>
      )}
    </div>
  );
}

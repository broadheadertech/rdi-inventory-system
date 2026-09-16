"use client";

// components/shared/YearTrajectory.tsx — the year's goal against the year so far.
//
// A goal for the month says nothing about whether a store will make its year.
// Three figures do: what the year's goal comes to by today, what the store has
// actually taken against that, and where the year lands if the rest of it goes
// at the same rate.
//
// "Expected by today" sums each month's own goal — whole months that have
// passed, plus the elapsed part of this one — rather than dividing the year by
// twelve, so a store carrying a heavy December is not judged as though every
// month were the same.

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp } from "lucide-react";

function pesos(centavos: number): string {
  const p = Math.round(centavos / 100);
  return `₱${p.toLocaleString("en-PH")}`;
}

/** Compact, for a dense table — ₱4,166,666 reads as ₱4.2M. */
function pesosShort(centavos: number): string {
  const p = centavos / 100;
  if (Math.abs(p) >= 1_000_000) return `₱${(p / 1_000_000).toFixed(1)}M`;
  if (Math.abs(p) >= 1_000) return `₱${Math.round(p / 1_000)}k`;
  return `₱${Math.round(p).toLocaleString("en-PH")}`;
}

function monthLabel(periodYm: string): string {
  return new Date(
    Date.UTC(Number(periodYm.slice(0, 4)), Number(periodYm.slice(4, 6)) - 1, 1)
  ).toLocaleDateString("en-PH", { month: "short", timeZone: "UTC" });
}

/** On pace is 100%. Comfortably ahead or behind is worth colouring. */
function paceTone(pacePercent: number | null): string {
  if (pacePercent === null) return "text-muted-foreground";
  if (pacePercent >= 100) return "text-emerald-600";
  if (pacePercent >= 90) return "text-amber-600";
  return "text-red-600";
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", tone)}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * The two cumulative lines, drawn as bars rather than a chart library: each
 * month shows how far the takings had come against how far the goal said they
 * should be. Months still ahead show the goal alone.
 */
function TrajectoryBars({
  trajectory,
}: {
  trajectory: {
    periodYm: string;
    cumulativeGoalCentavos: number;
    cumulativeActualCentavos: number | null;
    elapsedFraction: number;
  }[];
}) {
  const ceiling = Math.max(
    1,
    ...trajectory.map((m) =>
      Math.max(m.cumulativeGoalCentavos, m.cumulativeActualCentavos ?? 0)
    )
  );

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-muted-foreground/30" />
          Goal, cumulative
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-primary" />
          Actual, cumulative
        </span>
      </div>

      <div className="flex h-40 items-end gap-1">
        {trajectory.map((month) => {
          const goalHeight = (month.cumulativeGoalCentavos / ceiling) * 100;
          const actual = month.cumulativeActualCentavos;
          const actualHeight = actual === null ? 0 : (actual / ceiling) * 100;
          const behind =
            actual !== null && actual < month.cumulativeGoalCentavos;
          return (
            <div
              key={month.periodYm}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
              title={
                actual === null
                  ? `${monthLabel(month.periodYm)} · goal ${pesos(month.cumulativeGoalCentavos)}`
                  : `${monthLabel(month.periodYm)} · ${pesos(actual)} of ${pesos(month.cumulativeGoalCentavos)}`
              }
            >
              <div className="relative flex h-full w-full items-end justify-center">
                {/* The goal line for the month, as a ghost bar. */}
                <div
                  className="absolute bottom-0 w-full rounded-sm bg-muted-foreground/15"
                  style={{ height: `${goalHeight}%` }}
                />
                {actual !== null && (
                  <div
                    className={cn(
                      "absolute bottom-0 w-[60%] rounded-sm",
                      behind ? "bg-amber-500" : "bg-primary"
                    )}
                    style={{ height: `${actualHeight}%` }}
                  />
                )}
              </div>
              <span className="w-full truncate text-center text-[10px] text-muted-foreground">
                {monthLabel(month.periodYm)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function YearTrajectory({ year }: { year?: number }) {
  const data = useQuery(api.dashboards.branchTargets.getBranchYearTrajectory, {
    ...(year ? { year } : {}),
  });

  if (data === undefined) {
    return <div className="h-64 animate-pulse rounded-lg border bg-muted/40" />;
  }

  const t = data.totals;
  const ahead = t.varianceCentavos >= 0;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Trajectory · {data.year}</h2>
        <p className="text-xs text-muted-foreground">
          The year&apos;s goal against the year so far, as of{" "}
          {new Date(data.asOfMs).toLocaleDateString("en-PH", {
            day: "numeric",
            month: "long",
            timeZone: "Asia/Manila",
          })}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={`Goal for ${data.year}`}
          value={pesos(t.yearGoalCentavos)}
          hint="Every store's twelve months"
        />
        <Stat
          label="Taken so far"
          value={pesos(t.actualCentavos)}
          hint={
            t.attainmentPercent !== null
              ? `${t.attainmentPercent.toFixed(1)}% of the year's goal`
              : undefined
          }
        />
        <Stat
          label="Expected by today"
          value={pesos(t.expectedCentavos)}
          hint={`${ahead ? "Ahead by" : "Behind by"} ${pesos(Math.abs(t.varianceCentavos))}`}
          tone={ahead ? "text-emerald-600" : "text-red-600"}
        />
        <Stat
          label="Projected year end"
          value={t.projectedCentavos !== null ? pesos(t.projectedCentavos) : "—"}
          hint={
            t.pacePercent !== null ? `Running at ${t.pacePercent.toFixed(1)}% of pace` : undefined
          }
          tone={paceTone(t.pacePercent)}
        />
      </div>

      <TrajectoryBars trajectory={data.trajectory} />

      {/* Per store */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Store</th>
              <th className="px-3 py-2 text-right font-medium">Year goal</th>
              <th className="px-3 py-2 text-right font-medium">Taken</th>
              <th className="px-3 py-2 text-right font-medium">Expected today</th>
              <th className="px-3 py-2 text-right font-medium">Variance</th>
              <th className="px-3 py-2 text-right font-medium">Pace</th>
              <th className="px-3 py-2 text-right font-medium">Projected</th>
            </tr>
          </thead>
          <tbody>
            {data.branches.map((b) => (
              <tr key={b.branchId} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <span className="font-medium">{b.branchName}</span>
                  {(b.channel || b.region) && (
                    <span className="block text-[11px] text-muted-foreground">
                      {[b.channel, b.region].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {b.yearGoalCentavos > 0 ? pesosShort(b.yearGoalCentavos) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {pesosShort(b.actualCentavos)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {b.expectedCentavos > 0 ? pesosShort(b.expectedCentavos) : "—"}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right tabular-nums",
                    b.varianceCentavos >= 0 ? "text-emerald-600" : "text-red-600"
                  )}
                >
                  {b.expectedCentavos > 0
                    ? `${b.varianceCentavos >= 0 ? "+" : "−"}${pesosShort(Math.abs(b.varianceCentavos))}`
                    : "—"}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right tabular-nums",
                    paceTone(b.pacePercent)
                  )}
                >
                  {b.pacePercent !== null ? (
                    <span className="inline-flex items-center gap-1">
                      {b.pacePercent >= 100 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {b.pacePercent.toFixed(0)}%
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {b.projectedCentavos !== null ? pesosShort(b.projectedCentavos) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="px-3 py-2">All stores</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {pesosShort(t.yearGoalCentavos)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {pesosShort(t.actualCentavos)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {pesosShort(t.expectedCentavos)}
              </td>
              <td
                className={cn(
                  "px-3 py-2 text-right tabular-nums",
                  ahead ? "text-emerald-600" : "text-red-600"
                )}
              >
                {ahead ? "+" : "−"}
                {pesosShort(Math.abs(t.varianceCentavos))}
              </td>
              <td className={cn("px-3 py-2 text-right tabular-nums", paceTone(t.pacePercent))}>
                {t.pacePercent !== null ? `${t.pacePercent.toFixed(0)}%` : "—"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {t.projectedCentavos !== null ? pesosShort(t.projectedCentavos) : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

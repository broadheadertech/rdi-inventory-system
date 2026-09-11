"use client";

// Ends a cashier's shift with a turnover slip: the shift's transactions and
// sales, what the drawer should hold — the amount to surrender — and its GCash,
// Maya and bank transfer takings, which are checked against the apps and the
// bank rather than counted. The cashier counts the drawer bill by bill and sees
// at once whether it matches; a count that doesn't asks again and is flagged
// for the manager. Only once the count is declared are they logged out —
// there is no other way out of a shift at the till.
//
// Switch Cashier hands the drawer to the next cashier, who counts it again,
// blind. End of Day also files the register's Z-reading. A shift still open
// from an earlier day can only be ended as that day's End of Day.

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getErrorMessage } from "@/lib/utils";
import { getDeviceToken } from "@/lib/deviceToken";
import { formatCurrency } from "@/lib/formatters";
import { ArrowLeft, CalendarCheck, Loader2, Users, Wallet, X } from "lucide-react";
import { dateLabel, type ClosedShift } from "@/components/pos/ShiftGate";
import {
  DenominationCounter,
  confirmEmptyDrawer,
  countedCentavos,
  type DenominationCounts,
} from "@/components/pos/DenominationCounter";

type Mode = "choose" | "turnover" | "endOfDay";
type ShiftSummary = FunctionReturnType<typeof api.pos.shifts.getShiftTenders>;

export type EndShiftTarget = {
  shiftId: Id<"cashierShifts">;
  cashierName: string;
  openedDate: string;
  isPreviousDay: boolean;
  transactionCount: number;
};

export function EndShiftDialog({
  shift,
  onCancel,
  onClosed,
}: {
  shift: EndShiftTarget;
  onCancel: () => void;
  onClosed: (closed: ClosedShift) => void;
}) {
  const closeShift = useMutation(api.pos.shifts.closeShift);

  const forced = shift.isPreviousDay;
  const [mode, setMode] = useState<Mode>(forced ? "endOfDay" : "choose");
  const [counts, setCounts] = useState<DenominationCounts>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const summary = useQuery(
    api.pos.shifts.getShiftTenders,
    mode === "choose" ? "skip" : { deviceToken: getDeviceToken() ?? undefined }
  );

  const counted = countedCentavos(counts);
  const expected = summary?.drawer.expectedCentavos;
  const difference = expected === undefined ? null : counted - expected;
  const hasCounted = Object.values(counts).some((v) => v !== "");

  async function declareAndClose() {
    if (mode === "choose") return;
    if (difference !== null && difference !== 0) {
      const ok = window.confirm(
        `Your count is ${difference < 0 ? "short" : "over"} by ${formatCurrency(Math.abs(difference))} ` +
          `against the ${formatCurrency(expected!)} expected.\n\n` +
          "Recount if you can. Declare this amount anyway? It will be flagged for the manager."
      );
      if (!ok) return;
    } else if (counted === 0 && !confirmEmptyDrawer()) {
      return;
    }
    if (
      mode === "endOfDay" &&
      !window.confirm(
        forced
          ? `Close ${dateLabel(shift.openedDate)} on this register?\n\nThis files that day's Z-reading.`
          : `End ${dateLabel(shift.openedDate)} on this register?\n\nThis files the Z-reading for ${dateLabel(shift.openedDate)}. No more sales can be rung on this register until the next day starts at midnight.`
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");
    try {
      const r = await closeShift({
        closeType: mode,
        declaredCashCentavos: counted,
        deviceToken: getDeviceToken() ?? undefined,
      });
      onClosed({
        shiftId: r.shiftId,
        cashierName: shift.cashierName,
        closeType: r.closeType,
        zCounter: r.zCounter,
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const title = forced
    ? `Close ${dateLabel(shift.openedDate)}`
    : mode === "turnover"
      ? "Switch Cashier"
      : "End of Day";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className={`relative max-h-[92vh] w-full overflow-y-auto space-y-5 rounded-xl border bg-card p-6 shadow-xl ${
          mode === "choose" ? "max-w-sm" : "max-w-md"
        }`}
      >
        {!forced && (
          <button
            onClick={onCancel}
            className="absolute right-3 top-3 rounded-full p-1 hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {mode === "choose" ? (
          <>
            <div className="space-y-1 text-center">
              <Wallet className="mx-auto h-9 w-9 text-red-500" />
              <h2 className="text-lg font-bold">End Shift</h2>
              <p className="text-sm text-muted-foreground">
                {shift.cashierName} · {shift.transactionCount} transaction
                {shift.transactionCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode("turnover")}
                className="flex flex-col items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-medium text-amber-800 hover:bg-amber-100"
              >
                <Users className="h-5 w-5" />
                Switch Cashier
                <span className="text-xs font-normal text-amber-600">Next cashier takes over</span>
              </button>
              <button
                onClick={() => setMode("endOfDay")}
                className="flex flex-col items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm font-medium text-red-800 hover:bg-red-100"
              >
                <CalendarCheck className="h-5 w-5" />
                End of Day
                <span className="text-xs font-normal text-red-600">Files today&apos;s Z-reading</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1 text-center">
              <Wallet className="mx-auto h-9 w-9 text-red-500" />
              <h2 className="text-lg font-bold">{title}</h2>
              <p className="text-sm text-muted-foreground">
                {forced
                  ? `This shift was left open since ${dateLabel(shift.openedDate)}. Count the drawer and close that day before trading today.`
                  : mode === "turnover"
                    ? "Count the drawer and surrender the cash to the next cashier. You'll be logged out once the count is recorded."
                    : "Count the drawer. You'll be logged out once the count is recorded and the Z-reading is filed."}
              </p>
            </div>

            <TurnoverSlip summary={summary} mode={mode} />

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Count the drawer
              </p>
              <DenominationCounter counts={counts} onChange={setCounts} disabled={busy} />
              {hasCounted && difference !== null && (
                <p
                  className={`rounded-lg px-3 py-2 text-center text-sm font-semibold ${
                    difference === 0
                      ? "bg-green-50 text-green-700"
                      : difference < 0
                        ? "bg-red-50 text-red-700"
                        : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {difference === 0
                    ? "Matches the amount expected"
                    : `${difference < 0 ? "Short" : "Over"} by ${formatCurrency(Math.abs(difference))}`}
                </p>
              )}
            </div>

            {error && <p className="text-center text-xs text-red-500">{error}</p>}
            <div className="flex gap-2">
              {!forced && (
                <button
                  onClick={() => {
                    setMode("choose");
                    setError("");
                  }}
                  className="flex items-center gap-1 rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-muted"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
              )}
              <button
                onClick={declareAndClose}
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "turnover" ? "Declare & log out" : "Declare, file Z & log out"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Turnover slip ────────────────────────────────────────────────────────────

function Line({
  label,
  value,
  sign,
  muted = true,
}: {
  label: React.ReactNode;
  value: number;
  sign?: "+" | "−";
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-muted-foreground" : undefined}>{label}</span>
      <span className="tabular-nums">
        {sign ? `${sign} ` : ""}
        {formatCurrency(value)}
      </span>
    </div>
  );
}

function TurnoverSlip({
  summary,
  mode,
}: {
  summary: ShiftSummary | undefined;
  mode: "turnover" | "endOfDay";
}) {
  if (summary === undefined) {
    return <p className="text-center text-xs text-muted-foreground">Loading the shift&apos;s totals…</p>;
  }
  if (summary === null) return null;

  const d = summary.drawer;
  const nonCash = [
    { label: "GCash", ...summary.gcash },
    { label: "Maya", ...summary.maya },
    { label: "Bank Transfer", ...summary.bankTransfer },
  ];

  return (
    <div className="space-y-3 rounded-lg border p-3 text-sm">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Transactions</span>
          <span className="font-semibold">{summary.transactionCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Total sales</span>
          <span className="font-semibold tabular-nums">
            {formatCurrency(summary.totalSalesCentavos)}
          </span>
        </div>
      </div>

      <div className="space-y-1 border-t pt-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Cash drawer
        </p>
        <Line label="Drawer at start of shift" value={d.startCentavos} />
        <Line label="Cash sales" value={d.cashSalesCentavos} sign="+" />
        <Line label="Cash In" value={d.cashInCentavos} sign="+" />
        <Line label="Cash Out" value={d.cashOutCentavos} sign="−" />
        <div className="flex items-center justify-between border-t pt-1 font-bold">
          <span>{mode === "turnover" ? "To surrender" : "Expected in drawer"}</span>
          <span className="tabular-nums text-green-700">{formatCurrency(d.expectedCentavos)}</span>
        </div>
      </div>

      <div className="space-y-1 border-t pt-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Non-cash — not in the drawer
        </p>
        {nonCash.map((r) => (
          <Line
            key={r.label}
            muted={false}
            label={
              <>
                {r.label}{" "}
                <span className="text-xs text-muted-foreground">
                  · {r.count} payment{r.count === 1 ? "" : "s"}
                </span>
              </>
            }
            value={r.amountCentavos}
          />
        ))}
        {summary.transfers.length > 0 && (
          <div className="space-y-0.5 pt-1 text-xs">
            <p className="text-muted-foreground">Transfer reference nos.</p>
            <ul className="max-h-24 space-y-0.5 overflow-y-auto">
              {summary.transfers.map((t, i) => (
                <li key={`${t.receiptNumber}-${i}`} className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono">{t.reference ?? "No reference"}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatCurrency(t.amountCentavos)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="pt-1 text-xs text-muted-foreground">
          Check these against the GCash and Maya apps and the bank.
        </p>
      </div>
    </div>
  );
}

"use client";

// Ends a cashier's shift. The cashier declares the cash on hand — blind, never
// shown what the system expects — and only then is logged out; there is no
// other way out of a shift at the till. Switch Cashier hands the drawer to the
// next cashier, who counts it again. End of Day also files the register's
// Z-reading. A shift still open from an earlier day can only be ended as that
// day's End of Day.

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getErrorMessage } from "@/lib/utils";
import { getDeviceToken } from "@/lib/deviceToken";
import { ArrowLeft, CalendarCheck, Loader2, Users, Wallet, X } from "lucide-react";
import { dateLabel, pesoToCentavos, type ClosedShift } from "@/components/pos/ShiftGate";

type Mode = "choose" | "turnover" | "endOfDay";

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
  const [countInput, setCountInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function declareAndClose() {
    if (mode === "choose") return;
    const declared = pesoToCentavos(countInput);
    if (declared === null) {
      setError("Enter the cash you counted — 0 if the drawer is empty.");
      return;
    }
    if (
      mode === "endOfDay" &&
      !window.confirm(
        forced
          ? `Close ${dateLabel(shift.openedDate)} on this register?\n\nThis files that day's Z-reading.`
          : "End the day on this register?\n\nThis files today's Z-reading. No more sales can be rung on this register until tomorrow."
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");
    try {
      const r = await closeShift({
        closeType: mode,
        declaredCashCentavos: declared,
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
      <div className="relative w-full max-w-sm space-y-5 rounded-xl border bg-card p-6 shadow-xl">
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
                  : "Count all the cash in the drawer and declare the total. You'll be logged out once it's recorded."}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Cash on hand (₱)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={countInput}
                onChange={(e) => setCountInput(e.target.value)}
                placeholder="0.00"
                autoFocus
                className="mt-1 w-full rounded-lg border px-3 py-2.5 text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                onKeyDown={(e) => {
                  if (e.key === "Enter") declareAndClose();
                }}
              />
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

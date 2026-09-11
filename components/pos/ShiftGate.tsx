"use client";

// The login gate in front of the POS. Nothing reaches the POS without an open
// shift, and a shift only opens after a cashier logs in:
//
//   drawer handed over   the new cashier counts it first — blind, the amount
//                        handed over is never shown — and a short count holds
//                        the register until a manager approves it
//   first shift of day   the cashier sets the drawer's float instead
//
// A register whose last trading day has no Z-reading cannot open until it is
// filed, and one that filed today's Z is closed until tomorrow.

import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getErrorMessage } from "@/lib/utils";
import { TerminalEnrollment } from "@/components/pos/TerminalEnrollment";
import { ReadingReport, type ReadingData } from "@/components/pos/ReadingReport";
import { BirReadingViewer } from "@/components/pos/BirReadingViewer";
import {
  DenominationCounter,
  confirmEmptyDrawer,
  countedCentavos,
  type DenominationCounts,
} from "@/components/pos/DenominationCounter";
import { getDeviceToken, clearDeviceToken, getInstallId } from "@/lib/deviceToken";
import {
  CalendarX,
  Clock,
  FileBarChart,
  Loader2,
  LogIn,
  Printer,
  ShieldAlert,
  Users,
  Wallet,
  X,
} from "lucide-react";

// ─── Shared with the End Shift dialog ─────────────────────────────────────────

/** A peso amount typed at the till, in centavos — null unless it is a real, non-negative number. */
export function pesoToCentavos(input: string): number | null {
  if (input.trim() === "") return null;
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** The shift that just ended, so the gate can say who logged out. */
export type ClosedShift = {
  shiftId: Id<"cashierShifts">;
  cashierName: string;
  closeType: "turnover" | "endOfDay";
  zCounter: number | null;
};

export function dateLabel(ymd: string): string {
  return new Date(
    Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)))
  ).toLocaleDateString("en-PH", { dateStyle: "medium", timeZone: "UTC" });
}

// ─── Gate ─────────────────────────────────────────────────────────────────────

type Step = "login" | "count" | "funds" | "approval";

type VerifiedAccount = {
  cashierAccountId: Id<"cashierAccounts">;
  firstName: string;
  lastName: string;
};

const amountInput =
  "mt-1 w-full rounded-lg border px-3 py-2.5 text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary";
const primaryButton =
  "flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50";

export function ShiftGate({
  children,
  branchId,
  lastClosed,
  onDismissClosed,
}: {
  children: React.ReactNode;
  branchId: string | null | undefined;
  lastClosed: ClosedShift | null;
  onDismissClosed: () => void;
}) {
  // Device binding — read once on mount so SSR and the first client render agree.
  const [deviceToken, setDeviceTokenState] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setDeviceTokenState(getDeviceToken());
  }, []);
  const tokenArgs = deviceToken === undefined ? "skip" : { deviceToken: deviceToken ?? undefined };

  // A shift belongs to a register, so these need the token.
  const shift = useQuery(api.pos.shifts.getActiveShift, tokenArgs);
  const terminal = useQuery(api.pos.terminals.whoAmI, tokenArgs);
  const status = useQuery(
    api.pos.shifts.getRegisterStatus,
    deviceToken === undefined || shift !== null ? "skip" : { deviceToken: deviceToken ?? undefined }
  );

  const openShift = useMutation(api.pos.shifts.openShift);
  const closeMissedDay = useMutation(api.pos.shifts.closeMissedDay);
  const verifyCashierLogin = useAction(api.cashier.authActions.verifyCashierLogin);
  const recordActivity = useMutation(api.pos.terminalSecurity.recordActivity);

  // Server rejected the stored token (revoked, or moved to another branch) —
  // drop it so this device falls back to the enrollment screen.
  useEffect(() => {
    if (terminal && !terminal.enrolled && deviceToken) {
      clearDeviceToken();
      setDeviceTokenState(null);
    }
  }, [terminal, deviceToken]);

  // Lets a manager dismiss enrollment on a register that is still running
  // unbound, before POS_REQUIRE_TERMINAL is switched on.
  const [enrollmentSkipped, setEnrollmentSkipped] = useState(false);

  const [step, setStep] = useState<Step>("login");
  const [account, setAccount] = useState<VerifiedAccount | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [counts, setCounts] = useState<DenominationCounts>({});
  const [changeFundInput, setChangeFundInput] = useState("");
  const [cashFundInput, setCashFundInput] = useState("0");
  const [approval, setApproval] = useState<{
    id: Id<"cashTurnoverApprovals">;
    countedCentavos: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showYReading, setShowYReading] = useState(false);

  const approvalStatus = useQuery(
    api.pos.shifts.getTurnoverApproval,
    approval ? { approvalId: approval.id } : "skip"
  );
  // The day's Z, printable from the Closed-for-today screen.
  const [showZReading, setShowZReading] = useState(false);
  // The Y of the shift that just ended — or, on a register closed for the day,
  // of its last shift, so it can still be printed after a reload.
  const yShiftId = lastClosed?.shiftId ?? status?.closedToday?.lastShiftId ?? null;
  const yReading = useQuery(
    api.pos.readings.getYReading,
    showYReading && yShiftId ? { shiftId: yShiftId } : "skip"
  );

  // A cashier's session is their shift. When it ends the gate must forget who
  // was signed in — it used to keep them, so the next person landed on the
  // previous cashier's Open Shift screen without logging in at all.
  const hadShift = useRef(false);
  useEffect(() => {
    if (shift === undefined) return;
    if (shift !== null) {
      hadShift.current = true;
      return;
    }
    if (!hadShift.current) return;
    hadShift.current = false;
    setStep("login");
    setAccount(null);
    setUsername("");
    setPassword("");
    setCounts({});
    setChangeFundInput("");
    setCashFundInput("0");
    setApproval(null);
    setError("");
  }, [shift]);

  // Once a manager approves a short count, open the shift on it.
  const openingOnApproval = useRef(false);
  useEffect(() => {
    if (!approval || !account || approvalStatus?.status !== "approved") return;
    if (openingOnApproval.current) return;
    openingOnApproval.current = true;
    openShift({
      cashierAccountId: account.cashierAccountId,
      deviceToken: deviceToken ?? undefined,
      turnoverCountCentavos: approval.countedCentavos,
      approvalId: approval.id,
    })
      .then((r) => {
        if (r.status === "needsApproval") {
          setApproval({ id: r.approvalId, countedCentavos: approval.countedCentavos });
        }
      })
      .catch((err) => {
        setError(getErrorMessage(err));
        setApproval(null);
        setStep("count");
      })
      .finally(() => {
        openingOnApproval.current = false;
      });
  }, [approval, account, approvalStatus, deviceToken, openShift]);

  // ── Before any cashier: loading, enrollment, an open shift ─────────────────
  if (shift === undefined || deviceToken === undefined || terminal === undefined) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading shift...</p>
      </div>
    );
  }

  // Unregistered device — enroll before any cashier can sign in. Until
  // POS_REQUIRE_TERMINAL is switched on this is dismissible, so registers can be
  // enrolled one at a time without taking unenrolled lanes offline.
  if (!terminal.enrolled && !(enrollmentSkipped && !terminal.enforced)) {
    return (
      <TerminalEnrollment
        onEnrolled={() => setDeviceTokenState(getDeviceToken())}
        onSkip={terminal.enforced ? undefined : () => setEnrollmentSkipped(true)}
      />
    );
  }

  if (shift !== null) return <>{children}</>;

  if (status === undefined) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading register...</p>
      </div>
    );
  }

  const handover = status?.handover ?? null;

  // ── Handlers ───────────────────────────────────────────────────────────────
  async function handleLogin() {
    if (!branchId) return;
    if (!username.trim() || !password) {
      setError("Enter your username and password");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const verified = await verifyCashierLogin({
        username: username.trim(),
        password,
        deviceToken: deviceToken ?? undefined,
      });
      setPassword("");
      setAccount({
        cashierAccountId: verified.cashierAccountId,
        firstName: verified.firstName,
        lastName: verified.lastName,
      });

      // Stamp the session with who just signed in, so the same cashier account
      // appearing on two terminals at once can be flagged.
      const installId = getInstallId();
      if (installId && deviceToken) {
        recordActivity({
          deviceToken,
          installId,
          cashierAccountId: verified.cashierAccountId,
        }).catch(() => {});
      }
      onDismissClosed();
      // A count of this drawer is already with a manager (the till was reloaded,
      // or the cashier logged in again): wait on it instead of counting afresh.
      if (handover?.pendingCount) {
        setApproval({
          id: handover.pendingCount.approvalId,
          countedCentavos: handover.pendingCount.countedCentavos,
        });
        setStep("approval");
      } else {
        setStep(handover ? "count" : "funds");
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleTurnoverCount() {
    if (!account) return;
    const counted = countedCentavos(counts);
    if (counted === 0 && !confirmEmptyDrawer()) return;
    setBusy(true);
    setError("");
    try {
      const r = await openShift({
        cashierAccountId: account.cashierAccountId,
        deviceToken: deviceToken ?? undefined,
        turnoverCountCentavos: counted,
      });
      if (r.status === "needsApproval") {
        setApproval({ id: r.approvalId, countedCentavos: counted });
        setStep("approval");
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenFirstShift() {
    if (!account) return;
    const changeFund = pesoToCentavos(changeFundInput || "0");
    const cashFund = pesoToCentavos(cashFundInput || "0");
    if (changeFund === null || cashFund === null) {
      setError("Amounts must be zero or more");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await openShift({
        cashierAccountId: account.cashierAccountId,
        deviceToken: deviceToken ?? undefined,
        changeFundCentavos: changeFund,
        cashFundCentavos: cashFund,
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCloseMissedDay(date: string) {
    const declared = countedCentavos(counts);
    if (declared === 0 && !confirmEmptyDrawer()) return;
    setBusy(true);
    setError("");
    try {
      await closeMissedDay({
        date,
        declaredCashCentavos: declared,
        deviceToken: deviceToken ?? undefined,
      });
      setCounts({});
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function recount() {
    setApproval(null);
    setCounts({});
    setError("");
    setStep("count");
  }

  // ── Pieces ─────────────────────────────────────────────────────────────────
  const closedBanner = lastClosed && (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
      <p className="font-medium">{lastClosed.cashierName} has logged out.</p>
      {lastClosed.closeType === "endOfDay" && lastClosed.zCounter !== null && (
        <p className="text-xs text-muted-foreground">
          Day closed · Z-reading #{String(lastClosed.zCounter).padStart(8, "0")} filed.
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => setShowYReading(true)}
          className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted"
        >
          <FileBarChart className="h-3.5 w-3.5" /> Y-Reading
        </button>
        <button
          onClick={onDismissClosed}
          className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Dismiss
        </button>
      </div>
    </div>
  );

  const errorLine = error && <p className="text-center text-xs text-red-500">{error}</p>;

  function renderStep() {
    // Closed for today: the Z-reading is filed, so nothing more can be rung.
    if (status?.closedToday) {
      return (
        <>
          <div className="space-y-1 text-center">
            <CalendarX className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="text-xl font-bold">Closed for today</h1>
            <p className="text-sm text-muted-foreground">
              This register filed today&apos;s Z-reading (#
              {String(status.closedToday.zCounter).padStart(8, "0")}). It reopens at 12:00
              midnight, when the next business day starts.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setShowZReading(true)} className={primaryButton}>
              <Printer className="h-4 w-4" />
              Print Z-Reading
            </button>
            <button
              onClick={() => setShowYReading(true)}
              disabled={!yShiftId}
              className="flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50"
            >
              <FileBarChart className="h-4 w-4" />
              Y-Reading
            </button>
          </div>
        </>
      );
    }

    // The last trading day was never closed.
    if (status?.missingZDate) {
      const date = status.missingZDate;
      return (
        <>
          <div className="space-y-1 text-center">
            <Clock className="mx-auto h-10 w-10 text-amber-500" />
            <h1 className="text-xl font-bold">{dateLabel(date)} was never closed</h1>
            <p className="text-sm text-muted-foreground">
              This register traded on {dateLabel(date)} but the day was never ended with End of
              Day. Count the drawer to close that day — today&apos;s first shift opens after.
            </p>
          </div>
          <div className="space-y-2">
            <DenominationCounter counts={counts} onChange={setCounts} disabled={busy} />
            <p className="text-xs text-muted-foreground">
              Count every bill and coin yourself. This becomes {dateLabel(date)}&apos;s cash count.
            </p>
          </div>
          {errorLine}
          <button onClick={() => handleCloseMissedDay(date)} disabled={busy} className={primaryButton}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Count &amp; close {dateLabel(date)}
          </button>
        </>
      );
    }

    if (step === "login" || !account) {
      return (
        <>
          {closedBanner}
          <div className="space-y-1 text-center">
            <LogIn className="mx-auto h-10 w-10 text-primary" />
            <h1 className="text-xl font-bold">Cashier Login</h1>
            <p className="text-sm text-muted-foreground">
              {handover
                ? `Log in to take over from ${handover.cashierName}`
                : "Enter your credentials to open a shift"}
            </p>
          </div>
          <div className="space-y-3">
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError("");
              }}
              placeholder="Username"
              autoComplete="username"
              autoFocus
              className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLogin();
              }}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              placeholder="Password"
              autoComplete="current-password"
              className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLogin();
              }}
            />
            {errorLine}
          </div>
          <button onClick={handleLogin} disabled={busy} className={primaryButton}>
            {busy ? "Verifying..." : "Continue"}
          </button>
        </>
      );
    }

    if (step === "count" && handover) {
      return (
        <>
          <div className="space-y-1 text-center">
            <Users className="mx-auto h-10 w-10 text-amber-500" />
            <h1 className="text-xl font-bold">Count the turnover</h1>
            <p className="text-sm text-muted-foreground">
              From <span className="font-medium text-foreground">{handover.cashierName}</span>
              {handover.closedAt &&
                ` · ${new Date(handover.closedAt).toLocaleTimeString("en-PH", {
                  timeStyle: "short",
                  timeZone: "Asia/Manila",
                })}`}
            </p>
          </div>
          <div className="space-y-2">
            <DenominationCounter counts={counts} onChange={setCounts} disabled={busy} />
            <p className="text-xs text-muted-foreground">
              Count every bill and coin in the drawer yourself. The amount handed over isn&apos;t
              shown.
            </p>
          </div>
          {errorLine}
          <button onClick={handleTurnoverCount} disabled={busy} className={primaryButton}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm count &amp; open shift
          </button>
        </>
      );
    }

    if (step === "approval" && approval) {
      const rejected = approvalStatus?.status === "rejected";
      return (
        <>
          <div className="space-y-1 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" />
            <h1 className="text-xl font-bold">Manager approval needed</h1>
            <p className="text-sm text-muted-foreground">
              Your count is short of the cash handed over. A manager has to approve it in
              Branch → Terminals before this register opens.
            </p>
          </div>
          {rejected ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-medium">The manager asked for a recount.</p>
              {approvalStatus?.note && <p className="mt-0.5 text-xs">{approvalStatus.note}</p>}
            </div>
          ) : (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {approvalStatus?.status === "approved"
                ? "Approved — opening the shift…"
                : "Waiting for a manager…"}
            </p>
          )}
          {errorLine}
          {/* Counting again waits for the manager: retyping until a number passes
              would defeat the blind count. */}
          {rejected ? (
            <button
              onClick={recount}
              className="w-full rounded-lg border py-2.5 text-sm font-medium hover:bg-muted"
            >
              Count again
            </button>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              You can count again only if the manager asks for a recount.
            </p>
          )}
        </>
      );
    }

    // First shift of the day: set the drawer.
    return (
      <>
        <div className="space-y-1 text-center">
          <Wallet className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-xl font-bold">Open Shift</h1>
          <p className="text-sm text-muted-foreground">
            Welcome, <span className="font-medium text-foreground">{account.firstName}</span>
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Change Fund (₱)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={changeFundInput}
              onChange={(e) => setChangeFundInput(e.target.value)}
              placeholder="e.g. 2000"
              autoFocus
              className={amountInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleOpenFirstShift();
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">Starting bills &amp; coins for making change</p>
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Cash Fund — Expenses (₱)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={cashFundInput}
              onChange={(e) => setCashFundInput(e.target.value)}
              placeholder="0"
              className={amountInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleOpenFirstShift();
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">Petty cash for store expenses</p>
          </div>
        </div>
        {errorLine}
        <button onClick={handleOpenFirstShift} disabled={busy} className={primaryButton}>
          {busy ? "Opening..." : "Open Shift"}
        </button>
      </>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <div
        className={`max-h-full w-full overflow-y-auto space-y-5 rounded-xl border bg-card p-6 shadow-lg ${
          status?.missingZDate || step === "count" ? "max-w-md" : "max-w-sm"
        }`}
      >
        {renderStep()}
      </div>

      {/* Y-Reading of the shift that just ended */}
      {showYReading && yShiftId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:bg-white print:p-0">
          <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border bg-card p-5 shadow-xl print:max-h-none print:max-w-none print:rounded-none print:border-none print:shadow-none">
            <button
              onClick={() => setShowYReading(false)}
              className="absolute right-3 top-3 rounded-full p-1 hover:bg-muted print:hidden"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            {yReading === undefined ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">Generating Y-Reading...</p>
              </div>
            ) : (
              <ReadingReport
                data={yReading as ReadingData}
                onClose={() => setShowYReading(false)}
                hideCash
              />
            )}
          </div>
        </div>
      )}

      {/* The day's BIR Z-reading — its own Print button prints only the stub */}
      {showZReading && status?.closedToday && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:bg-white print:p-0">
          <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border bg-card p-5 shadow-xl print:max-h-none print:max-w-none print:rounded-none print:border-none print:shadow-none">
            <button
              onClick={() => setShowZReading(false)}
              className="absolute left-3 top-3 rounded-full p-1 hover:bg-muted print:hidden"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <BirReadingViewer
              readingType="Z"
              date={status.closedToday.date}
              deviceToken={deviceToken ?? undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}

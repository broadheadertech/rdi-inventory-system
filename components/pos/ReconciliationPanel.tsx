"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ConvexError } from "convex/values";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Banknote,
  CreditCard,
  Smartphone,
  Hash,
} from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get today's date in PHT as YYYYMMDD string */
function getTodayPHT(): string {
  const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
  const pht = new Date(Date.now() + PHT_OFFSET_MS);
  const year = pht.getUTCFullYear();
  const month = String(pht.getUTCMonth() + 1).padStart(2, "0");
  const day = String(pht.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/** Format a YYYYMMDD string to readable date */
function formatDateLabel(dateStr: string): string {
  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const year = parseInt(dateStr.slice(0, 4));
  const month = parseInt(dateStr.slice(4, 6)) - 1;
  const day = parseInt(dateStr.slice(6, 8));
  return `${MONTHS[month]} ${day}, ${year}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

type ReconciliationResult = {
  differenceCentavos: number;
  expectedCashCentavos: number;
  actualCashCentavos: number;
};

export function ReconciliationPanel() {
  const todayDate = useMemo(() => getTodayPHT(), []);
  const summary = useQuery(api.pos.reconciliation.getDailySummary, {
    date: todayDate,
  });
  const submitReconciliation = useMutation(
    api.pos.reconciliation.submitReconciliation
  );

  const [physicalCashInput, setPhysicalCashInput] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReconciliationResult | null>(null);

  // Compute difference as user types
  const physicalCashCentavos = useMemo(() => {
    const parsed = parseFloat(physicalCashInput);
    if (isNaN(parsed) || parsed < 0) return null;
    return Math.round(parsed * 100);
  }, [physicalCashInput]);

  const differenceCentavos = useMemo(() => {
    if (physicalCashCentavos === null || !summary) return null;
    return physicalCashCentavos - summary.expectedCashCentavos;
  }, [physicalCashCentavos, summary]);

  const handleSubmit = async () => {
    if (physicalCashCentavos === null) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await submitReconciliation({
        date: todayDate,
        actualCashCentavos: physicalCashCentavos,
        notes: notes.trim() || undefined,
      });
      setResult(res);
    } catch (err) {
      if (err instanceof ConvexError) {
        const data = err.data as { code?: string; message?: string };
        setError(data.message || data.code || "Reconciliation failed");
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Loading State ──────────────────────────────────────────────────────
  if (summary === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─── Success State ──────────────────────────────────────────────────────
  if (result) {
    const isBalanced = result.differenceCentavos === 0;
    const isOver = result.differenceCentavos > 0;

    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-green-600" />
          <h1 className="text-2xl font-bold">Reconciliation Complete</h1>
          <p className="text-muted-foreground">{formatDateLabel(todayDate)}</p>

          <div className="space-y-3 rounded-lg border p-4 text-left">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expected Cash</span>
              <span className="font-semibold">
                {formatCurrency(result.expectedCashCentavos)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Physical Count</span>
              <span className="font-semibold">
                {formatCurrency(result.actualCashCentavos)}
              </span>
            </div>
            <div className="border-t pt-3">
              <div className="flex justify-between">
                <span className="font-semibold">Difference</span>
                <span
                  className={`font-bold ${
                    isBalanced
                      ? "text-green-600"
                      : "text-amber-600"
                  }`}
                >
                  {isOver ? "+" : ""}
                  {formatCurrency(result.differenceCentavos)}
                </span>
              </div>
              {isBalanced && (
                <p className="mt-1 text-sm text-green-600">
                  Cash drawer balanced perfectly!
                </p>
              )}
              {!isBalanced && (
                <p className="mt-1 text-sm text-amber-600">
                  {isOver ? "Cash over" : "Cash short"} by{" "}
                  {formatCurrency(Math.abs(result.differenceCentavos))}
                </p>
              )}
            </div>
          </div>

          <Link href="/pos">
            <Button className="min-h-14 w-full gap-2 text-lg">
              <ArrowLeft className="h-5 w-5" />
              Back to POS
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // ─── Main Form ──────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-lg p-4">
      {/* Navigation */}
      <div className="mb-6">
        <Link
          href="/pos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to POS
        </Link>
        <h1 className="mt-2 text-2xl font-bold">End of Day Reconciliation</h1>
        <p className="text-muted-foreground">{formatDateLabel(todayDate)}</p>
      </div>

      {/* Daily Summary */}
      <div className="mb-6 space-y-3">
        <h2 className="text-lg font-semibold">Daily Summary</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Hash className="h-4 w-4" />
              Transactions
            </div>
            <p className="mt-1 text-xl font-bold">{summary.transactionCount}</p>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Total Sales
            </div>
            <p className="mt-1 text-xl font-bold">
              {formatCurrency(summary.totalSalesCentavos)}
            </p>
          </div>
        </div>

        {/* Payment method breakdown */}
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium text-muted-foreground">
            Breakdown by Payment
          </p>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm">
              <Banknote className="h-4 w-4 text-green-600" />
              Cash
            </span>
            <span className="font-semibold">
              {formatCurrency(summary.cashSalesCentavos)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm">
              <Smartphone className="h-4 w-4 text-blue-600" />
              GCash
            </span>
            <span className="font-semibold">
              {formatCurrency(summary.gcashSalesCentavos)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm">
              <CreditCard className="h-4 w-4 text-emerald-600" />
              Maya
            </span>
            <span className="font-semibold">
              {formatCurrency(summary.mayaSalesCentavos)}
            </span>
          </div>
        </div>
      </div>

      {/* Reconciliation Form */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Cash Reconciliation</h2>

        {/* Expected Cash (read-only) */}
        <div className="rounded-lg border bg-muted/50 p-4">
          <p className="text-sm text-muted-foreground">Expected Cash (System)</p>
          <p className="text-2xl font-bold">
            {formatCurrency(summary.expectedCashCentavos)}
          </p>
        </div>

        {/* Physical Cash Input */}
        <div>
          <label
            htmlFor="physicalCash"
            className="mb-1 block text-sm font-medium"
          >
            Physical Cash Count (₱)
          </label>
          <input
            id="physicalCash"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={physicalCashInput}
            onChange={(e) => setPhysicalCashInput(e.target.value)}
            autoFocus
            className="min-h-14 w-full rounded-lg border bg-background px-4 text-xl font-semibold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Auto-calculated Difference */}
        {differenceCentavos !== null && (
          <div
            className={`rounded-lg border-2 p-4 ${
              differenceCentavos === 0
                ? "border-green-200 bg-green-50"
                : "border-amber-200 bg-amber-50"
            }`}
          >
            <p className="text-sm text-muted-foreground">Difference</p>
            <p
              className={`text-2xl font-bold ${
                differenceCentavos === 0
                  ? "text-green-600"
                  : "text-amber-600"
              }`}
            >
              {differenceCentavos > 0 ? "+" : ""}
              {formatCurrency(differenceCentavos)}
            </p>
            {differenceCentavos === 0 && (
              <p className="mt-1 flex items-center gap-1 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                Balanced
              </p>
            )}
            {differenceCentavos !== 0 && (
              <p className="mt-1 flex items-center gap-1 text-sm text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                {differenceCentavos > 0 ? "Over" : "Short"} by{" "}
                {formatCurrency(Math.abs(differenceCentavos))}
              </p>
            )}
          </div>
        )}

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="mb-1 block text-sm font-medium">
            Notes (optional)
          </label>
          <input
            id="notes"
            type="text"
            placeholder="e.g., ₱50 short — customer dispute"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-12 w-full rounded-lg border bg-background px-4 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Submit */}
        <Button
          className="min-h-14 w-full gap-2 text-lg"
          onClick={handleSubmit}
          disabled={physicalCashCentavos === null || isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Submitting...
            </>
          ) : (
            "Submit Reconciliation"
          )}
        </Button>
      </div>
    </div>
  );
}

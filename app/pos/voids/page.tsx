"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { getErrorMessage, cn } from "@/lib/utils";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { ArrowLeft, Ban, ChevronDown, Loader2 } from "lucide-react";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────────────────────

type TxnRow = {
  _id: Id<"transactions">;
  receiptNumber: string;
  totalCentavos: number;
  paymentMethod: "cash" | "gcash" | "maya";
  cashierName: string;
  status: "completed" | "voided";
  voidedAt?: number;
  voidReason?: string;
  createdAt: number;
};

const VOID_REASONS = [
  "Cashier error",
  "Wrong items scanned",
  "Customer cancelled",
  "Duplicate transaction",
  "Other",
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VoidsPage() {
  const currentUser = useQuery(api.auth.users.getCurrentUser);
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [allRows, setAllRows] = useState<TxnRow[]>([]);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const result = useQuery(api.pos.transactions.getTodayTransactions, {
    cursor,
    limit: 50,
  });

  // Merge pages into allRows when result changes
  const [lastCursor, setLastCursor] = useState<number | undefined>(undefined);
  if (result !== undefined && cursor !== lastCursor) {
    setLastCursor(cursor);
    setLoadedOnce(true);
    if (cursor === undefined) {
      setAllRows((result.transactions as TxnRow[]) ?? []);
    } else {
      setAllRows((prev) => [...prev, ...(result.transactions as TxnRow[])]);
    }
  }

  const isManager =
    currentUser?.role === "admin" || currentUser?.role === "manager";

  if (!isManager) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">
          Only managers and admins can access void management.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Link
          href="/pos"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-lg font-bold">Void Transactions</h1>
          <p className="text-xs text-muted-foreground">Today&apos;s transactions only</p>
        </div>
      </div>

      {/* List */}
      <div className="p-4 space-y-2 max-w-2xl mx-auto">
        {!loadedOnce ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : allRows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Ban className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No transactions today yet.</p>
          </div>
        ) : (
          <>
            {allRows.map((txn) => (
              <TransactionVoidRow key={String(txn._id)} txn={txn} />
            ))}

            {result?.hasMore && (
              <button
                onClick={() => setCursor(result.nextCursor)}
                className="w-full flex items-center justify-center gap-1 rounded-lg border py-2.5 text-sm text-muted-foreground hover:bg-gray-50 transition-colors"
              >
                <ChevronDown className="h-4 w-4" />
                Load more
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function TransactionVoidRow({ txn }: { txn: TxnRow }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState<string>(VOID_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const voidTxn = useMutation(api.pos.transactions.voidTransaction);

  const isVoided = txn.status === "voided";

  async function handleVoid() {
    const finalReason = reason === "Other" ? customReason.trim() : reason;
    if (!finalReason) return;
    setVoiding(true);
    try {
      await voidTxn({ transactionId: txn._id, reason: finalReason });
      toast.success(`Receipt ${txn.receiptNumber} voided`);
      setShowConfirm(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setVoiding(false);
    }
  }

  const paymentLabel =
    txn.paymentMethod === "cash"
      ? "Cash"
      : txn.paymentMethod === "gcash"
      ? "GCash"
      : "Maya";

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 space-y-3",
        isVoided && "opacity-60"
      )}
    >
      {/* Row header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-sm">
              {txn.receiptNumber}
            </span>
            {isVoided && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                <Ban className="h-2.5 w-2.5" /> VOIDED
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDateTime(txn.createdAt)} · {txn.cashierName} · {paymentLabel}
          </p>
          {isVoided && txn.voidReason && (
            <p className="text-xs text-red-600 mt-0.5">
              Reason: {txn.voidReason}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className={cn("font-bold text-sm", isVoided && "line-through text-muted-foreground")}>
            {formatCurrency(txn.totalCentavos)}
          </p>
          {!isVoided && (
            <button
              onClick={() => setShowConfirm(true)}
              className="mt-1 text-xs text-destructive hover:underline"
            >
              Void
            </button>
          )}
        </div>
      </div>

      {/* Inline confirm */}
      {showConfirm && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-3">
          <p className="text-sm font-semibold text-destructive">
            Void {txn.receiptNumber}?
          </p>
          <p className="text-xs text-muted-foreground">
            This will restock all items. This action cannot be undone.
          </p>

          <div className="space-y-2">
            <label className="text-xs font-medium">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded border px-2 py-1.5 text-sm bg-background"
            >
              {VOID_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {reason === "Other" && (
              <input
                type="text"
                placeholder="Describe the reason..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full rounded border px-2 py-1.5 text-sm bg-background"
              />
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowConfirm(false)}
              className="flex-1 rounded border py-1.5 text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleVoid}
              disabled={voiding || (reason === "Other" && !customReason.trim())}
              className="flex-1 rounded bg-destructive py-1.5 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {voiding ? "Voiding..." : "Confirm Void"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

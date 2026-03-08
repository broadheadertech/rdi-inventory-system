"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  Package,
  RefreshCw,
  Banknote,
  Loader2,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCentavos(centavos: number): string {
  const abs = Math.abs(centavos);
  const formatted = `₱${(abs / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  return centavos < 0 ? `-${formatted}` : formatted;
}

const RETURN_REASONS = [
  { value: "wrong_size" as const, label: "Wrong Size" },
  { value: "defective" as const, label: "Defective" },
  { value: "changed_mind" as const, label: "Changed Mind" },
  { value: "other" as const, label: "Other" },
];

type ReturnReason = "wrong_size" | "defective" | "changed_mind" | "other";

type TransactionLookup = {
  _id: Id<"transactions">;
  receiptNumber: string;
  branchId: Id<"branches">;
  totalCentavos: number;
  paymentMethod: "cash" | "gcash" | "maya";
  discountType?: "senior" | "pwd" | "none";
  createdAt: number;
  items: {
    _id: Id<"transactionItems">;
    variantId: Id<"variants">;
    quantity: number;
    unitPriceCentavos: number;
    lineTotalCentavos: number;
    styleName: string;
    size: string;
    color: string;
    sku: string;
  }[];
  returnedQuantities: Record<string, number>;
};

type ReturnItem = {
  variantId: Id<"variants">;
  quantity: number;
  maxQuantity: number;
  reason: ReturnReason;
  styleName: string;
  size: string;
  color: string;
  unitPriceCentavos: number;
};

type Step = "lookup" | "select_items" | "reasons" | "type" | "confirm";

// ═══════════════════════════════════════════════════════════════════════════════
// Returns Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function ReturnsPage() {
  const convex = useConvex();
  const processReturn = useMutation(api.pos.returns.processReturn);
  const shift = useQuery(api.pos.shifts.getActiveShift);

  const [step, setStep] = useState<Step>("lookup");
  const [receiptInput, setReceiptInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [transaction, setTransaction] = useState<TransactionLookup | null>(
    null
  );
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [returnType, setReturnType] = useState<"refund" | "exchange">(
    "refund"
  );
  const [processing, setProcessing] = useState(false);
  const [completedReceipt, setCompletedReceipt] = useState<string | null>(null);
  const [completedRefund, setCompletedRefund] = useState(0);

  // ── Step 1: Receipt lookup ──────────────────────────────────────────────────

  const handleLookup = useCallback(async () => {
    const trimmed = receiptInput.trim();
    if (!trimmed) {
      toast.error("Please enter a receipt number.");
      return;
    }

    setSearching(true);
    try {
      const result = await convex.query(api.pos.returns.lookupTransaction, {
        receiptNumber: trimmed,
      });

      if (!result) {
        toast.error("Transaction not found. Check the receipt number.");
        return;
      }

      // Check if all items already returned
      const allReturned = result.items.every((item) => {
        const returned =
          result.returnedQuantities[item.variantId as string] ?? 0;
        return returned >= item.quantity;
      });

      if (allReturned) {
        toast.error("All items from this transaction have already been returned.");
        return;
      }

      setTransaction(result as TransactionLookup);
      setStep("select_items");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to look up transaction.";
      toast.error(msg);
    } finally {
      setSearching(false);
    }
  }, [receiptInput, convex]);

  // ── Step 2: Toggle item selection ───────────────────────────────────────────

  const toggleItem = useCallback(
    (item: TransactionLookup["items"][number]) => {
      if (!transaction) return;
      const alreadyReturned =
        transaction.returnedQuantities[item.variantId as string] ?? 0;
      const maxQty = item.quantity - alreadyReturned;
      if (maxQty <= 0) return;

      setReturnItems((prev) => {
        const exists = prev.find(
          (ri) => (ri.variantId as string) === (item.variantId as string)
        );
        if (exists) {
          return prev.filter(
            (ri) => (ri.variantId as string) !== (item.variantId as string)
          );
        }
        return [
          ...prev,
          {
            variantId: item.variantId,
            quantity: maxQty,
            maxQuantity: maxQty,
            reason: "changed_mind" as ReturnReason,
            styleName: item.styleName,
            size: item.size,
            color: item.color,
            unitPriceCentavos: item.unitPriceCentavos,
          },
        ];
      });
    },
    [transaction]
  );

  const updateReturnQty = useCallback(
    (variantId: string, quantity: number) => {
      setReturnItems((prev) =>
        prev.map((ri) =>
          (ri.variantId as string) === variantId
            ? { ...ri, quantity: Math.max(1, Math.min(quantity, ri.maxQuantity)) }
            : ri
        )
      );
    },
    []
  );

  const updateReturnReason = useCallback(
    (variantId: string, reason: ReturnReason) => {
      setReturnItems((prev) =>
        prev.map((ri) =>
          (ri.variantId as string) === variantId ? { ...ri, reason } : ri
        )
      );
    },
    []
  );

  // ── Step navigation ─────────────────────────────────────────────────────────

  const goToReasons = useCallback(() => {
    if (returnItems.length === 0) {
      toast.error("Select at least one item to return.");
      return;
    }
    setStep("reasons");
  }, [returnItems]);

  const goToType = useCallback(() => {
    setStep("type");
  }, []);

  const goToConfirm = useCallback(() => {
    setStep("confirm");
  }, []);

  // ── Step 5: Process return ──────────────────────────────────────────────────

  const handleProcess = useCallback(async () => {
    if (!transaction) return;

    setProcessing(true);
    try {
      const result = await processReturn({
        transactionId: transaction._id,
        returnItems: returnItems.map((ri) => ({
          variantId: ri.variantId,
          quantity: ri.quantity,
          reason: ri.reason,
        })),
        returnType,
      });

      setCompletedReceipt(result.receiptNumber);
      setCompletedRefund(result.refundTotalCentavos);
      toast.success("Return processed successfully!");
      setStep("lookup"); // Reset to allow another return
      // Show completion state
      setTransaction(null);
      setReturnItems([]);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to process return.";
      toast.error(msg);
    } finally {
      setProcessing(false);
    }
  }, [transaction, returnItems, returnType, processReturn]);

  // ── Reset ───────────────────────────────────────────────────────────────────

  const resetFlow = useCallback(() => {
    setStep("lookup");
    setReceiptInput("");
    setTransaction(null);
    setReturnItems([]);
    setReturnType("refund");
    setCompletedReceipt(null);
    setCompletedRefund(0);
  }, []);

  // ── Computed ────────────────────────────────────────────────────────────────

  const refundTotal = returnItems.reduce(
    (sum, ri) => sum + ri.unitPriceCentavos * ri.quantity,
    0
  );

  // ── No active shift guard ───────────────────────────────────────────────────

  if (shift === undefined) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (shift === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-center space-y-4 shadow-lg">
          <RotateCcw className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="text-xl font-bold">No Active Shift</h1>
          <p className="text-sm text-muted-foreground">
            You need an active shift to process returns.
          </p>
          <Link
            href="/pos"
            className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Go to POS
          </Link>
        </div>
      </div>
    );
  }

  // ── Completion state ────────────────────────────────────────────────────────

  if (completedReceipt) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-center space-y-4 shadow-lg">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
          <h1 className="text-xl font-bold">Return Processed</h1>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Return Receipt</p>
            <p className="font-mono text-lg font-bold">{completedReceipt}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Refund Amount</p>
            <p className="text-2xl font-bold text-green-500">
              {formatCentavos(completedRefund)}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={resetFlow}
              className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted"
            >
              Process Another
            </button>
            <Link
              href="/pos"
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 text-center"
            >
              Back to POS
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/pos"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            POS
          </Link>
          <div className="h-4 w-px bg-border" />
          <h1 className="text-lg font-bold flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Returns
          </h1>

          {/* Step indicator */}
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            {(
              [
                { key: "lookup", label: "Receipt" },
                { key: "select_items", label: "Items" },
                { key: "reasons", label: "Reasons" },
                { key: "type", label: "Type" },
                { key: "confirm", label: "Confirm" },
              ] as { key: Step; label: string }[]
            ).map((s, i, arr) => (
              <span key={s.key} className="flex items-center gap-1">
                <span
                  className={
                    step === s.key
                      ? "rounded-full bg-primary px-2 py-0.5 text-primary-foreground font-medium"
                      : "opacity-50"
                  }
                >
                  {s.label}
                </span>
                {i < arr.length - 1 && (
                  <ChevronRight className="h-3 w-3 opacity-30" />
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl">
          {/* ── Step 1: Receipt Lookup ─────────────────────────────────── */}
          {step === "lookup" && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-card p-6 space-y-4 shadow-sm">
                <div className="text-center space-y-1">
                  <Search className="mx-auto h-8 w-8 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Look Up Transaction</h2>
                  <p className="text-sm text-muted-foreground">
                    Enter the receipt number from the original purchase
                  </p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={receiptInput}
                    onChange={(e) => setReceiptInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleLookup();
                    }}
                    placeholder="e.g. 20260308-0001"
                    className="flex-1 rounded-lg border bg-background px-3 py-2.5 text-base font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
                    autoFocus
                  />
                  <button
                    onClick={handleLookup}
                    disabled={searching}
                    className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                  >
                    {searching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    Search
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Select Items ──────────────────────────────────── */}
          {step === "select_items" && transaction && (
            <div className="space-y-4">
              {/* Transaction info */}
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Receipt</p>
                    <p className="font-mono font-bold">
                      {transaction.receiptNumber}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-bold">
                      {formatCentavos(transaction.totalCentavos)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="text-sm">
                      {new Date(transaction.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Items list */}
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="border-b px-4 py-3">
                  <h3 className="font-semibold">
                    Select Items to Return
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Tap an item to select it for return
                  </p>
                </div>
                <div className="divide-y">
                  {transaction.items.map((item) => {
                    const alreadyReturned =
                      transaction.returnedQuantities[
                        item.variantId as string
                      ] ?? 0;
                    const maxQty = item.quantity - alreadyReturned;
                    const isSelected = returnItems.some(
                      (ri) =>
                        (ri.variantId as string) ===
                        (item.variantId as string)
                    );
                    const isFullyReturned = maxQty <= 0;

                    return (
                      <button
                        key={item._id}
                        onClick={() => toggleItem(item)}
                        disabled={isFullyReturned}
                        className={`w-full px-4 py-3 text-left transition-colors ${
                          isFullyReturned
                            ? "opacity-40 cursor-not-allowed"
                            : isSelected
                              ? "bg-primary/10 border-l-4 border-l-primary"
                              : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-5 w-5 rounded-md border-2 flex items-center justify-center ${
                                isSelected
                                  ? "bg-primary border-primary"
                                  : "border-muted-foreground/30"
                              }`}
                            >
                              {isSelected && (
                                <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium">{item.styleName}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.size} · {item.color}
                                {item.sku && ` · ${item.sku}`}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold tabular-nums">
                              {formatCentavos(item.unitPriceCentavos)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Qty: {item.quantity}
                              {alreadyReturned > 0 && (
                                <span className="text-amber-500">
                                  {" "}
                                  ({alreadyReturned} returned)
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected items quantity adjustment */}
              {returnItems.length > 0 && (
                <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
                  <h3 className="font-semibold text-sm">
                    Return Quantities
                  </h3>
                  {returnItems.map((ri) => (
                    <div
                      key={ri.variantId as string}
                      className="flex items-center justify-between"
                    >
                      <p className="text-sm">
                        {ri.styleName}{" "}
                        <span className="text-muted-foreground">
                          ({ri.size} · {ri.color})
                        </span>
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            updateReturnQty(
                              ri.variantId as string,
                              ri.quantity - 1
                            )
                          }
                          disabled={ri.quantity <= 1}
                          className="h-7 w-7 rounded-md border text-sm font-bold hover:bg-muted disabled:opacity-30"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-semibold tabular-nums">
                          {ri.quantity}
                        </span>
                        <button
                          onClick={() =>
                            updateReturnQty(
                              ri.variantId as string,
                              ri.quantity + 1
                            )
                          }
                          disabled={ri.quantity >= ri.maxQuantity}
                          className="h-7 w-7 rounded-md border text-sm font-bold hover:bg-muted disabled:opacity-30"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={resetFlow}
                  className="rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={goToReasons}
                  disabled={returnItems.length === 0}
                  className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  Next: Select Reasons
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Reasons ───────────────────────────────────────── */}
          {step === "reasons" && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="border-b px-4 py-3">
                  <h3 className="font-semibold">Reason for Return</h3>
                  <p className="text-xs text-muted-foreground">
                    Select a reason for each item being returned
                  </p>
                </div>
                <div className="divide-y">
                  {returnItems.map((ri) => (
                    <div
                      key={ri.variantId as string}
                      className="px-4 py-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm">
                          {ri.styleName}{" "}
                          <span className="text-muted-foreground">
                            ({ri.size} · {ri.color}) x{ri.quantity}
                          </span>
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {RETURN_REASONS.map((reason) => (
                          <button
                            key={reason.value}
                            onClick={() =>
                              updateReturnReason(
                                ri.variantId as string,
                                reason.value
                              )
                            }
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                              ri.reason === reason.value
                                ? "border-primary bg-primary text-primary-foreground"
                                : "hover:border-primary/50 hover:text-foreground"
                            }`}
                          >
                            {reason.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep("select_items")}
                  className="rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted"
                >
                  Back
                </button>
                <button
                  onClick={goToType}
                  className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2"
                >
                  Next: Return Type
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Return Type ───────────────────────────────────── */}
          {step === "type" && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
                <h3 className="font-semibold">Choose Return Type</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setReturnType("refund")}
                    className={`rounded-xl border-2 p-4 text-center transition-colors ${
                      returnType === "refund"
                        ? "border-primary bg-primary/10"
                        : "border-muted hover:border-primary/50"
                    }`}
                  >
                    <Banknote className="mx-auto h-8 w-8 mb-2 text-green-500" />
                    <p className="font-semibold">Refund</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Return money to customer
                    </p>
                  </button>
                  <button
                    onClick={() => setReturnType("exchange")}
                    className={`rounded-xl border-2 p-4 text-center transition-colors ${
                      returnType === "exchange"
                        ? "border-primary bg-primary/10"
                        : "border-muted hover:border-primary/50"
                    }`}
                  >
                    <RefreshCw className="mx-auto h-8 w-8 mb-2 text-blue-500" />
                    <p className="font-semibold">Exchange</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Swap for different items
                    </p>
                  </button>
                </div>
                {returnType === "exchange" && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Exchange items can be selected at the POS after this
                      return is processed. The refund credit of{" "}
                      <strong>{formatCentavos(refundTotal)}</strong> will be
                      recorded.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep("reasons")}
                  className="rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted"
                >
                  Back
                </button>
                <button
                  onClick={goToConfirm}
                  className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2"
                >
                  Next: Review
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 5: Confirmation ──────────────────────────────────── */}
          {step === "confirm" && transaction && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="border-b px-4 py-3">
                  <h3 className="font-semibold">Return Summary</h3>
                </div>

                {/* Original transaction */}
                <div className="border-b px-4 py-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">
                    Original Transaction
                  </p>
                  <p className="font-mono font-bold">
                    {transaction.receiptNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(transaction.createdAt).toLocaleString()} ·{" "}
                    {transaction.paymentMethod.toUpperCase()}
                  </p>
                </div>

                {/* Items being returned */}
                <div className="divide-y">
                  {returnItems.map((ri) => (
                    <div
                      key={ri.variantId as string}
                      className="px-4 py-3 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium text-sm">{ri.styleName}</p>
                        <p className="text-xs text-muted-foreground">
                          {ri.size} · {ri.color} · Qty: {ri.quantity}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Reason:{" "}
                          {
                            RETURN_REASONS.find((r) => r.value === ri.reason)
                              ?.label
                          }
                        </p>
                      </div>
                      <p className="font-semibold text-red-500 tabular-nums">
                        -{formatCentavos(ri.unitPriceCentavos * ri.quantity)}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="border-t px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Return Type
                    </p>
                    <p className="font-semibold capitalize">{returnType}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Refund Amount</p>
                    <p className="text-lg font-bold text-green-500">
                      {formatCentavos(refundTotal)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep("type")}
                  className="rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted"
                >
                  Back
                </button>
                <button
                  onClick={handleProcess}
                  disabled={processing}
                  className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {processing ? "Processing..." : "Confirm Return"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

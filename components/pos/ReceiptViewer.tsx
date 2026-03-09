"use client";

import { Component, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Loader2, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { SendReceiptForm } from "@/components/pos/SendReceiptForm";
import dynamic from "next/dynamic";

// Single dynamic import that loads both BlobProvider and ReceiptPDF together,
// ensuring BlobProvider receives a real <Document> element (not a dynamic wrapper)
const DownloadPDFSection = dynamic(
  () => import("@/components/pos/DownloadPDFSection"),
  { ssr: false, loading: () => (
    <Button className="min-h-14 w-full gap-2 text-lg" disabled>
      <Loader2 className="h-5 w-5 animate-spin" />
      Loading...
    </Button>
  )}
);

// ─── Error Boundary ─────────────────────────────────────────────────────────

class ReceiptErrorBoundary extends Component<
  { onClose: () => void; children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { onClose: () => void; children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/95">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="mt-2 text-sm font-medium text-destructive">
            Failed to load receipt
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            The receipt could not be found or you do not have access.
          </p>
          <Button variant="outline" className="mt-4 min-h-14" onClick={this.props.onClose}>
            Close
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ReceiptViewer({
  transactionId,
  onClose,
}: {
  transactionId: Id<"transactions">;
  onClose: () => void;
}) {
  return (
    <ReceiptErrorBoundary onClose={onClose}>
      <ReceiptViewerInner transactionId={transactionId} onClose={onClose} />
    </ReceiptErrorBoundary>
  );
}

function ReceiptViewerInner({
  transactionId,
  onClose,
}: {
  transactionId: Id<"transactions">;
  onClose: () => void;
}) {
  const receiptData = useQuery(api.pos.receipts.getReceiptData, {
    transactionId,
  });

  // Loading state
  if (receiptData === undefined) {
    return (
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/95">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          Loading receipt...
        </p>
      </div>
    );
  }

  const { transaction: txn, items, branch, business, businessAddress, cashierName } =
    receiptData;
  const isDiscounted =
    txn.discountType === "senior" || txn.discountType === "pwd";

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-bold">Receipt</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Scrollable receipt preview */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto w-full max-w-[320px] rounded-md border bg-white p-4 font-mono text-xs shadow-sm">
          {/* Header */}
          <div className="text-center">
            <p className="text-sm font-bold">
              {business.name || "RedBox Apparel"}
            </p>
            {business.tin && (
              <p className="text-[10px] text-gray-600">TIN: {business.tin}</p>
            )}
            <p className="text-[10px] text-gray-600">
              {businessAddress || branch.address}
            </p>
            {businessAddress && businessAddress !== branch.address && (
              <p className="text-[10px] text-gray-600">
                Branch: {branch.name} - {branch.address}
              </p>
            )}
          </div>

          <hr className="my-2 border-dashed" />

          {/* Metadata */}
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span className="text-gray-500">Receipt #:</span>
              <span className="font-bold">{txn.receiptNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Date:</span>
              <span className="font-bold">
                {formatDateTime(txn.createdAt)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Cashier:</span>
              <span className="font-bold">{cashierName}</span>
            </div>
          </div>

          <hr className="my-2 border-dashed" />

          {/* Items */}
          <div className="space-y-1.5">
            {items.map((item, idx) => (
              <div key={idx}>
                <p>
                  {item.styleName} - {item.size}/{item.color}
                </p>
                <div className="flex justify-between text-gray-600">
                  <span>
                    {item.quantity} x {formatCurrency(item.unitPriceCentavos)}
                  </span>
                  <span className="font-bold text-black">
                    {formatCurrency(item.lineTotalCentavos)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <hr className="my-2 border-dashed" />

          {/* Tax breakdown */}
          {isDiscounted ? (
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span>Subtotal (VAT-Inclusive):</span>
                <span>{formatCurrency(txn.subtotalCentavos)}</span>
              </div>
              <div className="flex justify-between">
                <span>Less: VAT:</span>
                <span>-{formatCurrency(txn.vatAmountCentavos)}</span>
              </div>
              <div className="flex justify-between">
                <span>VAT-Exempt Amount:</span>
                <span>
                  {formatCurrency(
                    txn.subtotalCentavos - txn.vatAmountCentavos
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span>
                  Less: {txn.discountType === "senior" ? "SC" : "PWD"} Discount
                  (20%):
                </span>
                <span>-{formatCurrency(txn.discountAmountCentavos)}</span>
              </div>
              <hr className="my-1 border-dashed" />
              <div className="flex justify-between text-sm font-bold">
                <span>TOTAL:</span>
                <span>{formatCurrency(txn.totalCentavos)}</span>
              </div>
              <div className="flex justify-between">
                <span>VAT Amount:</span>
                <span>₱0.00</span>
              </div>
              <div className="flex justify-between font-bold text-green-600">
                <span>You Save:</span>
                <span>
                  {formatCurrency(txn.subtotalCentavos - txn.totalCentavos)}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{formatCurrency(txn.subtotalCentavos)}</span>
              </div>
              <div className="flex justify-between">
                <span>VAT (12%):</span>
                <span>{formatCurrency(txn.vatAmountCentavos)}</span>
              </div>
              <hr className="my-1 border-dashed" />
              <div className="flex justify-between text-sm font-bold">
                <span>TOTAL:</span>
                <span>{formatCurrency(txn.totalCentavos)}</span>
              </div>
            </div>
          )}

          <hr className="my-2 border-dashed" />

          {/* Payment */}
          {txn.splitPayment ? (
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span>{txn.paymentMethod === "cash" ? "Cash" : txn.paymentMethod === "gcash" ? "GCash" : "Maya"}:</span>
                <span className="font-bold">
                  {formatCurrency(txn.totalCentavos - txn.splitPayment.amountCentavos)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{txn.splitPayment.method === "cash" ? "Cash" : txn.splitPayment.method === "gcash" ? "GCash" : "Maya"}:</span>
                <span className="font-bold">
                  {formatCurrency(txn.splitPayment.amountCentavos)}
                </span>
              </div>
              {txn.paymentMethod === "cash" && (
                <>
                  <div className="flex justify-between">
                    <span>Cash Tendered:</span>
                    <span>{formatCurrency(txn.amountTenderedCentavos ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Change:</span>
                    <span>{formatCurrency(txn.changeCentavos ?? 0)}</span>
                  </div>
                </>
              )}
            </div>
          ) : txn.paymentMethod === "cash" ? (
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span>Cash Tendered:</span>
                <span>
                  {formatCurrency(txn.amountTenderedCentavos ?? 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Change:</span>
                <span>{formatCurrency(txn.changeCentavos ?? 0)}</span>
              </div>
            </div>
          ) : (
            <div className="flex justify-between">
              <span>Payment:</span>
              <span>
                {txn.paymentMethod === "gcash" ? "GCash" : "Maya"}
              </span>
            </div>
          )}

          <hr className="my-2 border-dashed" />

          {/* Footer */}
          <div className="text-center">
            <p>Thank you for your purchase!</p>
            <p className="mt-1 font-bold">
              THIS SERVES AS YOUR OFFICIAL RECEIPT
            </p>
          </div>
        </div>
      </div>

      {/* Digital receipt sending */}
      <div className="border-t p-4">
        <p className="mb-2 text-sm font-medium">Send Digital Receipt</p>
        <SendReceiptForm transactionId={transactionId} />
      </div>

      {/* Bottom actions */}
      <div className="border-t p-4">
        <DownloadPDFSection receiptData={receiptData} />
      </div>
    </div>
  );
}

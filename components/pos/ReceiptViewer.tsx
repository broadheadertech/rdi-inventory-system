"use client";

import { Component, useState, type ReactNode } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Loader2, X, AlertCircle, Gift, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

const DownloadGiftPDFSection = dynamic(
  () => import("@/components/pos/DownloadGiftPDFSection"),
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
  const [tab, setTab] = useState<"receipt" | "gift">("receipt");

  const receiptData = useQuery(api.pos.receipts.getReceiptData, {
    transactionId,
  });
  const logReprint = useMutation(api.pos.receipts.logReprint);

  async function handleReprint() {
    try {
      await logReprint({ transactionId });
    } catch {
      // non-blocking — still let them print
    }
    window.print();
  }

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
  const bir = receiptData.bir ?? {};
  const customer = receiptData.customer ?? {};
  const scPwd = receiptData.scPwd ?? {};
  const isDiscounted =
    txn.discountType === "senior" || txn.discountType === "pwd";

  // Mirror ReceiptPDF: accredited only when a PTU / Accreditation No. exists.
  const accredited = !!(bir.accreditationNumber || bir.ptuNumber);
  const vatableSales = isDiscounted ? 0 : txn.subtotalCentavos;
  const vatExemptSales = isDiscounted ? txn.subtotalCentavos - txn.vatAmountCentavos : 0;
  const vatAmount = isDiscounted ? 0 : txn.vatAmountCentavos;
  const vatRegTin = bir.tin || business.tin;
  const fieldOrBlank = (v?: string) => (v && v.trim() ? v : "__________");

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-bold">Receipt</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b">
        <button
          onClick={() => setTab("receipt")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors",
            tab === "receipt"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Receipt className="h-4 w-4" />
          Receipt
        </button>
        <button
          onClick={() => setTab("gift")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors",
            tab === "gift"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Gift className="h-4 w-4" />
          Gift Receipt
        </button>
      </div>

      {/* Scrollable receipt preview */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "receipt" ? (
          /* ── Sales Invoice / Order Slip ── */
          <div className="mx-auto w-full max-w-[320px] rounded-md border bg-white p-4 font-mono text-xs shadow-sm">
            {/* Header */}
            <div className="text-center">
              <p className="text-sm font-bold">{business.name || "RedBox Apparel"}</p>
              <p className="text-[10px] text-gray-600">
                {businessAddress || branch.address}
              </p>
              <p className="text-[10px] text-gray-600">
                VAT REG TIN: {vatRegTin || "__________"}
              </p>
              <p className="text-[10px] text-gray-600">
                {branch.name}{branch.address ? ` — ${branch.address}` : ""}
              </p>
            </div>

            <p className="my-2 text-center text-sm font-bold tracking-widest">
              {accredited ? "SALES INVOICE" : "ORDER SLIP"}
            </p>

            <hr className="my-2 border-dashed" />

            {/* Metadata */}
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span className="text-gray-500">SI No.:</span>
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

            {/* Sold To */}
            <div className="space-y-0.5">
              <p className="font-bold">Sold To:</p>
              <p>Name: {fieldOrBlank(customer.name)}</p>
              <p>TIN: {fieldOrBlank(customer.tin)}</p>
              <p>Address: {fieldOrBlank(customer.address)}</p>
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

            {/* VAT summary box (BIR) */}
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span>VATable Sales:</span>
                <span>{formatCurrency(vatableSales)}</span>
              </div>
              <div className="flex justify-between">
                <span>VAT-Exempt Sales:</span>
                <span>{formatCurrency(vatExemptSales)}</span>
              </div>
              <div className="flex justify-between">
                <span>Zero-Rated Sales:</span>
                <span>{formatCurrency(0)}</span>
              </div>
              <div className="flex justify-between">
                <span>VAT Amount (12%):</span>
                <span>{formatCurrency(vatAmount)}</span>
              </div>
              <hr className="my-1 border-dashed" />
              <div className="flex justify-between">
                <span>Total Sales (VAT Inclusive):</span>
                <span>{formatCurrency(txn.subtotalCentavos)}</span>
              </div>
              {isDiscounted && (
                <>
                  <div className="flex justify-between">
                    <span>Less: VAT</span>
                    <span>-{formatCurrency(txn.vatAmountCentavos)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>
                      Less: {txn.discountType === "senior" ? "SC" : "PWD"} Discount (20%)
                    </span>
                    <span>-{formatCurrency(txn.discountAmountCentavos)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-sm font-bold">
                <span>TOTAL AMOUNT DUE:</span>
                <span>{formatCurrency(txn.totalCentavos)}</span>
              </div>
            </div>

            {isDiscounted && (
              <>
                <hr className="my-2 border-dashed" />
                <div className="space-y-0.5">
                  <p className="font-bold">
                    {txn.discountType === "senior" ? "Senior Citizen" : "PWD"} Details:
                  </p>
                  <p>Name: {fieldOrBlank(scPwd.name)}</p>
                  <p>
                    {txn.discountType === "senior" ? "OSCA/SC ID" : "PWD ID"} No.:{" "}
                    {fieldOrBlank(scPwd.idNumber)}
                  </p>
                  <p>Signature: __________</p>
                </div>
              </>
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

            {/* Footer — two modes mirror the PDF */}
            <div className="text-center space-y-0.5">
              <p>
                {bir.softwareName || "RedBox POS"}
                {bir.softwareVersion ? ` v${bir.softwareVersion}` : ""}
              </p>
              {accredited ? (
                <>
                  <p>MIN: {fieldOrBlank(bir.minNumber)}</p>
                  <p>Serial No.: {fieldOrBlank(bir.serialNumber)}</p>
                  <p>Accreditation No.: {fieldOrBlank(bir.accreditationNumber)}</p>
                  {bir.ptuNumber && <p>PTU No.: {bir.ptuNumber}</p>}
                  <p className="mt-1 font-bold">THIS SERVES AS YOUR SALES INVOICE</p>
                </>
              ) : (
                <>
                  <p className="mt-1 font-bold">THIS IS NOT AN OFFICIAL RECEIPT</p>
                  <p className="text-[10px] text-gray-500">
                    Not valid for claim of input tax.
                  </p>
                  <p className="text-[10px] text-gray-500">
                    Please request your BIR-registered Sales Invoice.
                  </p>
                </>
              )}
              <p>Thank you for your purchase!</p>
            </div>
          </div>
        ) : (
          /* ── Gift Receipt ── */
          <div className="mx-auto w-full max-w-[320px] rounded-md border bg-white p-4 font-mono text-xs shadow-sm">
            {/* Header */}
            <div className="text-center">
              <p className="text-sm font-bold">
                {business.name || "RedBox Apparel"}
              </p>
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

            <p className="text-center text-sm font-bold tracking-widest">
              — GIFT RECEIPT —
            </p>

            <hr className="my-2 border-dashed" />

            {/* Metadata (ref + date only — no cashier, no prices) */}
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span className="text-gray-500">Ref #:</span>
                <span className="font-bold">{txn.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Date:</span>
                <span className="font-bold">
                  {formatDateTime(txn.createdAt)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Branch:</span>
                <span className="font-bold">{branch.name}</span>
              </div>
            </div>

            <hr className="my-2 border-dashed" />

            {/* Items — name, size, color, qty only */}
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx}>
                  <p className="font-bold">{item.styleName}</p>
                  <p className="text-gray-500">
                    {item.size} / {item.color}
                    {item.sku ? `  ·  SKU: ${item.sku}` : ""}
                  </p>
                  <p>Qty: {item.quantity}</p>
                </div>
              ))}
            </div>

            <hr className="my-2 border-dashed" />

            {/* Exchange policy */}
            <div className="text-center space-y-0.5">
              <p className="font-bold">This item was a gift!</p>
              <p className="text-gray-500 text-[10px]">
                Items may be exchanged within 30 days
              </p>
              <p className="text-gray-500 text-[10px]">
                with this receipt at any RedBox Apparel branch.
              </p>
              <p className="text-gray-500 text-[10px]">
                Subject to availability. No cash value.
              </p>
              <p className="mt-1 font-bold">GIFT RECEIPT</p>
            </div>
          </div>
        )}
      </div>

      {/* Digital receipt sending — only on the invoice tab */}
      {tab === "receipt" && (
        <div className="border-t p-4">
          <p className="mb-2 text-sm font-medium">Send Digital Receipt</p>
          <SendReceiptForm transactionId={transactionId} />
        </div>
      )}

      {/* Bottom actions */}
      <div className="border-t p-4 space-y-2">
        {tab === "receipt" ? (
          <>
            <DownloadPDFSection receiptData={receiptData} />
            <button
              onClick={handleReprint}
              className="w-full rounded-lg border py-2.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              Reprint Receipt
            </button>
          </>
        ) : (
          <DownloadGiftPDFSection receiptData={receiptData} />
        )}
      </div>
    </div>
  );
}

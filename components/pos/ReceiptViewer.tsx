"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { Loader2, X, AlertCircle, Gift, Receipt, Printer, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
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

// ─── Receipt modal ───────────────────────────────────────────────────────────
// One modal for a receipt, whether the sale was just rung or is being looked
// up again: the receipt (or gift receipt) on the left, and printing, PDF and
// digital sending on the right. Printing prints a copy placed directly under
// <body> (see .print-portal in globals.css), so only the receipt comes out of
// the printer — not the POS screen behind it.
//
// After a sale the first print is the original. Any later print, and every
// print of a receipt looked up again, is a reprint and is logged for BIR.

type ReceiptData = NonNullable<FunctionReturnType<typeof api.pos.receipts.getReceiptData>>;
type ReceiptTab = "receipt" | "gift";

/** The sale that was just completed, when the modal opens straight after it. */
export type SaleSummary = {
  receiptNumber: string;
  totalCentavos: number;
  changeCentavos: number;
  paymentMethod: string;
};

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex w-full max-w-sm flex-col items-center rounded-xl border bg-card p-6 text-center shadow-xl">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="mt-2 text-sm font-medium text-destructive">Failed to load receipt</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The receipt could not be found or you do not have access.
            </p>
            <Button variant="outline" className="mt-4 min-h-12" onClick={this.props.onClose}>
              Close
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── The receipt itself ──────────────────────────────────────────────────────

function ReceiptDocument({ receiptData, tab }: { receiptData: ReceiptData; tab: ReceiptTab }) {
  const { transaction: txn, items, branch, business, businessAddress, cashierName } = receiptData;
  const bir = receiptData.bir ?? {};
  const customer = receiptData.customer ?? {};
  const scPwd = receiptData.scPwd ?? {};
  const isDiscounted = txn.discountType === "senior" || txn.discountType === "pwd";

  // Mirror ReceiptPDF: accredited only when a PTU / Accreditation No. exists.
  const accredited = !!(bir.accreditationNumber || bir.ptuNumber);
  const vatableSales = isDiscounted ? 0 : txn.subtotalCentavos;
  const vatExemptSales = isDiscounted ? txn.subtotalCentavos - txn.vatAmountCentavos : 0;
  const vatAmount = isDiscounted ? 0 : txn.vatAmountCentavos;
  const vatRegTin = bir.tin || business.tin;
  const fieldOrBlank = (v?: string) => (v && v.trim() ? v : "__________");

  return (
    <>
        {tab === "receipt" ? (
          /* ── Sales Invoice / Order Slip ── */
          <div className="thermal-receipt mx-auto w-full max-w-[320px] rounded-md border bg-white p-4 font-mono text-xs shadow-sm">
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
                  <span>{PAYMENT_METHOD_LABELS[txn.paymentMethod]}:</span>
                  <span className="font-bold">
                    {formatCurrency(txn.totalCentavos - txn.splitPayment.amountCentavos)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{PAYMENT_METHOD_LABELS[txn.splitPayment.method]}:</span>
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
                <span>{PAYMENT_METHOD_LABELS[txn.paymentMethod]}</span>
              </div>
            )}
            {txn.paymentReference && (
              <div className="flex justify-between">
                <span>Ref. No.:</span>
                <span className="font-mono">{txn.paymentReference}</span>
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
          <div className="thermal-receipt mx-auto w-full max-w-[320px] rounded-md border bg-white p-4 font-mono text-xs shadow-sm">
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
    </>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ReceiptViewer({
  transactionId,
  onClose,
  sale,
}: {
  transactionId: Id<"transactions">;
  onClose: () => void;
  sale?: SaleSummary;
}) {
  return (
    <ReceiptErrorBoundary onClose={onClose}>
      <ReceiptViewerInner transactionId={transactionId} onClose={onClose} sale={sale} />
    </ReceiptErrorBoundary>
  );
}

function ReceiptViewerInner({
  transactionId,
  onClose,
  sale,
}: {
  transactionId: Id<"transactions">;
  onClose: () => void;
  sale?: SaleSummary;
}) {
  const [tab, setTab] = useState<ReceiptTab>("receipt");
  const [printedOnce, setPrintedOnce] = useState(false);
  const receiptData = useQuery(api.pos.receipts.getReceiptData, { transactionId });
  const logReprint = useMutation(api.pos.receipts.logReprint);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The sales invoice printed straight after the sale is the original; any
  // other print of it is a reprint. Gift receipts are not counted.
  const isReprint = tab === "receipt" && (!sale || printedOnce);

  async function handlePrint() {
    if (isReprint) {
      try {
        await logReprint({ transactionId });
      } catch {
        // non-blocking — still let them print
      }
    }
    if (tab === "receipt") setPrintedOnce(true);
    // Let the print copy settle before the print dialog opens.
    requestAnimationFrame(() => window.print());
  }

  const printLabel = tab === "gift" ? "Print gift receipt" : isReprint ? "Reprint receipt" : "Print receipt";

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4 print:hidden"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Receipt"
        className="flex h-full w-full flex-col overflow-hidden bg-card shadow-xl sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-xl sm:border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
          {sale ? (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
                <Check className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-lg font-bold">Sale complete</p>
                <p className="text-xs text-muted-foreground">
                  Receipt #{sale.receiptNumber} · {formatCurrency(sale.totalCentavos)}
                </p>
              </div>
            </div>
          ) : (
            <h2 className="text-lg font-bold">
              Receipt{receiptData ? ` #${receiptData.transaction.receiptNumber}` : ""}
            </h2>
          )}
          <div className="flex items-center gap-3">
            {sale && sale.paymentMethod === "cash" && sale.changeCentavos > 0 && (
              <div className="text-right">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Change</p>
                <p className="text-2xl font-bold tabular-nums text-green-600">
                  {formatCurrency(sale.changeCentavos)}
                </p>
              </div>
            )}
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close receipt">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {receiptData === undefined ? (
          <div className="flex flex-1 flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Loading receipt...</p>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_17rem] md:overflow-hidden">
            {/* Receipt preview */}
            <div className="flex min-h-0 flex-col border-b md:border-b-0 md:border-r">
              <div className="flex border-b">
                {(
                  [
                    { key: "receipt", label: "Receipt", icon: Receipt },
                    { key: "gift", label: "Gift Receipt", icon: Gift },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors",
                      tab === t.key
                        ? "border-b-2 border-primary text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <t.icon className="h-4 w-4" />
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-4">
                <ReceiptDocument receiptData={receiptData} tab={tab} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex min-h-0 flex-col gap-3 p-4 md:overflow-y-auto">
              <Button className="h-12 w-full gap-2 text-base" onClick={handlePrint}>
                <Printer className="h-5 w-5" />
                {printLabel}
              </Button>
              {tab === "receipt" ? (
                <DownloadPDFSection receiptData={receiptData} />
              ) : (
                <DownloadGiftPDFSection receiptData={receiptData} />
              )}
              {tab === "receipt" && (
                <div className="border-t pt-3">
                  <p className="mb-2 text-sm font-medium">Send digital receipt</p>
                  <SendReceiptForm transactionId={transactionId} />
                </div>
              )}
              <div className="mt-auto pt-2">
                <Button variant={sale ? "default" : "outline"} className="h-12 w-full" onClick={onClose}>
                  {sale ? "New sale" : "Close"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* The copy that prints — directly under <body>, hidden on screen */}
      {receiptData &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="print-portal hidden print:block">
            <ReceiptDocument receiptData={receiptData} tab={tab} />
          </div>,
          document.body
        )}
    </div>
  );
}

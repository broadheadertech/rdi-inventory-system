"use client";

import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  Banknote,
  CreditCard,
  Smartphone,
  Clock,
  Package,
  TrendingUp,
  Users,
  Hash,
  Printer,
  Receipt,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type ProductSale = {
  variantId: string;
  styleName: string;
  sku: string;
  size: string;
  color: string;
  quantitySold: number;
  totalRevenueCentavos: number;
};

type HourlyEntry = {
  hour: number;
  amountCentavos: number;
};

type CashierEntry = {
  cashierId: string;
  cashierName: string;
  shiftCount: number;
  transactionCount: number;
  totalSalesCentavos: number;
  cashSalesCentavos: number;
  gcashSalesCentavos: number;
  mayaSalesCentavos: number;
  cashFundCentavos: number;
};

type BaseReading = {
  readingType: "X" | "Y" | "Z";
  generatedAt: number;
  transactionCount: number;
  totalSalesCentavos: number;
  cashSalesCentavos: number;
  gcashSalesCentavos: number;
  mayaSalesCentavos: number;
  vatAmountCentavos: number;
  discountAmountCentavos: number;
  firstReceiptNumber: string | null;
  lastReceiptNumber: string | null;
  topProducts: ProductSale[];
  hourlyBreakdown: HourlyEntry[];
  averageTransactionCentavos: number;
  totalItemsSold: number;
};

type XReading = BaseReading & {
  readingType: "X";
  cashierName: string;
  shiftOpenedAt: number;
  cashFundCentavos: number;
  cashInDrawerCentavos: number;
};

type YReading = BaseReading & {
  readingType: "Y";
  cashierName: string;
  shiftOpenedAt: number;
  shiftClosedAt: number | null;
  shiftDurationMs: number;
  cashFundCentavos: number;
  closedCashBalanceCentavos: number | null;
  cashInDrawerCentavos: number;
  status: string;
  notes: string | null;
};

type ZReading = BaseReading & {
  readingType: "Z";
  date: string;
  totalShifts: number;
  openShiftCount: number;
  closedShiftCount: number;
  totalCashFundCentavos: number;
  expectedCashInDrawerCentavos: number;
  cashierBreakdown: CashierEntry[];
  reconciliation: {
    actualCashCentavos: number;
    expectedCashCentavos: number;
    differenceCentavos: number;
    submittedAt: number;
  } | null;
  // BIR accumulated grand total context
  zCounterNext?: number;
  alreadyFinalized?: boolean;
  finalizedZCounter?: number | null;
  previousGrandTotalCentavos?: number;
  projectedGrandTotalCentavos?: number;
};

export type ReadingData = XReading | YReading | ZReading;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

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

const READING_LABELS = {
  X: { title: "X-Reading", subtitle: "Mid-Shift Snapshot", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  Y: { title: "Y-Reading", subtitle: "End-of-Shift Report", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  Z: { title: "Z-Reading", subtitle: "End-of-Day Summary", color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
};

// ─── Component ──────────────────────────────────────────────────────────────

export function ReadingReport({
  data,
  onClose,
  showPrint = true,
  onFinalize,
  finalizing = false,
}: {
  data: ReadingData;
  onClose?: () => void;
  showPrint?: boolean;
  onFinalize?: () => void;
  finalizing?: boolean;
}) {
  const label = READING_LABELS[data.readingType];

  function handlePrint() {
    window.print();
  }

  return (
    <div className="reading-report space-y-5">
      {/* Header */}
      <div className="text-center space-y-1">
        <div
          className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold ${label.bg} ${label.border} border ${label.color}`}
        >
          <Receipt className="h-4 w-4" />
          {label.title}
        </div>
        <p className="text-xs text-muted-foreground">{label.subtitle}</p>
        <p className="text-xs text-muted-foreground">
          Generated: {formatDate(data.generatedAt, { hour: "numeric", minute: "numeric", second: "numeric" })}
        </p>
      </div>

      {/* Shift Info (X and Y) */}
      {(data.readingType === "X" || data.readingType === "Y") && (
        <div className="rounded-lg border p-3 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Shift Details
          </h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Cashier</span>
              <p className="font-medium">{data.cashierName}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Opened</span>
              <p className="font-medium">
                {formatDate(data.shiftOpenedAt, { hour: "numeric", minute: "numeric" })}
              </p>
            </div>
            {data.readingType === "Y" && data.shiftClosedAt && (
              <>
                <div>
                  <span className="text-muted-foreground">Closed</span>
                  <p className="font-medium">
                    {formatDate(data.shiftClosedAt, { hour: "numeric", minute: "numeric" })}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Duration</span>
                  <p className="font-medium">{formatDuration(data.shiftDurationMs)}</p>
                </div>
              </>
            )}
            <div>
              <span className="text-muted-foreground">Cash Fund</span>
              <p className="font-medium">{formatCurrency(data.cashFundCentavos)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Cash in Drawer</span>
              <p className="font-bold text-green-600">
                {formatCurrency(data.cashInDrawerCentavos)}
              </p>
            </div>
          </div>
          {data.readingType === "Y" && data.notes && (
            <p className="text-xs text-muted-foreground border-t pt-2">
              Notes: {data.notes}
            </p>
          )}
        </div>
      )}

      {/* Z-Reading day info */}
      {data.readingType === "Z" && (
        <div className="rounded-lg border p-3 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Day Overview — {formatDateLabel(data.date)}
          </h3>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Total Shifts</span>
              <p className="font-bold text-lg">{data.totalShifts}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Closed</span>
              <p className="font-medium">{data.closedShiftCount}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Still Open</span>
              <p className={`font-medium ${data.openShiftCount > 0 ? "text-amber-600" : ""}`}>
                {data.openShiftCount}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm border-t pt-2">
            <div>
              <span className="text-muted-foreground">Total Cash Fund</span>
              <p className="font-medium">{formatCurrency(data.totalCashFundCentavos)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Expected Cash</span>
              <p className="font-bold text-green-600">
                {formatCurrency(data.expectedCashInDrawerCentavos)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Z-Reading: BIR Accumulated Grand Total */}
      {data.readingType === "Z" && (
        <div className="rounded-lg border p-3 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Hash className="h-4 w-4 text-muted-foreground" />
            Accumulated Grand Total (BIR)
          </h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Z-Counter</span>
              <span className="font-medium">
                #{data.alreadyFinalized ? data.finalizedZCounter : data.zCounterNext}
                {data.alreadyFinalized ? " (finalized)" : " (pending)"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Previous Grand Total</span>
              <span>{formatCurrency(data.previousGrandTotalCentavos ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Today&apos;s Sales</span>
              <span>{formatCurrency(data.totalSalesCentavos)}</span>
            </div>
            <div className="flex justify-between border-t pt-1.5 font-bold">
              <span>New Accumulated Grand Total</span>
              <span>
                {formatCurrency(data.projectedGrandTotalCentavos ?? data.totalSalesCentavos)}
              </span>
            </div>
          </div>
          {onFinalize && !data.alreadyFinalized && (
            <button
              onClick={onFinalize}
              disabled={finalizing}
              className="mt-2 w-full rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 print:hidden"
            >
              {finalizing ? "Finalizing…" : "Finalize Z-Reading"}
            </button>
          )}
          {data.alreadyFinalized && (
            <p className="text-xs text-green-600 print:hidden">
              ✓ Z-reading finalized for this date.
            </p>
          )}
        </div>
      )}

      {/* Sales Summary */}
      <div className="rounded-lg border p-3 space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          Sales Summary
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/50 p-2.5 text-center">
            <p className="text-xs text-muted-foreground">Transactions</p>
            <p className="text-xl font-bold">{data.transactionCount}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2.5 text-center">
            <p className="text-xs text-muted-foreground">Total Sales</p>
            <p className="text-xl font-bold">{formatCurrency(data.totalSalesCentavos)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2.5 text-center">
            <p className="text-xs text-muted-foreground">Items Sold</p>
            <p className="text-xl font-bold">{data.totalItemsSold}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2.5 text-center">
            <p className="text-xs text-muted-foreground">Avg / Txn</p>
            <p className="text-xl font-bold">{formatCurrency(data.averageTransactionCentavos)}</p>
          </div>
        </div>
      </div>

      {/* Payment Method Breakdown */}
      <div className="rounded-lg border p-3 space-y-2">
        <h3 className="text-sm font-semibold">Payment Breakdown</h3>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-green-600" />
              Cash
            </span>
            <span className="font-semibold">{formatCurrency(data.cashSalesCentavos)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-blue-600" />
              GCash
            </span>
            <span className="font-semibold">{formatCurrency(data.gcashSalesCentavos)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-emerald-600" />
              Maya
            </span>
            <span className="font-semibold">{formatCurrency(data.mayaSalesCentavos)}</span>
          </div>
          <div className="flex items-center justify-between text-sm border-t pt-1.5">
            <span className="text-muted-foreground">VAT Collected</span>
            <span className="font-medium">{formatCurrency(data.vatAmountCentavos)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Discounts Given</span>
            <span className="font-medium">{formatCurrency(data.discountAmountCentavos)}</span>
          </div>
        </div>
      </div>

      {/* Receipt Range */}
      {data.firstReceiptNumber && (
        <div className="rounded-lg border p-3 space-y-1">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Hash className="h-4 w-4 text-muted-foreground" />
            Receipt Range
          </h3>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">First</span>
            <span className="font-mono text-xs">{data.firstReceiptNumber}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Last</span>
            <span className="font-mono text-xs">{data.lastReceiptNumber}</span>
          </div>
        </div>
      )}

      {/* Top Products */}
      {data.topProducts.length > 0 && (
        <div className="rounded-lg border p-3 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Package className="h-4 w-4 text-muted-foreground" />
            Top Selling Products
          </h3>
          <div className="space-y-1.5">
            {data.topProducts.slice(0, 5).map((product, i) => (
              <div
                key={product.variantId}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{product.styleName}</p>
                    <p className="text-xs text-muted-foreground">
                      {product.size} · {product.color}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="font-semibold">{product.quantitySold} sold</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(product.totalRevenueCentavos)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hourly Breakdown */}
      {data.hourlyBreakdown.length > 0 && (
        <div className="rounded-lg border p-3 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Sales by Hour
          </h3>
          <div className="space-y-1">
            {data.hourlyBreakdown.map((entry) => {
              const maxAmount = Math.max(...data.hourlyBreakdown.map((h) => h.amountCentavos));
              const pct = maxAmount > 0 ? (entry.amountCentavos / maxAmount) * 100 : 0;
              return (
                <div key={entry.hour} className="flex items-center gap-2 text-xs">
                  <span className="w-12 text-right text-muted-foreground shrink-0">
                    {formatHour(entry.hour)}
                  </span>
                  <div className="flex-1 h-4 bg-muted/50 rounded overflow-hidden">
                    <div
                      className={`h-full rounded ${label.bg.replace("50", "200")}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-20 text-right font-medium shrink-0">
                    {formatCurrency(entry.amountCentavos)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Z-Reading: Cashier Breakdown */}
      {data.readingType === "Z" && data.cashierBreakdown.length > 0 && (
        <div className="rounded-lg border p-3 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Users className="h-4 w-4 text-muted-foreground" />
            Per-Cashier Breakdown
          </h3>
          <div className="space-y-3">
            {data.cashierBreakdown.map((cashier) => (
              <div key={cashier.cashierId} className="rounded border p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{cashier.cashierName}</span>
                  <span className="text-xs text-muted-foreground">
                    {cashier.shiftCount} shift{cashier.shiftCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Transactions</span>
                    <span className="font-medium">{cashier.transactionCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Sales</span>
                    <span className="font-semibold">{formatCurrency(cashier.totalSalesCentavos)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cash</span>
                    <span>{formatCurrency(cashier.cashSalesCentavos)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">GCash/Maya</span>
                    <span>
                      {formatCurrency(cashier.gcashSalesCentavos + cashier.mayaSalesCentavos)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Z-Reading: Reconciliation Status */}
      {data.readingType === "Z" && (
        <div className="rounded-lg border p-3 space-y-2">
          <h3 className="text-sm font-semibold">Reconciliation Status</h3>
          {data.reconciliation ? (
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected Cash</span>
                <span className="font-medium">
                  {formatCurrency(data.reconciliation.expectedCashCentavos)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Actual Count</span>
                <span className="font-medium">
                  {formatCurrency(data.reconciliation.actualCashCentavos)}
                </span>
              </div>
              <div className="flex justify-between border-t pt-1.5">
                <span className="font-semibold">Difference</span>
                <span
                  className={`font-bold ${
                    data.reconciliation.differenceCentavos === 0
                      ? "text-green-600"
                      : "text-amber-600"
                  }`}
                >
                  {data.reconciliation.differenceCentavos > 0 ? "+" : ""}
                  {formatCurrency(data.reconciliation.differenceCentavos)}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not yet submitted</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 print:hidden">
        {showPrint && (
          <button
            onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  ShoppingCart,
  ChevronUp,
  ChevronDown,
  Plus,
  Minus,
  Trash2,
  Pause,
  Play,
  XCircle,
  ArrowLeft,
  Check,
  Loader2,
  Tag,
  X,
  Split,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { usePOSCart, type CartItem, type HeldTransaction } from "@/components/providers/POSCartProvider";
import { calculateTaxBreakdown, type TaxBreakdown } from "@/convex/_helpers/taxCalculations";
import { useConnectionStatus } from "@/components/shared/ConnectionIndicator";
import { encrypt } from "@/lib/encryption";
import { enqueueTransaction, decrementStockItem } from "@/lib/offlineQueue";
import type { DiscountType, PaymentMethod } from "@/lib/constants";
import type { Id } from "@/convex/_generated/dataModel";
import { ReceiptViewer } from "@/components/pos/ReceiptViewer";
import { usePromoPreview } from "@/lib/hooks/usePromoPreview";
import type { PromoResult } from "@/convex/_helpers/promoCalculations";

type TransactionResult = {
  transactionId: Id<"transactions">;
  receiptNumber: string;
  totalCentavos: number;
  changeCentavos: number;
  paymentMethod: PaymentMethod;
};

export function POSCartPanel({ variant }: { variant: "desktop" | "mobile" }) {
  const {
    items, heldTransactions, updateQuantity, removeItem, clearCart,
    holdTransaction, resumeTransaction, discardHeldTransaction, discountType, setDiscountType, taxBreakdown,
    selectedPromoId, setPromoId,
  } = usePOSCart();

  const { activePromos, promoPreview } = usePromoPreview(items, selectedPromoId, discountType);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [transactionResult, setTransactionResult] = useState<TransactionResult | null>(null);
  const [viewingReceiptId, setViewingReceiptId] = useState<Id<"transactions"> | null>(null);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  const handleClearCart = useCallback(() => {
    clearCart();
    setShowClearConfirm(false);
  }, [clearCart]);

  const handleCompleteSale = useCallback(() => {
    setShowPayment(true);
  }, []);

  const handlePaymentComplete = useCallback(
    (result: TransactionResult) => {
      clearCart();
      setShowPayment(false);
      setShowClearConfirm(false);
      setTransactionResult(result);
    },
    [clearCart]
  );

  const handlePaymentCancel = useCallback(() => {
    setShowPayment(false);
  }, []);

  const handleDismissSuccess = useCallback(() => {
    setTransactionResult(null);
    setViewingReceiptId(null);
  }, []);

  const handleViewReceipt = useCallback(() => {
    if (transactionResult) {
      setViewingReceiptId(transactionResult.transactionId);
      setTransactionResult(null);
    }
  }, [transactionResult]);

  if (variant === "desktop") {
    return (
      <div className="relative flex h-full flex-col border-l bg-background">
        <CartContent
          items={items}
          totalItems={totalItems}
          taxBreakdown={taxBreakdown}
          discountType={discountType}
          setDiscountType={setDiscountType}
          selectedPromoId={selectedPromoId}
          setPromoId={setPromoId}
          activePromos={activePromos}
          promoPreview={promoPreview}
          heldTransactions={heldTransactions}
          updateQuantity={updateQuantity}
          removeItem={removeItem}
          holdTransaction={holdTransaction}
          resumeTransaction={resumeTransaction}
          discardHeldTransaction={discardHeldTransaction}
          showClearConfirm={showClearConfirm}
          setShowClearConfirm={setShowClearConfirm}
          handleClearCart={handleClearCart}
          showPayment={showPayment}
          onCompleteSale={handleCompleteSale}
          onPaymentComplete={handlePaymentComplete}
          onPaymentCancel={handlePaymentCancel}
        />
        {transactionResult && (
          <TransactionSuccess
            result={transactionResult}
            onDismiss={handleDismissSuccess}
            onViewReceipt={handleViewReceipt}
          />
        )}
        {viewingReceiptId && (
          <ReceiptViewer
            transactionId={viewingReceiptId}
            onClose={() => setViewingReceiptId(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40">
      {/* Expanded panel */}
      <div
        className={cn(
          "overflow-hidden border-t bg-background shadow-lg transition-all duration-300",
          isExpanded ? "max-h-[60vh]" : "max-h-0"
        )}
      >
        {isExpanded && (
          <div className="relative overflow-y-auto p-4" style={{ maxHeight: "calc(60vh - 60px)" }}>
            {viewingReceiptId ? (
              <ReceiptViewer
                transactionId={viewingReceiptId}
                onClose={() => setViewingReceiptId(null)}
              />
            ) : transactionResult ? (
              <TransactionSuccess
                result={transactionResult}
                onDismiss={handleDismissSuccess}
                onViewReceipt={handleViewReceipt}
              />
            ) : showPayment ? (
              <PaymentPanel
                items={items}
                taxBreakdown={taxBreakdown}
                discountType={discountType}
                selectedPromoId={selectedPromoId}
                promoPreview={promoPreview}
                onComplete={handlePaymentComplete}
                onCancel={handlePaymentCancel}
              />
            ) : (
              <>
                {/* Held transactions */}
                {heldTransactions.length > 0 && (
                  <HeldTransactionBadges
                    heldTransactions={heldTransactions}
                    resumeTransaction={resumeTransaction}
                    discardHeldTransaction={discardHeldTransaction}
                  />
                )}

                {items.length === 0 ? (
                  <p className="text-center text-muted-foreground">
                    Scan or search to add items
                  </p>
                ) : (
                  <>
                    <CartItemList
                      items={items}
                      updateQuantity={updateQuantity}
                      removeItem={removeItem}
                    />
                    <DiscountToggle
                      discountType={discountType}
                      setDiscountType={setDiscountType}
                    />
                    <PromoSelector
                      discountType={discountType}
                      activePromos={activePromos}
                      selectedPromoId={selectedPromoId}
                      setPromoId={setPromoId}
                      promoPreview={promoPreview}
                    />
                    <CartActions
                      items={items}
                      taxBreakdown={taxBreakdown}
                      discountType={discountType}
                      promoPreview={promoPreview}
                      holdTransaction={holdTransaction}
                      showClearConfirm={showClearConfirm}
                      setShowClearConfirm={setShowClearConfirm}
                      handleClearCart={handleClearCart}
                      onCompleteSale={handleCompleteSale}
                    />
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Toggle bar */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex h-14 w-full items-center justify-between border-t bg-background px-4"
      >
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          <span className="font-medium">
            {totalItems} item{totalItems !== 1 ? "s" : ""}
          </span>
          {heldTransactions.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              <Pause className="h-3 w-3" />
              {heldTransactions.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold">{formatCurrency(taxBreakdown.totalCentavos - (promoPreview?.applicable ? promoPreview.discountCentavos : 0))}</span>
          {isExpanded ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronUp className="h-5 w-5" />
          )}
        </div>
      </button>
    </div>
  );
}

// ─── Held Transactions ────────────────────────────────────────────────────────

function formatTimeAgo(heldAt: number): string {
  const diffMs = Date.now() - heldAt;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ${diffMin % 60}m ago`;
}

function HeldTransactionBadges({
  heldTransactions,
  resumeTransaction,
  discardHeldTransaction,
}: {
  heldTransactions: HeldTransaction[];
  resumeTransaction: (id: string) => void;
  discardHeldTransaction: (id: string) => void;
}) {
  return (
    <div className="mb-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Held Orders ({heldTransactions.length}/5)
      </p>
      {heldTransactions.map((txn) => {
        const itemCount = txn.items.reduce((s, i) => s + i.quantity, 0);
        const breakdown = calculateTaxBreakdown(txn.items, txn.discountType);
        const isDiscounted = txn.discountType !== "none";
        return (
          <div
            key={txn.id}
            className="flex items-center gap-2 rounded-md border border-dashed border-amber-400/60 bg-amber-50/50 px-3 py-2"
          >
            <Pause className="h-4 w-4 text-amber-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {txn.label}
                {isDiscounted && (
                  <span className="ml-1.5 text-xs text-green-600">
                    {txn.discountType === "senior" ? "SC" : "PWD"}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {itemCount} item{itemCount !== 1 ? "s" : ""} · {formatCurrency(breakdown.totalCentavos)} · {formatTimeAgo(txn.heldAt)}
              </p>
            </div>
            <button
              onClick={() => resumeTransaction(txn.id)}
              className="shrink-0 flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              title="Recall this order"
            >
              <Play className="h-3 w-3" />
              Recall
            </button>
            <button
              onClick={() => discardHeldTransaction(txn.id)}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Discard this held order"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Cart Item List ──────────────────────────────────────────────────────────

function CartItemList({
  items,
  updateQuantity,
  removeItem,
}: {
  items: CartItem[];
  updateQuantity: (variantId: CartItem["variantId"], delta: number) => void;
  removeItem: (variantId: CartItem["variantId"]) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.variantId}
          className="flex items-center gap-2 rounded-md border p-3"
        >
          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{item.styleName}</p>
            <p className="text-sm text-muted-foreground">
              {item.size} / {item.color}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatCurrency(item.unitPriceCentavos)} each
            </p>
          </div>

          {/* Quantity stepper */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 min-h-14 min-w-[56px]"
              onClick={() => updateQuantity(item.variantId, -1)}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-8 text-center font-semibold">{item.quantity}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 min-h-14 min-w-[56px]"
              onClick={() => updateQuantity(item.variantId, 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Line total + delete */}
          <div className="flex flex-col items-end gap-1">
            <p className="font-semibold">
              {formatCurrency(item.unitPriceCentavos * item.quantity)}
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => removeItem(item.variantId)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Discount Toggle ─────────────────────────────────────────────────────────

function DiscountToggle({
  discountType,
  setDiscountType,
}: {
  discountType: DiscountType;
  setDiscountType: (type: DiscountType) => void;
}) {
  const options: { value: DiscountType; label: string }[] = [
    { value: "none", label: "Regular" },
    { value: "senior", label: "Senior" },
    { value: "pwd", label: "PWD" },
  ];

  return (
    <div className="mt-4">
      <div className="flex gap-1 rounded-md border p-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setDiscountType(opt.value)}
            className={cn(
              "min-h-14 flex-1 rounded-sm text-sm font-medium transition-colors",
              discountType === opt.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "hover:bg-muted"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {discountType !== "none" && (
        <div className="mt-2 rounded-md border border-green-500 bg-green-50 px-3 py-2 text-sm font-medium text-green-900">
          {discountType === "senior" ? "Senior Citizen" : "PWD"} Discount Applied
        </div>
      )}
    </div>
  );
}

// ─── Promo Selector ─────────────────────────────────────────────────────

function PromoSelector({
  discountType,
  activePromos,
  selectedPromoId,
  setPromoId,
  promoPreview,
}: {
  discountType: DiscountType;
  activePromos: ActivePromo[];
  selectedPromoId: string | null;
  setPromoId: (promoId: string | null) => void;
  promoPreview: PromoResult | null;
}) {
  // Only show when discount type is "none" (promos don't stack with Senior/PWD)
  if (discountType !== "none") return null;
  if (activePromos.length === 0) return null;

  const selectedPromo = selectedPromoId
    ? activePromos.find((p) => String(p._id) === selectedPromoId)
    : null;

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Promotions
      </p>

      {selectedPromo ? (
        <div className="flex items-center gap-2 rounded-md border border-orange-400 bg-orange-50 px-3 py-2">
          <Tag className="h-4 w-4 text-orange-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-orange-900 truncate">
              {selectedPromo.name}
            </p>
            {promoPreview?.applicable && promoPreview.discountCentavos > 0 && (
              <p className="text-xs text-orange-700">
                Save {formatCurrency(promoPreview.discountCentavos)}
              </p>
            )}
            {promoPreview && !promoPreview.applicable && (
              <p className="text-xs text-muted-foreground">
                {promoPreview.description}
              </p>
            )}
          </div>
          <button
            onClick={() => setPromoId(null)}
            className="shrink-0 rounded-sm p-0.5 text-orange-600 hover:bg-orange-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {activePromos.map((promo) => (
            <button
              key={String(promo._id)}
              onClick={() => setPromoId(String(promo._id))}
              className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm transition-colors hover:border-orange-400 hover:bg-orange-50"
            >
              <Tag className="h-3.5 w-3.5 text-orange-500" />
              {promo.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Cart Actions ────────────────────────────────────────────────────────────

function CartActions({
  items,
  taxBreakdown,
  discountType,
  promoPreview,
  holdTransaction,
  showClearConfirm,
  setShowClearConfirm,
  handleClearCart,
  onCompleteSale,
}: {
  items: CartItem[];
  taxBreakdown: TaxBreakdown;
  discountType: DiscountType;
  promoPreview: PromoResult | null;
  holdTransaction: () => string | null;
  showClearConfirm: boolean;
  setShowClearConfirm: (v: boolean) => void;
  handleClearCart: () => void;
  onCompleteSale: () => void;
}) {
  const isDiscounted = discountType !== "none";
  const promoDiscount = promoPreview?.applicable ? promoPreview.discountCentavos : 0;
  const displayTotal = taxBreakdown.totalCentavos - promoDiscount;

  return (
    <div className="mt-4 border-t pt-4">
      {/* Price breakdown */}
      <div className="mb-3 space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatCurrency(taxBreakdown.subtotalCentavos)}</span>
        </div>

        {isDiscounted ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-destructive">
              Discount ({discountType === "senior" ? "SC" : "PWD"} 20%)
            </span>
            <span className="text-destructive">
              -{formatCurrency(taxBreakdown.discountAmountCentavos)}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">VAT (12%)</span>
            <span>{formatCurrency(taxBreakdown.vatAmountCentavos)}</span>
          </div>
        )}

        {promoPreview?.applicable && promoDiscount > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-orange-600">
              Promo ({promoPreview.description})
            </span>
            <span className="text-orange-600">
              -{formatCurrency(promoDiscount)}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between pt-1 text-lg font-bold">
          <span>Total</span>
          <span>{formatCurrency(displayTotal)}</span>
        </div>

        {isDiscounted && taxBreakdown.savingsCentavos > 0 && (
          <div className="flex items-center justify-between text-sm font-medium text-green-600">
            <span>You save</span>
            <span>{formatCurrency(taxBreakdown.savingsCentavos)}</span>
          </div>
        )}

        {promoDiscount > 0 && !isDiscounted && (
          <div className="flex items-center justify-between text-sm font-medium text-green-600">
            <span>You save</span>
            <span>{formatCurrency(promoDiscount)}</span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="mb-3 flex gap-2">
        <Button
          variant="outline"
          className="min-h-14 flex-1 gap-2"
          onClick={() => holdTransaction()}
          disabled={items.length === 0}
        >
          <Pause className="h-4 w-4" />
          Hold
        </Button>

        {showClearConfirm ? (
          <div className="flex flex-1 gap-1">
            <Button
              variant="destructive"
              className="min-h-14 flex-1"
              onClick={handleClearCart}
            >
              Confirm
            </Button>
            <Button
              variant="outline"
              className="min-h-14"
              onClick={() => setShowClearConfirm(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            className="min-h-14 flex-1 gap-2 text-destructive hover:text-destructive"
            onClick={() => setShowClearConfirm(true)}
            disabled={items.length === 0}
          >
            <XCircle className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Complete Sale */}
      <Button
        className="h-14 w-full text-lg"
        disabled={items.length === 0}
        onClick={onCompleteSale}
      >
        Complete Sale {items.length > 0 ? `\u00B7 ${formatCurrency(displayTotal)}` : ""}
      </Button>
    </div>
  );
}

// ─── Desktop Cart Content ────────────────────────────────────────────────────

type ActivePromo = {
  _id: Id<"promotions">;
  name: string;
  description?: string;
  promoType: "percentage" | "fixedAmount" | "buyXGetY" | "tiered";
  priority: number;
};

function CartContent({
  items,
  totalItems,
  taxBreakdown,
  discountType,
  setDiscountType,
  selectedPromoId,
  setPromoId,
  activePromos,
  promoPreview,
  heldTransactions,
  updateQuantity,
  removeItem,
  holdTransaction,
  resumeTransaction,
  discardHeldTransaction,
  showClearConfirm,
  setShowClearConfirm,
  handleClearCart,
  showPayment,
  onCompleteSale,
  onPaymentComplete,
  onPaymentCancel,
}: {
  items: CartItem[];
  totalItems: number;
  taxBreakdown: TaxBreakdown;
  discountType: DiscountType;
  setDiscountType: (type: DiscountType) => void;
  selectedPromoId: string | null;
  setPromoId: (promoId: string | null) => void;
  activePromos: ActivePromo[];
  promoPreview: PromoResult | null;
  heldTransactions: HeldTransaction[];
  updateQuantity: (variantId: CartItem["variantId"], delta: number) => void;
  removeItem: (variantId: CartItem["variantId"]) => void;
  holdTransaction: () => string | null;
  resumeTransaction: (id: string) => void;
  discardHeldTransaction: (id: string) => void;
  showClearConfirm: boolean;
  setShowClearConfirm: (v: boolean) => void;
  handleClearCart: () => void;
  showPayment: boolean;
  onCompleteSale: () => void;
  onPaymentComplete: (result: TransactionResult) => void;
  onPaymentCancel: () => void;
}) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 border-b p-4">
        <ShoppingCart className="h-5 w-5" />
        <h2 className="text-lg font-bold">Cart</h2>
        {totalItems > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            {totalItems}
          </span>
        )}
        {heldTransactions.length > 0 && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            <Pause className="h-3 w-3" />
            {heldTransactions.length} held
          </span>
        )}
      </div>

      {/* Held transactions */}
      {heldTransactions.length > 0 && !showPayment && (
        <div className="border-b px-4 py-2">
          <HeldTransactionBadges
            heldTransactions={heldTransactions}
            resumeTransaction={resumeTransaction}
            discardHeldTransaction={discardHeldTransaction}
          />
        </div>
      )}

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-4">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <ShoppingCart className="mb-2 h-10 w-10 opacity-30" />
            <p>Scan or search to add items</p>
          </div>
        ) : (
          <CartItemList
            items={items}
            updateQuantity={updateQuantity}
            removeItem={removeItem}
          />
        )}
      </div>

      {/* Footer — Payment panel OR discount toggle + cart actions */}
      {items.length > 0 && (
        <div className="px-4 pb-4">
          {showPayment ? (
            <PaymentPanel
              items={items}
              taxBreakdown={taxBreakdown}
              discountType={discountType}
              selectedPromoId={selectedPromoId}
              promoPreview={promoPreview}
              onComplete={onPaymentComplete}
              onCancel={onPaymentCancel}
            />
          ) : (
            <>
              <DiscountToggle
                discountType={discountType}
                setDiscountType={setDiscountType}
              />
              <PromoSelector
                discountType={discountType}
                activePromos={activePromos}
                selectedPromoId={selectedPromoId}
                setPromoId={setPromoId}
                promoPreview={promoPreview}
              />
              <CartActions
                items={items}
                taxBreakdown={taxBreakdown}
                discountType={discountType}
                promoPreview={promoPreview}
                holdTransaction={holdTransaction}
                showClearConfirm={showClearConfirm}
                setShowClearConfirm={setShowClearConfirm}
                handleClearCart={handleClearCart}
                onCompleteSale={onCompleteSale}
              />
            </>
          )}
        </div>
      )}
    </>
  );
}

// ─── Payment Panel ──────────────────────────────────────────────────────────

const QUICK_DENOMINATIONS = [
  { label: "Exact", value: 0 },
  { label: "\u20B1100", value: 10000 },
  { label: "\u20B1200", value: 20000 },
  { label: "\u20B1500", value: 50000 },
  { label: "\u20B11,000", value: 100000 },
  { label: "\u20B12,000", value: 200000 },
];

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "maya", label: "Maya" },
];

function PaymentPanel({
  items,
  taxBreakdown,
  discountType,
  selectedPromoId,
  promoPreview,
  onComplete,
  onCancel,
}: {
  items: CartItem[];
  taxBreakdown: TaxBreakdown;
  discountType: DiscountType;
  selectedPromoId: string | null;
  promoPreview: PromoResult | null;
  onComplete: (result: TransactionResult) => void;
  onCancel: () => void;
}) {
  const createTransaction = useMutation(api.pos.transactions.createTransaction);
  const currentUser = useQuery(api.auth.users.getCurrentUser);
  const connectionStatus = useConnectionStatus();
  const { clearCart } = usePOSCart();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountTendered, setAmountTendered] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Split payment state
  const [isSplit, setIsSplit] = useState(false);
  const [splitMethod, setSplitMethod] = useState<PaymentMethod>("gcash");
  const [splitAmountInput, setSplitAmountInput] = useState("");

  const promoDiscount = promoPreview?.applicable ? promoPreview.discountCentavos : 0;
  const totalCentavos = taxBreakdown.totalCentavos - promoDiscount;

  // Split amount in centavos (secondary payment)
  const splitAmountCentavos = (() => {
    if (!isSplit) return 0;
    const parsed = parseFloat(splitAmountInput);
    if (isNaN(parsed) || parsed < 0) return 0;
    return Math.round(parsed * 100);
  })();

  // Primary payment portion
  const primaryPortion = isSplit ? totalCentavos - splitAmountCentavos : totalCentavos;

  // Change calculation (only for cash primary)
  const changeCentavos =
    paymentMethod === "cash" && amountTendered !== null
      ? amountTendered - primaryPortion
      : null;
  const isCashSufficient =
    paymentMethod !== "cash" || (amountTendered !== null && amountTendered >= primaryPortion);

  // Validation
  const isSplitValid = !isSplit || (
    splitAmountCentavos > 0 &&
    splitAmountCentavos < totalCentavos &&
    splitMethod !== paymentMethod
  );

  const canProcess = isCashSufficient && isSplitValid;

  // When toggling split, auto-pick a secondary method different from primary
  const handleToggleSplit = () => {
    if (!isSplit) {
      const alt = PAYMENT_OPTIONS.find((o) => o.value !== paymentMethod);
      if (alt) setSplitMethod(alt.value);
      setSplitAmountInput("");
    }
    setIsSplit(!isSplit);
    setError(null);
  };

  const handleQuickDenomination = (value: number) => {
    setAmountTendered(value === 0 ? primaryPortion : value);
    setError(null);
  };

  const handleCustomAmount = (value: string) => {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed < 0) {
      setAmountTendered(null);
    } else {
      setAmountTendered(Math.round(parsed * 100));
    }
    setError(null);
  };

  const handleProcess = async () => {
    if (!canProcess || isProcessing) return;

    setIsProcessing(true);
    setError(null);

    const splitPaymentArg = isSplit && splitAmountCentavos > 0
      ? { method: splitMethod, amountCentavos: splitAmountCentavos }
      : undefined;

    // Task 4.2: Offline interception — queue instead of calling Convex
    if (connectionStatus === "offline") {
      try {
        const payload = {
          items: items.map((i) => ({
            variantId: String(i.variantId),
            quantity: i.quantity,
            unitPriceCentavos: i.unitPriceCentavos,
          })),
          paymentMethod,
          discountType,
          amountTenderedCentavos: paymentMethod === "cash" ? amountTendered! : undefined,
          splitPayment: splitPaymentArg,
        };
        const encryptedPayload = await encrypt(JSON.stringify(payload));
        const branchId = String(currentUser?.branchId ?? "unknown");

        await enqueueTransaction({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          branchId,
          encryptedPayload,
          retryCount: 0,
        });

        // Decrement local stock snapshot for each sold item
        for (const item of items) {
          await decrementStockItem(branchId, String(item.variantId), item.quantity);
        }

        toast.info("Transaction queued — will sync when online");
        clearCart();
        setIsProcessing(false);
        onCancel();
      } catch {
        setIsProcessing(false);
        setError("Failed to queue offline transaction. Please try again.");
      }
      return;
    }

    try {
      const result = await createTransaction({
        items: items.map((i) => ({
          variantId: i.variantId,
          quantity: i.quantity,
          unitPriceCentavos: i.unitPriceCentavos,
        })),
        paymentMethod,
        discountType,
        amountTenderedCentavos:
          paymentMethod === "cash" ? amountTendered! : undefined,
        promotionId: selectedPromoId && discountType === "none"
          ? (selectedPromoId as Id<"promotions">)
          : undefined,
        splitPayment: splitPaymentArg,
      });

      onComplete({
        transactionId: result.transactionId,
        receiptNumber: result.receiptNumber,
        totalCentavos: result.totalCentavos,
        changeCentavos: result.changeCentavos,
        paymentMethod,
      });
    } catch (err: unknown) {
      setIsProcessing(false);
      if (err instanceof ConvexError) {
        const data = err.data as Record<string, unknown>;
        if (data.code === "INSUFFICIENT_STOCK") {
          const stockData = data.data as { variantId: string; requested: number; available: number }[] | undefined;
          if (Array.isArray(stockData) && stockData.length > 0) {
            const details = stockData.map((s) => {
              const cartItem = items.find((i) => i.variantId === s.variantId);
              const name = cartItem
                ? `${cartItem.styleName} (${cartItem.size}/${cartItem.color})`
                : "Unknown item";
              return `\u2022 ${name}: ${s.available} in stock (need ${s.requested})`;
            });
            setError(`Insufficient stock:\n${details.join("\n")}`);
          } else {
            setError("Insufficient stock for one or more items. Please adjust quantities and retry.");
          }
        } else if (data.code === "INVALID_PAYMENT") {
          setError(String(data.message ?? "Invalid payment"));
        } else if (data.code === "UNAUTHORIZED") {
          setError("Unauthorized. Please sign in again.");
        } else {
          setError(String(data.message ?? "Transaction failed. Please try again."));
        }
      } else {
        setError("Transaction failed. Please try again.");
      }
    }
  };

  // Available secondary methods (exclude the primary)
  const secondaryOptions = PAYMENT_OPTIONS.filter((o) => o.value !== paymentMethod);

  return (
    <div className="border-t pt-4">
      {/* Back button */}
      <button
        onClick={onCancel}
        disabled={isProcessing}
        className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to cart
      </button>

      {/* Total due */}
      <div className="mb-4 text-center">
        <p className="text-sm text-muted-foreground">Amount Due</p>
        <p className="text-2xl font-bold">{formatCurrency(totalCentavos)}</p>
      </div>

      {/* Payment method selector */}
      <div className="mb-2 flex gap-1 rounded-md border p-1">
        {PAYMENT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => {
              setPaymentMethod(opt.value);
              // If split is on and new primary matches split method, change split method
              if (isSplit && opt.value === splitMethod) {
                const alt = PAYMENT_OPTIONS.find((o) => o.value !== opt.value);
                if (alt) setSplitMethod(alt.value);
              }
              setError(null);
            }}
            disabled={isProcessing}
            className={cn(
              "min-h-14 flex-1 rounded-sm text-sm font-medium transition-colors",
              paymentMethod === opt.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "hover:bg-muted"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Split payment toggle */}
      <button
        onClick={handleToggleSplit}
        disabled={isProcessing}
        className={cn(
          "mb-4 flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors",
          isSplit
            ? "border-blue-500 bg-blue-500/10 text-blue-400"
            : "border-muted hover:border-muted-foreground/30 text-muted-foreground hover:text-foreground"
        )}
      >
        <Split className="h-4 w-4" />
        {isSplit ? "Split Payment On" : "Split Payment"}
      </button>

      {/* Split payment configuration */}
      {isSplit && (
        <div className="mb-4 space-y-3 rounded-md border border-blue-500/30 bg-blue-500/5 p-3">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
            Split Payment
          </p>

          {/* Primary payment summary */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {PAYMENT_OPTIONS.find((o) => o.value === paymentMethod)?.label} (Primary)
            </span>
            <span className="font-semibold">
              {primaryPortion > 0 ? formatCurrency(primaryPortion) : "--"}
            </span>
          </div>

          {/* Secondary method selector */}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Second payment method
            </label>
            <div className="flex gap-1 rounded-md border p-1">
              {secondaryOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setSplitMethod(opt.value);
                    setError(null);
                  }}
                  disabled={isProcessing}
                  className={cn(
                    "flex-1 rounded-sm py-2 text-sm font-medium transition-colors",
                    splitMethod === opt.value
                      ? "bg-blue-500 text-white shadow-sm"
                      : "hover:bg-muted"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Secondary amount input */}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              {PAYMENT_OPTIONS.find((o) => o.value === splitMethod)?.label} amount
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              className="h-12 w-full rounded-md border bg-background px-3 text-lg"
              value={splitAmountInput}
              onChange={(e) => {
                setSplitAmountInput(e.target.value);
                setError(null);
              }}
              disabled={isProcessing}
            />
          </div>

          {/* Remainder display */}
          {splitAmountCentavos > 0 && (
            <div
              className={cn(
                "rounded-md px-3 py-2 text-center text-sm",
                primaryPortion > 0
                  ? "border border-blue-500/40 bg-blue-500/10"
                  : "border border-destructive bg-destructive/10"
              )}
            >
              {primaryPortion > 0 ? (
                <p className="font-medium text-blue-400">
                  {PAYMENT_OPTIONS.find((o) => o.value === paymentMethod)?.label} portion: {formatCurrency(primaryPortion)}
                </p>
              ) : (
                <p className="font-medium text-destructive">
                  Amount exceeds total
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cash tendered section (shown when primary is Cash) */}
      {paymentMethod === "cash" && (
        <div className="mb-4 space-y-3">
          {/* Quick denomination buttons */}
          <div className="grid grid-cols-3 gap-2">
            {QUICK_DENOMINATIONS.map((denom) => (
              <Button
                key={denom.label}
                variant="outline"
                className="min-h-14"
                onClick={() => handleQuickDenomination(denom.value)}
                disabled={isProcessing}
              >
                {denom.label}
              </Button>
            ))}
          </div>

          {/* Custom amount input */}
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">
              Custom amount
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              className="h-14 w-full rounded-md border px-3 text-lg"
              value={
                amountTendered !== null ? (amountTendered / 100).toFixed(2) : ""
              }
              onChange={(e) => handleCustomAmount(e.target.value)}
              disabled={isProcessing}
            />
          </div>

          {/* Change display */}
          {amountTendered !== null && (
            <div
              className={cn(
                "rounded-md px-3 py-2 text-center",
                isCashSufficient
                  ? "border border-green-500 bg-green-500/10"
                  : "border border-destructive bg-destructive/10"
              )}
            >
              {isCashSufficient ? (
                <p className="text-xl font-bold text-green-400">
                  Change: {formatCurrency(changeCentavos!)}
                </p>
              ) : (
                <p className="text-sm font-medium text-destructive">
                  Insufficient amount
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-3 whitespace-pre-line rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Process Payment button */}
      <Button
        className="h-14 w-full text-lg"
        disabled={!canProcess || isProcessing}
        onClick={handleProcess}
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Processing...
          </>
        ) : (
          `Process Payment \u00B7 ${formatCurrency(totalCentavos)}`
        )}
      </Button>
    </div>
  );
}

// ─── Transaction Success Overlay ────────────────────────────────────────────

function TransactionSuccess({
  result,
  onDismiss,
  onViewReceipt,
}: {
  result: TransactionResult;
  onDismiss: () => void;
  onViewReceipt: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/95">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <Check className="h-8 w-8 text-green-600" />
      </div>
      <p className="mt-4 text-2xl font-bold">Sale Complete!</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Receipt #{result.receiptNumber}
      </p>
      {result.paymentMethod === "cash" && result.changeCentavos > 0 && (
        <p className="mt-3 text-xl font-bold text-green-600">
          Change: {formatCurrency(result.changeCentavos)}
        </p>
      )}
      <p className="mt-2 text-lg font-semibold">
        {formatCurrency(result.totalCentavos)}
      </p>
      <div className="mt-4 flex gap-2">
        <Button
          variant="outline"
          className="min-h-14 gap-2"
          onClick={onViewReceipt}
        >
          View Receipt
        </Button>
        <Button
          variant="ghost"
          className="min-h-14"
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

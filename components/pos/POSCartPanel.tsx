"use client";

import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { getDeviceToken } from "@/lib/deviceToken";
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
  Zap,
  MoreHorizontal,
  Sparkles,
  Lightbulb,
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
import { CrossSellStrip } from "@/components/pos/CrossSellStrip";
import { usePromoPreview, type PromoSuggestions } from "@/lib/hooks/usePromoPreview";
import type { PromoResult } from "@/convex/_helpers/promoCalculations";

type TransactionResult = {
  transactionId: Id<"transactions">;
  receiptNumber: string;
  totalCentavos: number;
  changeCentavos: number;
  paymentMethod: PaymentMethod;
};

export function POSCartPanel({ variant, isRushMode = false }: { variant: "desktop" | "mobile"; isRushMode?: boolean }) {
  const {
    items, heldTransactions, updateQuantity, removeItem, clearCart,
    holdTransaction, resumeTransaction, discardHeldTransaction, discountType, setDiscountType, taxBreakdown,
    selectedPromoId, setPromoId,
  } = usePOSCart();

  const { activePromos, promoPreview, promoSuggestions } = usePromoPreview(items, selectedPromoId, discountType);
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
      <div className="relative flex h-full w-full flex-col border-l bg-background">
        {isRushMode ? (
          <RushModeCart
            items={items}
            totalItems={totalItems}
            taxBreakdown={taxBreakdown}
            onCompleteSale={handleCompleteSale}
            onPaymentComplete={handlePaymentComplete}
            showPayment={showPayment}
            onPaymentCancel={handlePaymentCancel}
            clearCart={clearCart}
          />
        ) : (
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
          promoSuggestions={promoSuggestions}
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
        )}
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
            ) : isRushMode ? (
              <>
                {items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                    <Zap className="h-10 w-10 text-amber-500/20" />
                    <p className="text-sm text-muted-foreground">Scan items to start</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div
                          key={item.variantId as string}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-base font-bold truncate">{item.styleName}</p>
                            <p className="text-sm text-muted-foreground">
                              {item.size} · {item.color} × {item.quantity}
                            </p>
                          </div>
                          <p className="text-lg font-bold tabular-nums ml-3">
                            {formatCurrency(item.unitPriceCentavos * item.quantity)}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 border-t pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xl font-bold">Total</span>
                        <span className="text-2xl font-bold text-amber-500 tabular-nums">
                          {formatCurrency(taxBreakdown.totalCentavos)}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="h-14 flex-1"
                          disabled={items.length === 0}
                          onClick={handleClearCart}
                        >
                          Clear
                        </Button>
                        <Button
                          className="h-14 flex-[2] text-lg bg-amber-500 hover:bg-amber-600 text-black font-bold"
                          disabled={items.length === 0}
                          onClick={handleCompleteSale}
                        >
                          <Zap className="mr-2 h-5 w-5" />
                          Quick Checkout
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </>
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
                      promoSuggestions={promoSuggestions}
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
        className={cn(
          "flex h-14 w-full items-center justify-between border-t px-4",
          isRushMode ? "bg-amber-500/10" : "bg-background"
        )}
      >
        <div className="flex items-center gap-2">
          {isRushMode ? (
            <Zap className="h-5 w-5 text-amber-500" />
          ) : (
            <ShoppingCart className="h-5 w-5" />
          )}
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

      {showPayment && !transactionResult && (
        <PaymentModal
          items={items}
          taxBreakdown={taxBreakdown}
          discountType={isRushMode ? "none" : discountType}
          selectedPromoId={isRushMode ? null : selectedPromoId}
          promoPreview={isRushMode ? null : promoPreview}
          onComplete={handlePaymentComplete}
          onCancel={handlePaymentCancel}
        />
      )}
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
    <div className="space-y-1.5">
      {items.map((item) => (
        <div key={item.variantId} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={item.styleName}>
              {item.styleName}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {item.size} · {item.color} · {formatCurrency(item.unitPriceCentavos)}
            </p>
          </div>

          {/* Quantity stepper */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              aria-label="Decrease quantity"
              onClick={() => updateQuantity(item.variantId, -1)}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-6 text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              aria-label="Increase quantity"
              onClick={() => updateQuantity(item.variantId, 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Line total + delete */}
          <p className="w-20 text-right text-sm font-semibold tabular-nums">
            {formatCurrency(item.unitPriceCentavos * item.quantity)}
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
            aria-label="Remove item"
            onClick={() => removeItem(item.variantId)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
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
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Discount
        </span>
        <div className="flex flex-1 gap-1 rounded-md border p-0.5">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDiscountType(opt.value)}
              className={cn(
                "h-8 flex-1 rounded-sm text-xs font-medium transition-colors",
                discountType === opt.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "hover:bg-muted"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {discountType !== "none" && (
        <p className="mt-1 text-xs font-medium text-green-700">
          {discountType === "senior" ? "Senior Citizen" : "PWD"} discount applied
        </p>
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
  promoSuggestions,
}: {
  discountType: DiscountType;
  activePromos: ActivePromo[];
  selectedPromoId: string | null;
  setPromoId: (promoId: string | null) => void;
  promoPreview: PromoResult | null;
  promoSuggestions: PromoSuggestions;
}) {
  const [showAllPromos, setShowAllPromos] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Only show when discount type is "none" (promos don't stack with Senior/PWD)
  if (discountType !== "none") return null;
  if (activePromos.length === 0) return null;

  const selectedPromo = selectedPromoId
    ? activePromos.find((p) => String(p._id) === selectedPromoId)
    : null;

  const { best, applicable, hints, byId } = promoSuggestions;
  const selectedSaving = promoPreview?.applicable ? promoPreview.discountCentavos : 0;
  // A promotion that would save the customer more than the one applied.
  const better =
    selectedPromo && best && best.promoId !== selectedPromoId && best.discountCentavos > selectedSaving
      ? best
      : null;

  // One line stays in view; the rest opens on demand so the cart keeps its room.
  const otherPromos = selectedPromo ? [] : applicable.slice(1);
  const firstHint = hints[0] ?? null;
  const moreHints = hints.slice(1);
  const moreCount = otherPromos.length + moreHints.length;
  const moreLabel = [
    otherPromos.length > 0 && `${otherPromos.length} more promo${otherPromos.length === 1 ? "" : "s"}`,
    moreHints.length > 0 && `${moreHints.length} more tip${moreHints.length === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const typeBadge = (type: ActivePromo["promoType"]) =>
    type === "percentage"
      ? "%"
      : type === "fixedAmount"
        ? "₱"
        : type === "buyXGetY"
          ? "B+G"
          : type === "tiered"
            ? "Spend"
            : type === "crossSell"
              ? "X-Sell"
              : "PWP";

  const hintLine = (h: { promoId: string; name: string; hint: string }) => (
    <p key={h.promoId} className="flex items-start gap-1.5 px-1 text-xs text-muted-foreground">
      <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span className="min-w-0">
        <span className="font-medium text-foreground">{h.name}:</span> {h.hint}
      </span>
    </p>
  );

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Promotions</p>
        <button
          onClick={() => setShowAllPromos(true)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
        >
          <MoreHorizontal className="h-3 w-3" />
          All ({activePromos.length})
        </button>
      </div>

      {selectedPromo ? (
        <>
          <div className="flex items-center gap-2 rounded-md border border-orange-400 bg-orange-50 px-2.5 py-1.5">
            <Tag className="h-4 w-4 shrink-0 text-orange-600" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-orange-900">{selectedPromo.name}</p>
              {promoPreview?.applicable && promoPreview.discountCentavos > 0 ? (
                <p className="text-xs text-orange-700">Save {formatCurrency(promoPreview.discountCentavos)}</p>
              ) : (
                promoPreview && (
                  <p className="truncate text-xs text-muted-foreground">
                    {byId[selectedPromoId!]?.hint ?? promoPreview.description}
                  </p>
                )
              )}
            </div>
            <button
              onClick={() => setPromoId(null)}
              aria-label="Remove promotion"
              className="shrink-0 rounded-sm p-0.5 text-orange-600 hover:bg-orange-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {better && (
            <button
              onClick={() => setPromoId(better.promoId)}
              className="mt-1 flex w-full items-center gap-2 rounded-md border border-dashed border-green-500 bg-green-50 px-2.5 py-1 text-left text-xs text-green-800 transition-colors hover:bg-green-100"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Better: <span className="font-semibold">{better.name}</span> saves{" "}
                {formatCurrency(better.discountCentavos)}
              </span>
              <span className="shrink-0 font-semibold">Switch</span>
            </button>
          )}
        </>
      ) : best ? (
        <button
          onClick={() => setPromoId(best.promoId)}
          className="flex w-full items-center gap-2 rounded-md border-2 border-green-500 bg-green-50 px-2.5 py-1.5 text-left transition-colors hover:bg-green-100"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-green-600" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase leading-none tracking-wider text-green-700">Best promo</p>
            <p className="truncate text-sm font-medium text-green-900">{best.name}</p>
          </div>
          <span className="shrink-0 text-sm font-bold text-green-700">
            Save {formatCurrency(best.discountCentavos)}
          </span>
          <span className="shrink-0 rounded bg-green-600 px-2 py-1 text-xs font-semibold text-white">Apply</span>
        </button>
      ) : !firstHint ? (
        <div className="flex flex-wrap gap-1.5">
          {activePromos.slice(0, 3).map((promo) => (
            <button
              key={String(promo._id)}
              onClick={() => setPromoId(String(promo._id))}
              className="flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs transition-colors hover:border-orange-400 hover:bg-orange-50"
            >
              <Tag className="h-3.5 w-3.5 text-orange-500" />
              {promo.name}
            </button>
          ))}
        </div>
      ) : null}

      {firstHint && <div className="mt-1">{hintLine(firstHint)}</div>}

      {moreCount > 0 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 flex w-full items-center justify-between rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <span>{moreLabel}</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      )}
      {expanded && moreCount > 0 && (
        <div className="mt-1 max-h-36 space-y-1 overflow-y-auto">
          {otherPromos.map((s) => (
            <button
              key={s.promoId}
              onClick={() => setPromoId(s.promoId)}
              className="flex w-full items-center gap-2 rounded-md border px-2.5 py-1 text-left text-xs transition-colors hover:border-orange-400 hover:bg-orange-50"
            >
              <Tag className="h-3.5 w-3.5 shrink-0 text-orange-500" />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <span className="shrink-0 font-medium text-muted-foreground">
                Save {formatCurrency(s.discountCentavos)}
              </span>
            </button>
          ))}
          {moreHints.map(hintLine)}
        </div>
      )}

      {/* All Promotions Modal */}
      {showAllPromos && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowAllPromos(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h2 className="text-base font-bold">All Promotions</h2>
                <p className="text-xs text-muted-foreground">
                  {activePromos.length} available promotion{activePromos.length !== 1 ? "s" : ""}
                  {applicable.length > 0 && ` · ${applicable.length} apply to this cart`}
                </p>
              </div>
              <button onClick={() => setShowAllPromos(false)} className="rounded-full p-1.5 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* The ones this cart gets first, most savings first */}
            <div className="flex-1 divide-y divide-border overflow-y-auto">
              {[...activePromos]
                .sort(
                  (a, b) =>
                    (byId[String(b._id)]?.discountCentavos ?? 0) - (byId[String(a._id)]?.discountCentavos ?? 0)
                )
                .map((promo) => {
                  const status = byId[String(promo._id)];
                  const isBest = best?.promoId === String(promo._id);
                  return (
                    <button
                      key={String(promo._id)}
                      onClick={() => {
                        setPromoId(String(promo._id));
                        setShowAllPromos(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-orange-50",
                        isBest && "bg-green-50"
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                          isBest ? "bg-green-100" : "bg-orange-100"
                        )}
                      >
                        {isBest ? (
                          <Sparkles className="h-4 w-4 text-green-600" />
                        ) : (
                          <Tag className="h-4 w-4 text-orange-600" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{promo.name}</p>
                        {status?.hint ? (
                          <p className="truncate text-xs text-amber-700">{status.hint}</p>
                        ) : (
                          promo.description && (
                            <p className="truncate text-xs text-muted-foreground">{promo.description}</p>
                          )
                        )}
                      </div>
                      {status?.applies ? (
                        <span className="shrink-0 text-xs font-semibold text-green-700">
                          {isBest ? "Best · " : ""}Save {formatCurrency(status.discountCentavos)}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-orange-700">
                          {typeBadge(promo.promoType)}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
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
  const savings = isDiscounted ? taxBreakdown.savingsCentavos : promoDiscount;

  return (
    <div className="mt-2 border-t pt-2">
      {/* Price breakdown */}
      <div className="mb-2 space-y-0.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{formatCurrency(taxBreakdown.subtotalCentavos)}</span>
        </div>

        {isDiscounted ? (
          <div className="flex items-center justify-between text-destructive">
            <span>Discount ({discountType === "senior" ? "SC" : "PWD"} 20%)</span>
            <span className="tabular-nums">-{formatCurrency(taxBreakdown.discountAmountCentavos)}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">VAT (12%)</span>
            <span className="tabular-nums">{formatCurrency(taxBreakdown.vatAmountCentavos)}</span>
          </div>
        )}

        {promoPreview?.applicable && promoDiscount > 0 && (
          <div className="flex items-center justify-between gap-2 text-orange-600">
            <span className="truncate" title={promoPreview.description}>
              Promo ({promoPreview.description})
            </span>
            <span className="shrink-0 tabular-nums">-{formatCurrency(promoDiscount)}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-0.5 text-base font-bold">
          <span>Total</span>
          <span className="tabular-nums">{formatCurrency(displayTotal)}</span>
        </div>

        {savings > 0 && (
          <div className="flex items-center justify-between text-xs font-medium text-green-600">
            <span>You save</span>
            <span className="tabular-nums">{formatCurrency(savings)}</span>
          </div>
        )}
      </div>

      {/* Hold · Clear · Complete Sale on one row */}
      <div className="flex gap-2">
        {showClearConfirm ? (
          <>
            <Button variant="destructive" className="h-12 px-3" onClick={handleClearCart}>
              Clear cart
            </Button>
            <Button variant="outline" className="h-12 px-3" onClick={() => setShowClearConfirm(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              className="h-12 gap-1.5 px-3"
              onClick={() => holdTransaction()}
              disabled={items.length === 0}
              title="Hold this sale"
            >
              <Pause className="h-4 w-4" />
              Hold
            </Button>
            <Button
              variant="outline"
              className="h-12 px-3 text-destructive hover:text-destructive"
              onClick={() => setShowClearConfirm(true)}
              disabled={items.length === 0}
              title="Clear the cart"
              aria-label="Clear the cart"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </>
        )}
        <Button
          className="h-12 flex-1 text-base"
          disabled={items.length === 0 || showClearConfirm}
          onClick={onCompleteSale}
        >
          Complete Sale {items.length > 0 ? `· ${formatCurrency(displayTotal)}` : ""}
        </Button>
      </div>
    </div>
  );
}

// ─── Desktop Cart Content ────────────────────────────────────────────────────

type ActivePromo = {
  _id: Id<"promotions">;
  name: string;
  description?: string;
  promoType: "percentage" | "fixedAmount" | "buyXGetY" | "tiered" | "crossSell" | "pwp";
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
  promoSuggestions,
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
  promoSuggestions: PromoSuggestions;
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
      <div className="flex items-center gap-2 border-b px-4 py-3">
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

      {/* Items — always at least a third of the panel, so a long promo list
          or the payment form can't squeeze the cart out of view. */}
      <div className="min-h-[35%] flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <ShoppingCart className="mb-2 h-10 w-10 opacity-30" />
            <p>Scan or search to add items</p>
          </div>
        ) : (
          <>
            <CartItemList
              items={items}
              updateQuantity={updateQuantity}
              removeItem={removeItem}
            />
            {!showPayment && (
              <CrossSellStrip variantIds={items.map((i) => i.variantId)} />
            )}
          </>
        )}
      </div>

      {/* Footer — discount, promotions, totals and actions */}
      {items.length > 0 && (
        <div className="flex max-h-[65%] shrink-0 flex-col border-t px-3 pb-3">
              <div className="min-h-0 flex-1 overflow-y-auto">
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
                  promoSuggestions={promoSuggestions}
                />
              </div>
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
        </div>
      )}

      {showPayment && (
        <PaymentModal
          items={items}
          taxBreakdown={taxBreakdown}
          discountType={discountType}
          selectedPromoId={selectedPromoId}
          promoPreview={promoPreview}
          onComplete={onPaymentComplete}
          onCancel={onPaymentCancel}
        />
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
  { value: "bankTransfer", label: "Bank Transfer" },
];

function PaymentPanel({
  items,
  taxBreakdown,
  discountType,
  selectedPromoId,
  promoPreview,
  onComplete,
  onCancel,
  variant = "inline",
  onProcessingChange,
}: {
  items: CartItem[];
  taxBreakdown: TaxBreakdown;
  discountType: DiscountType;
  selectedPromoId: string | null;
  promoPreview: PromoResult | null;
  onComplete: (result: TransactionResult) => void;
  onCancel: () => void;
  // "modal": inside PaymentModal, which has its own back and close, and
  // keeps Process Payment pinned while the form scrolls.
  variant?: "inline" | "modal";
  onProcessingChange?: (processing: boolean) => void;
}) {
  const createTransaction = useMutation(api.pos.transactions.createTransaction);
  const currentUser = useQuery(api.auth.users.getCurrentUser);
  const fashionAssistants = useQuery(api.pos.fashionAssistants.listActive);
  const connectionStatus = useConnectionStatus();
  const { clearCart } = usePOSCart();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountTendered, setAmountTendered] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  useEffect(() => {
    onProcessingChange?.(isProcessing);
  }, [isProcessing, onProcessingChange]);
  const [error, setError] = useState<string | null>(null);
  const [selectedFaId, setSelectedFaId] = useState<string>("none");

  // BIR Sold-To + SC/PWD capture (optional)
  const [customerName, setCustomerName] = useState("");
  const [customerTin, setCustomerTin] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [scPwdName, setScPwdName] = useState("");
  const [scPwdId, setScPwdId] = useState("");
  const isDiscounted = discountType === "senior" || discountType === "pwd";

  // Split payment state
  const [isSplit, setIsSplit] = useState(false);
  const [splitMethod, setSplitMethod] = useState<PaymentMethod>("gcash");
  const [splitAmountInput, setSplitAmountInput] = useState("");
  const [paymentReference, setPaymentReference] = useState("");

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

  // A bank transfer is taken on its reference number.
  const needsReference =
    paymentMethod === "bankTransfer" || (isSplit && splitMethod === "bankTransfer");
  const isReferenceValid = !needsReference || paymentReference.trim().length > 0;

  const canProcess = isCashSufficient && isSplitValid && isReferenceValid;

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
          paymentReference: needsReference ? paymentReference.trim() : undefined,
          customerName: customerName.trim() || undefined,
          customerTin: customerTin.trim() || undefined,
          customerAddress: customerAddress.trim() || undefined,
          scPwdName: isDiscounted ? scPwdName.trim() || undefined : undefined,
          scPwdIdNumber: isDiscounted ? scPwdId.trim() || undefined : undefined,
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
        deviceToken: getDeviceToken() ?? undefined,
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
        paymentReference: needsReference ? paymentReference.trim() : undefined,
        fashionAssistantId: selectedFaId !== "none"
          ? (selectedFaId as Id<"fashionAssistants">)
          : undefined,
        customerName: customerName.trim() || undefined,
        customerTin: customerTin.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        scPwdName: isDiscounted ? scPwdName.trim() || undefined : undefined,
        scPwdIdNumber: isDiscounted ? scPwdId.trim() || undefined : undefined,
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
    <div className={variant === "modal" ? "" : "border-t pt-4"}>
      {/* Back button */}
      {variant === "inline" && (
        <button
          onClick={onCancel}
          disabled={isProcessing}
          className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to cart
        </button>
      )}

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

      {/* Bank transfer reference (either portion paid by transfer) */}
      {needsReference && (
        <div className="mb-4">
          <label className="mb-1 block text-sm text-muted-foreground">
            Bank transfer reference no.
          </label>
          <input
            type="text"
            autoComplete="off"
            maxLength={64}
            placeholder="From the customer's transfer confirmation"
            className="h-12 w-full rounded-md border bg-background px-3 font-mono text-lg"
            value={paymentReference}
            onChange={(e) => {
              setPaymentReference(e.target.value);
              setError(null);
            }}
            disabled={isProcessing}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Check that the transfer has reached the store&apos;s account before completing the sale.
          </p>
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

      {/* Fashion Assistant selector */}
      {fashionAssistants && fashionAssistants.length > 0 && (
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Fashion Assistant <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <select
            value={selectedFaId}
            onChange={(e) => setSelectedFaId(e.target.value)}
            disabled={isProcessing}
            className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="none">— No fashion assistant —</option>
            {fashionAssistants.map((fa) => (
              <option key={String(fa._id)} value={String(fa._id)}>
                {fa.name}{fa.employeeCode ? ` (${fa.employeeCode})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Customer / BIR details (optional; SC/PWD required for discounted sales) */}
      <details className="mb-3 rounded-md border p-2">
        <summary className="cursor-pointer text-sm font-medium">
          {isDiscounted ? "Sold To & SC/PWD details" : "Sold To details (optional)"}
        </summary>
        <div className="mt-2 space-y-2">
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Customer name"
            disabled={isProcessing}
            className="w-full rounded border px-2 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <input
              value={customerTin}
              onChange={(e) => setCustomerTin(e.target.value)}
              placeholder="TIN"
              disabled={isProcessing}
              className="w-1/2 rounded border px-2 py-1.5 text-sm"
            />
            <input
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              placeholder="Address"
              disabled={isProcessing}
              className="w-1/2 rounded border px-2 py-1.5 text-sm"
            />
          </div>
          {isDiscounted && (
            <div className="flex gap-2">
              <input
                value={scPwdName}
                onChange={(e) => setScPwdName(e.target.value)}
                placeholder={discountType === "senior" ? "Senior name" : "PWD name"}
                disabled={isProcessing}
                className="w-1/2 rounded border px-2 py-1.5 text-sm"
              />
              <input
                value={scPwdId}
                onChange={(e) => setScPwdId(e.target.value)}
                placeholder={discountType === "senior" ? "OSCA/SC ID No." : "PWD ID No."}
                disabled={isProcessing}
                className="w-1/2 rounded border px-2 py-1.5 text-sm"
              />
            </div>
          )}
        </div>
      </details>

      {/* Error message */}
      {error && (
        <div className="mb-3 whitespace-pre-line rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Process Payment button — pinned in the modal while the form scrolls */}
      <div className={variant === "modal" ? "sticky bottom-0 bg-card pb-4 pt-2" : ""}>
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
    </div>
  );
}

// ─── Payment Modal ────────────────────────────────────────────────────────────
// Payment takes over the screen: the order on the left, read back to the
// customer, and the payment on the right with Process Payment pinned. It
// can't be closed while a payment is processing.

function PaymentModal({
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const isDiscounted = discountType !== "none";
  const promoDiscount = promoPreview?.applicable ? promoPreview.discountCentavos : 0;
  const total = taxBreakdown.totalCentavos - promoDiscount;
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Payment"
        className="flex h-full w-full flex-col overflow-hidden bg-card shadow-xl sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-xl sm:border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-lg font-bold">Payment</h2>
          <button
            onClick={onCancel}
            disabled={busy}
            aria-label="Close payment"
            className="rounded-full p-1.5 hover:bg-muted disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:overflow-hidden">
          {/* Order */}
          <div className="flex min-h-0 flex-col border-b bg-muted/20 md:border-b-0 md:border-r">
            <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Order · {itemCount} item{itemCount === 1 ? "" : "s"}
            </p>
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-3 text-sm">
              {items.map((item) => (
                <li key={item.variantId} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.styleName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {item.size} · {item.color} · {item.quantity} × {formatCurrency(item.unitPriceCentavos)}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatCurrency(item.unitPriceCentavos * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="space-y-0.5 border-t px-5 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatCurrency(taxBreakdown.subtotalCentavos)}</span>
              </div>
              {isDiscounted ? (
                <div className="flex justify-between text-destructive">
                  <span>Discount ({discountType === "senior" ? "SC" : "PWD"} 20%)</span>
                  <span className="tabular-nums">-{formatCurrency(taxBreakdown.discountAmountCentavos)}</span>
                </div>
              ) : (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT (12%)</span>
                  <span className="tabular-nums">{formatCurrency(taxBreakdown.vatAmountCentavos)}</span>
                </div>
              )}
              {promoDiscount > 0 && (
                <div className="flex justify-between gap-2 text-orange-600">
                  <span className="truncate" title={promoPreview?.description}>
                    Promo ({promoPreview?.description})
                  </span>
                  <span className="shrink-0 tabular-nums">-{formatCurrency(promoDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 text-lg font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(total)}</span>
              </div>
              <button
                onClick={onCancel}
                disabled={busy}
                className="mt-2 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to cart
              </button>
            </div>
          </div>

          {/* Payment */}
          <div className="min-h-0 px-5 pt-4 md:overflow-y-auto">
            <PaymentPanel
              items={items}
              taxBreakdown={taxBreakdown}
              discountType={discountType}
              selectedPromoId={selectedPromoId}
              promoPreview={promoPreview}
              onComplete={onComplete}
              onCancel={onCancel}
              variant="modal"
              onProcessingChange={setBusy}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Rush Mode Cart ─────────────────────────────────────────────────────────

function RushModeCart({
  items,
  totalItems,
  taxBreakdown,
  onCompleteSale,
  onPaymentComplete,
  showPayment,
  onPaymentCancel,
  clearCart,
}: {
  items: CartItem[];
  totalItems: number;
  taxBreakdown: TaxBreakdown;
  onCompleteSale: () => void;
  onPaymentComplete: (result: TransactionResult) => void;
  showPayment: boolean;
  onPaymentCancel: () => void;
  clearCart: () => void;
}) {
  return (
    <>
      {/* Rush header */}
      <div className="flex items-center gap-2 border-b bg-amber-500/5 p-4">
        <Zap className="h-5 w-5 text-amber-500" />
        <h2 className="text-lg font-bold">Quick Cart</h2>
        {totalItems > 0 && (
          <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold text-black">
            {totalItems}
          </span>
        )}
      </div>

      {/* Simplified items list */}
      <div className="flex-1 overflow-y-auto p-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <Zap className="h-12 w-12 text-amber-500/20" />
            <p className="text-sm text-muted-foreground">Scan items to start</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.variantId as string}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold truncate">{item.styleName}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.size} · {item.color} × {item.quantity}
                  </p>
                </div>
                <p className="text-lg font-bold tabular-nums ml-3">
                  {formatCurrency(item.unitPriceCentavos * item.quantity)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rush mode total + quick checkout */}
      <div className="border-t p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold">Total</span>
          <span className="text-3xl font-bold text-amber-500 tabular-nums">
            {formatCurrency(taxBreakdown.totalCentavos)}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="h-14 flex-1"
            disabled={items.length === 0}
            onClick={clearCart}
          >
            Clear
          </Button>
          <Button
            className="h-14 flex-[2] text-lg bg-amber-500 hover:bg-amber-600 text-black font-bold"
            disabled={items.length === 0}
            onClick={onCompleteSale}
          >
            <Zap className="mr-2 h-5 w-5" />
            Quick Checkout
          </Button>
        </div>
      </div>
      {showPayment && (
        <PaymentModal
          items={items}
          taxBreakdown={taxBreakdown}
          discountType="none"
          selectedPromoId={null}
          promoPreview={null}
          onComplete={onPaymentComplete}
          onCancel={onPaymentCancel}
        />
      )}
    </>
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
  const sendDigitalReceipt = useMutation(api.pos.receipts.sendDigitalReceipt);
  const [digitalMode, setDigitalMode] = useState<"email" | "sms" | null>(null);
  const [destination, setDestination] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (digitalMode) return; // Don't auto-dismiss while entering digital receipt info
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [onDismiss, digitalMode]);

  async function handleSendDigital() {
    if (!digitalMode || !destination.trim()) return;
    setSending(true);
    try {
      await sendDigitalReceipt({
        transactionId: result.transactionId,
        type: digitalMode,
        destination: destination.trim(),
      });
      toast.success(
        digitalMode === "email"
          ? `Receipt sent to ${destination}`
          : `Receipt sent to ${destination}`
      );
      setDigitalMode(null);
      setDestination("");
    } catch {
      toast.error("Failed to send receipt");
    } finally {
      setSending(false);
    }
  }

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

      {/* Digital receipt entry */}
      {digitalMode && (
        <div className="mt-4 w-72 rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-sm font-medium text-center">
            {digitalMode === "email" ? "Email Receipt" : "SMS Receipt"}
          </p>
          <input
            type={digitalMode === "email" ? "email" : "tel"}
            placeholder={digitalMode === "email" ? "customer@email.com" : "09XX-XXX-XXXX"}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={handleSendDigital}
              disabled={sending || !destination.trim()}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setDigitalMode(null); setDestination(""); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!digitalMode && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <div className="flex gap-2">
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
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setDigitalMode("email")}
            >
              Email Receipt
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setDigitalMode("sms")}
            >
              SMS Receipt
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

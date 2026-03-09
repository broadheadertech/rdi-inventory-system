"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Shirt, MapPin, Check, X, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn, formatPrice } from "@/lib/utils";

interface TryOnButtonProps {
  styleId: Id<"styles">;
  selectedVariantId: Id<"variants"> | null;
  selectedSize?: string;
  selectedColor?: string;
  priceCentavos?: number;
}

export function TryOnButton({
  styleId,
  selectedVariantId,
  selectedSize,
  selectedColor,
  priceCentavos,
}: TryOnButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    confirmationCode: string;
    branchName: string;
    expiresAt: number;
    itemCount: number;
  } | null>(null);

  const branchStock = useQuery(
    api.catalog.publicBrowse.getAllBranchStockForStylePublic,
    { styleId }
  );

  const createTryOn = useMutation(api.storefront.tryOnAhead.createTryOnReservation);

  // Filter branches that have stock for the selected variant
  const branchesWithStock = (branchStock ?? []).filter((branch) => {
    if (!selectedVariantId) return false;
    return branch.variants.some(
      (v) => v.variantId === selectedVariantId && v.quantity > 0
    );
  });

  const handleReserve = async (branchId: Id<"branches">, branchName: string) => {
    if (!selectedVariantId) return;
    setSubmitting(true);
    try {
      const result = await createTryOn({
        branchId,
        items: [{ variantId: selectedVariantId, quantity: 1 }],
      });
      setConfirmation(result);
      toast.success("Try-on reserved! Head to the store when ready.");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to reserve. Please try again.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!selectedVariantId) return null;

  return (
    <>
      <button
        onClick={() => {
          setConfirmation(null);
          setShowModal(true);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
      >
        <Shirt className="h-3.5 w-3.5" />
        Try On at Store
      </button>

      {/* Modal overlay */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />

          {/* Modal content */}
          <div className="relative z-10 w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl max-h-[80vh] overflow-y-auto">
            {/* Close button */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-3 right-3 rounded-full p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            {confirmation ? (
              /* Success state */
              <div className="text-center space-y-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                  <Check className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-100">
                    Try-On Reserved!
                  </h3>
                  <p className="mt-1 text-sm text-zinc-400">
                    Show this code at {confirmation.branchName}
                  </p>
                </div>

                <div className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    Confirmation Code
                  </p>
                  <p className="mt-1 text-2xl font-mono font-bold tracking-widest text-white">
                    {confirmation.confirmationCode}
                  </p>
                </div>

                <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
                  <Clock className="h-3 w-3" />
                  <span>
                    Held for 4 hours (until{" "}
                    {new Date(confirmation.expiresAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    )
                  </span>
                </div>

                <button
                  onClick={() => setShowModal(false)}
                  className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              /* Branch selection */
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-zinc-100">
                    Try On at Store
                  </h3>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    We&apos;ll have{" "}
                    {selectedSize && selectedColor
                      ? `${selectedColor} / ${selectedSize}`
                      : "your item"}{" "}
                    ready in the fitting room
                    {priceCentavos ? ` (${formatPrice(priceCentavos)})` : ""}
                  </p>
                </div>

                {branchesWithStock.length === 0 ? (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-4 text-center">
                    <p className="text-sm text-zinc-400">
                      No nearby stores have this item in stock.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {branchesWithStock.map((branch) => {
                      const variantStock = branch.variants.find(
                        (v) => v.variantId === selectedVariantId
                      );
                      const qty = variantStock?.quantity ?? 0;

                      return (
                        <button
                          key={branch.branchId}
                          disabled={submitting}
                          onClick={() =>
                            handleReserve(
                              branch.branchId as Id<"branches">,
                              branch.branchName
                            )
                          }
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-left transition-colors",
                            "hover:border-zinc-600 hover:bg-zinc-750 disabled:opacity-50"
                          )}
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-700">
                            <MapPin className="h-4 w-4 text-zinc-300" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-zinc-100 truncate">
                              {branch.branchName}
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              {qty} in stock
                            </p>
                          </div>
                          <div className="shrink-0 rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                            {submitting ? "..." : "Reserve"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <p className="text-[10px] text-zinc-600 text-center">
                  Items held for 4 hours. No obligation to buy.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

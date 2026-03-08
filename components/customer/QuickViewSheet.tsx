"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ShoppingCart, X, Layers, Check, BellRing } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatPrice, cn } from "@/lib/utils";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Color-to-hex mapping for rendering swatches                       */
/* ------------------------------------------------------------------ */
const COLOR_HEX_MAP: Record<string, string> = {
  black: "#000000",
  white: "#FFFFFF",
  navy: "#001F3F",
  red: "#DC2626",
  blue: "#2563EB",
  green: "#16A34A",
  yellow: "#EAB308",
  orange: "#EA580C",
  pink: "#EC4899",
  purple: "#9333EA",
  gray: "#6B7280",
  grey: "#6B7280",
  brown: "#92400E",
  beige: "#D2B48C",
  maroon: "#800000",
  teal: "#0D9488",
  coral: "#F87171",
  olive: "#84CC16",
  cream: "#FFFDD0",
  charcoal: "#374151",
  burgundy: "#800020",
  khaki: "#C3B091",
  tan: "#D2B48C",
  gold: "#CA8A04",
  silver: "#A8A29E",
  cyan: "#06B6D4",
};

function resolveColorHex(color: string): string {
  const key = color.toLowerCase().trim();
  return COLOR_HEX_MAP[key] ?? "#9CA3AF";
}

function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 180;
}

/* ------------------------------------------------------------------ */
/*  Skeleton loader                                                   */
/* ------------------------------------------------------------------ */
function QuickViewSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4">
      {/* Image skeleton */}
      <div className="aspect-square w-full rounded-lg bg-muted" />
      {/* Brand */}
      <div className="h-3 w-20 rounded bg-muted" />
      {/* Name */}
      <div className="h-5 w-48 rounded bg-muted" />
      {/* Price */}
      <div className="h-6 w-24 rounded bg-muted" />
      {/* Color swatches */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-8 rounded-full bg-muted" />
        ))}
      </div>
      {/* Size pills */}
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-14 rounded-full bg-muted" />
        ))}
      </div>
      {/* Button */}
      <div className="h-12 w-full rounded-lg bg-muted" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  QuickViewSheet                                                    */
/* ------------------------------------------------------------------ */
interface QuickViewSheetProps {
  styleId: Id<"styles"> | null;
  onClose: () => void;
}

export function QuickViewSheet({ styleId, onClose }: QuickViewSheetProps) {
  const data = useQuery(
    api.catalog.publicBrowse.getStyleDetailPublic,
    styleId ? { styleId } : "skip"
  );
  const addToCart = useMutation(api.storefront.cart.addToCart);
  const toggleWishlist = useMutation(api.storefront.wishlist.toggleWishlist);

  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [restockSubmitting, setRestockSubmitting] = useState(false);
  const [visible, setVisible] = useState(false);

  // Reset selections when a new style loads
  useEffect(() => {
    setSelectedColor(null);
    setSelectedSize(null);
    setAdding(false);
  }, [styleId]);

  // Animate in
  useEffect(() => {
    if (styleId) {
      // Small delay to allow mount before transition
      const t = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(t);
    } else {
      setVisible(false);
    }
  }, [styleId]);

  // Close with animation
  const handleClose = useCallback(() => {
    setVisible(false);
    const timeout = setTimeout(() => onClose(), 300);
    return () => clearTimeout(timeout);
  }, [onClose]);

  // Escape key closes the sheet
  useEffect(() => {
    if (!styleId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [styleId, handleClose]);

  // Derived data
  const uniqueColors = useMemo(() => {
    if (!data) return [];
    const colors = [...new Set(data.variants.map((v) => v.color))];
    return colors;
  }, [data]);

  const availableSizes = useMemo(() => {
    if (!data) return [];
    const filtered = selectedColor
      ? data.variants.filter((v) => v.color === selectedColor)
      : data.variants;
    // Unique sizes preserving order
    const seen = new Set<string>();
    return filtered.filter((v) => {
      if (seen.has(v.size)) return false;
      seen.add(v.size);
      return true;
    });
  }, [data, selectedColor]);

  const selectedVariant = useMemo(() => {
    if (!data || !selectedSize) return null;
    return data.variants.find(
      (v) =>
        v.size === selectedSize &&
        (selectedColor ? v.color === selectedColor : true)
    );
  }, [data, selectedColor, selectedSize]);

  const displayPrice = useMemo(() => {
    if (selectedVariant) return selectedVariant.priceCentavos;
    if (data) return data.basePriceCentavos;
    return 0;
  }, [data, selectedVariant]);

  const isOutOfStock = selectedVariant
    ? selectedVariant.branchesInStock === 0
    : false;

  const isInWishlist = useQuery(
    api.storefront.wishlist.isInWishlist,
    selectedVariant ? { variantId: selectedVariant._id } : "skip"
  );

  const primaryImage = useMemo(() => {
    if (!data) return null;
    const primary = data.images.find((img) => img.isPrimary);
    return primary?.url ?? data.images[0]?.url ?? null;
  }, [data]);

  // Don't render anything when no style selected
  if (!styleId) return null;

  const handleAddToCart = async () => {
    if (!selectedVariant) return;
    setAdding(true);
    try {
      await addToCart({ variantId: selectedVariant._id });
      toast.success("Added to cart");
      handleClose();
    } catch {
      toast.error("Failed to add to cart");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/40 transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={handleClose}
        aria-hidden
      />

      {/* Sheet */}
      <div
        className={cn(
          "relative z-10 flex max-h-[85vh] flex-col rounded-t-2xl bg-background transition-transform duration-300 ease-out",
          visible ? "translate-y-0" : "translate-y-full"
        )}
      >
        {/* Drag handle */}
        <div className="flex shrink-0 items-center justify-center py-3">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/40" />
        </div>

        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close quick view"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-4 pb-6">
          {!data ? (
            <QuickViewSkeleton />
          ) : (
            <div className="space-y-4">
              {/* Product image */}
              <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-secondary">
                {primaryImage ? (
                  <Image
                    src={primaryImage}
                    alt={data.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 400px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Layers className="h-12 w-12" />
                  </div>
                )}
              </div>

              {/* Brand name */}
              <p className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {data.brandName}
              </p>

              {/* Product name */}
              <h2 className="text-lg font-bold leading-tight text-foreground">
                {data.name}
              </h2>

              {/* Price */}
              <p className="font-mono text-xl font-bold text-primary">
                {formatPrice(displayPrice)}
              </p>

              {/* Color swatches */}
              {uniqueColors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Color{selectedColor ? `: ${selectedColor}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {uniqueColors.map((color) => {
                      const hex = resolveColorHex(color);
                      const light = isLightColor(hex);
                      const isSelected = selectedColor === color;
                      return (
                        <button
                          key={color}
                          onClick={() => {
                            setSelectedColor(
                              isSelected ? null : color
                            );
                            setSelectedSize(null);
                          }}
                          className={cn(
                            "relative h-8 w-8 rounded-full border-2 transition-all",
                            isSelected
                              ? "border-primary ring-2 ring-primary/30"
                              : light
                                ? "border-border hover:border-foreground/50"
                                : "border-transparent hover:border-foreground/50"
                          )}
                          style={{ backgroundColor: hex }}
                          title={color}
                          aria-label={color}
                        >
                          {isSelected && (
                            <Check
                              className={cn(
                                "absolute inset-0 m-auto h-4 w-4",
                                light ? "text-gray-800" : "text-white"
                              )}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Size pills */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Size{selectedSize ? `: ${selectedSize}` : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableSizes.map((variant) => {
                    const inStock = variant.branchesInStock > 0;
                    const isSelected = selectedSize === variant.size;
                    return (
                      <button
                        key={variant._id}
                        onClick={() => {
                          if (!inStock) return;
                          setSelectedSize(
                            isSelected ? null : variant.size
                          );
                        }}
                        disabled={!inStock}
                        className={cn(
                          "inline-flex h-9 min-w-[3rem] items-center justify-center rounded-full border px-3 text-sm font-medium transition-all",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : inStock
                              ? "border-border bg-card text-foreground hover:border-primary hover:text-primary"
                              : "border-border bg-muted text-muted-foreground line-through opacity-50 cursor-not-allowed"
                        )}
                      >
                        {variant.size}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Stock urgency indicator */}
              {selectedVariant &&
                selectedVariant.totalStock > 0 &&
                selectedVariant.totalStock <= 5 && (
                  <p className="text-xs font-semibold text-[#E8192C]">
                    Only {selectedVariant.totalStock} left in your size!
                  </p>
                )}

              {/* Add to Cart / Restock Notification button */}
              {selectedVariant && isOutOfStock ? (
                isInWishlist ? (
                  <button
                    disabled
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 py-3 text-sm font-medium text-zinc-400 cursor-default"
                  >
                    <BellRing className="h-4 w-4" />
                    Watching for Restock
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      if (!selectedVariant) return;
                      setRestockSubmitting(true);
                      try {
                        await toggleWishlist({ variantId: selectedVariant._id });
                        toast.success("We\u2019ll notify you when this is back in stock!");
                      } catch {
                        toast.error("Please sign in to get restock notifications");
                      } finally {
                        setRestockSubmitting(false);
                      }
                    }}
                    disabled={restockSubmitting}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 py-3 text-sm font-bold uppercase tracking-wide text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    <BellRing className="h-4 w-4" />
                    {restockSubmitting ? "Saving..." : "Notify Me When Back in Stock"}
                  </button>
                )
              ) : (
                <button
                  onClick={handleAddToCart}
                  disabled={!selectedVariant || adding}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold uppercase tracking-wide transition-colors",
                    selectedVariant && !adding
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  )}
                >
                  <ShoppingCart className="h-4 w-4" />
                  {adding ? "Adding..." : "Add to Cart"}
                </button>
              )}

              {/* View Full Details link */}
              <Link
                href={`/browse/style/${styleId}`}
                onClick={handleClose}
                className="block w-full rounded-lg border border-border py-3 text-center text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                View Full Details
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

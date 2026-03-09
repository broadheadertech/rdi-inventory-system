"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft, ShoppingBag, Heart, BellRing, Star, ThumbsUp, X, Sparkles } from "lucide-react";
import { PriceDropAlert } from "@/components/storefront/PriceDropAlert";
import { ImageLightbox } from "@/components/customer/ImageLightbox";
import { FilipinoFitGuide } from "@/components/customer/FilipinoFitGuide";
import { StyleGallery } from "@/components/customer/StyleGallery";
import { ShareButton } from "@/components/customer/ShareButton";
import { toast } from "sonner";
import { cn, formatPrice } from "@/lib/utils";
import { useSizePreferences } from "@/lib/hooks/useSizePreferences";
import { BranchStockDisplay } from "@/components/shared/BranchStockDisplay";
import { FulfillmentOptions } from "@/components/customer/FulfillmentOptions";
import { TryOnButton } from "@/components/customer/TryOnButton";
import { saveRecentlyViewed } from "@/components/customer/ContinueShopping";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// Garment size order for sorting (mirrors convex/inventory/stockLevels.ts)
const GARMENT_SIZE_ORDER: Record<string, number> = {
  XS: 0, S: 1, M: 2, L: 3, XL: 4, XXL: 5, XXXL: 6,
};

// Color name to hex mapping for swatch circles
const COLOR_HEX_MAP: Record<string, string> = {
  "Black": "#000000", "White": "#FFFFFF", "Red": "#E8192C",
  "Blue": "#2563EB", "Navy": "#1E3A5F", "Gray": "#6B7280",
  "Green": "#16A34A", "Yellow": "#EAB308", "Orange": "#F97316",
  "Pink": "#EC4899", "Purple": "#9333EA", "Brown": "#92400E",
  "Beige": "#D2B48C", "Maroon": "#800000", "Olive": "#808000",
  "Teal": "#14B8A6", "Coral": "#FF7F50",
  // Extra aliases
  "Grey": "#6B7280", "Cream": "#FFFDD0", "Khaki": "#BDB76B",
};

function colorToHex(colorName: string): string {
  if (COLOR_HEX_MAP[colorName]) return COLOR_HEX_MAP[colorName];
  const titleCase = colorName.charAt(0).toUpperCase() + colorName.slice(1).toLowerCase();
  if (COLOR_HEX_MAP[titleCase]) return COLOR_HEX_MAP[titleCase];
  const found = Object.entries(COLOR_HEX_MAP).find(
    ([k]) => k.toLowerCase() === colorName.toLowerCase()
  );
  return found ? found[1] : "#A1A1AA"; // zinc-400 fallback for unknown colors
}

export default function StyleDetailPage() {
  const params = useParams();
  const styleId = params.styleId as Id<"styles">;

  const style = useQuery(api.catalog.publicBrowse.getStyleDetailPublic, {
    styleId,
  });

  const router = useRouter();

  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<Id<"variants"> | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const galleryRef = useRef<HTMLDivElement>(null);

  // Reservation state
  const [reserveBranch, setReserveBranch] = useState<{
    id: Id<"branches">;
    name: string;
  } | null>(null);
  const [reserveForm, setReserveForm] = useState({ name: "", phone: "" });
  const [reserveErrors, setReserveErrors] = useState<{ name?: string; phone?: string }>({});
  const [reserving, setReserving] = useState(false);
  const createReservation = useMutation(api.reservations.reservations.createReservationPublic);
  const addToCart = useMutation(api.storefront.cart.addToCart);
  const [addingToCart, setAddingToCart] = useState(false);
  const trackView = useMutation(api.storefront.recentlyViewed.trackView);
  const toggleWishlist = useMutation(api.storefront.wishlist.toggleWishlist);
  const isInWishlist = useQuery(
    api.storefront.wishlist.isInWishlist,
    selectedVariantId ? { variantId: selectedVariantId } : "skip"
  );
  const [restockSubmitting, setRestockSubmitting] = useState(false);
  const { getPreferredSize, savePreferredSize } = useSizePreferences();
  const sizeAutoSelected = useRef(false);

  // Complete the Look recommendations
  const recommendations = useQuery(
    api.storefront.recommendations.getCompleteTheLook,
    { styleId }
  );

  // Frequently Bought Together recommendations
  const frequentlyBought = useQuery(
    api.storefront.recommendations.getFrequentlyBoughtTogether,
    { styleId }
  );

  // Reviews
  const reviewsData = useQuery(api.storefront.reviews.getStyleReviews, { styleId, limit: 50 });
  const submitReview = useMutation(api.storefront.reviews.submitReview);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewHoverRating, setReviewHoverRating] = useState(0);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [addingBundle, setAddingBundle] = useState(false);

  // Track product view
  useEffect(() => {
    if (styleId) {
      trackView({ styleId }).catch(() => {}); // fire-and-forget, ignore auth errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleId]);

  // Save to localStorage for "Continue Shopping"
  useEffect(() => {
    if (!style) return;
    saveRecentlyViewed({
      styleId: styleId as string,
      name: style.name,
      brandName: style.brandName ?? "",
      imageUrl: style.images?.[0]?.url ?? null,
      priceCentavos: style.basePriceCentavos,
    });
  }, [style, styleId]);

  // Extract unique colors (memoized to avoid recreating on every render)
  const uniqueColors = useMemo(
    () => (style ? Array.from(new Set(style.variants.map((v) => v.color))) : []),
    [style]
  );

  // Auto-select first color when data loads
  useEffect(() => {
    if (style && uniqueColors.length > 0 && !selectedColor) {
      setSelectedColor(uniqueColors[0]);
    }
  }, [style, uniqueColors, selectedColor]);

  // Get variants for selected color, sorted by garment size order
  const sizesForColor = style
    ? style.variants
        .filter((v) => v.color === selectedColor)
        .sort((a, b) => {
          const ai = GARMENT_SIZE_ORDER[a.size.toUpperCase()] ?? 99;
          const bi = GARMENT_SIZE_ORDER[b.size.toUpperCase()] ?? 99;
          return ai !== bi ? ai - bi : a.size.localeCompare(b.size);
        })
    : [];

  // Auto-select first available variant when color or stock data changes
  useEffect(() => {
    if (!style || !selectedColor) return;
    const filtered = style.variants
      .filter((v) => v.color === selectedColor)
      .sort((a, b) => {
        const ai = GARMENT_SIZE_ORDER[a.size.toUpperCase()] ?? 99;
        const bi = GARMENT_SIZE_ORDER[b.size.toUpperCase()] ?? 99;
        return ai !== bi ? ai - bi : a.size.localeCompare(b.size);
      });
    if (filtered.length > 0) {
      const firstInStock = filtered.find((v) => v.branchesInStock > 0);
      setSelectedVariantId(firstInStock?._id ?? null);
    } else {
      setSelectedVariantId(null);
    }
  }, [selectedColor, style]);

  // Auto-select preferred size from saved size preferences
  useEffect(() => {
    if (!style || !selectedColor || sizeAutoSelected.current) return;
    const categoryName = style.categoryName;
    const preferred = getPreferredSize(categoryName);
    if (!preferred) return;
    const filtered = style.variants.filter((v) => v.color === selectedColor);
    const match = filtered.find(
      (v) => v.size === preferred && v.branchesInStock > 0
    );
    if (match) {
      setSelectedVariantId(match._id);
      sizeAutoSelected.current = true;
    }
  }, [selectedColor, style, getPreferredSize]);

  // Get the selected variant for price display
  const selectedVariant = style?.variants.find((v) => v._id === selectedVariantId);

  // Sale logic
  const isOnSale = selectedVariant && style
    ? selectedVariant.priceCentavos < style.basePriceCentavos
    : false;

  // Check if selected variant is out of stock everywhere
  const isOutOfStock = selectedVariant
    ? selectedVariant.branchesInStock === 0
    : sizesForColor.length > 0 && sizesForColor.every((v) => v.branchesInStock === 0);

  // Resolve the variant image URL for the selected color (first variant with an imageUrl)
  const colorVariantImageUrl = useMemo(() => {
    if (!style || !selectedColor) return null;
    const variantWithImage = style.variants.find(
      (v) => v.color === selectedColor && v.imageUrl
    );
    return variantWithImage?.imageUrl ?? null;
  }, [style, selectedColor]);

  // Image gallery scroll tracking with IntersectionObserver
  const observerRef = useRef<IntersectionObserver | null>(null);
  const imageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const setImageRef = useCallback((el: HTMLDivElement | null, index: number) => {
    imageRefs.current[index] = el;
  }, []);

  useEffect(() => {
    if (!galleryRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = imageRefs.current.indexOf(entry.target as HTMLDivElement);
            if (index !== -1) setActiveImageIndex(index);
          }
        }
      },
      { root: galleryRef.current, threshold: 0.6 }
    );

    for (const ref of imageRefs.current) {
      if (ref) observerRef.current.observe(ref);
    }

    return () => observerRef.current?.disconnect();
  }, [style?.images]);

  // Loading state
  if (style === undefined) {
    return (
      <div className="min-h-screen">
        <div className="p-4">
          <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:px-6">
          <div className="aspect-[3/4] w-full animate-pulse bg-muted" />
          <div className="space-y-4 p-4 lg:p-0">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-8 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-6 w-32 animate-pulse rounded bg-muted" />
            <div className="flex gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 w-8 animate-pulse rounded-full bg-muted" />
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-11 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Not found
  if (style === null) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-4">
        <p className="text-lg text-muted-foreground">Product not found</p>
        <Link
          href="/browse"
          className="text-sm text-primary hover:underline"
        >
          Back to browse
        </Link>
      </div>
    );
  }

  // Reserve handlers
  const validateReserveForm = () => {
    const errors: { name?: string; phone?: string } = {};
    if (!reserveForm.name.trim()) errors.name = "Name is required";
    const stripped = reserveForm.phone.replace(/[\s\-()]/g, "");
    if (!stripped || !/^(\+?63|0)9\d{9}$/.test(stripped)) {
      errors.phone = "Enter a valid PH number (e.g., 09XX XXX XXXX)";
    }
    setReserveErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleReserveSubmit = async () => {
    if (!validateReserveForm() || !selectedVariantId || !reserveBranch) return;
    setReserving(true);
    try {
      const result = await createReservation({
        variantId: selectedVariantId,
        branchId: reserveBranch.id,
        customerName: reserveForm.name.trim(),
        customerPhone: reserveForm.phone.replace(/[\s\-()]/g, ""),
      });
      setReserveBranch(null);
      setReserveForm({ name: "", phone: "" });
      setReserveErrors({});
      router.push(`/reserve/${result.confirmationCode}`);
    } catch (err: unknown) {
      const error = err as { data?: { code?: string; message?: string; alternatives?: { branchName: string }[] } };
      if (error.data?.code === "OUT_OF_STOCK") {
        const alts = error.data.alternatives;
        const altMsg = alts && alts.length > 0
          ? ` Available at: ${alts.map((a) => a.branchName).join(", ")}`
          : "";
        toast.error(`Item no longer available at ${reserveBranch.name}.${altMsg}`);
        setReserveBranch(null);
      } else {
        toast.error(error.data?.message ?? "Something went wrong. Please try again.");
      }
    } finally {
      setReserving(false);
    }
  };

  const validImages = style.images.filter((img) => img.url !== null);

  return (
    <div className="min-h-screen pb-20 lg:pb-8">
      {/* Back button */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm p-4 lg:px-6">
        <Link
          href="/browse"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          aria-label="Back to browse"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="hidden sm:inline">Back</span>
        </Link>
      </div>

      <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:px-6">
        {/* Image Gallery — color variant image takes priority when available */}
        <div className="relative lg:sticky lg:top-20 lg:self-start">
          {colorVariantImageUrl ? (
            /* Single color-variant image with crossfade — clickable for lightbox */
            <button
              type="button"
              onClick={() => setLightboxIndex(0)}
              className="relative w-full aspect-[3/4] cursor-zoom-in"
              aria-label="Open full-screen image"
            >
              <Image
                key={colorVariantImageUrl}
                src={colorVariantImageUrl}
                alt={`${style.name} - ${selectedColor}`}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover animate-in fade-in duration-300"
                priority
              />
            </button>
          ) : validImages.length > 0 ? (
            <>
              <div
                ref={galleryRef}
                className="flex snap-x snap-mandatory overflow-x-auto [&::-webkit-scrollbar]:hidden"
              >
                {validImages.map((img, i) => (
                  <div
                    key={i}
                    ref={(el) => setImageRef(el, i)}
                    className="relative w-full flex-shrink-0 snap-center aspect-[3/4]"
                  >
                    <button
                      type="button"
                      onClick={() => setLightboxIndex(i)}
                      className="relative w-full h-full cursor-zoom-in"
                      aria-label={`Open image ${i + 1} in full screen`}
                    >
                      <Image
                        src={img.url!}
                        alt={`${style.name} - image ${i + 1}`}
                        fill
                        sizes="(max-width: 768px) 100vw, 50vw"
                        className="object-cover"
                        priority={i === 0}
                      />
                    </button>
                  </div>
                ))}
              </div>
              {/* Dot indicators */}
              {validImages.length > 1 && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {validImages.map((_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-2 w-2 rounded-full transition-colors",
                        i === activeImageIndex ? "bg-primary" : "bg-white/60"
                      )}
                      aria-hidden="true"
                    />
                  ))}
                </div>
              )}
              {/* Thumbnail strip below the gallery */}
              {validImages.length > 1 && (
                <div className="flex gap-2 p-3 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                  {validImages.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setActiveImageIndex(i);
                        // Scroll the gallery to the selected image
                        const target = imageRefs.current[i];
                        if (target) {
                          target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
                        }
                      }}
                      className={cn(
                        "relative h-16 w-16 flex-shrink-0 rounded-md overflow-hidden border-2 transition-all",
                        i === activeImageIndex
                          ? "border-primary ring-1 ring-primary/50"
                          : "border-transparent opacity-60 hover:opacity-90"
                      )}
                      aria-label={`View image ${i + 1}`}
                    >
                      <Image
                        src={img.url!}
                        alt={`Thumbnail ${i + 1}`}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : style.brandLogoUrl ? (
            <div className="relative flex aspect-[3/4] w-full items-center justify-center bg-muted">
              <Image
                src={style.brandLogoUrl}
                alt={style.brandName}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-contain p-12"
              />
            </div>
          ) : (
            <div className="flex aspect-[3/4] w-full items-center justify-center bg-muted text-muted-foreground">
              No images available
            </div>
          )}
        </div>

        {/* Product Details */}
        <div className="space-y-5 p-4 lg:p-0 lg:pt-0">
          {/* Brand & Category */}
          <div>
            <p className="text-sm text-muted-foreground">
              {style.brandName} &middot; {style.categoryName}
            </p>
            <div className="mt-1 flex items-start justify-between gap-2">
              <h1 className="text-2xl font-bold">{style.name}</h1>
              <ShareButton
                title={style.name}
                text={`Check out ${style.name} on RedBox Apparel!`}
                className="flex-shrink-0 mt-1"
              />
            </div>
            {style.description && (
              <p className="mt-2 text-sm text-muted-foreground">
                {style.description}
              </p>
            )}
          </div>

          {/* Price */}
          <div>
            {isOnSale && selectedVariant ? (
              <div className="flex items-center gap-2">
                <span className="text-sm line-through text-muted-foreground">
                  {formatPrice(style.basePriceCentavos)}
                </span>
                <span className="text-xl font-bold text-red-600">
                  {formatPrice(selectedVariant.priceCentavos)}
                </span>
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-600">
                  SALE
                </span>
              </div>
            ) : (
              <span className="text-xl font-bold">
                {formatPrice(
                  selectedVariant?.priceCentavos ?? style.basePriceCentavos
                )}
              </span>
            )}
            <div className="mt-1">
              <PriceDropAlert styleId={styleId} />
            </div>
          </div>

          {/* Color Swatches with Live Image Preview */}
          {uniqueColors.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">
                Color: <span className="font-normal text-muted-foreground">{selectedColor}</span>
              </p>
              <div className="flex flex-wrap gap-3">
                {uniqueColors.map((color) => {
                  const isSelected = selectedColor === color;
                  const hex = colorToHex(color);
                  const isWhitish = hex.toUpperCase() === "#FFFFFF" || hex.toUpperCase() === "#FFFDD0";
                  return (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      title={color}
                      className={cn(
                        "relative h-9 w-9 rounded-full border-2 transition-all duration-200",
                        isSelected
                          ? "scale-110 ring-2 ring-primary ring-offset-2 ring-offset-background border-primary"
                          : "border-zinc-600 hover:scale-105 hover:border-zinc-400",
                        isWhitish && !isSelected && "border-zinc-400"
                      )}
                      style={{ backgroundColor: hex }}
                      aria-label={`Select color ${color}`}
                      aria-pressed={isSelected}
                    >
                      {/* Inner check indicator for selected swatch */}
                      {isSelected && (
                        <span
                          className={cn(
                            "absolute inset-0 flex items-center justify-center text-xs font-bold",
                            isWhitish ? "text-zinc-800" : "text-white"
                          )}
                          aria-hidden="true"
                        >
                          &#10003;
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Size Grid */}
          {sizesForColor.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Size</p>
                <FilipinoFitGuide category={style.categoryName} />
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {sizesForColor.map((v) => (
                  <button
                    key={v._id}
                    onClick={() =>
                      v.branchesInStock > 0 && setSelectedVariantId(v._id)
                    }
                    disabled={v.branchesInStock === 0}
                    className={cn(
                      "min-h-[44px] rounded-md border text-sm font-medium transition-colors",
                      selectedVariantId === v._id
                        ? "border-primary bg-primary text-primary-foreground"
                        : v.branchesInStock > 0
                          ? "hover:border-primary"
                          : "opacity-50 cursor-not-allowed bg-muted"
                    )}
                    aria-label={`Size ${v.size}${v.branchesInStock === 0 ? " - out of stock" : ""}`}
                  >
                    {v.size}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stock urgency indicator */}
          {selectedVariant &&
            selectedVariant.totalStock > 0 &&
            selectedVariant.totalStock <= 5 && (
              <p className="text-xs font-semibold text-[#E8192C]">
                Only {selectedVariant.totalStock} left in your size!
              </p>
            )}

          {/* Add to Cart */}
          {selectedVariantId && !isOutOfStock && (
            <button
              onClick={async () => {
                setAddingToCart(true);
                try {
                  await addToCart({ variantId: selectedVariantId });
                  // Save the selected size as the preferred size for this category
                  if (selectedVariant && style) {
                    savePreferredSize(style.categoryName, selectedVariant.size);
                  }
                  toast.success("Added to bag!");
                } catch {
                  toast.error("Please sign in to add items to your bag");
                } finally {
                  setAddingToCart(false);
                }
              }}
              disabled={addingToCart}
              className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-md bg-primary text-sm font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <ShoppingBag className="h-4 w-4" />
              {addingToCart ? "Adding..." : "Add to Bag"}
            </button>
          )}

          {/* Try On at Store */}
          {selectedVariantId && !isOutOfStock && (
            <TryOnButton
              styleId={styleId}
              selectedVariantId={selectedVariantId}
              selectedSize={selectedVariant?.size}
              selectedColor={selectedVariant?.color}
              priceCentavos={selectedVariant?.priceCentavos}
            />
          )}

          {/* Notify Me — out of stock */}
          {isOutOfStock && selectedVariantId && (
            isInWishlist ? (
              <button
                disabled
                className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-400 text-sm font-medium cursor-default"
              >
                <BellRing className="h-4 w-4" />
                Watching for Restock
              </button>
            ) : (
              <button
                onClick={async () => {
                  if (!selectedVariantId) return;
                  setRestockSubmitting(true);
                  try {
                    await toggleWishlist({ variantId: selectedVariantId });
                    toast.success("We\u2019ll notify you when this is back in stock!");
                  } catch {
                    toast.error("Please sign in to get restock notifications");
                  } finally {
                    setRestockSubmitting(false);
                  }
                }}
                disabled={restockSubmitting}
                className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 text-sm font-bold uppercase tracking-wider hover:bg-zinc-800 disabled:opacity-50"
              >
                <BellRing className="h-4 w-4" />
                {restockSubmitting ? "Saving..." : "Notify Me When Back in Stock"}
              </button>
            )
          )}

          {/* Fulfillment Options */}
          <FulfillmentOptions variantId={selectedVariantId} />

          {/* Branch Stock Display */}
          <BranchStockDisplay
            styleId={styleId}
            selectedVariantId={selectedVariantId}
            onReserve={(branchId, branchName) => {
              setReserveBranch({ id: branchId, name: branchName });
              setReserveForm({ name: "", phone: "" });
              setReserveErrors({});
            }}
          />
        </div>
      </div>

      {/* Complete the Look — cross-sell recommendations */}
      {recommendations === undefined && (
        <section className="mt-10 px-4 lg:px-6">
          <div className="mb-4">
            <div className="h-5 w-40 rounded bg-zinc-800 animate-pulse" />
            <div className="mt-1.5 h-4 w-28 rounded bg-zinc-800/60 animate-pulse" />
          </div>
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-[160px] sm:w-[180px] rounded-lg border border-border bg-card">
                <div className="aspect-[3/4] w-full bg-zinc-800 animate-pulse" />
                <div className="p-2.5 space-y-2">
                  <div className="h-3 w-16 rounded bg-zinc-800 animate-pulse" />
                  <div className="h-4 w-full rounded bg-zinc-800 animate-pulse" />
                  <div className="h-4 w-20 rounded bg-zinc-800 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {recommendations && recommendations.length > 0 && (
        <section className="mt-10 px-4 lg:px-6">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Complete the Look</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-4 [&::-webkit-scrollbar]:hidden">
            {recommendations.map((item) => (
              <Link
                key={String(item.styleId)}
                href={`/browse/style/${item.styleId}`}
                className="group flex-shrink-0 w-[160px] sm:w-[180px] overflow-hidden rounded-lg border border-border bg-card transition-all hover:border-[var(--customer-accent-glow)] hover:shadow-[0_0_20px_rgba(232,25,44,0.1)]"
              >
                <div className="relative aspect-[3/4] w-full bg-secondary">
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.styleName}
                      fill
                      sizes="180px"
                      className="object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
                      No image
                    </div>
                  )}
                </div>
                <div className="p-2.5 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {item.brandName}
                  </p>
                  <h3 className="text-sm font-medium leading-tight line-clamp-2 text-foreground">
                    {item.styleName}
                  </h3>
                  <p className="font-mono text-sm font-bold text-primary">
                    {formatPrice(item.priceCentavos)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ─── Frequently Bought Together ──────────────────────────────────── */}
      {frequentlyBought === undefined && (
        <section className="mt-10 px-4 lg:px-6">
          <div className="mb-4">
            <div className="h-5 w-48 rounded bg-zinc-800 animate-pulse" />
            <div className="mt-1.5 h-4 w-36 rounded bg-zinc-800/60 animate-pulse" />
          </div>
          <div className="flex items-center gap-2 overflow-hidden">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="contents">
                {i > 0 && <span className="flex-shrink-0 text-2xl font-bold text-zinc-800">+</span>}
                <div className="flex-shrink-0 w-[120px] sm:w-[140px] rounded-lg border border-border bg-card">
                  <div className="aspect-[3/4] w-full bg-zinc-800 animate-pulse" />
                  <div className="p-2 space-y-1.5">
                    <div className="h-3 w-full rounded bg-zinc-800 animate-pulse" />
                    <div className="h-3 w-16 rounded bg-zinc-800 animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {frequentlyBought && frequentlyBought.length > 0 && (() => {
        const bundleTotal =
          style.basePriceCentavos +
          frequentlyBought.reduce((sum, i) => sum + i.basePriceCentavos, 0);
        const bundleDiscount = Math.round(bundleTotal * 0.1);
        const bundleDiscountedTotal = bundleTotal - bundleDiscount;
        // Check if all recommended items have a default variant for bundle add
        const canAddBundle =
          !!selectedVariantId &&
          frequentlyBought.every((item) => item.defaultVariantId !== null);

        return (
          <section className="mt-10 px-4 lg:px-6">
            <div className="mb-4">
              <h2 className="text-lg font-bold">Customers Also Bought</h2>
              <p className="text-sm text-muted-foreground">
                Frequently purchased together &mdash; <span className="text-[#E8192C] font-semibold">save 10% as a bundle</span>
              </p>
            </div>

            {/* Bundle row: current product + suggestions with "+" separators */}
            <div className="flex items-center gap-2 overflow-x-auto pb-4 [&::-webkit-scrollbar]:hidden">
              {/* Current product */}
              <div className="flex-shrink-0 w-[120px] sm:w-[140px] overflow-hidden rounded-lg border-2 border-primary bg-card">
                <div className="relative aspect-[3/4] w-full bg-secondary">
                  {style.images[0]?.url ? (
                    <Image
                      src={style.images[0].url}
                      alt={style.name}
                      fill
                      sizes="140px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
                      No image
                    </div>
                  )}
                </div>
                <div className="p-2 space-y-0.5">
                  <h3 className="text-xs font-medium leading-tight line-clamp-2 text-foreground">
                    {style.name}
                  </h3>
                  <p className="font-mono text-xs font-bold text-primary">
                    {formatPrice(style.basePriceCentavos)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">This item</p>
                </div>
              </div>

              {frequentlyBought.map((item) => (
                <div key={String(item.styleId)} className="contents">
                  {/* Plus separator */}
                  <span className="flex-shrink-0 text-2xl font-bold text-muted-foreground">+</span>

                  {/* Suggested product */}
                  <div className="flex-shrink-0 w-[120px] sm:w-[140px] overflow-hidden rounded-lg border border-border bg-card">
                    <Link
                      href={`/browse/style/${item.styleId}`}
                      className="group block"
                    >
                      <div className="relative aspect-[3/4] w-full bg-secondary">
                        {item.primaryImageUrl ? (
                          <Image
                            src={item.primaryImageUrl}
                            alt={item.name}
                            fill
                            sizes="140px"
                            className="object-cover transition-transform group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="p-2 space-y-0.5">
                        <h3 className="text-xs font-medium leading-tight line-clamp-2 text-foreground group-hover:text-primary transition-colors">
                          {item.name}
                        </h3>
                        <p className="font-mono text-xs font-bold text-primary">
                          {formatPrice(item.basePriceCentavos)}
                        </p>
                      </div>
                    </Link>
                    {/* Individual Add to Cart */}
                    {item.defaultVariantId && (
                      <div className="px-2 pb-2">
                        <button
                          onClick={async () => {
                            try {
                              await addToCart({ variantId: item.defaultVariantId! });
                              toast.success(`${item.name} added to bag!`);
                            } catch {
                              toast.error("Please sign in to add items to your bag");
                            }
                          }}
                          className="w-full rounded-md border border-zinc-700 bg-zinc-800 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-200 hover:bg-zinc-700 transition-colors"
                        >
                          Add to Bag
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Bundle pricing + Add Bundle button */}
            <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Bundle total ({frequentlyBought.length + 1} items)</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm line-through text-muted-foreground">
                      {formatPrice(bundleTotal)}
                    </span>
                    <span className="text-lg font-bold text-foreground">
                      {formatPrice(bundleDiscountedTotal)}
                    </span>
                  </div>
                </div>
                <span className="rounded bg-[#E8192C]/10 border border-[#E8192C]/30 px-2.5 py-1 text-xs font-bold text-[#E8192C]">
                  SAVE {formatPrice(bundleDiscount)}
                </span>
              </div>

              {canAddBundle && (
                <button
                  onClick={async () => {
                    if (!selectedVariantId) return;
                    setAddingBundle(true);
                    try {
                      // Add current product
                      await addToCart({ variantId: selectedVariantId });
                      // Add each recommended item
                      for (const item of frequentlyBought) {
                        if (item.defaultVariantId) {
                          await addToCart({ variantId: item.defaultVariantId });
                        }
                      }
                      toast.success(`Bundle added! You saved ${formatPrice(bundleDiscount)}`);
                    } catch {
                      toast.error("Please sign in to add items to your bag");
                    } finally {
                      setAddingBundle(false);
                    }
                  }}
                  disabled={addingBundle}
                  className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-md bg-[#E8192C] text-sm font-bold uppercase tracking-wider text-white hover:bg-[#E8192C]/90 disabled:opacity-50 transition-colors"
                >
                  <ShoppingBag className="h-4 w-4" />
                  {addingBundle ? "Adding Bundle..." : "Add Bundle to Bag"}
                </button>
              )}
            </div>
          </section>
        );
      })()}

      {/* ─── Reviews Section ──────────────────────────────────────────────── */}
      {reviewsData && (
        <div className="mt-12 px-4 lg:px-6 pb-8">
          <h2 className="text-xl font-bold mb-6">Customer Reviews</h2>

          <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8">
            {/* Rating Summary */}
            <div className="mb-8 lg:mb-0">
              <div className="flex items-center gap-4 mb-4">
                <span className="text-5xl font-bold">
                  {reviewsData.summary.totalCount > 0
                    ? reviewsData.summary.averageRating.toFixed(1)
                    : "\u2014"}
                </span>
                <div>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={cn(
                          "h-5 w-5",
                          star <= Math.round(reviewsData.summary.averageRating)
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-zinc-600"
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {reviewsData.summary.totalCount} review{reviewsData.summary.totalCount !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              {/* Rating distribution bars */}
              <div className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = reviewsData.summary.distribution[star] ?? 0;
                  const pct =
                    reviewsData.summary.totalCount > 0
                      ? (count / reviewsData.summary.totalCount) * 100
                      : 0;
                  return (
                    <div key={star} className="flex items-center gap-2 text-sm">
                      <span className="w-3 text-right text-muted-foreground">{star}</span>
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-yellow-400 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-xs text-muted-foreground">{count}</span>
                    </div>
                  );
                })}
              </div>

              {/* Write a Review button */}
              <button
                onClick={() => setShowReviewForm((prev) => !prev)}
                className="mt-6 w-full min-h-[44px] rounded-md border border-zinc-700 bg-zinc-900 text-sm font-medium text-zinc-100 hover:bg-zinc-800 transition-colors"
              >
                {showReviewForm ? "Cancel" : "Write a Review"}
              </button>
            </div>

            {/* Reviews list + form column */}
            <div>
              {/* Review Form */}
              {showReviewForm && (
                <div className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-4">
                  <h3 className="text-sm font-semibold">Your Review</h3>

                  {/* Star selector */}
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Rating</p>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setReviewRating(star)}
                          onMouseEnter={() => setReviewHoverRating(star)}
                          onMouseLeave={() => setReviewHoverRating(0)}
                          className="p-0.5"
                          aria-label={`${star} star${star !== 1 ? "s" : ""}`}
                        >
                          <Star
                            className={cn(
                              "h-7 w-7 transition-colors",
                              star <= (reviewHoverRating || reviewRating)
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-zinc-600"
                            )}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Title */}
                  <div>
                    <label htmlFor="review-title" className="text-sm text-muted-foreground">
                      Title (optional)
                    </label>
                    <input
                      id="review-title"
                      type="text"
                      placeholder="Summarize your experience"
                      value={reviewTitle}
                      onChange={(e) => setReviewTitle(e.target.value)}
                      className="mt-1 w-full rounded-md border border-zinc-700 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  {/* Body */}
                  <div>
                    <label htmlFor="review-body" className="text-sm text-muted-foreground">
                      Review (optional)
                    </label>
                    <textarea
                      id="review-body"
                      rows={4}
                      placeholder="Tell others what you thought of this product..."
                      value={reviewBody}
                      onChange={(e) => setReviewBody(e.target.value)}
                      className="mt-1 w-full rounded-md border border-zinc-700 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary resize-none"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={reviewRating === 0 || submittingReview}
                    onClick={async () => {
                      if (reviewRating === 0) return;
                      setSubmittingReview(true);
                      try {
                        await submitReview({
                          styleId,
                          rating: reviewRating,
                          title: reviewTitle.trim() || undefined,
                          body: reviewBody.trim() || undefined,
                        });
                        toast.success("Review submitted! It will appear after moderation.");
                        setShowReviewForm(false);
                        setReviewRating(0);
                        setReviewTitle("");
                        setReviewBody("");
                      } catch (err: unknown) {
                        const error = err as { data?: string; message?: string };
                        toast.error(
                          typeof error.data === "string"
                            ? error.data
                            : error.message ?? "Failed to submit review. Please sign in and try again."
                        );
                      } finally {
                        setSubmittingReview(false);
                      }
                    }}
                    className="w-full min-h-[44px] rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {submittingReview ? "Submitting..." : "Submit Review"}
                  </button>
                </div>
              )}

              {/* Review Cards */}
              {reviewsData.reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No reviews yet. Be the first to share your thoughts!
                </p>
              ) : (
                <div className="space-y-6">
                  {reviewsData.reviews.map((review) => (
                    <div
                      key={review._id}
                      className="border-b border-zinc-800 pb-6 last:border-0"
                    >
                      {/* Stars + title */}
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={cn(
                                "h-4 w-4",
                                star <= review.rating
                                  ? "fill-yellow-400 text-yellow-400"
                                  : "text-zinc-600"
                              )}
                            />
                          ))}
                        </div>
                        {review.title && (
                          <span className="font-semibold text-sm">{review.title}</span>
                        )}
                      </div>

                      {/* Customer + date + badge */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                        <span>{review.customerName}</span>
                        <span>&middot;</span>
                        <span>
                          {new Date(review.createdAt).toLocaleDateString("en-PH", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        {review.isVerifiedPurchase && (
                          <>
                            <span>&middot;</span>
                            <span className="inline-flex items-center gap-1 rounded bg-green-900/40 px-1.5 py-0.5 text-green-400 font-medium">
                              Verified Purchase
                            </span>
                          </>
                        )}
                      </div>

                      {/* Body */}
                      {review.body && (
                        <p className="text-sm text-zinc-300 mb-3 whitespace-pre-line">
                          {review.body}
                        </p>
                      )}

                      {/* Photo thumbnails */}
                      {review.imageUrls.length > 0 && (
                        <div className="flex gap-2 mb-3 flex-wrap">
                          {review.imageUrls.map((url, i) => (
                            <button
                              key={i}
                              onClick={() => setEnlargedImageUrl(url)}
                              className="relative h-16 w-16 rounded-md overflow-hidden border border-zinc-700 hover:border-zinc-500 transition-colors"
                            >
                              <Image
                                src={url}
                                alt={`Review photo ${i + 1}`}
                                fill
                                sizes="64px"
                                className="object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Helpful */}
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ThumbsUp className="h-3.5 w-3.5" />
                        <span>Helpful ({review.helpfulCount})</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Style Gallery Section ───────────────────────────────────────── */}
      <div className="mt-12 px-4 pb-8">
        <StyleGallery styleId={styleId} />
      </div>

      {/* Product image lightbox */}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={
            colorVariantImageUrl
              ? [colorVariantImageUrl]
              : validImages.map((img) => img.url!)
          }
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* Enlarged review image overlay */}
      {enlargedImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setEnlargedImageUrl(null)}
        >
          <button
            onClick={() => setEnlargedImageUrl(null)}
            className="absolute top-4 right-4 text-white hover:text-zinc-300"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
          <div className="relative max-h-[80vh] max-w-[90vw]">
            <Image
              src={enlargedImageUrl}
              alt="Review photo enlarged"
              width={800}
              height={800}
              className="object-contain max-h-[80vh] rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Reserve for Pickup — Bottom Sheet */}
      <Sheet
        open={!!reserveBranch}
        onOpenChange={(open) => {
          if (!open) setReserveBranch(null);
        }}
      >
        <SheetContent side="bottom" className="rounded-t-xl">
          <SheetHeader>
            <SheetTitle>
              Reserve for Pickup at {reserveBranch?.name}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4 pb-6">
            {/* Customer Name */}
            <div>
              <label htmlFor="reserve-name" className="text-sm font-medium">
                Your Name
              </label>
              <input
                id="reserve-name"
                type="text"
                placeholder="Juan Dela Cruz"
                value={reserveForm.name}
                onChange={(e) =>
                  setReserveForm((f) => ({ ...f, name: e.target.value }))
                }
                onBlur={() => {
                  if (!reserveForm.name.trim()) {
                    setReserveErrors((e) => ({ ...e, name: "Name is required" }));
                  } else {
                    setReserveErrors((e) => ({ ...e, name: undefined }));
                  }
                }}
                className={cn(
                  "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary",
                  reserveErrors.name && "border-red-500"
                )}
              />
              {reserveErrors.name && (
                <p className="mt-1 text-xs text-red-500">{reserveErrors.name}</p>
              )}
            </div>

            {/* Phone Number */}
            <div>
              <label htmlFor="reserve-phone" className="text-sm font-medium">
                Phone Number
              </label>
              <input
                id="reserve-phone"
                type="tel"
                placeholder="09XX XXX XXXX"
                value={reserveForm.phone}
                onChange={(e) =>
                  setReserveForm((f) => ({ ...f, phone: e.target.value }))
                }
                onBlur={() => {
                  const stripped = reserveForm.phone.replace(/[\s\-()]/g, "");
                  if (!stripped || !/^(\+?63|0)9\d{9}$/.test(stripped)) {
                    setReserveErrors((e) => ({
                      ...e,
                      phone: "Enter a valid PH number (e.g., 09XX XXX XXXX)",
                    }));
                  } else {
                    setReserveErrors((e) => ({ ...e, phone: undefined }));
                  }
                }}
                className={cn(
                  "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary",
                  reserveErrors.phone && "border-red-500"
                )}
              />
              {reserveErrors.phone && (
                <p className="mt-1 text-xs text-red-500">
                  {reserveErrors.phone}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="button"
              onClick={handleReserveSubmit}
              disabled={reserving}
              className="w-full min-h-[44px] rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {reserving ? "Reserving..." : `Reserve at ${reserveBranch?.name}`}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

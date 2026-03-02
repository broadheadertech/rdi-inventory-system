"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { cn, formatPrice } from "@/lib/utils";
import { BranchStockDisplay } from "@/components/shared/BranchStockDisplay";
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

// Simple color name to CSS color mapping for swatch circles
const COLOR_MAP: Record<string, string> = {
  white: "#ffffff",
  black: "#1a1a1a",
  red: "#dc2626",
  blue: "#2563eb",
  navy: "#1e3a5f",
  green: "#16a34a",
  yellow: "#eab308",
  orange: "#ea580c",
  pink: "#ec4899",
  purple: "#9333ea",
  gray: "#6b7280",
  grey: "#6b7280",
  brown: "#92400e",
  beige: "#d4b896",
  cream: "#fffdd0",
  maroon: "#7f1d1d",
  teal: "#0d9488",
  coral: "#f87171",
  khaki: "#bdb76b",
};

function colorToHex(colorName: string): string {
  return COLOR_MAP[colorName.toLowerCase()] ?? "#d4d4d8";
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
        {/* Image Gallery */}
        <div className="relative lg:sticky lg:top-20 lg:self-start">
          {validImages.length > 0 ? (
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
                    <Image
                      src={img.url!}
                      alt={`${style.name} - image ${i + 1}`}
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-cover"
                      priority={i === 0}
                    />
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
            </>
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
            <h1 className="mt-1 text-2xl font-bold">{style.name}</h1>
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
          </div>

          {/* Color Swatches */}
          {uniqueColors.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">
                Color: <span className="font-normal text-muted-foreground">{selectedColor}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {uniqueColors.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-all",
                      selectedColor === color
                        ? "ring-2 ring-primary ring-offset-2"
                        : "border-muted-foreground/30"
                    )}
                    style={{ backgroundColor: colorToHex(color) }}
                    aria-label={`Select ${color}`}
                    aria-pressed={selectedColor === color}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Size Grid */}
          {sizesForColor.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Size</p>
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

          {/* Notify Me — out of stock placeholder */}
          {isOutOfStock && (
            <button
              onClick={() =>
                toast.info("Notifications coming soon! Check back later.")
              }
              className="w-full min-h-[44px] rounded-md border border-primary text-primary text-sm font-medium hover:bg-primary/5"
            >
              Notify Me When Available
            </button>
          )}

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

"use client";

import Image from "next/image";
import Link from "next/link";
import { Eye, Layers, Zap } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { formatPrice } from "@/lib/utils";
import { SaveButton } from "./SaveButton";
import { VoteButton } from "./VoteButton";

const MAX_VISIBLE_SIZES = 5;

interface CustomerProductCardProps {
  styleId: Id<"styles">;
  name: string;
  brandName?: string;
  priceCentavos: number;
  imageUrl: string | null;
  brandLogoUrl?: string | null;
  variantCount: number;
  branchCount: number;
  sizes?: string[];
  availableSizes?: string[];
  createdAt?: number;
  soldCount?: number;
  expressAvailable?: boolean;
  isExclusive?: boolean;
  onQuickView?: (styleId: Id<"styles">) => void;
}

function StockDot({ branchCount }: { branchCount: number }) {
  if (branchCount === 0) {
    return <span className="h-2 w-2 rounded-full bg-muted-foreground" />;
  }
  if (branchCount <= 2) {
    return <span className="h-2 w-2 rounded-full bg-amber-500" />;
  }
  return <span className="h-2 w-2 rounded-full bg-green-500" />;
}

export function CustomerProductCard({
  styleId,
  name,
  brandName,
  priceCentavos,
  imageUrl,
  brandLogoUrl,
  branchCount,
  sizes,
  availableSizes,
  createdAt,
  soldCount,
  expressAvailable,
  isExclusive,
  onQuickView,
}: CustomerProductCardProps) {
  const isNew =
    createdAt != null &&
    Date.now() - createdAt < 7 * 24 * 60 * 60 * 1000;
  const isHot = soldCount != null && soldCount > 10;
  const sizesToShow = availableSizes ?? sizes;
  const visibleSizes = sizesToShow?.slice(0, MAX_VISIBLE_SIZES);
  const overflowCount = sizesToShow
    ? Math.max(0, sizesToShow.length - MAX_VISIBLE_SIZES)
    : 0;
  return (
    <Link
      href={`/browse/style/${styleId}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-all hover:border-[var(--customer-accent-glow)] hover:shadow-[0_0_20px_rgba(232,25,44,0.1)]"
    >
      {/* Image container — 3:4 portrait aspect ratio */}
      <div className="relative aspect-[3/4] w-full bg-secondary">
        {/* Badges */}
        {(isNew || isHot || expressAvailable || isExclusive) && (
          <div className="absolute left-2 top-2 z-10 flex flex-col gap-1">
            {isExclusive && (
              <span className="rounded bg-purple-600 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-white">
                EXCLUSIVE
              </span>
            )}
            {isNew && (
              <span className="rounded bg-[#E8192C] px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-white">
                NEW
              </span>
            )}
            {isHot && (
              <span className="rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-white">
                HOT
              </span>
            )}
            {expressAvailable && (
              <span className="flex items-center gap-0.5 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-white">
                <Zap className="h-2.5 w-2.5 fill-current" />
                EXPRESS
              </span>
            )}
          </div>
        )}
        {/* Save / Wishlist button */}
        <div className="absolute right-2 top-2 z-10">
          <SaveButton styleId={styleId} />
        </div>
        {/* Quick View button */}
        {onQuickView && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuickView(styleId);
            }}
            className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-900 opacity-0 shadow-md backdrop-blur-sm transition-all group-hover:opacity-100"
          >
            <Eye className="h-3.5 w-3.5" />
            Quick View
          </button>
        )}
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : brandLogoUrl ? (
          <div className="flex h-full items-center justify-center p-6">
            <Image
              src={brandLogoUrl}
              alt={brandName ?? "Brand"}
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-contain p-6"
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Layers className="h-8 w-8" />
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {brandName && (
          <p
            className="font-display text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
          >
            {brandName}
          </p>
        )}
        <h3 className="text-sm font-medium leading-tight line-clamp-2 text-foreground">
          {name}
        </h3>
        <p
          className="font-mono text-base font-bold text-primary"
        >
          {formatPrice(priceCentavos)}
        </p>
        {soldCount != null && soldCount > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {soldCount} sold this month
          </p>
        )}
        {/* Size availability pills */}
        {visibleSizes && visibleSizes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {visibleSizes.map((size) => (
              <span
                key={size}
                className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full border border-[#2A2A2A] px-1.5 text-[10px] text-gray-400"
              >
                {size}
              </span>
            ))}
            {overflowCount > 0 && (
              <span className="inline-flex h-5 items-center justify-center px-1 text-[10px] text-gray-400">
                +{overflowCount} more
              </span>
            )}
          </div>
        )}
        {/* Inline branch availability + vote */}
        <div className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <StockDot branchCount={branchCount} />
          {branchCount > 0 ? (
            <span>
              Available at {branchCount}{" "}
              {branchCount === 1 ? "branch" : "branches"}
            </span>
          ) : (
            <span>Out of stock</span>
          )}
          <span className="ml-auto">
            <VoteButton styleId={styleId} />
          </span>
        </div>
      </div>
    </Link>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { Layers } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { formatPrice } from "@/lib/utils";

interface CustomerProductCardProps {
  styleId: Id<"styles">;
  name: string;
  brandName?: string;
  priceCentavos: number;
  imageUrl: string | null;
  variantCount: number;
  branchCount: number;
  sizes?: string[];
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
  branchCount,
  sizes,
}: CustomerProductCardProps) {
  return (
    <Link
      href={`/browse/style/${styleId}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-all hover:border-[var(--customer-accent-glow)] hover:shadow-[0_0_20px_rgba(232,25,44,0.1)]"
    >
      {/* Image container — 3:4 portrait aspect ratio */}
      <div className="relative aspect-[3/4] w-full bg-secondary">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform group-hover:scale-105"
          />
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
        {/* Size availability dots */}
        {sizes && sizes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {sizes.map((size) => (
              <span
                key={size}
                className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full border border-border px-1 text-[10px] text-muted-foreground"
              >
                {size}
              </span>
            ))}
          </div>
        )}
        {/* Inline branch availability */}
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
        </div>
      </div>
    </Link>
  );
}

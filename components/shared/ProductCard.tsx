"use client";

import Image from "next/image";
import Link from "next/link";
import { MapPin, Layers } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { formatPrice } from "@/lib/utils";

interface ProductCardProps {
  styleId: Id<"styles">;
  name: string;
  brandName?: string;
  priceCentavos: number;
  imageUrl: string | null;
  variantCount: number;
  branchCount: number;
  sizes?: string[];
}

export function ProductCard({
  styleId,
  name,
  brandName,
  priceCentavos,
  imageUrl,
  branchCount,
  sizes,
}: ProductCardProps) {
  return (
    <Link
      href={`/browse/style/${styleId}`}
      className="group flex flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary"
    >
      {/* Image container — 3:4 portrait aspect ratio */}
      <div className="relative aspect-[3/4] w-full bg-muted">
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
      <div className="flex flex-1 flex-col gap-1 p-3">
        {brandName && (
          <p className="text-xs text-muted-foreground">{brandName}</p>
        )}
        <h3 className="text-sm font-medium leading-tight line-clamp-2">
          {name}
        </h3>
        <p className="text-base font-bold text-primary">
          {formatPrice(priceCentavos)}
        </p>
        {/* Size availability dots */}
        {sizes && sizes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {sizes.map((size) => (
              <span
                key={size}
                className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full border px-1 text-[10px] text-muted-foreground"
              >
                {size}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
          {branchCount > 0 && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {branchCount} {branchCount === 1 ? "branch" : "branches"}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

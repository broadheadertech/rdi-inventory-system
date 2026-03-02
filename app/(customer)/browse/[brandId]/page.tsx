"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ArrowLeft } from "lucide-react";
import { CustomerProductCard } from "@/components/customer/CustomerProductCard";
import { cn } from "@/lib/utils";

export default function BrandPage() {
  const params = useParams();
  const brandId = params.brandId as Id<"brands">;

  const brand = useQuery(
    api.catalog.publicBrowse.getBrandWithCategoriesPublic,
    { brandId }
  );

  const [selectedCategory, setSelectedCategory] = useState<
    Id<"categories"> | null
  >(null);

  const activeCategoryId =
    selectedCategory ?? (brand?.categories[0]?._id ?? null);

  const styles = useQuery(
    api.catalog.publicBrowse.getStylesByCategoryPublic,
    activeCategoryId ? { categoryId: activeCategoryId } : "skip"
  );

  if (brand === null) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 text-center">
        <p className="text-muted-foreground">Brand not found.</p>
        <Link
          href="/browse"
          className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to brands
        </Link>
      </div>
    );
  }

  if (brand === undefined) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="h-8 w-48 animate-pulse rounded bg-secondary" />
        <div className="mt-4 flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-20 animate-pulse rounded-full bg-secondary" />
          ))}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-lg border border-border bg-secondary" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex items-center gap-3">
        <Link
          href="/browse"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-primary hover:text-primary"
          aria-label="Back to brands"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1
          className="font-display text-2xl font-bold uppercase tracking-tight"
        >
          {brand.name}
        </h1>
      </div>

      {brand.categories.length > 0 && (
        <div
          className="mt-4 flex gap-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          role="tablist"
        >
          {brand.categories.map((cat) => (
            <button
              key={cat._id}
              role="tab"
              aria-selected={activeCategoryId === cat._id}
              onClick={() => setSelectedCategory(cat._id)}
              className={cn(
                "flex-shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                activeCategoryId === cat._id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary hover:text-primary"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {brand.categories.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          No product categories available for this brand.
        </p>
      )}

      {activeCategoryId && (
        <div className="mt-6">
          {styles === undefined && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-64 animate-pulse rounded-lg border border-border bg-secondary"
                />
              ))}
            </div>
          )}

          {styles !== undefined && styles.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No products in this category yet.
            </p>
          )}

          {styles !== undefined && styles.length > 0 && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {styles.map((style) => (
                <CustomerProductCard
                  key={style._id}
                  styleId={style._id}
                  name={style.name}
                  brandName={brand.name}
                  priceCentavos={style.basePriceCentavos}
                  imageUrl={style.primaryImageUrl}
                  variantCount={style.variantCount}
                  branchCount={style.branchCount}
                  sizes={style.sizes}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

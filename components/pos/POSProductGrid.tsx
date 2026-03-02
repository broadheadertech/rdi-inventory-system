"use client";

import Image from "next/image";
import { Search, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";
import { BranchStockDisplay } from "@/components/inventory/BranchStockDisplay";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

export type POSProduct = {
  styleId: Id<"styles">;
  styleName: string;
  brandName: string;
  categoryName: string;
  basePriceCentavos: number;
  imageUrl: string | null;
  sizes: {
    variantId: Id<"variants">;
    sku: string;
    size: string;
    color: string;
    priceCentavos: number;
    stock: number;
  }[];
};

type FilterChip = {
  _id: string;
  name: string;
};

type POSProductGridProps = {
  products: POSProduct[] | undefined;
  brands: FilterChip[] | undefined;
  categories: FilterChip[] | undefined;
  searchText: string;
  onSearchChange: (text: string) => void;
  selectedBrandId: string | null;
  onBrandSelect: (brandId: string | null) => void;
  selectedCategoryId: string | null;
  onCategorySelect: (categoryId: string | null) => void;
  onAddToCart: (variantId: Id<"variants">, priceCentavos: number, styleName: string, size: string, color: string) => void;
};

export function POSProductGrid({
  products,
  brands,
  categories,
  searchText,
  onSearchChange,
  selectedBrandId,
  onBrandSelect,
  selectedCategoryId,
  onCategorySelect,
  onAddToCart,
}: POSProductGridProps) {
  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by style, brand, or SKU..."
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-14 pl-10 text-lg"
        />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button
          variant={!selectedBrandId && !selectedCategoryId ? "default" : "outline"}
          className="h-14 shrink-0 px-4 text-base"
          onClick={() => {
            onBrandSelect(null);
            onCategorySelect(null);
          }}
        >
          All
        </Button>
        {brands?.map((brand) => (
          <Button
            key={brand._id}
            variant={selectedBrandId === brand._id ? "default" : "outline"}
            className="h-14 shrink-0 px-4 text-base"
            onClick={() => {
              if (selectedBrandId === brand._id) {
                onBrandSelect(null);
                onCategorySelect(null);
              } else {
                onBrandSelect(brand._id);
                onCategorySelect(null);
              }
            }}
          >
            {brand.name}
          </Button>
        ))}
        {selectedBrandId &&
          categories?.map((cat) => (
            <Button
              key={cat._id}
              variant={selectedCategoryId === cat._id ? "secondary" : "outline"}
              className="h-14 shrink-0 px-4 text-base"
              onClick={() => {
                onCategorySelect(
                  selectedCategoryId === cat._id ? null : cat._id
                );
              }}
            >
              {cat.name}
            </Button>
          ))}
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto">
        {products === undefined ? (
          <div className="grid grid-cols-3 gap-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-64 animate-pulse rounded-md border bg-muted"
              />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            <p className="text-lg">No products found</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard
                key={product.styleId}
                product={product}
                onAddToCart={onAddToCart}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductCard({
  product,
  onAddToCart,
}: {
  product: POSProduct;
  onAddToCart: POSProductGridProps["onAddToCart"];
}) {
  return (
    <div className="flex flex-col rounded-md border bg-background p-3">
      {/* Product image */}
      <div className="relative mb-2 flex h-28 items-center justify-center overflow-hidden rounded bg-muted">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.styleName}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <Package className="h-10 w-10 text-muted-foreground" />
        )}
      </div>

      {/* Product info */}
      <p className="truncate text-base font-bold">{product.styleName}</p>
      <p className="truncate text-sm text-muted-foreground">
        {product.brandName}
      </p>
      <p className="mb-2 text-base font-semibold">
        ₱{(product.basePriceCentavos / 100).toFixed(2)}
      </p>

      {/* Size pills */}
      <div className="flex flex-wrap gap-1.5">
        {product.sizes.map((size) => (
          <button
            key={size.variantId}
            disabled={size.stock <= 0}
            onClick={() =>
              onAddToCart(
                size.variantId,
                size.priceCentavos,
                product.styleName,
                size.size,
                size.color
              )
            }
            className={cn(
              "relative min-h-14 min-w-14 rounded-md border px-2 py-1 text-sm font-medium transition-colors",
              size.stock > 0
                ? "border-primary/30 bg-primary/5 text-foreground hover:bg-primary/10 active:bg-primary/20"
                : "cursor-not-allowed border-muted bg-muted/50 text-muted-foreground opacity-50"
            )}
          >
            <span className="block text-xs leading-tight">{size.size}</span>
            <span
              className={cn(
                "block text-[10px] leading-tight",
                size.stock > 0 ? "text-muted-foreground" : "text-muted-foreground/50"
              )}
            >
              {size.stock > 0 ? size.stock : "out"}
            </span>
          </button>
        ))}
      </div>

      {/* Cross-branch stock lookup — ErrorBoundary prevents query errors from crashing the POS grid */}
      <ErrorBoundary fallback={null}>
        <BranchStockDisplay
          styleId={product.styleId}
          styleName={product.styleName}
        />
      </ErrorBoundary>
    </div>
  );
}

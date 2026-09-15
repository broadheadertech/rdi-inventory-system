"use client";

import { useMemo } from "react";
import Image from "next/image";
import { useQuery } from "convex/react";
import { Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import type { Id } from "@/convex/_generated/dataModel";
import { BranchStockDisplay } from "@/components/inventory/BranchStockDisplay";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import {
  filterEligibleItems,
  type CartItemForPromo,
  type PromoInput,
} from "@/convex/_helpers/promoCalculations";

export type POSProduct = {
  styleId: Id<"styles">;
  styleName: string;
  brandId?: string;
  brandName: string;
  categoryId?: string;
  categoryName: string;
  basePriceCentavos: number;
  imageUrl: string | null;
  sizes: {
    variantId: Id<"variants">;
    sku: string;
    size: string;
    color: string;
    gender?: string;
    sizeGroup?: string;
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

type ActivePromo = PromoInput & { _id: string; name: string };
type PromoTag = { id: string; name: string; label: string };

// ─── Promo tags ───────────────────────────────────────────────────────────────
// A short label on each card for the promotions its sizes fall under, so the
// cashier sees deals while browsing. Store-wide promotions would tag every
// card, and stock-age promotions depend on each branch's batches, so neither
// is tagged — the cart's promo suggestions still cover both.

function pesos(centavos: number | undefined): string {
  return `₱${((centavos ?? 0) / 100).toLocaleString("en-PH")}`;
}

function promoTagLabel(p: ActivePromo): string {
  const min = p.minQuantity && p.minQuantity > 1 ? ` · ${p.minQuantity}+` : "";
  switch (p.promoType) {
    case "percentage":
      return `${p.percentageValue ?? 0}% off${min}`;
    case "fixedAmount":
      return `${pesos(p.fixedAmountCentavos)} off${min}`;
    case "buyXGetY":
      return `Buy ${p.buyQuantity ?? 0} get ${p.getQuantity ?? 0}`;
    case "tiered":
      return `Spend ${pesos(p.minSpendCentavos)}`;
    case "crossSell":
      return "Bundle deal";
    case "pwp":
      return "With purchase";
  }
}

function hasProductScope(p: ActivePromo): boolean {
  return (
    p.brandIds.length > 0 ||
    p.categoryIds.length > 0 ||
    p.variantIds.length > 0 ||
    (p.styleIds?.length ?? 0) > 0 ||
    (p.genders?.length ?? 0) > 0 ||
    (p.colors?.length ?? 0) > 0 ||
    (p.sizes?.length ?? 0) > 0
  );
}

function tagsFor(product: POSProduct, promos: ActivePromo[]): PromoTag[] {
  const items: CartItemForPromo[] = product.sizes.map((s) => ({
    variantId: String(s.variantId),
    brandId: product.brandId ?? "",
    categoryId: product.categoryId ?? "",
    styleId: String(product.styleId),
    gender: s.gender ?? "",
    color: s.color,
    sizeGroup: s.sizeGroup ?? "",
    size: s.size,
    unitPriceCentavos: s.priceCentavos,
    quantity: 1,
  }));
  return promos
    .filter((p) => filterEligibleItems(items, p).length > 0)
    .map((p) => ({ id: p._id, name: p.name, label: promoTagLabel(p) }));
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

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
  const activePromos = useQuery(api.pos.promotions.getActivePromotions, {});
  const taggable = useMemo(
    () =>
      ((activePromos ?? []) as unknown as ActivePromo[]).filter(
        (p) => hasProductScope(p) && !(p.agingTiers?.length ?? 0)
      ),
    [activePromos]
  );

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      {/* Search + filters, one row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search style, style code, brand or SKU..."
            value={searchText}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-10 pl-9"
          />
        </div>
        <div className="flex max-w-full gap-1.5 overflow-x-auto">
          <Button
            variant={!selectedBrandId && !selectedCategoryId ? "default" : "outline"}
            className="h-10 shrink-0 px-3"
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
              className="h-10 shrink-0 px-3"
              onClick={() => {
                onBrandSelect(selectedBrandId === brand._id ? null : brand._id);
                onCategorySelect(null);
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
                className="h-10 shrink-0 px-3"
                onClick={() => onCategorySelect(selectedCategoryId === cat._id ? null : cat._id)}
              >
                {cat.name}
              </Button>
            ))}
        </div>
      </div>

      {/* Product grid — as many columns as fit */}
      <div className="flex-1 overflow-y-auto">
        {products === undefined ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-md border bg-muted" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            <p className="text-lg">No products found</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2.5">
            {products.map((product) => (
              <ProductCard
                key={product.styleId}
                product={product}
                tags={tagsFor(product, taggable)}
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
  tags,
  onAddToCart,
}: {
  product: POSProduct;
  tags: PromoTag[];
  onAddToCart: POSProductGridProps["onAddToCart"];
}) {
  // Sizes grouped by color, so five colors' S, M and L don't run together.
  const byColor = useMemo(() => {
    const groups = new Map<string, POSProduct["sizes"]>();
    for (const s of product.sizes) {
      const list = groups.get(s.color) ?? [];
      list.push(s);
      groups.set(s.color, list);
    }
    return [...groups.entries()];
  }, [product.sizes]);
  const singleColor = byColor.length === 1 ? byColor[0][0] : null;

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-background p-2.5">
      <div className="flex gap-2">
        {product.imageUrl && (
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded bg-muted">
            <Image src={product.imageUrl} alt={product.styleName} fill className="object-cover" unoptimized />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={product.styleName}>
            {product.styleName}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {product.brandName}
            {singleColor ? ` · ${singleColor}` : ""}
          </p>
          <p className="text-sm font-semibold tabular-nums">{formatCurrency(product.basePriceCentavos)}</p>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 2).map((t) => (
            <span
              key={t.id}
              title={t.name}
              className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700"
            >
              {t.label}
            </span>
          ))}
          {tags.length > 2 && (
            <span
              title={tags.slice(2).map((t) => t.name).join(", ")}
              className="rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600"
            >
              +{tags.length - 2}
            </span>
          )}
        </div>
      )}

      <div className="space-y-1">
        {byColor.map(([color, sizes]) => (
          <div key={color} className="flex items-start gap-1.5">
            {!singleColor && (
              <span className="w-14 shrink-0 truncate pt-2 text-[11px] text-muted-foreground" title={color}>
                {color}
              </span>
            )}
            <div className="flex flex-wrap gap-1">
              {sizes.map((size) => (
                <button
                  key={size.variantId}
                  disabled={size.stock <= 0}
                  title={`${size.sku} · ${size.stock > 0 ? `${size.stock} in stock` : "out of stock"}`}
                  onClick={() =>
                    onAddToCart(size.variantId, size.priceCentavos, product.styleName, size.size, size.color)
                  }
                  className={cn(
                    "h-9 min-w-9 rounded border px-1.5 text-xs font-medium leading-none transition-colors",
                    size.stock > 0
                      ? "border-primary/30 bg-primary/5 hover:bg-primary/10 active:bg-primary/20"
                      : "cursor-not-allowed border-muted bg-muted/50 text-muted-foreground opacity-50"
                  )}
                >
                  <span className="block">{size.size}</span>
                  <span className="mt-0.5 block text-[9px] text-muted-foreground">
                    {size.stock > 0 ? size.stock : "out"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Cross-branch stock lookup — ErrorBoundary prevents query errors from crashing the POS grid */}
      <ErrorBoundary fallback={null}>
        <BranchStockDisplay styleId={product.styleId} styleName={product.styleName} />
      </ErrorBoundary>
    </div>
  );
}

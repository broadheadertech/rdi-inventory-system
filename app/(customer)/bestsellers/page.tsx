"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CustomerProductCard } from "@/components/customer/CustomerProductCard";
import { TrendingUp, Package } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Gender Tabs ─────────────────────────────────────────────────────────────
const GENDER_TABS = [
  { key: "all", label: "All" },
  { key: "womens", label: "Women" },
  { key: "mens", label: "Men" },
  { key: "kids", label: "Kids" },
] as const;

type GenderKey = (typeof GENDER_TABS)[number]["key"];

function matchesGender(genders: string[], selected: GenderKey): boolean {
  if (selected === "all") return true;
  if (genders.includes(selected)) return true;
  if (selected === "kids") {
    return genders.includes("boys") || genders.includes("girls");
  }
  if (genders.includes("unisex")) return true;
  return false;
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────
function BestsellersSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 pt-6">
      {/* Title skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted" />
      </div>

      {/* Tabs skeleton */}
      <div className="mt-6 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-9 w-20 animate-pulse rounded-full bg-muted"
          />
        ))}
      </div>

      {/* Grid skeleton */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="space-y-2 rounded-lg border border-border p-2"
          >
            <div className="aspect-[3/4] animate-pulse rounded bg-muted" />
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Package className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mt-4 font-display text-lg font-bold uppercase">
        No Bestsellers Yet
      </h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        There are no sales data from the last 30 days. Check back soon to see
        what&apos;s trending!
      </p>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function BestsellersPage() {
  const products = useQuery(api.storefront.bestsellers.getBestsellers);
  const [selectedGender, setSelectedGender] = useState<GenderKey>("all");

  if (products === undefined) {
    return <BestsellersSkeleton />;
  }

  const filtered =
    selectedGender === "all"
      ? products
      : products.filter((p) => matchesGender(p.genders, selectedGender));

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 pt-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          <h1 className="font-display text-2xl font-extrabold uppercase tracking-tight sm:text-3xl">
            Bestsellers
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Our most popular items based on real sales
        </p>
      </div>

      {/* Gender filter tabs */}
      <div className="mt-6 flex gap-2 overflow-x-auto scrollbar-hide">
        {GENDER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSelectedGender(tab.key)}
            className={cn(
              "flex-shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-all",
              selectedGender === tab.key
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-transparent text-foreground hover:bg-muted"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Product grid or empty state */}
      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((product) => (
            <CustomerProductCard
              key={product.styleId}
              styleId={product.styleId}
              name={product.name}
              brandName={product.brandName}
              priceCentavos={product.basePriceCentavos}
              imageUrl={product.primaryImageUrl}
              brandLogoUrl={product.brandLogoUrl}
              variantCount={product.variantCount}
              branchCount={product.branchCount}
              sizes={product.sizes}
              soldCount={product.soldCount}
              createdAt={product.createdAt}
            />
          ))}
        </div>
      )}
    </div>
  );
}

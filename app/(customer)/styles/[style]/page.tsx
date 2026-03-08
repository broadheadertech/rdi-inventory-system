"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  ArrowLeft,
  ArrowUpDown,
  SlidersHorizontal,
  Check,
  ChevronRight,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { CustomerProductCard } from "@/components/customer/CustomerProductCard";
import { QuickViewSheet } from "@/components/customer/QuickViewSheet";
import { useInfiniteScroll } from "@/lib/hooks/useInfiniteScroll";
import { cn } from "@/lib/utils";
import { STYLE_COLLECTIONS } from "../page";

// ─── Types ───────────────────────────────────────────────────────────────────

type SortKey = "newest" | "price_asc" | "price_desc" | "name_asc";
type FilterSection = "brand" | "color" | "size";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Latest Arrival" },
  { key: "price_desc", label: "Price High to Low" },
  { key: "price_asc", label: "Price Low to High" },
  { key: "name_asc", label: "Name A-Z" },
];

const PAGE_SIZE = 12;

// ─── Page ────────────────────────────────────────────────────────────────────

export default function StyleCollectionPage() {
  const params = useParams();
  const styleSlug = params.style as string;

  // Resolve the collection from our constants
  const collection = STYLE_COLLECTIONS.find((c) => c.slug === styleSlug);

  // Query products matching the collection's tags
  const data = useQuery(
    api.catalog.publicBrowse.getStylesByTagsPublic,
    collection ? { tags: [...collection.tags] } : "skip"
  );

  // UI state
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [showSort, setShowSort] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filterSection, setFilterSection] = useState<FilterSection | null>(null);

  // Filter state
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [selectedColors, setSelectedColors] = useState<Set<string>>(new Set());
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set());

  // QuickView state
  const [quickViewStyleId, setQuickViewStyleId] = useState<Id<"styles"> | null>(null);

  // Infinite scroll state
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const activeFilterCount =
    selectedBrands.size + selectedColors.size + selectedSizes.size;

  const clearFilters = useCallback(() => {
    setSelectedBrands(new Set());
    setSelectedColors(new Set());
    setSelectedSizes(new Set());
  }, []);

  const toggleInSet = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) => {
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      });
    },
    []
  );

  // Filtered + sorted styles
  const filteredStyles = useMemo(() => {
    if (!data) return [];
    let styles = data.styles;

    if (selectedBrands.size > 0) {
      styles = styles.filter((s) => selectedBrands.has(s.brandName));
    }
    if (selectedColors.size > 0) {
      styles = styles.filter((s) => s.colors.some((c) => selectedColors.has(c)));
    }
    if (selectedSizes.size > 0) {
      styles = styles.filter((s) => s.sizes.some((sz) => selectedSizes.has(sz)));
    }

    const sorted = [...styles];
    switch (sortKey) {
      case "newest":
        sorted.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case "price_asc":
        sorted.sort((a, b) => a.basePriceCentavos - b.basePriceCentavos);
        break;
      case "price_desc":
        sorted.sort((a, b) => b.basePriceCentavos - a.basePriceCentavos);
        break;
      case "name_asc":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return sorted;
  }, [data, sortKey, selectedBrands, selectedColors, selectedSizes]);

  // Reset visible count when filters/sort change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sortKey, selectedBrands, selectedColors, selectedSizes]);

  const visibleStyles = useMemo(
    () => filteredStyles.slice(0, visibleCount),
    [filteredStyles, visibleCount]
  );
  const hasMore = visibleCount < filteredStyles.length;

  const loadMore = useCallback(() => {
    setIsLoadingMore(true);
    setTimeout(() => {
      setVisibleCount((prev) => prev + PAGE_SIZE);
      setIsLoadingMore(false);
    }, 300);
  }, []);

  const { sentinelRef } = useInfiniteScroll(loadMore, hasMore, isLoadingMore);

  // Back to top
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > window.innerHeight * 2);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // ── Collection not found ──
  if (!collection) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 text-center">
        <p className="text-muted-foreground">Style collection not found.</p>
        <Link
          href="/styles"
          className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to styles
        </Link>
      </div>
    );
  }

  // ── Loading ──
  if (data === undefined) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Hero skeleton */}
        <div className="h-32 animate-pulse rounded-xl bg-secondary" />
        <div className="mt-4 flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-16 animate-pulse rounded bg-secondary" />
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

  const filters = data.filters;

  return (
    <>
      <div className="mx-auto max-w-7xl">
        {/* ── Hero Banner ── */}
        <div className={`relative overflow-hidden rounded-b-xl bg-gradient-to-br ${collection.gradient}`}>
          {/* Decorative pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 20px, white 20px, white 21px)`,
          }} />

          <div className="relative z-10 px-4 py-8 sm:px-6 sm:py-10">
            <Link
              href="/styles"
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              All Styles
            </Link>
            <h1 className="mt-4 font-display text-3xl font-extrabold uppercase tracking-tight text-white sm:text-4xl">
              {collection.name}
            </h1>
            <p className="mt-1 text-sm text-white/70 sm:text-base">
              {collection.description}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {collection.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/80 backdrop-blur-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Sticky Sort/Filter Bar ── */}
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/50">
          <div className="flex items-center px-4">
            <button
              onClick={() => setShowSort(true)}
              className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-foreground"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              Sort
            </button>
            <div className="h-5 w-px bg-border" />
            <button
              onClick={() => { setShowFilter(true); setFilterSection(null); }}
              className="relative flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-foreground"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filter
              {activeFilterCount > 0 && (
                <span className="absolute -right-1 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <div className="h-5 w-px bg-border" />
            <div className="flex flex-1 items-center justify-center py-2.5 text-xs text-muted-foreground">
              {filteredStyles.length} items
            </div>
          </div>
        </div>

        {/* ── Product Grid ── */}
        <div className="px-4 py-4">
          {filteredStyles.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No products found for this style. Try adjusting your filters.
            </p>
          )}
          {visibleStyles.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {visibleStyles.map((style) => (
                <CustomerProductCard
                  key={style._id}
                  styleId={style._id}
                  name={style.name}
                  brandName={style.brandName}
                  priceCentavos={style.basePriceCentavos}
                  imageUrl={style.primaryImageUrl}
                  brandLogoUrl={style.brandLogoUrl}
                  variantCount={style.variantCount}
                  branchCount={style.branchCount}
                  sizes={style.sizes}
                  createdAt={style.createdAt}
                  onQuickView={setQuickViewStyleId}
                />
              ))}
            </div>
          )}

          {/* Infinite scroll sentinel */}
          {hasMore && (
            <div ref={sentinelRef} className="flex items-center justify-center py-8">
              {isLoadingMore && (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              )}
            </div>
          )}

          {/* End of results indicator */}
          {!hasMore && filteredStyles.length > PAGE_SIZE && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Showing all {filteredStyles.length} items
            </p>
          )}
        </div>
      </div>

      {/* Back to Top FAB */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-all hover:bg-foreground/90 active:scale-95"
          aria-label="Back to top"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      )}

      {/* Quick View Sheet */}
      <QuickViewSheet
        styleId={quickViewStyleId}
        onClose={() => setQuickViewStyleId(null)}
      />

      {/* Sort Bottom Sheet */}
      {showSort && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowSort(false)}
          />
          <div className="relative w-full max-w-lg animate-in slide-in-from-bottom rounded-t-2xl bg-card pb-safe">
            <div className="flex items-center justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </div>
            <h3 className="px-5 pb-2 text-center text-base font-semibold">Sort</h3>
            <div className="divide-y divide-border">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => { setSortKey(opt.key); setShowSort(false); }}
                  className="flex w-full items-center justify-between px-5 py-3.5 text-sm text-foreground transition-colors hover:bg-secondary"
                >
                  {opt.label}
                  {sortKey === opt.key && (
                    <span className="h-4 w-4 rounded-full border-[5px] border-foreground" />
                  )}
                  {sortKey !== opt.key && (
                    <span className="h-4 w-4 rounded-full border-2 border-muted-foreground/40" />
                  )}
                </button>
              ))}
            </div>
            <div className="h-6" />
          </div>
        </div>
      )}

      {/* Filter Full-Screen Panel */}
      {showFilter && (
        <div className="fixed inset-0 z-50 bg-card">
          {/* Filter header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <button onClick={() => setShowFilter(false)}>
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h3 className="text-base font-semibold">Filter</h3>
            <div className="w-5" />
          </div>

          <div className="flex h-[calc(100vh-60px-64px)]">
            {/* Left sidebar */}
            <div className="w-40 flex-shrink-0 overflow-y-auto border-r border-border bg-muted/30">
              <button
                onClick={() => setFilterSection("brand")}
                className={cn(
                  "flex w-full items-center justify-between px-4 py-3.5 text-left text-sm",
                  filterSection === "brand"
                    ? "bg-card font-semibold text-foreground"
                    : "text-muted-foreground"
                )}
              >
                <span>
                  Brand
                  {selectedBrands.size > 0 && (
                    <span className="ml-1 text-xs text-primary">
                      {selectedBrands.size}
                    </span>
                  )}
                </span>
                <ChevronRight className="h-3 w-3" />
              </button>

              <button
                onClick={() => setFilterSection("color")}
                className={cn(
                  "flex w-full items-center justify-between px-4 py-3.5 text-left text-sm",
                  filterSection === "color"
                    ? "bg-card font-semibold text-foreground"
                    : "text-muted-foreground"
                )}
              >
                <span>
                  Color
                  {selectedColors.size > 0 && (
                    <span className="ml-1 text-xs text-primary">
                      {selectedColors.size}
                    </span>
                  )}
                </span>
                <ChevronRight className="h-3 w-3" />
              </button>

              <button
                onClick={() => setFilterSection("size")}
                className={cn(
                  "flex w-full items-center justify-between px-4 py-3.5 text-left text-sm",
                  filterSection === "size"
                    ? "bg-card font-semibold text-foreground"
                    : "text-muted-foreground"
                )}
              >
                <span>
                  Size
                  {selectedSizes.size > 0 && (
                    <span className="ml-1 text-xs text-primary">
                      {selectedSizes.size}
                    </span>
                  )}
                </span>
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>

            {/* Right content */}
            <div className="flex-1 overflow-y-auto p-4">
              {filterSection === null && (
                <p className="text-sm text-muted-foreground">
                  Select a filter on the left.
                </p>
              )}

              {filterSection === "brand" && (
                <div className="space-y-1">
                  {filters.brands.map((brand) => (
                    <button
                      key={brand}
                      onClick={() => toggleInSet(setSelectedBrands, brand)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors",
                        selectedBrands.has(brand)
                          ? "bg-primary/10 font-medium text-foreground"
                          : "text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      {brand}
                      {selectedBrands.has(brand) && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  ))}
                </div>
              )}

              {filterSection === "color" && (
                <div className="flex flex-wrap gap-2">
                  {filters.colors.map((color) => (
                    <button
                      key={color}
                      onClick={() => toggleInSet(setSelectedColors, color)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm transition-colors",
                        selectedColors.has(color)
                          ? "border-primary bg-primary/10 font-medium text-foreground"
                          : "border-border text-muted-foreground hover:border-primary"
                      )}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              )}

              {filterSection === "size" && (
                <div className="flex flex-wrap gap-2">
                  {filters.sizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => toggleInSet(setSelectedSizes, size)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm transition-colors",
                        selectedSizes.has(size)
                          ? "border-primary bg-primary/10 font-medium text-foreground"
                          : "border-border text-muted-foreground hover:border-primary"
                      )}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bottom action bar */}
          <div className="absolute bottom-0 left-0 right-0 flex gap-3 border-t border-border bg-card px-4 py-3">
            <button
              onClick={clearFilters}
              className="flex-1 rounded-lg border border-border py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Clear
            </button>
            <button
              onClick={() => setShowFilter(false)}
              className="flex-1 rounded-lg bg-foreground py-3 text-sm font-bold text-background transition-colors hover:bg-foreground/90"
            >
              View {filteredStyles.length} Items
            </button>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
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
  Zap,
} from "lucide-react";
import { CustomerProductCard } from "@/components/customer/CustomerProductCard";
import { QuickViewSheet } from "@/components/customer/QuickViewSheet";
import { useInfiniteScroll } from "@/lib/hooks/useInfiniteScroll";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type GenderTab = "all" | "womens" | "mens" | "kids";
type SortKey = "newest" | "price_asc" | "price_desc" | "name_asc";

const GENDER_TABS: { key: GenderTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "womens", label: "Women" },
  { key: "mens", label: "Men" },
  { key: "kids", label: "Kids" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Latest Arrival" },
  { key: "price_desc", label: "Price High to Low" },
  { key: "price_asc", label: "Price Low to High" },
  { key: "name_asc", label: "Name A-Z" },
];

const PAGE_SIZE = 12;

function matchesGender(genders: string[], tab: GenderTab): boolean {
  if (tab === "all") return true;
  if (genders.includes(tab)) return true;
  if (tab === "kids") {
    return genders.includes("boys") || genders.includes("girls");
  }
  if (genders.includes("unisex")) return true;
  return false;
}

// ─── Filter panel sections ───────────────────────────────────────────────────

type FilterSection = "category" | "color" | "size";

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BrandPage() {
  const params = useParams();
  const brandId = params.brandId as Id<"brands">;

  const data = useQuery(
    api.catalog.publicBrowse.getAllStylesForBrandPublic,
    { brandId }
  );

  // UI state
  const [genderTab, setGenderTab] = useState<GenderTab>("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [showSort, setShowSort] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filterSection, setFilterSection] = useState<FilterSection | null>(null);

  // Filter state
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedColors, setSelectedColors] = useState<Set<string>>(new Set());
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set());

  // Express filter
  const [expressOnly, setExpressOnly] = useState(false);

  // QuickView state
  const [quickViewStyleId, setQuickViewStyleId] = useState<Id<"styles"> | null>(null);

  // Infinite scroll state
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Back to top visibility
  const [showBackToTop, setShowBackToTop] = useState(false);

  const activeFilterCount =
    selectedCategories.size + selectedColors.size + selectedSizes.size;

  const clearFilters = useCallback(() => {
    setSelectedCategories(new Set());
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

    // Gender filter
    if (genderTab !== "all") {
      styles = styles.filter((s) => matchesGender(s.genders, genderTab));
    }

    // Category filter
    if (selectedCategories.size > 0) {
      styles = styles.filter((s) => selectedCategories.has(s.categoryName));
    }

    // Color filter
    if (selectedColors.size > 0) {
      styles = styles.filter((s) => s.colors.some((c) => selectedColors.has(c)));
    }

    // Size filter
    if (selectedSizes.size > 0) {
      styles = styles.filter((s) => s.sizes.some((sz) => selectedSizes.has(sz)));
    }

    // Express delivery filter
    if (expressOnly) {
      styles = styles.filter((s) => (s as Record<string, unknown>).expressAvailable);
    }

    // Sort
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
  }, [data, genderTab, sortKey, selectedCategories, selectedColors, selectedSizes, expressOnly]);

  // Reset visible count when filters/sort change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [genderTab, sortKey, selectedCategories, selectedColors, selectedSizes, expressOnly]);

  // Visible slice for infinite scroll
  const visibleStyles = useMemo(
    () => filteredStyles.slice(0, visibleCount),
    [filteredStyles, visibleCount]
  );
  const hasMore = visibleCount < filteredStyles.length;

  // Load more callback
  const loadMore = useCallback(() => {
    setIsLoadingMore(true);
    // Small delay to show spinner and avoid overwhelming re-renders
    setTimeout(() => {
      setVisibleCount((prev) => prev + PAGE_SIZE);
      setIsLoadingMore(false);
    }, 300);
  }, []);

  const { sentinelRef } = useInfiniteScroll(loadMore, hasMore, isLoadingMore);

  // Back to top scroll listener
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

  // ── Loading ──
  if (data === undefined) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="h-40 animate-pulse rounded-xl bg-secondary sm:h-52" />
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

  // ── Not found ──
  if (data === null) {
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

  const { brand, filters } = data;

  return (
    <>
      <div className="mx-auto max-w-7xl">
        {/* ── Banner / Header ── */}
        <div className="relative h-40 w-full overflow-hidden sm:h-52">
          {brand.bannerUrl ? (
            <Image
              src={brand.bannerUrl}
              alt={`${brand.name} banner`}
              fill
              sizes="(max-width: 1280px) 100vw, 1280px"
              className="object-cover"
              priority
            />
          ) : brand.brandLogoUrl ? (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <div className="relative h-24 w-48">
                <Image
                  src={brand.brandLogoUrl}
                  alt={brand.name}
                  fill
                  sizes="192px"
                  className="object-contain"
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <span className="font-display text-4xl font-bold text-muted-foreground/30 uppercase">
                {brand.name}
              </span>
            </div>
          )}
          {brand.bannerUrl && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          )}
          {/* Brand logo overlay centered */}
          {brand.bannerUrl && brand.brandLogoUrl && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative h-16 w-32 drop-shadow-lg">
                <Image
                  src={brand.brandLogoUrl}
                  alt={brand.name}
                  fill
                  sizes="128px"
                  className="object-contain"
                />
              </div>
            </div>
          )}
          {/* Back button */}
          <Link
            href="/browse"
            className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-md bg-white/80 text-foreground backdrop-blur-sm hover:bg-white"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>

        {/* ── Sticky Filter Bar (Gender tabs + Sort/Filter/Count) ── */}
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/50 transition-shadow [&:not(:first-child)]:shadow-sm">
          {/* Gender tabs */}
          <div className="overflow-x-auto scrollbar-none">
            <div className="flex px-4 min-w-max">
              {GENDER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setGenderTab(tab.key)}
                  className={cn(
                    "relative whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors",
                    genderTab === tab.key
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                  {genderTab === tab.key && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Sort / Filter / Count bar */}
          <div className="flex items-center border-t border-border/50 px-4">
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
            <button
              onClick={() => setExpressOnly(!expressOnly)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors",
                expressOnly
                  ? "text-amber-500"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Zap className="h-3.5 w-3.5" />
              Express
            </button>
            <div className="h-5 w-px bg-border" />
            <div className="flex flex-1 items-center justify-center py-2.5 text-xs text-muted-foreground">
              {filteredStyles.length} items
            </div>
          </div>
        </div>

        {/* ── Product grid ── */}
        <div className="px-4 py-4">
          {filteredStyles.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No products found. Try adjusting your filters.
            </p>
          )}
          {visibleStyles.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {visibleStyles.map((style) => (
                <CustomerProductCard
                  key={style._id}
                  styleId={style._id}
                  name={style.name}
                  brandName={brand.name}
                  priceCentavos={style.basePriceCentavos}
                  imageUrl={style.primaryImageUrl}
                  brandLogoUrl={brand.brandLogoUrl}
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

      {/* ═══ Back to Top FAB ═══ */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-all hover:bg-foreground/90 active:scale-95"
          aria-label="Back to top"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      )}

      {/* ═══ Quick View Sheet ═══ */}
      <QuickViewSheet
        styleId={quickViewStyleId}
        onClose={() => setQuickViewStyleId(null)}
      />

      {/* ═══ Sort Bottom Sheet ═══ */}
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

      {/* ═══ Filter Full-Screen Panel ═══ */}
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
                onClick={() => setFilterSection("category")}
                className={cn(
                  "flex w-full items-center justify-between px-4 py-3.5 text-left text-sm",
                  filterSection === "category"
                    ? "bg-card font-semibold text-foreground"
                    : "text-muted-foreground"
                )}
              >
                <span>
                  Category
                  {selectedCategories.size > 0 && (
                    <span className="ml-1 text-xs text-primary">
                      {selectedCategories.size}
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

              {filterSection === "category" && (
                <div className="space-y-1">
                  {filters.categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => toggleInSet(setSelectedCategories, cat)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors",
                        selectedCategories.has(cat)
                          ? "bg-primary/10 font-medium text-foreground"
                          : "text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      {cat}
                      {selectedCategories.has(cat) && <Check className="h-4 w-4 text-primary" />}
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

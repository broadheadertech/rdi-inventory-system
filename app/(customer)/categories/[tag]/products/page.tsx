"use client";

import { useState, useMemo, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  ArrowLeft,
  ArrowUpDown,
  SlidersHorizontal,
  Search,
  Check,
  ChevronRight,
  X,
} from "lucide-react";
import { CustomerProductCard } from "@/components/customer/CustomerProductCard";
import { QuickViewSheet } from "@/components/customer/QuickViewSheet";
import { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type GenderKey = "mens" | "womens" | "kids";
type SortKey = "newest" | "price_asc" | "price_desc" | "name_asc";
type FilterSection = "brand" | "category" | "color" | "size";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Latest Arrival" },
  { key: "price_desc", label: "Price High to Low" },
  { key: "price_asc", label: "Price Low to High" },
  { key: "name_asc", label: "Name A-Z" },
];

const GENDER_LABELS: Record<GenderKey, string> = {
  mens: "Men\u2019s",
  womens: "Women\u2019s",
  kids: "Kids\u2019",
};

function matchesGender(genders: string[], gender: GenderKey): boolean {
  if (genders.includes(gender)) return true;
  if (gender === "kids") {
    return (
      genders.includes("boys") ||
      genders.includes("girls") ||
      genders.includes("kids")
    );
  }
  if (genders.includes("unisex")) return true;
  return false;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TagProductsPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const tag = decodeURIComponent(params.tag as string);
  const gender = (searchParams.get("gender") as GenderKey) ?? "mens";
  const initialCategory = searchParams.get("category") ?? null;

  const data = useQuery(api.catalog.publicBrowse.getStylesByTagPublic, { tag });

  // UI state
  const [activeTab, setActiveTab] = useState<string | null>(initialCategory);
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

  const activeFilterCount =
    selectedBrands.size + selectedColors.size + selectedSizes.size;

  const clearFilters = useCallback(() => {
    setSelectedBrands(new Set());
    setSelectedColors(new Set());
    setSelectedSizes(new Set());
  }, []);

  const toggleInSet = useCallback(
    (
      setter: React.Dispatch<React.SetStateAction<Set<string>>>,
      value: string
    ) => {
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      });
    },
    []
  );

  // Gender-filtered styles first
  const genderStyles = useMemo(() => {
    if (!data) return [];
    return data.styles.filter((s) => matchesGender(s.genders, gender));
  }, [data, gender]);

  // Category tabs from gender-filtered styles
  const categoryTabs = useMemo(() => {
    const names = [...new Set(genderStyles.map((s) => s.categoryName))].sort();
    return names;
  }, [genderStyles]);

  // Full filtered + sorted list
  const filteredStyles = useMemo(() => {
    let styles = genderStyles;

    // Category tab filter
    if (activeTab) {
      styles = styles.filter((s) => s.categoryName === activeTab);
    }

    // Brand filter
    if (selectedBrands.size > 0) {
      styles = styles.filter((s) => selectedBrands.has(s.brandName));
    }

    // Color filter
    if (selectedColors.size > 0) {
      styles = styles.filter((s) =>
        s.colors.some((c) => selectedColors.has(c))
      );
    }

    // Size filter
    if (selectedSizes.size > 0) {
      styles = styles.filter((s) =>
        s.sizes.some((sz) => selectedSizes.has(sz))
      );
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
  }, [genderStyles, activeTab, sortKey, selectedBrands, selectedColors, selectedSizes]);

  const genderLabel = GENDER_LABELS[gender] ?? "";
  const viewAllLabel = `${genderLabel} ${tag}`;

  // ── Loading ──
  if (data === undefined) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-6 w-6 animate-pulse rounded bg-secondary" />
          <div className="h-8 flex-1 animate-pulse rounded-full bg-secondary" />
        </div>
        <div className="flex gap-3 mb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-8 w-24 animate-pulse rounded bg-secondary"
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-lg border border-border bg-secondary"
            />
          ))}
        </div>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 text-center">
        <p className="text-muted-foreground">No products found for &ldquo;{tag}&rdquo;.</p>
        <Link
          href="/categories"
          className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to categories
        </Link>
      </div>
    );
  }

  const { filters } = data;

  return (
    <>
      <div className="mx-auto max-w-7xl">
        {/* ── Header with search bar ── */}
        <div className="flex items-center gap-3 px-4 py-3">
          <Link
            href={`/categories/${encodeURIComponent(tag)}?gender=${gender}`}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center text-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex flex-1 items-center gap-2 rounded-full border border-border bg-secondary/50 px-4 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{tag}</span>
          </div>
        </div>

        {/* ── Category tabs ── */}
        <div
          className="flex gap-0 overflow-x-auto border-b border-border px-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {/* View All tab */}
          <button
            onClick={() => setActiveTab(null)}
            className={cn(
              "relative flex-shrink-0 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors",
              activeTab === null
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {viewAllLabel}
            {activeTab === null && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
            )}
          </button>

          {categoryTabs.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={cn(
                "relative flex-shrink-0 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors",
                activeTab === cat
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {cat}
              {activeTab === cat && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
              )}
            </button>
          ))}
        </div>

        {/* ── Sort / Filter / Count bar ── */}
        <div className="flex items-center border-b border-border px-4">
          <button
            onClick={() => setShowSort(true)}
            className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-foreground"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            Sort
          </button>
          <div className="h-5 w-px bg-border" />
          <button
            onClick={() => {
              setShowFilter(true);
              setFilterSection(null);
            }}
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

        {/* ── Product grid ── */}
        <div className="px-4 py-4">
          {filteredStyles.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No products found. Try adjusting your filters.
            </p>
          )}
          {filteredStyles.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {filteredStyles.map((style) => (
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
        </div>
      </div>

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
            <h3 className="px-5 pb-2 text-center text-base font-semibold">
              Sort
            </h3>
            <div className="divide-y divide-border">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => {
                    setSortKey(opt.key);
                    setShowSort(false);
                  }}
                  className="flex w-full items-center justify-between px-5 py-3.5 text-sm text-foreground transition-colors hover:bg-secondary"
                >
                  {opt.label}
                  {sortKey === opt.key ? (
                    <span className="h-4 w-4 rounded-full border-[5px] border-foreground" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border-2 border-muted-foreground/40" />
                  )}
                </button>
              ))}
            </div>
            <div className="h-6" />
          </div>
        </div>
      )}

      {/* ═══ Quick View Sheet ═══ */}
      <QuickViewSheet
        styleId={quickViewStyleId}
        onClose={() => setQuickViewStyleId(null)}
      />

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
              {(
                [
                  { key: "brand" as FilterSection, label: "Brand", count: selectedBrands.size },
                  { key: "category" as FilterSection, label: "Category", count: 0 },
                  { key: "color" as FilterSection, label: "Color", count: selectedColors.size },
                  { key: "size" as FilterSection, label: "Size", count: selectedSizes.size },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  onClick={() => setFilterSection(item.key)}
                  className={cn(
                    "flex w-full items-center justify-between px-4 py-3.5 text-left text-sm",
                    filterSection === item.key
                      ? "bg-card font-semibold text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  <span>
                    {item.label}
                    {item.count > 0 && (
                      <span className="ml-1 text-xs text-primary">
                        {item.count}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="h-3 w-3" />
                </button>
              ))}
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
                  {filters.brands.map((b) => (
                    <button
                      key={b}
                      onClick={() => toggleInSet(setSelectedBrands, b)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors",
                        selectedBrands.has(b)
                          ? "bg-primary/10 font-medium text-foreground"
                          : "text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      {b}
                      {selectedBrands.has(b) && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {filterSection === "category" && (
                <div className="space-y-1">
                  {filters.categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setActiveTab(cat === activeTab ? null : cat)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors",
                        activeTab === cat
                          ? "bg-primary/10 font-medium text-foreground"
                          : "text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      {cat}
                      {activeTab === cat && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
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

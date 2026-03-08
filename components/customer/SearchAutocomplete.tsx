"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatPrice } from "@/lib/utils";
import { Search, X, Tag, LayoutGrid, ShoppingBag } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BrandSuggestion {
  type: "brand";
  id: string;
  name: string;
  imageUrl: string | null;
}

interface CategorySuggestion {
  type: "category";
  tag: string | undefined;
  name: string;
  brandId: string;
}

interface ProductSuggestion {
  type: "product";
  id: string;
  name: string;
  brandName: string;
  priceCentavos: number;
  imageUrl: string | null;
}

type Suggestion = BrandSuggestion | CategorySuggestion | ProductSuggestion;

// ─── Component ──────────────────────────────────────────────────────────────

export function SearchAutocomplete() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Homepage data for brands + categories (locally matched)
  const homepageData = useQuery(api.storefront.homepage.getHomepageData);

  // Product search results (only when debounced query >= 2 chars)
  const productResults = useQuery(
    api.catalog.publicBrowse.searchStylesPublic,
    debouncedQuery.length >= 2 ? { searchTerm: debouncedQuery } : "skip"
  );

  // Build suggestions
  const suggestions: Suggestion[] = [];

  if (debouncedQuery.length >= 2 && homepageData) {
    const term = debouncedQuery.toLowerCase();

    // Brands
    const matchingBrands = homepageData.brands
      .filter((b) => b.name.toLowerCase().includes(term))
      .slice(0, 3);
    for (const b of matchingBrands) {
      suggestions.push({
        type: "brand",
        id: b._id,
        name: b.name,
        imageUrl: b.imageUrl,
      });
    }

    // Categories
    const matchingCategories = homepageData.categories
      .filter((c) => c.name.toLowerCase().includes(term))
      .slice(0, 3);
    for (const c of matchingCategories) {
      suggestions.push({
        type: "category",
        tag: c.tag,
        name: c.name,
        brandId: c.brandIds[0],
      });
    }

    // Products
    if (productResults) {
      const matchingProducts = productResults.slice(0, 3);
      for (const p of matchingProducts) {
        suggestions.push({
          type: "product",
          id: p._id,
          name: p.name,
          brandName: p.brandName,
          priceCentavos: p.basePriceCentavos,
          imageUrl: p.primaryImageUrl,
        });
      }
    }
  }

  // Show dropdown when we have a query and suggestions (or loading)
  const shouldShowDropdown =
    isOpen && debouncedQuery.length >= 2 && (suggestions.length > 0 || productResults === undefined);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset active index when suggestions change
  useEffect(() => {
    setActiveIndex(-1);
  }, [debouncedQuery]);

  const navigateToSuggestion = useCallback(
    (suggestion: Suggestion) => {
      setIsOpen(false);
      setQuery("");
      setDebouncedQuery("");

      switch (suggestion.type) {
        case "brand":
          router.push(`/browse/${suggestion.id}`);
          break;
        case "category":
          if (suggestion.tag) {
            router.push(`/categories/${encodeURIComponent(suggestion.tag)}/products`);
          } else {
            router.push(`/browse/${suggestion.brandId}`);
          }
          break;
        case "product":
          router.push(`/browse/style/${suggestion.id}`);
          break;
      }
    },
    [router]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeIndex >= 0 && activeIndex < suggestions.length) {
      navigateToSuggestion(suggestions[activeIndex]);
    } else if (query.trim()) {
      setIsOpen(false);
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      setQuery("");
      setDebouncedQuery("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!shouldShowDropdown) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        inputRef.current?.blur();
        break;
    }
  };

  // Group suggestions by type for rendering
  const brandSuggestions = suggestions.filter(
    (s): s is BrandSuggestion => s.type === "brand"
  );
  const categorySuggestions = suggestions.filter(
    (s): s is CategorySuggestion => s.type === "category"
  );
  const productSuggestions = suggestions.filter(
    (s): s is ProductSuggestion => s.type === "product"
  );

  // Track flat index for keyboard navigation
  let flatIndex = 0;

  return (
    <div ref={containerRef} className="relative flex-1">
      <form onSubmit={handleSubmit}>
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Got You Lookin' Great"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="h-10 w-full rounded-lg border border-border bg-secondary pl-10 pr-10 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
          autoComplete="off"
          role="combobox"
          aria-expanded={shouldShowDropdown}
          aria-haspopup="listbox"
          aria-autocomplete="list"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setDebouncedQuery("");
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40 pointer-events-none" />
        )}
      </form>

      {/* Dropdown */}
      {shouldShowDropdown && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border shadow-xl"
          style={{
            backgroundColor: "#111111",
            borderColor: "#2A2A2A",
          }}
          role="listbox"
        >
          {/* Brands */}
          {brandSuggestions.length > 0 && (
            <div>
              <div
                className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "#888888" }}
              >
                Brands
              </div>
              {brandSuggestions.map((brand) => {
                const idx = flatIndex++;
                return (
                  <button
                    key={`brand-${brand.id}`}
                    type="button"
                    onClick={() => navigateToSuggestion(brand)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors"
                    style={{
                      backgroundColor:
                        activeIndex === idx ? "#2A2A2A" : "transparent",
                    }}
                    role="option"
                    aria-selected={activeIndex === idx}
                  >
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full overflow-hidden"
                      style={{ backgroundColor: "#2A2A2A" }}
                    >
                      {brand.imageUrl ? (
                        <Image
                          src={brand.imageUrl}
                          alt={brand.name}
                          width={32}
                          height={32}
                          className="h-full w-full object-contain p-1 rounded-full"
                        />
                      ) : (
                        <Tag className="h-4 w-4 text-white/60" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-white">
                      {brand.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Categories */}
          {categorySuggestions.length > 0 && (
            <div>
              {brandSuggestions.length > 0 && (
                <div className="mx-3" style={{ borderTop: "1px solid #2A2A2A" }} />
              )}
              <div
                className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "#888888" }}
              >
                Categories
              </div>
              {categorySuggestions.map((cat, i) => {
                const idx = flatIndex++;
                return (
                  <button
                    key={`cat-${cat.name}-${i}`}
                    type="button"
                    onClick={() => navigateToSuggestion(cat)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors"
                    style={{
                      backgroundColor:
                        activeIndex === idx ? "#2A2A2A" : "transparent",
                    }}
                    role="option"
                    aria-selected={activeIndex === idx}
                  >
                    <div
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: "#2A2A2A" }}
                    >
                      <LayoutGrid className="h-4 w-4 text-white/60" />
                    </div>
                    <span className="text-sm font-medium text-white">
                      {cat.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Products */}
          {productSuggestions.length > 0 && (
            <div>
              {(brandSuggestions.length > 0 || categorySuggestions.length > 0) && (
                <div className="mx-3" style={{ borderTop: "1px solid #2A2A2A" }} />
              )}
              <div
                className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "#888888" }}
              >
                Products
              </div>
              {productSuggestions.map((product) => {
                const idx = flatIndex++;
                return (
                  <button
                    key={`product-${product.id}`}
                    type="button"
                    onClick={() => navigateToSuggestion(product)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors"
                    style={{
                      backgroundColor:
                        activeIndex === idx ? "#2A2A2A" : "transparent",
                    }}
                    role="option"
                    aria-selected={activeIndex === idx}
                  >
                    <div
                      className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-md"
                      style={{ backgroundColor: "#2A2A2A" }}
                    >
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt={product.name}
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ShoppingBag className="h-4 w-4 text-white/40" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">
                        {product.name}
                      </p>
                      <p className="text-[11px] text-white/50">
                        {product.brandName}
                      </p>
                    </div>
                    <span className="flex-shrink-0 font-mono text-sm font-bold text-primary">
                      {formatPrice(product.priceCentavos)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Loading state (products still loading) */}
          {suggestions.length === 0 && productResults === undefined && (
            <div className="px-3 py-4">
              <div className="flex items-center gap-3">
                <div
                  className="h-8 w-8 animate-pulse rounded-full"
                  style={{ backgroundColor: "#2A2A2A" }}
                />
                <div className="flex-1 space-y-1.5">
                  <div
                    className="h-3 w-3/4 animate-pulse rounded"
                    style={{ backgroundColor: "#2A2A2A" }}
                  />
                  <div
                    className="h-2.5 w-1/2 animate-pulse rounded"
                    style={{ backgroundColor: "#2A2A2A" }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* View all results link */}
          {suggestions.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                router.push(
                  `/search?q=${encodeURIComponent(debouncedQuery)}`
                );
                setQuery("");
                setDebouncedQuery("");
              }}
              className="flex w-full items-center justify-center gap-2 px-3 py-3 text-sm font-medium text-primary transition-colors hover:underline"
              style={{ borderTop: "1px solid #2A2A2A" }}
            >
              <Search className="h-3.5 w-3.5" />
              View all results for &ldquo;{debouncedQuery}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}

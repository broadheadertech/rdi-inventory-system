"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CustomerProductCard } from "@/components/customer/CustomerProductCard";
import { Search, X } from "lucide-react";

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-6"><div className="h-12 animate-pulse rounded-full bg-secondary" /></div>}>
      <SearchContent />
    </Suspense>
  );
}

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams.get("q") ?? "";
  const [searchTerm, setSearchTerm] = useState(initialQuery);
  const [debouncedTerm, setDebouncedTerm] = useState(initialQuery);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const results = useQuery(
    api.catalog.publicBrowse.searchStylesPublic,
    debouncedTerm.length >= 2 ? { searchTerm: debouncedTerm } : "skip"
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      router.replace(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Search input */}
      <form onSubmit={handleSubmit} className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search products, brands, categories..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          autoFocus
          className="h-12 w-full rounded-lg border border-border bg-card pl-12 pr-10 text-base outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm("");
              setDebouncedTerm("");
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </form>

      {/* Results */}
      <div className="mt-6">
        {debouncedTerm.length < 2 && (
          <p className="text-center text-sm text-muted-foreground py-12">
            Type at least 2 characters to search
          </p>
        )}

        {debouncedTerm.length >= 2 && results === undefined && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="space-y-2 rounded-lg border border-border p-2"
              >
                <div className="aspect-[3/4] animate-pulse rounded bg-muted" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        )}

        {results !== undefined && results.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-lg font-medium">No results for &ldquo;{debouncedTerm}&rdquo;</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try searching for a different product, brand, or category
            </p>
          </div>
        )}

        {results !== undefined && results.length > 0 && (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;{debouncedTerm}&rdquo;
            </p>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {results.map((style) => (
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
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

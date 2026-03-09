"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";

export default function SmartSearch() {
  const router = useRouter();
  const [inputValue, setInputValue] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(inputValue.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const results = useQuery(
    api.catalog.smartSearch.searchProducts,
    debouncedTerm.length >= 2 ? { term: debouncedTerm } : "skip"
  );

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

  // Close on Escape
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  function navigateTo(type: "style" | "brand", id: string) {
    setIsOpen(false);
    setInputValue("");
    if (type === "style") {
      router.push(`/browse/style/${id}`);
    } else {
      router.push(`/browse/${id}`);
    }
  }

  const styleResults = results?.filter((r) => r.type === "style") ?? [];
  const brandResults = results?.filter((r) => r.type === "brand") ?? [];
  const hasResults = styleResults.length > 0 || brandResults.length > 0;
  const showDropdown = isOpen && debouncedTerm.length >= 2;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search styles, brands..."
          className={cn(
            "w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-10 pr-4",
            "text-sm text-zinc-100 placeholder:text-zinc-500",
            "focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          )}
        />
      </div>

      {showDropdown && (
        <div
          className={cn(
            "absolute z-50 mt-1 w-full rounded-lg border border-zinc-700",
            "bg-zinc-900 shadow-xl overflow-hidden"
          )}
        >
          {!results && (
            <div className="px-4 py-3 text-sm text-zinc-400">
              Searching...
            </div>
          )}

          {results && !hasResults && (
            <div className="px-4 py-3 text-sm text-zinc-400">
              No results found
            </div>
          )}

          {/* Style results */}
          {styleResults.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider bg-zinc-800/50">
                Styles
              </div>
              {styleResults.map((result) => (
                <button
                  key={result.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => navigateTo("style", result.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2",
                    "hover:bg-zinc-800 transition-colors text-left"
                  )}
                >
                  {result.imageUrl ? (
                    <img
                      src={result.imageUrl}
                      alt={result.name}
                      className="h-10 w-10 rounded object-cover bg-zinc-800"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-zinc-800 flex items-center justify-center">
                      <Search className="h-4 w-4 text-zinc-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-100 truncate">
                      {result.name}
                    </p>
                    <p className="text-xs text-zinc-400 truncate">
                      {result.brandName}
                      {result.priceCentavos != null &&
                        ` - ${formatPrice(result.priceCentavos)}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Brand results */}
          {brandResults.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider bg-zinc-800/50">
                Brands
              </div>
              {brandResults.map((result) => (
                <button
                  key={result.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => navigateTo("brand", result.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2",
                    "hover:bg-zinc-800 transition-colors text-left"
                  )}
                >
                  <div className="h-10 w-10 rounded bg-zinc-800 flex items-center justify-center">
                    <span className="text-sm font-bold text-zinc-400">
                      {result.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-zinc-100 truncate">
                    {result.name}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

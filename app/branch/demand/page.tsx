"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CheckCircle, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "26", "28", "30", "32", "34", "36"];
const PAGE_SIZE = 15;

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BranchDemandPage() {
  // ── Form state ──
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [design, setDesign] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, setIsPending] = useState(false);

  // ── Filter state ──
  const [searchText, setSearchText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cursorStack, setCursorStack] = useState<number[]>([]);
  const [currentCursor, setCurrentCursor] = useState<number | undefined>(undefined);

  const brands = useQuery(api.demand.entries.listBrandsForSelector);
  const createDemandLog = useMutation(api.demand.entries.createDemandLog);

  // Parse filter values
  const dateFromMs = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : undefined;
  // dateTo should be end-of-day
  const dateToMs = dateTo ? new Date(dateTo + "T23:59:59.999").getTime() : undefined;

  // Determine brand vs design filter from searchText
  const brandFilter = brands?.find(
    (b) => b.name.toLowerCase() === searchText.toLowerCase()
  )?.name;
  const designFilter = brandFilter ? undefined : searchText || undefined;

  const searchResults = useQuery(api.demand.entries.searchDemandLogs, {
    limit: PAGE_SIZE,
    cursor: currentCursor,
    brand: brandFilter,
    designSearch: designFilter,
    dateFrom: dateFromMs,
    dateTo: dateToMs,
  });

  const brandSummary = useQuery(api.demand.entries.getDemandBrandSummary, {
    dateFrom: dateFromMs,
    dateTo: dateToMs,
  });

  // ── Pagination handlers ──
  const handleNextPage = useCallback(() => {
    if (searchResults?.hasMore && searchResults.nextCursor !== undefined) {
      setCursorStack((prev) => [...prev, currentCursor ?? Date.now() + 1]);
      setCurrentCursor(searchResults.nextCursor);
    }
  }, [searchResults, currentCursor]);

  const handlePrevPage = useCallback(() => {
    setCursorStack((prev) => {
      const newStack = [...prev];
      const prevCursor = newStack.pop();
      setCurrentCursor(
        prevCursor === undefined || prevCursor > Date.now()
          ? undefined
          : prevCursor
      );
      return newStack;
    });
  }, []);

  const resetPagination = useCallback(() => {
    setCursorStack([]);
    setCurrentCursor(undefined);
  }, []);

  // ── Form submission ──
  async function handleSubmit() {
    if (!selectedBrand || isPending) return;
    setIsPending(true);
    try {
      await createDemandLog({
        brand: selectedBrand,
        design: design.trim() || undefined,
        size: selectedSize ?? undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Demand logged");
      setSelectedBrand(null);
      setSelectedSize(null);
      setDesign("");
      setNotes("");
    } catch {
      toast.error("Failed to log demand");
    } finally {
      setIsPending(false);
    }
  }

  const pageNumber = cursorStack.length + 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Demand Log</h1>
        <p className="text-sm text-muted-foreground">
          Record customer requests for items not in stock.
        </p>
      </div>

      {/* Entry form */}
      <div className="rounded-lg border p-4 space-y-5">
        <h2 className="text-sm font-semibold">New Entry</h2>

        {/* Brand selector */}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Brand <span className="text-destructive">*</span>
          </p>
          {brands === undefined ? (
            <div className="flex flex-wrap gap-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-9 w-24 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : brands.length === 0 ? (
            <p className="text-sm text-muted-foreground">No brands configured — contact HQ to add brands.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {brands.map((brand) => (
                <button
                  key={brand.id}
                  onClick={() =>
                    setSelectedBrand(selectedBrand === brand.name ? null : brand.name)
                  }
                  className={`min-h-[44px] min-w-[44px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    selectedBrand === brand.name
                      ? "bg-primary text-primary-foreground"
                      : "border bg-background hover:bg-muted"
                  }`}
                >
                  {brand.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Size selector */}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Size{" "}
            <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {SIZES.map((size) => (
              <button
                key={size}
                onClick={() => setSelectedSize(selectedSize === size ? null : size)}
                className={`min-h-[44px] min-w-[44px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedSize === size
                    ? "bg-primary text-primary-foreground"
                    : "border bg-background hover:bg-muted"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        {/* Design / style */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Design / Style{" "}
            <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            type="text"
            value={design}
            onChange={(e) => setDesign(e.target.value.slice(0, 60))}
            placeholder="e.g. Air Max, Slim Fit…"
            maxLength={60}
            className="w-full rounded-md border px-3 py-1.5 text-sm"
          />
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Notes{" "}
            <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any extra details from the customer…"
            rows={2}
            className="w-full rounded-md border px-3 py-1.5 text-sm resize-none"
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!selectedBrand || isPending}
          className="min-h-[44px] flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <CheckCircle className="h-4 w-4" />
          {isPending ? "Logging…" : "Log Demand"}
        </button>
      </div>

      {/* ─── Brand Summary ──────────────────────────────────────────────── */}
      {brandSummary && brandSummary.length > 0 && (
        <div className="rounded-lg border p-4">
          <h2 className="mb-3 text-sm font-semibold">Demand by Brand</h2>
          <div className="flex flex-wrap gap-2">
            {brandSummary.map(({ brand, count }) => (
              <button
                key={brand}
                onClick={() => {
                  setSearchText(brand);
                  resetPagination();
                }}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                <span className="font-medium">{brand}</span>
                <span className="rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-xs font-semibold tabular-nums">
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Search & Filters ───────────────────────────────────────────── */}
      <div className="rounded-lg border p-4 space-y-4">
        <h2 className="text-sm font-semibold">Search Entries</h2>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {/* Brand / design search */}
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Brand or Design
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  resetPagination();
                }}
                placeholder="Search brand or design…"
                className="pl-8"
              />
            </div>
          </div>

          {/* Date from */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                resetPagination();
              }}
              className="w-full sm:w-[150px]"
            />
          </div>

          {/* Date to */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                resetPagination();
              }}
              className="w-full sm:w-[150px]"
            />
          </div>

          {/* Clear */}
          {(searchText || dateFrom || dateTo) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchText("");
                setDateFrom("");
                setDateTo("");
                resetPagination();
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* ─── Results Table ──────────────────────────────────────────────── */}
      <div className="rounded-lg border p-4">
        <h2 className="mb-4 text-sm font-semibold">
          {searchText || dateFrom || dateTo ? "Search Results" : "Recent Entries"}
        </h2>

        {searchResults === undefined ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : searchResults.logs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No demand entries found.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Brand</th>
                    <th className="pb-2 font-medium">Design</th>
                    <th className="pb-2 font-medium">Size</th>
                    <th className="pb-2 font-medium hidden sm:table-cell">Notes</th>
                    <th className="pb-2 font-medium">By</th>
                    <th className="pb-2 text-right font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.logs.map((log) => (
                    <tr key={log._id} className="border-b last:border-0">
                      <td className="py-2 font-medium">{log.brand}</td>
                      <td className="py-2 text-muted-foreground">{log.design ?? "—"}</td>
                      <td className="py-2">{log.size ?? "—"}</td>
                      <td className="py-2 text-muted-foreground hidden sm:table-cell max-w-[200px] truncate">
                        {log.notes ?? "—"}
                      </td>
                      <td className="py-2 text-muted-foreground">{log.loggedByName}</td>
                      <td className="py-2 text-right text-muted-foreground tabular-nums whitespace-nowrap">
                        <span>{formatDate(log.createdAt)}</span>
                        <span className="ml-1 text-xs">{formatTime(log.createdAt)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            <div className="mt-4 flex items-center justify-between border-t pt-3">
              <p className="text-xs text-muted-foreground tabular-nums">
                Page {pageNumber}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pageNumber === 1}
                  onClick={handlePrevPage}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!searchResults.hasMore}
                  onClick={handleNextPage}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

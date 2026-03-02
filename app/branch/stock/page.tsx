"use client";

import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StatusPill } from "@/components/inventory/StatusPill";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, ArrowUp, ArrowDown, X, Bell, Pencil } from "lucide-react";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BranchStockPage() {
  // ── Search & filters ──────────────────────────────────────────────────────
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true); // true = low qty first (most urgent)

  // ── Debounced search ──────────────────────────────────────────────────────
  const handleSearchChange = useCallback((text: string) => {
    setSearchText(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedSearch(text), 300);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ── Animation state ───────────────────────────────────────────────────────
  const prevQuantitiesRef = useRef<Record<string, number>>({});
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());

  // ── Threshold inline edit state ───────────────────────────────────────────
  const [editingInventoryId, setEditingInventoryId] = useState<string | null>(null);
  const [thresholdInput, setThresholdInput] = useState("");
  const [thresholdError, setThresholdError] = useState<string | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────
  const currentUser = useQuery(api.auth.users.getCurrentUser);
  // M2: "viewer" role is not in POS_ROLES — skip brand/category queries to prevent UNAUTHORIZED errors
  const isViewer = currentUser?.role === "viewer";
  const isManager = currentUser?.role === "admin" || currentUser?.role === "manager";

  const stock = useQuery(api.inventory.stockLevels.getBranchStock, {
    searchText: debouncedSearch || undefined,
    brandId: selectedBrandId ? (selectedBrandId as Id<"brands">) : undefined,
    categoryId: selectedCategoryId
      ? (selectedCategoryId as Id<"categories">)
      : undefined,
  });

  const brands = useQuery(
    api.pos.products.listPOSBrands,
    isViewer ? "skip" : {}
  );
  const categories = useQuery(
    api.pos.products.listPOSCategories,
    isViewer
      ? "skip"
      : selectedBrandId
      ? { brandId: selectedBrandId as Id<"brands"> }
      : {}
  );

  const alerts = useQuery(api.inventory.alerts.getLowStockAlerts);
  const setThreshold = useMutation(api.inventory.alerts.setInventoryThreshold);
  const dismissAlert = useMutation(api.inventory.alerts.dismissLowStockAlert);

  // ── Detect quantity changes → trigger pulse animation ──────────────────────
  useEffect(() => {
    if (!stock) return;

    const changed: string[] = [];
    for (const item of stock) {
      const prev = prevQuantitiesRef.current[item.variantId];
      if (prev !== undefined && prev !== item.quantity) {
        changed.push(item.variantId);
      }
    }

    // Update tracked quantities
    const next: Record<string, number> = {};
    for (const item of stock) {
      next[item.variantId] = item.quantity;
    }
    prevQuantitiesRef.current = next;

    if (changed.length === 0) return;

    setAnimatingIds((prev) => {
      const next = new Set(prev);
      for (const id of changed) next.add(id);
      return next;
    });

    // Remove animation class after 500ms
    const timeoutId = setTimeout(() => {
      setAnimatingIds((prev) => {
        const next = new Set(prev);
        for (const id of changed) next.delete(id);
        return next;
      });
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [stock]);

  // ── Sort ──────────────────────────────────────────────────────────────────
  const sortedStock = useMemo(() => {
    if (!stock) return [];
    return [...stock].sort((a, b) =>
      sortAsc ? a.quantity - b.quantity : b.quantity - a.quantity
    );
  }, [stock, sortAsc]);

  const stockPagination = usePagination(sortedStock);

  // ── Reset filters ─────────────────────────────────────────────────────────
  function resetFilters() {
    handleSearchChange("");
    setSelectedBrandId(null);
    setSelectedCategoryId(null);
  }

  const hasActiveFilters =
    debouncedSearch || selectedBrandId || selectedCategoryId;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Branch Stock</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {stock !== undefined
              ? `${stock.length} variant${stock.length !== 1 ? "s" : ""} · `
              : ""}
            Updated in real-time
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortAsc((v) => !v)}
          aria-label="Toggle sort order"
        >
          {sortAsc ? (
            <>
              <ArrowUp className="h-4 w-4 mr-1" /> Low qty first
            </>
          ) : (
            <>
              <ArrowDown className="h-4 w-4 mr-1" /> High qty first
            </>
          )}
        </Button>
      </div>

      {/* Low-stock alerts panel */}
      {alerts !== undefined && alerts.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 space-y-2">
          <p className="text-sm font-medium text-amber-800 flex items-center gap-1.5">
            <Bell className="h-4 w-4" />
            {alerts.length} Low Stock Alert{alerts.length !== 1 ? "s" : ""}
          </p>
          <ul className="space-y-1">
            {alerts.map((alert) => (
              <li key={alert.alertId} className="flex items-center justify-between text-sm text-amber-700">
                <span>
                  {alert.styleName} — {alert.size} {alert.color}: {alert.quantity} remaining (threshold: {alert.threshold})
                </span>
                {isManager && (
                  <button
                    type="button"
                    onClick={() => void dismissAlert({ alertId: alert.alertId })}
                    className="ml-4 text-xs underline hover:no-underline shrink-0"
                  >
                    Dismiss
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Controls */}
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <Input
            value={searchText}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by style name or SKU…"
            className="w-full max-w-sm"
          />
          {searchText && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Brand filter chips */}
        {brands && brands.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center">Brand:</span>
            {brands.map((brand) => (
              <button
                key={brand._id}
                type="button"
                onClick={() => {
                  // H1: Reset category filter when brand changes to prevent stale cross-brand filter
                  setSelectedBrandId(
                    selectedBrandId === brand._id ? null : brand._id
                  );
                  setSelectedCategoryId(null);
                }}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                  selectedBrandId === brand._id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border hover:border-primary"
                )}
              >
                {brand.name}
              </button>
            ))}
          </div>
        )}

        {/* Category filter chips */}
        {categories && categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center">Category:</span>
            {categories.map((cat) => (
              <button
                key={cat._id}
                type="button"
                onClick={() =>
                  setSelectedCategoryId(
                    selectedCategoryId === cat._id ? null : cat._id
                  )
                }
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                  selectedCategoryId === cat._id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border hover:border-primary"
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Active filter reset */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Clear all filters
          </button>
        )}
      </div>

      {/* Stock table */}
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Style Name
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Brand
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Size
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Color
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                SKU
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Price
              </th>
              <th
                className="text-left px-4 py-3 font-medium text-muted-foreground cursor-pointer select-none"
                onClick={() => setSortAsc((v) => !v)}
              >
                <span className="flex items-center gap-1">
                  Qty
                  <ArrowUpDown className="h-3 w-3" />
                </span>
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Status
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Threshold
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Last Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Loading state */}
            {stock === undefined &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b animate-pulse">
                  {Array.from({ length: 10 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded bg-muted w-full" />
                    </td>
                  ))}
                </tr>
              ))}

            {/* Empty state */}
            {stock !== undefined && sortedStock.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                  <p className="text-sm">No products match your filters.</p>
                  {hasActiveFilters && (
                    <Button
                      variant="link"
                      size="sm"
                      onClick={resetFilters}
                      className="mt-2"
                    >
                      Reset filters
                    </Button>
                  )}
                </td>
              </tr>
            )}

            {/* Stock rows */}
            {stockPagination.paginatedData.map((item) => (
              <tr
                key={item.variantId}
                className={cn(
                  "border-b group hover:bg-muted/30",
                  // L1: suppress transition-colors while animating to prevent CSS conflict
                  animatingIds.has(item.variantId)
                    ? "animate-pulse-stock"
                    : "transition-colors"
                )}
              >
                <td className="px-4 py-3 font-medium">{item.styleName}</td>
                <td className="px-4 py-3 text-muted-foreground">{item.brandName}</td>
                <td className="px-4 py-3">{item.size}</td>
                <td className="px-4 py-3">{item.color}</td>
                <td className="px-4 py-3 font-mono text-xs">{item.sku}</td>
                <td className="px-4 py-3">{formatCurrency(item.priceCentavos)}</td>
                <td className="px-4 py-3 font-semibold">{item.quantity}</td>
                <td className="px-4 py-3">
                  <StatusPill
                    quantity={item.quantity}
                    lowStockThreshold={item.lowStockThreshold}
                  />
                </td>
                <td className="px-4 py-3">
                  {isManager && editingInventoryId === item.inventoryId ? (
                    <span className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        value={thresholdInput}
                        onChange={(e) => {
                          setThresholdInput(e.target.value);
                          setThresholdError(null);
                        }}
                        className="w-16 rounded border px-1 py-0.5 text-sm"
                      />
                      <button
                        type="button"
                        className="text-xs text-primary"
                        onClick={() => {
                          const val = parseInt(thresholdInput, 10);
                          if (isNaN(val) || val < 0) {
                            setThresholdError("Must be ≥ 0");
                            return;
                          }
                          setThreshold({
                            inventoryId: item.inventoryId as Id<"inventory">,
                            threshold: val,
                          }).then(
                            () => setEditingInventoryId(null),
                            () => setThresholdError("Save failed — try again")
                          );
                        }}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground"
                        onClick={() => setEditingInventoryId(null)}
                      >
                        ✕
                      </button>
                      {thresholdError && (
                        <span className="text-xs text-destructive">{thresholdError}</span>
                      )}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      {item.lowStockThreshold}
                      {isManager && (
                        <button
                          type="button"
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground"
                          onClick={() => {
                            setEditingInventoryId(item.inventoryId);
                            setThresholdInput(String(item.lowStockThreshold));
                            setThresholdError(null);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {relativeTime(item.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePagination
          currentPage={stockPagination.currentPage}
          totalPages={stockPagination.totalPages}
          totalItems={stockPagination.totalItems}
          hasNextPage={stockPagination.hasNextPage}
          hasPrevPage={stockPagination.hasPrevPage}
          onNextPage={stockPagination.nextPage}
          onPrevPage={stockPagination.prevPage}
          noun="variant"
        />
      </div>
    </div>
  );
}

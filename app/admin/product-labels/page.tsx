"use client";

// app/admin/product-labels/page.tsx — print QR labels for products.
//
// Not one of the catalogue's variants carries a manufacturer barcode, so
// scan-only receiving has depended on somebody printing a SKU by hand. This is
// the missing piece: the QR holds the SKU, and every scan surface in RDI
// already resolves a code by barcode first and SKU second, so these labels
// work at the POS, at goods receipt, at packing and at box receiving today.
//
// The price is the one thing on a label that goes stale. A branch override
// beats the base price, so the page says which store it is pricing for and
// flags the rows where a branch differs from base — printing a tag at the base
// price for a store that charges something else is worse than printing no
// price at all.

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ProductQrLabels, LAYOUTS, type LabelLayout, type LabelRow,
} from "@/components/shared/ProductQrLabels";
import { QrCode, Printer, AlertTriangle } from "lucide-react";

export default function ProductLabelsPage() {
  const [branchId, setBranchId] = useState<string>("all");
  const [brandId, setBrandId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [layout, setLayout] = useState<LabelLayout>("tag");
  const [copies, setCopies] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const data = useQuery(api.catalog.productLabels.listVariantsForLabels, {
    ...(branchId !== "all" ? { branchId: branchId as Id<"branches"> } : {}),
    ...(brandId !== "all" ? { brandId: brandId as Id<"brands"> } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(onlyInStock ? { onlyInStock: true } : {}),
  });
  const brands = useQuery(api.catalog.brands.listBrands) as
    | { _id: string; name: string; isActive: boolean }[]
    | undefined;

  // Held steady across renders: a fresh [] each time would make the memo below
  // recompute on every keystroke in the search box.
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const chosen = useMemo(
    () => rows.filter((row) => picked.has(row.variantId as string)),
    [rows, picked]
  );

  // A tag priced at base for a store that charges something else is a wrong
  // price on a shelf, so it is called out rather than silently printed.
  const overridesInRun = chosen.filter((row) => row.hasBranchOverride).length;
  const basePricedRun = layout === "tagPrice" && data?.pricedFor === "base";

  const labelRows: LabelRow[] = chosen.map((row) => ({
    variantId: row.variantId as string,
    sku: row.sku,
    productName: row.productName,
    size: row.size,
    color: row.color,
    brandName: row.brandName,
    priceCentavos: row.priceCentavos,
    hasBranchOverride: row.hasBranchOverride,
  }));

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectClass = "rounded-md border bg-background px-2 py-1 text-xs";
  const allPicked = rows.length > 0 && chosen.length === rows.length;

  return (
    <div className="space-y-6">
      <div className="no-print">
        <div className="flex items-center gap-2">
          <QrCode className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Product QR Labels</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          The QR holds the product&apos;s SKU, which the POS, goods receipt,
          packing and box receiving all already scan. Pick the products, pick a
          layout, print.
        </p>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="no-print flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
        {data?.canPickBranch !== false && (
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Price and stock for</span>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className={cn(selectClass, "max-w-[12rem] truncate")}
            >
              <option value="all">Base prices, all stores</option>
              {(data?.branches ?? []).map((b) => (
                <option key={b._id as string} value={b._id as string}>{b.name}</option>
              ))}
            </select>
          </label>
        )}

        <label className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Brand</span>
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className={cn(selectClass, "max-w-[10rem] truncate")}
          >
            <option value="all">All</option>
            {(brands ?? [])
              .filter((b) => b.isActive)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((b) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
          </select>
        </label>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="SKU, product or style code"
          className="h-7 w-52 text-xs"
        />

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={onlyInStock}
            disabled={branchId === "all"}
            onChange={(e) => setOnlyInStock(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300"
          />
          Only what this store holds
          {branchId === "all" && <span> (pick a store first)</span>}
        </label>
      </div>

      {/* ── Layout and run ──────────────────────────────────────────────────── */}
      <div className="no-print space-y-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          {LAYOUTS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setLayout(option.value)}
              className={cn(
                "max-w-xs rounded-lg border p-3 text-left transition-colors",
                layout === option.value
                  ? "border-primary bg-primary/5"
                  : "hover:border-primary/40"
              )}
            >
              <p className="text-sm font-medium">{option.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{option.hint}</p>
              <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                {option.width} × {option.height} mm · QR {option.qrMm} mm
              </p>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Copies of each</span>
            <Input
              type="number"
              min={1}
              max={50}
              value={copies}
              onChange={(e) =>
                setCopies(Math.min(50, Math.max(1, Number(e.target.value) || 1)))
              }
              className="h-7 w-16 text-xs"
            />
          </label>
          <span className="text-xs text-muted-foreground">
            {chosen.length} product{chosen.length === 1 ? "" : "s"} ·{" "}
            {chosen.length * copies} label
            {chosen.length * copies === 1 ? "" : "s"}
          </span>
          <Button
            className="ml-auto"
            size="sm"
            disabled={chosen.length === 0}
            onClick={() => window.print()}
          >
            <Printer className="mr-1.5 h-4 w-4" />
            Print {chosen.length * copies || ""}
          </Button>
        </div>

        {basePricedRun && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 p-2.5 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              These tags will carry the <span className="font-medium">base price</span>.
              Any store with its own price will end up with a wrong tag on the
              shelf — pick a store above to price the run for it.
            </p>
          </div>
        )}
        {!basePricedRun && layout === "tagPrice" && overridesInRun > 0 && (
          <p className="text-xs text-muted-foreground">
            {overridesInRun} of these use {data?.branchName}&apos;s own price rather
            than the base price.
          </p>
        )}
      </div>

      {/* ── Pick the products ───────────────────────────────────────────────── */}
      <div className="no-print rounded-lg border">
        <div className="flex items-center gap-3 border-b px-3 py-2">
          <label className="flex items-center gap-1.5 text-xs font-medium">
            <input
              type="checkbox"
              checked={allPicked}
              onChange={(e) =>
                setPicked(
                  e.target.checked
                    ? new Set(rows.map((r) => r.variantId as string))
                    : new Set()
                )
              }
              className="h-3.5 w-3.5 rounded border-gray-300"
            />
            {allPicked ? "None" : `All ${rows.length}`}
          </label>
          <span className="text-xs text-muted-foreground">
            {data === undefined
              ? "Loading…"
              : `${rows.length} product${rows.length === 1 ? "" : "s"} match`}
            {data?.truncated && " · narrow the filters to see the rest"}
          </span>
        </div>

        <div className="max-h-80 overflow-auto">
          {data === undefined ? (
            <div className="space-y-1 p-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nothing matches those filters.
            </p>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {rows.map((row) => {
                  const id = row.variantId as string;
                  return (
                    <tr
                      key={id}
                      className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                      onClick={() => toggle(id)}
                    >
                      <td className="w-8 px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={picked.has(id)}
                          onChange={() => toggle(id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-3.5 w-3.5 rounded border-gray-300"
                        />
                      </td>
                      <td className="px-2 py-1.5 font-mono">{row.sku}</td>
                      <td className="px-2 py-1.5">
                        {row.productName}
                        <span className="text-muted-foreground">
                          {" "}
                          · {[row.size, row.color].filter(Boolean).join("/")}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {formatCurrency(row.priceCentavos)}
                        {row.hasBranchOverride && (
                          <Badge
                            variant="outline"
                            className="ml-1.5 border-sky-400 text-[9px] text-sky-700"
                          >
                            store
                          </Badge>
                        )}
                      </td>
                      <td className="w-16 px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {row.stockAtBranch === null ? "" : `${row.stockAtBranch} pcs`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── The sheet ───────────────────────────────────────────────────────── */}
      {chosen.length > 0 && (
        <div>
          <p className="no-print mb-2 text-xs text-muted-foreground">
            Preview at print size. The dashed edges are a guide and do not print.
          </p>
          <div className="overflow-x-auto rounded-lg border bg-white p-2">
            <ProductQrLabels rows={labelRows} layout={layout} copies={copies} />
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

// app/admin/replenishment/page.tsx — merchandising's push, as a sheet.
//
// Replenishment in RDI has only ever been a pull: a branch's ordering cycle,
// edited by its manager. This is the other direction — merchandising decides
// the top-up and sends it.
//
// Deliberately not a one-click "send it" button. The system proposes, you
// download the sheet, you edit it where you actually work, and you upload it
// back through the SAME allocation upload the warehouse already uses. So it
// inherits the stock holds, one request per store, the logistics approval
// queue and the fill-rate reporting without a second pipeline existing.

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AllocationCsv } from "@/components/shared/AllocationCsv";
import { Download, PackagePlus, AlertTriangle } from "lucide-react";

function num(value: number): string {
  return value.toLocaleString("en-PH");
}

export default function ReplenishmentPage() {
  const [coverDays, setCoverDays] = useState(21);
  const [lookbackDays, setLookbackDays] = useState(30);
  const [brandId, setBrandId] = useState<string>("all");
  const [onlySuppliable, setOnlySuppliable] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const sheet = useQuery(api.inventory.replenishmentWorksheet.buildReplenishmentWorksheet, {
    coverDays,
    lookbackDays,
    ...(brandId !== "all" ? { brandId: brandId as Id<"brands"> } : {}),
    ...(onlySuppliable ? { onlySuppliable: true } : {}),
    ...(picked.size > 0
      ? { branchIds: [...picked] as Id<"branches">[] }
      : {}),
  });
  const brands = useQuery(api.catalog.brands.listBrands) as
    | { _id: string; name: string; isActive: boolean }[]
    | undefined;

  const rows = useMemo(() => sheet?.rows ?? [], [sheet]);
  const selectClass = "rounded-md border bg-background px-2 py-1 text-xs";

  function exportSheet() {
    if (rows.length === 0) return;
    // Exactly the columns the allocation upload reads, so this file can be
    // edited and sent straight back with nothing renamed. The working figures
    // ride along after Notes, where the upload ignores them.
    downloadCsv("replenishment-allocation.csv", [
      ["SKU", "Branch", "Quantity", "Notes",
       "Sold", "Per day", "On hand", "Incoming", "Cover target", "Shortfall", "Warehouse"],
      ...rows.map((r) => [
        r.sku,
        r.branchName,
        r.suggestedQuantity,
        `cover ${sheet?.coverDays}d`,
        r.unitsSold,
        r.dailyVelocity,
        r.onHand,
        r.incoming,
        r.coverTarget,
        r.shortfall,
        r.warehouseStock,
      ]),
    ]);
    toast.message(
      "Edit the Quantity column, then upload it below. Everything after Notes is ignored on upload."
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <PackagePlus className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Replenishment</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          What each store is short of, against its own rate of sale. Download the
          sheet, set the quantities, upload it back — it becomes one transfer
          request per store and waits for logistics approval.
        </p>
      </div>

      {/* ── Settings ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Cover</span>
          <Input
            type="number"
            min={1}
            max={120}
            value={coverDays}
            onChange={(e) =>
              setCoverDays(Math.min(120, Math.max(1, Number(e.target.value) || 1)))
            }
            className="h-7 w-16 text-xs"
          />
          <span className="text-xs text-muted-foreground">days of stock</span>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Rate of sale over</span>
          <Input
            type="number"
            min={7}
            max={365}
            value={lookbackDays}
            onChange={(e) =>
              setLookbackDays(Math.min(365, Math.max(7, Number(e.target.value) || 7)))
            }
            className="h-7 w-16 text-xs"
          />
          <span className="text-xs text-muted-foreground">days</span>
        </label>
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
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={onlySuppliable}
            onChange={(e) => setOnlySuppliable(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300"
          />
          Hide what the warehouse cannot supply
        </label>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={rows.length === 0}
          onClick={exportSheet}
        >
          <Download className="mr-1.5 h-4 w-4" />
          Download sheet
        </Button>
      </div>

      {/* ── Store picker ────────────────────────────────────────────────────── */}
      {sheet && sheet.branches.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-card p-3">
          <span className="mr-1 text-xs text-muted-foreground">Stores</span>
          <button
            type="button"
            onClick={() => setPicked(new Set())}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
              picked.size === 0
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:border-primary/50"
            )}
          >
            All
          </button>
          {sheet.branches.map((b) => {
            const id = b._id as string;
            const on = picked.has(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:border-primary/50"
                )}
              >
                {b.name}
              </button>
            );
          })}
        </div>
      )}

      {sheet === undefined ? (
        <div className="h-64 animate-pulse rounded-lg border bg-muted/40" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Lines short</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums">
                {num(sheet.totals.rows)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                across {sheet.totals.branches} store
                {sheet.totals.branches === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Shortfall</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums">
                {num(sheet.totals.shortfallUnits)}
              </p>
              <p className="text-[11px] text-muted-foreground">units below cover</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Suggested</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-emerald-600">
                {num(sheet.totals.suggestedUnits)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                what the warehouse can give
              </p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Cannot cover</p>
              <p
                className={cn(
                  "mt-0.5 text-xl font-semibold tabular-nums",
                  sheet.totals.cappedRows > 0 && "text-amber-600"
                )}
              >
                {num(sheet.totals.cappedRows)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                lines short at the warehouse too
              </p>
            </div>
          </div>

          {sheet.totals.cappedRows > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {num(sheet.totals.cappedRows)} line
                {sheet.totals.cappedRows === 1 ? "" : "s"} cannot be filled from
                warehouse stock. Moving stock will not fix those — they need a
                purchase order.
              </p>
            </div>
          )}

          {sheet.truncated && (
            <p className="text-xs text-amber-700">
              Only the first rows are shown. Narrow by brand or store to see the rest.
            </p>
          )}

          {rows.length === 0 ? (
            <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
              Every store is at or above {sheet.coverDays} days of cover on what it
              sells.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead className="text-right">Per day</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Incoming</TableHead>
                    <TableHead className="text-right">Cover</TableHead>
                    <TableHead className="text-right">Short</TableHead>
                    <TableHead className="text-right">Suggest</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 300).map((r) => (
                    <TableRow key={`${r.branchId}-${r.variantId}`}>
                      <TableCell>
                        <p className="font-mono text-xs">{r.sku}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.productName}
                          {(r.size || r.color) && (
                            <span> · {[r.size, r.color].filter(Boolean).join("/")}</span>
                          )}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs">{r.branchName}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.unitsSold}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.dailyVelocity.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.onHand}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {r.incoming > 0 ? r.incoming : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.coverTarget}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-amber-700">
                        {r.shortfall}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {r.suggestedQuantity}
                        {r.capped && (
                          <Badge
                            variant="outline"
                            className="ml-1.5 border-amber-400 text-[9px] text-amber-700"
                            title={`Warehouse holds ${r.warehouseStock}`}
                          >
                            capped
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 300 && (
                <p className="border-t p-2 text-center text-xs text-muted-foreground">
                  Showing 300 of {num(rows.length)} lines. The download has them all.
                </p>
              )}
            </div>
          )}

          {/* ── Send it back ─────────────────────────────────────────────── */}
          <div>
            <h2 className="mb-2 text-sm font-semibold">Upload the edited sheet</h2>
            <AllocationCsv />
          </div>
        </>
      )}
    </div>
  );
}

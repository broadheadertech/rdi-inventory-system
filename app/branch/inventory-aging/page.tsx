"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Clock, AlertTriangle, CheckCircle2, Package } from "lucide-react";

const TIER_COLORS: Record<string, string> = {
  green: "text-green-600 border-green-500/30 bg-green-500/10",
  yellow: "text-amber-600 border-amber-500/30 bg-amber-500/10",
  red: "text-red-600 border-red-500/30 bg-red-500/10",
};

const TIER_LABELS: Record<string, string> = {
  green: "New (0-90d)",
  yellow: "Mid (91-180d)",
  red: "Old (181d+)",
};

function formatPeso(centavos: number) {
  return `₱${(centavos / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
}

export default function BranchInventoryAgingPage() {
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const data = useQuery(api.dashboards.inventoryAging.getBranchAgingReport);

  const filteredItems = (data?.items ?? []).filter((item) => {
    if (tierFilter !== "all" && item.dominantTier !== tierFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.styleName.toLowerCase().includes(q) ||
        item.brandName.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.categoryName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const pagination = usePagination(filteredItems, 10);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Inventory Aging</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Stock age in your branch. Green = 0-90d, Yellow = 91-180d, Red = 181d+.
        </p>
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="rounded-lg border p-3 bg-green-500/10">
            <p className="text-xs text-muted-foreground">New (0-90d)</p>
            <p className="text-2xl font-bold text-green-600">{data.summary.greenSkus}</p>
            <p className="text-xs text-muted-foreground">{formatPeso(data.summary.greenCostCentavos)}</p>
          </div>
          <div className="rounded-lg border p-3 bg-amber-500/10">
            <p className="text-xs text-muted-foreground">Mid (91-180d)</p>
            <p className="text-2xl font-bold text-amber-600">{data.summary.yellowSkus}</p>
            <p className="text-xs text-muted-foreground">{formatPeso(data.summary.yellowCostCentavos)}</p>
          </div>
          <div className="rounded-lg border p-3 bg-red-500/10">
            <p className="text-xs text-muted-foreground">Old (181d+)</p>
            <p className="text-2xl font-bold text-red-600">{data.summary.redSkus}</p>
            <p className="text-xs text-muted-foreground">{formatPeso(data.summary.redCostCentavos)}</p>
          </div>
          <div className="rounded-lg border p-3 bg-muted">
            <p className="text-xs text-muted-foreground">Total SKUs</p>
            <p className="text-2xl font-bold">{data.summary.totalSkus}</p>
            <p className="text-xs text-muted-foreground">{data.summary.totalUnits} units</p>
          </div>
          <div className={cn(
            "rounded-lg border p-3",
            data.summary.atRiskCostCentavos > 0 ? "bg-red-500/10" : "bg-green-500/10"
          )}>
            <p className="text-xs text-muted-foreground">At-Risk Value</p>
            <p className={cn(
              "text-2xl font-bold",
              data.summary.atRiskCostCentavos > 0 ? "text-red-600" : "text-green-600"
            )}>
              {formatPeso(data.summary.atRiskCostCentavos)}
            </p>
            <p className="text-xs text-muted-foreground">Yellow + Red cost</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Tier</Label>
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              <SelectItem value="green">New (0-90d)</SelectItem>
              <SelectItem value="yellow">Mid (91-180d)</SelectItem>
              <SelectItem value="red">Old (181d+)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 flex-1 min-w-[200px]">
          <Label className="text-xs">Search</Label>
          <Input
            placeholder="Search style, brand, SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        {data === undefined ? (
          <div className="p-8 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-sm text-muted-foreground">
            <Package className="h-10 w-10" />
            <p>No inventory found for this filter.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Size / Color</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Green</TableHead>
                <TableHead className="text-right">Yellow</TableHead>
                <TableHead className="text-right">Red</TableHead>
                <TableHead className="text-right">Avg Age</TableHead>
                <TableHead className="text-right">Oldest</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.paginatedData.map((item) => (
                <TableRow key={item.variantId}>
                  <TableCell>
                    <p className="font-medium text-sm">{item.styleName}</p>
                    <p className="text-xs text-muted-foreground">{item.sku}</p>
                  </TableCell>
                  <TableCell className="text-sm">{item.brandName}</TableCell>
                  <TableCell className="text-sm">
                    {item.size} / {item.color}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{item.totalQty}</TableCell>
                  <TableCell className="text-right tabular-nums text-green-600">
                    {item.greenQty > 0 ? item.greenQty : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-amber-600">
                    {item.yellowQty > 0 ? item.yellowQty : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-red-600">
                    {item.redQty > 0 ? item.redQty : "—"}
                  </TableCell>
                  <TableCell className={cn(
                    "text-right tabular-nums",
                    item.dominantTier === "red" ? "text-red-600" :
                    item.dominantTier === "yellow" ? "text-amber-600" : "text-green-600"
                  )}>
                    {item.weightedAvgAge}d
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {item.oldestAgeDays}d
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs", TIER_COLORS[item.dominantTier])}>
                      {item.dominantTier === "red" && <AlertTriangle className="h-3 w-3 mr-1" />}
                      {item.dominantTier === "green" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                      {item.dominantTier === "yellow" && <Clock className="h-3 w-3 mr-1" />}
                      {TIER_LABELS[item.dominantTier]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {formatPeso(item.totalCostCentavos)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {filteredItems.length > 0 && (
        <TablePagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          hasNextPage={pagination.hasNextPage}
          hasPrevPage={pagination.hasPrevPage}
          onNextPage={pagination.nextPage}
          onPrevPage={pagination.prevPage}
        />
      )}
    </div>
  );
}

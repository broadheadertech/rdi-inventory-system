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
import {
  BarChart3, Zap, TrendingDown, Minus, Skull, Clock,
} from "lucide-react";

const PERIOD_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last 90 days" },
];

const CLASS_COLORS: Record<string, string> = {
  fast: "bg-green-500/10 text-green-600 border-green-500/30",
  mid: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  slow: "bg-red-500/10 text-red-600 border-red-500/30",
  dead: "bg-gray-500/10 text-gray-500 border-gray-500/30",
};

const AGING_COLORS: Record<string, string> = {
  green: "text-green-600",
  yellow: "text-amber-600",
  red: "text-red-600",
};

const CLASS_ICONS: Record<string, React.ReactNode> = {
  fast: <Zap className="h-3.5 w-3.5" />,
  mid: <Minus className="h-3.5 w-3.5" />,
  slow: <TrendingDown className="h-3.5 w-3.5" />,
  dead: <Skull className="h-3.5 w-3.5" />,
};

export default function BranchSellThroughPage() {
  const [periodDays, setPeriodDays] = useState("30");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const data = useQuery(api.analytics.sellThrough.getBranchSellThrough, {
    periodDays: parseInt(periodDays),
    classification: classFilter !== "all" ? classFilter : undefined,
  });

  const filteredItems = (data?.items ?? []).filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.styleName.toLowerCase().includes(q) ||
      item.brandName.toLowerCase().includes(q) ||
      item.categoryName.toLowerCase().includes(q)
    );
  });

  const pagination = usePagination(filteredItems, 10);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Sell-Through</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Your branch product sell-through rates. Sell-Through % = SOLD / BEG.
        </p>
      </div>

      {/* Summary */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Fast (≥70%)", value: data.summary.fast, color: "text-green-600", bg: "bg-green-500/10" },
            { label: "Mid (30-69%)", value: data.summary.mid, color: "text-amber-600", bg: "bg-amber-500/10" },
            { label: "Slow (<30%)", value: data.summary.slow, color: "text-red-600", bg: "bg-red-500/10" },
            { label: "Dead (0%)", value: data.summary.dead, color: "text-gray-500", bg: "bg-gray-500/10" },
            { label: "Total", value: data.summary.total, color: "text-foreground", bg: "bg-muted" },
          ].map((card) => (
            <div key={card.label} className={cn("rounded-lg border p-3", card.bg)}>
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className={cn("text-2xl font-bold", card.color)}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Period</Label>
          <Select value={periodDays} onValueChange={setPeriodDays}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Classification</Label>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="fast">Fast (≥70%)</SelectItem>
              <SelectItem value="mid">Mid (30-69%)</SelectItem>
              <SelectItem value="slow">Slow (&lt;30%)</SelectItem>
              <SelectItem value="dead">Dead (0%)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 flex-1 min-w-[200px]">
          <Label className="text-xs">Search</Label>
          <Input
            placeholder="Search style, brand, category..."
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
            <BarChart3 className="h-10 w-10" />
            <p>No products found.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead className="text-right">BEG</TableHead>
                <TableHead className="text-right">SOH</TableHead>
                <TableHead className="text-right">SOLD</TableHead>
                <TableHead className="text-right">Sell-Thru %</TableHead>
                <TableHead>Class</TableHead>
                <TableHead className="text-right">Avg Age</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.paginatedData.map((item) => (
                <TableRow key={item.styleId}>
                  <TableCell>
                    <p className="font-medium text-sm">{item.styleName}</p>
                    <p className="text-xs text-muted-foreground">{item.categoryName}</p>
                  </TableCell>
                  <TableCell className="text-sm">{item.brandName}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.beg}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.soh}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{item.sold}</TableCell>
                  <TableCell className="text-right">
                    <span className={cn(
                      "font-bold tabular-nums",
                      item.classification === "fast" && "text-green-600",
                      item.classification === "mid" && "text-amber-600",
                      item.classification === "slow" && "text-red-600",
                      item.classification === "dead" && "text-gray-400",
                    )}>
                      {item.sellThruPct}%
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs", CLASS_COLORS[item.classification])}>
                      {CLASS_ICONS[item.classification]}
                      <span className="ml-1 uppercase">{item.classification}</span>
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={cn(
                      "tabular-nums text-sm",
                      AGING_COLORS[item.agingTier]
                    )}>
                      {item.avgAgeDays}d
                    </span>
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

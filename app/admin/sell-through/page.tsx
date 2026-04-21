"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { getErrorMessage, cn } from "@/lib/utils";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  BarChart3, Search, ScanBarcode, ChevronDown, ChevronUp, MessageSquarePlus,
  Zap, TrendingDown, Minus, Skull, Loader2, X, Clock, Info, CalendarClock,
} from "lucide-react";

// ─── Lifecycle thresholds (must match convex/dashboards/productMovers.ts) ─────

const LIFECYCLE_THRESHOLDS = [
  { wk: 1, fast: 5, slow: 3, stage: "Received in Warehouse" },
  { wk: 2, fast: 10, slow: 7, stage: "Received in all Metro Manila → South" },
  { wk: 3, fast: 15, slow: 10, stage: "" },
  { wk: 4, fast: 20, slow: 13, stage: "Received in all Stores incl. Vismin" },
  { wk: 5, fast: 25, slow: 17, stage: "" },
  { wk: 6, fast: 30, slow: 20, stage: "1-month evaluation for all stores" },
  { wk: 7, fast: 35, slow: 23, stage: "" },
  { wk: 8, fast: 40, slow: 27, stage: "" },
  { wk: 9, fast: 45, slow: 30, stage: "" },
  { wk: 10, fast: 50, slow: 33, stage: "" },
  { wk: 11, fast: 55, slow: 37, stage: "" },
  { wk: 12, fast: 60, slow: 40, stage: "Final Grade" },
] as const;

const LIFECYCLE_CLASS_CONFIG = {
  fast: { label: "Fast", color: "text-green-600", chip: "bg-green-500/10 text-green-600 border-green-500/30" },
  mid: { label: "Mid", color: "text-blue-600", chip: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  slow: { label: "Slow", color: "text-red-600", chip: "bg-red-500/10 text-red-600 border-red-500/30" },
} as const;

type LifecycleClass = keyof typeof LIFECYCLE_CLASS_CONFIG;

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

const VERDICT_OPTIONS = [
  { value: "markdown", label: "Mark Down" },
  { value: "transfer", label: "Transfer Stock" },
  { value: "return_to_supplier", label: "Return to Supplier" },
  { value: "bundle", label: "Bundle Deal" },
  { value: "promote", label: "Promote / Feature" },
  { value: "hold", label: "Hold / Wait" },
  { value: "other", label: "Other" },
] as const;

type VerdictType = (typeof VERDICT_OPTIONS)[number]["value"];

export default function SellThroughPage() {
  const [mode, setMode] = useState<"current" | "lifecycle">("current");
  const [periodDays, setPeriodDays] = useState("30");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedStyle, setExpandedStyle] = useState<string | null>(null);

  // Lifecycle-mode state
  const [lcClassFilter, setLcClassFilter] = useState<"all" | LifecycleClass>("all");
  const [lcSortCol, setLcSortCol] = useState<string>("classification");
  const [lcSortDir, setLcSortDir] = useState<"asc" | "desc">("asc");
  const [showLegend, setShowLegend] = useState(false);

  // Barcode lookup
  const [barcodeInput, setBarcodeInput] = useState("");
  const [lookupCode, setLookupCode] = useState<string | null>(null);

  // Notes dialog
  const [notesStyleId, setNotesStyleId] = useState<Id<"styles"> | null>(null);
  const [notesStyleName, setNotesStyleName] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newVerdict, setNewVerdict] = useState<VerdictType>("other");
  const [saving, setSaving] = useState(false);

  // Queries
  const data = useQuery(api.analytics.sellThrough.getSellThroughAnalysis, {
    periodDays: parseInt(periodDays),
    branchId: branchFilter !== "all" ? (branchFilter as Id<"branches">) : undefined,
    brandId: brandFilter !== "all" ? (brandFilter as Id<"brands">) : undefined,
    classification: classFilter !== "all" ? classFilter : undefined,
  });

  const lifecycleData = useQuery(
    api.dashboards.productMovers.getLifecycleMovers,
    mode === "lifecycle"
      ? {
          ...(branchFilter !== "all" ? { branchId: branchFilter as Id<"branches"> } : {}),
          ...(brandFilter !== "all" ? { brandId: brandFilter as Id<"brands"> } : {}),
        }
      : "skip"
  );

  const lookupResult = useQuery(
    api.analytics.sellThrough.lookupByBarcode,
    lookupCode ? { code: lookupCode, periodDays: parseInt(periodDays) } : "skip"
  );

  const styleNotes = useQuery(
    api.analytics.sellThrough.getNotesForStyle,
    notesStyleId ? { styleId: notesStyleId } : "skip"
  );

  const brands = useQuery(api.storefront.homepage.getHomepageData);

  const addNote = useMutation(api.analytics.sellThrough.addNote);
  const deleteNote = useMutation(api.analytics.sellThrough.deleteNote);

  // Search filter on client
  const filteredItems = (data?.items ?? []).filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.styleName.toLowerCase().includes(q) ||
      item.brandName.toLowerCase().includes(q) ||
      item.categoryName.toLowerCase().includes(q)
    );
  });

  const pagination = usePagination(filteredItems, 20);

  // Lifecycle filtering / sorting
  const filteredLcItems = useMemo(() => {
    if (!lifecycleData?.items) return [];
    let items = lifecycleData.items;
    if (lcClassFilter !== "all")
      items = items.filter((i) => i.classification === lcClassFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (i) =>
          i.styleName.toLowerCase().includes(q) ||
          i.sku.toLowerCase().includes(q) ||
          i.brandName.toLowerCase().includes(q)
      );
    }
    const dir = lcSortDir === "asc" ? 1 : -1;
    const order: Record<string, number> = { slow: 0, mid: 1, fast: 2 };
    return [...items].sort((a, b) => {
      switch (lcSortCol) {
        case "week": return (a.weekIndex - b.weekIndex) * dir;
        case "received": return (a.totalReceived - b.totalReceived) * dir;
        case "sold": return (a.totalSold - b.totalSold) * dir;
        case "stock": return (a.currentStock - b.currentStock) * dir;
        case "sellThru": return (a.sellThruPct - b.sellThruPct) * dir;
        case "classification":
        default:
          return (order[a.classification] - order[b.classification]) * dir;
      }
    });
  }, [lifecycleData, lcClassFilter, lcSortCol, lcSortDir, searchQuery]);

  const lcPagination = usePagination(filteredLcItems, 20);

  const lcCounts = useMemo(() => {
    if (!lifecycleData?.items) return null;
    return {
      fast: lifecycleData.items.filter((i) => i.classification === "fast").length,
      mid: lifecycleData.items.filter((i) => i.classification === "mid").length,
      slow: lifecycleData.items.filter((i) => i.classification === "slow").length,
      total: lifecycleData.items.length,
    };
  }, [lifecycleData]);

  function handleLcSort(col: string) {
    if (lcSortCol === col) setLcSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setLcSortCol(col);
      setLcSortDir("asc");
    }
  }

  function handleBarcodeLookup() {
    if (!barcodeInput.trim()) return;
    setLookupCode(barcodeInput.trim());
  }

  async function handleAddNote() {
    if (!notesStyleId || !newNote.trim()) return;
    setSaving(true);
    try {
      await addNote({
        styleId: notesStyleId,
        note: newNote.trim(),
        verdict: newVerdict,
      });
      setNewNote("");
      toast.success("Note added");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteNote(noteId: Id<"sellThruNotes">) {
    try {
      await deleteNote({ noteId });
      toast.success("Note deleted");
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Sell-Through Analysis</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === "current"
            ? "Analyze product sell-through rates across branches. BEG = SOH + SOLD. Sell-Through % = SOLD / BEG."
            : "Classify SKUs Fast / Mid / Slow by cumulative sell-through % vs. weeks since first receipt."}
        </p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 border-b">
        {([
          { key: "current", label: "Current Period", icon: <BarChart3 className="h-4 w-4" /> },
          { key: "lifecycle", label: "Lifecycle (12-week)", icon: <CalendarClock className="h-4 w-4" /> },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setMode(t.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              mode === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {mode === "current" && (<>
      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Fast (≥70%)", value: data.summary.fast, color: "text-green-600", bg: "bg-green-500/10" },
            { label: "Mid (30-69%)", value: data.summary.mid, color: "text-amber-600", bg: "bg-amber-500/10" },
            { label: "Slow (<30%)", value: data.summary.slow, color: "text-red-600", bg: "bg-red-500/10" },
            { label: "Dead (0%)", value: data.summary.dead, color: "text-gray-500", bg: "bg-gray-500/10" },
            { label: "Total Styles", value: data.summary.total, color: "text-foreground", bg: "bg-muted" },
          ].map((card) => (
            <div key={card.label} className={cn("rounded-lg border p-3", card.bg)}>
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className={cn("text-2xl font-bold", card.color)}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Barcode Lookup */}
      <div className="rounded-lg border p-4 bg-card">
        <div className="flex items-center gap-2 mb-3">
          <ScanBarcode className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Quick Lookup (Barcode / SKU)</h3>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Scan barcode or type SKU..."
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleBarcodeLookup()}
            className="max-w-sm"
          />
          <Button onClick={handleBarcodeLookup} size="sm">
            <Search className="h-4 w-4 mr-1" /> Lookup
          </Button>
          {lookupCode && (
            <Button variant="ghost" size="sm" onClick={() => { setLookupCode(null); setBarcodeInput(""); }}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Lookup Result */}
        {lookupCode && lookupResult === undefined && (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Searching...
          </div>
        )}
        {lookupCode && lookupResult === null && (
          <p className="mt-3 text-sm text-muted-foreground">No product found for &quot;{lookupCode}&quot;</p>
        )}
        {lookupResult && (
          <div className="mt-4 rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-lg">{lookupResult.styleName}</p>
                <p className="text-sm text-muted-foreground">
                  {lookupResult.brandName} — {lookupResult.categoryName}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  SKU: {lookupResult.sku} {lookupResult.barcode && `| Barcode: ${lookupResult.barcode}`}
                </p>
              </div>
              <Badge variant="outline" className={CLASS_COLORS[lookupResult.classification]}>
                {CLASS_ICONS[lookupResult.classification]}
                <span className="ml-1 uppercase text-xs font-bold">{lookupResult.classification}</span>
              </Badge>
            </div>

            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="rounded bg-muted p-2">
                <p className="text-xs text-muted-foreground">BEG</p>
                <p className="text-lg font-bold">{lookupResult.beg}</p>
              </div>
              <div className="rounded bg-muted p-2">
                <p className="text-xs text-muted-foreground">SOH</p>
                <p className="text-lg font-bold">{lookupResult.soh}</p>
              </div>
              <div className="rounded bg-muted p-2">
                <p className="text-xs text-muted-foreground">SOLD</p>
                <p className="text-lg font-bold">{lookupResult.sold}</p>
              </div>
              <div className="rounded bg-primary/10 p-2">
                <p className="text-xs text-muted-foreground">Sell-Through</p>
                <p className="text-lg font-bold text-primary">{lookupResult.sellThruPct}%</p>
              </div>
            </div>

            {/* Branch Ranking */}
            {lookupResult.branchBreakdown.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Branch Ranking</p>
                <div className="space-y-1">
                  {lookupResult.branchBreakdown.map((bb, i) => (
                    <div key={bb.branchId} className="flex items-center gap-2 text-sm">
                      <span className="w-6 text-right font-mono text-muted-foreground">#{i + 1}</span>
                      <span className="flex-1 truncate">{bb.branchName}</span>
                      <span className="text-xs text-muted-foreground">
                        BEG:{bb.beg} SOH:{bb.soh} SOLD:{bb.sold}
                      </span>
                      <Badge variant="outline" className={cn("text-xs", CLASS_COLORS[bb.classification])}>
                        {bb.sellThruPct}%
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {lookupResult.notes.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Notes</p>
                {lookupResult.notes.map((n) => (
                  <div key={String(n._id)} className="flex gap-2 text-xs border-l-2 border-primary/30 pl-2 mb-2">
                    <div className="flex-1">
                      {n.verdict && (
                        <Badge variant="outline" className="mr-1 text-[10px]">{n.verdict.replace(/_/g, " ")}</Badge>
                      )}
                      <span>{n.note}</span>
                      <span className="text-muted-foreground ml-2">— {n.authorName}, {new Date(n.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

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
          <Label className="text-xs">Brand</Label>
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {(brands?.brands ?? []).map((b) => (
                <SelectItem key={String(b._id)} value={String(b._id)}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Branch</Label>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {(data?.branches ?? []).map((b) => (
                <SelectItem key={String(b._id)} value={String(b._id)}>{b.name}</SelectItem>
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

      {/* Main Table */}
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
            <p>No products found for this filter.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead className="text-right">BEG</TableHead>
                <TableHead className="text-right">SOH</TableHead>
                <TableHead className="text-right">SOLD</TableHead>
                <TableHead className="text-right">Sell-Thru %</TableHead>
                <TableHead>Class</TableHead>
                <TableHead className="text-right">Avg Age</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.paginatedData.map((item) => {
                const isExpanded = expandedStyle === item.styleId;
                return (
                  <>
                    <TableRow
                      key={item.styleId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedStyle(isExpanded ? null : item.styleId)}
                    >
                      <TableCell>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
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
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setNotesStyleId(item.styleId as Id<"styles">);
                            setNotesStyleName(item.styleName);
                          }}
                          title="Add note"
                        >
                          <MessageSquarePlus className="h-4 w-4" />
                          {item.notesCount > 0 && (
                            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">
                              {item.notesCount}
                            </span>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>

                    {/* Expanded Branch Breakdown */}
                    {isExpanded && item.branchBreakdown.length > 0 && (
                      <TableRow key={`${item.styleId}-expanded`}>
                        <TableCell colSpan={10} className="bg-muted/30 p-0">
                          <div className="px-6 py-3">
                            <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
                              Branch Ranking (Best → Worst)
                            </p>
                            <div className="space-y-1.5">
                              {item.branchBreakdown.map((bb, i) => (
                                <div key={bb.branchId} className="flex items-center gap-3 text-sm">
                                  <span className="w-6 text-right font-mono text-xs text-muted-foreground">#{i + 1}</span>
                                  <span className="flex-1 truncate font-medium">{bb.branchName}</span>
                                  <span className="text-xs text-muted-foreground tabular-nums">
                                    BEG: {bb.beg}
                                  </span>
                                  <span className="text-xs text-muted-foreground tabular-nums">
                                    SOH: {bb.soh}
                                  </span>
                                  <span className="text-xs tabular-nums font-semibold">
                                    SOLD: {bb.sold}
                                  </span>
                                  <Badge variant="outline" className={cn("text-xs tabular-nums", CLASS_COLORS[bb.classification])}>
                                    {bb.sellThruPct}%
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
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

      </>)}

      {mode === "lifecycle" && (
        <>
          {/* Filters */}
          <div className="rounded-lg border p-4 bg-card">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Branch</Label>
                <Select value={branchFilter} onValueChange={setBranchFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches</SelectItem>
                    {data?.branches.map((b) => (
                      <SelectItem key={String(b._id)} value={String(b._id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Brand</Label>
                <Select value={brandFilter} onValueChange={setBrandFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Brands</SelectItem>
                    {brands?.brands?.map((b) => (
                      <SelectItem key={String(b._id)} value={String(b._id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Quick Search */}
          <div className="rounded-lg border p-4 bg-card">
            <div className="flex items-center gap-2 mb-3">
              <ScanBarcode className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Quick Search (Style / SKU / Brand)</h3>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Search style, SKU or brand..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
              <Button size="sm" variant="default">
                <Search className="h-4 w-4 mr-1" /> Search
              </Button>
              {searchQuery && (
                <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Lifecycle summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(["fast", "mid", "slow"] as const).map((k) => {
              const cfg = LIFECYCLE_CLASS_CONFIG[k];
              return (
                <button
                  key={k}
                  onClick={() => setLcClassFilter(lcClassFilter === k ? "all" : k)}
                  className={cn(
                    "rounded-lg border p-4 text-left transition-colors",
                    lcClassFilter === k ? "ring-2 ring-primary" : "hover:bg-muted/50",
                  )}
                >
                  <p className="text-xs text-muted-foreground">{cfg.label} Movers</p>
                  {lcCounts === null ? (
                    <div className="mt-1 h-7 animate-pulse rounded bg-muted" />
                  ) : (
                    <p className={cn("mt-1 text-2xl font-bold tabular-nums", cfg.color)}>
                      {lcCounts[k]}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="rounded-lg border bg-card">
            <button
              onClick={() => setShowLegend((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Info className="h-4 w-4" /> How lifecycle classification works
              </span>
              <span className="text-xs text-muted-foreground">{showLegend ? "Hide" : "Show"}</span>
            </button>
            {showLegend && (
              <div className="border-t p-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div>
                    <p className="font-semibold mb-1">Distribution Stages</p>
                    <ul className="space-y-1 text-muted-foreground">
                      <li><span className="font-medium text-foreground">WK 1</span>{" — Received in Warehouse"}</li>
                      <li><span className="font-medium text-foreground">WK 2</span>{" — Received in all Metro Manila → South"}</li>
                      <li><span className="font-medium text-foreground">WK 4</span>{" — Received in all Stores incl. Vismin"}</li>
                      <li><span className="font-medium text-foreground">WK 6</span>{" — 1-month evaluation for all stores"}</li>
                      <li><span className="font-medium text-foreground">WK 12</span>{" — Final grade (≥ 60% Fast · ≤ 40% Slow)"}</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">Classification Rule</p>
                    <ul className="space-y-1 text-muted-foreground">
                      <li>
                        <Badge variant="outline" className={cn("mr-2", LIFECYCLE_CLASS_CONFIG.fast.chip)}>Fast</Badge>
                        {"Sell-through ≥ Fast threshold for that week"}
                      </li>
                      <li>
                        <Badge variant="outline" className={cn("mr-2", LIFECYCLE_CLASS_CONFIG.mid.chip)}>Mid</Badge>
                        {"Between Slow and Fast thresholds"}
                      </li>
                      <li>
                        <Badge variant="outline" className={cn("mr-2", LIFECYCLE_CLASS_CONFIG.slow.chip)}>Slow</Badge>
                        {"Sell-through ≤ Slow threshold for that week"}
                      </li>
                    </ul>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Week</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead className="text-right text-green-600">{"Fast ≥"}</TableHead>
                        <TableHead className="text-right text-red-600">{"Slow ≤"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {LIFECYCLE_THRESHOLDS.map((t) => (
                        <TableRow key={t.wk}>
                          <TableCell className="font-medium">WK {t.wk}</TableCell>
                          <TableCell className="text-muted-foreground">{t.stage || "—"}</TableCell>
                          <TableCell className="text-right text-green-600 tabular-nums">{t.fast}%</TableCell>
                          <TableCell className="text-right text-red-600 tabular-nums">{t.slow}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>

          {/* Classification pills */}
          <div className="flex flex-wrap gap-1.5">
            {(["all", "fast", "mid", "slow"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setLcClassFilter(k)}
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                  lcClassFilter === k
                    ? "bg-primary text-primary-foreground"
                    : "border hover:bg-muted",
                )}
              >
                {k === "all" ? "All" : LIFECYCLE_CLASS_CONFIG[k].label}
              </button>
            ))}
          </div>

          {/* Lifecycle table */}
          <div className="rounded-lg border bg-card">
            {lifecycleData === undefined ? (
              <div className="p-8 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : filteredLcItems.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No items match the current filters
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleLcSort("week")}>
                      Week {lcSortCol === "week" ? (lcSortDir === "asc" ? "↑" : "↓") : ""}
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => handleLcSort("received")}>
                      Received {lcSortCol === "received" ? (lcSortDir === "asc" ? "↑" : "↓") : ""}
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => handleLcSort("sold")}>
                      Sold {lcSortCol === "sold" ? (lcSortDir === "asc" ? "↑" : "↓") : ""}
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => handleLcSort("stock")}>
                      Stock {lcSortCol === "stock" ? (lcSortDir === "asc" ? "↑" : "↓") : ""}
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => handleLcSort("sellThru")}>
                      Sell-Thru {lcSortCol === "sellThru" ? (lcSortDir === "asc" ? "↑" : "↓") : ""}
                    </TableHead>
                    <TableHead>Threshold</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleLcSort("classification")}>
                      Class {lcSortCol === "classification" ? (lcSortDir === "asc" ? "↑" : "↓") : ""}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lcPagination.paginatedData.map((item) => {
                    const cfg = LIFECYCLE_CLASS_CONFIG[item.classification as LifecycleClass];
                    const receivedStr = new Date(item.firstReceivedAt).toLocaleDateString("en-PH", {
                      month: "short", day: "numeric", year: "numeric",
                    });
                    return (
                      <TableRow key={item.variantId}>
                        <TableCell>
                          <p className="font-medium">{item.styleName}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.sku} {"·"} {item.size} / {item.color}
                          </p>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{item.brandName}</TableCell>
                        <TableCell>
                          <p className="font-medium tabular-nums">WK {item.weekIndex}</p>
                          <p className="text-xs text-muted-foreground">{receivedStr}</p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{item.totalReceived}</TableCell>
                        <TableCell className="text-right tabular-nums">{item.totalSold}</TableCell>
                        <TableCell className="text-right tabular-nums">{item.currentStock}</TableCell>
                        <TableCell className={cn("text-right tabular-nums font-medium", cfg.color)}>
                          {item.sellThruPct}%
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                          <span className="text-green-600">{"≥"}{item.fastThreshold}%</span>
                          {" / "}
                          <span className="text-red-600">{"≤"}{item.slowThreshold}%</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cfg.chip}>{cfg.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {filteredLcItems.length > 0 && (
            <TablePagination
              currentPage={lcPagination.currentPage}
              totalPages={lcPagination.totalPages}
              totalItems={lcPagination.totalItems}
              hasNextPage={lcPagination.hasNextPage}
              hasPrevPage={lcPagination.hasPrevPage}
              onNextPage={lcPagination.nextPage}
              onPrevPage={lcPagination.prevPage}
            />
          )}

          {lifecycleData && (
            <p className="text-xs text-muted-foreground text-center">
              {lifecycleData.summary.total} variants in lifecycle window (12 weeks from first receipt)
            </p>
          )}
        </>
      )}

      {/* Notes Dialog */}
      <Dialog open={!!notesStyleId} onOpenChange={(open) => { if (!open) setNotesStyleId(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Notes — {notesStyleName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Existing Notes */}
            <div className="max-h-48 overflow-y-auto space-y-2">
              {styleNotes === undefined ? (
                <p className="text-xs text-muted-foreground">Loading...</p>
              ) : styleNotes.length === 0 ? (
                <p className="text-xs text-muted-foreground">No notes yet.</p>
              ) : (
                styleNotes.map((n) => (
                  <div key={String(n._id)} className="flex items-start gap-2 rounded border p-2">
                    <div className="flex-1 text-sm">
                      {n.verdict && (
                        <Badge variant="outline" className="mr-1 text-[10px] mb-1">
                          {n.verdict.replace(/_/g, " ")}
                        </Badge>
                      )}
                      <p>{n.note}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {n.authorName} — {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => handleDeleteNote(n._id as Id<"sellThruNotes">)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            {/* New Note */}
            <div className="space-y-2 border-t pt-3">
              <Label>Add Verdict</Label>
              <Select value={newVerdict} onValueChange={(v) => setNewVerdict(v as VerdictType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VERDICT_OPTIONS.map((v) => (
                    <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                placeholder="What should we do with this product?"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesStyleId(null)}>Close</Button>
            <Button onClick={handleAddNote} disabled={saving || !newNote.trim()}>
              {saving ? "Saving..." : "Add Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className ?? ""}`} />;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paged = items.slice(safePage * pageSize, (safePage + 1) * pageSize);
  return {
    paged,
    page: safePage,
    setPage,
    totalPages,
    total: items.length,
    pageSize,
  };
}

function PaginationBar({
  page,
  totalPages,
  total,
  pageSize,
  setPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  setPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);
  return (
    <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setPage(page - 1)}
          disabled={page === 0}
          className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="px-1.5">
          {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => setPage(page + 1)}
          disabled={page >= totalPages - 1}
          className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Date Preset helpers ──────────────────────────────────────────────────────

type DatePreset = "today" | "weekly" | "monthly" | "yearly";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

function getPresetMs(preset: DatePreset): { startMs: number; endMs: number; label: string } {
  const PHT = 8 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const nowPht = nowMs + PHT;
  const todayMidnightPht = nowPht - (nowPht % (24 * 60 * 60 * 1000));
  const todayStartMs = todayMidnightPht - PHT;
  if (preset === "today") return { startMs: todayStartMs, endMs: nowMs, label: "Today" };
  if (preset === "weekly") {
    const dow = new Date(nowPht).getUTCDay();
    const daysSinceMon = dow === 0 ? 6 : dow - 1;
    return { startMs: todayStartMs - daysSinceMon * 24 * 60 * 60 * 1000, endMs: nowMs, label: "This Week" };
  }
  if (preset === "monthly") {
    const d = new Date(nowPht);
    return { startMs: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - PHT, endMs: nowMs, label: "This Month" };
  }
  const d = new Date(nowPht);
  return { startMs: Date.UTC(d.getUTCFullYear(), 0, 1) - PHT, endMs: nowMs, label: "This Year" };
}

const VELOCITY_DAYS = [7, 14, 30, 60, 90] as const;

const MI_STYLES = {
  FAST_MOVING:   { badge: "bg-green-100 text-green-800 border-green-200",  label: "Fast"   },
  MEDIUM_MOVING: { badge: "bg-amber-100 text-amber-800 border-amber-200",  label: "Medium" },
  SLOW_MOVING:   { badge: "bg-red-100 text-red-800 border-red-200",        label: "Slow"   },
  NO_MOVEMENT:   { badge: "bg-gray-100 text-gray-700 border-gray-200",     label: "Dead"   },
} as const;

type MiKey = keyof typeof MI_STYLES;

const VERDICT_STYLES = {
  restock: "bg-green-100 text-green-800 border-green-200",
  lay_low: "bg-red-100 text-red-800 border-red-200",
  hold:    "bg-gray-100 text-gray-800 border-gray-200",
};
const VERDICT_LABELS = { restock: "Restock", lay_low: "Lay Low", hold: "Hold" };

type AnalyticsTab = "velocity" | "demand" | "transfers";

const ANALYTICS_TABS: { value: AnalyticsTab; label: string; description: string }[] = [
  { value: "velocity",  label: "Stock Velocity",   description: "Product movement rates"    },
  { value: "demand",    label: "Demand & Restock",  description: "Gaps and restock signals"  },
  { value: "transfers", label: "Transfers",         description: "Incoming efficiency"       },
];

// ─── VelocityTable ────────────────────────────────────────────────────────────

type VelocityItem = {
  variantId: string;
  styleName: string;
  size: string;
  color: string;
  currentStock: number;
  totalSold: number;
  ads: number;
  dsi: number;
  mi: number;
  classification: string;
};

function VelocityTable({ velocity }: { velocity: { fastMoving: VelocityItem[]; mediumMoving: VelocityItem[]; slowMoving: VelocityItem[]; noMovement: VelocityItem[] } | null }) {
  const [filter, setFilter] = useState<MiKey | "all">("all");

  const flatItems = useMemo(() => {
    if (!velocity) return [];
    const tiers: { key: string; items: VelocityItem[] }[] = [
      { key: "FAST_MOVING",   items: velocity.fastMoving   ?? [] },
      { key: "MEDIUM_MOVING", items: velocity.mediumMoving ?? [] },
      { key: "SLOW_MOVING",   items: velocity.slowMoving   ?? [] },
      { key: "NO_MOVEMENT",   items: velocity.noMovement   ?? [] },
    ];
    const all = tiers.flatMap(({ key, items }) =>
      items.map((item) => ({ ...item, _tier: key as MiKey }))
    );
    return filter === "all" ? all : all.filter((i) => i._tier === filter);
  }, [velocity, filter]);

  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(flatItems, 10);

  const filterCounts = useMemo(() => {
    if (!velocity) return {};
    return {
      FAST_MOVING:   velocity.fastMoving?.length   ?? 0,
      MEDIUM_MOVING: velocity.mediumMoving?.length ?? 0,
      SLOW_MOVING:   velocity.slowMoving?.length   ?? 0,
      NO_MOVEMENT:   velocity.noMovement?.length   ?? 0,
    };
  }, [velocity]);

  const totalCount = Object.values(filterCounts).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-3">
      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => { setFilter("all"); setPage(0); }}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            filter === "all"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted text-muted-foreground hover:border-primary/50"
          )}
        >
          All ({totalCount})
        </button>
        {(Object.keys(MI_STYLES) as MiKey[]).map((key) => {
          const s = MI_STYLES[key];
          const count = filterCounts[key] ?? 0;
          return (
            <button
              key={key}
              onClick={() => { setFilter(key); setPage(0); }}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === key
                  ? `border border-transparent ${s.badge}`
                  : "border-muted text-muted-foreground hover:border-primary/50"
              )}
            >
              {s.label} ({count})
            </button>
          );
        })}
      </div>

      {total === 0 ? (
        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          No items in this category
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Product</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Type</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Stock</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Sold</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">ADS</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">DSI</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">MI</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((item) => {
                const s = MI_STYLES[item._tier];
                return (
                  <tr key={item.variantId} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <p className="font-medium">{item.styleName}</p>
                      <p className="text-muted-foreground">{item.size} / {item.color}</p>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-xs font-medium border ${s.badge}`}>
                        {s.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{item.currentStock}</td>
                    <td className="px-3 py-2 text-right">{item.totalSold}</td>
                    <td className="px-3 py-2 text-right">{item.ads}/d</td>
                    <td className="px-3 py-2 text-right">{item.dsi >= 999 ? "∞" : `${item.dsi}d`}</td>
                    <td className="px-3 py-2 text-right">{item.mi}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <PaginationBar page={page} totalPages={totalPages} total={total} pageSize={pageSize} setPage={setPage} />
        </div>
      )}
    </div>
  );
}

// ─── RestockLayLowTable ────────────────────────────────────────────────────────

type RestockItem = {
  name: string;
  brandName: string;
  size: string;
  color: string;
  currentStock: number;
  unitsSold: number;
  daysOfStock: number;
  sellThrough: number;
  verdict: string;
};

function RestockLayLowTable({ items, summary }: { items: RestockItem[]; summary: { restockCount: number; layLowCount: number; holdCount: number } }) {
  const [filter, setFilter] = useState<"all" | "restock" | "lay_low" | "hold">("all");

  const filtered = useMemo(
    () => filter === "all" ? items : items.filter((i) => i.verdict === filter),
    [items, filter]
  );

  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(filtered, 10);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {([
          { key: "all" as const,      label: `All (${items.length})` },
          { key: "restock" as const,  label: `Restock (${summary.restockCount})` },
          { key: "lay_low" as const,  label: `Lay Low (${summary.layLowCount})` },
          { key: "hold" as const,     label: `Hold (${summary.holdCount})` },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setFilter(key); setPage(0); }}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === key
                ? key === "all"
                  ? "border-primary bg-primary text-primary-foreground"
                  : key === "restock"
                    ? "bg-green-100 text-green-800 border-green-200"
                    : key === "lay_low"
                      ? "bg-red-100 text-red-800 border-red-200"
                      : "bg-gray-100 text-gray-800 border-gray-200"
                : "border-muted text-muted-foreground hover:border-primary/50"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {total === 0 ? (
        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          No items match this filter
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Product</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Stock</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Sold</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Days Left</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">ST%</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((item, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-muted-foreground">{item.brandName} · {item.size}/{item.color}</p>
                  </td>
                  <td className="px-3 py-2 text-right">{item.currentStock}</td>
                  <td className="px-3 py-2 text-right">{item.unitsSold}</td>
                  <td className="px-3 py-2 text-right">{item.daysOfStock >= 999 ? "∞" : `${item.daysOfStock}d`}</td>
                  <td className="px-3 py-2 text-right">{item.sellThrough}%</td>
                  <td className="px-3 py-2">
                    <span className={cn(
                      "inline-flex px-1.5 py-0.5 rounded text-xs font-medium border",
                      VERDICT_STYLES[item.verdict as keyof typeof VERDICT_STYLES] ?? VERDICT_STYLES.hold
                    )}>
                      {VERDICT_LABELS[item.verdict as keyof typeof VERDICT_LABELS] ?? item.verdict}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <PaginationBar page={page} totalPages={totalPages} total={total} pageSize={pageSize} setPage={setPage} />
        </div>
      )}
    </div>
  );
}

// ─── DemandGapTable ────────────────────────────────────────────────────────────

type DemandGapItem = {
  brand: string;
  design: string;
  size: string;
  requestCount: number;
  inStock: boolean;
  currentQuantity: number;
};

function DemandGapTable({ items }: { items: DemandGapItem[] }) {
  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(items, 10);
  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Brand / Design</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Size</th>
            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Requests</th>
            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Stock</th>
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
          </tr>
        </thead>
        <tbody>
          {paged.map((gap, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="px-3 py-2">
                <p className="font-medium">{gap.brand}</p>
                {gap.design && <p className="text-xs text-muted-foreground">{gap.design}</p>}
              </td>
              <td className="px-3 py-2 text-sm text-muted-foreground">{gap.size || "—"}</td>
              <td className="px-3 py-2 text-right font-semibold">{gap.requestCount}</td>
              <td className="px-3 py-2 text-right">{gap.currentQuantity}</td>
              <td className="px-3 py-2">
                <span className={cn(
                  "inline-flex px-2 py-0.5 rounded-full text-xs font-medium",
                  gap.inStock ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                )}>
                  {gap.inStock ? "In Stock" : "Out of Stock"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <PaginationBar page={page} totalPages={totalPages} total={total} pageSize={pageSize} setPage={setPage} />
    </div>
  );
}

// ─── RestockSuggestionsTable ──────────────────────────────────────────────────

type RestockSuggestion = {
  id: string;
  styleName: string;
  size: string;
  color: string;
  currentStock: number;
  suggestedQuantity: number;
  daysUntilStockout: number;
  rationale: string;
};

function RestockSuggestionsTable({ items }: { items: RestockSuggestion[] }) {
  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(items, 10);
  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Product</th>
            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Stock</th>
            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Days Left</th>
            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Suggest Qty</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Rationale</th>
          </tr>
        </thead>
        <tbody>
          {paged.map((s) => (
            <tr key={s.id} className="border-b last:border-0">
              <td className="px-3 py-2">
                <p className="font-medium">{s.styleName}</p>
                <p className="text-xs text-muted-foreground">{s.size} / {s.color}</p>
              </td>
              <td className="px-3 py-2 text-right">{s.currentStock}</td>
              <td className="px-3 py-2 text-right">
                <span className={cn(
                  "text-xs font-medium",
                  s.daysUntilStockout <= 7 ? "text-red-600" : s.daysUntilStockout <= 14 ? "text-amber-600" : ""
                )}>
                  {s.daysUntilStockout}d
                </span>
              </td>
              <td className="px-3 py-2 text-right font-semibold">{s.suggestedQuantity}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{s.rationale}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <PaginationBar page={page} totalPages={totalPages} total={total} pageSize={pageSize} setPage={setPage} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function BranchAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("velocity");
  const [datePreset, setDatePreset] = useState<DatePreset>("weekly");
  const [velocityDays, setVelocityDays] = useState<(typeof VELOCITY_DAYS)[number]>(7);

  const { startMs, endMs, label: periodLabel } = useMemo(() => getPresetMs(datePreset), [datePreset]);

  const velocityPeriod = useMemo(() => {
    const PHT = 8 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const nowPht = nowMs + PHT;
    const todayMidnightPht = nowPht - (nowPht % (24 * 60 * 60 * 1000));
    const todayStartMs = todayMidnightPht - PHT;
    return { startMs: todayStartMs - (velocityDays - 1) * 24 * 60 * 60 * 1000, endMs: nowMs };
  }, [velocityDays]);

  const branchContext = useQuery(api.dashboards.branchDashboard.getBranchContext);

  const velocity = useQuery(
    api.dashboards.branchAnalytics.getProductVelocity,
    activeTab === "velocity" ? { startMs: velocityPeriod.startMs, endMs: velocityPeriod.endMs } : "skip"
  );
  const inventoryHealth = useQuery(
    api.dashboards.branchAnalytics.getInventoryHealth,
    activeTab === "velocity" ? {} : "skip"
  );
  const restockVsLayLow = useQuery(
    api.dashboards.comparisonAnalytics.getRestockVsLayLow,
    activeTab === "velocity" ? { startMs, endMs } : "skip"
  );
  const demandGap = useQuery(
    api.dashboards.branchAnalytics.getDemandGapAnalysis,
    activeTab === "demand" ? { startMs, endMs } : "skip"
  );
  const restockSuggestions = useQuery(
    api.dashboards.branchAnalytics.getBranchRestockSuggestions,
    activeTab === "demand" ? {} : "skip"
  );
  const transferEff = useQuery(
    api.dashboards.branchAnalytics.getTransferEfficiency,
    activeTab === "transfers" ? {} : "skip"
  );

  const todayLabel = new Date().toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (branchContext === undefined) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  if (!branchContext) {
    return <p className="text-sm text-muted-foreground">No branch context.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {branchContext.branchType === "warehouse" ? "Warehouse" : "Branch"} Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{todayLabel}</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDatePreset(p.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                datePreset === p.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ Tabs ════════════════════════════════════════════════════════════ */}
      <div className="flex gap-2">
        {ANALYTICS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "flex flex-col items-start rounded-lg border px-4 py-3 text-left transition-colors",
              activeTab === tab.value
                ? "border-primary bg-primary/5"
                : "border-muted bg-background hover:bg-muted/50"
            )}
          >
            <span className={cn("text-sm font-semibold", activeTab === tab.value ? "text-primary" : "text-foreground")}>
              {tab.label}
            </span>
            <span className="text-xs text-muted-foreground">{tab.description}</span>
          </button>
        ))}
      </div>

      {/* ═══ VELOCITY TAB ════════════════════════════════════════════════════ */}
      {activeTab === "velocity" && (
        <div className="space-y-6">
          {/* Inventory Health summary */}
          {inventoryHealth === undefined ? (
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : inventoryHealth ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Total SKUs",    value: inventoryHealth.totalSkus,        color: "text-foreground"  },
                { label: "In Stock",      value: inventoryHealth.inStockCount,     color: "text-green-600"   },
                { label: "Low Stock",     value: inventoryHealth.lowStockCount,    color: "text-amber-600"   },
                { label: "Out of Stock",  value: inventoryHealth.outOfStockCount,  color: "text-red-600"     },
              ].map((m) => (
                <div key={m.label} className="rounded-lg border bg-card p-4 text-center">
                  <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{m.label}</p>
                </div>
              ))}
            </div>
          ) : null}

          {/* Velocity period selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Window:</span>
            {VELOCITY_DAYS.map((d) => (
              <button
                key={d}
                onClick={() => setVelocityDays(d)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  velocityDays === d
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted text-muted-foreground hover:border-primary/50"
                )}
              >
                {d}d
              </button>
            ))}
          </div>

          {/* Product Velocity — unified paginated table */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Product Movement Index — last {velocityDays} days</h3>
            {velocity === undefined ? (
              <Skeleton className="h-64" />
            ) : !velocity ? (
              <p className="text-sm text-muted-foreground">No branch data.</p>
            ) : (
              <VelocityTable velocity={velocity} />
            )}
          </div>

          {/* Restock vs Lay Low */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Restock vs Lay Low — {periodLabel}</h3>
            {restockVsLayLow === undefined ? (
              <Skeleton className="h-48" />
            ) : !restockVsLayLow || restockVsLayLow.items.length === 0 ? (
              <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                No verdict data for this period
              </div>
            ) : (
              <RestockLayLowTable items={restockVsLayLow.items} summary={restockVsLayLow.summary} />
            )}
          </div>
        </div>
      )}

      {/* ═══ DEMAND TAB ══════════════════════════════════════════════════════ */}
      {activeTab === "demand" && (
        <div className="space-y-6">
          <div className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold">Demand Gap — {periodLabel}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Customer requests for items that may be out of stock or low</p>
            </div>
            {demandGap === undefined ? (
              <Skeleton className="h-48" />
            ) : !demandGap || demandGap.length === 0 ? (
              <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                No demand gap data for this period
              </div>
            ) : (
              <DemandGapTable items={demandGap} />
            )}
          </div>

          <div className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold">Active Restock Suggestions</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Sorted by days until stockout — most urgent first</p>
            </div>
            {restockSuggestions === undefined ? (
              <Skeleton className="h-48" />
            ) : !restockSuggestions || restockSuggestions.length === 0 ? (
              <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                No active restock suggestions
              </div>
            ) : (
              <RestockSuggestionsTable items={restockSuggestions} />
            )}
          </div>
        </div>
      )}

      {/* ═══ TRANSFERS TAB ═══════════════════════════════════════════════════ */}
      {activeTab === "transfers" && (
        <div className="space-y-6">
          {transferEff === undefined ? (
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : !transferEff ? (
            <p className="text-sm text-muted-foreground">No branch data.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border bg-card p-4 text-center space-y-1">
                  <p className="text-2xl font-bold">{transferEff.pendingCount}</p>
                  <p className="text-xs text-muted-foreground">Pending Transfers</p>
                </div>
                <div className="rounded-lg border bg-card p-4 text-center space-y-1">
                  <p className="text-2xl font-bold">
                    {transferEff.avgFulfillmentHours > 0 ? `${transferEff.avgFulfillmentHours}h` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">Avg Fulfillment Time</p>
                </div>
                <div className="rounded-lg border bg-card p-4 text-center space-y-1">
                  <p className="text-2xl font-bold text-green-600">{transferEff.completedCount}</p>
                  <p className="text-xs text-muted-foreground">Completed (30d)</p>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                {transferEff.isWarehouse
                  ? "Showing outgoing transfer efficiency for this warehouse."
                  : "Showing incoming transfer efficiency for this branch. Go to Transfers to view individual shipments."}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

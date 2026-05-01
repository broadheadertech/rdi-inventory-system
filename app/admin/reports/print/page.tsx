"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const PHT = 8 * 60 * 60 * 1000;
type DatePreset = "today" | "weekly" | "monthly" | "yearly";

function getPresetMs(preset: DatePreset): { startMs: number; endMs: number; label: string } {
  const nowMs = Date.now();
  const nowPht = nowMs + PHT;
  const todayMidnightPht = nowPht - (nowPht % (24 * 60 * 60 * 1000));
  const todayStartMs = todayMidnightPht - PHT;
  if (preset === "today") return { startMs: todayStartMs, endMs: nowMs, label: "Today" };
  if (preset === "weekly") {
    const dow = new Date(nowPht).getUTCDay();
    const daysSinceMon = dow === 0 ? 6 : dow - 1;
    return { startMs: todayStartMs - daysSinceMon * 86400000, endMs: nowMs, label: "This Week" };
  }
  if (preset === "monthly") {
    const d = new Date(nowPht);
    return { startMs: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - PHT, endMs: nowMs, label: "This Month" };
  }
  const d = new Date(nowPht);
  return { startMs: Date.UTC(d.getUTCFullYear(), 0, 1) - PHT, endMs: nowMs, label: "This Year" };
}

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "weekly", label: "This Week" },
  { value: "monthly", label: "This Month" },
  { value: "yearly", label: "This Year" },
];

type ReportKey =
  | "salesSummary"
  | "topProducts"
  | "salesByCategory"
  | "topBrands"
  | "topCategories"
  | "inventoryHealth"
  | "restockVsLayLow"
  | "productMovement"
  | "branchRanking";

const REPORT_OPTIONS: { key: ReportKey; label: string; description: string }[] = [
  { key: "salesSummary",    label: "Sales Summary",           description: "Revenue, transactions, items sold, avg ticket across all branches" },
  { key: "topProducts",     label: "Top Selling Products",    description: "Top products by revenue across all branches" },
  { key: "salesByCategory", label: "Sales by Category",       description: "Revenue and units per category" },
  { key: "topBrands",       label: "Top Brands",              description: "Brands ranked by units sold" },
  { key: "topCategories",   label: "Top Categories",          description: "Categories ranked by units sold" },
  { key: "inventoryHealth", label: "Inventory Health",        description: "In-stock, low-stock, out-of-stock per branch" },
  { key: "restockVsLayLow", label: "Restock vs Lay Low",      description: "Verdict per SKU — what to restock or reduce" },
  { key: "productMovement", label: "Product Movement Index",  description: "Fast, medium, slow, and dead stock" },
  { key: "branchRanking",   label: "Branch Performance Ranking", description: "Revenue rank, trend, and avg ticket per branch" },
];

// ─── Print table shared style ─────────────────────────────────────────────────

function PrintTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded border border-gray-300 print:rounded-none">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={cn("px-3 py-2 font-semibold bg-gray-100 border-b border-gray-300 text-gray-700", right ? "text-right" : "text-left")}>
      {children}
    </th>
  );
}

function Td({ children, right, muted }: { children: React.ReactNode; right?: boolean; muted?: boolean }) {
  return (
    <td className={cn("px-3 py-2 border-b border-gray-200 last:border-0", right ? "text-right" : "text-left", muted ? "text-gray-500" : "")}>
      {children}
    </td>
  );
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mt-8 mb-3 first:mt-0">
      <h2 className="text-base font-bold text-gray-900 border-b-2 border-gray-900 pb-1">{title}</h2>
      {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
    </div>
  );
}

const VERDICT_LABELS: Record<string, string> = { restock: "Restock", lay_low: "Lay Low", hold: "Hold" };

// ═══════════════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function AdminPrintReportsPage() {
  const [datePreset, setDatePreset] = useState<DatePreset>("weekly");
  const [selected, setSelected] = useState<Set<ReportKey>>(
    new Set(REPORT_OPTIONS.map((r) => r.key))
  );
  const [generated, setGenerated] = useState(false);

  const { startMs, endMs, label: periodLabel } = useMemo(() => getPresetMs(datePreset), [datePreset]);

  // All queries — only active after "Generate" is clicked
  const salesSummary = useQuery(
    api.dashboards.hqDdpAnalytics.getHQSalesSummary,
    generated && selected.has("salesSummary") ? { startMs, endMs } : "skip"
  );
  const topProducts = useQuery(
    api.dashboards.hqDdpAnalytics.getHQTopSellingProducts,
    generated && selected.has("topProducts") ? { startMs, endMs } : "skip"
  );
  const salesByCategory = useQuery(
    api.dashboards.comparisonAnalytics.getHQSalesByCategory,
    generated && selected.has("salesByCategory") ? { startMs, endMs } : "skip"
  );
  const topBrands = useQuery(
    api.dashboards.comparisonAnalytics.getHQTopBrandsComparison,
    generated && selected.has("topBrands") ? { startMs, endMs } : "skip"
  );
  const topCategories = useQuery(
    api.dashboards.comparisonAnalytics.getHQTopCategoriesComparison,
    generated && selected.has("topCategories") ? { startMs, endMs } : "skip"
  );
  const inventoryHealth = useQuery(
    api.dashboards.hqAnalytics.getHQInventoryHealth,
    generated && selected.has("inventoryHealth") ? {} : "skip"
  );
  const restockVsLayLow = useQuery(
    api.dashboards.comparisonAnalytics.getHQRestockVsLayLow,
    generated && selected.has("restockVsLayLow") ? { startMs, endMs } : "skip"
  );
  const velocity = useQuery(
    api.dashboards.hqDdpAnalytics.getHQProductVelocity,
    generated && selected.has("productMovement") ? { startMs, endMs } : "skip"
  );
  const branchRanking = useQuery(
    api.dashboards.hqIntelligence.getBranchPerformanceRanking,
    generated && selected.has("branchRanking") ? { startMs, endMs } : "skip"
  );

  function toggleReport(key: ReportKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const generatedAt = useMemo(() => {
    if (!generated) return null;
    return new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });
  }, [generated]);

  const allLoaded = generated && [
    !selected.has("salesSummary")    || salesSummary !== undefined,
    !selected.has("topProducts")     || topProducts !== undefined,
    !selected.has("salesByCategory") || salesByCategory !== undefined,
    !selected.has("topBrands")       || topBrands !== undefined,
    !selected.has("topCategories")   || topCategories !== undefined,
    !selected.has("inventoryHealth") || inventoryHealth !== undefined,
    !selected.has("restockVsLayLow") || restockVsLayLow !== undefined,
    !selected.has("productMovement") || velocity !== undefined,
    !selected.has("branchRanking")   || branchRanking !== undefined,
  ].every(Boolean);

  return (
    <div className="space-y-6">

      {/* ── Controls (hidden when printing) ─────────────────────────────── */}
      <div className="print:hidden space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Print Report</h1>
            <p className="text-sm text-muted-foreground mt-1">Select a date range and report sections, then generate and print.</p>
          </div>
          {generated && allLoaded && (
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Printer className="h-4 w-4" />
              Print Report
            </button>
          )}
        </div>

        {/* Date range */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold">Date Range</p>
          <div className="flex gap-2 flex-wrap">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => { setDatePreset(p.value); setGenerated(false); }}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-xs font-medium transition-colors",
                  datePreset === p.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted bg-background text-muted-foreground hover:border-primary/50"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Report sections */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Report Sections</p>
            <div className="flex gap-2">
              <button onClick={() => setSelected(new Set(REPORT_OPTIONS.map((r) => r.key)))} className="text-xs text-primary hover:underline">Select all</button>
              <span className="text-muted-foreground text-xs">·</span>
              <button onClick={() => setSelected(new Set())} className="text-xs text-muted-foreground hover:underline">Clear</button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {REPORT_OPTIONS.map((r) => (
              <label
                key={r.key}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                  selected.has(r.key) ? "border-primary bg-primary/5" : "border-muted hover:bg-muted/30"
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.has(r.key)}
                  onChange={() => { toggleReport(r.key); setGenerated(false); }}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <p className="text-xs font-semibold">{r.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <div className="flex gap-3">
          <button
            onClick={() => { setGenerated(false); setTimeout(() => setGenerated(true), 0); }}
            disabled={selected.size === 0}
            className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            Generate Report
          </button>
          {generated && !allLoaded && (
            <p className="text-sm text-muted-foreground self-center animate-pulse">Loading report data…</p>
          )}
        </div>
      </div>

      {/* ── Printable Report ─────────────────────────────────────────────── */}
      {generated && allLoaded && (
        <div id="print-report" className="print:p-0 space-y-0">

          {/* Cover */}
          <div className="mb-8 pb-4 border-b-2 border-gray-900">
            <h1 className="text-2xl font-bold text-gray-900">HQ Report</h1>
            <p className="text-sm text-gray-600 mt-1">
              All Branches &middot; Period: {periodLabel}
            </p>
            <p className="text-xs text-gray-400 mt-1">Generated {generatedAt} &middot; {selected.size} section{selected.size !== 1 ? "s" : ""}</p>
          </div>

          {/* ── Sales Summary ─────────────────────────────────────────── */}
          {selected.has("salesSummary") && salesSummary && (
            <section>
              <SectionHeader title="Sales Summary" description={`All-branch performance for ${periodLabel}`} />
              <div className="grid grid-cols-4 gap-4 print:gap-3">
                {[
                  { label: "Sales",        value: fmt(salesSummary.thisWeek.revenueCentavos),        prev: fmt(salesSummary.lastWeek.revenueCentavos) },
                  { label: "Transactions", value: String(salesSummary.thisWeek.transactionCount),    prev: String(salesSummary.lastWeek.transactionCount) },
                  { label: "Items Sold",   value: String(salesSummary.thisWeek.itemsSold),           prev: String(salesSummary.lastWeek.itemsSold) },
                  { label: "Avg Ticket",   value: fmt(salesSummary.thisWeek.avgTxnValueCentavos),    prev: fmt(salesSummary.lastWeek.avgTxnValueCentavos) },
                ].map((m) => (
                  <div key={m.label} className="rounded border border-gray-200 p-3 text-center">
                    <p className="text-xs text-gray-500">{m.label}</p>
                    <p className="text-lg font-bold text-gray-900">{m.value}</p>
                    <p className="text-xs text-gray-400">Prior: {m.prev}</p>
                  </div>
                ))}
              </div>
              {salesSummary.branchCount > 0 && (
                <p className="text-xs text-gray-400 mt-2">{salesSummary.branchCount} active retail branch{salesSummary.branchCount !== 1 ? "es" : ""}</p>
              )}
            </section>
          )}

          {/* ── Top Products ──────────────────────────────────────────── */}
          {selected.has("topProducts") && topProducts && topProducts.length > 0 && (
            <section>
              <SectionHeader title="Top Selling Products" description={`Top ${topProducts.length} by revenue — ${periodLabel}`} />
              <PrintTable>
                <thead>
                  <tr><Th>#</Th><Th>Product</Th><Th>Size</Th><Th>Color</Th><Th right>Units Sold</Th><Th right>Sales</Th></tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={p.variantId}>
                      <Td muted>{i + 1}</Td>
                      <Td>{p.styleName}</Td>
                      <Td muted>{p.size}</Td>
                      <Td muted>{p.color}</Td>
                      <Td right>{p.totalQuantity}</Td>
                      <Td right>{fmt(p.totalRevenueCentavos)}</Td>
                    </tr>
                  ))}
                </tbody>
              </PrintTable>
            </section>
          )}

          {/* ── Sales by Category ────────────────────────────────────── */}
          {selected.has("salesByCategory") && salesByCategory && salesByCategory.length > 0 && (
            <section>
              <SectionHeader title="Sales by Category" description={`Category breakdown — ${periodLabel}`} />
              <PrintTable>
                <thead>
                  <tr><Th>#</Th><Th>Category</Th><Th right>Units Sold</Th><Th right>Sales</Th><Th right>Share</Th></tr>
                </thead>
                <tbody>
                  {salesByCategory.map((c, i) => (
                    <tr key={c.categoryId}>
                      <Td muted>{i + 1}</Td>
                      <Td>{c.name}</Td>
                      <Td right>{c.unitsSold}</Td>
                      <Td right>{fmt(c.revenueCentavos)}</Td>
                      <Td right>{c.percentage}%</Td>
                    </tr>
                  ))}
                </tbody>
              </PrintTable>
            </section>
          )}

          {/* ── Top Brands ───────────────────────────────────────────── */}
          {selected.has("topBrands") && topBrands && topBrands.length > 0 && (
            <section>
              <SectionHeader title="Top Brands" description={`Brands ranked by units sold — ${periodLabel}`} />
              <PrintTable>
                <thead>
                  <tr><Th>#</Th><Th>Brand</Th><Th right>Units Sold</Th><Th right>Sales</Th><Th right>Unit Share</Th><Th right>Rev. Share</Th></tr>
                </thead>
                <tbody>
                  {topBrands.map((b, i) => (
                    <tr key={b.brandId}>
                      <Td muted>{i + 1}</Td>
                      <Td>{b.name}</Td>
                      <Td right>{b.unitsSold}</Td>
                      <Td right>{fmt(b.revenueCentavos)}</Td>
                      <Td right>{b.percentUnits}%</Td>
                      <Td right>{b.percentRevenue}%</Td>
                    </tr>
                  ))}
                </tbody>
              </PrintTable>
            </section>
          )}

          {/* ── Top Categories ────────────────────────────────────────── */}
          {selected.has("topCategories") && topCategories && topCategories.length > 0 && (
            <section>
              <SectionHeader title="Top Categories" description={`Categories ranked by units sold — ${periodLabel}`} />
              <PrintTable>
                <thead>
                  <tr><Th>#</Th><Th>Category</Th><Th right>Units Sold</Th><Th right>Sales</Th><Th right>Unit Share</Th><Th right>Rev. Share</Th></tr>
                </thead>
                <tbody>
                  {topCategories.map((c, i) => (
                    <tr key={c.categoryId}>
                      <Td muted>{i + 1}</Td>
                      <Td>{c.name}</Td>
                      <Td right>{c.unitsSold}</Td>
                      <Td right>{fmt(c.revenueCentavos)}</Td>
                      <Td right>{c.percentUnits}%</Td>
                      <Td right>{c.percentRevenue}%</Td>
                    </tr>
                  ))}
                </tbody>
              </PrintTable>
            </section>
          )}

          {/* ── Inventory Health ──────────────────────────────────────── */}
          {selected.has("inventoryHealth") && inventoryHealth && (
            <section>
              <SectionHeader title="Inventory Health" description="Current stock snapshot across all branches" />
              <div className="grid grid-cols-4 gap-4 mb-4">
                {[
                  { label: "Total SKUs",    value: inventoryHealth.totals.totalSkus,    color: "text-gray-900" },
                  { label: "Healthy",       value: inventoryHealth.totals.healthy,       color: "text-green-700" },
                  { label: "Low Stock",     value: inventoryHealth.totals.lowStock,      color: "text-amber-700" },
                  { label: "Out of Stock",  value: inventoryHealth.totals.outOfStock,    color: "text-red-700" },
                ].map((m) => (
                  <div key={m.label} className="rounded border border-gray-200 p-3 text-center">
                    <p className={cn("text-lg font-bold", m.color)}>{m.value}</p>
                    <p className="text-xs text-gray-500">{m.label}</p>
                  </div>
                ))}
              </div>
              {inventoryHealth.byBranch.length > 0 && (
                <PrintTable>
                  <thead>
                    <tr><Th>Branch</Th><Th right>Total SKUs</Th><Th right>Healthy</Th><Th right>Low Stock</Th><Th right>Out of Stock</Th><Th right>Health Score</Th></tr>
                  </thead>
                  <tbody>
                    {inventoryHealth.byBranch.map((b) => (
                      <tr key={b.branchId}>
                        <Td>{b.branchName}</Td>
                        <Td right>{b.totalSkus}</Td>
                        <Td right>{b.healthy}</Td>
                        <Td right>{b.lowStock}</Td>
                        <Td right>{b.outOfStock}</Td>
                        <Td right>{b.healthScore}%</Td>
                      </tr>
                    ))}
                  </tbody>
                </PrintTable>
              )}
            </section>
          )}

          {/* ── Restock vs Lay Low ────────────────────────────────────── */}
          {selected.has("restockVsLayLow") && restockVsLayLow && restockVsLayLow.items.length > 0 && (
            <section>
              <SectionHeader
                title="Restock vs Lay Low"
                description={`${restockVsLayLow.summary.restockCount} restock · ${restockVsLayLow.summary.layLowCount} lay low · ${restockVsLayLow.summary.holdCount} hold — ${periodLabel}`}
              />
              <PrintTable>
                <thead>
                  <tr>
                    <Th>Product</Th><Th>Brand</Th><Th>Category</Th>
                    <Th right>Stock</Th><Th right>Sold</Th><Th right>Velocity</Th>
                    <Th right>Days Left</Th><Th right>Sell-Through</Th><Th>Verdict</Th>
                  </tr>
                </thead>
                <tbody>
                  {restockVsLayLow.items.map((item, i) => (
                    <tr key={i}>
                      <Td>
                        <span className="font-medium">{item.name}</span>
                        <span className="text-gray-400 ml-1">{item.size}/{item.color}</span>
                      </Td>
                      <Td muted>{item.brandName}</Td>
                      <Td muted>{item.categoryName}</Td>
                      <Td right>{item.currentStock}</Td>
                      <Td right>{item.unitsSold}</Td>
                      <Td right>{item.velocity}/d</Td>
                      <Td right>{item.daysOfStock >= 999 ? "∞" : `${item.daysOfStock}d`}</Td>
                      <Td right>{item.sellThrough}%</Td>
                      <Td>
                        <span className={cn(
                          "inline-flex px-1.5 py-0.5 rounded text-xs font-medium",
                          item.verdict === "restock" ? "bg-green-100 text-green-800" :
                          item.verdict === "lay_low" ? "bg-red-100 text-red-800" :
                          "bg-gray-100 text-gray-700"
                        )}>
                          {VERDICT_LABELS[item.verdict]}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </PrintTable>
            </section>
          )}

          {/* ── Product Movement Index ────────────────────────────────── */}
          {selected.has("productMovement") && velocity && (
            <section>
              <SectionHeader title="Product Movement Index" description="Fast / Medium / Slow / Dead stock classification" />
              {(["fastMoving", "mediumMoving", "slowMoving", "noMovement"] as const).map((tier) => {
                const items = velocity[tier] ?? [];
                const labels: Record<string, string> = {
                  fastMoving:   "Fast Moving (MI ≥ 0.30)",
                  mediumMoving: "Medium Moving (MI 0.10–0.29)",
                  slowMoving:   "Slow Moving (MI < 0.10)",
                  noMovement:   "No Movement",
                };
                if (items.length === 0) return null;
                return (
                  <div key={tier} className="mb-4">
                    <p className="text-xs font-semibold text-gray-600 mb-1">{labels[tier]} — {items.length} SKU{items.length !== 1 ? "s" : ""}</p>
                    <PrintTable>
                      <thead>
                        <tr><Th>Product</Th><Th>Size</Th><Th>Color</Th><Th right>ADS</Th><Th right>DSI</Th><Th right>MI</Th><Th right>Stock</Th></tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.variantId}>
                            <Td>{item.styleName}</Td>
                            <Td muted>{item.size}</Td>
                            <Td muted>{item.color}</Td>
                            <Td right>{item.ads}/d</Td>
                            <Td right>{item.dsi}d</Td>
                            <Td right>{item.mi}</Td>
                            <Td right>{item.currentStock}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </PrintTable>
                  </div>
                );
              })}
            </section>
          )}

          {/* ── Branch Performance Ranking ────────────────────────────── */}
          {selected.has("branchRanking") && branchRanking && branchRanking.length > 0 && (
            <section>
              <SectionHeader title="Branch Performance Ranking" description={`Branches ranked by revenue — ${periodLabel}`} />
              <PrintTable>
                <thead>
                  <tr>
                    <Th>#</Th><Th>Branch</Th>
                    <Th right>Sales</Th><Th right>Prior Sales</Th>
                    <Th right>Transactions</Th><Th right>Avg Ticket</Th><Th>Trend</Th>
                  </tr>
                </thead>
                <tbody>
                  {branchRanking.map((b) => (
                    <tr key={b.branchId}>
                      <Td muted>{b.rank}</Td>
                      <Td>{b.branchName}</Td>
                      <Td right>{fmt(b.revenueCentavos)}</Td>
                      <Td right muted>{fmt(b.previousRevenueCentavos)}</Td>
                      <Td right>{b.transactionCount}</Td>
                      <Td right>{fmt(b.avgTicketCentavos)}</Td>
                      <Td>
                        <span className={cn(
                          "inline-flex px-1.5 py-0.5 rounded text-xs font-medium",
                          b.revenueTrend === "up"   ? "bg-green-100 text-green-800" :
                          b.revenueTrend === "down" ? "bg-red-100 text-red-800" :
                          "bg-gray-100 text-gray-700"
                        )}>
                          {b.revenueTrend === "up" ? "↑ Up" : b.revenueTrend === "down" ? "↓ Down" : "→ Flat"}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </PrintTable>
            </section>
          )}

          {/* Footer */}
          <div className="mt-10 pt-4 border-t border-gray-300 text-xs text-gray-400 print:mt-6">
            Redbox Apparel &middot; HQ &middot; {generatedAt}
          </div>
        </div>
      )}
    </div>
  );
}

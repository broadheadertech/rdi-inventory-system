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

/** reportsV2 filters on YYYYMMDD in PHT; this page tracks epoch ms. */
function toYmdPht(ms: number): string {
  const d = new Date(ms + PHT);
  return (
    `${d.getUTCFullYear()}` +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0")
  );
}

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "weekly", label: "This Week" },
  { value: "monthly", label: "This Month" },
  { value: "yearly", label: "This Year" },
];

type ReportKey =
  | "itemPerformance"
  | "storePerformance"
  | "promotions"
  | "inventoryHealth"
  | "restockVsLayLow"
  | "productMovement"
  | "topSellers"
  | "transferEfficiency";

const REPORT_OPTIONS: { key: ReportKey; label: string; description: string }[] = [
  { key: "itemPerformance",     label: "Item Performance",       description: "Sales, units and stock on hand per SKU" },
  { key: "storePerformance",    label: "Store Performance",      description: "This store's sales and units for the period" },
  { key: "promotions",          label: "Promotion Contributions", description: "Sales and share of total per promotion" },
  { key: "inventoryHealth",     label: "Inventory Health",       description: "In-stock, low-stock, out-of-stock snapshot" },
  { key: "restockVsLayLow",     label: "Restock vs Lay Low",     description: "Verdict per SKU — what to restock or reduce" },
  { key: "productMovement",     label: "Product Movement Index", description: "Fast, medium, slow, and dead stock" },
  { key: "topSellers",          label: "Top Sellers",            description: "Most sold products for the period" },
  { key: "transferEfficiency",  label: "Transfer Efficiency",    description: "Fulfillment speed and pending volumes" },
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

export default function BranchReportsPage() {
  const [datePreset, setDatePreset] = useState<DatePreset>("weekly");
  const [selected, setSelected] = useState<Set<ReportKey>>(
    new Set(REPORT_OPTIONS.map((r) => r.key))
  );
  const [generated, setGenerated] = useState(false);

  const { startMs, endMs, label: periodLabel } = useMemo(() => getPresetMs(datePreset), [datePreset]);

  const branchCtx = useQuery(api.dashboards.branchDashboard.getBranchContext);

  // reportsV2 is branch-scoped server-side: a manager always gets their own
  // store regardless of what these filter args say.
  const perfArgs = useMemo(
    () => ({ dateStart: toYmdPht(startMs), dateEnd: toYmdPht(endMs) }),
    [startMs, endMs]
  );

  // All queries — only active after "Generate" is clicked
  const itemPerformance = useQuery(
    api.dashboards.reportsV2.getPerformanceByDimension,
    generated && selected.has("itemPerformance")
      ? { ...perfArgs, dimension: "sku" as const }
      : "skip"
  );
  const storePerformance = useQuery(
    api.dashboards.reportsV2.getPerformanceByDimension,
    generated && selected.has("storePerformance")
      ? { ...perfArgs, dimension: "store" as const }
      : "skip"
  );
  const promotions = useQuery(
    api.dashboards.reportsV2.getPromotionContributions,
    generated && selected.has("promotions") ? perfArgs : "skip"
  );
  const inventoryHealth = useQuery(
    api.dashboards.branchAnalytics.getInventoryHealth,
    generated && selected.has("inventoryHealth") ? {} : "skip"
  );
  const restockVsLayLow = useQuery(
    api.dashboards.comparisonAnalytics.getRestockVsLayLow,
    generated && selected.has("restockVsLayLow") ? { startMs, endMs } : "skip"
  );
  const velocity = useQuery(
    api.dashboards.branchAnalytics.getProductVelocity,
    generated && selected.has("productMovement") ? { startMs, endMs } : "skip"
  );
  const topSellers = useQuery(
    api.dashboards.branchAnalytics.getTopSellingProducts,
    generated && selected.has("topSellers") ? { startMs, endMs } : "skip"
  );
  const transferEff = useQuery(
    api.dashboards.branchAnalytics.getTransferEfficiency,
    generated && selected.has("transferEfficiency") ? {} : "skip"
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
    !selected.has("itemPerformance") || itemPerformance !== undefined,
    !selected.has("storePerformance") || storePerformance !== undefined,
    !selected.has("promotions") || promotions !== undefined,
    !selected.has("inventoryHealth") || inventoryHealth !== undefined,
    !selected.has("restockVsLayLow") || restockVsLayLow !== undefined,
    !selected.has("productMovement") || velocity !== undefined,
    !selected.has("topSellers") || topSellers !== undefined,
    !selected.has("transferEfficiency") || transferEff !== undefined,
  ].every(Boolean);

  return (
    <div className="space-y-6">

      {/* ── Controls (hidden when printing) ─────────────────────────────── */}
      <div className="print:hidden space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
            <p className="text-sm text-muted-foreground mt-1">Select a date range and reports, then generate and print.</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
            <h1 className="text-2xl font-bold text-gray-900">Branch Report</h1>
            <p className="text-sm text-gray-600 mt-1">
              {branchCtx?.branchName ?? "Branch"} &middot; Period: {periodLabel}
            </p>
            <p className="text-xs text-gray-400 mt-1">Generated {generatedAt} &middot; {selected.size} section{selected.size !== 1 ? "s" : ""}</p>
          </div>

          {/* ── Store Performance ─────────────────────────────────────── */}
          {selected.has("storePerformance") && storePerformance && storePerformance.length > 0 && (
            <section>
              <SectionHeader
                title="Store Performance"
                description={`Sales and units for this store — ${periodLabel}`}
              />
              <PrintTable>
                <thead>
                  <tr><Th>Store</Th><Th right>Sales</Th><Th right>Units Sold</Th><Th right>Avg / Unit</Th></tr>
                </thead>
                <tbody>
                  {storePerformance.map((row) => (
                    <tr key={row.key}>
                      <Td>{row.label}</Td>
                      <Td right>{fmt(row.revenueCentavos)}</Td>
                      <Td right>{row.unitsSold.toLocaleString("en-PH")}</Td>
                      <Td right muted>
                        {row.unitsSold > 0 ? fmt(Math.round(row.revenueCentavos / row.unitsSold)) : "—"}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </PrintTable>
            </section>
          )}

          {/* ── Item Performance ──────────────────────────────────────── */}
          {selected.has("itemPerformance") && itemPerformance && itemPerformance.length > 0 && (
            <section>
              <SectionHeader
                title="Item Performance"
                description={`Sales, units and stock on hand per SKU — ${periodLabel}`}
              />
              {(() => {
                const totalRevenue = itemPerformance.reduce((sum, r) => sum + r.revenueCentavos, 0);
                return (
                  <PrintTable>
                    <thead>
                      <tr>
                        <Th>#</Th><Th>SKU</Th><Th right>Sales</Th><Th right>Units Sold</Th>
                        <Th right>% of Sales</Th><Th right>SOH</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemPerformance.map((row, i) => (
                        <tr key={row.key}>
                          <Td muted>{i + 1}</Td>
                          <Td>{row.label}</Td>
                          <Td right>{fmt(row.revenueCentavos)}</Td>
                          <Td right>{row.unitsSold.toLocaleString("en-PH")}</Td>
                          <Td right muted>
                            {totalRevenue > 0
                              ? `${((row.revenueCentavos / totalRevenue) * 100).toFixed(1)}%`
                              : "—"}
                          </Td>
                          <Td right muted>
                            {row.currentSohUnits !== undefined ? row.currentSohUnits.toLocaleString("en-PH") : "—"}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </PrintTable>
                );
              })()}
            </section>
          )}

          {/* ── Promotion Contributions ───────────────────────────────── */}
          {selected.has("promotions") && promotions && (
            <section>
              <SectionHeader
                title="Promotion Contributions"
                description={`Sales driven by each promotion — ${periodLabel}`}
              />
              {promotions.promotions.length === 0 ? (
                <p className="text-xs text-gray-500">
                  No promotions ran in this period.
                </p>
              ) : (
                <PrintTable>
                  <thead>
                    <tr>
                      <Th>Promotion</Th><Th right>Sales</Th>
                      <Th right>% of Store Sales</Th><Th right>Redemptions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {promotions.promotions.map((p) => (
                      <tr key={p.promotionId}>
                        <Td>{p.offer}</Td>
                        <Td right>{fmt(p.salesCentavos)}</Td>
                        <Td right muted>{p.sharePercent.toFixed(1)}%</Td>
                        <Td right>{p.redemptions.toLocaleString("en-PH")}</Td>
                      </tr>
                    ))}
                    <tr>
                      <Td><span className="font-semibold">Total promoted</span></Td>
                      <Td right>
                        <span className="font-semibold">
                          {fmt(promotions.promotions.reduce((sum, p) => sum + p.salesCentavos, 0))}
                        </span>
                      </Td>
                      <Td right muted>
                        {promotions.totalSalesCentavos > 0
                          ? `${(
                              (promotions.promotions.reduce((sum, p) => sum + p.salesCentavos, 0) /
                                promotions.totalSalesCentavos) *
                              100
                            ).toFixed(1)}%`
                          : "—"}
                      </Td>
                      <Td right muted>
                        {promotions.promotions.reduce((sum, p) => sum + p.redemptions, 0).toLocaleString("en-PH")}
                      </Td>
                    </tr>
                  </tbody>
                </PrintTable>
              )}
            </section>
          )}

          {/* ── Top Sellers ───────────────────────────────────────────── */}
          {selected.has("topSellers") && topSellers && topSellers.length > 0 && (
            <section>
              <SectionHeader title="Top Sellers" description={`Most sold products — ${periodLabel}`} />
              <PrintTable>
                <thead>
                  <tr><Th>#</Th><Th>Product</Th><Th>Size</Th><Th>Color</Th><Th right>Units Sold</Th></tr>
                </thead>
                <tbody>
                  {topSellers.map((p, i) => (
                    <tr key={p.variantId}>
                      <Td muted>{i + 1}</Td>
                      <Td>{p.styleName}</Td>
                      <Td muted>{p.size}</Td>
                      <Td muted>{p.color}</Td>
                      <Td right>{p.totalQuantity}</Td>
                    </tr>
                  ))}
                </tbody>
              </PrintTable>
            </section>
          )}

          {/* ── Inventory Health ──────────────────────────────────────── */}
          {selected.has("inventoryHealth") && inventoryHealth && (
            <section>
              <SectionHeader title="Inventory Health" description="Current stock snapshot" />
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: "Total SKUs", value: inventoryHealth.totalSkus, color: "text-gray-900" },
                  { label: "In Stock", value: inventoryHealth.inStockCount, color: "text-green-700" },
                  { label: "Low Stock", value: inventoryHealth.lowStockCount, color: "text-amber-700" },
                  { label: "Out of Stock", value: inventoryHealth.outOfStockCount, color: "text-red-700" },
                ].map((m) => (
                  <div key={m.label} className="rounded border border-gray-200 p-3 text-center">
                    <p className="text-lg font-bold">{m.value}</p>
                    <p className="text-xs text-gray-500">{m.label}</p>
                  </div>
                ))}
              </div>
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
                const labels: Record<string, string> = { fastMoving: "Fast Moving (MI ≥ 0.30)", mediumMoving: "Medium Moving (MI 0.10–0.29)", slowMoving: "Slow Moving (MI < 0.10)", noMovement: "No Movement" };
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

          {/* ── Transfer Efficiency ───────────────────────────────────── */}
          {selected.has("transferEfficiency") && transferEff && (
            <section>
              <SectionHeader title="Transfer Efficiency" description="Fulfillment speed and pending volumes (last 30 days)" />
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Pending Transfers", value: String(transferEff.pendingCount), color: "text-gray-900" },
                  { label: "Avg Fulfillment", value: transferEff.avgFulfillmentHours > 0 ? `${transferEff.avgFulfillmentHours}h` : "—", color: "text-gray-900" },
                  { label: "Completed (30d)", value: String(transferEff.completedCount), color: "text-green-700" },
                ].map((m) => (
                  <div key={m.label} className="rounded border border-gray-200 p-3 text-center">
                    <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
                    <p className="text-xs text-gray-500">{m.label}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Footer */}
          <div className="mt-10 pt-4 border-t border-gray-300 text-xs text-gray-400 print:mt-6">
            Redbox Apparel &middot; {branchCtx?.branchName} &middot; {generatedAt}
          </div>
        </div>
      )}
    </div>
  );
}

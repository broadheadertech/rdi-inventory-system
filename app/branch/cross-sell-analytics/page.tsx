"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Sparkles } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function dateRange(days: number) {
  const end = Date.now();
  const start = end - days * 86_400_000;
  return { startDate: start, endDate: end };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BranchCrossSellAnalyticsPage() {
  const [presetDays, setPresetDays] = useState(30);
  const { startDate, endDate } = useMemo(() => dateRange(presetDays), [presetDays]);

  // No branchId arg — backend auto-scopes to current user's branch
  const stats = useQuery(api.analytics.crossSellAnalytics.getCrossSellAnalytics, {
    startDate,
    endDate,
  });

  const loading = stats === undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-amber-500" />
            <h1 className="text-2xl font-bold">Cross-Sell Analytics</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            How often your cashiers add &ldquo;Frequently Bought Together&rdquo; suggestions.
          </p>
        </div>

        {/* Date preset */}
        <div className="flex rounded border overflow-hidden">
          {PRESETS.map((p) => (
            <button
              key={p.days}
              onClick={() => setPresetDays(p.days)}
              className={`px-3 py-1.5 text-sm transition-colors ${
                presetDays === p.days
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Total Accepted"
          value={loading ? "—" : stats.totalAccepted.toLocaleString()}
          sub="suggestions added to cart"
        />
        <KpiCard
          label="Sales from Cross-Sell"
          value={loading ? "—" : formatCurrency(stats?.totalRevenueCentavos ?? 0)}
          sub="cumulative item value"
        />
        <KpiCard
          label="Unique Items Suggested"
          value={loading ? "—" : (stats?.uniqueSuggestions ?? 0).toLocaleString()}
          sub="distinct products accepted"
        />
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top accepted */}
        <div className="rounded-lg border">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold text-sm">Top Accepted Suggestions</h2>
            <p className="text-xs text-muted-foreground">Most frequently added via the strip</p>
          </div>
          {loading ? (
            <SkeletonRows />
          ) : (stats?.topSuggestions ?? []).length === 0 ? (
            <EmptyState />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Product</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Times</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Sales</th>
                </tr>
              </thead>
              <tbody>
                {stats!.topSuggestions.map((s, i) => (
                  <tr key={s.variantId} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{s.styleName}</p>
                      <p className="text-xs text-muted-foreground">{s.size} · {s.color}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold">{s.acceptedCount}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {formatCurrency(s.revenueCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Top pairs */}
        <div className="rounded-lg border">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold text-sm">Top Product Pairs</h2>
            <p className="text-xs text-muted-foreground">Cart item → accepted suggestion</p>
          </div>
          {loading ? (
            <SkeletonRows />
          ) : (stats?.topPairs ?? []).length === 0 ? (
            <EmptyState />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Bought With →</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Suggested</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Count</th>
                </tr>
              </thead>
              <tbody>
                {stats!.topPairs.map((p, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{p.triggerName}</p>
                      <p className="text-xs text-muted-foreground">{p.triggerVariant}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{p.suggestedName}</p>
                      <p className="text-xs text-muted-foreground">{p.suggestedVariant}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold">{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="p-4 space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
      <Sparkles className="h-8 w-8 opacity-20" />
      <p>No cross-sell events yet in this period.</p>
    </div>
  );
}

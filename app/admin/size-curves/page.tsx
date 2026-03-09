"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Ruler } from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted ${className ?? ""}`}
    />
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SizeCurvesPage() {
  const data = useQuery(api.inventory.sizeCurveAlerts.getSizeCurveAnalysis);

  // Loading
  if (data === undefined) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Ruler className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Size Curve Alerts</h1>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const { alerts } = data;

  // Empty state
  if (alerts.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Ruler className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Size Curve Alerts</h1>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Ruler className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-lg font-medium text-muted-foreground">
            No size imbalances detected
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            All sizes are well-balanced relative to their sales distribution.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Ruler className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Size Curve Alerts</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Sizes that represent &gt;40% of sales but &lt;20% of current stock.
        Consider adjusting reorder distributions.
      </p>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Style
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Brand
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Size
              </th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                Sales %
              </th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                Stock %
              </th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                Gap
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Recommendation
              </th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert, i) => {
              const gap = alert.imbalanceScore;
              const gapColor =
                gap > 20
                  ? "text-red-600 dark:text-red-400"
                  : gap > 10
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground";

              return (
                <tr
                  key={`${alert.styleId}-${alert.size}`}
                  className={
                    i % 2 === 0
                      ? "bg-background"
                      : "bg-muted/30"
                  }
                >
                  <td className="px-4 py-3 font-medium">{alert.styleName}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {alert.brandName}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {alert.size}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {alert.salesPercent}%
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {alert.stockPercent}%
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums font-semibold ${gapColor}`}>
                    +{gap}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {alert.recommendation}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

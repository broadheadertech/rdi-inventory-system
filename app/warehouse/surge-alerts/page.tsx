"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { TrendingUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SurgeAlertsPage() {
  const surgeAlerts = useQuery(
    api.inventory.surgeDetection.getSurgeAlerts
  );

  if (surgeAlerts === undefined) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Surge Detection</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Products with unusual demand spikes (2x+ velocity increase)
        </p>
      </div>

      {surgeAlerts.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground opacity-30 mb-3" />
          <p className="text-muted-foreground">No surge alerts detected</p>
          <p className="text-sm text-muted-foreground mt-1">
            No products currently have 2x+ sales velocity increases
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-4 py-3">
            <p className="text-sm font-medium">
              {surgeAlerts.length} product{surgeAlerts.length !== 1 ? "s" : ""}{" "}
              surging
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-3">Style</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Size / Color</th>
                  <th className="px-4 py-3 text-right">This Week</th>
                  <th className="px-4 py-3 text-right">Last Week</th>
                  <th className="px-4 py-3 text-right">Surge</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-right">Days Left</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {surgeAlerts.map((item) => (
                  <tr
                    key={item.variantId}
                    className="hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{item.styleName}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.brandName}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {item.sku}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {item.size} / {item.color}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {item.currentWeekSales}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {item.priorWeekSales}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          item.velocityMultiplier > 5
                            ? "bg-red-500/10 text-red-500"
                            : item.velocityMultiplier > 3
                              ? "bg-amber-500/10 text-amber-500"
                              : "bg-yellow-500/10 text-yellow-500"
                        )}
                      >
                        {item.velocityMultiplier}x
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {item.totalStock}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          item.daysOfStockLeft < 3
                            ? "bg-red-500/10 text-red-500"
                            : item.daysOfStockLeft < 7
                              ? "bg-amber-500/10 text-amber-500"
                              : "text-muted-foreground"
                        )}
                      >
                        {item.daysOfStockLeft >= 9999
                          ? "N/A"
                          : `${item.daysOfStockLeft}d`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

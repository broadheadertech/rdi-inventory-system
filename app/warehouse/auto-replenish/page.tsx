"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AutoReplenishPage() {
  const suggestions = useQuery(
    api.inventory.autoReplenish.getReplenishmentSuggestions
  );

  if (suggestions === undefined) {
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
          <RefreshCw className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Auto-Replenishment</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Suggested reorder quantities for low-stock items
        </p>
      </div>

      {suggestions.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <RefreshCw className="mx-auto h-12 w-12 text-muted-foreground opacity-30 mb-3" />
          <p className="text-muted-foreground">
            No replenishment suggestions
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            All items are sufficiently stocked or covered by incoming transfers
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-4 py-3">
            <p className="text-sm font-medium">
              {suggestions.length} item{suggestions.length !== 1 ? "s" : ""}{" "}
              need replenishment
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Style</th>
                  <th className="px-4 py-3">Size / Color</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-right">Threshold</th>
                  <th className="px-4 py-3 text-right">Incoming</th>
                  <th className="px-4 py-3 text-right">Suggested Reorder</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {suggestions.map((item) => (
                  <tr
                    key={`${item.variantId}-${item.branchId}`}
                    className="hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      {item.sku}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{item.styleName}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.brandName}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {item.size} / {item.color}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {item.branchName}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          item.currentStock === 0
                            ? "bg-red-500/10 text-red-500"
                            : item.currentStock <= item.threshold
                              ? "bg-amber-500/10 text-amber-500"
                              : ""
                        )}
                      >
                        {item.currentStock}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {item.threshold}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {item.incomingStock}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-bold text-blue-500">
                        +{item.suggestedReorder}
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

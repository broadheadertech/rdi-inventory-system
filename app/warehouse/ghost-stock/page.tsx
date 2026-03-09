"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Ghost, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function GhostStockPage() {
  const ghostStock = useQuery(api.inventory.ghostStock.getGhostStock);

  if (ghostStock === undefined) {
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
          <Ghost className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Ghost Stock Detector</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Items with stock that haven&apos;t sold in 14+ days
        </p>
      </div>

      {ghostStock.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Ghost className="mx-auto h-12 w-12 text-muted-foreground opacity-30 mb-3" />
          <p className="text-muted-foreground">No ghost stock detected</p>
          <p className="text-sm text-muted-foreground mt-1">
            All stocked items have sold within the last 14 days
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-4 py-3">
            <p className="text-sm font-medium">
              {ghostStock.length} item{ghostStock.length !== 1 ? "s" : ""} flagged
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
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Days Since Sale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ghostStock.map((item) => (
                  <tr
                    key={`${item.variantId}-${item.branchName}`}
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
                      {item.quantity}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          item.daysSinceLastSale >= 9999
                            ? "bg-red-500/10 text-red-500"
                            : item.daysSinceLastSale >= 30
                              ? "bg-amber-500/10 text-amber-500"
                              : "bg-yellow-500/10 text-yellow-500"
                        )}
                      >
                        {item.daysSinceLastSale >= 9999
                          ? "Never"
                          : `${item.daysSinceLastSale}d`}
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

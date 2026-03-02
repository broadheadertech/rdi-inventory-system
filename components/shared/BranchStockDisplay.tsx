"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface BranchStockDisplayProps {
  styleId: Id<"styles">;
  selectedVariantId?: Id<"variants"> | null;
  onReserve?: (branchId: Id<"branches">, branchName: string) => void;
}

function getStockStatus(quantity: number, threshold: number) {
  if (quantity === 0)
    return { label: "Out of Stock", className: "text-red-600 bg-red-500/10" };
  if (quantity <= threshold)
    return { label: "Low Stock", className: "text-amber-600 bg-amber-500/10" };
  return { label: "In Stock", className: "text-green-600 bg-green-500/10" };
}

export function BranchStockDisplay({
  styleId,
  selectedVariantId,
  onReserve,
}: BranchStockDisplayProps) {
  const branchStock = useQuery(
    api.catalog.publicBrowse.getAllBranchStockForStylePublic,
    { styleId }
  );

  // Loading
  if (branchStock === undefined) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-medium">Branch Availability</h2>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg border p-3"
          >
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (branchStock.length === 0) {
    return (
      <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
        No stock information available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium">Branch Availability</h2>
      <ul className="space-y-2" aria-label="Branch stock availability">
        {branchStock.map((branch) => {
          // Compute stock for this branch
          let quantity: number;
          let threshold: number;

          if (selectedVariantId) {
            // Show stock for specific variant
            const match = branch.variants.find(
              (v) => v.variantId === selectedVariantId
            );
            quantity = match?.quantity ?? 0;
            threshold = match?.lowStockThreshold ?? 5;
          } else {
            // Aggregate: sum of all variant stock for this branch
            quantity = branch.variants.reduce(
              (sum, v) => sum + v.quantity,
              0
            );
            // Sum thresholds to match summed quantities
            threshold = branch.variants.length > 0
              ? branch.variants.reduce((sum, v) => sum + v.lowStockThreshold, 0)
              : 5;
          }

          const status = getStockStatus(quantity, threshold);

          return (
            <li
              key={branch.branchId}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{branch.branchName}</span>
              </div>
              <div className="flex items-center gap-2">
                {quantity > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {quantity}
                  </span>
                )}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    status.className
                  )}
                  aria-label={`${branch.branchName}: ${status.label}${quantity > 0 ? `, ${quantity} in stock` : ""}`}
                >
                  {status.label}
                </span>
                {onReserve && selectedVariantId && quantity > 0 && (
                  <button
                    type="button"
                    onClick={() => onReserve(branch.branchId as Id<"branches">, branch.branchName)}
                    className="min-h-[44px] rounded-md border px-3 text-sm font-medium text-primary hover:bg-primary/5"
                  >
                    Reserve at {branch.branchName}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

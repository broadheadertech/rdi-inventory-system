"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StatusPill } from "@/components/inventory/StatusPill";
import { Store } from "lucide-react";

interface BranchStockDisplayProps {
  styleId: Id<"styles">;
  styleName: string;
}

export function BranchStockDisplay({
  styleId,
  styleName,
}: BranchStockDisplayProps) {
  const [open, setOpen] = useState(false);

  // Lazy-load: only fire the query when the dialog is open (critical for POS performance —
  // there are 8–20+ product cards rendered simultaneously; querying all on mount would be expensive)
  const branchStock = useQuery(
    api.inventory.stockLevels.getAllBranchStockForStyle,
    open ? { styleId } : "skip"
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {/* min-h-14 required: theme-pos sets min-height: 56px on all buttons */}
        <button
          type="button"
          className="mt-2 flex min-h-14 w-full items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50"
        >
          <Store className="h-4 w-4" />
          Other Branches
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Other Branch Stock — {styleName}</DialogTitle>
          {/* L1: DialogDescription required by Radix UI for accessible dialogs */}
          <DialogDescription className="sr-only">
            Stock availability at all active branches for {styleName}
          </DialogDescription>
        </DialogHeader>

        {branchStock === undefined ? (
          /* Loading state — inline animate-pulse divs (ui/skeleton not in project) */
          <div className="space-y-2 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : branchStock.length === 0 ? (
          /* Empty state */
          <p className="py-4 text-center text-sm text-muted-foreground">
            No stock records found at other branches.
          </p>
        ) : (
          /* Results: one card per branch, showing all variants with StatusPill */
          <div className="max-h-96 space-y-3 overflow-y-auto py-2">
            {branchStock.map((branch) => (
              <div key={branch.branchId} className="rounded-md border p-3">
                <p className="font-medium">{branch.branchName}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {branch.variants.map((variant) => (
                    <div
                      key={variant.variantId}
                      className="flex items-center gap-1.5 rounded border px-2 py-1 text-sm"
                    >
                      <span className="font-medium">{variant.size}</span>
                      {/* L2: color and size are always different strings in apparel — show color unconditionally */}
                      <span className="text-muted-foreground">
                        {variant.color}
                      </span>
                      <StatusPill
                        quantity={variant.quantity}
                        lowStockThreshold={variant.lowStockThreshold}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { MapPin, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface BranchStockDisplayProps {
  styleId: Id<"styles">;
  selectedVariantId?: Id<"variants"> | null;
  onReserve?: (branchId: Id<"branches">, branchName: string) => void;
}

export function BranchStockDisplay({
  styleId,
  selectedVariantId,
  onReserve,
}: BranchStockDisplayProps) {
  const [expanded, setExpanded] = useState(false);

  const branchStock = useQuery(
    api.catalog.publicBrowse.getAllBranchStockForStylePublic,
    { styleId }
  );

  // Loading
  if (branchStock === undefined) {
    return (
      <div className="rounded-xl border border-[#2A2A2A] bg-[#111111] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-gray-400" />
            <div className="h-4 w-40 animate-pulse rounded bg-[#2A2A2A]" />
          </div>
          <div className="h-4 w-4 animate-pulse rounded bg-[#2A2A2A]" />
        </div>
      </div>
    );
  }

  // Empty state
  if (branchStock.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-[#2A2A2A] bg-[#111111] overflow-hidden">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-semibold text-white">
            Check Store Availability
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-gray-400 transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>

      {/* Collapsible body */}
      {expanded && (
        <div className="border-t border-[#2A2A2A] px-4 py-3">
          {!selectedVariantId ? (
            <p className="text-sm text-gray-400">
              Select a size to check store availability
            </p>
          ) : (
            <ul className="space-y-2" aria-label="Branch stock availability">
              {branchStock.map((branch) => {
                const match = branch.variants.find(
                  (v) => v.variantId === selectedVariantId
                );
                const quantity = match?.quantity ?? 0;
                const inStock = quantity > 0;

                return (
                  <li
                    key={branch.branchId}
                    className="flex items-center justify-between rounded-lg border border-[#2A2A2A] px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      {/* Stock dot */}
                      <span
                        className={cn(
                          "h-2.5 w-2.5 shrink-0 rounded-full",
                          inStock ? "bg-green-500" : "bg-gray-500"
                        )}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-medium text-white">
                        {branch.branchName}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          inStock ? "text-green-400" : "text-gray-500"
                        )}
                      >
                        {inStock ? "In Stock" : "Out of Stock"}
                      </span>

                      {onReserve && inStock && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onReserve(
                              branch.branchId as Id<"branches">,
                              branch.branchName
                            );
                          }}
                          className="ml-1 rounded-md border border-[#2A2A2A] px-2.5 py-1 text-xs font-medium text-white hover:border-gray-500 transition-colors"
                        >
                          Reserve
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

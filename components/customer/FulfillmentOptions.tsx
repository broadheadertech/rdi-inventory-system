"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { MapPin, Zap, Truck, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface FulfillmentOptionsProps {
  variantId: Id<"variants"> | null;
}

export function FulfillmentOptions({ variantId }: FulfillmentOptionsProps) {
  const options = useQuery(
    api.storefront.fulfillmentOptions.getFulfillmentOptions,
    variantId ? { variantId } : "skip"
  );
  const [expanded, setExpanded] = useState(false);

  if (!variantId || !options || options.length === 0) return null;

  const visibleOptions = expanded ? options : options.slice(0, 2);
  const hasMore = options.length > 2;

  return (
    <div className="mt-4 rounded-lg border border-zinc-700/60 bg-zinc-900/60 p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
        Fastest Way to Get This Item
      </h4>

      <div className="space-y-2">
        {visibleOptions.map((option, idx) => {
          const isFastest = idx === 0;
          const Icon =
            option.type === "pickup"
              ? MapPin
              : option.type === "express"
                ? Zap
                : Truck;

          return (
            <div
              key={option.type + (option.branchId ?? idx)}
              className={cn(
                "flex items-start gap-3 rounded-md px-3 py-2 transition-colors",
                isFastest
                  ? "bg-emerald-950/40 border border-emerald-700/40"
                  : "bg-zinc-800/40"
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 h-4 w-4 flex-shrink-0",
                  isFastest ? "text-emerald-400" : "text-zinc-400"
                )}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-100">
                    {option.label}
                  </span>
                  {isFastest && (
                    <span className="inline-flex items-center rounded-full bg-emerald-600/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      Fastest
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-400">{option.description}</p>

                {option.type === "pickup" && option.stock !== null && (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {option.stock} in stock
                    {option.branchAddress ? ` · ${option.branchAddress}` : ""}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded py-1 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-200"
        >
          {expanded ? (
            <>
              Show less <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              Show all {options.length} options{" "}
              <ChevronDown className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  );
}

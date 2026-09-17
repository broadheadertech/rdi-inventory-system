"use client";

// components/shared/CustodyTimeline.tsx — who held the goods, and when.
//
// A transfer changes hands twice: the warehouse gives it to a carrier, and the
// carrier gives it to the branch. Both ends read this same list, so nobody is
// working from a different account of what happened.

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Check, Circle, Minus } from "lucide-react";

function when(ms: number | null): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-PH", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

export function CustodyTimeline({
  transferId,
  className,
}: {
  transferId: Id<"transfers">;
  className?: string;
}) {
  const custody = useQuery(api.transfers.fulfillment.getTransferCustody, { transferId });

  if (custody === undefined) {
    return <div className={cn("h-40 animate-pulse rounded-lg border bg-muted/40", className)} />;
  }

  return (
    <div className={cn("rounded-lg border p-4", className)}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Chain of custody</h3>
        <p className="text-xs text-muted-foreground">
          {custody.fromBranchName} → {custody.toBranchName}
        </p>
      </div>

      <ol className="space-y-0">
        {custody.steps.map((step, i) => {
          const last = i === custody.steps.length - 1;
          return (
            <li key={step.key} className="flex gap-3">
              {/* Rail */}
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    step.state === "done"
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : step.state === "skipped"
                        ? "border-muted bg-muted text-muted-foreground"
                        : "border-dashed border-muted-foreground/40 text-muted-foreground"
                  )}
                >
                  {step.state === "done" ? (
                    <Check className="h-3 w-3" />
                  ) : step.state === "skipped" ? (
                    <Minus className="h-3 w-3" />
                  ) : (
                    <Circle className="h-2 w-2" />
                  )}
                </span>
                {!last && (
                  <span
                    className={cn(
                      "w-px flex-1",
                      step.state === "done" ? "bg-emerald-500/40" : "bg-border"
                    )}
                  />
                )}
              </div>

              {/* Step */}
              <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-4")}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p
                    className={cn(
                      "text-sm",
                      step.state === "done" ? "font-medium" : "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">
                    {step.at ? when(step.at) : step.state === "skipped" ? "—" : "pending"}
                  </p>
                </div>
                {(step.by || step.detail) && (
                  <p className="truncate text-xs text-muted-foreground">
                    {[step.by, step.detail].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

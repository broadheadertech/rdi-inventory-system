"use client";

// components/shared/StalledHandshakes.tsx — handovers that stopped halfway.
//
// Every entry here is a moment where the goods are somebody's responsibility
// and nobody has said so: handed to a branch that never scanned them, loaded
// onto a vehicle that never left, on the road past the day it was due. A
// handshake exists to stop exactly that, so a half-finished one is surfaced
// rather than waited on.

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { AlertTriangle, ChevronRight } from "lucide-react";

function waited(hours: number): string {
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function StalledHandshakes({ className }: { className?: string }) {
  const stalled = useQuery(api.transfers.fulfillment.listStalledHandshakes, {});

  if (stalled === undefined) {
    return <div className={cn("h-24 animate-pulse rounded-lg border bg-muted/40", className)} />;
  }
  // Nothing stuck is the normal state — say nothing rather than take up room.
  if (stalled.length === 0) return null;

  return (
    <div className={cn("rounded-lg border border-amber-500/40 bg-amber-50/50 p-4", className)}>
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-700" />
        <h3 className="text-sm font-semibold text-amber-800">
          Handovers waiting · {stalled.length}
        </h3>
      </div>

      <div className="divide-y divide-amber-500/20">
        {stalled.map((row) => (
          <Link
            key={row.transferId}
            href={`/warehouse/movements/${row.transferId}`}
            className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:bg-amber-100/40"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {row.fromBranchName} → {row.toBranchName}
              </p>
              <p className="truncate text-xs text-amber-800">
                {row.reason}
                {row.carrier ? ` · ${row.carrier}` : ""}
                {row.driverReceivedByName ? ` · taken by ${row.driverReceivedByName}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs font-semibold tabular-nums text-amber-800">
                {waited(row.hoursWaiting)}
              </span>
              <ChevronRight className="h-4 w-4 text-amber-700" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

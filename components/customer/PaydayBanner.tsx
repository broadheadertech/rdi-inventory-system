"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Banknote } from "lucide-react";

export function PaydayBanner() {
  const status = useQuery(api.storefront.paydaySales.getPaydayStatus);

  if (!status || !status.isPaydayWindow) return null;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-5">
      <div className="relative overflow-hidden rounded-xl border border-red-500/30 bg-gradient-to-r from-[#E8192C]/15 via-amber-500/10 to-[#E8192C]/15 px-5 py-3.5">
        {/* Subtle animated background shimmer */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_3s_ease-in-out_infinite]" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#E8192C]/20">
            <Banknote className="h-5 w-5 text-[#E8192C] animate-pulse" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold uppercase tracking-widest text-[#E8192C]">
              Payday Sale
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {status.message}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

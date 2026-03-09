"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatPrice, cn } from "@/lib/utils";
import { Share2, Gift, ShoppingBag, Star, TrendingUp } from "lucide-react";
import { toast } from "sonner";

export function RedBoxWrapped() {
  const wrapped = useQuery(api.storefront.wrapped.getMyWrapped);

  if (wrapped === undefined) {
    // Loading
    return (
      <div className="animate-pulse rounded-2xl bg-muted h-64" />
    );
  }

  if (wrapped === null) return null;

  const maxSpend = Math.max(...wrapped.monthlySpending.map((m) => m.spentCentavos), 1);
  const monthLabels = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

  async function handleShare() {
    const text = `My ${wrapped!.year} RedBox Wrapped: ${wrapped!.totalOrders} orders, ${wrapped!.totalItems} items, favorite color ${wrapped!.favoriteColor}, top brand ${wrapped!.favoriteBrand}! #RedBoxWrapped`;
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: `RedBox Wrapped ${wrapped!.year}`, text, url: shareUrl });
      } catch {
        // User cancelled
      }
    } else {
      try {
        await navigator.clipboard.writeText(`${text}\n${shareUrl}`);
        toast.success("Copied to clipboard!");
      } catch {
        toast.error("Failed to copy");
      }
    }
  }

  // Resolve a simple hex for the favorite color dot
  const colorDotStyle = { backgroundColor: getColorHex(wrapped.favoriteColor) };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] p-6 text-white shadow-xl">
      {/* Background decorative elements */}
      <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[#E8192C]/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-[#E8192C]/10 blur-3xl" />

      {/* Header */}
      <div className="relative mb-6">
        <p className="font-mono text-5xl font-black tracking-tighter text-[#E8192C]">
          {wrapped.year}
        </p>
        <h2 className="mt-1 font-display text-xl font-bold uppercase tracking-wide">
          Your RedBox Wrapped
        </h2>
      </div>

      {/* Stats grid */}
      <div className="relative mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white/10 p-3 text-center backdrop-blur-sm">
          <ShoppingBag className="mx-auto mb-1 h-5 w-5 text-[#E8192C]" />
          <p className="text-2xl font-black">{wrapped.totalOrders}</p>
          <p className="text-[10px] uppercase tracking-widest text-white/60">Orders</p>
        </div>
        <div className="rounded-xl bg-white/10 p-3 text-center backdrop-blur-sm">
          <Gift className="mx-auto mb-1 h-5 w-5 text-[#E8192C]" />
          <p className="text-2xl font-black">{wrapped.totalItems}</p>
          <p className="text-[10px] uppercase tracking-widest text-white/60">Items</p>
        </div>
        <div className="rounded-xl bg-white/10 p-3 text-center backdrop-blur-sm">
          <TrendingUp className="mx-auto mb-1 h-5 w-5 text-[#E8192C]" />
          <p className="text-lg font-black leading-tight">{formatPrice(wrapped.totalSpentCentavos)}</p>
          <p className="text-[10px] uppercase tracking-widest text-white/60">Spent</p>
        </div>
      </div>

      {/* Favorite insights */}
      <div className="relative mb-6 space-y-3">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3">
          <span
            className="h-5 w-5 shrink-0 rounded-full border-2 border-white/30"
            style={colorDotStyle}
          />
          <p className="text-sm">
            Your favorite color was <span className="font-bold">{wrapped.favoriteColor}</span>
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/20 text-[10px] font-black">
            {wrapped.favoriteSize}
          </span>
          <p className="text-sm">
            Your go-to size: <span className="font-bold">{wrapped.favoriteSize}</span>
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3">
          <Star className="h-5 w-5 shrink-0 text-yellow-400" />
          <p className="text-sm">
            Top brand: <span className="font-bold">{wrapped.favoriteBrand}</span>
          </p>
        </div>
      </div>

      {/* Top categories */}
      {wrapped.topCategories.length > 0 && (
        <div className="relative mb-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-white/50">
            Top Categories
          </p>
          <div className="flex flex-wrap gap-2">
            {wrapped.topCategories.map((cat, i) => (
              <span
                key={cat.name}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  i === 0
                    ? "bg-[#E8192C] text-white"
                    : "bg-white/10 text-white/80"
                )}
              >
                {cat.name} ({cat.count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Percentile badge */}
      {wrapped.percentile !== "Member" && (
        <div className="relative mb-6 flex items-center gap-3 rounded-xl border border-[#E8192C]/40 bg-[#E8192C]/10 px-4 py-3">
          <span className="text-2xl">🏆</span>
          <p className="text-sm font-semibold">
            You&apos;re in the {wrapped.percentile} of RedBox shoppers!
          </p>
        </div>
      )}
      {wrapped.percentile === "Member" && (
        <div className="relative mb-6 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <span className="text-2xl">🎉</span>
          <p className="text-sm font-semibold">
            Thanks for being a RedBox member!
          </p>
        </div>
      )}

      {/* Monthly spending chart */}
      <div className="relative mb-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-white/50">
          Monthly Spending
        </p>
        <div className="flex items-end gap-1.5" style={{ height: 80 }}>
          {wrapped.monthlySpending.map((m, i) => {
            const height = maxSpend > 0 ? (m.spentCentavos / maxSpend) * 100 : 0;
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={cn(
                    "w-full rounded-t-sm transition-all",
                    m.spentCentavos > 0 ? "bg-[#E8192C]" : "bg-white/10"
                  )}
                  style={{ height: `${Math.max(height, 2)}%` }}
                  title={formatPrice(m.spentCentavos)}
                />
                <span className="text-[9px] text-white/40">{monthLabels[i]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Share button */}
      <button
        onClick={handleShare}
        className="relative flex w-full items-center justify-center gap-2 rounded-xl bg-[#E8192C] py-3 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#c9152a]"
      >
        <Share2 className="h-4 w-4" />
        Share My Wrapped
      </button>
    </div>
  );
}

/** Best-effort color name to hex mapping */
function getColorHex(color: string): string {
  const map: Record<string, string> = {
    red: "#ef4444",
    blue: "#3b82f6",
    green: "#22c55e",
    black: "#1f2937",
    white: "#f9fafb",
    yellow: "#eab308",
    orange: "#f97316",
    purple: "#a855f7",
    pink: "#ec4899",
    brown: "#92400e",
    gray: "#6b7280",
    grey: "#6b7280",
    navy: "#1e3a5f",
    beige: "#d4c5a9",
    maroon: "#7f1d1d",
    teal: "#14b8a6",
    coral: "#f87171",
    cream: "#fef3c7",
    khaki: "#bdb76b",
  };
  return map[color.toLowerCase()] ?? "#9ca3af";
}

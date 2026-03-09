"use client";

import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { Heart, Star, Eye } from "lucide-react";

export function PersonalizedDashboard() {
  const { user, isSignedIn } = useUser();
  const loyalty = useQuery(
    api.storefront.loyalty.getMyLoyaltyAccount,
    isSignedIn ? {} : "skip"
  );
  const saved = useQuery(
    api.storefront.savedItems.getMySavedItems,
    isSignedIn ? { limit: 1 } : "skip"
  );

  if (!isSignedIn || !user) return null;

  const firstName = user.firstName || "there";

  return (
    <div className="mx-auto max-w-7xl px-4 pt-5">
      <p className="text-sm text-muted-foreground mb-3">
        Welcome back, <span className="font-medium text-foreground">{firstName}</span>
      </p>
      <div className="grid grid-cols-3 gap-2">
        {/* Loyalty Points */}
        <Link
          href="/account/loyalty"
          className="rounded-lg border border-border bg-card p-3 transition-colors hover:bg-secondary"
        >
          <Star className="h-4 w-4 text-yellow-400 mb-1" />
          <p className="text-lg font-bold">
            {loyalty?.pointsBalance ?? 0}
          </p>
          <p className="text-[10px] text-muted-foreground">Points</p>
        </Link>

        {/* Saved Items */}
        <Link
          href="/account/saved"
          className="rounded-lg border border-border bg-card p-3 transition-colors hover:bg-secondary"
        >
          <Heart className="h-4 w-4 text-red-500 mb-1" />
          <p className="text-lg font-bold">
            {saved?.items?.length ?? 0}
          </p>
          <p className="text-[10px] text-muted-foreground">Saved</p>
        </Link>

        {/* Orders */}
        <Link
          href="/account/orders"
          className="rounded-lg border border-border bg-card p-3 transition-colors hover:bg-secondary"
        >
          <Eye className="h-4 w-4 text-blue-400 mb-1" />
          <p className="text-lg font-bold">
            {loyalty?.tier ?? "—"}
          </p>
          <p className="text-[10px] text-muted-foreground">Tier</p>
        </Link>
      </div>
    </div>
  );
}

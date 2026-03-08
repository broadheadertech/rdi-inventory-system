"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import {
  ArrowLeft,
  Star,
  TrendingUp,
  Coins,
  ShoppingBag,
  Gift,
  Clock,
  ChevronRight,
  Loader2,
  Award,
  Minus,
  Plus,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { useState } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_THRESHOLDS = {
  bronze: { min: 0, next: 5000, nextTier: "Silver" as const },
  silver: { min: 5000, next: 15000, nextTier: "Gold" as const },
  gold: { min: 15000, next: 50000, nextTier: "Platinum" as const },
  platinum: { min: 50000, next: null, nextTier: null },
};

const TIER_COLORS: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  bronze: {
    bg: "bg-amber-900/20",
    text: "text-amber-500",
    border: "border-amber-700/30",
    badge: "bg-gradient-to-br from-amber-700 to-amber-900",
  },
  silver: {
    bg: "bg-slate-400/10",
    text: "text-slate-300",
    border: "border-slate-500/30",
    badge: "bg-gradient-to-br from-slate-300 to-slate-500",
  },
  gold: {
    bg: "bg-yellow-500/10",
    text: "text-yellow-400",
    border: "border-yellow-600/30",
    badge: "bg-gradient-to-br from-yellow-400 to-yellow-600",
  },
  platinum: {
    bg: "bg-violet-500/10",
    text: "text-violet-300",
    border: "border-violet-500/30",
    badge: "bg-gradient-to-br from-violet-300 to-violet-500",
  },
};

const TIER_BENEFITS: Record<string, string[]> = {
  bronze: [
    "Earn 1 point per P10 spent",
    "Birthday bonus points",
    "Access to member-only sales",
  ],
  silver: [
    "Earn 1.5 points per P10 spent",
    "Birthday bonus points (2x)",
    "Free shipping on orders over P1,500",
    "Early access to new collections",
  ],
  gold: [
    "Earn 2 points per P10 spent",
    "Birthday bonus points (3x)",
    "Free shipping on all orders",
    "Priority customer support",
    "Exclusive Gold member events",
  ],
  platinum: [
    "Earn 3 points per P10 spent",
    "Birthday bonus points (5x)",
    "Free express shipping on all orders",
    "Dedicated account manager",
    "VIP access to all events",
    "Exclusive Platinum-only products",
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return n.toLocaleString("en-PH");
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function pointsToPeso(points: number): string {
  return formatPrice(points * 10); // 1 point = P0.10 = 10 centavos
}

// ─── Transaction Icon ─────────────────────────────────────────────────────────

function TxIcon({ type }: { type: string }) {
  switch (type) {
    case "earn":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
          <Plus className="h-4 w-4 text-emerald-500" />
        </div>
      );
    case "redeem":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10">
          <Minus className="h-4 w-4 text-red-500" />
        </div>
      );
    case "bonus":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-500/10">
          <Star className="h-4 w-4 text-yellow-500" />
        </div>
      );
    case "expire":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-500/10">
          <Clock className="h-4 w-4 text-gray-400" />
        </div>
      );
    default:
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-500/10">
          <Coins className="h-4 w-4 text-gray-400" />
        </div>
      );
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoyaltyPage() {
  const account = useQuery(api.storefront.loyalty.getMyLoyaltyAccount);
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const history = useQuery(api.storefront.loyalty.getMyLoyaltyHistory, {
    limit: 20,
    cursor,
  });

  // Loading state
  if (account === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No loyalty account
  if (account === null) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link
          href="/account"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Account
        </Link>

        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
            <Award className="h-10 w-10 text-muted-foreground" />
          </div>
          <h1 className="font-display text-xl font-bold">No Loyalty Account Yet</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Start shopping to earn points and unlock exclusive rewards. Your loyalty
            account will be created automatically with your first purchase.
          </p>
          <Link
            href="/browse"
            className="mt-2 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start Shopping
          </Link>
        </div>
      </div>
    );
  }

  // Has loyalty account
  const tierConfig = TIER_THRESHOLDS[account.tier];
  const tierColors = TIER_COLORS[account.tier];
  const benefits = TIER_BENEFITS[account.tier];

  // Progress to next tier
  let progressPercent = 100;
  let pointsToNext = 0;
  if (tierConfig.next !== null) {
    pointsToNext = tierConfig.next - account.lifetimePoints;
    if (pointsToNext < 0) pointsToNext = 0;
    const range = tierConfig.next - tierConfig.min;
    const earned = account.lifetimePoints - tierConfig.min;
    progressPercent = Math.min(100, Math.max(0, (earned / range) * 100));
  }

  const transactions = history?.transactions ?? [];
  const hasMore = history?.hasMore ?? false;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Back link */}
      <Link
        href="/account"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Account
      </Link>

      {/* ─── Tier Card ─────────────────────────────────────────────────── */}
      <div
        className={`rounded-xl border ${tierColors.border} ${tierColors.bg} p-6`}
      >
        {/* Tier badge + balance */}
        <div className="flex items-start justify-between">
          <div>
            <div
              className={`inline-flex items-center gap-1.5 rounded-full ${tierColors.badge} px-3 py-1 text-xs font-bold uppercase tracking-wider text-white`}
            >
              <Award className="h-3.5 w-3.5" />
              {account.tier}
            </div>
            <div className="mt-4">
              <p className="text-3xl font-bold tabular-nums">
                {formatNumber(account.pointsBalance)}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                points ({pointsToPeso(account.pointsBalance)} value)
              </p>
            </div>
          </div>
          <div className="flex h-14 w-14 items-center justify-center">
            <Coins className={`h-10 w-10 ${tierColors.text} opacity-40`} />
          </div>
        </div>

        {/* Progress to next tier */}
        {tierConfig.next !== null && (
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium capitalize">{account.tier}</span>
              <span className="text-muted-foreground">
                {formatNumber(pointsToNext)} pts to {tierConfig.nextTier}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full ${tierColors.badge} transition-all`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{formatNumber(tierConfig.min)} pts</span>
              <span>{formatNumber(tierConfig.next)} pts</span>
            </div>
          </div>
        )}

        {tierConfig.next === null && (
          <p className="mt-4 text-xs text-muted-foreground">
            You have reached the highest tier!
          </p>
        )}

        {/* Tier expiry */}
        {account.tierExpiresAt && (
          <p className="mt-3 text-xs text-muted-foreground">
            Tier valid until {formatDate(account.tierExpiresAt)}
          </p>
        )}
      </div>

      {/* ─── Quick Stats ───────────────────────────────────────────────── */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <TrendingUp className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-lg font-bold tabular-nums">
            {formatNumber(account.lifetimePoints)}
          </p>
          <p className="text-[11px] text-muted-foreground">Lifetime Points</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <ShoppingBag className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-lg font-bold tabular-nums">
            {formatPrice(account.lifetimeSpendCentavos)}
          </p>
          <p className="text-[11px] text-muted-foreground">Lifetime Spend</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <Award className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className={`mt-2 text-lg font-bold capitalize ${tierColors.text}`}>
            {account.tier}
          </p>
          <p className="text-[11px] text-muted-foreground">Current Tier</p>
        </div>
      </div>

      {/* ─── Transaction History ───────────────────────────────────────── */}
      <div className="mt-8">
        <h2 className="font-display text-lg font-bold uppercase tracking-tight">
          Point History
        </h2>

        {transactions.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            No transactions yet. Start shopping to earn points!
          </p>
        )}

        {transactions.length > 0 && (
          <div className="mt-4 space-y-1">
            {transactions.map((tx) => (
              <div
                key={tx._id}
                className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-muted"
              >
                <TxIcon type={tx.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {tx.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(tx.createdAt)}
                  </p>
                </div>
                <span
                  className={`text-sm font-bold tabular-nums ${
                    tx.points > 0
                      ? "text-emerald-500"
                      : tx.points < 0
                        ? "text-red-400"
                        : "text-muted-foreground"
                  }`}
                >
                  {tx.points > 0 ? "+" : ""}
                  {formatNumber(tx.points)}
                </span>
              </div>
            ))}

            {hasMore && (
              <button
                onClick={() => {
                  const last = transactions[transactions.length - 1];
                  if (last) setCursor(last.createdAt);
                }}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border p-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Load More
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── Tier Benefits ─────────────────────────────────────────────── */}
      <div className="mt-8 pb-8">
        <h2 className="font-display text-lg font-bold uppercase tracking-tight">
          Your {account.tier} Benefits
        </h2>
        <div className="mt-4 space-y-2">
          {benefits.map((benefit, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
            >
              <Gift className={`mt-0.5 h-4 w-4 flex-shrink-0 ${tierColors.text}`} />
              <p className="text-sm">{benefit}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

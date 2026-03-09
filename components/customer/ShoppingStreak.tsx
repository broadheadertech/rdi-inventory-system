"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ShoppingStreak() {
  const streak = useQuery(api.storefront.streaks.getMyStreak);

  if (streak === undefined || streak === null) return null;

  const { currentStreak, longestStreak, monthsWithPurchases } = streak;
  const bonusPoints = ("bonusPoints" in streak ? streak.bonusPoints : 0) as number;
  const months = monthsWithPurchases as string[];

  // Build last 6 months labels for the visual streak counter
  const now = new Date();
  const last6Months: { label: string; key: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-PH", { month: "short" });
    last6Months.push({ label, key });
  }

  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const hasPurchaseThisMonth = months.includes(currentMonthKey);

  // Streak level description
  const streakLabel =
    currentStreak >= 6
      ? "6+ month streak = +500 bonus points"
      : currentStreak >= 3
        ? "3-month streak = +200 bonus points"
        : currentStreak >= 2
          ? "2-month streak = +50 bonus points"
          : "Start a streak to earn bonus points!";

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full",
            currentStreak >= 2 ? "bg-[#E8192C]/10" : "bg-muted"
          )}
        >
          <Flame
            className={cn(
              "h-5 w-5",
              currentStreak >= 2 ? "text-[#E8192C]" : "text-muted-foreground"
            )}
          />
        </div>
        <div>
          <h3 className="font-display text-base font-bold">Shopping Streak</h3>
          <p className="text-xs text-muted-foreground">
            Buy in consecutive months to earn bonus points
          </p>
        </div>
      </div>

      {/* Current streak number */}
      <div className="mt-5 flex items-baseline gap-2">
        <span
          className={cn(
            "text-3xl font-bold tabular-nums",
            currentStreak >= 2 ? "text-[#E8192C]" : "text-foreground"
          )}
        >
          {currentStreak}
        </span>
        <span className="text-sm text-muted-foreground">
          month{currentStreak !== 1 ? "s" : ""} in a row
        </span>
        {longestStreak > currentStreak && (
          <span className="ml-auto text-xs text-muted-foreground">
            Best: {longestStreak}
          </span>
        )}
      </div>

      {/* Visual streak counter — last 6 months */}
      <div className="mt-4 grid grid-cols-6 gap-2">
        {last6Months.map((m) => {
          const hasPurchase = months.includes(m.key);
          return (
            <div key={m.key} className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
                  hasPurchase
                    ? "border-[#E8192C] bg-[#E8192C]/10"
                    : "border-border bg-muted/50"
                )}
              >
                {hasPurchase && (
                  <Flame className="h-4 w-4 text-[#E8192C]" />
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {m.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Bonus points info */}
      {bonusPoints > 0 ? (
        <div className="mt-4 rounded-lg bg-[#E8192C]/5 px-3 py-2 text-center">
          <p className="text-sm font-medium text-[#E8192C]">
            +{bonusPoints.toLocaleString("en-PH")} bonus points earned
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{streakLabel}</p>
        </div>
      ) : (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {streakLabel}
        </p>
      )}

      {/* Motivational message if streak at risk */}
      {currentStreak >= 2 && !hasPurchaseThisMonth && (
        <p className="mt-3 text-center text-xs font-medium text-amber-500">
          Shop this month to keep your streak!
        </p>
      )}
    </div>
  );
}

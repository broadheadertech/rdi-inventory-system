"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Flame, Gift, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Points schedule matches backend: day 1=5, 2=10, 3=15, 4=20, 5=25, 6=30, 7+=50
const DAY_POINTS = [5, 10, 15, 20, 25, 30, 50];

export function DailyCheckIn() {
  const status = useQuery(api.storefront.loyalty.getCheckInStatus);
  const doCheckIn = useMutation(api.storefront.loyalty.dailyCheckIn);
  const [checking, setChecking] = useState(false);
  const [justClaimed, setJustClaimed] = useState<{
    pointsAwarded: number;
    streakDay: number;
    totalPoints: number;
  } | null>(null);

  if (!status) return null;

  const hasCheckedIn = status.hasCheckedInToday || justClaimed !== null;

  // Hide the card once checked in
  if (hasCheckedIn) return null;
  const currentStreak = justClaimed ? justClaimed.streakDay : status.currentStreak;

  async function handleCheckIn() {
    if (checking || hasCheckedIn) return;
    setChecking(true);
    try {
      const result = await doCheckIn();
      setJustClaimed(result);
      toast.success(
        `+${result.pointsAwarded} points! Day ${result.streakDay} streak!`
      );
    } catch {
      toast.error("Check-in failed");
    }
    setChecking(false);
  }

  // Determine which dots are filled based on current streak position within 7-day cycle
  const streakInCycle = currentStreak > 0 ? ((currentStreak - 1) % 7) + 1 : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-4">
      <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm p-4">
        {/* Top row: icon + title + button */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Gift className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold leading-tight">Daily Check-In</p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Flame className="h-3.5 w-3.5 flex-shrink-0 text-orange-500" />
              <span>
                {currentStreak > 0
                  ? `${currentStreak}-day streak`
                  : "Start your streak!"}
              </span>
            </div>
          </div>
          <div className="flex-shrink-0">
            {hasCheckedIn ? (
              <div className="flex items-center gap-1.5 rounded-lg bg-green-500/10 px-3 py-1.5 text-xs font-semibold text-green-500">
                <Check className="h-3.5 w-3.5" />
                <span>
                  +{justClaimed?.pointsAwarded ?? DAY_POINTS[Math.min(streakInCycle - 1, 6)]}pts
                </span>
              </div>
            ) : (
              <button
                onClick={handleCheckIn}
                disabled={checking}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50"
              >
                {checking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Check In"
                )}
              </button>
            )}
          </div>
        </div>

        {/* 7-day progress dots — always visible */}
        <div className="mt-3 flex items-center justify-between gap-1 px-1">
          {DAY_POINTS.map((pts, i) => {
            const dayNum = i + 1;
            const isCompleted = dayNum <= streakInCycle;
            const isNext = dayNum === streakInCycle + 1 && !hasCheckedIn;

            return (
              <div
                key={i}
                className="flex flex-col items-center flex-1"
                title={`Day ${dayNum}: ${pts} pts`}
              >
                <div
                  className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all",
                    isCompleted
                      ? "bg-primary text-primary-foreground"
                      : isNext
                        ? "border-2 border-primary text-primary"
                        : "border border-muted-foreground/30 text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : dayNum === 7 ? (
                    <Gift className="h-3.5 w-3.5" />
                  ) : (
                    dayNum
                  )}
                </div>
                <span className="mt-0.5 text-[9px] text-muted-foreground">
                  +{pts}
                </span>
              </div>
            );
          })}
        </div>

        {/* Tomorrow hint */}
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          Tomorrow: +{status.nextReward}pts
        </p>
      </div>
    </div>
  );
}

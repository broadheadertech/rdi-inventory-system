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
        <div className="flex items-center justify-between gap-4">
          {/* Left: title + streak info */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Gift className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold">Daily Check-In</p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Flame className="h-3.5 w-3.5 text-orange-500" />
                <span>
                  {currentStreak > 0
                    ? `${currentStreak}-day streak`
                    : "Start your streak!"}
                </span>
              </div>
            </div>
          </div>

          {/* Center: 7-day progress dots */}
          <div className="hidden sm:flex items-center gap-1">
            {DAY_POINTS.map((pts, i) => {
              const dayNum = i + 1;
              const isCompleted = dayNum <= streakInCycle;
              const isNext = dayNum === streakInCycle + 1 && !hasCheckedIn;

              return (
                <div
                  key={i}
                  className="flex flex-col items-center"
                  title={`Day ${dayNum}: ${pts} pts`}
                >
                  <div
                    className={cn(
                      "h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-bold transition-all",
                      isCompleted
                        ? "bg-primary text-primary-foreground"
                        : isNext
                          ? "border-2 border-primary text-primary"
                          : "border border-muted-foreground/30 text-muted-foreground"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="h-3 w-3" />
                    ) : dayNum === 7 ? (
                      <Gift className="h-3 w-3" />
                    ) : (
                      dayNum
                    )}
                  </div>
                  <span className="mt-0.5 text-[8px] text-muted-foreground">
                    {pts}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Right: check-in button or status */}
          <div className="flex flex-col items-end flex-shrink-0">
            {hasCheckedIn ? (
              <div className="flex items-center gap-1.5 rounded-lg bg-green-500/10 px-3 py-2 text-sm font-semibold text-green-500">
                <Check className="h-4 w-4" />
                <span>
                  Checked In Today!{" "}
                  +{justClaimed?.pointsAwarded ?? DAY_POINTS[Math.min(streakInCycle - 1, 6)]}pts
                </span>
              </div>
            ) : (
              <button
                onClick={handleCheckIn}
                disabled={checking}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50"
              >
                {checking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Check In"
                )}
              </button>
            )}
            <p className="mt-1 text-[10px] text-muted-foreground">
              Tomorrow: +{status.nextReward}pts
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useState } from "react";
import { Sparkles, Bell, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function getTimeLeft(dropDate: number): TimeLeft {
  const diff = Math.max(0, dropDate - Date.now());
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

function CountdownTimer({ dropDate }: { dropDate: number }) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(getTimeLeft(dropDate));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getTimeLeft(dropDate));
    }, 1000);
    return () => clearInterval(interval);
  }, [dropDate]);

  return (
    <div className="flex items-center gap-1.5">
      {[
        { value: timeLeft.days, label: "D" },
        { value: timeLeft.hours, label: "H" },
        { value: timeLeft.minutes, label: "M" },
        { value: timeLeft.seconds, label: "S" },
      ].map((unit, i) => (
        <div key={unit.label} className="flex items-center gap-1.5">
          <div className="flex flex-col items-center rounded-md bg-white/5 px-2 py-1 min-w-[40px]">
            <span className="text-lg font-bold tabular-nums text-white">
              {String(unit.value).padStart(2, "0")}
            </span>
            <span className="text-[10px] uppercase text-neutral-500">
              {unit.label}
            </span>
          </div>
          {i < 3 && (
            <span className="text-neutral-600 font-bold text-sm">:</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function DropCountdown() {
  const drops = useQuery(api.catalog.drops.getUpcomingDrops);

  if (drops === undefined) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-[#0A0A0A] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-[#E8192C]" />
          <h2 className="text-lg font-bold text-white">Upcoming Drops</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-700 border-t-[#E8192C]" />
        </div>
      </div>
    );
  }

  if (drops.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-[#0A0A0A] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-[#E8192C]" />
          <h2 className="text-lg font-bold text-white">Upcoming Drops</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-neutral-500">
          <Clock className="h-8 w-8 mb-2" />
          <p className="text-sm">No drops scheduled</p>
          <p className="text-xs mt-1">Check back later for exclusive releases</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-[#0A0A0A] p-6">
      <div className="flex items-center gap-2 mb-5">
        <Sparkles className="h-5 w-5 text-[#E8192C]" />
        <h2 className="text-lg font-bold text-white">Upcoming Drops</h2>
      </div>

      <div className="space-y-4">
        {drops.map((drop) => (
          <div
            key={drop.styleId}
            className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-400">
                    <Sparkles className="h-3 w-3" />
                    Exclusive
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-white truncate">
                  {drop.name}
                </h3>
                <p className="text-xs text-neutral-500">{drop.brandName}</p>
              </div>
            </div>

            <CountdownTimer dropDate={drop.dropDate} />

            {drop.exclusiveBranchNames.length > 0 && (
              <p className="mt-3 text-[11px] text-neutral-500">
                Available at:{" "}
                <span className="text-neutral-400">
                  {drop.exclusiveBranchNames.join(", ")}
                </span>
              </p>
            )}

            <button
              onClick={() => {
                toast.success(
                  `We'll notify you when "${drop.name}" drops!`
                );
              }}
              className={cn(
                "mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                "border border-[#E8192C]/30 bg-[#E8192C]/10 text-[#E8192C] hover:bg-[#E8192C]/20"
              )}
            >
              <Bell className="h-3.5 w-3.5" />
              Notify Me
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

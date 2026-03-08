"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReservationCountdownProps {
  expiresAt: number;
  className?: string;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s remaining`;
}

export function ReservationCountdown({
  expiresAt,
  className,
}: ReservationCountdownProps) {
  const [remaining, setRemaining] = useState(expiresAt - Date.now());

  useEffect(() => {
    // Sync immediately on mount / prop change
    setRemaining(expiresAt - Date.now());

    const timer = setInterval(() => {
      setRemaining(expiresAt - Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt]);

  const isExpired = remaining <= 0;
  const isUrgent = !isExpired && remaining < 2 * 60 * 60 * 1000; // < 2 hours

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm font-medium",
        isExpired && "text-[var(--customer-accent)]",
        isUrgent && "text-orange-500",
        !isExpired && !isUrgent && "text-blue-500",
        className,
      )}
    >
      {!isExpired && <Clock className="inline h-3.5 w-3.5 shrink-0" />}
      {formatCountdown(remaining)}
    </span>
  );
}

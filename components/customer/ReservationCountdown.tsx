"use client";

import { useState, useEffect } from "react";
import { Clock, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReservationCountdownProps {
  expiresAt: number;
  status: string;
  confirmationCode?: string;
  className?: string;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

function formatExpiryTime(expiresAt: number): string {
  return new Date(expiresAt).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ReservationCountdown({
  expiresAt,
  status,
  confirmationCode,
  className,
}: ReservationCountdownProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (status !== "pending") return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [status]);

  const remaining = expiresAt - now;
  const isExpired = remaining <= 0;

  // Terminal states
  if (status === "fulfilled") {
    return (
      <div
        className={cn(
          "rounded-lg border border-green-500/30 bg-green-500/10 p-4",
          className
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/20">
            <CheckCircle className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-green-500">Picked Up</p>
            <p className="text-xs text-green-400/70">
              This reservation has been fulfilled
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div
        className={cn(
          "rounded-lg border border-border bg-muted/50 p-4",
          className
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <XCircle className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-muted-foreground">
              Expired
            </p>
            <p className="text-xs text-muted-foreground/70">
              This reservation has expired
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div
        className={cn(
          "rounded-lg border border-border bg-muted/50 p-4",
          className
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <XCircle className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-muted-foreground">
              Cancelled
            </p>
            <p className="text-xs text-muted-foreground/70">
              This reservation was cancelled
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Pending state with live countdown
  const thirtyMinutes = 30 * 60 * 1000;
  const oneHour = 60 * 60 * 1000;

  // Determine urgency tier
  const isUrgent = !isExpired && remaining < thirtyMinutes;
  const isWarning = !isExpired && remaining >= thirtyMinutes && remaining < oneHour;
  const isCalm = !isExpired && remaining >= oneHour;

  // Border & accent colors per tier
  const tierBorder = isExpired
    ? "border-border"
    : isUrgent
      ? "border-[#E8192C]/40"
      : isWarning
        ? "border-amber-500/30"
        : "border-blue-500/20";

  const tierBg = isExpired
    ? "bg-muted/50"
    : isUrgent
      ? "bg-[#E8192C]/5"
      : isWarning
        ? "bg-amber-500/5"
        : "bg-blue-500/5";

  const tierIconBg = isExpired
    ? "bg-muted"
    : isUrgent
      ? "bg-[#E8192C]/15"
      : isWarning
        ? "bg-amber-500/10"
        : "bg-blue-500/10";

  const tierIconColor = isExpired
    ? "text-muted-foreground"
    : isUrgent
      ? "text-[#E8192C]"
      : isWarning
        ? "text-amber-500"
        : "text-blue-500";

  const tierCountdownColor = isExpired
    ? "text-muted-foreground"
    : isUrgent
      ? "text-[#E8192C]"
      : isWarning
        ? "text-amber-500"
        : "text-foreground";

  const Icon = isUrgent ? AlertTriangle : Clock;

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        tierBorder,
        tierBg,
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            tierIconBg,
            isUrgent && !isExpired && "animate-pulse"
          )}
        >
          <Icon className={cn("h-5 w-5", tierIconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          {isExpired ? (
            <p className="text-sm font-semibold text-muted-foreground">
              Time&apos;s up
            </p>
          ) : (
            <>
              <p
                className={cn(
                  "text-lg font-bold tabular-nums tracking-tight",
                  tierCountdownColor,
                  isUrgent && "animate-pulse"
                )}
              >
                {formatCountdown(remaining)}
              </p>
              <p className="text-xs text-muted-foreground">
                Reserved until {formatExpiryTime(expiresAt)}
              </p>
            </>
          )}
        </div>
      </div>
      {confirmationCode && (
        <div className="mt-3 rounded border border-border bg-card px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Confirmation Code
          </p>
          <p className="font-mono text-sm font-bold tracking-widest text-foreground">
            {confirmationCode}
          </p>
        </div>
      )}
    </div>
  );
}

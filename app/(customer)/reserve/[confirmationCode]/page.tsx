"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, XCircle, MapPin, Copy, Check } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { toast } from "sonner";

// ─── Countdown Hook ─────────────────────────────────────────────────────────

function useCountdown(expiresAt: number) {
  const [remaining, setRemaining] = useState(expiresAt - Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(expiresAt - Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return remaining;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

// ─── Status Badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    pending: {
      label: "Pending Pickup",
      className: "bg-blue-50 text-blue-700",
      icon: <Clock className="h-4 w-4" />,
    },
    fulfilled: {
      label: "Fulfilled",
      className: "bg-green-50 text-green-700",
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    expired: {
      label: "Expired",
      className: "bg-red-50 text-red-700",
      icon: <XCircle className="h-4 w-4" />,
    },
    cancelled: {
      label: "Cancelled",
      className: "bg-gray-50 text-gray-700",
      icon: <XCircle className="h-4 w-4" />,
    },
  };

  const c = config[status] ?? config.pending;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
        c.className
      )}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

// ─── Page Component ─────────────────────────────────────────────────────────

export default function ReservationConfirmationPage() {
  const params = useParams();
  const confirmationCode = params.confirmationCode as string;
  const [copied, setCopied] = useState(false);

  const reservation = useQuery(
    api.reservations.reservations.getReservationByConfirmation,
    { confirmationCode }
  );

  const remaining = useCountdown(reservation?.expiresAt ?? 0);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(confirmationCode);
      setCopied(true);
      toast.success("Confirmation code copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  // Loading
  if (reservation === undefined) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="space-y-4">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-24 animate-pulse rounded-lg border bg-muted" />
          <div className="h-40 animate-pulse rounded-lg border bg-muted" />
        </div>
      </div>
    );
  }

  // Not found
  if (reservation === null) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-4">
        <XCircle className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-medium">Reservation Not Found</p>
        <p className="text-sm text-muted-foreground">
          The confirmation code &ldquo;{confirmationCode}&rdquo; was not found.
        </p>
        <Link href="/browse" className="text-sm text-primary hover:underline">
          Back to browse
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      {/* Header */}
      <div className="mb-6 text-center">
        {reservation.status === "pending" && (
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-500" />
        )}
        <h1 className="text-2xl font-bold">
          {reservation.status === "pending"
            ? "Reserved!"
            : "Reservation Details"}
        </h1>
        {reservation.status === "pending" && (
          <p className="mt-1 text-sm text-muted-foreground">
            Pick up within 24 hours at {reservation.branchName}
          </p>
        )}
        <div className="mt-2">
          <StatusBadge status={reservation.status} />
        </div>
      </div>

      {/* Confirmation Code */}
      <div className="mb-6 rounded-lg border p-4 text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          Confirmation Code
        </p>
        <div className="mt-1 flex items-center justify-center gap-2">
          <span className="text-2xl font-bold tracking-wider">
            {reservation.confirmationCode}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded p-1.5 hover:bg-muted"
            aria-label="Copy confirmation code"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      {/* Reservation Details */}
      <div className="space-y-4 rounded-lg border p-4">
        {/* Item */}
        <div>
          <p className="text-xs text-muted-foreground">Reserved Item</p>
          <p className="font-medium">{reservation.styleName}</p>
          <p className="text-sm text-muted-foreground">
            {reservation.color} &middot; Size {reservation.size} &middot;{" "}
            {formatPrice(reservation.priceCentavos)}
          </p>
        </div>

        {/* Branch */}
        <div>
          <p className="text-xs text-muted-foreground">Pickup Branch</p>
          <div className="flex items-start gap-1.5">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">{reservation.branchName}</p>
              {reservation.branchAddress && (
                <p className="text-sm text-muted-foreground">
                  {reservation.branchAddress}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Pickup Deadline / Countdown */}
        {reservation.status === "pending" && (
          <div>
            <p className="text-xs text-muted-foreground">Pickup Deadline</p>
            <p className="font-medium">
              {new Date(reservation.expiresAt).toLocaleString("en-PH", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
            <p
              className={cn(
                "mt-1 text-sm font-medium",
                remaining > 0 ? "text-blue-600" : "text-red-600"
              )}
            >
              {remaining > 0 ? (
                <>
                  <Clock className="mr-1 inline h-3.5 w-3.5" />
                  {formatCountdown(remaining)}
                </>
              ) : (
                "Pickup window has expired"
              )}
            </p>
          </div>
        )}

        {/* Reserved for */}
        <div>
          <p className="text-xs text-muted-foreground">Reserved For</p>
          <p className="font-medium">{reservation.customerName}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 space-y-3 text-center">
        <Link
          href="/browse"
          className="inline-flex min-h-[44px] items-center justify-center rounded-md border px-6 py-2 text-sm font-medium hover:bg-accent"
        >
          Continue Browsing
        </Link>
      </div>
    </div>
  );
}

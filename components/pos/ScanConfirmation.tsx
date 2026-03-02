"use client";

import { useEffect, useRef } from "react";
import { Check, X, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { playSuccessChime, playErrorBuzz, playDuplicateTone } from "@/lib/sounds";

export type ScanResult = {
  type: "success" | "not-found" | "duplicate" | "loading";
  styleName?: string;
  size?: string;
  color?: string;
  priceCentavos?: number;
  stock?: number;
} | null;

type ScanConfirmationProps = {
  result: ScanResult;
  onDismiss: () => void;
};

export function ScanConfirmation({ result, onDismiss }: ScanConfirmationProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playedRef = useRef<ScanResult>(null);

  // Auto-dismiss after 2 seconds
  useEffect(() => {
    if (!result || result.type === "loading") return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(onDismiss, 2000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [result, onDismiss]);

  // Play audio on new result
  useEffect(() => {
    if (!result || result.type === "loading") {
      playedRef.current = null;
      return;
    }

    // Avoid replaying for same result object reference
    if (playedRef.current === result) return;
    playedRef.current = result;

    switch (result.type) {
      case "success":
        playSuccessChime();
        break;
      case "not-found":
        playErrorBuzz();
        break;
      case "duplicate":
        playDuplicateTone();
        break;
    }
  }, [result]);

  if (!result) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-16 z-50 flex justify-center px-4 lg:bottom-4"
      onClick={onDismiss}
    >
      <div
        className={cn(
          "flex w-full max-w-md items-center gap-3 rounded-lg border-2 p-4 shadow-lg",
          result.type === "success" &&
            "border-green-500 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100",
          result.type === "not-found" &&
            "animate-shake border-red-500 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100",
          result.type === "duplicate" &&
            "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
          result.type === "loading" &&
            "border-border bg-muted text-foreground"
        )}
      >
        {/* Icon */}
        <div className="flex-shrink-0">
          {result.type === "success" && (
            <Check className="h-6 w-6 text-green-600" />
          )}
          {result.type === "not-found" && (
            <X className="h-6 w-6 text-red-600" />
          )}
          {result.type === "duplicate" && (
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          )}
          {result.type === "loading" && (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {result.type === "success" && (
            <>
              <p className="font-semibold">{result.styleName}</p>
              <p className="text-sm opacity-80">
                {result.size} / {result.color} —{" "}
                {formatCurrency(result.priceCentavos ?? 0)}
              </p>
            </>
          )}
          {result.type === "not-found" && (
            <p className="font-semibold">Barcode not found</p>
          )}
          {result.type === "duplicate" && (
            <>
              <p className="font-semibold">Already in cart, qty updated</p>
              <p className="text-sm opacity-80">
                {result.styleName} — {result.size} / {result.color}
              </p>
            </>
          )}
          {result.type === "loading" && (
            <p className="font-semibold">Looking up barcode...</p>
          )}
        </div>
      </div>
    </div>
  );
}

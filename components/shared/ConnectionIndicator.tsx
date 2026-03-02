"use client";

import { useState, useEffect, useRef } from "react";
import { AlertTriangle, XCircle } from "lucide-react";

export type ConnectionStatus = "online" | "syncing" | "offline" | "error";

interface ConnectionIndicatorProps {
  status?: ConnectionStatus;
  onRetry?: () => void;
}

/**
 * Reusable hook that returns the current connection status.
 * Consumed by Story 4.2 for offline queue behavior.
 */
export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(() =>
    typeof navigator !== "undefined" && navigator.onLine ? "online" : "offline"
  );

  useEffect(() => {
    const handleOnline = () => setStatus("online");
    const handleOffline = () => setStatus("offline");

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return status;
}

export function ConnectionIndicator({
  status: statusOverride,
  onRetry,
}: ConnectionIndicatorProps) {
  const detectedStatus = useConnectionStatus();
  const status = statusOverride ?? detectedStatus;

  // Track previous status for transition animation
  const [showOnline, setShowOnline] = useState(false);
  const prevStatusRef = useRef<ConnectionStatus>(status);

  useEffect(() => {
    // Show online indicator briefly only when transitioning FROM another state
    if (status === "online" && prevStatusRef.current !== "online") {
      setShowOnline(true);
      const timer = setTimeout(() => setShowOnline(false), 2000);
      return () => clearTimeout(timer);
    }
    if (status !== "online") {
      setShowOnline(false);
    }
    prevStatusRef.current = status;
  }, [status]);

  // Single persistent aria-live region — content updates announce via screen reader.
  // Never swap DOM nodes: aria-live only fires for content changes within the same element.
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        status === "online" && !showOnline
          ? "sr-only"
          : "flex items-center gap-2 text-sm"
      }
    >
      {status === "online" && showOnline && (
        <span className="flex items-center gap-1.5 animate-fade-out">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
          <span className="text-green-700">Online</span>
        </span>
      )}

      {status === "syncing" && (
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-blue-700">Syncing...</span>
        </span>
      )}

      {status === "offline" && (
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="text-amber-700">Offline Mode</span>
        </span>
      )}

      {status === "error" && (
        <span className="flex items-center gap-1.5">
          <XCircle className="h-4 w-4 text-red-500" />
          <span className="text-red-700">Connection Error</span>
          <button
            onClick={() => onRetry?.()}
            className="ml-1 min-h-8 rounded px-2 py-1 text-xs font-medium text-red-700 underline hover:text-red-900"
          >
            Retry
          </button>
        </span>
      )}
    </div>
  );
}

"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { ROLE_DEFAULT_ROUTES } from "@/lib/routes";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { ConnectionIndicator } from "@/components/shared/ConnectionIndicator";
import {
  registerServiceWorker,
  cacheClerkToken,
  getCachedClerkToken,
  isTokenExpired,
} from "@/lib/serviceWorker";
import {
  getAllTransactions,
  deleteTransaction,
  clearStockSnapshot,
  type CreateTransactionArgs,
} from "@/lib/offlineQueue";
import { decrypt } from "@/lib/encryption";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";

const ALLOWED_ROLES = ["admin", "manager", "cashier"];

export default function PosLayout({ children }: { children: React.ReactNode }) {
  const currentUser = useQuery(api.auth.users.getCurrentUser);
  const router = useRouter();
  const pathname = usePathname();
  const { getToken } = useAuth();

  // Task 5.1: Sync status for ConnectionIndicator override during replay
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing">("idle");

  // Task 5.2: Mutations for replay and conflict flagging
  const createTransaction = useMutation(api.pos.transactions.createTransaction);
  const flagSyncConflict = useMutation(api.pos.offlineSync.flagSyncConflict);

  // H2 fix: Ref tracks latest currentUser so replayOfflineQueue always sees
  // the current value regardless of when the online event listener was registered
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  // H1 fix: Mutex prevents concurrent replay if online event fires rapidly
  const isSyncingRef = useRef(false);

  // Register service worker on mount (fire-and-forget)
  useEffect(() => {
    registerServiceWorker();
  }, []);

  // Cache Clerk token for offline auth (initial + on token rotation)
  useEffect(() => {
    let cancelled = false;
    async function cacheToken() {
      try {
        const token = await getToken();
        if (token && !cancelled) {
          cacheClerkToken(token);
        }
      } catch {
        // Token fetch failed — non-critical for POS operation
      }
    }
    cacheToken();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  // Task 5.3: Sequential offline queue replay
  // Standalone async function — not inlined in the event handler (avoids logic duplication)
  async function replayOfflineQueue() {
    // H1/H3 fix: mutex prevents concurrent replay on flapping online events,
    // and the finally block guarantees syncStatus always resets to "idle"
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    try {
      const queued = await getAllTransactions();
      if (queued.length === 0) return;

      setSyncStatus("syncing");

      // for...of ensures sequential replay — NOT Promise.all (prevents Convex race conditions)
      for (const entry of queued) {
        try {
          const payload = JSON.parse(
            await decrypt(entry.encryptedPayload)
          ) as CreateTransactionArgs;

          await createTransaction({
            ...payload,
            items: payload.items.map((item) => ({
              ...item,
              variantId: item.variantId as Id<"variants">,
            })),
          });
          await deleteTransaction(entry.id);
        } catch (error) {
          const err = error as Error;
          try {
            await flagSyncConflict({
              offlineTimestamp: entry.timestamp,
              errorCode: "REPLAY_FAILED",
              errorMessage: err.message,
            });
          } catch {
            // Non-critical — conflict flag is best-effort
          }
          // Always delete failed entry — never re-queue (prevents infinite retry loops)
          await deleteTransaction(entry.id);
        }
      }

      // H2 fix: use ref so we always get the latest branchId, not a stale closure
      // Discard stock snapshot — Convex real-time subscriptions resume on reconnect
      if (currentUserRef.current?.branchId) {
        await clearStockSnapshot(String(currentUserRef.current.branchId)).catch(() => {});
      }
    } finally {
      // H1/H3 fix: always release mutex and reset status — even on early return or error
      isSyncingRef.current = false;
      setSyncStatus("idle");
    }
  }

  // Task 5.4: On reconnect — refresh token then replay offline queue
  useEffect(() => {
    async function handleOnline() {
      let hasValidToken = false;
      try {
        const token = await getToken();
        if (token) {
          await cacheClerkToken(token);
          hasValidToken = true;
        } else {
          // getToken() returned null — Clerk session may have expired offline
          const cached = await getCachedClerkToken();
          if (cached && isTokenExpired(cached)) {
            router.replace("/sign-in");
            return; // Don't replay if redirecting to sign-in
          }
          // M3 fix: only replay if we have an unexpired cached token —
          // otherwise createTransaction + flagSyncConflict both fail (UNAUTHORIZED)
          // and the queued entry is silently deleted with no audit trail
          hasValidToken = cached !== null && !isTokenExpired(cached);
        }
      } catch {
        // Non-critical — POS continues operating
      }

      // Replay queued offline transactions after token refresh
      if (hasValidToken) {
        replayOfflineQueue().catch(() => {});
      }
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken, router]);

  useEffect(() => {
    if (
      currentUser !== undefined &&
      (!currentUser || !ALLOWED_ROLES.includes(currentUser.role))
    ) {
      const role = currentUser?.role;
      const defaultRoute = role
        ? ROLE_DEFAULT_ROUTES[role as keyof typeof ROLE_DEFAULT_ROUTES] ?? "/"
        : "/";
      router.replace(defaultRoute);
    }
  }, [currentUser, router]);

  if (currentUser === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!currentUser || !ALLOWED_ROLES.includes(currentUser.role)) {
    return null;
  }

  return (
    <ErrorBoundary>
      <div className="theme-pos min-h-screen">
        <div className="flex items-center justify-end gap-4 px-4 py-1">
          {/* Demand log quick-access link — hidden when already on that page */}
          {pathname !== "/pos/demand" && (
            <Link
              href="/pos/demand"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Log Demand
            </Link>
          )}
          {/* Returns quick-access link — hidden when already on that page */}
          {pathname !== "/pos/returns" && (
            <Link
              href="/pos/returns"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Returns
            </Link>
          )}
          {/* Task 5.5: Override status to "syncing" during offline queue replay */}
          <ConnectionIndicator
            status={syncStatus === "syncing" ? "syncing" : undefined}
          />
        </div>
        {children}
      </div>
    </ErrorBoundary>
  );
}

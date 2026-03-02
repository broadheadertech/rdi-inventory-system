"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Clock, Phone, User } from "lucide-react";
import { toast } from "sonner";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_TABS = ["all", "pending", "fulfilled", "expired", "cancelled"] as const;
type StatusTab = (typeof STATUS_TABS)[number];

function relativeTime(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatCountdown(expiresAt: number): string {
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return "Expired";
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  return `${hours}h ${minutes}m left`;
}

function ReservationStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        status === "pending" && "bg-blue-100 text-blue-800",
        status === "fulfilled" && "bg-green-100 text-green-800",
        status === "expired" && "bg-red-100 text-red-800",
        status === "cancelled" && "bg-gray-100 text-gray-800"
      )}
    >
      {status === "pending" && <Clock className="h-3 w-3" />}
      {status === "fulfilled" && <CheckCircle2 className="h-3 w-3" />}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BranchReservationsPage() {
  const [activeTab, setActiveTab] = useState<StatusTab>("all");
  const [confirmCancel, setConfirmCancel] = useState<Id<"reservations"> | null>(null);
  const [actionLoading, setActionLoading] = useState<Id<"reservations"> | null>(null);
  const [, setTick] = useState(0);

  // Refresh countdown values every 60 seconds
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const reservations = useQuery(
    api.reservations.manage.listBranchReservations,
    activeTab === "all" ? {} : { statusFilter: activeTab }
  );

  const fulfillReservation = useMutation(api.reservations.manage.fulfillReservation);
  const cancelReservation = useMutation(api.reservations.manage.cancelReservation);

  const pagination = usePagination(reservations ?? undefined);

  async function handleFulfill(reservationId: Id<"reservations">) {
    setActionLoading(reservationId);
    try {
      await fulfillReservation({ reservationId });
      toast.success("Reservation fulfilled");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fulfill reservation";
      toast.error(msg);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancel(reservationId: Id<"reservations">) {
    setActionLoading(reservationId);
    try {
      await cancelReservation({ reservationId });
      toast.success("Reservation cancelled — stock restored");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to cancel reservation";
      toast.error(msg);
    } finally {
      setActionLoading(null);
      setConfirmCancel(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reservations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage customer pickup reservations
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === tab
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Reservations Table */}
      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Code</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Item</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Branch</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Expiry</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Loading skeleton */}
              {reservations === undefined &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b animate-pulse">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded bg-muted w-full" />
                      </td>
                    ))}
                  </tr>
                ))}

              {/* Empty state */}
              {reservations !== undefined && reservations.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    {activeTab === "all"
                      ? "No reservations yet."
                      : `No ${activeTab} reservations.`}
                  </td>
                </tr>
              )}

              {/* Data rows */}
              {pagination.paginatedData.map((r) => (
                <tr key={r._id} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs font-medium">
                    {r.confirmationCode}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-1 font-medium">
                        <User className="h-3 w-3 text-muted-foreground" />
                        {r.customerName}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {r.customerPhone}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{r.styleName}</span>
                      <span className="text-xs text-muted-foreground">
                        {r.size} / {r.color}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">{r.branchName}</td>
                  <td className="px-4 py-3">
                    <ReservationStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.status === "pending" ? (
                      <span
                        className={cn(
                          r.expiresAt < Date.now() && "text-red-600 font-medium"
                        )}
                      >
                        {formatCountdown(r.expiresAt)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {relativeTime(r.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {r.status === "pending" && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actionLoading === r._id}
                          onClick={() => handleFulfill(r._id)}
                          className="text-green-700 border-green-300 hover:bg-green-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Fulfill
                        </Button>
                        {confirmCancel === r._id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={actionLoading === r._id}
                              onClick={() => handleCancel(r._id)}
                            >
                              Confirm
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmCancel(null)}
                            >
                              No
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actionLoading === r._id}
                            onClick={() => setConfirmCancel(r._id)}
                            className="text-red-700 border-red-300 hover:bg-red-50"
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" />
                            Cancel
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          hasNextPage={pagination.hasNextPage}
          hasPrevPage={pagination.hasPrevPage}
          onNextPage={pagination.nextPage}
          onPrevPage={pagination.prevPage}
          noun="reservation"
        />
      </div>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Notification type styles ──────────────────────────────────────────────────

const TYPE_STYLES: Record<string, { dot: string; bg: string }> = {
  transfer_requested: { dot: "bg-blue-500",   bg: "bg-blue-50" },
  transfer_approved:  { dot: "bg-green-500",  bg: "bg-green-50" },
  transfer_rejected:  { dot: "bg-red-500",    bg: "bg-red-50" },
  transfer_packed:    { dot: "bg-violet-500", bg: "bg-violet-50" },
  driver_assigned:    { dot: "bg-cyan-500",   bg: "bg-cyan-50" },
  driver_in_transit:  { dot: "bg-amber-500",  bg: "bg-amber-50" },
  driver_arrived:     { dot: "bg-orange-500", bg: "bg-orange-50" },
  driver_delivered:   { dot: "bg-green-600",  bg: "bg-green-50" },
  transfer_confirmed: { dot: "bg-emerald-600",bg: "bg-emerald-50" },
  transfer_cancelled: { dot: "bg-gray-400",   bg: "bg-gray-50" },
  supply_discrepancy: { dot: "bg-red-500",    bg: "bg-red-50" },
};

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000)  return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

// ═══════════════════════════════════════════════════════════════════════════════

export function StaffNotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const notifications = useQuery(api.logistics.notificationRecords.getMyStaffNotifications);
  const markAllRead   = useMutation(api.logistics.notificationRecords.markAllRead);
  const markRead      = useMutation(api.logistics.notificationRecords.markRead);

  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  async function handleMarkRead(id: string, isRead: boolean) {
    if (isRead) return;
    await markRead({ id: id as Id<"staffNotifications"> });
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex items-center justify-center h-8 w-8 rounded-full transition-colors",
          open ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute left-0 top-9 z-50 w-80 rounded-xl border bg-white shadow-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50/80">
            <p className="text-sm font-semibold">Notifications</p>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead({})}
                className="text-xs text-primary hover:underline font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y">
            {notifications === undefined && (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 rounded bg-muted animate-pulse" />
                ))}
              </div>
            )}

            {notifications !== undefined && notifications.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <Bell className="h-6 w-6 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No notifications yet.</p>
              </div>
            )}

            {notifications?.map((n) => {
              const style = TYPE_STYLES[n.type] ?? { dot: "bg-gray-400", bg: "bg-gray-50" };
              return (
                <button
                  key={n._id}
                  onClick={() => handleMarkRead(n._id, n.isRead)}
                  className={cn(
                    "w-full text-left px-4 py-3 flex gap-3 transition-colors hover:bg-muted/40",
                    !n.isRead && style.bg
                  )}
                >
                  {/* Colored dot */}
                  <span className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", style.dot)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn("text-xs font-semibold leading-snug", !n.isRead ? "text-gray-900" : "text-gray-600")}>
                        {n.title}
                      </p>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                      {n.body}
                    </p>
                  </div>
                  {/* Unread indicator */}
                  {!n.isRead && (
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          {notifications && notifications.length > 0 && (
            <div className="px-4 py-2 border-t bg-gray-50/80 text-center">
              <p className="text-[11px] text-muted-foreground">
                Showing last {notifications.length} notifications
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

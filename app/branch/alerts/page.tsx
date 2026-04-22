"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Bell, BellOff, Package, AlertTriangle } from "lucide-react";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StockBadge({ quantity, threshold }: { quantity: number; threshold: number }) {
  if (quantity <= 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-semibold text-red-700">
        <AlertTriangle className="h-3 w-3" />
        Out of Stock
      </span>
    );
  }
  if (quantity <= threshold) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-700">
        <AlertTriangle className="h-3 w-3" />
        Low Stock
      </span>
    );
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════════════

const PAGE_SIZE = 10;

export default function BranchAlertsPage() {
  const alerts = useQuery(api.inventory.alerts.getLowStockAlerts);
  const dismiss = useMutation(api.inventory.alerts.dismissLowStockAlert);

  const pagination = usePagination(alerts ?? [], PAGE_SIZE);

  async function handleDismiss(alertId: Id<"lowStockAlerts">) {
    await dismiss({ alertId });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="h-6 w-6 text-amber-500" />
            Stock Alerts
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Active low-stock alerts for your branch
          </p>
        </div>
        {alerts !== undefined && alerts.length > 0 && (
          <span className="rounded-full bg-amber-100 border border-amber-200 px-3 py-1 text-sm font-semibold text-amber-800">
            {alerts.length} active {alerts.length === 1 ? "alert" : "alerts"}
          </span>
        )}
      </div>

      {/* Table */}
      {alerts === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 gap-3 text-center">
          <BellOff className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No active alerts</p>
          <p className="text-xs text-muted-foreground/70">
            All inventory levels are above their reorder thresholds.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium text-right">Stock</th>
                <th className="px-4 py-3 font-medium text-right">Threshold</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Raised</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {pagination.paginatedData.map((alert) => (
                <tr key={alert.alertId as string} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{alert.styleName}</p>
                        <p className="text-xs text-muted-foreground">
                          {alert.size} · {alert.color}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {alert.sku}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={
                        alert.quantity <= 0
                          ? "font-bold text-red-600"
                          : "font-semibold text-amber-600"
                      }
                    >
                      {alert.quantity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {alert.threshold}
                  </td>
                  <td className="px-4 py-3">
                    <StockBadge quantity={alert.quantity} threshold={alert.threshold} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {relativeTime(alert.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDismiss(alert.alertId)}
                      className="rounded-md border border-muted px-2 py-1 text-xs font-medium text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                    >
                      Dismiss
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t px-4 py-3">
            <TablePagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              hasNextPage={pagination.hasNextPage}
              hasPrevPage={pagination.hasPrevPage}
              onNextPage={pagination.nextPage}
              onPrevPage={pagination.prevPage}
              noun="alert"
            />
          </div>
        </div>
      )}
    </div>
  );
}

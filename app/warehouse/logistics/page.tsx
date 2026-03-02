"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { cn, relativeTime } from "@/lib/utils";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        status === "packed" && "bg-purple-100 text-purple-800",
        status === "inTransit" && "bg-orange-100 text-orange-800",
        status === "arrived" && "bg-amber-100 text-amber-800",
        status === "delivered" && "bg-green-100 text-green-800"
      )}
    >
      {status === "inTransit"
        ? "In Transit"
        : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b animate-pulse">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 rounded bg-muted w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Tab Types ────────────────────────────────────────────────────────────────

type Tab = "assign" | "active" | "completed";

const TABS: { value: Tab; label: string }[] = [
  { value: "assign", label: "Ready to Assign" },
  { value: "active", label: "Active Deliveries" },
  { value: "completed", label: "Completed" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HQLogisticsPage() {
  const packed = useQuery(api.logistics.assignments.listPackedForAssignment);
  const drivers = useQuery(api.logistics.assignments.listActiveDrivers);
  const active = useQuery(api.logistics.assignments.listActiveDeliveries);
  const completed = useQuery(
    api.logistics.assignments.listCompletedDeliveries
  );
  const assignMut = useMutation(
    api.logistics.assignments.assignDriverToTransfer
  );

  const packedPagination = usePagination(packed);
  const activePagination = usePagination(active);
  const completedPagination = usePagination(completed);

  const [activeTab, setActiveTab] = useState<Tab>("assign");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assigningTransferId, setAssigningTransferId] =
    useState<Id<"transfers"> | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openAssignDialog(transferId: Id<"transfers">) {
    setAssigningTransferId(transferId);
    setSelectedDriverId("");
    setError(null);
    setDialogOpen(true);
  }

  function handleAssign() {
    if (!assigningTransferId || !selectedDriverId) return;
    setSubmitting(true);
    setError(null);
    assignMut({
      transferId: assigningTransferId,
      driverId: selectedDriverId as Id<"users">,
    }).then(
      () => {
        setSubmitting(false);
        setDialogOpen(false);
        setAssigningTransferId(null);
        setSelectedDriverId("");
      },
      (err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Assignment failed — try again."
        );
        setSubmitting(false);
      }
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Logistics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Assign drivers to transfers and track delivery progress
        </p>
      </div>

      {/* ── Tab navigation ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          let count: number | undefined;
          if (tab.value === "assign") count = packed?.length;
          if (tab.value === "active") count = active?.length;
          if (tab.value === "completed") count = completed?.length;

          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                activeTab === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {tab.label}
              {count !== undefined && (
                <span className="ml-1.5 text-xs opacity-70">({count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Ready to Assign ────────────────────────────────────────────── */}
      {activeTab === "assign" && (
        <div className="rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    From Branch
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    To Branch
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Requested By
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Items
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Packed At
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {packed === undefined && <SkeletonRows cols={6} />}

                {packed !== undefined && packed.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No packed transfers awaiting driver assignment.
                    </td>
                  </tr>
                )}

                {packedPagination.paginatedData.map((transfer) => (
                  <tr
                    key={transfer._id}
                    className="border-b hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-medium">
                      {transfer.fromBranchName}
                    </td>
                    <td className="px-4 py-3">{transfer.toBranchName}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {transfer.requestorName}
                    </td>
                    <td className="px-4 py-3">
                      {transfer.itemCount}{" "}
                      {transfer.itemCount === 1 ? "item" : "items"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {relativeTime(transfer.packedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
                        onClick={() => openAssignDialog(transfer._id)}
                        disabled={!drivers || drivers.length === 0}
                      >
                        Assign Driver
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={packedPagination.currentPage}
            totalPages={packedPagination.totalPages}
            totalItems={packedPagination.totalItems}
            hasNextPage={packedPagination.hasNextPage}
            hasPrevPage={packedPagination.hasPrevPage}
            onNextPage={packedPagination.nextPage}
            onPrevPage={packedPagination.prevPage}
            noun="transfer"
          />
        </div>
      )}

      {/* ── Active Deliveries ──────────────────────────────────────────── */}
      {activeTab === "active" && (
        <div className="rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Driver
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    From → To
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Items
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Dispatched
                  </th>
                </tr>
              </thead>
              <tbody>
                {active === undefined && <SkeletonRows cols={5} />}

                {active !== undefined && active.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No active deliveries in progress.
                    </td>
                  </tr>
                )}

                {activePagination.paginatedData.map((delivery) => (
                  <tr
                    key={delivery._id}
                    className="border-b hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-medium">
                      {delivery.driverName}
                    </td>
                    <td className="px-4 py-3">
                      {delivery.fromBranchName} → {delivery.toBranchName}
                    </td>
                    <td className="px-4 py-3">
                      {delivery.itemCount}{" "}
                      {delivery.itemCount === 1 ? "item" : "items"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={
                          delivery.driverArrivedAt ? "arrived" : "inTransit"
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {delivery.shippedAt
                        ? relativeTime(delivery.shippedAt)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={activePagination.currentPage}
            totalPages={activePagination.totalPages}
            totalItems={activePagination.totalItems}
            hasNextPage={activePagination.hasNextPage}
            hasPrevPage={activePagination.hasPrevPage}
            onNextPage={activePagination.nextPage}
            onPrevPage={activePagination.prevPage}
            noun="delivery"
          />
        </div>
      )}

      {/* ── Completed ──────────────────────────────────────────────────── */}
      {activeTab === "completed" && (
        <div className="rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Driver
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    From → To
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Items
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Delivered At
                  </th>
                </tr>
              </thead>
              <tbody>
                {completed === undefined && <SkeletonRows cols={4} />}

                {completed !== undefined && completed.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No completed deliveries yet.
                    </td>
                  </tr>
                )}

                {completedPagination.paginatedData.map((delivery) => (
                  <tr
                    key={delivery._id}
                    className="border-b hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-medium">
                      {delivery.driverName}
                    </td>
                    <td className="px-4 py-3">
                      {delivery.fromBranchName} → {delivery.toBranchName}
                    </td>
                    <td className="px-4 py-3">
                      {delivery.itemCount}{" "}
                      {delivery.itemCount === 1 ? "item" : "items"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {delivery.deliveredAt
                        ? relativeTime(delivery.deliveredAt)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={completedPagination.currentPage}
            totalPages={completedPagination.totalPages}
            totalItems={completedPagination.totalItems}
            hasNextPage={completedPagination.hasNextPage}
            hasPrevPage={completedPagination.hasPrevPage}
            onNextPage={completedPagination.nextPage}
            onPrevPage={completedPagination.prevPage}
            noun="delivery"
          />
        </div>
      )}

      {/* ── Assign Driver Dialog ───────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Driver</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Driver</label>
              <Select
                value={selectedDriverId}
                onValueChange={setSelectedDriverId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a driver..." />
                </SelectTrigger>
                <SelectContent>
                  {drivers?.map((driver) => (
                    <SelectItem key={driver._id} value={driver._id}>
                      {driver.name} ({driver.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              disabled={!selectedDriverId || submitting}
            >
              {submitting ? "Assigning..." : "Assign & Dispatch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

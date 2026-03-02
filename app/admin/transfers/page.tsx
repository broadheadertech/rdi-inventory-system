"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, relativeTime } from "@/lib/utils";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";

function TransferStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        status === "requested" && "bg-amber-100 text-amber-800",
        status === "approved" && "bg-blue-100 text-blue-800",
        status === "rejected" && "bg-red-100 text-red-800",
        status === "packed" && "bg-purple-100 text-purple-800",
        status === "inTransit" && "bg-orange-100 text-orange-800",
        status === "delivered" && "bg-green-100 text-green-800",
        status === "cancelled" && "bg-gray-100 text-gray-800"
      )}
    >
      {status === "inTransit"
        ? "In Transit"
        : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function TransferTypeBadge({ type }: { type: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        type === "return"
          ? "bg-rose-50 text-rose-700 border border-rose-200"
          : "bg-sky-50 text-sky-700 border border-sky-200"
      )}
    >
      {type === "return" ? "Return" : "Request"}
    </span>
  );
}

// M4: show timestamp for a completed stage
function StageTimestamp({
  label,
  ts,
}: {
  label: string;
  ts: number | null | undefined;
}) {
  if (!ts) return null;
  return (
    <p className="text-xs text-muted-foreground mt-0.5">
      {label}: {relativeTime(ts)}
    </p>
  );
}

// ─── Filter tabs ───────────────────────────────────────────────────────────────

type FilterTab = "all" | "requested" | "approved" | "rejected" | "packed" | "inTransit" | "delivered" | "cancelled" | "returns";

const TABS: { value: FilterTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "requested", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "packed", label: "Packed" },
  { value: "inTransit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
  { value: "returns", label: "Returns" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HQTransfersPage() {
  const currentUser = useQuery(api.auth.users.getCurrentUser);
  const transfers = useQuery(api.transfers.requests.listTransfers, {});
  const approve = useMutation(api.transfers.requests.approveTransfer);
  const reject = useMutation(api.transfers.requests.rejectTransfer);
  const cancel = useMutation(api.transfers.requests.cancelTransfer);

  const canApprove =
    currentUser?.role === "admin" || currentUser?.role === "hqStaff";

  // ── Filter state ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<FilterTab>("requested");

  // ── Reject inline form state ───────────────────────────────────────────────
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  // M1 fix: approve error state — track which row failed and show inline message
  const [approveErrorId, setApproveErrorId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // ── Action handlers ───────────────────────────────────────────────────────

  function handleApprove(transferId: Id<"transfers">) {
    // M1 fix: surface approval errors to the user
    setApproveErrorId(null);
    approve({ transferId }).then(
      () => undefined,
      () => setApproveErrorId(transferId)
    );
  }

  function handleRejectConfirm(transferId: Id<"transfers">) {
    if (!rejectReason.trim()) {
      setRejectError("Rejection reason is required.");
      return;
    }
    setRejectError(null);
    reject({ transferId, reason: rejectReason }).then(
      () => {
        setRejectingId(null);
        setRejectReason("");
      },
      () => setRejectError("Rejection failed — try again.")
    );
  }

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = (transfers ?? []).filter((transfer) => {
    if (activeTab === "all") return true;
    if (activeTab === "returns") return transfer.type === "return";
    return transfer.status === activeTab;
  });

  const pagination = usePagination(filtered);

  const emptyLabel =
    activeTab === "requested" ? "pending" : activeTab === "returns" ? "return" : activeTab === "all" ? "" : activeTab;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Transfer Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Approve or reject stock transfers — typically from Central Warehouse to retail branches.
        </p>
      </div>

      {/* ── Filter tabs ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
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
            {tab.value !== "all" && transfers !== undefined && (
              <span className="ml-1.5 text-xs opacity-70">
                ({tab.value === "returns"
                  ? transfers.filter((t) => t.type === "return").length
                  : transfers.filter((t) => t.status === tab.value).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Transfers Table ───────────────────────────────────────────────── */}
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
                  Type
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Status
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Items
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Requested At
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {transfers === undefined &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b animate-pulse">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded bg-muted w-full" />
                      </td>
                    ))}
                  </tr>
                ))}

              {transfers !== undefined && filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    {emptyLabel
                      ? `No ${emptyLabel} transfer requests.`
                      : "No transfer requests."}
                  </td>
                </tr>
              )}

              {pagination.paginatedData.map((transfer) => (
                <tr key={transfer._id} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    {transfer.fromBranchName}
                  </td>
                  <td className="px-4 py-3">{transfer.toBranchName}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {transfer.requestorName}
                  </td>
                  <td className="px-4 py-3">
                    <TransferTypeBadge type={transfer.type} />
                  </td>
                  <td className="px-4 py-3">
                    <TransferStatusBadge status={transfer.status} />
                    {/* M4 fix: show stage timestamps below the status badge */}
                    <StageTimestamp label="Approved" ts={transfer.approvedAt} />
                    <StageTimestamp label="Rejected" ts={transfer.rejectedAt} />
                    {transfer.status === "rejected" && transfer.rejectedReason && (
                      <p className="text-xs text-muted-foreground mt-1 max-w-[160px] truncate">
                        {transfer.rejectedReason}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      {transfer.items.map((item) => (
                        <p key={item.sku} className="text-xs">
                          <span className="font-medium">{item.styleName}</span>{" "}
                          <span className="text-muted-foreground">{item.size}/{item.color}</span>{" "}
                          <span className="font-semibold">x{item.requestedQuantity}</span>
                        </p>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {relativeTime(transfer.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {canApprove && transfer.status === "requested" && (
                      rejectingId === transfer._id ? (
                        <div className="flex flex-col gap-1 min-w-[200px]">
                          <Input
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Rejection reason…"
                            className="h-8 text-xs"
                          />
                          {rejectError && (
                            <p className="text-xs text-destructive">{rejectError}</p>
                          )}
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-xs"
                              onClick={() =>
                                handleRejectConfirm(transfer._id as Id<"transfers">)
                              }
                            >
                              Confirm
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => {
                                setRejectingId(null);
                                setRejectReason("");
                                setRejectError(null);
                              }}
                            >
                              Back
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
                              onClick={() =>
                                handleApprove(transfer._id as Id<"transfers">)
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-destructive text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                setRejectingId(transfer._id);
                                setRejectReason("");
                                setRejectError(null);
                                setApproveErrorId(null);
                              }}
                            >
                              Reject
                            </Button>
                          </div>
                          {approveErrorId === transfer._id && (
                            <p className="text-xs text-destructive">
                              Approval failed — try again.
                            </p>
                          )}
                        </div>
                      )
                    )}
                    {canApprove && transfer.status === "requested" && (
                      cancellingId === transfer._id ? (
                        <div className="flex items-center gap-1 mt-1">
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-xs"
                            onClick={() => {
                              cancel({ transferId: transfer._id as Id<"transfers"> }).then(
                                () => setCancellingId(null),
                                () => setCancellingId(null)
                              );
                            }}
                          >
                            Confirm Cancel
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => setCancellingId(null)}
                          >
                            No
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-gray-600 border-gray-300 hover:bg-gray-50 mt-1"
                          onClick={() => setCancellingId(transfer._id)}
                        >
                          Cancel Transfer
                        </Button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <TablePagination
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        hasNextPage={pagination.hasNextPage}
        hasPrevPage={pagination.hasPrevPage}
        onNextPage={pagination.nextPage}
        onPrevPage={pagination.prevPage}
        noun="transfer"
      />
    </div>
  );
}

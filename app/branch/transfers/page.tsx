"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
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
          ? "bg-orange-100 text-orange-800"
          : type === "interBranch"
            ? "bg-violet-100 text-violet-800"
            : "bg-cyan-100 text-cyan-800"
      )}
    >
      {type === "return" ? "Return" : type === "interBranch" ? "Inter-Branch" : "Request"}
    </span>
  );
}

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

// ─── Item row state type ───────────────────────────────────────────────────────

type ItemRow = {
  sku: string;
  styleName: string;
  size: string;
  color: string;
  availableQty: number;
  requestedQuantity: number;
};

type FormTab = "request" | "return" | "send";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BranchTransfersPage() {
  const currentUser = useQuery(api.auth.users.getCurrentUser);
  const transfers = useQuery(api.transfers.requests.listTransfers, {});
  const warehouseBranch = useQuery(api.transfers.requests.getWarehouseBranch);
  const branches = useQuery(api.transfers.requests.listActiveBranches);
  const createTransfer = useMutation(api.transfers.requests.createTransferRequest);
  const cancelTransfer = useMutation(api.transfers.requests.cancelTransfer);
  const acknowledgeInterBranch = useMutation(api.transfers.requests.acknowledgeInterBranch);
  const declineInterBranch = useMutation(api.transfers.requests.declineInterBranch);

  const pagination = usePagination(transfers ?? undefined);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const isManager =
    currentUser?.role === "admin" || currentUser?.role === "manager";
  const userBranchId = currentUser?.branchId as Id<"branches"> | undefined;
  const userBranch = branches?.find((b) => b._id === userBranchId);
  const userBranchName = userBranch?.name ?? "Your branch";
  const isWarehouseUser = userBranch?.channel === "warehouse";

  // Other branches for "Send to Branch" dropdown (warehouse or inter-branch)
  const retailBranches = branches?.filter(
    (b) => b.channel !== "warehouse" && b.isActive && b._id !== userBranchId
  );

  // State for acknowledge/decline
  const [declineId, setDeclineId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);

  // ── Form state ────────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [formTab, setFormTab] = useState<FormTab>(isWarehouseUser ? "send" : "request");
  const [notes, setNotes] = useState<string>("");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [searchText, setSearchText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [destinationBranchId, setDestinationBranchId] = useState<string>("");

  // Determine which branch inventory to search
  const searchBranchId =
    formTab === "request"
      ? warehouseBranch?._id          // retail requesting from warehouse
      : userBranchId;                  // return, send — always own branch stock

  const searchResults = useQuery(
    api.inventory.stockLevels.searchBranchInventory,
    searchBranchId && searchText.length >= 2
      ? { searchText, branchId: searchBranchId as Id<"branches"> }
      : "skip"
  );

  function addItem(result: {
    sku: string;
    styleName: string;
    size: string;
    color: string;
    availableQty: number;
  }) {
    if (items.some((i) => i.sku === result.sku)) return;
    setItems((prev) => [...prev, { ...result, requestedQuantity: 1 }]);
    setSearchText("");
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateQty(index: number, qty: number) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, requestedQuantity: Math.max(1, qty) } : item))
    );
  }

  function resetForm() {
    setNotes("");
    setItems([]);
    setSearchText("");
    setFormError(null);
    setSubmitting(false);
    setShowForm(false);
    setDestinationBranchId("");
  }

  function switchTab(tab: FormTab) {
    setFormTab(tab);
    setItems([]);
    setSearchText("");
    setFormError(null);
    setNotes("");
    setDestinationBranchId("");
  }

  function handleSubmit() {
    if (!userBranchId) {
      setFormError("You must be assigned to a branch.");
      return;
    }

    let fromBranchId: Id<"branches">;
    let toBranchId: Id<"branches">;
    let transferType: "stockRequest" | "return" | "interBranch";

    if (formTab === "send") {
      // Branch sending to another branch (warehouse→retail or retail→retail)
      if (!destinationBranchId) {
        setFormError("Select a destination branch.");
        return;
      }
      fromBranchId = userBranchId;
      toBranchId = destinationBranchId as Id<"branches">;
      transferType = isWarehouseUser ? "stockRequest" : "interBranch";
    } else if (formTab === "request") {
      // Retail requesting from warehouse
      if (!warehouseBranch) {
        setFormError("No warehouse branch configured. Please contact admin.");
        return;
      }
      fromBranchId = warehouseBranch._id;
      toBranchId = userBranchId;
      transferType = "stockRequest";
    } else {
      // Return to warehouse
      if (!warehouseBranch) {
        setFormError("No warehouse branch configured. Please contact admin.");
        return;
      }
      fromBranchId = userBranchId;
      toBranchId = warehouseBranch._id;
      transferType = "return";
    }

    if (items.length === 0) {
      setFormError("Add at least one item.");
      return;
    }
    for (const item of items) {
      if (!Number.isInteger(item.requestedQuantity) || item.requestedQuantity <= 0) {
        setFormError("All quantities must be positive whole numbers.");
        return;
      }
      if (item.requestedQuantity > item.availableQty) {
        setFormError(`${item.styleName} (${item.size}/${item.color}): only ${item.availableQty} available, but ${item.requestedQuantity} requested.`);
        return;
      }
    }
    if (formTab === "return" && !notes.trim()) {
      setFormError("A reason is required for return requests.");
      return;
    }

    setFormError(null);
    setSubmitting(true);
    createTransfer({
      fromBranchId,
      toBranchId,
      type: transferType,
      notes: notes.trim() || undefined,
      items: items.map((item) => ({
        sku: item.sku,
        requestedQuantity: item.requestedQuantity,
      })),
    }).then(
      () => resetForm(),
      (err: unknown) => {
        setFormError(
          err instanceof Error ? err.message : "Failed to create request — try again."
        );
        setSubmitting(false);
      }
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transfer Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isWarehouseUser
              ? "Send products to retail branches."
              : "Request products from the warehouse or return items."}
          </p>
        </div>
        {isManager && (
          <Button onClick={() => {
            setShowForm((s) => !s);
            if (!showForm) setFormTab(isWarehouseUser ? "send" : "request");
          }}>
            {showForm ? "Cancel" : isWarehouseUser ? "Send to Branch" : "New Request"}
          </Button>
        )}
      </div>

      {/* ── New Transfer Form ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          {/* Form tabs */}
          <div className="flex gap-1 border-b">
            {isWarehouseUser ? (
              <button
                className="px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary transition-colors -mb-px"
              >
                Send to Branch
              </button>
            ) : (
              <>
                <button
                  onClick={() => switchTab("request")}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    formTab === "request"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Request Products
                </button>
                <button
                  onClick={() => switchTab("return")}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    formTab === "return"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Return to Warehouse
                </button>
                <button
                  onClick={() => switchTab("send")}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    formTab === "send"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Send to Branch
                </button>
              </>
            )}
          </div>

          {/* Direction display */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">From</label>
              <div className="w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">
                {formTab === "send"
                  ? userBranchName
                  : formTab === "request"
                    ? warehouseBranch?.name ?? "Loading warehouse..."
                    : userBranchName}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">To</label>
              {formTab === "send" ? (
                <Select value={destinationBranchId} onValueChange={setDestinationBranchId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination branch…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(retailBranches ?? []).map((b) => (
                      <SelectItem key={b._id} value={b._id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">
                  {formTab === "request"
                    ? userBranchName
                    : warehouseBranch?.name ?? "Loading warehouse..."}
                </div>
              )}
            </div>
          </div>

          {/* Notes / Reason */}
          <div className="space-y-1">
            <label className="text-sm font-medium">
              {formTab === "return" ? "Reason for Return *" : "Notes (optional)"}
            </label>
            {formTab === "send" && (
              <p className="text-xs text-muted-foreground">Add delivery instructions or transfer notes.</p>
            )}
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[64px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                formTab === "return"
                  ? "Describe why these items are being returned (damaged, defective, etc.)…"
                  : "Any special instructions…"
              }
            />
          </div>

          {/* Product search */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {formTab === "request"
                ? "Search Warehouse Products"
                : formTab === "send"
                  ? "Search Your Branch Inventory"
                  : "Search Your Branch Inventory"}
            </label>
            {!searchBranchId ? (
              <p className="text-sm text-muted-foreground">Loading branch data...</p>
            ) : (
              <>
                <div className="relative max-w-md">
                  <Input
                    placeholder="Search by name or SKU..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                  />
                </div>
                {searchText.length >= 2 && searchResults && searchResults.length > 0 && (
                  <div className="max-w-md rounded-md border bg-white shadow-md max-h-60 overflow-y-auto">
                    {searchResults.map((v) => (
                      <button
                        key={v.variantId}
                        onClick={() => addItem(v)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left",
                          items.some((i) => i.sku === v.sku) && "opacity-40 pointer-events-none"
                        )}
                      >
                        <div>
                          <span className="font-medium">{v.styleName}</span>
                          <span className="text-muted-foreground ml-2">{v.size} / {v.color}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{v.sku}</span>
                          <span className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded">{v.availableQty} in stock</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {searchText.length >= 2 && searchResults && searchResults.length === 0 && (
                  <p className="text-sm text-muted-foreground">No products found.</p>
                )}
              </>
            )}
          </div>

          {/* Selected items */}
          {items.length > 0 && (
            <div className="space-y-2">
              <span className="text-sm font-medium">
                {formTab === "send"
                  ? "Items to Send"
                  : formTab === "request"
                    ? "Items to Request"
                    : "Items to Return"} ({items.length})
              </span>
              <div className="rounded-md border divide-y">
                {items.map((item, index) => (
                  <div key={item.sku} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.styleName}</p>
                      <p className="text-xs text-muted-foreground">{item.size} / {item.color} — {item.availableQty} available</p>
                    </div>
                    <Input
                      className="w-20"
                      type="number"
                      min={1}
                      max={item.availableQty}
                      step={1}
                      value={item.requestedQuantity}
                      onChange={(e) => updateQty(index, Number(e.target.value))}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(index)}
                      className="text-destructive shrink-0"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {formError && (
            <p className="text-sm text-destructive">{formError}</p>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={resetForm}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting
                ? "Submitting…"
                : formTab === "send"
                  ? "Send Transfer"
                  : formTab === "request"
                    ? "Submit Request"
                    : "Submit Return"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Transfers Table ───────────────────────────────────────────────── */}
      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">From</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">To</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Items</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Notes</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transfers === undefined &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b animate-pulse">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded bg-muted w-full" />
                      </td>
                    ))}
                  </tr>
                ))}

              {transfers !== undefined && transfers.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No transfer requests yet.
                  </td>
                </tr>
              )}

              {pagination.paginatedData.map((transfer) => (
                <tr key={transfer._id} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <TransferTypeBadge type={transfer.type} />
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {transfer.fromBranchName}
                  </td>
                  <td className="px-4 py-3">{transfer.toBranchName}</td>
                  <td className="px-4 py-3">
                    <TransferStatusBadge status={transfer.status} />
                    <StageTimestamp label="Approved" ts={transfer.approvedAt} />
                    <StageTimestamp label="Rejected" ts={transfer.rejectedAt} />
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
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {relativeTime(transfer.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-xs">
                    {transfer.status === "rejected" && transfer.rejectedReason ? (
                      <span className="text-destructive">
                        Rejected: {transfer.rejectedReason}
                      </span>
                    ) : (
                      transfer.notes ?? "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      {/* Inter-branch: receiving branch can acknowledge or decline */}
                      {transfer.status === "requested" &&
                        transfer.type === "interBranch" &&
                        userBranchId &&
                        transfer.toBranchId === userBranchId && (
                          declineId === transfer._id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                placeholder="Reason..."
                                className="h-7 text-xs w-32"
                                value={declineReason}
                                onChange={(e) => setDeclineReason(e.target.value)}
                              />
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 text-xs"
                                disabled={!declineReason.trim()}
                                onClick={() => {
                                  setProcessingId(transfer._id);
                                  declineInterBranch({
                                    transferId: transfer._id as Id<"transfers">,
                                    reason: declineReason.trim(),
                                  }).then(
                                    () => { setDeclineId(null); setDeclineReason(""); setProcessingId(null); },
                                    () => setProcessingId(null)
                                  );
                                }}
                              >
                                {processingId === transfer._id ? "..." : "Decline"}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDeclineId(null)}>
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                className="h-7 text-xs"
                                disabled={processingId === transfer._id}
                                onClick={() => {
                                  setProcessingId(transfer._id);
                                  acknowledgeInterBranch({
                                    transferId: transfer._id as Id<"transfers">,
                                  }).then(
                                    () => setProcessingId(null),
                                    () => setProcessingId(null)
                                  );
                                }}
                              >
                                {processingId === transfer._id ? "..." : "Acknowledge"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-destructive border-destructive/30"
                                onClick={() => setDeclineId(transfer._id)}
                              >
                                Decline
                              </Button>
                            </>
                          )
                      )}

                      {/* Cancel own pending transfers (requestor) */}
                      {transfer.status === "requested" &&
                        transfer.requestedById === currentUser?._id && (
                          cancellingId === transfer._id ? (
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 text-xs"
                                onClick={() => {
                                  cancelTransfer({ transferId: transfer._id as Id<"transfers"> }).then(
                                    () => setCancellingId(null),
                                    () => setCancellingId(null)
                                  );
                                }}
                              >
                                Confirm
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
                              className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => setCancellingId(transfer._id)}
                            >
                              Cancel
                            </Button>
                          )
                      )}
                    </div>
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
          noun="transfer"
        />
      </div>
    </div>
  );
}

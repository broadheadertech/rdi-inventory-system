"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PackByScan } from "@/components/shared/PackByScan";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
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

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function WarehouseTransfersPage() {
  // ── Queue data ───────────────────────────────────────────────────────────
  const approvedTransfers = useQuery(api.transfers.fulfillment.listApprovedTransfers);
  const packedTransfers = useQuery(api.transfers.fulfillment.listPackedTransfers);
  const markInTransit = useMutation(api.transfers.fulfillment.markTransferInTransit);

  const approvedPagination = usePagination(approvedTransfers);
  const packedPagination = usePagination(packedTransfers);

  // ── Dispatch state ───────────────────────────────────────────────────────
  const [dispatchErrorId, setDispatchErrorId] = useState<string | null>(null);

  function handleMarkInTransit(transferId: Id<"transfers">) {
    setDispatchErrorId(null);
    markInTransit({ transferId }).then(
      () => undefined,
      () => setDispatchErrorId(transferId)
    );
  }

  // ── Packing session ──────────────────────────────────────────────────────
  const [selectedTransferId, setSelectedTransferId] = useState<Id<"transfers"> | null>(null);
  const packingData = useQuery(
    api.transfers.fulfillment.getTransferPackingData,
    selectedTransferId ? { transferId: selectedTransferId } : "skip"
  );
  // ── Packing view ─────────────────────────────────────────────────────────
  // Counted by scanning, on the server — this page used to match barcodes in
  // the browser and send a total, which is how a typed or miscounted pack
  // reached the receiving branch as a discrepancy of its own making.
  if (selectedTransferId !== null) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pack Transfer</h1>
            {packingData && (
              <p className="text-sm text-muted-foreground mt-1">
                {packingData.fromBranchName} → {packingData.toBranchName}
              </p>
            )}
          </div>
          <Button variant="outline" onClick={() => setSelectedTransferId(null)}>
            Back
          </Button>
        </div>

        <PackByScan
          transferId={selectedTransferId}
          onPacked={() => setSelectedTransferId(null)}
          onCancelled={() => setSelectedTransferId(null)}
        />
      </div>
    );
  }

  // ── Queue view ───────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Warehouse Transfers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pack approved orders and dispatch to branches
        </p>
      </div>

      {/* Awaiting Packing */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Awaiting Packing</h2>
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
                    Items
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Approved At
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {approvedTransfers === undefined &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b animate-pulse">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 rounded bg-muted w-full" />
                        </td>
                      ))}
                    </tr>
                  ))}

                {approvedTransfers !== undefined && approvedTransfers.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No approved transfers to pack.
                    </td>
                  </tr>
                )}

                {approvedPagination.paginatedData.map((transfer) => (
                  <tr key={transfer._id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{transfer.fromBranchName}</td>
                    <td className="px-4 py-3">{transfer.toBranchName}</td>
                    <td className="px-4 py-3">{transfer.itemCount} item(s)</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {transfer.approvedAt ? relativeTime(transfer.approvedAt) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        onClick={() => setSelectedTransferId(transfer._id)}
                      >
                        Start Packing
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={approvedPagination.currentPage}
            totalPages={approvedPagination.totalPages}
            totalItems={approvedPagination.totalItems}
            hasNextPage={approvedPagination.hasNextPage}
            hasPrevPage={approvedPagination.hasPrevPage}
            onNextPage={approvedPagination.nextPage}
            onPrevPage={approvedPagination.prevPage}
            noun="transfer"
          />
        </div>
      </div>

      {/* Ready to Dispatch */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Ready to Dispatch</h2>
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
                {packedTransfers === undefined &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b animate-pulse">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 rounded bg-muted w-full" />
                        </td>
                      ))}
                    </tr>
                  ))}

                {packedTransfers !== undefined && packedTransfers.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No packed transfers ready to dispatch.
                    </td>
                  </tr>
                )}

                {packedPagination.paginatedData.map((transfer) => (
                  <tr key={transfer._id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{transfer.fromBranchName}</td>
                    <td className="px-4 py-3">{transfer.toBranchName}</td>
                    <td className="px-4 py-3">{transfer.itemCount} item(s)</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {transfer.packedAt ? relativeTime(transfer.packedAt) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <Button
                          size="sm"
                          onClick={() => handleMarkInTransit(transfer._id)}
                        >
                          Mark Dispatched
                        </Button>
                        {dispatchErrorId === transfer._id && (
                          <p className="text-xs text-destructive">Dispatch failed — try again.</p>
                        )}
                      </div>
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
      </div>
    </div>
  );
}

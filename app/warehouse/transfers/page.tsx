"use client";

import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BarcodeScanner } from "@/components/shared/BarcodeScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function playBeep(frequency = 880, durationSec = 0.15) {
  try {
    const audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durationSec);
    osc.start();
    osc.stop(audioCtx.currentTime + durationSec);
    // M1 fix: close context after beep — browsers limit simultaneous AudioContext instances
    setTimeout(() => audioCtx.close(), (durationSec + 0.1) * 1000);
  } catch {
    // AudioContext may be blocked by browser policy — silently ignore
  }
}

// ─── Item status badge ─────────────────────────────────────────────────────────

function ItemStatusBadge({
  itemId,
  requestedQuantity,
  packedCounts,
  skippedIds,
}: {
  itemId: string;
  requestedQuantity: number;
  packedCounts: Record<string, number>;
  skippedIds: Set<string>;
}) {
  if (skippedIds.has(itemId)) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        Skipped
      </span>
    );
  }
  const packed = packedCounts[itemId] ?? 0;
  if (packed >= requestedQuantity) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        ✓ Packed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
      Pending ({packed}/{requestedQuantity})
    </span>
  );
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
  const completePacking = useMutation(api.transfers.fulfillment.completeTransferPacking);

  // ── Packing interaction state ────────────────────────────────────────────
  const [packedCounts, setPackedCounts] = useState<Record<string, number>>({});
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [scanAlert, setScanAlert] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState("");
  // M2 fix: scannerActive removed — BarcodeScanner always visible in packing mode
  //         and controls its own camera start/stop via its built-in toggle
  const [submitting, setSubmitting] = useState(false);
  const [packError, setPackError] = useState<string | null>(null);

  // Reset all packing state when a new transfer is selected
  useEffect(() => {
    setPackedCounts({});
    setSkippedIds(new Set());
    setScanAlert(null);
    setManualBarcode("");
    setSubmitting(false);
    setPackError(null);
  }, [selectedTransferId]);

  // ── Scan handler ─────────────────────────────────────────────────────────
  const handleScan = useCallback(
    (barcode: string) => {
      if (!packingData) return;
      const matched = packingData.items.find((item) => item.barcode === barcode);
      if (matched) {
        setPackedCounts((prev) => ({
          ...prev,
          [matched.itemId]: (prev[matched.itemId] ?? 0) + 1,
        }));
        playBeep(880); // success — high beep
        setScanAlert(null);
      } else {
        playBeep(300, 0.3); // error — low longer beep
        setScanAlert(`Not in manifest: ${barcode}`);
      }
    },
    [packingData]
  );

  // ── Ready-to-complete logic ──────────────────────────────────────────────
  const isReadyToComplete =
    packingData !== undefined &&
    packingData !== null &&
    packingData.items.length > 0 &&
    packingData.items.every(
      (item) =>
        skippedIds.has(item.itemId) ||
        (packedCounts[item.itemId] ?? 0) >= item.requestedQuantity
    );

  // ── Complete packing ─────────────────────────────────────────────────────
  function handleComplete() {
    if (!selectedTransferId || !packingData) return;
    setSubmitting(true);
    setPackError(null);
    completePacking({
      transferId: selectedTransferId,
      packedItems: packingData.items.map((item) => ({
        itemId: item.itemId,
        packedQuantity: skippedIds.has(item.itemId) ? 0 : (packedCounts[item.itemId] ?? 0),
      })),
    }).then(
      () => {
        setSelectedTransferId(null);
      },
      (err: unknown) => {
        setPackError(err instanceof Error ? err.message : "Failed — try again.");
        setSubmitting(false);
      }
    );
  }

  // ── Packing view ─────────────────────────────────────────────────────────
  if (selectedTransferId !== null) {
    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pack Transfer</h1>
            {packingData && (
              <p className="text-sm text-muted-foreground mt-1">
                {packingData.fromBranchName} → {packingData.toBranchName}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => setSelectedTransferId(null)}
            disabled={submitting}
          >
            Cancel
          </Button>
        </div>

        {/* Scanner section */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Barcode Scanner</h2>
          {/* M2 fix: BarcodeScanner always shown in packing mode — its built-in
              Start/Stop Camera toggle is the sole camera control; no duplicate parent button */}
          <BarcodeScanner onScan={handleScan} isActive={true} />

          {/* Manual barcode fallback */}
          <div className="flex gap-2">
            <Input
              placeholder="Type barcode and press Enter"
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && manualBarcode.trim()) {
                  handleScan(manualBarcode.trim());
                  setManualBarcode("");
                }
              }}
              className="max-w-xs"
            />
          </div>

          {scanAlert && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {scanAlert}
            </div>
          )}
        </div>

        {/* Manifest table */}
        <div className="rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">SKU</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Style</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Barcode</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Requested</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Packed</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {packingData === undefined &&
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b animate-pulse">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 rounded bg-muted w-full" />
                        </td>
                      ))}
                    </tr>
                  ))}

                {packingData?.items.map((item) => {
                  const packed = packedCounts[item.itemId] ?? 0;
                  const isSkipped = skippedIds.has(item.itemId);
                  const isPacked = packed >= item.requestedQuantity;
                  return (
                    <tr
                      key={item.itemId}
                      className={cn(
                        "border-b",
                        isPacked && "bg-green-50/50",
                        isSkipped && "bg-gray-50/50"
                      )}
                    >
                      <td className="px-4 py-3 font-mono text-xs">{item.sku}</td>
                      <td className="px-4 py-3">
                        {item.styleName}{" "}
                        <span className="text-xs text-muted-foreground">
                          {item.size} / {item.color}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {item.barcode ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-center">{item.requestedQuantity}</td>
                      <td className="px-4 py-3">
                        {isSkipped ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() =>
                                setPackedCounts((prev) => ({
                                  ...prev,
                                  [item.itemId]: Math.max(0, (prev[item.itemId] ?? 0) - 1),
                                }))
                              }
                              disabled={packed === 0}
                            >
                              −
                            </Button>
                            <span className="w-8 text-center">{packed}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() =>
                                setPackedCounts((prev) => ({
                                  ...prev,
                                  [item.itemId]: (prev[item.itemId] ?? 0) + 1,
                                }))
                              }
                            >
                              +
                            </Button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ItemStatusBadge
                          itemId={item.itemId}
                          requestedQuantity={item.requestedQuantity}
                          packedCounts={packedCounts}
                          skippedIds={skippedIds}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {!isPacked && !isSkipped && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-muted-foreground"
                            onClick={() =>
                              setSkippedIds((prev) => new Set([...prev, item.itemId]))
                            }
                          >
                            Skip
                          </Button>
                        )}
                        {isSkipped && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-muted-foreground"
                            onClick={() =>
                              setSkippedIds((prev) => {
                                const next = new Set(prev);
                                next.delete(item.itemId);
                                return next;
                              })
                            }
                          >
                            Undo Skip
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Complete packing footer */}
        <div className="flex items-center justify-between">
          <div>
            {packError && <p className="text-sm text-destructive">{packError}</p>}
          </div>
          <Button
            onClick={handleComplete}
            disabled={!isReadyToComplete || submitting}
          >
            {submitting ? "Saving…" : "Complete Packing"}
          </Button>
        </div>
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

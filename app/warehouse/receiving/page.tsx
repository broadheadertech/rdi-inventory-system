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

// ─── Item receive status badge ─────────────────────────────────────────────────

function ItemReceiveStatusBadge({
  itemId,
  packedQty,
  receivedCounts,
  damagedIds,
}: {
  itemId: string;
  packedQty: number;
  receivedCounts: Record<string, number>;
  damagedIds: Set<string>;
}) {
  if (damagedIds.has(itemId)) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
        Damaged
      </span>
    );
  }
  const received = receivedCounts[itemId] ?? 0;
  if (received >= packedQty) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        ✓ Received
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
      Pending ({received}/{packedQty})
    </span>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function WarehouseReceivingPage() {
  // ── Queue data ───────────────────────────────────────────────────────────
  const inTransitTransfers = useQuery(api.transfers.fulfillment.listInTransitTransfers);
  const inTransitPagination = usePagination(inTransitTransfers);

  // ── Receiving session ────────────────────────────────────────────────────
  const [selectedTransferId, setSelectedTransferId] = useState<Id<"transfers"> | null>(null);
  const receivingData = useQuery(
    api.transfers.fulfillment.getTransferReceivingData,
    selectedTransferId ? { transferId: selectedTransferId } : "skip"
  );
  const confirmDelivery = useMutation(api.transfers.fulfillment.confirmTransferDelivery);

  // ── Receiving interaction state ──────────────────────────────────────────
  const [receivedCounts, setReceivedCounts] = useState<Record<string, number>>({});
  const [damagedIds, setDamagedIds] = useState<Set<string>>(new Set());
  const [damageNotes, setDamageNotes] = useState<Record<string, string>>({});
  const [scanAlert, setScanAlert] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);

  // Reset all receiving state when a new transfer is selected
  useEffect(() => {
    setReceivedCounts({});
    setDamagedIds(new Set());
    setDamageNotes({});
    setScanAlert(null);
    setManualBarcode("");
    setSubmitting(false);
    setReceiveError(null);
  }, [selectedTransferId]);

  // ── Scan handler ─────────────────────────────────────────────────────────
  const handleScan = useCallback(
    (barcode: string) => {
      if (!receivingData) return;
      const matched = receivingData.items.find((item) => item.barcode === barcode);
      if (matched) {
        setReceivedCounts((prev) => ({
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
    [receivingData]
  );

  // ── Toggle damage flag ────────────────────────────────────────────────────
  // M2 fix: call setDamageNotes independently — never inside another updater.
  // React 18 Strict Mode calls updater functions twice to detect impurity; nested
  // state setters inside updaters fire multiple times causing desynced state.
  function toggleDamage(itemId: string) {
    const isCurrentlyDamaged = damagedIds.has(itemId);
    setDamagedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
    if (isCurrentlyDamaged) {
      // Was damaged, now unflagging — clear notes as separate state update
      setDamageNotes((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }
  }

  // ── Ready-to-complete logic ──────────────────────────────────────────────
  const isReadyToComplete =
    receivingData !== undefined &&
    receivingData !== null &&
    receivingData.items.length > 0 &&
    receivingData.items.every(
      (item) =>
        damagedIds.has(item.itemId) ||
        (receivedCounts[item.itemId] ?? 0) >= item.packedQuantity
    );

  // ── Complete receiving ────────────────────────────────────────────────────
  function handleComplete() {
    if (!selectedTransferId || !receivingData) return;
    setSubmitting(true);
    setReceiveError(null);
    confirmDelivery({
      transferId: selectedTransferId,
      receivedItems: receivingData.items.map((item) => ({
        itemId: item.itemId,
        receivedQuantity: receivedCounts[item.itemId] ?? 0,
        // M1 fix: always send damageNotes when flagged — even if user left the
        // notes field blank. Without this, a flagged-but-empty-notes item sends
        // no damageNotes, the server sees no discrepancy, and the audit log entry
        // "transfer.deliveryDiscrepancy" is silently skipped.
        ...(damagedIds.has(item.itemId)
          ? { damageNotes: damageNotes[item.itemId] || "Damaged (no notes provided)" }
          : {}),
      })),
    }).then(
      () => {
        setSelectedTransferId(null);
      },
      (err: unknown) => {
        setReceiveError(err instanceof Error ? err.message : "Failed — try again.");
        setSubmitting(false);
      }
    );
  }

  // ── Receiving session view ────────────────────────────────────────────────
  if (selectedTransferId !== null) {
    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Receive Transfer</h1>
            {receivingData && (
              <p className="text-sm text-muted-foreground mt-1">
                {receivingData.fromBranchName} → {receivingData.toBranchName}
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
          {/* BarcodeScanner always shown — its built-in Start/Stop Camera toggle is the sole camera control */}
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
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Packed Qty</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Received Qty</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Damage Notes</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {receivingData === undefined &&
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b animate-pulse">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 rounded bg-muted w-full" />
                        </td>
                      ))}
                    </tr>
                  ))}

                {receivingData?.items.map((item) => {
                  const received = receivedCounts[item.itemId] ?? 0;
                  const isDamaged = damagedIds.has(item.itemId);
                  const isReceived = !isDamaged && received >= item.packedQuantity;
                  return (
                    <tr
                      key={item.itemId}
                      className={cn(
                        "border-b",
                        isReceived && "bg-green-50/50",
                        isDamaged && "border-l-2 border-l-amber-400 bg-amber-50/30"
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
                      <td className="px-4 py-3 text-center">{item.packedQuantity}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() =>
                              setReceivedCounts((prev) => ({
                                ...prev,
                                [item.itemId]: Math.max(0, (prev[item.itemId] ?? 0) - 1),
                              }))
                            }
                            disabled={received === 0}
                          >
                            −
                          </Button>
                          <span className="w-8 text-center">{received}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() =>
                              setReceivedCounts((prev) => ({
                                ...prev,
                                [item.itemId]: (prev[item.itemId] ?? 0) + 1,
                              }))
                            }
                          >
                            +
                          </Button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isDamaged && (
                          <Input
                            placeholder="Describe damage…"
                            value={damageNotes[item.itemId] ?? ""}
                            onChange={(e) =>
                              setDamageNotes((prev) => ({
                                ...prev,
                                [item.itemId]: e.target.value,
                              }))
                            }
                            className="h-7 text-xs max-w-[180px]"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ItemReceiveStatusBadge
                          itemId={item.itemId}
                          packedQty={item.packedQuantity}
                          receivedCounts={receivedCounts}
                          damagedIds={damagedIds}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "h-7 text-xs",
                            isDamaged
                              ? "text-amber-700 hover:text-amber-900"
                              : "text-muted-foreground"
                          )}
                          onClick={() => toggleDamage(item.itemId)}
                        >
                          {isDamaged ? "Unflag" : "Flag Damage"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Complete receiving footer */}
        <div className="flex items-center justify-between">
          <div>
            {receiveError && <p className="text-sm text-destructive">{receiveError}</p>}
          </div>
          <Button
            onClick={handleComplete}
            disabled={!isReadyToComplete || submitting}
          >
            {submitting ? "Saving…" : "Complete Receiving"}
          </Button>
        </div>
      </div>
    );
  }

  // ── Queue view ────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Receive Transfers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Confirm delivery and update branch inventory
        </p>
      </div>

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
                  Shipped At
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {inTransitTransfers === undefined &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b animate-pulse">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded bg-muted w-full" />
                      </td>
                    ))}
                  </tr>
                ))}

              {inTransitTransfers !== undefined && inTransitTransfers.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No transfers in transit.
                  </td>
                </tr>
              )}

              {inTransitPagination.paginatedData.map((transfer) => (
                <tr key={transfer._id} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{transfer.fromBranchName}</td>
                  <td className="px-4 py-3">{transfer.toBranchName}</td>
                  <td className="px-4 py-3">{transfer.itemCount} item(s)</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {transfer.shippedAt ? relativeTime(transfer.shippedAt) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      onClick={() => setSelectedTransferId(transfer._id)}
                    >
                      Start Receiving
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination
          currentPage={inTransitPagination.currentPage}
          totalPages={inTransitPagination.totalPages}
          totalItems={inTransitPagination.totalItems}
          hasNextPage={inTransitPagination.hasNextPage}
          hasPrevPage={inTransitPagination.hasPrevPage}
          onNextPage={inTransitPagination.nextPage}
          onPrevPage={inTransitPagination.prevPage}
          noun="transfer"
        />
      </div>
    </div>
  );
}

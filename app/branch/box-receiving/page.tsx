"use client";

import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { getErrorMessage, cn } from "@/lib/utils";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";
import { BarcodeScanner } from "@/components/shared/BarcodeScanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Package, QrCode, ScanBarcode, CheckCircle2, AlertTriangle,
  Loader2, ArrowRight, X, List,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    setTimeout(() => audioCtx.close(), (durationSec + 0.1) * 1000);
  } catch { /* ignore */ }
}

// ─── Box Receiving View ──────────────────────────────────────────────────────

function BoxReceivingView({ onBack }: { onBack: () => void }) {
  const [scanInput, setScanInput] = useState("");
  const [lookupCode, setLookupCode] = useState<string | null>(null);
  const [confirmBoxId, setConfirmBoxId] = useState<Id<"transferBoxes"> | null>(null);
  const [hasDiscrepancy, setHasDiscrepancy] = useState(false);
  const [discrepancyNotes, setDiscrepancyNotes] = useState("");
  const [confirming, setConfirming] = useState(false);

  const boxLookup = useQuery(
    api.transfers.boxPacking.lookupBoxByCode,
    lookupCode ? { boxCode: lookupCode } : "skip"
  );
  const confirmBox = useMutation(api.transfers.boxPacking.confirmBoxReceipt);

  const handleScan = useCallback((code: string) => {
    setLookupCode(code.trim().toUpperCase());
    setScanInput("");
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!confirmBoxId) return;
    setConfirming(true);
    try {
      const result = await confirmBox({
        boxId: confirmBoxId,
        hasDiscrepancy,
        discrepancyNotes: hasDiscrepancy ? discrepancyNotes : undefined,
      });
      if (result.allProcessed) {
        toast.success("All boxes confirmed! Transfer complete.");
      } else {
        toast.success(hasDiscrepancy ? "Box flagged with discrepancy" : "Box received successfully");
      }
      setConfirmBoxId(null);
      setHasDiscrepancy(false);
      setDiscrepancyNotes("");
      setLookupCode(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  }, [confirmBoxId, hasDiscrepancy, discrepancyNotes, confirmBox]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <QrCode className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Box Receiving</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Scan box QR codes to see contents and confirm receipt.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onBack}>Back</Button>
      </div>

      {/* Scanner */}
      <div className="rounded-lg border p-4 bg-card">
        <div className="flex items-center gap-2 mb-3">
          <ScanBarcode className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Scan Box QR / Barcode</h3>
        </div>
        <BarcodeScanner onScan={handleScan} isActive={true} />
        <div className="flex gap-2 mt-3">
          <Input
            placeholder="Type box code (e.g., TRF-abc12345-BOX-001)..."
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && scanInput.trim()) handleScan(scanInput.trim());
            }}
            className="flex-1"
          />
          <Button onClick={() => scanInput.trim() && handleScan(scanInput.trim())} size="sm">Lookup</Button>
          {lookupCode && (
            <Button variant="ghost" size="sm" onClick={() => setLookupCode(null)}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Lookup Result */}
      {lookupCode && boxLookup === undefined && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Looking up box...
        </div>
      )}
      {lookupCode && boxLookup === null && (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          No box found for code &quot;{lookupCode}&quot;
        </div>
      )}

      {boxLookup && (
        <div className="rounded-lg border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold font-mono">{boxLookup.boxCode}</h2>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {boxLookup.fromBranchName} <ArrowRight className="inline h-3 w-3 mx-1" /> {boxLookup.toBranchName}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn(
                "text-xs",
                boxLookup.status === "sealed" && "text-blue-600 border-blue-500/30",
                boxLookup.status === "received" && "text-green-600 border-green-500/30",
                boxLookup.status === "discrepancy" && "text-red-600 border-red-500/30",
              )}>
                {boxLookup.status.toUpperCase()}
              </Badge>
              <Badge variant="outline" className="text-xs">{boxLookup.totalItems} pcs</Badge>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold mb-2">Contents</p>
            <div className="rounded border divide-y">
              {boxLookup.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{item.styleName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.size} / {item.color}
                      {item.sku && <span className="ml-2">SKU: {item.sku}</span>}
                    </p>
                  </div>
                  <span className="font-mono font-semibold">x{item.quantity}</span>
                </div>
              ))}
            </div>
          </div>

          {boxLookup.status === "sealed" && boxLookup.transferStatus === "inTransit" && (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => { setConfirmBoxId(boxLookup.boxId as Id<"transferBoxes">); setHasDiscrepancy(false); }}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Confirm Receipt
              </Button>
              <Button variant="destructive" className="flex-1" onClick={() => { setConfirmBoxId(boxLookup.boxId as Id<"transferBoxes">); setHasDiscrepancy(true); }}>
                <AlertTriangle className="h-4 w-4 mr-1" /> Report Discrepancy
              </Button>
            </div>
          )}
          {boxLookup.status === "received" && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" /> This box has already been received.
            </div>
          )}
          {boxLookup.status === "discrepancy" && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" /> This box was flagged with a discrepancy.
            </div>
          )}
        </div>
      )}

      <Dialog open={!!confirmBoxId} onOpenChange={(open) => { if (!open) setConfirmBoxId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{hasDiscrepancy ? "Report Discrepancy" : "Confirm Receipt"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {hasDiscrepancy ? (
              <>
                <p className="text-sm text-muted-foreground">Describe what&apos;s wrong with this box.</p>
                <div className="space-y-2">
                  <Label>Discrepancy Details</Label>
                  <Textarea
                    placeholder="e.g., Missing 3 units, box was damaged..."
                    value={discrepancyNotes}
                    onChange={(e) => setDiscrepancyNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm">Confirm all items in this box have been received and are in good condition?</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBoxId(null)}>Cancel</Button>
            <Button
              variant={hasDiscrepancy ? "destructive" : "default"}
              onClick={handleConfirm}
              disabled={confirming || (hasDiscrepancy && !discrepancyNotes.trim())}
            >
              {confirming ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {hasDiscrepancy ? "Submit Discrepancy" : "Confirm Received"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Piece Receiving View ────────────────────────────────────────────────────

function PieceReceivingView({
  transferId,
  onBack,
}: {
  transferId: Id<"transfers">;
  onBack: () => void;
}) {
  const receivingData = useQuery(
    api.transfers.fulfillment.getTransferReceivingData,
    { transferId }
  );
  const confirmDelivery = useMutation(api.transfers.fulfillment.confirmTransferDelivery);

  const [receivedCounts, setReceivedCounts] = useState<Record<string, number>>({});
  const [damagedIds, setDamagedIds] = useState<Set<string>>(new Set());
  const [damageNotes, setDamageNotes] = useState<Record<string, string>>({});
  const [scanAlert, setScanAlert] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);

  useEffect(() => {
    setReceivedCounts({});
    setDamagedIds(new Set());
    setDamageNotes({});
    setScanAlert(null);
    setManualBarcode("");
    setSubmitting(false);
    setReceiveError(null);
  }, [transferId]);

  const handleScan = useCallback(
    (barcode: string) => {
      if (!receivingData) return;
      const matched = receivingData.items.find((item) => item.barcode === barcode);
      if (matched) {
        setReceivedCounts((prev) => ({
          ...prev,
          [matched.itemId]: (prev[matched.itemId] ?? 0) + 1,
        }));
        playBeep(880);
        setScanAlert(null);
      } else {
        playBeep(300, 0.3);
        setScanAlert(`Not in manifest: ${barcode}`);
      }
    },
    [receivingData]
  );

  function toggleDamage(itemId: string) {
    const isCurrentlyDamaged = damagedIds.has(itemId);
    setDamagedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
    if (isCurrentlyDamaged) {
      setDamageNotes((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }
  }

  // The branch's count is what arrived. It may be short of what was packed —
  // recorded against the sending branch — or over, which adds stock the sender
  // never deducted and so has to be confirmed.
  const isReadyToComplete =
    receivingData !== undefined && receivingData !== null && receivingData.items.length > 0;

  function handleComplete() {
    if (!receivingData) return;

    const differences: string[] = [];
    let hasOverage = false;
    for (const item of receivingData.items) {
      if (damagedIds.has(item.itemId)) continue;
      const received = receivedCounts[item.itemId] ?? 0;
      if (received < item.packedQuantity) {
        differences.push(
          `${item.sku}: ${received} of ${item.packedQuantity} packed — ${item.packedQuantity - received} short`
        );
      } else if (received > item.packedQuantity) {
        hasOverage = true;
        differences.push(
          `${item.sku}: ${received} counted, ${item.packedQuantity} packed — ${received - item.packedQuantity} extra`
        );
      }
    }
    if (
      differences.length > 0 &&
      !window.confirm(
        `The count doesn't match what was packed:\n\n${differences.join("\n")}\n\n` +
          "Shortages are recorded against the sending branch." +
          (hasOverage
            ? " Extra pieces are added to your stock and flagged for the warehouse — confirm only if they are physically here."
            : "") +
          "\n\nComplete receiving?"
      )
    ) {
      return;
    }

    setSubmitting(true);
    setReceiveError(null);
    confirmDelivery({
      transferId,
      confirmOverage: hasOverage,
      receivedItems: receivingData.items.map((item) => ({
        itemId: item.itemId,
        receivedQuantity: receivedCounts[item.itemId] ?? 0,
        ...(damagedIds.has(item.itemId)
          ? { damageNotes: damageNotes[item.itemId] || "Damaged (no notes provided)" }
          : {}),
      })),
    }).then(
      () => onBack(),
      (err: unknown) => {
        setReceiveError(getErrorMessage(err));
        setSubmitting(false);
      }
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <List className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Receive by Piece</h1>
          </div>
          {receivingData && (
            <p className="text-sm text-muted-foreground mt-1">
              {receivingData.fromBranchName} <ArrowRight className="inline h-3 w-3 mx-1" /> {receivingData.toBranchName}
            </p>
          )}
          {receivingData?.driverName && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Driver {receivingData.driverName} ·{" "}
              {receivingData.driverHandedOverAt
                ? `handed over ${new Date(receivingData.driverHandedOverAt).toLocaleTimeString("en-PH", { timeStyle: "short" })}`
                : receivingData.driverArrivedAt
                  ? "arrived, handover not confirmed yet"
                  : "not marked arrived yet"}
              . Your count completes this delivery.
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onBack} disabled={submitting}>Back</Button>
      </div>

      {/* Scanner */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ScanBarcode className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Barcode Scanner</h3>
        </div>
        <BarcodeScanner onScan={handleScan} isActive={true} />
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
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Size / Color</TableHead>
              <TableHead className="text-center">Packed</TableHead>
              <TableHead className="text-center">Received</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {receivingData === undefined &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 animate-pulse rounded bg-muted" /></TableCell>
                  ))}
                </TableRow>
              ))}
            {receivingData?.items.map((item) => {
              const received = receivedCounts[item.itemId] ?? 0;
              const isDamaged = damagedIds.has(item.itemId);
              const isOver = !isDamaged && received > item.packedQuantity;
              const isReceived = !isDamaged && received === item.packedQuantity;
              return (
                <TableRow key={item.itemId} className={cn(
                  isReceived && "bg-green-50/50",
                  isOver && "bg-amber-50/40",
                  isDamaged && "border-l-2 border-l-amber-400 bg-amber-50/30"
                )}>
                  <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                  <TableCell>{item.styleName}</TableCell>
                  <TableCell className="text-sm">{item.size} / {item.color}</TableCell>
                  <TableCell className="text-center">{item.packedQuantity}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost" size="sm" className="h-6 w-6 p-0"
                        onClick={() => setReceivedCounts((prev) => ({
                          ...prev, [item.itemId]: Math.max(0, (prev[item.itemId] ?? 0) - 1),
                        }))}
                        disabled={received === 0}
                      >−</Button>
                      <span className="w-8 text-center">{received}</span>
                      <Button
                        variant="ghost" size="sm" className="h-6 w-6 p-0"
                        onClick={() => setReceivedCounts((prev) => ({
                          ...prev, [item.itemId]: (prev[item.itemId] ?? 0) + 1,
                        }))}
                      >+</Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    {isDamaged && (
                      <Input
                        placeholder="Describe damage..."
                        value={damageNotes[item.itemId] ?? ""}
                        onChange={(e) => setDamageNotes((prev) => ({ ...prev, [item.itemId]: e.target.value }))}
                        className="h-7 text-xs max-w-[180px]"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {isDamaged ? (
                      <Badge variant="outline" className="text-xs text-amber-600">Damaged</Badge>
                    ) : isOver ? (
                      <Badge variant="outline" className="text-xs text-amber-700 border-amber-400">
                        +{received - item.packedQuantity} extra
                      </Badge>
                    ) : isReceived ? (
                      <Badge variant="default" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" /> Done</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        {received}/{item.packedQuantity}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost" size="sm"
                      className={cn("h-7 text-xs", isDamaged ? "text-amber-700" : "text-muted-foreground")}
                      onClick={() => toggleDamage(item.itemId)}
                    >
                      {isDamaged ? "Unflag" : "Flag Damage"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        {receiveError && <p className="text-sm text-destructive">{receiveError}</p>}
        <div className="ml-auto">
          <Button onClick={handleComplete} disabled={!isReadyToComplete || submitting}>
            {submitting ? "Saving..." : "Complete Receiving"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function BranchReceivingPage() {
  const [view, setView] = useState<"list" | "box" | "piece">("list");
  const [selectedPieceTransferId, setSelectedPieceTransferId] = useState<Id<"transfers"> | null>(null);

  const inTransitTransfers = useQuery(api.transfers.fulfillment.listBranchInTransitTransfers);
  const pagination = usePagination(inTransitTransfers ?? [], 10);

  // Box mode → scan QR codes
  if (view === "box") {
    return <BoxReceivingView onBack={() => setView("list")} />;
  }

  // Piece mode → item-level receiving for a selected transfer
  if (view === "piece" && selectedPieceTransferId) {
    return (
      <PieceReceivingView
        transferId={selectedPieceTransferId}
        onBack={() => { setView("list"); setSelectedPieceTransferId(null); }}
      />
    );
  }

  // List of in-transit transfers
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Package className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Receive Transfers</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Confirm delivery of incoming transfers by box or by piece.
        </p>
      </div>

      {!inTransitTransfers ? (
        <div className="p-8 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : inTransitTransfers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-12 text-sm text-muted-foreground border rounded-lg">
          <CheckCircle2 className="h-10 w-10" />
          <p>No incoming transfers to receive.</p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>From</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Shipped</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedData.map((transfer) => (
                  <TableRow key={String(transfer._id)}>
                    <TableCell className="font-medium">{transfer.fromBranchName}</TableCell>
                    <TableCell>{transfer.itemCount} lines</TableCell>
                    <TableCell>
                      {transfer.deliveryMode === "box" ? (
                        <Badge variant="outline" className="text-xs">
                          <QrCode className="h-3 w-3 mr-1" /> {transfer.boxCount} boxes
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <List className="h-3 w-3 mr-1" /> By piece
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {transfer.shippedAt ? new Date(transfer.shippedAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {transfer.deliveryMode === "box" ? (
                        <Button size="sm" onClick={() => setView("box")}>
                          <QrCode className="h-3.5 w-3.5 mr-1" /> Scan Boxes
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => {
                          setSelectedPieceTransferId(transfer._id);
                          setView("piece");
                        }}>
                          <List className="h-3.5 w-3.5 mr-1" /> Receive Items
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {(inTransitTransfers?.length ?? 0) > 10 && (
            <TablePagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              hasNextPage={pagination.hasNextPage}
              hasPrevPage={pagination.hasPrevPage}
              onNextPage={pagination.nextPage}
              onPrevPage={pagination.prevPage}
            />
          )}
        </>
      )}
    </div>
  );
}

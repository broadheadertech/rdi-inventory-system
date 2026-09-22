"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PackByScan } from "@/components/shared/PackByScan";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { getErrorMessage, cn } from "@/lib/utils";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";
import { BarcodeScanner } from "@/components/shared/BarcodeScanner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Package, Plus, ScanBarcode, Lock, Trash2, Loader2, CheckCircle2,
  ArrowRight, QrCode, List,
} from "lucide-react";

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

type PackingMode = "box" | "piece" | null;

export default function BoxPackingPage() {
  // Transfer + mode selection
  const [selectedTransferId, setSelectedTransferId] = useState<Id<"transfers"> | null>(null);
  const [packingMode, setPackingMode] = useState<PackingMode>(null);
  const [activeBoxId, setActiveBoxId] = useState<Id<"transferBoxes"> | null>(null);

  // Piece mode quantities

  // Scanner
  const [manualBarcode, setManualBarcode] = useState("");
  const [scanQty, setScanQty] = useState(1);
  const [scanning, setScanning] = useState(false);

  // Finalize dialog
  const [showFinalize, setShowFinalize] = useState(false);
  const [expectedDays, setExpectedDays] = useState("1");

  // Queries
  const approvedTransfers = useQuery(api.transfers.fulfillment.listApprovedTransfers);
  const packingData = useQuery(
    api.transfers.fulfillment.getTransferPackingData,
    selectedTransferId ? { transferId: selectedTransferId } : "skip"
  );
  const boxes = useQuery(
    api.transfers.boxPacking.getBoxesForTransfer,
    selectedTransferId && packingMode === "box" ? { transferId: selectedTransferId } : "skip"
  );
  const progress = useQuery(
    api.transfers.boxPacking.getPackingProgress,
    selectedTransferId && packingMode === "box" ? { transferId: selectedTransferId } : "skip"
  );

  // Mutations
  const createBox = useMutation(api.transfers.boxPacking.createBox);
  const scanItem = useMutation(api.transfers.boxPacking.scanItemIntoBox);
  const sealBox = useMutation(api.transfers.boxPacking.sealBox);
  const deleteBox = useMutation(api.transfers.boxPacking.deleteBox);
  const removeItem = useMutation(api.transfers.boxPacking.removeItemFromBox);
  const completePacking = useMutation(api.transfers.boxPacking.completeBoxPacking);

  // ─── Box mode handlers ────────────────────────────────────────────────────

  const handleCreateBox = useCallback(async () => {
    if (!selectedTransferId) return;
    try {
      const result = await createBox({ transferId: selectedTransferId });
      setActiveBoxId(result.boxId as Id<"transferBoxes">);
      toast.success(`Box ${result.boxNumber} created (${result.boxCode})`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }, [selectedTransferId, createBox]);

  const handleScan = useCallback(async (barcode: string) => {
    if (!activeBoxId) {
      toast.error("Select or create a box first");
      return;
    }
    setScanning(true);
    try {
      const result = await scanItem({
        boxId: activeBoxId,
        barcode,
        quantity: scanQty,
      });
      playBeep(880);
      toast.success(`${result.styleName} (${result.size}/${result.color}) x${result.quantityAdded} → Box`);
      setManualBarcode("");
    } catch (err) {
      playBeep(300, 0.3);
      toast.error(getErrorMessage(err));
    } finally {
      setScanning(false);
    }
  }, [activeBoxId, scanQty, scanItem]);

  const handleSealBox = useCallback(async (boxId: Id<"transferBoxes">) => {
    try {
      await sealBox({ boxId });
      toast.success("Box sealed");
      if (activeBoxId === boxId) setActiveBoxId(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }, [sealBox, activeBoxId]);

  const handleDeleteBox = useCallback(async (boxId: Id<"transferBoxes">) => {
    try {
      await deleteBox({ boxId });
      toast.success("Box deleted");
      if (activeBoxId === boxId) setActiveBoxId(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }, [deleteBox, activeBoxId]);

  const handleFinalizeBox = useCallback(async () => {
    if (!selectedTransferId) return;
    try {
      await completePacking({
        transferId: selectedTransferId,
        expectedDeliveryDays: parseInt(expectedDays) || undefined,
      });
      toast.success("Packing complete! Transfer is now packed.");
      setSelectedTransferId(null);
      setActiveBoxId(null);
      setPackingMode(null);
      setShowFinalize(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }, [selectedTransferId, expectedDays, completePacking]);

  // ─── Piece mode handlers ──────────────────────────────────────────────────

  const handleSelectTransfer = useCallback((transferId: Id<"transfers">) => {
    setSelectedTransferId(transferId);
    setPackingMode(null);
    setActiveBoxId(null);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedTransferId(null);
    setActiveBoxId(null);
    setPackingMode(null);
  }, []);

  const transferPagination = usePagination(approvedTransfers ?? [], 10);

  // ─── No transfer selected ─────────────────────────────────────────────────

  if (!selectedTransferId) {
    return (
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Packing</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Pack approved transfers by box or by piece, then finalize for dispatch.
          </p>
        </div>

        {!approvedTransfers ? (
          <div className="p-8 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : approvedTransfers.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-sm text-muted-foreground border rounded-lg">
            <CheckCircle2 className="h-10 w-10" />
            <p>No transfers awaiting packing.</p>
          </div>
        ) : (
          <>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Route</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead>Approved</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transferPagination.paginatedData.map((t) => (
                    <TableRow key={String(t._id)}>
                      <TableCell className="font-medium">
                        {t.fromBranchName} <ArrowRight className="inline h-3 w-3 mx-1" /> {t.toBranchName}
                      </TableCell>
                      <TableCell className="text-right">{t.itemCount} lines</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {t.approvedAt ? new Date(t.approvedAt).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => handleSelectTransfer(t._id)}>
                          Start Packing
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {approvedTransfers.length > 10 && (
              <TablePagination
                currentPage={transferPagination.currentPage}
                totalPages={transferPagination.totalPages}
                totalItems={transferPagination.totalItems}
                hasNextPage={transferPagination.hasNextPage}
                hasPrevPage={transferPagination.hasPrevPage}
                onNextPage={transferPagination.nextPage}
                onPrevPage={transferPagination.prevPage}
              />
            )}
          </>
        )}
      </div>
    );
  }

  // ─── Mode selection ────────────────────────────────────────────────────────

  if (!packingMode) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Package className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">Choose Packing Mode</h1>
            </div>
            {packingData && (
              <p className="text-sm text-muted-foreground mt-1">
                {packingData.fromBranchName} <ArrowRight className="inline h-3 w-3 mx-1" /> {packingData.toBranchName}
                {" · "}{packingData.items.length} line items
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleBack}>Back</Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          <button
            type="button"
            onClick={() => setPackingMode("box")}
            className="rounded-lg border-2 border-muted p-6 text-left hover:border-primary transition-colors bg-card"
          >
            <QrCode className="h-8 w-8 text-primary mb-3" />
            <h3 className="text-lg font-semibold">Pack by Box</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Create boxes, scan items into each box, seal, and generate QR codes for tracking.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setPackingMode("piece")}
            className="rounded-lg border-2 border-muted p-6 text-left hover:border-primary transition-colors bg-card"
          >
            <List className="h-8 w-8 text-primary mb-3" />
            <h3 className="text-lg font-semibold">Pack by Piece</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Set packed quantities for each item directly. No boxes or QR codes — simple bulk packing.
            </p>
          </button>
        </div>
      </div>
    );
  }

  // ─── Piece mode ────────────────────────────────────────────────────────────

  if (packingMode === "piece") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <List className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">Pack by Piece</h1>
            </div>
            {packingData && (
              <p className="text-sm text-muted-foreground mt-1">
                {packingData.fromBranchName} <ArrowRight className="inline h-3 w-3 mx-1" /> {packingData.toBranchName}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleBack}>Back</Button>
        </div>

        {/* Counted by scanning, like receiving — nothing here is typed. */}
        {selectedTransferId && (
          <PackByScan
            transferId={selectedTransferId}
            expectedDeliveryDays={parseInt(expectedDays) || undefined}
            onPacked={handleBack}
            onCancelled={handleBack}
          />
        )}
      </div>
    );
  }

  // ─── Box mode (active packing session) ─────────────────────────────────────

  const allSealed = boxes && boxes.length > 0 && boxes.every((b) => b.status === "sealed");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <QrCode className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Pack by Box</h1>
          </div>
          {packingData && (
            <p className="text-sm text-muted-foreground mt-1">
              {packingData.fromBranchName} <ArrowRight className="inline h-3 w-3 mx-1" /> {packingData.toBranchName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleBack}>
            Back
          </Button>
          {allSealed && (
            <Button size="sm" onClick={() => setShowFinalize(true)}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Finalize Packing
            </Button>
          )}
        </div>
      </div>

      {/* Progress */}
      {progress && (
        <div className="rounded-lg border p-4 bg-card">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Packing Progress</p>
            <Badge variant={progress.isComplete ? "default" : "outline"}>
              {progress.totalPacked} / {progress.totalRequested} packed
            </Badge>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{ width: `${progress.totalRequested > 0 ? (progress.totalPacked / progress.totalRequested) * 100 : 0}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {progress.items.map((item) => (
              <div key={String(item.variantId)} className={cn(
                "rounded border p-2",
                item.remaining === 0 ? "bg-green-500/10 border-green-500/30" : "bg-muted"
              )}>
                <p className="font-medium truncate">{item.styleName}</p>
                <p className="text-muted-foreground">{item.size} / {item.color}</p>
                <p className="font-mono mt-1">
                  {item.packed}/{item.requested}
                  {item.remaining > 0 && <span className="text-amber-500 ml-1">({item.remaining} left)</span>}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scanner + Active Box */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Scanner */}
        <div className="rounded-lg border p-4 bg-card">
          <div className="flex items-center gap-2 mb-3">
            <ScanBarcode className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Scan Items into Box</h3>
            {activeBoxId && boxes && (
              <Badge variant="outline" className="ml-auto">
                <QrCode className="h-3 w-3 mr-1" />
                {boxes.find((b) => b._id === activeBoxId)?.boxCode ?? ""}
              </Badge>
            )}
          </div>

          {!activeBoxId ? (
            <p className="text-sm text-muted-foreground">Select or create a box to start scanning.</p>
          ) : (
            <>
              <BarcodeScanner onScan={handleScan} isActive={true} />
              <div className="flex gap-2 mt-3">
                <Input
                  placeholder="Manual barcode/SKU..."
                  value={manualBarcode}
                  onChange={(e) => setManualBarcode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && manualBarcode.trim()) {
                      handleScan(manualBarcode.trim());
                    }
                  }}
                  className="flex-1"
                />
                <Input
                  type="number"
                  min={1}
                  value={scanQty}
                  onChange={(e) => setScanQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20"
                />
                <Button
                  onClick={() => manualBarcode.trim() && handleScan(manualBarcode.trim())}
                  disabled={scanning || !manualBarcode.trim()}
                  size="sm"
                >
                  {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Box Management */}
        <div className="rounded-lg border p-4 bg-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Boxes ({boxes?.length ?? 0})</h3>
            <Button size="sm" variant="outline" onClick={handleCreateBox}>
              <Plus className="h-4 w-4 mr-1" /> New Box
            </Button>
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {(boxes ?? []).map((box) => {
              const isActive = activeBoxId === box._id;
              return (
                <div
                  key={String(box._id)}
                  className={cn(
                    "rounded border p-3 cursor-pointer transition-colors",
                    isActive ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                    box.status === "sealed" && "opacity-70"
                  )}
                  onClick={() => box.status === "packing" && setActiveBoxId(box._id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <QrCode className="h-4 w-4" />
                      <span className="text-sm font-mono font-semibold">{box.boxCode}</span>
                      <Badge variant={box.status === "sealed" ? "default" : "outline"} className="text-xs">
                        {box.status === "sealed" ? (
                          <><Lock className="h-3 w-3 mr-1" /> Sealed</>
                        ) : (
                          "Packing"
                        )}
                      </Badge>
                    </div>
                    <span className="text-sm text-muted-foreground">{box.totalItems} pcs</span>
                  </div>

                  {box.items.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {box.items.map((item) => (
                        <div key={String(item._id)} className="flex items-center justify-between text-xs">
                          <span className="truncate flex-1">
                            {item.styleName} — {item.size}/{item.color}
                          </span>
                          <span className="font-mono mx-2">x{item.quantity}</span>
                          {box.status === "packing" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeItem({ boxItemId: item._id });
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {box.status === "packing" && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={(e) => { e.stopPropagation(); handleSealBox(box._id); }}
                        disabled={box.totalItems === 0}
                      >
                        <Lock className="h-3 w-3 mr-1" /> Seal Box
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs text-destructive"
                        onClick={(e) => { e.stopPropagation(); handleDeleteBox(box._id); }}
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Delete
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Finalize Dialog */}
      <Dialog open={showFinalize} onOpenChange={setShowFinalize}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Finalize Packing</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Expected Delivery (days)</Label>
              <Select value={expectedDays} onValueChange={setExpectedDays}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="2">2 days</SelectItem>
                  <SelectItem value="3">3 days</SelectItem>
                  <SelectItem value="5">5 days</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm">
              <p><strong>Mode:</strong> Box ({boxes?.length ?? 0} boxes)</p>
              <p><strong>Total Items:</strong> {progress?.totalPacked ?? 0} / {progress?.totalRequested ?? 0}</p>
              {progress && !progress.isComplete && (
                <p className="text-amber-500 text-xs mt-1">
                  Warning: {progress.totalRemaining} items not yet packed.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFinalize(false)}>Cancel</Button>
            <Button onClick={handleFinalizeBox}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Complete Packing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

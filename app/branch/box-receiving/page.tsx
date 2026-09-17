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
// Scan a box's code to open it, then scan every piece in it. There is no
// "confirm the box as packed": a box is received for what was scanned out of
// it, and the server decides from those scans whether it has a discrepancy.
// Scanning another box's code while one is open simply opens that box.

/** Box codes look like TRF-abc12345-BOX-001; anything else is a piece. */
function isBoxCode(code: string): boolean {
  return /^TRF-.+-BOX-\d+$/i.test(code.trim());
}

function BoxReceivingView({ onBack }: { onBack: () => void }) {
  const [scanInput, setScanInput] = useState("");
  const [lookupCode, setLookupCode] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [discrepancyNotes, setDiscrepancyNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [scanAlert, setScanAlert] = useState<string | null>(null);

  const boxLookup = useQuery(
    api.transfers.boxPacking.lookupBoxByCode,
    lookupCode ? { boxCode: lookupCode } : "skip"
  );
  const scanPiece = useMutation(api.transfers.boxPacking.scanBoxPiece);
  const undoLastScan = useMutation(api.transfers.boxPacking.undoLastBoxScan);
  const confirmBox = useMutation(api.transfers.boxPacking.confirmBoxReceipt);

  // A box can take pieces only while it is sealed and on its way.
  const receivingBox =
    boxLookup && boxLookup.status === "sealed" && boxLookup.transferStatus === "inTransit"
      ? boxLookup
      : null;

  const scannedTotal = receivingBox
    ? receivingBox.items.reduce((sum, item) => sum + item.scannedQuantity, 0)
    : 0;
  const packedTotal = receivingBox
    ? receivingBox.items.reduce((sum, item) => sum + item.quantity, 0)
    : 0;
  const mismatches = receivingBox
    ? receivingBox.items.filter((item) => item.scannedQuantity !== item.quantity)
    : [];

  // A piece matches when it was packed in the box. Scanning a line past what
  // was packed does not add to "matched" — that is an extra, shown on its own.
  const matchedTotal = receivingBox
    ? receivingBox.items.reduce(
        (sum, item) => sum + Math.min(item.scannedQuantity, item.quantity),
        0
      )
    : 0;
  const missingTotal = packedTotal - matchedTotal;
  const extraTotal = receivingBox
    ? receivingBox.items.reduce(
        (sum, item) => sum + Math.max(0, item.scannedQuantity - item.quantity),
        0
      )
    : 0;

  // What is still to scan leads the list; finished lines drop to the bottom.
  const stillToScan = receivingBox
    ? receivingBox.items.filter((item) => item.scannedQuantity < item.quantity)
    : [];
  const finishedLines = receivingBox
    ? receivingBox.items.filter((item) => item.scannedQuantity >= item.quantity)
    : [];

  const openBox = useCallback((code: string) => {
    setLookupCode(code.trim().toUpperCase());
    setScanAlert(null);
  }, []);

  const handleScan = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      setScanInput("");
      if (!code) return;

      // No box open, or another box's code: open that box.
      if (!receivingBox || isBoxCode(code)) {
        openBox(code);
        return;
      }

      try {
        const res = await scanPiece({
          boxId: receivingBox.boxId as Id<"transferBoxes">,
          code,
        });
        playBeep(res.scannedQuantity > res.packedQuantity ? 440 : 880);
        setScanAlert(
          res.scannedQuantity > res.packedQuantity
            ? `${res.sku}: ${res.scannedQuantity} scanned, only ${res.packedQuantity} packed`
            : null
        );
      } catch (err) {
        playBeep(300, 0.3);
        setScanAlert(getErrorMessage(err));
      }
    },
    [receivingBox, openBox, scanPiece]
  );

  const handleUndo = useCallback(async () => {
    if (!receivingBox) return;
    try {
      const res = await undoLastScan({ boxId: receivingBox.boxId as Id<"transferBoxes"> });
      setScanAlert(`Undid the last scan of ${res.sku}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }, [receivingBox, undoLastScan]);

  const finish = useCallback(
    async (boxMissing: boolean) => {
      if (!receivingBox) return;
      setConfirming(true);
      try {
        const result = await confirmBox({
          boxId: receivingBox.boxId as Id<"transferBoxes">,
          ...(discrepancyNotes.trim() ? { discrepancyNotes: discrepancyNotes.trim() } : {}),
          ...(boxMissing ? { boxMissing: true } : {}),
        });
        if (result.allProcessed) {
          toast.success("All boxes received. Transfer complete.");
        } else if (result.hasDiscrepancy) {
          toast.warning("Box received with a discrepancy — sent to Disputes.");
        } else {
          toast.success("Box received — every piece matched.");
        }
        setConfirmOpen(false);
        setMissingOpen(false);
        setDiscrepancyNotes("");
        setLookupCode(null);
        setScanAlert(null);
      } catch (err) {
        toast.error(getErrorMessage(err));
      } finally {
        setConfirming(false);
      }
    },
    [receivingBox, discrepancyNotes, confirmBox]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <QrCode className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Box Receiving</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Scan a box to open it, then scan every piece inside.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onBack}>Back</Button>
      </div>

      {/* Scanner — opens a box, or counts a piece into the open one */}
      <div className="rounded-lg border p-4 bg-card">
        <div className="flex items-center gap-2 mb-3">
          <ScanBarcode className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">
            {receivingBox
              ? `Scanning pieces into ${receivingBox.boxCode}`
              : "Scan a box QR / barcode"}
          </h3>
        </div>
        <BarcodeScanner onScan={handleScan} isActive={true} />
        <div className="flex gap-2 mt-3">
          <Input
            placeholder={receivingBox ? "Scan a barcode or SKU label" : "Scan the box code"}
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && scanInput.trim()) handleScan(scanInput);
            }}
            className="flex-1"
            autoFocus
          />
          <Button onClick={() => scanInput.trim() && handleScan(scanInput)} size="sm">
            {receivingBox ? "Add" : "Open"}
          </Button>
          {receivingBox && (
            <Button variant="ghost" size="sm" onClick={handleUndo}>
              Undo last scan
            </Button>
          )}
          {lookupCode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setLookupCode(null);
                setScanAlert(null);
              }}
              title="Close this box"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {scanAlert && (
          <p className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {scanAlert}
          </p>
        )}
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
              {receivingBox ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs tabular-nums",
                    missingTotal === 0
                      ? "text-green-600 border-green-500/30"
                      : "text-amber-700 border-amber-500/30"
                  )}
                >
                  {missingTotal === 0 ? "All matched" : `${missingTotal} missing`}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">{boxLookup.totalItems} pcs</Badge>
              )}
            </div>
          </div>

          {receivingBox ? (
            <div className="space-y-3">
              {/* Where the box stands: what matched, what is still to find */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-md border border-green-500/30 bg-green-50/60 p-3">
                  <p className="text-xs text-green-700">Matched</p>
                  <p className="text-2xl font-bold tabular-nums text-green-700">
                    {matchedTotal}
                    <span className="text-sm font-medium text-green-700/70"> / {packedTotal}</span>
                  </p>
                </div>
                <div
                  className={cn(
                    "rounded-md border p-3",
                    missingTotal > 0
                      ? "border-amber-500/30 bg-amber-50/60"
                      : "border-green-500/30 bg-green-50/60"
                  )}
                >
                  <p className={cn("text-xs", missingTotal > 0 ? "text-amber-700" : "text-green-700")}>
                    Still missing
                  </p>
                  <p
                    className={cn(
                      "text-2xl font-bold tabular-nums",
                      missingTotal > 0 ? "text-amber-700" : "text-green-700"
                    )}
                  >
                    {missingTotal}
                  </p>
                </div>
                {extraTotal > 0 && (
                  <div className="rounded-md border border-red-500/30 bg-red-50/60 p-3">
                    <p className="text-xs text-red-700">Extra</p>
                    <p className="text-2xl font-bold tabular-nums text-red-700">{extraTotal}</p>
                  </div>
                )}
              </div>

              {/* Exactly what to scan next */}
              {stillToScan.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm font-semibold">
                    Still to scan · {stillToScan.length} item{stillToScan.length === 1 ? "" : "s"}
                  </p>
                  <div className="divide-y rounded border">
                    {stillToScan.map((item) => (
                      <div
                        key={item.variantId}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{item.styleName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {item.size} / {item.color}
                            {item.sku && <span className="ml-2 font-mono">{item.sku}</span>}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold tabular-nums text-amber-700">
                            {item.quantity - item.scannedQuantity} missing
                          </p>
                          <p className="text-[11px] tabular-nums text-muted-foreground">
                            {item.scannedQuantity} of {item.quantity} scanned
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Every piece in this box has been scanned.
                </p>
              )}

              {/* Done — out of the way, but there to check */}
              {finishedLines.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-semibold text-muted-foreground">
                    Complete · {finishedLines.length} item{finishedLines.length === 1 ? "" : "s"}
                  </p>
                  <div className="divide-y rounded border">
                    {finishedLines.map((item) => {
                      const extra = item.scannedQuantity - item.quantity;
                      return (
                        <div
                          key={item.variantId}
                          className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <CheckCircle2
                              className={cn(
                                "h-4 w-4 shrink-0",
                                extra > 0 ? "text-red-600" : "text-green-600"
                              )}
                            />
                            <p className="truncate">
                              {item.styleName}{" "}
                              <span className="text-xs text-muted-foreground">
                                {item.size} / {item.color}
                              </span>
                            </p>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 font-mono text-xs tabular-nums",
                              extra > 0 ? "font-semibold text-red-600" : "text-green-600"
                            )}
                          >
                            {extra > 0
                              ? `${item.scannedQuantity} of ${item.quantity} · +${extra} extra`
                              : `${item.quantity} of ${item.quantity}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
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
          )}

          {receivingBox && (
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={scannedTotal === 0}
                onClick={() => setConfirmOpen(true)}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" /> Finish box
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={scannedTotal > 0}
                title={scannedTotal > 0 ? "Pieces have been scanned from this box" : undefined}
                onClick={() => setMissingOpen(true)}
              >
                <AlertTriangle className="h-4 w-4 mr-1" /> Box missing
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
              <AlertTriangle className="h-4 w-4" /> This box was received with a discrepancy.
            </div>
          )}
        </div>
      )}

      {/* Finish: the server judges the discrepancy from the scans */}
      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) setConfirmOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {mismatches.length === 0 ? "Finish box" : "Finish box with a discrepancy"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {mismatches.length === 0 ? (
              <p className="text-sm">
                All {packedTotal} pieces scanned and matched. The box will be received in full.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  The box will be received for what was scanned, and the difference sent to
                  Disputes:
                </p>
                <ul className="space-y-1 text-sm">
                  {mismatches.map((item) => (
                    <li key={item.sku} className="flex justify-between gap-2 font-mono text-xs">
                      <span className="truncate">{item.sku}</span>
                      <span className="shrink-0 tabular-nums text-red-600">
                        {item.scannedQuantity} of {item.quantity}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="e.g., box crushed, stock damp…"
                value={discrepancyNotes}
                onChange={(e) => setDiscrepancyNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Keep scanning</Button>
            <Button
              variant={mismatches.length === 0 ? "default" : "destructive"}
              onClick={() => finish(false)}
              disabled={confirming}
            >
              {confirming ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Finish box
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* A box that never arrived — the one way to close it, and it receives nothing */}
      <Dialog open={missingOpen} onOpenChange={(open) => { if (!open) setMissingOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Report box missing</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Nothing from this box will be received, and all {packedTotal} pieces go to
              Disputes as missing. Use this only if the box did not arrive.
            </p>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="e.g., not on the delivery, driver says 3 boxes loaded…"
                value={discrepancyNotes}
                onChange={(e) => setDiscrepancyNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMissingOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => finish(true)} disabled={confirming}>
              {confirming ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Report missing
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
  // Every scan is counted on the server — the page never holds a count of its
  // own, so there is nothing here that could be nudged up by hand.
  const scanPiece = useMutation(api.transfers.fulfillment.scanTransferPiece);
  const undoLastScan = useMutation(api.transfers.fulfillment.undoLastTransferScan);
  const confirmDelivery = useMutation(api.transfers.fulfillment.confirmTransferDelivery);

  const [damagedIds, setDamagedIds] = useState<Set<string>>(new Set());
  const [damageNotes, setDamageNotes] = useState<Record<string, string>>({});
  const [scanAlert, setScanAlert] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);

  useEffect(() => {
    setDamagedIds(new Set());
    setDamageNotes({});
    setScanAlert(null);
    setManualBarcode("");
    setSubmitting(false);
    setReceiveError(null);
  }, [transferId]);

  const handleScan = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      try {
        const res = await scanPiece({ transferId, code });
        const over = res.scannedQuantity > res.packedQuantity;
        playBeep(over ? 440 : 880);
        setScanAlert(
          over
            ? `${res.sku}: ${res.scannedQuantity} scanned, only ${res.packedQuantity} packed`
            : null
        );
      } catch (err) {
        playBeep(300, 0.3);
        setScanAlert(getErrorMessage(err));
      }
    },
    [scanPiece, transferId]
  );

  async function handleUndo() {
    try {
      const res = await undoLastScan({ transferId });
      setScanAlert(`Undid the last scan of ${res.sku}`);
    } catch (err) {
      setScanAlert(getErrorMessage(err));
    }
  }

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

  const scannedTotal =
    receivingData?.items.reduce((sum, item) => sum + item.scannedQuantity, 0) ?? 0;

  function submit(nothingArrived: boolean) {
    setSubmitting(true);
    setReceiveError(null);
    const hasOverage =
      !nothingArrived &&
      (receivingData?.items.some((item) => item.scannedQuantity > item.packedQuantity) ?? false);
    confirmDelivery({
      transferId,
      confirmOverage: hasOverage,
      ...(nothingArrived ? { nothingArrived: true } : {}),
      damageNotes: [...damagedIds].map((itemId) => ({
        itemId: itemId as Id<"transferItems">,
        notes: damageNotes[itemId]?.trim() || "Damaged (no notes provided)",
      })),
    }).then(
      () => onBack(),
      (err: unknown) => {
        setReceiveError(getErrorMessage(err));
        setSubmitting(false);
      }
    );
  }

  // The scans are what arrived. Short of what was packed is recorded against
  // the sending branch; over adds stock the sender never deducted, so it has
  // to be confirmed.
  function handleComplete() {
    if (!receivingData) return;

    const differences: string[] = [];
    let hasOverage = false;
    for (const item of receivingData.items) {
      if (damagedIds.has(item.itemId)) continue;
      const received = item.scannedQuantity;
      if (received < item.packedQuantity) {
        differences.push(
          `${item.sku}: ${received} of ${item.packedQuantity} packed — ${item.packedQuantity - received} short`
        );
      } else if (received > item.packedQuantity) {
        hasOverage = true;
        differences.push(
          `${item.sku}: ${received} scanned, ${item.packedQuantity} packed — ${received - item.packedQuantity} extra`
        );
      }
    }
    if (
      differences.length > 0 &&
      !window.confirm(
        `The scans don't match what was packed:\n\n${differences.join("\n")}\n\n` +
          "Shortages are recorded against the sending branch." +
          (hasOverage
            ? " Extra pieces are added to your stock and flagged for the warehouse — confirm only if they are physically here."
            : "") +
          "\n\nComplete receiving?"
      )
    ) {
      return;
    }
    submit(false);
  }

  function handleNothingArrived() {
    if (!receivingData) return;
    const packed = receivingData.items.reduce((sum, item) => sum + item.packedQuantity, 0);
    if (
      !window.confirm(
        `Report that nothing arrived?\n\nNo stock is received, and all ${packed} pieces go to Disputes as missing. Use this only if the delivery did not come.`
      )
    ) {
      return;
    }
    submit(true);
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
              . Your scans complete this delivery.
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onBack} disabled={submitting}>Back</Button>
      </div>

      {/* Scanner */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ScanBarcode className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Scan every piece — each scan receives one</h3>
        </div>
        <BarcodeScanner onScan={handleScan} isActive={true} />
        <div className="flex gap-2">
          <Input
            placeholder="Scan a barcode or SKU label"
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manualBarcode.trim()) {
                handleScan(manualBarcode);
                setManualBarcode("");
              }
            }}
            className="max-w-xs"
            autoFocus
          />
          <Button variant="ghost" size="sm" onClick={handleUndo} disabled={scannedTotal === 0}>
            Undo last scan
          </Button>
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
              <TableHead className="text-center">Scanned</TableHead>
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
              const received = item.scannedQuantity;
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
                  {/* Counted by scanning only — there is nothing to type or tap here. */}
                  <TableCell className="text-center font-semibold tabular-nums">{received}</TableCell>
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        {receiveError && <p className="text-sm text-destructive">{receiveError}</p>}
        <div className="ml-auto flex gap-2">
          {scannedTotal === 0 && receivingData && (
            <Button variant="outline" onClick={handleNothingArrived} disabled={submitting}>
              Nothing arrived
            </Button>
          )}
          <Button onClick={handleComplete} disabled={scannedTotal === 0 || submitting}>
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

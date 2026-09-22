"use client";

// components/shared/PackByScan.tsx — the packing bench counts what it scans.
//
// Packing was the last place in the chain taking a typed count, and it is the
// one that decides what the far branch is told to expect: a mistyped pack turns
// into a discrepancy raised against a branch that received exactly what was in
// the box. So the bench scans each piece, the server counts the scans, and
// there is nothing here to type a quantity into.
//
// Scanning refuses anything past what was requested — the source only ever held
// the requested quantity, so an extra piece has no stock behind it. A line can
// therefore be short, never over.

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { cn, getErrorMessage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle2, ScanBarcode } from "lucide-react";

export function PackByScan({
  transferId,
  expectedDeliveryDays,
  onPacked,
  onCancelled,
}: {
  transferId: Id<"transfers">;
  /** Days the warehouse expects the delivery to take, when the page asks for it. */
  expectedDeliveryDays?: number;
  onPacked?: () => void;
  onCancelled?: () => void;
}) {
  const packing = useQuery(api.transfers.fulfillment.getTransferPackingData, { transferId });
  const scanPiece = useMutation(api.transfers.fulfillment.scanPackPiece);
  const undoScan = useMutation(api.transfers.fulfillment.undoLastPackScan);
  const complete = useMutation(api.transfers.fulfillment.completeTransferPacking);
  const cancelPacking = useMutation(api.transfers.fulfillment.cancelAtPacking);

  const [code, setCode] = useState("");
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  if (packing === undefined) {
    return <div className="h-64 animate-pulse rounded-lg border bg-muted/40" />;
  }

  const requestedTotal = packing.items.reduce((s, i) => s + i.requestedQuantity, 0);
  const scannedTotal = packing.items.reduce((s, i) => s + i.scannedQuantity, 0);
  const shortLines = packing.items.filter((i) => i.scannedQuantity < i.requestedQuantity);

  async function handleScan(raw: string) {
    const value = raw.trim();
    setCode("");
    if (!value) return;
    setBusy(true);
    try {
      const res = await scanPiece({ transferId, code: value });
      setAlert(res.ok ? null : res.message);
    } catch (err) {
      setAlert(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Scanner */}
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <ScanBarcode className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">
            Scan each piece as it goes in — {scannedTotal} of {requestedTotal}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-xs"
            placeholder="Scan a barcode or SKU label"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleScan(code);
            }}
            autoFocus
          />
          <Button variant="outline" disabled={busy || !code.trim()} onClick={() => void handleScan(code)}>
            Add
          </Button>
          <Button
            variant="ghost"
            disabled={busy || scannedTotal === 0}
            onClick={() =>
              void (async () => {
                try {
                  const res = await undoScan({ transferId });
                  setAlert(`Undid the last scan of ${res.sku}`);
                } catch (err) {
                  setAlert(getErrorMessage(err));
                }
              })()
            }
          >
            Undo last scan
          </Button>
        </div>

        {alert && (
          <p className="flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {alert}
          </p>
        )}

        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-primary transition-all"
            style={{
              width: `${requestedTotal > 0 ? (scannedTotal / requestedTotal) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* What is still to scan */}
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Size / Color</TableHead>
              <TableHead className="text-right">Requested</TableHead>
              <TableHead className="text-right">Scanned</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {packing.items.map((item) => {
              const done = item.scannedQuantity >= item.requestedQuantity;
              return (
                <TableRow key={String(item.itemId)} className={cn(done && "bg-green-50/50")}>
                  <TableCell className="font-medium">{item.styleName}</TableCell>
                  <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                  <TableCell className="text-sm">{item.size} / {item.color}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.requestedQuantity}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {item.scannedQuantity}
                  </TableCell>
                  <TableCell className="text-right">
                    {done ? (
                      <Badge variant="default" className="text-xs">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Done
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-amber-700">
                        {item.requestedQuantity - item.scannedQuantity} to go
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          disabled={busy || scannedTotal > 0}
          title={scannedTotal > 0 ? "Pieces have been scanned — undo them first" : undefined}
          onClick={() => setCancelOpen(true)}
        >
          Nothing can be sent
        </Button>
        <Button disabled={busy || scannedTotal === 0} onClick={() => setConfirmOpen(true)}>
          <CheckCircle2 className="mr-1.5 h-4 w-4" />
          Finish packing
        </Button>
      </div>

      {/* Finish */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {shortLines.length === 0 ? "Finish packing" : "Finish packing short"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {shortLines.length === 0 ? (
              <p className="text-sm">
                All {requestedTotal} pieces scanned. This is what the receiving branch will be
                told to expect.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Less than was requested was scanned. The rest goes back on this branch&apos;s
                  shelf, and the consignment travels as:
                </p>
                <ul className="space-y-1 font-mono text-xs">
                  {shortLines.map((item) => (
                    <li key={String(item.itemId)} className="flex justify-between gap-2">
                      <span className="truncate">{item.sku}</span>
                      <span className="shrink-0 tabular-nums text-amber-700">
                        {item.scannedQuantity} of {item.requestedQuantity}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Keep scanning
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void (async () => {
                  setBusy(true);
                  try {
                    await complete({
                      transferId,
                      ...(expectedDeliveryDays ? { expectedDeliveryDays } : {}),
                    });
                    toast.success("Packed");
                    setConfirmOpen(false);
                    onPacked?.();
                  } catch (err) {
                    toast.error(getErrorMessage(err));
                  } finally {
                    setBusy(false);
                  }
                })()
              }
            >
              Finish packing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nothing can be sent — the one way out of an approved transfer */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nothing can be sent</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              The whole transfer is closed and every piece it was holding goes back on this
              branch&apos;s shelf.
            </p>
            <div className="space-y-2">
              <Label>Why?</Label>
              <Textarea
                rows={2}
                placeholder="e.g., stock not on the shelf, damaged in storage…"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={busy || !cancelReason.trim()}
              onClick={() =>
                void (async () => {
                  setBusy(true);
                  try {
                    await cancelPacking({ transferId, reason: cancelReason.trim() });
                    toast.success("Transfer closed, stock returned");
                    setCancelOpen(false);
                    onCancelled?.();
                  } catch (err) {
                    toast.error(getErrorMessage(err));
                  } finally {
                    setBusy(false);
                  }
                })()
              }
            >
              Close the transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

// app/branch/outbound/page.tsx — sending stock out of this branch.
//
// A store can raise a return to the warehouse or a transfer to another branch,
// and then has to send it: pack it, load it onto the vehicle and dispatch it.
// Those steps were shut to everyone but warehouse staff, so a branch could
// create a send it had no way to move. This is the branch's own bench for them.
//
// The goods are here, so the branch packs them and hands them over; the rules
// are the same ones the warehouse works to, including the load-out count and
// naming who takes them.

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { cn, getErrorMessage } from "@/lib/utils";
import { CustodyTimeline } from "@/components/shared/CustodyTimeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, ArrowRight, PackageCheck, Send, Truck } from "lucide-react";

function StageCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <p className="mb-2 text-sm font-semibold">{title}</p>
      {children}
    </div>
  );
}

// ─── One transfer ────────────────────────────────────────────────────────────

function OutboundDetail({
  transferId,
  onBack,
}: {
  transferId: Id<"transfers">;
  onBack: () => void;
}) {
  const transfer = useQuery(api.transfers.fulfillment.getBranchOutboundTransfer, {
    transferId,
  });
  const couriers = useQuery(api.logistics.couriers.listActiveCouriers, {});

  const completePacking = useMutation(api.transfers.fulfillment.completeTransferPacking);
  const scanBoxOut = useMutation(api.transfers.fulfillment.scanBoxOut);
  const undoBoxOut = useMutation(api.transfers.fulfillment.undoLastBoxOut);
  const confirmLoad = useMutation(api.transfers.fulfillment.confirmLoadOut);
  const reopenLoad = useMutation(api.transfers.fulfillment.reopenLoadOut);
  const dispatchPlain = useMutation(api.transfers.fulfillment.markTransferInTransit);
  const dispatchCourier = useMutation(api.warehouse.movements.dispatchViaCourier);

  const [packQty, setPackQty] = useState<Record<string, number>>({});
  const [boxCode, setBoxCode] = useState("");
  const [handedTo, setHandedTo] = useState("");
  const [loadNote, setLoadNote] = useState<string | null>(null);
  const [courierId, setCourierId] = useState("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (transfer === undefined) {
    return <div className="h-64 animate-pulse rounded-lg border bg-muted/40" />;
  }

  const packed = (itemId: string, requested: number) => packQty[itemId] ?? requested;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {transfer.type === "return" ? "Return" : "Send"} to {transfer.toBranchName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {transfer.fromBranchName} <ArrowRight className="inline h-3 w-3" />{" "}
            {transfer.toBranchName} · {transfer.status}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
        </Button>
      </div>

      {/* Pack */}
      {transfer.status === "approved" && (
        <StageCard title="Pack">
          <p className="mb-3 text-sm text-muted-foreground">
            Count out what is actually going. Anything you do not pack goes back on your
            own shelf.
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await completePacking({
                  transferId,
                  packedItems: transfer.items.map((i) => ({
                    itemId: i.itemId as Id<"transferItems">,
                    packedQuantity: packed(i.itemId as string, i.requestedQuantity),
                  })),
                });
                toast.success("Packed");
              })
            }
          >
            <PackageCheck className="mr-1.5 h-4 w-4" />
            Confirm packed
          </Button>
        </StageCard>
      )}

      {/* Load out */}
      {transfer.status === "packed" && !transfer.loadedAt && (
        <StageCard title="Load out">
          <div className="space-y-3">
            {transfer.boxCount > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Scan each box as it goes onto the vehicle.{" "}
                  <span className="font-medium text-foreground">
                    {transfer.loadedBoxes} of {transfer.boxCount} loaded
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="max-w-xs"
                    placeholder="Scan the box code"
                    value={boxCode}
                    onChange={(e) => setBoxCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && boxCode.trim()) {
                        const code = boxCode;
                        setBoxCode("");
                        void run(async () => {
                          const res = await scanBoxOut({ transferId, boxCode: code });
                          setLoadNote(
                            res.ok
                              ? `${res.boxCode} loaded · ${res.loadedCount} of ${res.totalBoxes}`
                              : res.message
                          );
                        });
                      }
                    }}
                  />
                  <Button
                    variant="ghost"
                    disabled={busy || transfer.loadedBoxes === 0}
                    onClick={() =>
                      run(async () => {
                        const res = await undoBoxOut({ transferId });
                        setLoadNote(`Took ${res.boxCode} back off`);
                      })
                    }
                  >
                    Undo last box
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No boxes — the pieces were counted at packing. Confirm the load once they
                are on the vehicle.
              </p>
            )}

            {loadNote && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                {loadNote}
              </p>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1">
                <span className="block text-xs text-muted-foreground">Who is taking it?</span>
                <Input
                  className="w-56"
                  placeholder="Driver or rider name"
                  value={handedTo}
                  onChange={(e) => setHandedTo(e.target.value)}
                />
              </label>
              <Button
                disabled={busy || !handedTo.trim()}
                onClick={() =>
                  run(async () => {
                    const short =
                      transfer.boxCount > 0 && transfer.loadedBoxes < transfer.boxCount;
                    if (
                      short &&
                      !window.confirm(
                        `Only ${transfer.loadedBoxes} of ${transfer.boxCount} boxes were scanned out.\n\nThe rest are recorded as staying behind. Continue?`
                      )
                    ) {
                      return;
                    }
                    await confirmLoad({
                      transferId,
                      handedToName: handedTo.trim(),
                      ...(short ? { confirmShortLoad: true } : {}),
                    });
                    setLoadNote(null);
                    toast.success("Loaded out");
                  })
                }
              >
                Confirm load out
              </Button>
            </div>
          </div>
        </StageCard>
      )}

      {/* Dispatch */}
      {transfer.status === "packed" && transfer.loadedAt && (
        <StageCard title="Dispatch">
          <p className="mb-3 text-sm text-muted-foreground">
            {transfer.loadedBoxCount !== null
              ? `${transfer.loadedBoxCount} of ${transfer.boxCount} boxes`
              : "Pieces"}{" "}
            handed to{" "}
            <span className="font-medium text-foreground">{transfer.handedToName}</span>.{" "}
            <button
              type="button"
              className="underline hover:no-underline"
              onClick={() => run(() => reopenLoad({ transferId }))}
            >
              Reopen the load
            </button>{" "}
            if it has not left.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await dispatchPlain({ transferId });
                  toast.success("On its way");
                  onBack();
                })
              }
            >
              <Send className="mr-1.5 h-4 w-4" />
              Dispatch
            </Button>

            <span className="text-xs text-muted-foreground">or with a courier:</span>
            <select
              value={courierId}
              onChange={(e) => setCourierId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select courier</option>
              {couriers?.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
            <Input
              className="w-40"
              placeholder="Tracking no."
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={busy || !courierId}
              onClick={() =>
                run(async () => {
                  await dispatchCourier({
                    transferId,
                    courierId: courierId as Id<"couriers">,
                    ...(tracking.trim() ? { trackingNumber: tracking.trim() } : {}),
                  });
                  toast.success("Dispatched with courier");
                  onBack();
                })
              }
            >
              <Truck className="mr-1.5 h-4 w-4" />
              Dispatch via courier
            </Button>
          </div>
        </StageCard>
      )}

      {/* What is going */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Requested</TableHead>
              <TableHead className="text-right">Packing</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transfer.items.map((item) => (
              <TableRow key={item.itemId}>
                <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                <TableCell>
                  {item.styleName}{" "}
                  <span className="text-muted-foreground">
                    · {item.size} / {item.color}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.requestedQuantity}
                </TableCell>
                <TableCell className="text-right">
                  {transfer.status === "approved" ? (
                    <Input
                      type="number"
                      min={0}
                      max={item.requestedQuantity}
                      className="ml-auto w-20 text-right"
                      value={packed(item.itemId as string, item.requestedQuantity)}
                      onChange={(e) =>
                        setPackQty((prev) => ({
                          ...prev,
                          [item.itemId as string]: Math.min(
                            item.requestedQuantity,
                            Math.max(0, parseInt(e.target.value) || 0)
                          ),
                        }))
                      }
                    />
                  ) : (
                    <span className="tabular-nums">{item.packedQuantity ?? "—"}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CustodyTimeline transferId={transferId} />
    </div>
  );
}

// ─── The list ────────────────────────────────────────────────────────────────

export default function BranchOutboundPage() {
  const [openId, setOpenId] = useState<Id<"transfers"> | null>(null);
  const outbound = useQuery(api.transfers.fulfillment.listBranchOutboundTransfers, {});

  if (openId) {
    return <OutboundDetail transferId={openId} onBack={() => setOpenId(null)} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sending Out</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Returns and transfers leaving this branch — pack them, load them out and send them.
        </p>
      </div>

      {outbound === undefined ? (
        <div className="h-40 animate-pulse rounded-lg border bg-muted/40" />
      ) : outbound.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          Nothing to send. Approved returns and transfers out of this branch appear here.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>To</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Pieces</TableHead>
                <TableHead>Next step</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {outbound.map((t) => {
                const next =
                  t.status === "approved"
                    ? "Pack it"
                    : !t.loadedAt
                      ? "Load it out"
                      : "Dispatch it";
                return (
                  <TableRow
                    key={t._id}
                    className="cursor-pointer"
                    onClick={() => setOpenId(t._id as Id<"transfers">)}
                  >
                    <TableCell className="font-medium">{t.toBranchName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {t.type === "return" ? "Return" : t.type === "interBranch" ? "Transfer" : "Send"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.status === "approved" ? t.requestedPieces : t.packedPieces}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "text-sm",
                          next === "Dispatch it" ? "font-medium text-primary" : ""
                        )}
                      >
                        {next}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

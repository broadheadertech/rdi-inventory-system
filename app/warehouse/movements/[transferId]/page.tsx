"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownLeft,
  Check,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STAGES = ["requested", "approved", "packed", "inTransit", "delivered"] as const;
const STAGE_LABELS: Record<string, string> = {
  requested: "Requested",
  approved: "Approved",
  packed: "Packed",
  inTransit: "In Transit",
  delivered: "Delivered",
};

const HQ_ROLES = ["admin", "hqStaff"];

function fmt(ms: number | null): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function MovementDetailPage() {
  const params = useParams<{ transferId: string }>();
  const router = useRouter();
  const transferId = params.transferId as Id<"transfers">;

  const currentUser = useQuery(api.auth.users.getCurrentUser);
  const movement = useQuery(api.warehouse.movements.getMovement, { transferId });

  const approve = useMutation(api.transfers.requests.approveTransfer);
  const reject = useMutation(api.transfers.requests.rejectTransfer);
  const pack = useMutation(api.transfers.fulfillment.completeTransferPacking);
  const dispatch = useMutation(api.transfers.fulfillment.markTransferInTransit);
  const assignDriver = useMutation(api.logistics.assignments.assignDriverToTransfer);
  const confirm = useMutation(api.transfers.fulfillment.confirmTransferDelivery);

  const isHQ = currentUser ? HQ_ROLES.includes(currentUser.role) : false;

  const drivers = useQuery(
    api.logistics.assignments.listActiveDrivers,
    isHQ && movement?.status === "packed" ? {} : "skip"
  );

  const [packQty, setPackQty] = useState<Record<string, number>>({});
  const [recvQty, setRecvQty] = useState<Record<string, number>>({});
  const [driverId, setDriverId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (movement === undefined || currentUser === undefined) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (movement === null) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-muted-foreground">Movement not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/warehouse/movements")}>
          Back to Stock Movement
        </Button>
      </div>
    );
  }

  const isOut = movement.direction === "out";
  const status = movement.status;
  const terminalBad = status === "rejected" || status === "cancelled";
  const currentStageIndex = STAGES.indexOf(status as (typeof STAGES)[number]);

  const stageTime: Record<string, number | null> = {
    requested: movement.createdAt,
    approved: movement.approvedAt,
    packed: movement.packedAt,
    inTransit: movement.shippedAt,
    delivered: movement.deliveredAt,
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/warehouse/movements"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Stock Movement
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight">
          {isOut ? (
            <ArrowUpRight className="h-6 w-6 text-orange-600" />
          ) : (
            <ArrowDownLeft className="h-6 w-6 text-emerald-600" />
          )}
          {movement.fromBranchName} → {movement.toBranchName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isOut ? "Moving Out" : movement.direction === "in" ? "Moving In" : "Branch → Branch"}
          {movement.notes ? ` · ${movement.notes}` : ""}
        </p>
      </div>

      {/* Timeline */}
      {!terminalBad ? (
        <div className="flex items-center gap-1">
          {STAGES.map((stage, idx) => {
            const done = idx < currentStageIndex || status === "delivered";
            const current = idx === currentStageIndex && status !== "delivered";
            return (
              <div key={stage} className="flex flex-1 items-center gap-1">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                      done
                        ? "bg-green-600 text-white"
                        : current
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {done ? <Check className="h-4 w-4" /> : idx + 1}
                  </div>
                  <span
                    className={cn(
                      "whitespace-nowrap text-[10px]",
                      current ? "font-semibold text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {STAGE_LABELS[stage]}
                  </span>
                  {stageTime[stage] && (
                    <span className="text-[9px] text-muted-foreground">{fmt(stageTime[stage])}</span>
                  )}
                </div>
                {idx < STAGES.length - 1 && (
                  <div className={cn("h-0.5 flex-1", done ? "bg-green-600" : "bg-muted")} />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {status === "rejected" ? "Rejected" : "Cancelled"}
          {movement.rejectedReason ? ` — ${movement.rejectedReason}` : ""}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Stage action card */}
      {status === "requested" && (
        <StageCard title="Approval">
          <div className="flex gap-2">
            <Button onClick={() => run(() => approve({ transferId }))} disabled={busy}>
              Approve
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                const reason = window.prompt("Reason for rejection?")?.trim();
                if (reason) run(() => reject({ transferId, reason }));
              }}
            >
              Reject
            </Button>
          </div>
        </StageCard>
      )}

      {status === "approved" && (
        <StageCard title="Pack (by piece)">
          <p className="mb-3 text-sm text-muted-foreground">
            Enter the quantity packed for each item, then confirm.
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              run(() =>
                pack({
                  transferId,
                  packedItems: movement.items.map((i) => ({
                    itemId: i.itemId as Id<"transferItems">,
                    packedQuantity: packQty[i.itemId as string] ?? i.requestedQuantity,
                  })),
                })
              )
            }
          >
            Confirm Packing
          </Button>
        </StageCard>
      )}

      {status === "packed" && (
        <StageCard title="Dispatch">
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={busy} onClick={() => run(() => dispatch({ transferId }))}>
              <Truck className="mr-1.5 h-4 w-4" />
              Dispatch (no driver)
            </Button>
            {isHQ && (
              <div className="flex items-center gap-2">
                <select
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">Assign a driver…</option>
                  {drivers?.map((d) => (
                    <option key={d._id as string} value={d._id as string}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  disabled={busy || !driverId}
                  onClick={() =>
                    run(() => assignDriver({ transferId, driverId: driverId as Id<"users"> }))
                  }
                >
                  Assign & Dispatch
                </Button>
              </div>
            )}
          </div>
        </StageCard>
      )}

      {status === "inTransit" && movement.driverId && (
        <StageCard title="Out for delivery">
          <p className="text-sm text-muted-foreground">
            Assigned to driver{" "}
            <span className="font-medium text-foreground">{movement.driverName}</span>. The driver
            confirms delivery from the Driver app.
          </p>
        </StageCard>
      )}

      {status === "inTransit" && !movement.driverId && (
        <StageCard title="Confirm Receipt">
          <p className="mb-3 text-sm text-muted-foreground">
            Confirm what arrived at{" "}
            <span className="font-medium text-foreground">{movement.toBranchName}</span>. Any
            difference from “Packed” is flagged as a discrepancy.
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              run(() =>
                confirm({
                  transferId,
                  receivedItems: movement.items.map((i) => ({
                    itemId: i.itemId as Id<"transferItems">,
                    receivedQuantity:
                      recvQty[i.itemId as string] ??
                      i.packedQuantity ??
                      i.requestedQuantity,
                  })),
                })
              )
            }
          >
            Confirm Receipt
          </Button>
        </StageCard>
      )}

      {/* Items table — columns adapt to stage */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-foreground">SKU</TableHead>
              <TableHead className="text-foreground">Product</TableHead>
              <TableHead className="text-foreground text-right">Requested</TableHead>
              {status === "approved" ? (
                <TableHead className="text-foreground text-right w-28">Pack Qty</TableHead>
              ) : (
                <TableHead className="text-foreground text-right">Packed</TableHead>
              )}
              {status === "inTransit" && !movement.driverId ? (
                <TableHead className="text-foreground text-right w-28">Received</TableHead>
              ) : (
                <TableHead className="text-foreground text-right">Received</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {movement.items.map((i) => {
              const id = i.itemId as string;
              const discrepancy =
                i.receivedQuantity !== null &&
                i.receivedQuantity !== (i.packedQuantity ?? i.requestedQuantity);
              return (
                <TableRow key={id}>
                  <TableCell className="font-mono text-xs">{i.sku}</TableCell>
                  <TableCell>
                    {i.styleName}{" "}
                    <span className="text-muted-foreground">· {i.size} / {i.color}</span>
                  </TableCell>
                  <TableCell className="text-right">{i.requestedQuantity}</TableCell>
                  {/* Packed column / input */}
                  {status === "approved" ? (
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        max={i.requestedQuantity}
                        value={packQty[id] ?? i.requestedQuantity}
                        onChange={(e) =>
                          setPackQty((p) => ({ ...p, [id]: parseInt(e.target.value) || 0 }))
                        }
                        className="ml-auto w-20 text-right"
                      />
                    </TableCell>
                  ) : (
                    <TableCell className="text-right">{i.packedQuantity ?? "—"}</TableCell>
                  )}
                  {/* Received column / input */}
                  {status === "inTransit" && !movement.driverId ? (
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        value={recvQty[id] ?? i.packedQuantity ?? i.requestedQuantity}
                        onChange={(e) =>
                          setRecvQty((p) => ({ ...p, [id]: parseInt(e.target.value) || 0 }))
                        }
                        className="ml-auto w-20 text-right"
                      />
                    </TableCell>
                  ) : (
                    <TableCell
                      className={cn(
                        "text-right",
                        discrepancy ? "font-medium text-red-600" : ""
                      )}
                    >
                      {i.receivedQuantity ?? "—"}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StageCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <p className="mb-2 text-sm font-semibold">{title}</p>
      {children}
    </div>
  );
}

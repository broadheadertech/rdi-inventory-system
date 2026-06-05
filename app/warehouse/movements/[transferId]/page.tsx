"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ArrowDownLeft } from "lucide-react";
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

const STATUS_STYLES: Record<string, string> = {
  inTransit: "bg-blue-100 text-blue-700",
  delivered: "bg-green-100 text-green-700",
};

const STATUS_LABELS: Record<string, string> = {
  inTransit: "In Transit",
  delivered: "Completed",
};

export default function MovementDetailPage() {
  const params = useParams<{ transferId: string }>();
  const router = useRouter();
  const transferId = params.transferId as Id<"transfers">;

  const movement = useQuery(api.warehouse.movements.getMovement, { transferId });
  const confirmDelivery = useMutation(
    api.transfers.fulfillment.confirmTransferDelivery
  );

  const [received, setReceived] = useState<Record<string, number>>({});
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const isInTransit = movement && movement.status === "inTransit";

  function qtyFor(itemId: string, sent: number): number {
    return received[itemId] ?? sent;
  }

  async function handleConfirm() {
    if (!movement) return;
    setError(null);
    setConfirming(true);
    try {
      const res = await confirmDelivery({
        transferId,
        receivedItems: movement.items.map((i) => ({
          itemId: i.itemId as Id<"transferItems">,
          receivedQuantity: qtyFor(i.itemId as string, i.sentQuantity),
        })),
      });
      const shortages = movement.items.filter(
        (i) => qtyFor(i.itemId as string, i.sentQuantity) !== i.sentQuantity
      ).length;
      setDone(
        shortages > 0
          ? `Confirmed with ${shortages} discrepancy line(s). Stock updated.`
          : "Confirmed — stock updated."
      );
      void res;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm");
    } finally {
      setConfirming(false);
    }
  }

  if (movement === undefined) {
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
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/warehouse/movements")}
        >
          Back to Stock Movement
        </Button>
      </div>
    );
  }

  const isOut = movement.direction === "out";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/warehouse/movements"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Stock Movement
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              {isOut ? (
                <ArrowUpRight className="h-6 w-6 text-orange-600" />
              ) : (
                <ArrowDownLeft className="h-6 w-6 text-emerald-600" />
              )}
              {movement.fromBranchName} → {movement.toBranchName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isOut ? "Moving Out" : movement.direction === "in" ? "Moving In" : "Branch → Branch"}
            </p>
          </div>
          <span
            className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
              STATUS_STYLES[movement.status] ?? "bg-gray-100 text-gray-700"
            }`}
          >
            {STATUS_LABELS[movement.status] ?? movement.status}
          </span>
        </div>
        {movement.notes && (
          <p className="mt-2 text-sm text-muted-foreground">{movement.notes}</p>
        )}
      </div>

      {done && (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {done}
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-foreground">SKU</TableHead>
              <TableHead className="text-foreground">Product</TableHead>
              <TableHead className="text-foreground text-right">Sent</TableHead>
              <TableHead className="text-foreground text-right">
                {isInTransit ? "Received" : movement.status === "delivered" ? "Received" : ""}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movement.items.map((i) => (
              <TableRow key={i.itemId as string}>
                <TableCell className="font-mono text-xs">{i.sku}</TableCell>
                <TableCell>
                  {i.styleName}{" "}
                  <span className="text-muted-foreground">
                    · {i.size} / {i.color}
                  </span>
                </TableCell>
                <TableCell className="text-right">{i.sentQuantity}</TableCell>
                <TableCell className="text-right">
                  {isInTransit ? (
                    <Input
                      type="number"
                      min={0}
                      value={qtyFor(i.itemId as string, i.sentQuantity)}
                      onChange={(e) =>
                        setReceived((prev) => ({
                          ...prev,
                          [i.itemId as string]: parseInt(e.target.value) || 0,
                        }))
                      }
                      className="ml-auto w-20 text-right"
                    />
                  ) : (
                    i.receivedQuantity ?? "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {isInTransit && !done && (
        <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            Confirm what physically arrived at{" "}
            <span className="font-medium text-foreground">{movement.toBranchName}</span>.
            Any difference from “Sent” is flagged as a discrepancy.
          </p>
          <Button onClick={handleConfirm} disabled={confirming}>
            {confirming ? "Confirming…" : "Confirm Receipt"}
          </Button>
        </div>
      )}
    </div>
  );
}

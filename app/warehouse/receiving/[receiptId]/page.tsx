"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ScanLine, CheckCircle2, AlertTriangle } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { BarcodeScanner } from "@/components/shared/BarcodeScanner";
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

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  receiving: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  discrepancy: "bg-red-100 text-red-700",
};

export default function ReceiptDetailPage() {
  const params = useParams<{ receiptId: string }>();
  const router = useRouter();
  const receiptId = params.receiptId as Id<"supplierReceipts">;

  const receipt = useQuery(api.suppliers.receiving.getReceipt, { receiptId });
  const scanItem = useMutation(api.suppliers.receiving.scanItem);
  const setReceivedQuantity = useMutation(
    api.suppliers.receiving.setReceivedQuantity
  );
  const completeReceipt = useMutation(api.suppliers.receiving.completeReceipt);

  const [manualCode, setManualCode] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [feedback, setFeedback] = useState<
    { kind: "ok" | "warn" | "err"; message: string } | null
  >(null);
  const [completing, setCompleting] = useState(false);

  const isOpen =
    receipt && (receipt.status === "pending" || receipt.status === "receiving");

  async function doScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    try {
      const res = await scanItem({ receiptId, barcode: trimmed });
      setFeedback({
        kind: res.unexpected ? "warn" : "ok",
        message: res.unexpected
          ? `Unexpected: ${res.sku} (${res.styleName}) — not in allocation, added as overage`
          : `${res.sku} (${res.styleName}) — ${res.receivedQuantity}/${res.declaredQuantity}`,
      });
    } catch (err) {
      setFeedback({
        kind: "err",
        message: friendlyError(err, "That scan didn't work."),
      });
    }
  }

  async function handleManualScan(e: React.FormEvent) {
    e.preventDefault();
    await doScan(manualCode);
    setManualCode("");
  }

  async function handleComplete() {
    setCompleting(true);
    try {
      const res = await completeReceipt({ receiptId });
      setFeedback(
        res.hasDiscrepancy
          ? {
              kind: "warn",
              message: `Completed with ${res.discrepancyCount} discrepancy line(s). Warehouse admins notified.`,
            }
          : { kind: "ok", message: "Completed — allocation matched. Stock added." }
      );
    } catch (err) {
      setFeedback({
        kind: "err",
        message: friendlyError(err, "Couldn't complete the receipt."),
      });
    } finally {
      setCompleting(false);
    }
  }

  if (receipt === undefined) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (receipt === null) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-muted-foreground">Receipt not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/warehouse/receiving")}>
          Back to Goods Receipt
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/warehouse/receiving"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Goods Receipt
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              PO {receipt.poNumber}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {receipt.supplierName} · {formatDate(receipt.deliveryWindowStart)} –{" "}
              {formatDate(receipt.deliveryWindowEnd)}
            </p>
          </div>
          <span
            className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
              STATUS_STYLES[receipt.status] ?? "bg-gray-100 text-gray-700"
            }`}
          >
            {receipt.status}
          </span>
        </div>
        {receipt.notes && (
          <p className="mt-2 text-sm text-muted-foreground">{receipt.notes}</p>
        )}
        {receipt.photoUrl && (
          <a
            href={receipt.photoUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block"
          >
            <Image
              src={receipt.photoUrl}
              alt="PO receipt"
              width={96}
              height={96}
              className="h-24 w-24 rounded-md border object-cover"
            />
          </a>
        )}
      </div>

      {/* Scan box */}
      {isOpen && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ScanLine className="h-4 w-4" /> Scan items (each scan = 1 received)
          </div>
          <form onSubmit={handleManualScan} className="flex gap-2">
            <Input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Scan or type SKU / barcode, then Enter"
              autoFocus
            />
            <Button type="submit">Add</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCameraOn((v) => !v)}
            >
              {cameraOn ? "Stop Camera" : "Use Camera"}
            </Button>
          </form>

          {cameraOn && (
            <BarcodeScanner onScan={(code) => doScan(code)} isActive={cameraOn} />
          )}

          {feedback && (
            <div
              className={`rounded-md px-3 py-2 text-sm ${
                feedback.kind === "ok"
                  ? "bg-green-50 text-green-700"
                  : feedback.kind === "warn"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-red-50 text-red-700"
              }`}
            >
              {feedback.message}
            </div>
          )}
        </div>
      )}

      {/* Completed summary feedback */}
      {!isOpen && feedback && (
        <div
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
            feedback.kind === "ok"
              ? "bg-green-50 text-green-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {feedback.kind === "ok" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          {feedback.message}
        </div>
      )}

      {/* Items table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-foreground">SKU</TableHead>
              <TableHead className="text-foreground">Product</TableHead>
              <TableHead className="text-foreground text-right">Declared</TableHead>
              <TableHead className="text-foreground text-right">Received</TableHead>
              <TableHead className="text-foreground text-right">Discrepancy</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {receipt.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No lines.
                </TableCell>
              </TableRow>
            ) : (
              receipt.items.map((i) => (
                <TableRow key={i._id as string}>
                  <TableCell className="font-mono text-xs">
                    {i.sku}
                    {i.isUnexpected && (
                      <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700">
                        unexpected
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {i.styleName}{" "}
                    <span className="text-muted-foreground">
                      · {i.size} / {i.color}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{i.declaredQuantity}</TableCell>
                  <TableCell className="text-right">
                    {isOpen ? (
                      <Input
                        type="number"
                        min={0}
                        value={i.receivedQuantity}
                        onChange={(e) =>
                          setReceivedQuantity({
                            itemId: i._id as Id<"supplierReceiptItems">,
                            receivedQuantity: parseInt(e.target.value) || 0,
                          })
                        }
                        className="ml-auto w-20 text-right"
                      />
                    ) : (
                      i.receivedQuantity
                    )}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      i.discrepancy === 0
                        ? "text-muted-foreground"
                        : "text-red-600"
                    }`}
                  >
                    {i.discrepancy > 0 ? `+${i.discrepancy}` : i.discrepancy}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Complete */}
      {isOpen && (
        <div className="flex justify-end">
          <Button onClick={handleComplete} disabled={completing}>
            {completing ? "Completing…" : "Complete Receipt"}
          </Button>
        </div>
      )}
    </div>
  );
}

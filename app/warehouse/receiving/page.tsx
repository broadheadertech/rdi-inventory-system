"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  receiving: "Receiving",
  completed: "Completed",
  discrepancy: "Discrepancy",
};

export default function ReceivingListPage() {
  const receipts = useQuery(api.suppliers.receiving.listReceipts);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Goods Receipt</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Receive supplies from suppliers against a declared allocation.
          </p>
        </div>
        <Button asChild>
          <Link href="/warehouse/receiving/new">
            <Plus className="mr-1.5 h-4 w-4" />
            New Goods Receipt
          </Link>
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-foreground">PO Number</TableHead>
              <TableHead className="text-foreground">Supplier</TableHead>
              <TableHead className="text-foreground">Delivery Window</TableHead>
              <TableHead className="text-foreground text-right">Declared</TableHead>
              <TableHead className="text-foreground text-right">Received</TableHead>
              <TableHead className="text-foreground">Status</TableHead>
              <TableHead className="text-foreground text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {receipts === undefined ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  </TableCell>
                </TableRow>
              ))
            ) : receipts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No goods receipts yet. Click “New Goods Receipt” to start.
                </TableCell>
              </TableRow>
            ) : (
              receipts.map((r) => (
                <TableRow key={r._id as string} className="cursor-pointer">
                  <TableCell className="p-0">
                    <Link
                      href={`/warehouse/receiving/${r._id}`}
                      className="block px-2 py-2 font-medium"
                    >
                      {r.poNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/warehouse/receiving/${r._id}`} className="block">
                      {r.supplierName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(r.deliveryWindowStart)} – {formatDate(r.deliveryWindowEnd)}
                  </TableCell>
                  <TableCell className="text-right">{r.declaredTotal}</TableCell>
                  <TableCell className="text-right">{r.receivedTotal}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[r.status] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      asChild
                      size="sm"
                      variant={r.status === "pending" ? "default" : "outline"}
                    >
                      <Link href={`/warehouse/receiving/${r._id}`}>
                        {r.status === "pending"
                          ? "Start Receiving"
                          : r.status === "receiving"
                            ? "Continue"
                            : "View"}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

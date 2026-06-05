"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { Plus, ArrowUpRight, ArrowDownLeft } from "lucide-react";
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
  inTransit: "bg-blue-100 text-blue-700",
  delivered: "bg-green-100 text-green-700",
  requested: "bg-gray-100 text-gray-700",
  approved: "bg-violet-100 text-violet-700",
  packed: "bg-amber-100 text-amber-700",
  cancelled: "bg-gray-100 text-gray-500",
  rejected: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  inTransit: "In Transit",
  delivered: "Completed",
  requested: "Requested",
  approved: "Approved",
  packed: "Packed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export default function MovementsListPage() {
  const movements = useQuery(api.warehouse.movements.listMovements);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stock Movement</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Move stock out to branches and in from branches.
          </p>
        </div>
        <Button asChild>
          <Link href="/warehouse/movements/new">
            <Plus className="mr-1.5 h-4 w-4" />
            New Movement
          </Link>
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-foreground">Direction</TableHead>
              <TableHead className="text-foreground">Branch</TableHead>
              <TableHead className="text-foreground text-right">Lines</TableHead>
              <TableHead className="text-foreground text-right">Qty</TableHead>
              <TableHead className="text-foreground">Date</TableHead>
              <TableHead className="text-foreground">Status</TableHead>
              <TableHead className="text-foreground text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movements === undefined ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  </TableCell>
                </TableRow>
              ))
            ) : movements.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No movements yet. Click “New Movement” to start.
                </TableCell>
              </TableRow>
            ) : (
              movements.map((m) => (
                <TableRow key={m._id as string}>
                  <TableCell>
                    {m.direction === "out" ? (
                      <span className="inline-flex items-center gap-1 font-medium text-orange-600">
                        <ArrowUpRight className="h-4 w-4" /> Out
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                        <ArrowDownLeft className="h-4 w-4" /> In
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{m.otherBranchName}</TableCell>
                  <TableCell className="text-right">{m.lineCount}</TableCell>
                  <TableCell className="text-right">{m.totalQty}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(m.createdAt)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[m.status] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {STATUS_LABELS[m.status] ?? m.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/warehouse/movements/${m._id}`}>
                        {m.status === "inTransit" ? "Open" : "View"}
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

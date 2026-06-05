"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AllocationLine = {
  variantId: Id<"variants">;
  sku: string;
  styleName: string;
  size: string;
  color: string;
  declaredQuantity: number;
};

// ─── SKU search + add ──────────────────────────────────────────────────────────

function AllocationBuilder({
  lines,
  setLines,
}: {
  lines: AllocationLine[];
  setLines: (next: AllocationLine[]) => void;
}) {
  const [search, setSearch] = useState("");
  const results = useQuery(
    api.suppliers.receiving.searchVariants,
    search.trim().length >= 2 ? { search } : "skip"
  );

  function addLine(r: {
    variantId: Id<"variants">;
    sku: string;
    styleName: string;
    size: string;
    color: string;
  }) {
    if (lines.some((l) => l.variantId === r.variantId)) {
      setSearch("");
      return;
    }
    setLines([...lines, { ...r, declaredQuantity: 1 }]);
    setSearch("");
  }

  function updateQty(variantId: Id<"variants">, qty: number) {
    setLines(
      lines.map((l) =>
        l.variantId === variantId ? { ...l, declaredQuantity: qty } : l
      )
    );
  }

  function removeLine(variantId: Id<"variants">) {
    setLines(lines.filter((l) => l.variantId !== variantId));
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search SKU or barcode to add a line…"
        />
        {search.trim().length >= 2 && results && results.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-white shadow-lg">
            {results.map((r) => (
              <button
                key={r.variantId as string}
                type="button"
                onClick={() => addLine(r)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
              >
                <span className="font-mono text-xs">{r.sku}</span>
                <span className="flex-1 truncate text-muted-foreground">
                  {r.styleName} · {r.size} / {r.color}
                </span>
                <Plus className="h-3.5 w-3.5 text-primary" />
              </button>
            ))}
          </div>
        )}
        {search.trim().length >= 2 && results && results.length === 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-muted-foreground shadow-lg">
            No matching SKUs.
          </div>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-foreground">SKU</TableHead>
              <TableHead className="text-foreground">Product</TableHead>
              <TableHead className="text-foreground w-32 text-right">
                Declared Qty
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No lines yet. Search a SKU above to add the declared allocation.
                </TableCell>
              </TableRow>
            ) : (
              lines.map((l) => (
                <TableRow key={l.variantId as string}>
                  <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                  <TableCell>
                    {l.styleName}{" "}
                    <span className="text-muted-foreground">
                      · {l.size} / {l.color}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={0}
                      value={l.declaredQuantity}
                      onChange={(e) =>
                        updateQty(l.variantId, parseInt(e.target.value) || 0)
                      }
                      className="ml-auto w-24 text-right"
                    />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => removeLine(l.variantId)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewReceiptPage() {
  const router = useRouter();
  const suppliers = useQuery(api.suppliers.directory.listSuppliers);
  const createReceipt = useMutation(api.suppliers.receiving.createReceipt);
  const generateUploadUrl = useMutation(
    api.suppliers.receiving.generateReceiptUploadUrl
  );

  const [supplierId, setSupplierId] = useState<string>("");
  const [poNumber, setPoNumber] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [lines, setLines] = useState<AllocationLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!supplierId) return setError("Select a supplier.");
    if (!poNumber.trim()) return setError("Enter the PO / PR order number.");
    if (!startDate || !endDate) return setError("Set the delivery date range.");
    if (lines.length === 0) return setError("Add at least one declared line.");

    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    if (endMs < startMs) return setError("End date must be after start date.");

    setSubmitting(true);
    try {
      // Upload the PO receipt photo, if any
      let receiptPhotoStorageId: Id<"_storage"> | undefined;
      if (photo) {
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": photo.type },
          body: photo,
        });
        if (!res.ok) throw new Error("Photo upload failed.");
        const { storageId } = await res.json();
        receiptPhotoStorageId = storageId as Id<"_storage">;
      }

      const receiptId = await createReceipt({
        supplierId: supplierId as Id<"suppliers">,
        poNumber: poNumber.trim(),
        deliveryWindowStart: startMs,
        deliveryWindowEnd: endMs,
        receiptPhotoStorageId,
        notes: notes.trim() || undefined,
        items: lines.map((l) => ({
          variantId: l.variantId,
          declaredQuantity: l.declaredQuantity,
        })),
      });

      router.push(`/warehouse/receiving/${receiptId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create receipt");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Goods Receipt</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Record an inbound supplier delivery and its declared allocation.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="supplier">Supplier</Label>
            <select
              id="supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            >
              <option value="">Select a supplier…</option>
              {suppliers?.map((s) => (
                <option key={s._id as string} value={s._id as string}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="po">PO / PR Order Number</Label>
            <Input
              id="po"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              placeholder="e.g. PO-2026-0042"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="start">Delivery Window — Start</Label>
            <Input
              id="start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="end">Delivery Window — End</Label>
            <Input
              id="end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="photo">Purchase Order Receipt (photo)</Label>
            <Input
              id="photo"
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything worth noting about this delivery"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Declared Allocation</Label>
          <AllocationBuilder lines={lines} setLines={setLines} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/warehouse/receiving")}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create Receipt"}
          </Button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus, ArrowUpRight, ArrowDownLeft, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
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

type Direction = "out" | "in" | "branch";

type Line = {
  variantId: Id<"variants">;
  sku: string;
  styleName: string;
  size: string;
  color: string;
  available: number;
  quantity: number;
};

const DIRECTIONS: { key: Direction; label: string; icon: typeof ArrowUpRight; hint: string }[] = [
  { key: "out", label: "Moving Out", icon: ArrowUpRight, hint: "Warehouse → Branch" },
  { key: "in", label: "Moving In", icon: ArrowDownLeft, hint: "Branch → Warehouse" },
  { key: "branch", label: "Branch → Branch", icon: ArrowRightLeft, hint: "Branch → Branch" },
];

export default function NewMovementPage() {
  const router = useRouter();
  const branches = useQuery(api.warehouse.movements.listMovementBranches);
  const createMovement = useMutation(api.warehouse.movements.createMovement);

  const [direction, setDirection] = useState<Direction>("out");
  const [branchA, setBranchA] = useState<string>(""); // the retail branch (out/in) or source (branch→branch)
  const [branchB, setBranchB] = useState<string>(""); // destination for branch→branch
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const warehouse = useMemo(
    () => branches?.find((b) => b.isWarehouse) ?? null,
    [branches]
  );
  const retailBranches = useMemo(
    () => branches?.filter((b) => !b.isWarehouse) ?? [],
    [branches]
  );

  // Resolve from/to from the chosen direction
  const fromBranchId: string =
    direction === "out" ? warehouse?._id ?? "" : branchA;
  const toBranchId: string =
    direction === "out" ? branchA : direction === "in" ? warehouse?._id ?? "" : branchB;

  function resetLines() {
    setLines([]);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Movement</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dispatch stock between the warehouse and branches. The other side
          confirms receipt.
        </p>
      </div>

      {/* Direction toggle */}
      <div className="grid grid-cols-3 gap-2">
        {DIRECTIONS.map((d) => {
          const active = direction === d.key;
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => {
                setDirection(d.key);
                setBranchA("");
                setBranchB("");
                resetLines();
              }}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors",
                active
                  ? "border-primary bg-primary/5 text-primary"
                  : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              <d.icon className="h-5 w-5" />
              <span className="font-medium">{d.label}</span>
              <span className="text-[11px]">{d.hint}</span>
            </button>
          );
        })}
      </div>

      {/* Branch selection */}
      <div className="grid gap-4 sm:grid-cols-2">
        {direction === "branch" ? (
          <>
            <div className="space-y-1.5">
              <Label>From Branch</Label>
              <select
                value={branchA}
                onChange={(e) => {
                  setBranchA(e.target.value);
                  resetLines();
                }}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="">Select source…</option>
                {retailBranches.map((b) => (
                  <option key={b._id as string} value={b._id as string}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>To Branch</Label>
              <select
                value={branchB}
                onChange={(e) => setBranchB(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="">Select destination…</option>
                {retailBranches
                  .filter((b) => (b._id as string) !== branchA)
                  .map((b) => (
                    <option key={b._id as string} value={b._id as string}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </div>
          </>
        ) : (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{direction === "out" ? "Destination Branch" : "Source Branch"}</Label>
            <select
              value={branchA}
              onChange={(e) => {
                setBranchA(e.target.value);
                resetLines();
              }}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            >
              <option value="">Select a branch…</option>
              {retailBranches.map((b) => (
                <option key={b._id as string} value={b._id as string}>
                  {b.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {direction === "out"
                ? `Stock leaves ${warehouse?.name ?? "the warehouse"}.`
                : `Stock leaves the selected branch and comes into ${warehouse?.name ?? "the warehouse"}.`}
            </p>
          </div>
        )}
      </div>

      {/* Item builder — needs a source branch resolved */}
      <div className="space-y-2">
        <Label>Items (each line dispatched from source)</Label>
        {fromBranchId ? (
          <ItemBuilder
            sourceBranchId={fromBranchId as Id<"branches">}
            lines={lines}
            setLines={setLines}
          />
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Select the source branch first to add items.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Input
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Reason / reference for this movement"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/warehouse/movements")}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={submitting}
          onClick={async () => {
            setError(null);
            if (!fromBranchId || !toBranchId)
              return setError("Select the branch(es) for this movement.");
            if (fromBranchId === toBranchId)
              return setError("Source and destination must differ.");
            if (lines.length === 0) return setError("Add at least one item.");

            setSubmitting(true);
            try {
              const transferId = await createMovement({
                fromBranchId: fromBranchId as Id<"branches">,
                toBranchId: toBranchId as Id<"branches">,
                notes: notes.trim() || undefined,
                items: lines.map((l) => ({
                  variantId: l.variantId,
                  quantity: l.quantity,
                })),
              });
              router.push(`/warehouse/movements/${transferId}`);
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Failed to create movement"
              );
              setSubmitting(false);
            }
          }}
        >
          {submitting ? "Dispatching…" : "Dispatch Movement"}
        </Button>
      </div>
    </div>
  );
}

// ─── Item builder ───────────────────────────────────────────────────────────────

function ItemBuilder({
  sourceBranchId,
  lines,
  setLines,
}: {
  sourceBranchId: Id<"branches">;
  lines: Line[];
  setLines: (next: Line[]) => void;
}) {
  const [search, setSearch] = useState("");
  const results = useQuery(
    api.warehouse.movements.searchVariants,
    search.trim().length >= 2
      ? { search, branchId: sourceBranchId }
      : "skip"
  );

  function addLine(r: {
    variantId: Id<"variants">;
    sku: string;
    styleName: string;
    size: string;
    color: string;
    available: number;
  }) {
    if (lines.some((l) => l.variantId === r.variantId)) {
      setSearch("");
      return;
    }
    setLines([...lines, { ...r, quantity: 1 }]);
    setSearch("");
  }

  function updateQty(variantId: Id<"variants">, qty: number) {
    setLines(
      lines.map((l) => (l.variantId === variantId ? { ...l, quantity: qty } : l))
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
          placeholder="Search SKU or barcode to add…"
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
                <span className="text-xs text-muted-foreground">
                  {r.available} in stock
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
              <TableHead className="text-foreground text-right">Available</TableHead>
              <TableHead className="text-foreground w-28 text-right">Qty</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No items yet. Search a SKU above to add.
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
                  <TableCell
                    className={cn(
                      "text-right",
                      l.quantity > l.available ? "text-red-600" : "text-muted-foreground"
                    )}
                  >
                    {l.available}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={1}
                      value={l.quantity}
                      onChange={(e) =>
                        updateQty(l.variantId, parseInt(e.target.value) || 1)
                      }
                      className="ml-auto w-20 text-right"
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

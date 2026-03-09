"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import {
  ShieldAlert,
  Undo2,
  Trash2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

const REASONS = [
  { value: "defective", label: "Defective" },
  { value: "damaged", label: "Damaged" },
  { value: "wrong_item", label: "Wrong Item" },
];

export default function BranchQuarantinePage() {
  // ─── Quarantine form state ──────────────────────────────────────────────
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState(REASONS[0].value);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ─── SKU lookup ─────────────────────────────────────────────────────────
  const skuLookup = useQuery(
    api.inventory.quarantine.lookupBySku,
    sku.trim().length > 0 ? { sku: sku.trim() } : "skip"
  );

  // ─── Current user (to get branchId) ─────────────────────────────────────
  const currentUser = useQuery(api.auth.users.getCurrentUser);

  // ─── Quarantined items table ────────────────────────────────────────────
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const data = useQuery(api.inventory.quarantine.getQuarantinedItems, {
    limit: 20,
    cursor,
  });

  // ─── Mutations ──────────────────────────────────────────────────────────
  const quarantineMut = useMutation(api.inventory.quarantine.quarantineItem);
  const releaseMut = useMutation(api.inventory.quarantine.releaseFromQuarantine);
  const [actionId, setActionId] = useState<string | null>(null);

  async function handleQuarantine(e: React.FormEvent) {
    e.preventDefault();
    if (!skuLookup || !currentUser?.branchId) return;
    setSubmitting(true);
    try {
      await quarantineMut({
        variantId: skuLookup.variantId,
        branchId: currentUser.branchId as Id<"branches">,
        quantity: qty,
        reason,
      });
      toast.success("Item quarantined successfully");
      setSku("");
      setQty(1);
      setReason(REASONS[0].value);
      setNotes("");
    } catch {
      toast.error("Failed to quarantine item");
    }
    setSubmitting(false);
  }

  async function handleRelease(
    variantId: Id<"variants">,
    branchId: Id<"branches">,
    quantity: number,
    key: string
  ) {
    setActionId(key + "release");
    try {
      await releaseMut({ variantId, branchId, quantity, action: "returnToStock" });
      toast.success("Returned to stock successfully");
    } catch {
      toast.error("Failed to return to stock");
    }
    setActionId(null);
  }

  async function handleWriteOff(
    variantId: Id<"variants">,
    branchId: Id<"branches">,
    quantity: number,
    key: string
  ) {
    setActionId(key + "writeoff");
    try {
      await releaseMut({ variantId, branchId, quantity, action: "writeOff" });
      toast.success("Written off successfully");
    } catch {
      toast.error("Failed to write off");
    }
    setActionId(null);
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-6 w-6 text-amber-500" />
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Branch Quarantine
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage defective or damaged items at your branch
          </p>
        </div>
      </div>

      {/* ─── Quick Quarantine Form ───────────────────────────────────────── */}
      <form
        onSubmit={handleQuarantine}
        className="rounded-lg border border-border bg-card p-5 space-y-4"
      >
        <h3 className="font-semibold text-foreground">Quick Quarantine</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* SKU */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              SKU
            </label>
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Enter SKU..."
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
            {sku.trim().length > 0 && skuLookup === null && (
              <p className="mt-1 text-xs text-red-400">
                No variant found for this SKU
              </p>
            )}
            {skuLookup && (
              <p className="mt-1 text-xs text-muted-foreground">
                {skuLookup.styleName} &mdash; {skuLookup.size} /{" "}
                {skuLookup.color}
              </p>
            )}
          </div>

          {/* Quantity */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Quantity
            </label>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(parseInt(e.target.value) || 1)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>

          {/* Reason */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Reason
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={1}
              placeholder="Additional details..."
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={submitting || !skuLookup || !currentUser?.branchId}
          className="gap-1.5 bg-amber-600 hover:bg-amber-700"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldAlert className="h-4 w-4" />
          )}
          Submit
        </Button>
      </form>

      {/* ─── Quarantined Items Table ─────────────────────────────────────── */}
      {data === undefined && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && data.items.length === 0 && (
        <div className="flex flex-col items-center py-20 text-center text-muted-foreground">
          <ShieldAlert className="h-12 w-12 mb-3 opacity-30" />
          <p className="font-medium">No quarantined items</p>
          <p className="text-sm">All stock at your branch is in good condition.</p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-foreground">
                    SKU
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-foreground">
                    Style
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-foreground">
                    Size/Color
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-foreground">
                    Quarantined Qty
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr
                    key={item._id}
                    className="border-b border-border hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-foreground">
                      {item.sku}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {item.styleName}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {item.size} / {item.color}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-500">
                        {item.quarantinedQuantity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          onClick={() =>
                            handleRelease(
                              item.variantId,
                              item.branchId,
                              item.quarantinedQuantity,
                              item._id
                            )
                          }
                          disabled={actionId === item._id + "release"}
                        >
                          {actionId === item._id + "release" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Undo2 className="h-3 w-3" />
                          )}
                          Return to Stock
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 text-xs text-red-400 hover:text-red-300"
                          onClick={() =>
                            handleWriteOff(
                              item.variantId,
                              item.branchId,
                              item.quarantinedQuantity,
                              item._id
                            )
                          }
                          disabled={actionId === item._id + "writeoff"}
                        >
                          {actionId === item._id + "writeoff" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                          Write Off
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.hasMore && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => {
                  const last = data.items[data.items.length - 1];
                  if (last) setCursor(last.updatedAt);
                }}
              >
                Load More
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { ShieldAlert, Undo2, Trash2, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

const QUARANTINE_REASONS = [
  { value: "Defective", label: "Defective" },
  { value: "Damaged", label: "Damaged" },
  { value: "Wrong Item", label: "Wrong Item" },
  { value: "Expired", label: "Expired" },
] as const;

export default function WarehouseQuarantinePage() {
  const currentUser = useQuery(api.auth.users.getCurrentUser);

  // ─── Quarantine Form State ──────────────────────────────────────────
  const [skuInput, setSkuInput] = useState("");
  const [lookupSku, setLookupSku] = useState("");
  const [formQuantity, setFormQuantity] = useState(1);
  const [formReason, setFormReason] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const skuLookup = useQuery(
    api.inventory.quarantine.lookupBySku,
    lookupSku ? { sku: lookupSku } : "skip"
  );

  const quarantineItemMut = useMutation(api.inventory.quarantine.quarantineItem);

  // ─── Quarantined Items Table State ──────────────────────────────────
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const data = useQuery(api.inventory.quarantine.getQuarantinedItems, {
    limit: 100,
    cursor,
  });
  const releaseMut = useMutation(api.inventory.quarantine.releaseFromQuarantine);
  const [actionId, setActionId] = useState<string | null>(null);

  // ─── Handlers ───────────────────────────────────────────────────────

  function handleSkuSearch() {
    const trimmed = skuInput.trim();
    if (trimmed) setLookupSku(trimmed);
  }

  async function handleQuarantineSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!skuLookup?.variantId || !formReason || !currentUser?.branchId) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSubmitting(true);
    try {
      await quarantineItemMut({
        variantId: skuLookup.variantId as Id<"variants">,
        branchId: currentUser.branchId as Id<"branches">,
        quantity: formQuantity,
        reason: formReason,
        notes: formNotes || undefined,
      });
      toast.success("Item quarantined successfully");
      setSkuInput("");
      setLookupSku("");
      setFormQuantity(1);
      setFormReason("");
      setFormNotes("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to quarantine item";
      toast.error(message);
    }
    setSubmitting(false);
  }

  async function handleRelease(variantId: Id<"variants">, branchId: Id<"branches">, qty: number) {
    const key = `${variantId}${branchId}release`;
    setActionId(key);
    try {
      await releaseMut({ variantId, branchId, quantity: qty, action: "returnToStock" });
      toast.success("Released back to available stock");
    } catch {
      toast.error("Failed to release");
    }
    setActionId(null);
  }

  async function handleWriteOff(variantId: Id<"variants">, branchId: Id<"branches">, qty: number) {
    const key = `${variantId}${branchId}writeoff`;
    setActionId(key);
    try {
      await releaseMut({ variantId, branchId, quantity: qty, action: "writeOff" });
      toast.success("Written off successfully");
    } catch {
      toast.error("Failed to write off");
    }
    setActionId(null);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-6 w-6 text-amber-500" />
        <div>
          <h1 className="text-xl font-bold">Quarantine Management</h1>
          <p className="text-sm text-muted-foreground">
            Defective or damaged items removed from sale
          </p>
        </div>
      </div>

      {/* ─── Quarantine Item Form ──────────────────────────────────────── */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Quarantine Item</h2>

        <form onSubmit={handleQuarantineSubmit} className="space-y-4">
          {/* SKU Lookup */}
          <div className="space-y-2">
            <Label htmlFor="sku">SKU</Label>
            <div className="flex gap-2">
              <Input
                id="sku"
                placeholder="Enter SKU to look up..."
                value={skuInput}
                onChange={(e) => setSkuInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSkuSearch();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleSkuSearch}
                disabled={!skuInput.trim()}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {lookupSku && skuLookup === null && (
              <p className="text-sm text-red-400">No variant found for SKU &quot;{lookupSku}&quot;</p>
            )}
            {skuLookup && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                <span className="font-medium">{skuLookup.styleName}</span>
                <span className="text-muted-foreground ml-2">
                  {skuLookup.size} / {skuLookup.color}
                </span>
              </div>
            )}
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              min={1}
              value={formQuantity}
              onChange={(e) => setFormQuantity(parseInt(e.target.value) || 1)}
              className="w-32"
            />
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Select value={formReason} onValueChange={setFormReason}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select reason..." />
              </SelectTrigger>
              <SelectContent>
                {QUARANTINE_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <textarea
              id="notes"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Additional details..."
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
            />
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={submitting || !skuLookup?.variantId || !formReason}
            className="gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            <ShieldAlert className="h-4 w-4" />
            Quarantine Item
          </Button>
        </form>
      </div>

      {/* ─── Quarantined Items Table ───────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Quarantined Items</h2>

        {data === undefined && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded-md bg-muted/50 animate-pulse" />
            ))}
          </div>
        )}

        {data && data.items.length === 0 && (
          <div className="flex flex-col items-center py-20 text-center text-muted-foreground">
            <ShieldAlert className="h-12 w-12 mb-3 opacity-30" />
            <p className="font-medium">No quarantined items</p>
            <p className="text-sm">All stock is in good condition.</p>
          </div>
        )}

        {data && data.items.length > 0 && (
          <>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">SKU</th>
                    <th className="px-4 py-3 text-left font-medium">Style</th>
                    <th className="px-4 py-3 text-left font-medium">Size/Color</th>
                    <th className="px-4 py-3 text-left font-medium">Branch</th>
                    <th className="px-4 py-3 text-center font-medium">Qty</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => {
                    const releaseKey = `${item.variantId}${item.branchId}release`;
                    const writeOffKey = `${item.variantId}${item.branchId}writeoff`;
                    return (
                      <tr key={item._id} className="border-b border-border hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs">{item.sku}</td>
                        <td className="px-4 py-3 font-medium">{item.styleName}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {item.size} / {item.color}
                        </td>
                        <td className="px-4 py-3">{item.branchName}</td>
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
                                  item.variantId as Id<"variants">,
                                  item.branchId as Id<"branches">,
                                  item.quarantinedQuantity
                                )
                              }
                              disabled={actionId === releaseKey}
                            >
                              {actionId === releaseKey ? (
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
                                  item.variantId as Id<"variants">,
                                  item.branchId as Id<"branches">,
                                  item.quarantinedQuantity
                                )
                              }
                              disabled={actionId === writeOffKey}
                            >
                              {actionId === writeOffKey ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                              Write Off
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
    </div>
  );
}

"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { ClipboardCheck, Loader2, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function CycleCountPage() {
  const activeCount = useQuery(api.inventory.cycleCounts.getActiveCycleCount);
  const startCount = useMutation(api.inventory.cycleCounts.startCycleCount);
  const updateQty = useMutation(api.inventory.cycleCounts.updateCountedQuantity);
  const completeCount = useMutation(api.inventory.cycleCounts.completeCycleCount);

  const [starting, setStarting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [notes, setNotes] = useState("");

  async function handleStart() {
    setStarting(true);
    try {
      const result = await startCount();
      toast.success(`Cycle count started with ${result.itemCount} items`);
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error.message ?? "Failed to start cycle count");
    }
    setStarting(false);
  }

  async function handleComplete() {
    if (!activeCount) return;
    setCompleting(true);
    try {
      const result = await completeCount({
        cycleCountId: activeCount._id,
        notes: notes.trim() || undefined,
      });
      toast.success(`Cycle count completed. ${result.adjustments} adjustments made.`);
      setNotes("");
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error.message ?? "Failed to complete cycle count");
    }
    setCompleting(false);
  }

  async function handleUpdateCount(variantId: string, value: string) {
    if (!activeCount) return;
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) return;
    try {
      await updateQty({
        cycleCountId: activeCount._id,
        variantId: variantId as any,
        countedQuantity: num,
      });
    } catch {
      toast.error("Failed to update count");
    }
  }

  if (activeCount === undefined) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Cycle Count</h1>
        </div>
        {!activeCount && (
          <button
            onClick={handleStart}
            disabled={starting}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {starting ? "Starting..." : "Start Cycle Count"}
          </button>
        )}
      </div>

      {!activeCount && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <ClipboardCheck className="mx-auto h-12 w-12 text-muted-foreground opacity-30 mb-3" />
          <p className="text-muted-foreground">No active cycle count</p>
          <p className="text-sm text-muted-foreground mt-1">
            Start a count to verify your branch inventory
          </p>
        </div>
      )}

      {activeCount && (
        <>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="border-b border-border bg-muted/30 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {activeCount.items.length} items to count
                </p>
                <p className="text-xs text-muted-foreground">
                  Started {new Date(activeCount.createdAt).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="divide-y divide-border">
              {/* Header */}
              <div className="grid grid-cols-[1fr_80px_80px_40px] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground">
                <span>Item</span>
                <span className="text-center">Expected</span>
                <span className="text-center">Counted</span>
                <span></span>
              </div>

              {activeCount.items.map((item) => {
                const hasMismatch =
                  item.countedQuantity != null &&
                  item.countedQuantity !== item.expectedQuantity;
                const isCounted = item.countedQuantity != null;

                return (
                  <div
                    key={item.variantId}
                    className={cn(
                      "grid grid-cols-[1fr_80px_80px_40px] gap-2 items-center px-4 py-3",
                      hasMismatch && "bg-amber-500/5"
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium">{item.sku}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.color} / {item.size}
                      </p>
                    </div>
                    <p className="text-center text-sm font-mono">
                      {item.expectedQuantity}
                    </p>
                    <input
                      type="number"
                      min={0}
                      defaultValue={item.countedQuantity ?? ""}
                      placeholder="—"
                      onBlur={(e) => handleUpdateCount(item.variantId, e.target.value)}
                      className={cn(
                        "w-full rounded border bg-background px-2 py-1 text-center text-sm font-mono outline-none focus:ring-2 focus:ring-primary",
                        hasMismatch ? "border-amber-500" : "border-border"
                      )}
                    />
                    <div className="flex justify-center">
                      {hasMismatch ? (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      ) : isCounted ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes + Complete */}
          <div className="space-y-3">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary resize-none"
            />
            <button
              onClick={handleComplete}
              disabled={completing}
              className="w-full rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {completing ? "Completing..." : "Complete Cycle Count"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

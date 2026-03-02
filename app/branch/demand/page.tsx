"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CheckCircle } from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "26", "28", "30", "32", "34", "36"];

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BranchDemandPage() {
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [design, setDesign] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, setIsPending] = useState(false);

  const brands = useQuery(api.demand.entries.listBrandsForSelector);
  const recentLogs = useQuery(api.demand.entries.listBranchDemandLogs, { limit: 20 });
  const createDemandLog = useMutation(api.demand.entries.createDemandLog);

  async function handleSubmit() {
    if (!selectedBrand || isPending) return;
    setIsPending(true);
    try {
      await createDemandLog({
        brand: selectedBrand,
        design: design.trim() || undefined,
        size: selectedSize ?? undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Demand logged");
      setSelectedBrand(null);
      setSelectedSize(null);
      setDesign("");
      setNotes("");
    } catch {
      toast.error("Failed to log demand");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Demand Log</h1>
        <p className="text-sm text-muted-foreground">
          Record customer requests for items not in stock.
        </p>
      </div>

      {/* Entry form */}
      <div className="rounded-lg border p-4 space-y-5">
        <h2 className="text-sm font-semibold">New Entry</h2>

        {/* Brand selector */}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Brand <span className="text-destructive">*</span>
          </p>
          {brands === undefined ? (
            <div className="flex flex-wrap gap-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-9 w-24 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : brands.length === 0 ? (
            <p className="text-sm text-muted-foreground">No brands configured — contact HQ to add brands.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {brands.map((brand) => (
                <button
                  key={brand.id}
                  onClick={() =>
                    setSelectedBrand(selectedBrand === brand.name ? null : brand.name)
                  }
                  className={`min-h-[44px] min-w-[44px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    selectedBrand === brand.name
                      ? "bg-primary text-primary-foreground"
                      : "border bg-background hover:bg-muted"
                  }`}
                >
                  {brand.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Size selector */}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Size{" "}
            <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {SIZES.map((size) => (
              <button
                key={size}
                onClick={() => setSelectedSize(selectedSize === size ? null : size)}
                className={`min-h-[44px] min-w-[44px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedSize === size
                    ? "bg-primary text-primary-foreground"
                    : "border bg-background hover:bg-muted"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        {/* Design / style */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Design / Style{" "}
            <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            type="text"
            value={design}
            onChange={(e) => setDesign(e.target.value.slice(0, 60))}
            placeholder="e.g. Air Max, Slim Fit…"
            maxLength={60}
            className="w-full rounded-md border px-3 py-1.5 text-sm"
          />
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Notes{" "}
            <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any extra details from the customer…"
            rows={2}
            className="w-full rounded-md border px-3 py-1.5 text-sm resize-none"
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!selectedBrand || isPending}
          className="min-h-[44px] flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <CheckCircle className="h-4 w-4" />
          {isPending ? "Logging…" : "Log Demand"}
        </button>
      </div>

      {/* Recent entries */}
      <div className="rounded-lg border p-4">
        <h2 className="mb-4 text-sm font-semibold">Recent Entries</h2>
        {recentLogs === undefined ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : recentLogs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No demand entries yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Brand</th>
                  <th className="pb-2 font-medium">Design</th>
                  <th className="pb-2 font-medium">Size</th>
                  <th className="pb-2 font-medium">By</th>
                  <th className="pb-2 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log) => (
                  <tr key={log._id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{log.brand}</td>
                    <td className="py-2 text-muted-foreground">{log.design ?? "—"}</td>
                    <td className="py-2">{log.size ?? "—"}</td>
                    <td className="py-2 text-muted-foreground">{log.loggedByName}</td>
                    <td className="py-2 text-right text-muted-foreground tabular-nums">
                      {relativeTime(log.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

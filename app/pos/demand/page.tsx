"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "26", "28", "30", "32", "34", "36"];

// ─── Component ────────────────────────────────────────────────────────────────

export default function PosDemandPage() {
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [design, setDesign] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, setIsPending] = useState(false);

  const brands = useQuery(api.demand.entries.listBrandsForSelector);
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
      // Reset for next entry
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
    <div className="p-4 space-y-5 max-w-lg mx-auto">
      {/* Back link */}
      <Link
        href="/pos"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] py-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to POS
      </Link>

      <div>
        <h1 className="text-xl font-bold">Log Customer Demand</h1>
        <p className="text-sm text-muted-foreground">
          Record what customers are asking for that we don&apos;t have.
        </p>
      </div>

      {/* Brand selector */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">
          Brand <span className="text-destructive">*</span>
        </p>
        {brands === undefined ? (
          <div className="flex flex-wrap gap-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-[44px] w-24 animate-pulse rounded-lg bg-muted" />
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
                className={`min-h-[44px] min-w-[44px] rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
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
        <p className="text-sm font-semibold">Size <span className="text-xs font-normal text-muted-foreground">(optional)</span></p>
        <div className="flex flex-wrap gap-2">
          {SIZES.map((size) => (
            <button
              key={size}
              onClick={() => setSelectedSize(selectedSize === size ? null : size)}
              className={`min-h-[44px] min-w-[44px] rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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

      {/* Design / style (optional) */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">
          Design / Style <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          type="text"
          value={design}
          onChange={(e) => setDesign(e.target.value.slice(0, 60))}
          placeholder="e.g. Air Max, Slim Fit…"
          maxLength={60}
          className="w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm"
        />
      </div>

      {/* Notes (optional) */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">
          Notes <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any extra details from the customer…"
          rows={2}
          className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!selectedBrand || isPending}
        className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? (
          "Logging…"
        ) : (
          <>
            <CheckCircle className="h-4 w-4" />
            Log Demand
          </>
        )}
      </button>
    </div>
  );
}

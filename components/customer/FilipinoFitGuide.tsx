"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Ruler } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Static size comparison data ──────────────────────────────────────────────

const FIT_DATA = {
  tops: {
    label: "Tops & Shirts",
    sizes: [
      { local: "XS", us: "XXS", eu: "32", chest: '30-32"', ph: "Petite / Slim" },
      { local: "S", us: "XS", eu: "34", chest: '33-35"', ph: "Small Frame" },
      { local: "M", us: "S", eu: "36-38", chest: '36-38"', ph: "Average Build" },
      { local: "L", us: "M", eu: "40-42", chest: '39-41"', ph: "Athletic / Husky" },
      { local: "XL", us: "L", eu: "44", chest: '42-44"', ph: "Large Frame" },
      { local: "2XL", us: "XL", eu: "46-48", chest: '45-47"', ph: "Plus Size" },
    ],
  },
  bottoms: {
    label: "Pants & Shorts",
    sizes: [
      { local: "28", us: "28", eu: "44", waist: '28-29"', ph: "Slim" },
      { local: "30", us: "30", eu: "46", waist: '30-31"', ph: "Regular" },
      { local: "32", us: "32", eu: "48", waist: '32-33"', ph: "Average" },
      { local: "34", us: "34", eu: "50", waist: '34-35"', ph: "Husky" },
      { local: "36", us: "36", eu: "52", waist: '36-37"', ph: "Large" },
    ],
  },
} as const;

type TabKey = "tops" | "bottoms";

// Categories considered "bottoms" — everything else defaults to tops
const BOTTOMS_CATEGORIES = ["pants", "jeans", "shorts", "trousers", "joggers", "chinos"];

function isBottomsCategory(categoryName: string): boolean {
  return BOTTOMS_CATEGORIES.some((b) =>
    categoryName.toLowerCase().includes(b),
  );
}

// ── Component ────────────────────────────────────────────────────────────────

interface FilipinoFitGuideProps {
  category?: string;
}

export function FilipinoFitGuide({ category }: FilipinoFitGuideProps) {
  const [open, setOpen] = useState(false);

  // Default the active tab based on the category prop
  const defaultTab: TabKey = category && isBottomsCategory(category) ? "bottoms" : "tops";
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);

  const current = FIT_DATA[activeTab];
  const isTops = activeTab === "tops";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-sm text-[#E8192C] hover:text-[#E8192C]/80 transition-colors font-medium"
        >
          <Ruler className="h-4 w-4" />
          Size Guide
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-lg border-border bg-card text-foreground sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Ruler className="h-5 w-5 text-[#E8192C]" />
            Filipino Fit Guide
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-zinc-900/60 p-1">
          {(["tops", "bottoms"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                activeTab === tab
                  ? "bg-[#E8192C] text-white"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              {tab === "tops" ? "Tops" : "Pants"}
            </button>
          ))}
        </div>

        {/* Category label */}
        <p className="text-xs text-zinc-400 mt-1">{current.label}</p>

        {/* Comparison table */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-zinc-900/60 text-left text-xs uppercase tracking-wider text-zinc-400">
                <th className="px-3 py-2.5 font-semibold text-[#E8192C]">
                  RedBox Size
                </th>
                <th className="px-3 py-2.5 font-semibold">US Equiv.</th>
                <th className="px-3 py-2.5 font-semibold">EU Size</th>
                <th className="px-3 py-2.5 font-semibold">
                  {isTops ? "Chest" : "Waist"}
                </th>
                <th className="px-3 py-2.5 font-semibold">Filipino Fit</th>
              </tr>
            </thead>
            <tbody>
              {current.sizes.map((row, i) => (
                <tr
                  key={row.local}
                  className={cn(
                    "border-b border-border/50 last:border-0",
                    i % 2 === 0 ? "bg-zinc-900/30" : "bg-zinc-900/10",
                  )}
                >
                  <td className="px-3 py-2 font-semibold text-white">
                    {row.local}
                  </td>
                  <td className="px-3 py-2 text-zinc-300">{row.us}</td>
                  <td className="px-3 py-2 text-zinc-300">{row.eu}</td>
                  <td className="px-3 py-2 text-zinc-300">
                    {isTops
                      ? (row as (typeof FIT_DATA.tops.sizes)[number]).chest
                      : (row as (typeof FIT_DATA.bottoms.sizes)[number]).waist}
                  </td>
                  <td className="px-3 py-2 text-zinc-300 italic text-xs">
                    {row.ph}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pro Tip */}
        <div className="rounded-md border border-[#E8192C]/20 bg-[#E8192C]/5 px-3 py-2.5 text-xs text-zinc-300 leading-relaxed">
          <span className="font-semibold text-[#E8192C]">Pro Tip:</span>{" "}
          Most Filipinos find our M fits like a US S. When in doubt, size up!
        </div>
      </DialogContent>
    </Dialog>
  );
}

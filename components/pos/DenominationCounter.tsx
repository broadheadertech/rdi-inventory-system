"use client";

// Counts a drawer bill by bill and coin by coin: the cashier enters how many of
// each they hold and the counter adds them up into the amount declared. It is
// still a blind count — nothing here knows what the drawer should hold.

import { formatCurrency } from "@/lib/formatters";

type Denomination = { key: string; label: string; centavos: number };

const BILLS: Denomination[] = [
  { key: "b1000", label: "₱1,000", centavos: 100_000 },
  { key: "b500", label: "₱500", centavos: 50_000 },
  { key: "b200", label: "₱200", centavos: 20_000 },
  { key: "b100", label: "₱100", centavos: 10_000 },
  { key: "b50", label: "₱50", centavos: 5_000 },
  { key: "b20", label: "₱20", centavos: 2_000 },
];

const COINS: Denomination[] = [
  { key: "c20", label: "₱20", centavos: 2_000 },
  { key: "c10", label: "₱10", centavos: 1_000 },
  { key: "c5", label: "₱5", centavos: 500 },
  { key: "c1", label: "₱1", centavos: 100 },
  { key: "c025", label: "25¢", centavos: 25 },
  { key: "c005", label: "5¢", centavos: 5 },
];

/** Pieces counted per denomination, as typed. */
export type DenominationCounts = Record<string, string>;

/** The counted total, in centavos. A blank line counts as none. */
export function countedCentavos(counts: DenominationCounts): number {
  let total = 0;
  for (const d of [...BILLS, ...COINS]) {
    const pieces = Number(counts[d.key] || 0);
    if (Number.isInteger(pieces) && pieces > 0) total += pieces * d.centavos;
  }
  return total;
}

/** A zero count is a real answer — the drawer is empty — but it must be a deliberate one. */
export function confirmEmptyDrawer(): boolean {
  return window.confirm("Declare ₱0.00?\n\nOnly if the drawer is completely empty.");
}

export function DenominationCounter({
  counts,
  onChange,
  disabled = false,
}: {
  counts: DenominationCounts;
  onChange: (counts: DenominationCounts) => void;
  disabled?: boolean;
}) {
  function setPieces(key: string, value: string) {
    // Whole pieces only.
    onChange({ ...counts, [key]: value.replace(/\D/g, "").slice(0, 5) });
  }

  function column(title: string, items: Denomination[]) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        {items.map((d) => (
          <label key={d.key} className="flex items-center gap-2 text-sm">
            <span className="w-12 shrink-0 text-right font-medium tabular-nums">{d.label}</span>
            <span className="text-muted-foreground">×</span>
            <input
              type="text"
              inputMode="numeric"
              value={counts[d.key] ?? ""}
              onChange={(e) => setPieces(d.key, e.target.value)}
              placeholder="0"
              disabled={disabled}
              className="w-full min-w-0 rounded-md border px-2 py-1.5 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        {column("Bills", BILLS)}
        {column("Coins", COINS)}
      </div>
      <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Total counted
        </span>
        <span className="text-lg font-bold tabular-nums">
          {formatCurrency(countedCentavos(counts))}
        </span>
      </div>
    </div>
  );
}

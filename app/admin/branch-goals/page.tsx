"use client";

// app/admin/branch-goals/page.tsx — every store's goals for a year, on one grid.
//
// Rows are stores (head offices and the warehouse sell nothing, so they are
// left out), grouped by the brands they carry. Columns are the standing goal,
// then January to December. A month shows the standing goal greyed until you
// type over it, which makes that month's own goal; empty it again to fall back.
//
// Edits are held on the page and saved together from the bar at the bottom,
// in one transaction (saveGoals) — filling a year is a few hundred cells, and
// a save per cell was the slow part.

import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn, getErrorMessage } from "@/lib/utils";
import { Target, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { YearTrajectory } from "@/components/shared/YearTrajectory";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PHT = 8 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STANDING = "std";

function currentYear(): number {
  return new Date(Date.now() + PHT).getUTCFullYear();
}

function fmtPeso(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

/** Pesos as typed → centavos; "" is 0 (clear), anything unreadable is null. */
function pesosToCentavos(input: string): number | null {
  const trimmed = input.trim().replace(/[,₱\s]/g, "");
  if (trimmed === "") return 0;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function centavosToInput(centavos: number): string {
  return centavos > 0 ? (centavos / 100).toLocaleString("en-PH", { maximumFractionDigits: 2 }) : "";
}

type Store = {
  branchId: Id<"branches">;
  code: string | null;
  name: string;
  brandLabel: string;
  standingCentavos: number;
  months: Record<string, number>;
};

const cellKey = (branchId: string, col: string) => `${branchId}|${col}`;

/** What a cell holds as saved, in centavos. */
const savedValue = (s: Store, col: string) =>
  col === STANDING ? s.standingCentavos : s.months[col] ?? 0;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BranchGoalsPage() {
  const [year, setYear] = useState(currentYear());
  const data = useQuery(api.dashboards.branchTargets.getGoalYear, { year });
  const saveGoals = useMutation(api.dashboards.branchTargets.saveGoals);

  // Raw text per edited cell, keyed "branchId|std" or "branchId|YYYYMM".
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const periods = useMemo(
    () => MONTHS.map((_, i) => `${year}${String(i + 1).padStart(2, "0")}`),
    [year]
  );

  const stores = useMemo(() => (data?.stores ?? []) as Store[], [data]);

  const changes = useMemo(() => {
    const out: { key: string; branchId: Id<"branches">; col: string; centavos: number | null }[] = [];
    for (const [key, raw] of Object.entries(edits)) {
      const [branchId, col] = key.split("|");
      const store = stores.find((s) => s.branchId === branchId);
      if (!store) continue;
      const centavos = pesosToCentavos(raw);
      if (centavos !== savedValue(store, col)) {
        out.push({ key, branchId: store.branchId, col, centavos });
      }
    }
    return out;
  }, [edits, stores]);
  const invalid = changes.filter((c) => c.centavos === null);

  // Leaving with unsaved goals asks first.
  useEffect(() => {
    if (changes.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changes.length]);

  /** A cell's centavos with edits applied, for totals. Unreadable counts as saved. */
  const current = (s: Store, col: string) => {
    const raw = edits[cellKey(s.branchId, col)];
    const parsed = raw === undefined ? null : pesosToCentavos(raw);
    return parsed ?? savedValue(s, col);
  };
  /** The goal that applies in a month: its own, else the standing goal. */
  const effective = (s: Store, ym: string) => current(s, ym) || current(s, STANDING);

  const groups = useMemo(() => {
    const byBrand = new Map<string, Store[]>();
    for (const s of stores) byBrand.set(s.brandLabel, [...(byBrand.get(s.brandLabel) ?? []), s]);
    return [...byBrand];
  }, [stores]);

  function changeYear(next: number) {
    if (changes.length > 0 && !window.confirm(`Discard ${changes.length} unsaved change(s)?`)) return;
    setEdits({});
    setYear(next);
  }

  async function save() {
    if (invalid.length > 0) {
      toast.error(`${invalid.length} cell(s) aren't a valid amount — they're outlined in red.`);
      return;
    }
    setSaving(true);
    try {
      await saveGoals({
        changes: changes.map((c) => ({
          branchId: c.branchId,
          ...(c.col === STANDING ? {} : { periodYm: c.col }),
          centavos: c.centavos ?? 0,
        })),
      });
      toast.success(`${changes.length} goal${changes.length === 1 ? "" : "s"} saved`);
      setEdits({});
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // Enter moves down the column, as in a spreadsheet.
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const next = document.querySelector<HTMLInputElement>(
      `[data-cell="${row + (e.shiftKey ? -1 : 1)}:${col}"]`
    );
    next?.focus();
    next?.select();
  }

  if (data === undefined) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  const yearTotal = stores.reduce(
    (sum, s) => sum + periods.reduce((m, ym) => m + effective(s, ym), 0),
    0
  );
  const withoutGoal = stores.filter((s) => periods.every((ym) => effective(s, ym) === 0)).length;

  const cellClass =
    "w-24 rounded border border-transparent bg-transparent px-1.5 py-1 text-right text-sm tabular-nums " +
    "hover:border-input focus:border-primary focus:bg-background focus:outline-none placeholder:text-muted-foreground/50";

  let rowIndex = 0;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Branch Goals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monthly sales goal per store. Reports measure each store against its own goal.
          </p>
        </div>
        <select
          value={year}
          onChange={(e) => changeYear(Number(e.target.value))}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {[currentYear() + 1, currentYear(), currentYear() - 1, currentYear() - 2].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Target className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          The <strong>standing goal</strong> applies to every month, and shows greyed in
          each one. Type in a month to give it its own goal (seasonality); empty it to fall
          back to the standing goal. Changes are saved together from the bar at the
          bottom. Press <strong>Enter</strong> to move down a column. Store managers can
          see their goal but cannot change it.
        </span>
      </p>

      <YearTrajectory year={year} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Stores</p>
          <p className="text-lg font-semibold">{stores.length}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">{year} goal, all stores</p>
          <p className="text-lg font-semibold">{fmtPeso(yearTotal)}</p>
        </div>
        <div
          className={cn(
            "rounded-lg border p-3",
            withoutGoal > 0 && "border-amber-500/40 bg-amber-500/5"
          )}
        >
          <p className="text-xs text-muted-foreground">Stores without a goal</p>
          <p className="text-lg font-semibold">{withoutGoal}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <th className="sticky left-0 z-10 bg-muted px-3 py-2.5 text-left">Store</th>
              <th className="px-1.5 py-2.5 text-right">Standing</th>
              {periods.map((ym, i) => (
                <th
                  key={ym}
                  className={cn(
                    "px-1.5 py-2.5 text-right",
                    ym === data.currentPeriodYm && "bg-primary/10 text-primary"
                  )}
                >
                  {MONTHS[i]}
                </th>
              ))}
              <th className="px-3 py-2.5 text-right">Year</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(([brand, list]) => (
              <Fragment key={brand}>
                <tr className="border-b bg-muted/30">
                  <td
                    colSpan={periods.length + 3}
                    className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {brand} · {list.length} store{list.length === 1 ? "" : "s"}
                  </td>
                </tr>
                {list.map((s) => {
                  const row = rowIndex++;
                  const standingKey = cellKey(s.branchId, STANDING);
                  const cols = [STANDING, ...periods];
                  return (
                    <tr key={s.branchId} className="border-b hover:bg-muted/20">
                      <td className="sticky left-0 z-10 bg-background px-3 py-1.5">
                        <div className="max-w-[14rem] truncate font-medium">{s.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{s.code ?? "—"}</div>
                      </td>
                      {cols.map((col, c) => {
                        const key = col === STANDING ? standingKey : cellKey(s.branchId, col);
                        const raw = edits[key];
                        const value = raw ?? centavosToInput(savedValue(s, col));
                        const change = changes.find((x) => x.key === key);
                        const standingNow = current(s, STANDING);
                        return (
                          <td
                            key={col}
                            className={cn(
                              "px-0.5 py-1",
                              col === data.currentPeriodYm && "bg-primary/5",
                              col === STANDING && "border-r"
                            )}
                          >
                            <input
                              data-cell={`${row}:${c}`}
                              value={value}
                              onChange={(e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }))}
                              onKeyDown={(e) => onKeyDown(e, row, c)}
                              onFocus={(e) => e.target.select()}
                              placeholder={
                                col === STANDING ? "none" : centavosToInput(standingNow) || "—"
                              }
                              inputMode="decimal"
                              aria-label={`${s.name} ${col === STANDING ? "standing goal" : col}`}
                              className={cn(
                                cellClass,
                                col === STANDING && "font-medium",
                                change && "border-amber-400 bg-amber-50",
                                change?.centavos === null && "border-red-500 bg-red-50"
                              )}
                            />
                          </td>
                        );
                      })}
                      <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                        {fmtPeso(periods.reduce((m, ym) => m + effective(s, ym), 0))}
                      </td>
                    </tr>
                  );
                })}
                <SubtotalRow
                  label={`${brand} total`}
                  months={periods.map((ym) => list.reduce((m, s) => m + effective(s, ym), 0))}
                  currentIndex={periods.indexOf(data.currentPeriodYm)}
                />
              </Fragment>
            ))}
            {groups.length > 1 && (
              <SubtotalRow
                label="All stores"
                strong
                months={periods.map((ym) => stores.reduce((m, s) => m + effective(s, ym), 0))}
                currentIndex={periods.indexOf(data.currentPeriodYm)}
              />
            )}
          </tbody>
        </table>
      </div>

      {changes.length > 0 && (
        <div className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-lg border bg-background px-4 py-2.5 shadow-lg">
          <span className="text-sm">
            <strong>{changes.length}</strong> unsaved change{changes.length === 1 ? "" : "s"}
            {invalid.length > 0 && (
              <span className="text-red-600"> · {invalid.length} invalid</span>
            )}
          </span>
          <Button variant="outline" size="sm" disabled={saving} onClick={() => setEdits({})}>
            Discard
          </Button>
          <Button size="sm" disabled={saving || invalid.length > 0} onClick={() => void save()}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save all
          </Button>
        </div>
      )}
    </div>
  );
}

function SubtotalRow({
  label,
  months,
  currentIndex,
  strong,
}: {
  label: string;
  months: number[];
  currentIndex: number;
  strong?: boolean;
}) {
  return (
    <tr className={cn("border-b bg-muted/20 text-xs tabular-nums", strong && "bg-muted/50 font-semibold")}>
      <td className="sticky left-0 z-10 bg-muted px-3 py-2 font-medium">{label}</td>
      <td className="border-r" />
      {months.map((m, i) => (
        <td
          key={i}
          className={cn("px-2 py-2 text-right", i === currentIndex && "bg-primary/5")}
        >
          {m > 0 ? fmtPeso(m) : "—"}
        </td>
      ))}
      <td className="px-3 py-2 text-right font-semibold">
        {fmtPeso(months.reduce((a, b) => a + b, 0))}
      </td>
    </tr>
  );
}

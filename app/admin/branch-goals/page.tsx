"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn, getErrorMessage } from "@/lib/utils";
import { Target, Loader2, Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PHT = 8 * 60 * 60 * 1000;

function currentPeriodYm(): string {
  const d = new Date(Date.now() + PHT);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The current month plus the surrounding year, newest first. */
function periodOptions(): { value: string; label: string }[] {
  const now = new Date(Date.now() + PHT);
  const out: { value: string; label: string }[] = [];
  for (let offset = 3; offset >= -8; offset--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const value = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({
      value,
      label: d.toLocaleDateString("en-PH", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    });
  }
  return out;
}

function fmtPeso(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

function pesosToCentavos(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "");
  if (trimmed === "") return 0;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function centavosToInput(centavos: number): string {
  return centavos > 0 ? String(centavos / 100) : "";
}

// ─── Row ──────────────────────────────────────────────────────────────────────

type Row = {
  branchId: Id<"branches">;
  branchName: string;
  channel: string | null;
  region: string | null;
  defaultTargetCentavos: number;
  overrideTargetCentavos: number | null;
  effectiveTargetCentavos: number;
};

function GoalRow({ row, periodYm }: { row: Row; periodYm: string }) {
  const setDefault = useMutation(api.dashboards.branchTargets.setBranchDefaultTarget);
  const setPeriod = useMutation(api.dashboards.branchTargets.setBranchPeriodTarget);

  const [defaultInput, setDefaultInput] = useState<string | null>(null);
  const [overrideInput, setOverrideInput] = useState<string | null>(null);
  const [saving, setSaving] = useState<"default" | "override" | null>(null);

  const defaultValue = defaultInput ?? centavosToInput(row.defaultTargetCentavos);
  const overrideValue =
    overrideInput ?? centavosToInput(row.overrideTargetCentavos ?? 0);

  const defaultDirty =
    defaultInput !== null && defaultInput !== centavosToInput(row.defaultTargetCentavos);
  const overrideDirty =
    overrideInput !== null &&
    overrideInput !== centavosToInput(row.overrideTargetCentavos ?? 0);

  async function saveDefault() {
    const centavos = pesosToCentavos(defaultValue);
    if (centavos === null) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving("default");
    try {
      await setDefault({ branchId: row.branchId, monthlyTargetCentavos: centavos });
      setDefaultInput(null);
      toast.success(`Standing goal saved for ${row.branchName}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  async function saveOverride() {
    const centavos = pesosToCentavos(overrideValue);
    if (centavos === null) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving("override");
    try {
      await setPeriod({
        branchId: row.branchId,
        periodYm,
        monthlyTargetCentavos: centavos,
      });
      setOverrideInput(null);
      toast.success(
        centavos > 0
          ? `Month goal saved for ${row.branchName}`
          : `Month override cleared for ${row.branchName}`
      );
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  const usingOverride = row.overrideTargetCentavos !== null;

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-3">
        <div className="font-medium">{row.branchName}</div>
        <div className="text-xs text-muted-foreground">
          {[row.channel, row.region].filter(Boolean).join(" · ") || "—"}
        </div>
      </td>

      {/* Standing goal */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">₱</span>
          <input
            value={defaultValue}
            onChange={(e) => setDefaultInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && defaultDirty) saveDefault();
            }}
            placeholder="none"
            inputMode="decimal"
            className="w-32 rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {defaultDirty && (
            <button
              onClick={saveDefault}
              disabled={saving !== null}
              className="rounded-md bg-primary p-1.5 text-primary-foreground disabled:opacity-50"
              aria-label="Save standing goal"
            >
              {saving === "default" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          {defaultDirty && (
            <button
              onClick={() => setDefaultInput(null)}
              className="rounded-md border p-1.5 hover:bg-muted"
              aria-label="Discard"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </td>

      {/* This month's override */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">₱</span>
          <input
            value={overrideValue}
            onChange={(e) => setOverrideInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && overrideDirty) saveOverride();
            }}
            placeholder="use standing"
            inputMode="decimal"
            className="w-32 rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {overrideDirty && (
            <button
              onClick={saveOverride}
              disabled={saving !== null}
              className="rounded-md bg-primary p-1.5 text-primary-foreground disabled:opacity-50"
              aria-label="Save month goal"
            >
              {saving === "override" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          {overrideDirty && (
            <button
              onClick={() => setOverrideInput(null)}
              className="rounded-md border p-1.5 hover:bg-muted"
              aria-label="Discard"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </td>

      {/* Effective */}
      <td className="px-4 py-3 text-right">
        {row.effectiveTargetCentavos > 0 ? (
          <div>
            <div className="font-medium">{fmtPeso(row.effectiveTargetCentavos)}</div>
            <div className="text-xs text-muted-foreground">
              {usingOverride ? "this month" : "standing"}
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No goal set</span>
        )}
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BranchGoalsPage() {
  const [periodYm, setPeriodYm] = useState(currentPeriodYm());
  const periods = useMemo(periodOptions, []);

  const data = useQuery(api.dashboards.branchTargets.getBranchTargets, { periodYm });

  if (data === undefined) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  const totalEffective = data.branches.reduce(
    (sum, b) => sum + b.effectiveTargetCentavos,
    0
  );
  const withoutGoal = data.branches.filter((b) => b.effectiveTargetCentavos === 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Branch Goals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monthly sales goal per store. Reports measure each store against its own goal.
          </p>
        </div>
        <select
          value={periodYm}
          onChange={(e) => setPeriodYm(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {periods.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Target className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          The <strong>standing goal</strong> applies to every month. A{" "}
          <strong>month goal</strong> overrides it for the selected month only — use it
          for seasonality. Clear a month goal by emptying the field and saving. Store
          managers can see their goal but cannot change it.
        </span>
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Stores</p>
          <p className="text-lg font-semibold">{data.branches.length}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Combined goal</p>
          <p className="text-lg font-semibold">{fmtPeso(totalEffective)}</p>
        </div>
        <div
          className={cn(
            "rounded-lg border p-3",
            withoutGoal > 0 && "border-amber-500/40 bg-amber-500/5"
          )}
        >
          <p className="text-xs text-muted-foreground">Without a goal</p>
          <p className="text-lg font-semibold">{withoutGoal}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                Store
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                Standing goal / month
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                This month only
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">
                Effective
              </th>
            </tr>
          </thead>
          <tbody>
            {data.branches.map((row) => (
              <GoalRow key={row.branchId} row={row as Row} periodYm={periodYm} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

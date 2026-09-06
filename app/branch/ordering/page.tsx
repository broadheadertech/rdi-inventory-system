"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn, getErrorMessage } from "@/lib/utils";
import {
  CalendarClock,
  Loader2,
  Send,
  RefreshCw,
  SkipForward,
  AlertTriangle,
  Clock,
  PackageCheck,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PHT = 8 * 60 * 60 * 1000;

function todayYmd(): string {
  const d = new Date(Date.now() + PHT);
  return (
    `${d.getUTCFullYear()}` +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0")
  );
}

function ymdToInput(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  });
}

const FLAG_LABELS: Record<string, { label: string; tone: string; hint: string }> = {
  noRecentSales: {
    label: "No sales in 30d",
    tone: "bg-red-100 text-red-700 border-red-200",
    hint: "Nothing sold here in the last 30 days — switched off by default.",
  },
  slowMoving: {
    label: "Slow moving",
    tone: "bg-amber-100 text-amber-700 border-amber-200",
    hint: "Last sale is older than this cycle's stale threshold.",
  },
  agedStock: {
    label: "Aged stock",
    tone: "bg-orange-100 text-orange-700 border-orange-200",
    hint: "Stock has been sitting at this store for 90+ days.",
  },
};

// ─── Cycle setup ──────────────────────────────────────────────────────────────

function CycleSetup({
  existing,
  onDone,
}: {
  existing: {
    name: string;
    frequency: string;
    anchorDate: string;
    leadTimeDays: number;
    staleAfterDays: number;
  } | null;
  onDone: () => void;
}) {
  const upsert = useMutation(api.inventory.orderingCycles.upsertCycle);

  const [name, setName] = useState(existing?.name ?? "Weekly Replenishment");
  const [frequency, setFrequency] = useState(existing?.frequency ?? "weekly");
  const [anchorDate, setAnchorDate] = useState(existing?.anchorDate ?? todayYmd());
  const [leadTimeDays, setLeadTimeDays] = useState(String(existing?.leadTimeDays ?? 3));
  const [staleAfterDays, setStaleAfterDays] = useState(String(existing?.staleAfterDays ?? 45));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await upsert({
        name,
        frequency: frequency as "weekly" | "biweekly" | "monthly",
        anchorDate,
        leadTimeDays: Number(leadTimeDays),
        staleAfterDays: Number(staleAfterDays),
        isActive: true,
      });
      toast.success("Ordering cycle saved");
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div>
        <h2 className="font-semibold">
          {existing ? "Edit ordering cycle" : "Set up an ordering cycle"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          How often this store orders, and how long stock takes to arrive. Together they
          decide how much cover each order is sized for.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Cycle name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Order every</label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="weekly">Week</option>
            <option value="biweekly">2 weeks</option>
            <option value="monthly">Month</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            First ordering day
          </label>
          <input
            type="date"
            value={ymdToInput(anchorDate)}
            onChange={(e) => setAnchorDate(e.target.value.replace(/-/g, ""))}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="text-xs text-muted-foreground">
            Every cycle counts forward from this date.
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Lead time (days)
          </label>
          <input
            value={leadTimeDays}
            onChange={(e) => setLeadTimeDays(e.target.value)}
            inputMode="numeric"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="text-xs text-muted-foreground">
            Warehouse dispatch to shelf. Added to the cover each order is sized for.
          </p>
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">
            Treat as stale after (days without a sale)
          </label>
          <input
            value={staleAfterDays}
            onChange={(e) => setStaleAfterDays(e.target.value)}
            inputMode="numeric"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary sm:w-48"
          />
          <p className="text-xs text-muted-foreground">
            Lines past this are flagged for assessment. Anything with no sale at all in 30
            days is switched off in the draft regardless.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save cycle
        </button>
        {existing && (
          <button
            onClick={onDone}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Draft line ───────────────────────────────────────────────────────────────

type Line = {
  _id: Id<"orderingCycleLines">;
  sku: string;
  label: string;
  suggestedQuantity: number;
  orderedQuantity: number;
  included: boolean;
  onHandQuantity: number;
  incomingQuantity: number;
  unitsSold30d: number;
  daysSinceLastSale: number | null;
  stockAgeDays: number | null;
  flags: string[];
};

function LineRow({ line, editable }: { line: Line; editable: boolean }) {
  const updateLine = useMutation(api.inventory.orderingCycles.updateLine);
  const [qty, setQty] = useState<string | null>(null);

  const value = qty ?? String(line.orderedQuantity);

  async function commitQty() {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) {
      toast.error("Quantity must be a whole number of 0 or more");
      setQty(null);
      return;
    }
    if (n === line.orderedQuantity) {
      setQty(null);
      return;
    }
    try {
      await updateLine({ lineId: line._id, orderedQuantity: n });
      setQty(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setQty(null);
    }
  }

  async function toggle() {
    try {
      await updateLine({ lineId: line._id, included: !line.included });
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <tr className={cn("border-b last:border-0", !line.included && "opacity-55")}>
      <td className="px-3 py-2.5">
        <input
          type="checkbox"
          checked={line.included}
          onChange={toggle}
          disabled={!editable}
          className="accent-primary"
          aria-label={`Include ${line.sku}`}
        />
      </td>
      <td className="px-3 py-2.5">
        <div className="font-medium">{line.label}</div>
        <div className="font-mono text-xs text-muted-foreground">{line.sku}</div>
        {line.flags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {line.flags.map((f) => {
              const meta = FLAG_LABELS[f];
              if (!meta) return null;
              return (
                <span
                  key={f}
                  title={meta.hint}
                  className={cn("rounded border px-1.5 py-0.5 text-[10px] font-medium", meta.tone)}
                >
                  {meta.label}
                </span>
              );
            })}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{line.onHandQuantity}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
        {line.incomingQuantity > 0 ? line.incomingQuantity : "—"}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{line.unitsSold30d}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
        {line.daysSinceLastSale === null ? "never" : `${line.daysSinceLastSale}d`}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
        {line.stockAgeDays === null ? "—" : `${line.stockAgeDays}d`}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
        {line.suggestedQuantity}
      </td>
      <td className="px-3 py-2.5 text-right">
        <input
          value={value}
          onChange={(e) => setQty(e.target.value)}
          onBlur={commitQty}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          disabled={!editable}
          inputMode="numeric"
          className="w-16 rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
        />
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BranchOrderingPage() {
  const data = useQuery(api.inventory.orderingCycles.getMyCycle);
  const history = useQuery(api.inventory.orderingCycles.listRuns, { limit: 8 });

  const prepareOrder = useMutation(api.inventory.orderingCycles.prepareOrder);
  const submitOrder = useMutation(api.inventory.orderingCycles.submitOrder);
  const skipCycle = useMutation(api.inventory.orderingCycles.skipCycle);
  const setRunNotes = useMutation(api.inventory.orderingCycles.setRunNotes);

  const [editingCycle, setEditingCycle] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

  if (data === undefined) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (data === null) {
    return (
      <p className="text-sm text-muted-foreground">
        No branch in scope. Admins should use &ldquo;View as Branch&rdquo; first.
      </p>
    );
  }

  const { cycle, occurrence, run, lines } = data;

  if (!cycle || editingCycle) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ordering Cycle</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A recurring window for this store to place its replenishment order.
          </p>
        </div>
        <CycleSetup existing={cycle} onDone={() => setEditingCycle(false)} />
      </div>
    );
  }

  const editable = run?.status === "draft";
  const included = lines.filter((l) => l.included);
  const includedUnits = included.reduce((sum, l) => sum + l.orderedQuantity, 0);
  const flaggedCount = lines.filter((l) => l.flags.length > 0).length;

  async function handle(action: string, fn: () => Promise<unknown>) {
    setBusy(action);
    try {
      await fn();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ordering Cycle</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {cycle.name} · every{" "}
            {cycle.frequency === "weekly"
              ? "week"
              : cycle.frequency === "biweekly"
                ? "2 weeks"
                : "month"}{" "}
            · {cycle.leadTimeDays}d lead time
          </p>
        </div>
        <button
          onClick={() => setEditingCycle(true)}
          className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          <Settings2 className="h-4 w-4" />
          Cycle settings
        </button>
      </div>

      {/* Cycle status */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" /> This cycle
          </p>
          <p className="mt-1 font-semibold">{occurrence && fmtDate(occurrence.dueAt)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Next cycle
          </p>
          <p className="mt-1 font-semibold">
            {occurrence && fmtDate(occurrence.nextDueAt)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              (in {occurrence?.daysUntilNext}d)
            </span>
          </p>
        </div>
        <div
          className={cn(
            "rounded-lg border p-3",
            run?.status === "submitted" && "border-green-500/40 bg-green-500/5",
            run?.status === "skipped" && "border-muted bg-muted/30",
            !run && occurrence?.isOverdue && "border-amber-500/40 bg-amber-500/5"
          )}
        >
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="mt-1 font-semibold capitalize">
            {run?.status ?? (occurrence?.isOverdue ? "Order due" : "Not started")}
          </p>
        </div>
      </div>

      {/* Submitted / skipped states */}
      {run?.status === "submitted" && (
        <div className="flex items-start gap-2 rounded-lg border border-green-500/40 bg-green-500/5 p-4 text-sm">
          <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          <div>
            <p className="font-medium">This cycle&apos;s order has been submitted.</p>
            <p className="mt-0.5 text-muted-foreground">
              It is now a stock request awaiting warehouse approval.{" "}
              <Link href="/branch/transfers" className="text-primary hover:underline">
                Track it in Transfers
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      {run?.status === "skipped" && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <p className="font-medium">This cycle was skipped.</p>
          <p className="mt-0.5 text-muted-foreground">{run.skippedReason}</p>
        </div>
      )}

      {/* No draft yet */}
      {!run && (
        <div className="rounded-lg border p-8 text-center">
          <CalendarClock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No order prepared for this cycle yet. Preparing builds a draft from what this
            store actually sold — it does not order anything.
          </p>
          <button
            onClick={() => handle("prepare", () => prepareOrder({}))}
            disabled={busy !== null}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy === "prepare" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Prepare order
          </button>
        </div>
      )}

      {/* Draft */}
      {run && lines.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="text-sm">
              <span className="font-semibold">{included.length}</span> of {lines.length}{" "}
              lines · <span className="font-semibold">{includedUnits}</span> units · sized
              for {run.coverDays} days cover
              {flaggedCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {flaggedCount} need a look
                </span>
              )}
            </div>
            {editable && (
              <div className="flex gap-2">
                <button
                  onClick={() => handle("prepare", () => prepareOrder({}))}
                  disabled={busy !== null}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  {busy === "prepare" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Rebuild
                </button>
                <button
                  onClick={() => {
                    const reason = window.prompt("Why is this cycle being skipped?");
                    if (!reason?.trim()) return;
                    handle("skip", () => skipCycle({ runId: run._id, reason }));
                  }}
                  disabled={busy !== null}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  Skip cycle
                </button>
                <button
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Submit ${included.length} lines (${includedUnits} units) as a stock request? This holds the stock at the warehouse and enters the approval queue.`
                      )
                    )
                      return;
                    handle("submit", async () => {
                      const r = await submitOrder({ runId: run._id });
                      toast.success(`Order submitted — ${r.unitCount} units requested`);
                    });
                  }}
                  disabled={busy !== null || included.length === 0}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {busy === "submit" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Submit order
                </button>
              </div>
            )}
          </div>

          {editable && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Note for the warehouse (optional)
              </label>
              <input
                value={notes ?? run.notes ?? ""}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => {
                  if (notes !== null && notes !== (run.notes ?? "")) {
                    setRunNotes({ runId: run._id, notes }).catch((err) =>
                      toast.error(getErrorMessage(err))
                    );
                  }
                }}
                placeholder="e.g. prioritise the school-opening lines"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 text-left font-medium">On</th>
                  <th className="px-3 py-2.5 text-left font-medium">Item</th>
                  <th className="px-3 py-2.5 text-right font-medium">On hand</th>
                  <th className="px-3 py-2.5 text-right font-medium">Incoming</th>
                  <th className="px-3 py-2.5 text-right font-medium">Sold 30d</th>
                  <th className="px-3 py-2.5 text-right font-medium">Last sale</th>
                  <th className="px-3 py-2.5 text-right font-medium">Stock age</th>
                  <th className="px-3 py-2.5 text-right font-medium">Suggested</th>
                  <th className="px-3 py-2.5 text-right font-medium">Order</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <LineRow key={l._id} line={l as Line} editable={editable} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {run && lines.length === 0 && (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          Nothing needs ordering this cycle — no shortfalls and nothing flagged for review.
        </div>
      )}

      {/* History */}
      {history && history.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Previous cycles</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Cycle</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Lines</th>
                  <th className="px-3 py-2 text-right font-medium">Units</th>
                  <th className="px-3 py-2 text-left font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r._id} className="border-b last:border-0">
                    <td className="px-3 py-2">{fmtDate(r.dueAt)}</td>
                    <td className="px-3 py-2 capitalize">{r.status}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.lineCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.unitCount}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.skippedReason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

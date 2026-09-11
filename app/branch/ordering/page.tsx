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
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import {
  AgingBadge,
  MovementBadge,
  SignOffBadge,
  VerdictBadge,
  VERDICT_META,
  VERDICT_ORDER,
  lineNeedsSignOff,
  type AgingTier,
  type Movement,
  type SignOffStatus,
  type Verdict,
} from "@/components/ordering/OrderingBasis";

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

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

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
            Treat as gone quiet after (days without a sale)
          </label>
          <input
            value={staleAfterDays}
            onChange={(e) => setStaleAfterDays(e.target.value)}
            inputMode="numeric"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary sm:w-48"
          />
          <p className="text-xs text-muted-foreground">
            Stock that hasn&apos;t sold in this many days is listed for assessment even when
            nothing needs ordering.
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
  movement: Movement | null;
  movementScore: number | null;
  agingTier: AgingTier | null;
  lowStockThreshold: number | null;
  projectedStock: number | null;
  triggered: boolean | null;
  verdict: Verdict | null;
  verdictReasons: string[];
  signOff: SignOffStatus | null;
  signOffNote: string | null;
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

  const needsSignOff = editable && lineNeedsSignOff(line);
  // Submitted, included, and never sent to HQ: it went on its verdict.
  const sentOnVerdict =
    !editable && line.included && line.orderedQuantity > 0 && line.signOff === null;

  return (
    <tr className={cn("border-b align-top last:border-0", !line.included && "opacity-60")}>
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
      <td className="min-w-[16rem] px-3 py-2.5">
        <div className="font-medium">{line.label}</div>
        <div className="font-mono text-xs text-muted-foreground">{line.sku}</div>
        {line.verdictReasons.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {line.verdictReasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-col items-start gap-1">
          <VerdictBadge verdict={line.verdict} />
          {needsSignOff && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-amber-700">
              <ShieldCheck className="h-3 w-3" /> HQ sign-off
            </span>
          )}
          {line.signOff && <SignOffBadge status={line.signOff} note={line.signOffNote} />}
          {sentOnVerdict && (
            <span className="whitespace-nowrap text-[11px] font-medium text-green-700">
              Sent approved
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <MovementBadge movement={line.movement} score={line.movementScore} />
      </td>
      <td className="px-3 py-2.5">
        <AgingBadge tier={line.agingTier} days={line.stockAgeDays} />
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{line.onHandQuantity}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
        {line.incomingQuantity > 0 ? line.incomingQuantity : "—"}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        {line.unitsSold30d}
        <div className="text-[10px] text-muted-foreground">
          {line.daysSinceLastSale === null ? "no sale" : `last ${line.daysSinceLastSale}d ago`}
        </div>
      </td>
      <td
        className={cn(
          "whitespace-nowrap px-3 py-2.5 text-right tabular-nums",
          line.triggered && "font-medium text-red-600"
        )}
      >
        {line.projectedStock ?? "—"}
        <span className="font-normal text-muted-foreground">
          {" "}/ {line.lowStockThreshold ?? "—"}
        </span>
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

type VerdictFilter = "all" | Verdict;

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
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>("all");

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

  const { cycle, occurrence, run } = data;

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

  const lines = data.lines as Line[];
  const editable = run?.status === "draft";
  const preparedBeforeVerdicts = lines.some((l) => l.verdict === null);

  const units = (ls: Line[]) => ls.reduce((sum, l) => sum + l.orderedQuantity, 0);
  const toOrder = lines.filter((l) => l.included && l.orderedQuantity > 0);
  const forSignOff = toOrder.filter(lineNeedsSignOff);
  const onVerdict = toOrder.filter((l) => !lineNeedsSignOff(l));

  const verdictCounts: Record<Verdict, number> = {
    order: lines.filter((l) => l.verdict === "order").length,
    review: lines.filter((l) => l.verdict === "review").length,
    dontOrder: lines.filter((l) => l.verdict === "dontOrder").length,
  };
  const visibleLines =
    verdictFilter === "all" ? lines : lines.filter((l) => l.verdict === verdictFilter);

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

  function confirmAndSubmit(runId: Id<"orderingCycleRuns">) {
    const parts: string[] = [];
    if (onVerdict.length > 0) {
      parts.push(
        `${plural(onVerdict.length, "line")} (${units(onVerdict)} units) go straight to the warehouse, approved on their Order verdict.`
      );
    }
    if (forSignOff.length > 0) {
      parts.push(
        `${plural(forSignOff.length, "line")} (${units(forSignOff)} units) wait for HQ sign-off.`
      );
    }
    if (!window.confirm(`${parts.join("\n")}\n\nSubmit this order?`)) return;

    handle("submit", async () => {
      const r = await submitOrder({ runId });
      const sent = r.approvedLineCount > 0 ? `${r.approvedUnitCount} units sent approved` : null;
      const held = r.signOffLineCount > 0 ? `${r.signOffUnitCount} units awaiting HQ` : null;
      toast.success(`Order submitted — ${[sent, held].filter(Boolean).join(", ")}`);
    });
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
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {run.transferId && (
                <li>Lines with an Order verdict went to the warehouse already approved.</li>
              )}
              {run.signOff.pending > 0 && (
                <li className="text-amber-700">
                  {plural(run.signOff.pending, "line")} waiting for HQ sign-off.
                </li>
              )}
              {run.signOff.approved > 0 && (
                <li>{plural(run.signOff.approved, "line")} approved by HQ and sent to the warehouse.</li>
              )}
              {run.signOff.rejected > 0 && (
                <li>{plural(run.signOff.rejected, "line")} rejected by HQ.</li>
              )}
              <li>
                <Link href="/branch/transfers" className="text-primary hover:underline">
                  Track it in Transfers
                </Link>
                .
              </li>
            </ul>
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
            store actually sold, with a verdict on every line — it does not order anything.
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

      {/* Drafts prepared before verdicts existed */}
      {run && preparedBeforeVerdicts && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            This draft was prepared before order verdicts existed.
            {editable && " Rebuild it to see each line's verdict and basis — it can't be submitted until then."}
          </p>
        </div>
      )}

      {/* Draft */}
      {run && lines.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="space-y-0.5 text-sm">
              <div>
                <span className="font-semibold">{toOrder.length}</span> of {lines.length} lines ·{" "}
                <span className="font-semibold">{units(toOrder)}</span> units · sized for{" "}
                {run.coverDays} days cover
              </div>
              {editable && toOrder.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  {plural(onVerdict.length, "line")} ({units(onVerdict)} units) approved on verdict ·{" "}
                  {forSignOff.length > 0 ? (
                    <span className="font-medium text-amber-700">
                      {plural(forSignOff.length, "line")} ({units(forSignOff)} units) need HQ sign-off
                    </span>
                  ) : (
                    "none need HQ sign-off"
                  )}
                </div>
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
                  onClick={() => confirmAndSubmit(run._id)}
                  disabled={busy !== null || toOrder.length === 0 || preparedBeforeVerdicts}
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

          {/* Verdict filter */}
          <div className="flex flex-wrap gap-1.5">
            {(["all", ...VERDICT_ORDER] as VerdictFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setVerdictFilter(f)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  verdictFilter === f
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
              >
                {f === "all" ? `All · ${lines.length}` : `${VERDICT_META[f].label} · ${verdictCounts[f]}`}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 text-left font-medium">On</th>
                  <th className="px-3 py-2.5 text-left font-medium">Item &amp; basis</th>
                  <th className="px-3 py-2.5 text-left font-medium">Verdict</th>
                  <th className="px-3 py-2.5 text-left font-medium">Movement</th>
                  <th className="px-3 py-2.5 text-left font-medium">Aging</th>
                  <th className="px-3 py-2.5 text-right font-medium">On hand</th>
                  <th className="px-3 py-2.5 text-right font-medium">Incoming</th>
                  <th className="px-3 py-2.5 text-right font-medium">Sold 30d</th>
                  <th
                    className="px-3 py-2.5 text-right font-medium"
                    title="Stock projected at the end of the cover window, against the item's low-stock threshold. Red when the trigger fired."
                  >
                    Projected / threshold
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium">Suggested</th>
                  <th className="px-3 py-2.5 text-right font-medium">Order</th>
                </tr>
              </thead>
              <tbody>
                {visibleLines.map((l) => (
                  <LineRow key={l._id} line={l} editable={editable} />
                ))}
                {visibleLines.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No lines with this verdict.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {run && lines.length === 0 && (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          Nothing needs ordering this cycle — no trigger fired and nothing needs assessing.
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
                  <th className="px-3 py-2 text-left font-medium">HQ sign-off</th>
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
                    <td className="px-3 py-2 text-xs">
                      {r.pendingSignOffCount > 0 ? (
                        <span className="text-amber-700">{r.pendingSignOffCount} awaiting</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
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

"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn, getErrorMessage } from "@/lib/utils";
import { AgingBadge, MovementBadge, VerdictBadge } from "@/components/ordering/OrderingBasis";

type PendingRun = FunctionReturnType<
  typeof api.inventory.orderingCycles.listPendingSignOffs
>[number];
type PendingLine = PendingRun["lines"][number];

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  });
}

function fmtDateTime(ms: number): string {
  return new Date(ms).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  });
}

// ─── One store's order awaiting sign-off ─────────────────────────────────────

function RunCard({ run }: { run: PendingRun }) {
  const signOffLines = useMutation(api.inventory.orderingCycles.signOffLines);

  // Nothing is approved until HQ ticks it: every line here is one the verdict
  // alone would not have ordered.
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const quantityFor = (line: PendingLine) => quantities[line._id] ?? String(line.orderedQuantity);
  const approvedLines = run.lines.filter((l) => approved[l._id]);
  const approvedUnits = approvedLines.reduce((sum, l) => sum + (Number(quantityFor(l)) || 0), 0);
  const rejectedCount = run.lines.length - approvedLines.length;

  async function signOff() {
    const bad = approvedLines.find((l) => {
      const n = Number(quantityFor(l));
      return !Number.isInteger(n) || n <= 0;
    });
    if (bad) {
      toast.error(`The approved quantity for ${bad.sku} must be a whole number above 0`);
      return;
    }
    if (
      !window.confirm(
        `Approve ${approvedLines.length} line(s) (${approvedUnits} units) and reject ${rejectedCount}?\n\n` +
          `Approved lines go to the warehouse as an approved stock request for ${run.branchName}.`
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const r = await signOffLines({
        runId: run.runId,
        decisions: run.lines.map((l) =>
          approved[l._id]
            ? { lineId: l._id, approve: true, quantity: Number(quantityFor(l)) }
            : { lineId: l._id, approve: false }
        ),
        note: note.trim() || undefined,
      });
      toast.success(`${run.branchName}: ${r.approvedCount} approved, ${r.rejectedCount} rejected`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{run.branchName}</h2>
          <p className="text-xs text-muted-foreground">
            Cycle {fmtDate(run.dueAt)} · {run.coverDays} days cover · submitted by{" "}
            {run.submittedByName}
            {run.submittedAt ? ` on ${fmtDateTime(run.submittedAt)}` : ""}
          </p>
          {run.approvedOnVerdictTransferId && (
            <p className="text-xs text-muted-foreground">
              The rest of this order already went to the warehouse, approved on its Order
              verdicts.
            </p>
          )}
          {run.notes && <p className="mt-1 text-xs">Store note: {run.notes}</p>}
        </div>
        <button
          onClick={() => setApproved(Object.fromEntries(run.lines.map((l) => [l._id, true])))}
          className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          Tick all
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
              <th className="px-3 py-2.5 text-left font-medium">Approve</th>
              <th className="px-3 py-2.5 text-left font-medium">Item &amp; basis</th>
              <th className="px-3 py-2.5 text-left font-medium">Verdict</th>
              <th className="px-3 py-2.5 text-left font-medium">Movement</th>
              <th className="px-3 py-2.5 text-left font-medium">Aging</th>
              <th className="px-3 py-2.5 text-right font-medium">On hand</th>
              <th className="px-3 py-2.5 text-right font-medium">Sold 30d</th>
              <th
                className="px-3 py-2.5 text-right font-medium"
                title="Stock projected at the end of the cover window, against the item's low-stock threshold. Red when the trigger fired."
              >
                Projected / threshold
              </th>
              <th className="px-3 py-2.5 text-right font-medium">Suggested</th>
              <th className="px-3 py-2.5 text-right font-medium">Requested</th>
              <th className="px-3 py-2.5 text-right font-medium">Approve qty</th>
            </tr>
          </thead>
          <tbody>
            {run.lines.map((l) => {
              const isApproved = Boolean(approved[l._id]);
              return (
                <tr
                  key={l._id}
                  className={cn("border-b align-top last:border-0", !isApproved && "opacity-70")}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={isApproved}
                      onChange={(e) =>
                        setApproved((prev) => ({ ...prev, [l._id]: e.target.checked }))
                      }
                      className="accent-primary"
                      aria-label={`Approve ${l.sku}`}
                    />
                  </td>
                  <td className="min-w-[16rem] px-3 py-2.5">
                    <div className="font-medium">{l.label}</div>
                    <div className="font-mono text-xs text-muted-foreground">{l.sku}</div>
                    {l.verdictReasons.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {l.verdictReasons.map((reason, i) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <VerdictBadge verdict={l.verdict} />
                  </td>
                  <td className="px-3 py-2.5">
                    <MovementBadge movement={l.movement} score={l.movementScore} />
                  </td>
                  <td className="px-3 py-2.5">
                    <AgingBadge tier={l.agingTier} days={l.stockAgeDays} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {l.onHandQuantity}
                    {l.incomingQuantity > 0 && (
                      <div className="text-[10px] text-muted-foreground">
                        +{l.incomingQuantity} incoming
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{l.unitsSold30d}</td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-3 py-2.5 text-right tabular-nums",
                      l.triggered && "font-medium text-red-600"
                    )}
                  >
                    {l.projectedStock ?? "—"}
                    <span className="font-normal text-muted-foreground">
                      {" "}/ {l.lowStockThreshold ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {l.suggestedQuantity}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right tabular-nums",
                      l.orderedQuantity > l.suggestedQuantity && "font-semibold text-amber-700"
                    )}
                    title={
                      l.orderedQuantity > l.suggestedQuantity
                        ? "The store asked for more than suggested"
                        : undefined
                    }
                  >
                    {l.orderedQuantity}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <input
                      value={quantityFor(l)}
                      onChange={(e) =>
                        setQuantities((prev) => ({ ...prev, [l._id]: e.target.value }))
                      }
                      disabled={!isApproved}
                      inputMode="numeric"
                      className="w-16 rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 space-y-1">
          <span className="block text-xs text-muted-foreground">Note to the store (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. hold the aged sizes until the markdown"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
        <button
          onClick={signOff}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Approve {approvedLines.length} · Reject {rejectedCount}
        </button>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrderingSignOffPage() {
  const runs = useQuery(api.inventory.orderingCycles.listPendingSignOffs);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Ordering Sign-off</h1>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Lines from store ordering cycles that their verdict doesn&apos;t approve on its own: a
          Review or Don&apos;t-order line the manager chose to include, or more than the
          suggested quantity. Approved lines go to the warehouse as an approved stock request;
          rejected lines are not ordered.
        </p>
      </div>

      {runs === undefined ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
          Nothing is waiting for sign-off.
        </div>
      ) : (
        runs.map((run) => <RunCard key={run.runId} run={run} />)
      )}
    </div>
  );
}

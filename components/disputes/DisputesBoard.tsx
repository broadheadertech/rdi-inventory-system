"use client";

// The Disputes tab — every difference someone has to settle, for one branch or
// (admin) all of them. Short turnovers are decided here too: approve the count
// or send it back to recount, then settle what's left with a cause and a note.

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { cn, getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Banknote, Loader2, Package, Scale, Users } from "lucide-react";

type Cause = "countingError" | "found" | "chargedToStaff" | "writtenOff" | "other";

const CAUSES: { value: Cause; label: string; hint: string }[] = [
  {
    value: "countingError",
    label: "Counting error",
    hint: "The count or the declaration was wrong; nothing is actually missing.",
  },
  { value: "found", label: "Found", hint: "The missing cash or stock turned up." },
  {
    value: "chargedToStaff",
    label: "Charged to staff",
    hint: "The person responsible makes up the difference.",
  },
  {
    value: "writtenOff",
    label: "Written off",
    hint: "The difference is accepted as a loss, or kept as a gain.",
  },
  { value: "other", label: "Other", hint: "Explain in the note." },
];

const CAUSE_LABEL = Object.fromEntries(CAUSES.map((c) => [c.value, c.label])) as Record<
  Cause,
  string
>;

const KIND_META = {
  cashCount: { label: "Cash count", icon: Banknote },
  turnoverShort: { label: "Short turnover", icon: Users },
  transferReceiving: { label: "Transfer receiving", icon: Package },
} as const;

function peso(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function when(ms: number): string {
  return new Date(ms).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  });
}

export function DisputesBoard({ scope }: { scope: "branch" | "admin" }) {
  const [status, setStatus] = useState<"open" | "settled">("open");
  const [branchFilter, setBranchFilter] = useState("");

  const branches = useQuery(api.auth.branches.listBranches, scope === "admin" ? {} : "skip");
  const data = useQuery(api.disputes.listDisputes, {
    status,
    ...(branchFilter ? { branchId: branchFilter as Id<"branches"> } : {}),
  });

  const settle = useMutation(api.disputes.settleDispute);
  const reopen = useMutation(api.disputes.reopenDispute);
  const decide = useMutation(api.pos.shifts.decideTurnoverApproval);

  const [settling, setSettling] = useState<{ id: Id<"disputes">; subject: string } | null>(null);
  const [cause, setCause] = useState<Cause>("countingError");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function openSettle(id: Id<"disputes">, subject: string) {
    setSettling({ id, subject });
    setCause("countingError");
    setNote("");
  }

  async function submitSettle() {
    if (!settling) return;
    if (!note.trim()) {
      toast.error("Add a note explaining how this was settled.");
      return;
    }
    setBusy(true);
    try {
      await settle({ disputeId: settling.id, cause, note: note.trim() });
      toast.success("Dispute settled");
      setSettling(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function onDecide(approvalId: Id<"cashTurnoverApprovals">, approve: boolean) {
    const reply = window.prompt(
      approve
        ? "Approve this count? A register waiting on it opens on the amount counted; the shortfall stays here to settle.\n\nNote (optional):"
        : "Send the cashier back to recount?\n\nTell them why:"
    );
    if (reply === null) return;
    decide({ approvalId, approve, note: reply.trim() || undefined })
      .then(() => toast.success(approve ? "Count approved" : "Sent back to recount"))
      .catch((err) => toast.error(getErrorMessage(err)));
  }

  function onReopen(disputeId: Id<"disputes">) {
    const reason = window.prompt("Reopen this dispute? Say why:");
    if (!reason?.trim()) return;
    reopen({ disputeId, note: reason.trim() })
      .then(() => toast.success("Dispute reopened"))
      .catch((err) => toast.error(getErrorMessage(err)));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Disputes</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {scope === "admin"
              ? "Every branch's differences to settle. Branch managers settle their own; you can settle or reopen any."
              : "Cash counts that didn't match the drawer, short turnovers, and transfers that arrived different from their packing. Settle each with a cause and a note."}
          </p>
        </div>
        {scope === "admin" && (
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">Branch</span>
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="w-48 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All branches</option>
              {(branches ?? []).map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex gap-1.5">
        {(["open", "settled"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
              status === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
          >
            {s}
            {status === s && data ? ` · ${data.disputes.length}` : ""}
          </button>
        ))}
      </div>

      {data === undefined ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : data.disputes.length === 0 ? (
        <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
          {status === "open" ? "Nothing to settle." : "No settled disputes yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {data.disputes.map((d) => {
            const Kind = KIND_META[d.kind];
            return (
              <div key={d._id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium">
                        <Kind.icon className="h-3 w-3" />
                        {Kind.label}
                      </span>
                      {scope === "admin" && (
                        <span className="font-medium text-foreground">{d.branchName}</span>
                      )}
                      <span className="text-muted-foreground">{when(d.raisedAt)}</span>
                    </div>
                    <p className="font-medium">{d.subject}</p>
                    <p className="text-sm text-muted-foreground">{d.detail}</p>
                    {d.differenceCentavos !== null && d.differenceCentavos !== 0 && (
                      <p
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          d.differenceCentavos < 0 ? "text-red-600" : "text-amber-600"
                        )}
                      >
                        {peso(Math.abs(d.differenceCentavos))}{" "}
                        {d.differenceCentavos < 0 ? "short" : "over"}
                      </p>
                    )}
                    {d.unitsDifference !== null && d.unitsDifference !== 0 && (
                      <p
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          d.unitsDifference < 0 ? "text-red-600" : "text-amber-600"
                        )}
                      >
                        {Math.abs(d.unitsDifference)} pcs {d.unitsDifference < 0 ? "short" : "extra"}
                      </p>
                    )}
                    {d.status === "settled" && (
                      <p className="text-sm">
                        <span className="font-medium">
                          {d.cause ? CAUSE_LABEL[d.cause] : "Closed automatically"}
                        </span>
                        {d.note && <> — {d.note}</>}
                        <span className="text-xs text-muted-foreground">
                          {d.settledByName && ` · ${d.settledByName}`}
                          {d.settledAt && ` · ${when(d.settledAt)}`}
                        </span>
                      </p>
                    )}
                    {d.status === "open" && d.approvalPending && (
                      <p className="text-xs font-medium text-amber-700">
                        Decide the count first — a register may be waiting on it. Settle the
                        shortfall after.
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {d.status === "open" && data.canSettle && d.approvalPending && d.approvalId && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => onDecide(d.approvalId!, true)}>
                          Approve count
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onDecide(d.approvalId!, false)}>
                          Recount
                        </Button>
                      </>
                    )}
                    {d.status === "open" && data.canSettle && !d.approvalPending && (
                      <Button size="sm" onClick={() => openSettle(d._id, d.subject)}>
                        Settle
                      </Button>
                    )}
                    {d.status === "settled" && data.canReopen && (
                      <Button size="sm" variant="outline" onClick={() => onReopen(d._id)}>
                        Reopen
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={settling !== null} onOpenChange={(open) => !open && setSettling(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Settle dispute</DialogTitle>
          </DialogHeader>
          {settling && <p className="text-sm text-muted-foreground">{settling.subject}</p>}
          <div className="space-y-2">
            {CAUSES.map((c) => (
              <label
                key={c.value}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 text-sm transition-colors",
                  cause === c.value ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                )}
              >
                <input
                  type="radio"
                  name="dispute-cause"
                  className="mt-0.5 accent-primary"
                  checked={cause === c.value}
                  onChange={() => setCause(c.value)}
                />
                <span>
                  <span className="font-medium">{c.label}</span>
                  <span className="block text-xs text-muted-foreground">{c.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What happened, and what was done about it"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettling(null)}>
              Cancel
            </Button>
            <Button onClick={submitSettle} disabled={busy || !note.trim()}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Settle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

// app/admin/price-approvals/page.tsx — seeing a price change before it happens.
//
// Prices used to change the moment somebody pressed save, with priceChanges
// recording it afterwards. A bulk edit or a spreadsheet with a stray column
// could reprice the chain before anyone saw what it did. Every change now waits
// here with its exact before-and-after.
//
// Approving is a review step, not a second signature: whoever submitted may
// approve. The risk this catches is a bad file, and that is caught by looking.

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { cn, getErrorMessage } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Check, Clock, FileSpreadsheet, PencilLine, X } from "lucide-react";

type Status = "pending" | "approved" | "rejected";

const FILTERS: { value: Status | "all"; label: string }[] = [
  { value: "pending", label: "Waiting" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

const STATUS_STYLE: Record<Status, string> = {
  pending: "border-amber-400 text-amber-700",
  approved: "border-emerald-500 text-emerald-700",
  rejected: "border-red-400 text-red-700",
};

function when(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-PH", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

// ─── One proposal ────────────────────────────────────────────────────────────

function ProposalDetail({
  proposalId,
  onBack,
}: {
  proposalId: Id<"priceProposals">;
  onBack: () => void;
}) {
  const proposal = useQuery(api.admin.prices.getPriceProposal, { proposalId });
  const approve = useMutation(api.admin.prices.approvePriceProposal);
  const reject = useMutation(api.admin.prices.rejectPriceProposal);

  const [reason, setReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Lines ticked for a part approval. Empty means "the whole proposal".
  const [picked, setPicked] = useState<Set<string>>(new Set());

  function togglePicked(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (proposal === undefined) {
    return <div className="h-64 animate-pulse rounded-lg border bg-muted/40" />;
  }

  const waiting = proposal.status === "pending";
  const pendingIds = proposal.cells
    .filter((c) => c.status === "pending")
    .map((c) => c._id as string);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{proposal.summary}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {proposal.source === "csv" ? "From a spreadsheet" : "From the Prices page"}
            {proposal.fileName ? ` · ${proposal.fileName}` : ""} · {when(proposal.submittedAt)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline" className={cn(STATUS_STYLE[proposal.status as Status])}>
          {proposal.status === "pending" ? "Waiting" : proposal.status}
        </Badge>
        <Badge variant="outline">{proposal.cells.length} to change</Badge>
        {proposal.appliedCells > 0 && (
          <Badge variant="outline" className="border-emerald-500 text-emerald-700">
            {proposal.appliedCells} applied
          </Badge>
        )}
        {proposal.rejectedCells > 0 && (
          <Badge variant="outline" className="border-red-400 text-red-700">
            {proposal.rejectedCells} rejected
          </Badge>
        )}
        {proposal.unchangedCount > 0 && (
          <Badge variant="outline" className="text-muted-foreground">
            {proposal.unchangedCount} untouched
          </Badge>
        )}
        {proposal.skippedCount > 0 && (
          <Badge variant="outline" className="text-muted-foreground">
            {proposal.skippedCount} not read
          </Badge>
        )}
        {proposal.belowBaseCount > 0 && (
          <Badge variant="outline" className="border-amber-400 text-amber-700">
            {proposal.belowBaseCount} below Base SRP
          </Badge>
        )}
      </div>

      {proposal.rejectionReason && (
        <p className="rounded-md border border-red-400/40 bg-red-50 px-3 py-2 text-sm text-red-700">
          {proposal.rejectionReason}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {waiting && (
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select every line still waiting"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={pendingIds.length > 0 && picked.size === pendingIds.length}
                    onChange={(e) =>
                      setPicked(e.target.checked ? new Set(pendingIds) : new Set())
                    }
                  />
                </TableHead>
              )}
              <TableHead>SKU</TableHead>
              <TableHead>Applies to</TableHead>
              <TableHead className="text-right">Now</TableHead>
              <TableHead className="text-right">After</TableHead>
              <TableHead className="text-right">Change</TableHead>
              {proposal.appliedCells + proposal.rejectedCells > 0 && (
                <TableHead>State</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {proposal.cells.map((cell) => {
              const delta = cell.newPriceCentavos - cell.oldPriceCentavos;
              const decided = cell.status !== "pending";
              return (
                <TableRow key={cell._id} className={cn(decided && "opacity-60")}>
                  {waiting && (
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select ${cell.sku}`}
                        className="h-4 w-4 rounded border-gray-300"
                        disabled={decided}
                        checked={picked.has(cell._id as string)}
                        onChange={() => togglePicked(cell._id as string)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-mono text-xs">
                    {cell.sku}
                    <span className="ml-2 font-sans text-muted-foreground">{cell.label}</span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {cell.scope}
                    {cell.action === "reset" && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        back to Base SRP
                      </Badge>
                    )}
                    {cell.belowBase && (
                      <Badge
                        variant="outline"
                        className="ml-2 border-amber-400 text-[10px] text-amber-700"
                      >
                        below base
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(cell.oldPriceCentavos)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(cell.newPriceCentavos)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      delta < 0 ? "text-red-600" : "text-emerald-700"
                    )}
                  >
                    {delta > 0 ? "+" : ""}
                    {formatCurrency(delta)}
                  </TableCell>
                  {proposal.appliedCells + proposal.rejectedCells > 0 && (
                    <TableCell>
                      {cell.status === "applied" ? (
                        <Badge variant="outline" className="border-emerald-500 text-[10px] text-emerald-700">
                          applied
                        </Badge>
                      ) : cell.status === "rejected" ? (
                        <Badge variant="outline" className="border-red-400 text-[10px] text-red-700">
                          rejected
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">waiting</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {waiting && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-muted-foreground">
            {picked.size > 0
              ? `${picked.size} of ${pendingIds.length} line${pendingIds.length === 1 ? "" : "s"} selected`
              : `Tick lines to take only some, or approve all ${pendingIds.length}.`}
          </span>
          <Button variant="outline" disabled={busy} onClick={() => setRejectOpen(true)}>
            <X className="mr-1.5 h-4 w-4" />
            {picked.size > 0 ? `Reject ${picked.size}` : "Reject all"}
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true);
                try {
                  const r = await approve({
                    proposalId,
                    ...(picked.size > 0
                      ? { cellIds: [...picked] as Id<"priceProposalCells">[] }
                      : {}),
                  });
                  toast.success(
                    `${r.appliedNow} price${r.appliedNow === 1 ? "" : "s"} are now live` +
                      (r.waiting > 0 ? ` · ${r.waiting} still waiting` : "")
                  );
                  setPicked(new Set());
                  if (r.waiting === 0) onBack();
                } catch (err) {
                  toast.error(getErrorMessage(err));
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            <Check className="mr-1.5 h-4 w-4" />
            {picked.size > 0 ? `Approve ${picked.size}` : "Approve all"}
          </Button>
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {picked.size > 0 ? `Reject ${picked.size} line(s)` : "Reject all these prices"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Nothing is applied. The reason is kept with the proposal.
            </p>
            <div className="space-y-2">
              <Label>Why?</Label>
              <Textarea
                rows={3}
                placeholder="e.g., wrong column edited, margins too thin on the outlet lines…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={busy || !reason.trim()}
              onClick={() =>
                void (async () => {
                  setBusy(true);
                  try {
                    const r = await reject({
                      proposalId,
                      reason: reason.trim(),
                      ...(picked.size > 0
                        ? { cellIds: [...picked] as Id<"priceProposalCells">[] }
                        : {}),
                    });
                    toast.success(
                      `${r.rejectedNow} line${r.rejectedNow === 1 ? "" : "s"} rejected` +
                        (r.waiting > 0 ? ` · ${r.waiting} still waiting` : "")
                    );
                    setPicked(new Set());
                    setRejectOpen(false);
                    setReason("");
                    if (r.waiting === 0) onBack();
                  } catch (err) {
                    toast.error(getErrorMessage(err));
                  } finally {
                    setBusy(false);
                  }
                })()
              }
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── The queue ───────────────────────────────────────────────────────────────

export default function PriceApprovalsPage() {
  const [filter, setFilter] = useState<Status | "all">("pending");
  const [openId, setOpenId] = useState<Id<"priceProposals"> | null>(null);

  const rows = useQuery(api.admin.prices.listPriceProposals, {
    ...(filter === "all" ? {} : { status: filter }),
  });

  if (openId) {
    return <ProposalDetail proposalId={openId} onBack={() => setOpenId(null)} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Price Approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every price change waits here until an admin has seen what it does. Nothing on
          this page has reached a till yet.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === f.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows === undefined ? (
        <div className="h-48 animate-pulse rounded-lg border bg-muted/40" />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
          {filter === "pending" ? "No price changes waiting." : "Nothing here."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>What</TableHead>
                <TableHead className="text-right">Prices</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow
                  key={p._id}
                  className="cursor-pointer"
                  onClick={() => setOpenId(p._id as Id<"priceProposals">)}
                >
                  <TableCell>
                    <span className="flex items-center gap-2 font-medium">
                      {p.source === "csv" ? (
                        <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <PencilLine className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{p.summary}</span>
                    </span>
                    {p.belowBaseCount > 0 && (
                      <span className="mt-0.5 block text-[11px] text-amber-700">
                        {p.belowBaseCount} below the Base SRP
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.changedCount}
                    {p.unchangedCount > 0 && (
                      <span className="block text-[11px] text-muted-foreground">
                        {p.unchangedCount} untouched
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {when(p.submittedAt)}
                    <span className="block text-[11px]">by {p.submittedByName}</span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("text-xs", STATUS_STYLE[p.status as Status])}
                    >
                      {p.status === "pending" && <Clock className="mr-1 h-3 w-3" />}
                      {p.status === "approved"
                        ? `Applied${p.appliedCount !== null ? ` (${p.appliedCount})` : ""}`
                        : p.status === "rejected"
                          ? "Rejected"
                          : "Waiting"}
                    </Badge>
                    {p.status === "pending" && p.pendingCount < p.changedCount && (
                      <span className="mt-0.5 block text-[11px] text-amber-700">
                        part reviewed · {p.pendingCount} left
                      </span>
                    )}
                    {p.reviewedAt && p.reviewedByName && (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {when(p.reviewedAt)} · {p.reviewedByName}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

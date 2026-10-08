"use client";

// components/shared/PreAllocationPanel.tsx — split a delivery before it lands.
//
// Sits on a supplier receipt. Upload a plan, logistics approves it, and when
// the goods are scanned in the store transfers are cut automatically — the
// delivery cross-docks instead of being put away and re-picked.
//
// The file is the SAME one the warehouse-to-store allocation takes
// (SKU,Branch,Quantity,Notes), on purpose: one template for both uploads, and
// nobody has to remember which one wants which columns. The only difference is
// what the quantities are checked against — here it is what the PO declared,
// because the stock does not exist yet.

import { useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { cn, getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { downloadCsv } from "@/lib/csv";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Download, Upload, Check, X, Split, AlertTriangle, Clock,
} from "lucide-react";

const COLUMNS = ["SKU", "Branch", "Quantity", "Notes"];

type Problem = { row: number; sku: string; branchName: string; reason: string };

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Anything unreadable comes back NaN so the server reports the row rather
 *  than silently planning nothing for a store. */
function parseQuantity(raw: string): number {
  const text = raw.trim().replace(/[\s,]/g, "");
  if (text === "") return NaN;
  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "border-amber-500 text-amber-800",
  approved: "border-sky-500 text-sky-700",
  rejected: "border-red-400 text-red-700",
  applied: "border-emerald-500 text-emerald-700",
};

export function PreAllocationPanel({
  receiptId,
  declaredLines,
  canPlan,
  canApprove,
  receiptOpen,
}: {
  receiptId: Id<"supplierReceipts">;
  /** The PO's declared lines, so the template is a worked example. */
  declaredLines: { sku: string; declaredQuantity: number }[];
  canPlan: boolean;
  canApprove: boolean;
  /** False once the delivery has been received — nothing left to pre-allocate. */
  receiptOpen: boolean;
}) {
  const plan = useQuery(api.suppliers.preAllocation.getPreAllocation, { receiptId });
  const upload = useMutation(api.suppliers.preAllocation.uploadPreAllocation);
  const approve = useMutation(api.suppliers.preAllocation.approvePreAllocation);
  const reject = useMutation(api.suppliers.preAllocation.rejectPreAllocation);

  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  function downloadTemplate() {
    downloadCsv(
      "pre-allocation-template.csv",
      [
        COLUMNS,
        ...declaredLines.map((line) => [line.sku, "Branch name", 0, ""]),
      ]
    );
    toast.message(
      "One row per SKU per store. Add a row for each store that gets this product."
    );
  }

  async function handleFile(file: File) {
    setBusy(true);
    setProblems([]);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
      if (lines.length < 2) {
        toast.error("That file has no rows under its header.");
        return;
      }
      const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
      const skuAt = header.findIndex((h) => h === "sku");
      const branchAt = header.findIndex((h) => h === "branch");
      const qtyAt = header.findIndex((h) => h === "quantity" || h === "qty");
      const notesAt = header.findIndex((h) => h === "notes");

      const missing = [
        skuAt === -1 ? "SKU" : null,
        branchAt === -1 ? "Branch" : null,
        qtyAt === -1 ? "Quantity" : null,
      ].filter((c): c is string => c !== null);
      if (missing.length > 0) {
        toast.error(
          `Missing column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}. Download the template and edit that copy.`
        );
        return;
      }

      const rows = lines.slice(1).map((line) => {
        const cells = splitCsvLine(line);
        return {
          sku: cells[skuAt] ?? "",
          branchName: cells[branchAt] ?? "",
          quantity: parseQuantity(cells[qtyAt] ?? ""),
          ...(notesAt !== -1 && cells[notesAt] ? { notes: cells[notesAt] } : {}),
        };
      });

      const result = await upload({ receiptId, fileName: file.name, rows });
      setProblems(result.problems);
      toast.success(
        `${result.unitsPlanned.toLocaleString("en-PH")} units planned across ` +
          `${result.branches.length} store${result.branches.length === 1 ? "" : "s"} · awaiting approval` +
          (result.problems.length ? ` · ${result.problems.length} row(s) skipped` : "")
      );
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const status = plan?.status;
  const live = status === "pending" || status === "approved";

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-start gap-2 p-4">
        <div className="mr-auto">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Split className="h-4 w-4 text-muted-foreground" />
            Pre-allocation
          </h2>
          <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
            Split this delivery across stores before it arrives. Approved here,
            the store transfers are cut the moment the goods are scanned in — so
            it leaves the same day instead of being put away and re-picked.
          </p>
        </div>

        {canPlan && receiptOpen && !live && (
          <>
            <Button variant="outline" size="sm" disabled={busy} onClick={downloadTemplate}>
              <Download className="mr-1.5 h-4 w-4" />
              Template
            </Button>
            <Button size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>
              <Upload className="mr-1.5 h-4 w-4" />
              Upload plan
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </>
        )}
      </div>

      {plan === undefined ? (
        <div className="border-t p-4">
          <div className="h-10 animate-pulse rounded bg-muted" />
        </div>
      ) : plan === null ? (
        <p className="border-t p-4 text-xs text-muted-foreground">
          {receiptOpen
            ? "No plan yet. This delivery will be received into the warehouse and allocated from there."
            : "This delivery was not pre-allocated."}
        </p>
      ) : (
        <div className="space-y-3 border-t p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className={cn("font-normal", STATUS_STYLE[plan.status])}>
              {plan.status === "pending" && <Clock className="mr-1 h-3 w-3" />}
              {plan.status === "applied" ? "Applied" : plan.status}
            </Badge>
            <span className="font-mono">{plan.fileName}</span>
            <span className="text-muted-foreground">
              {plan.unitsPlanned.toLocaleString("en-PH")} units ·{" "}
              {plan.lineCount} line{plan.lineCount === 1 ? "" : "s"} ·{" "}
              {plan.branchCount} store{plan.branchCount === 1 ? "" : "s"} · by{" "}
              {plan.submittedByName}
            </span>
          </div>

          {plan.status === "applied" && (
            <p className="text-xs text-emerald-700">
              {plan.transfersCreated} transfer
              {plan.transfersCreated === 1 ? "" : "s"} cut for{" "}
              {(plan.unitsApplied ?? 0).toLocaleString("en-PH")} units
              {plan.unitsApplied !== null && plan.unitsApplied < plan.unitsPlanned && (
                <>
                  {" "}
                  — scaled down from {plan.unitsPlanned.toLocaleString("en-PH")}{" "}
                  because the supplier sent less than the PO declared.
                </>
              )}
            </p>
          )}

          {plan.status === "rejected" && plan.rejectionReason && (
            <p className="text-xs text-red-700">
              Rejected by {plan.reviewedByName}: {plan.rejectionReason}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {plan.byBranch.map((b) => (
              <span
                key={b.branchName}
                className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs text-sky-800"
              >
                {b.branchName} · {b.units.toLocaleString("en-PH")} units
              </span>
            ))}
          </div>

          <div className="max-h-56 overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60">
                <tr className="text-left">
                  <th className="px-2 py-1.5 font-medium">SKU</th>
                  <th className="px-2 py-1.5 font-medium">Store</th>
                  <th className="px-2 py-1.5 text-right font-medium">Planned</th>
                  <th className="px-2 py-1.5 text-right font-medium">On the PO</th>
                </tr>
              </thead>
              <tbody>
                {plan.lines.map((line) => (
                  <tr key={line._id as string} className="border-b last:border-0">
                    <td className="px-2 py-1 font-mono">{line.sku}</td>
                    <td className="px-2 py-1">{line.branchName}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{line.quantity}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                      {line.declaredOnPo}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {plan.status === "pending" && canApprove && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="mr-auto text-xs text-muted-foreground">
                Nothing moves on approval — the goods are not here yet.
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setRejectOpen(true)}
              >
                <X className="mr-1.5 h-4 w-4" />
                Reject
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void (async () => {
                    setBusy(true);
                    try {
                      const r = await approve({ allocationId: plan._id });
                      toast.success(
                        `Plan approved · ${r.unitsPlanned.toLocaleString("en-PH")} units will be cut on receiving`
                      );
                    } catch (err) {
                      toast.error(getErrorMessage(err));
                    } finally {
                      setBusy(false);
                    }
                  })()
                }
              >
                <Check className="mr-1.5 h-4 w-4" />
                Approve plan
              </Button>
            </div>
          )}

          {problems.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2.5">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-900">
                <AlertTriangle className="h-3.5 w-3.5" />
                {problems.length} row{problems.length === 1 ? "" : "s"} left out
              </p>
              <ul className="space-y-0.5 text-[11px] text-amber-900">
                {problems.slice(0, 6).map((p) => (
                  <li key={`${p.row}-${p.sku}`}>
                    line {p.row} · {p.sku || "—"} · {p.reason}
                  </li>
                ))}
                {problems.length > 6 && <li>…and {problems.length - 6} more</li>}
              </ul>
            </div>
          )}
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this plan</DialogTitle>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this split not right?"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !reason.trim() || !plan}
              onClick={() =>
                void (async () => {
                  if (!plan) return;
                  setBusy(true);
                  try {
                    await reject({ allocationId: plan._id, reason: reason.trim() });
                    toast.success("Plan rejected");
                    setRejectOpen(false);
                    setReason("");
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

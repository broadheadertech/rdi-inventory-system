"use client";

// app/admin/fashion-assistants/page.tsx — HQ signs off the shop floor.
//
// A branch adds the people who work on its own floor, and they arrive here
// waiting. Until HQ approves one, the till will not offer them, so no sale can
// be attributed to a name nobody signed off — which is the whole point, since
// an attributed sale is an incentive paid.
//
// A refusal carries a reason, because the branch has to know what to fix.

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { cn, getErrorMessage } from "@/lib/utils";
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
import { Check, Clock, UserCheck, X } from "lucide-react";

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
  return new Date(ms).toLocaleDateString("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Manila",
  });
}

export default function AdminFashionAssistantsPage() {
  const [filter, setFilter] = useState<Status | "all">("pending");
  const [rejectTarget, setRejectTarget] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useQuery(api.pos.fashionAssistants.listForReview, {
    ...(filter === "all" ? {} : { status: filter }),
  });
  const approve = useMutation(api.pos.fashionAssistants.approve);
  const reject = useMutation(api.pos.fashionAssistants.reject);

  async function handleApprove(id: string, name: string) {
    setBusy(true);
    try {
      await approve({ id: id as Id<"fashionAssistants"> });
      toast.success(`${name} approved`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fashion Assistants</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Branches add their own floor staff. They can only be picked at the till once
          you approve them.
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
        <div className="flex flex-col items-center gap-2 rounded-lg border p-10 text-center">
          <UserCheck className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {filter === "pending"
              ? "Nothing waiting. New floor staff appear here as branches add them."
              : "Nothing here."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((fa) => (
                <TableRow key={fa._id}>
                  <TableCell>
                    <span className="font-medium">{fa.name}</span>
                    {fa.employeeCode && (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {fa.employeeCode}
                      </span>
                    )}
                    {fa.status === "rejected" && fa.rejectionReason && (
                      <p className="mt-0.5 text-xs text-red-600">{fa.rejectionReason}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{fa.branchName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {when(fa.createdAt)}
                    <span className="block text-[11px]">by {fa.addedByName}</span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("text-xs", STATUS_STYLE[fa.status as Status])}
                    >
                      {fa.status === "pending" && <Clock className="mr-1 h-3 w-3" />}
                      {fa.status === "approved" ? "Approved" : fa.status === "rejected" ? "Rejected" : "Waiting"}
                    </Badge>
                    {fa.reviewedAt && fa.reviewedByName && (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {when(fa.reviewedAt)} · {fa.reviewedByName}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {fa.status !== "approved" && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleApprove(fa._id as string, fa.name)}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" />
                          Approve
                        </Button>
                      )}
                      {fa.status !== "rejected" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setRejectTarget({ id: fa._id as string, name: fa.name });
                            setReason("");
                          }}
                        >
                          <X className="mr-1 h-3.5 w-3.5" />
                          Reject
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* A refusal says why, so the branch knows what to fix */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => { if (!open) setRejectTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject {rejectTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              The branch sees this reason on their own list, and the till will not offer
              this name.
            </p>
            <div className="space-y-2">
              <Label>Why?</Label>
              <Textarea
                rows={3}
                placeholder="e.g., not on the payroll, duplicate of an existing associate…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={busy || !reason.trim()}
              onClick={() =>
                void (async () => {
                  if (!rejectTarget) return;
                  setBusy(true);
                  try {
                    await reject({
                      id: rejectTarget.id as Id<"fashionAssistants">,
                      reason: reason.trim(),
                    });
                    toast.success(`${rejectTarget.name} rejected`);
                    setRejectTarget(null);
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

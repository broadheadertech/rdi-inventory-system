"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";

const FIELD_LABELS: Record<string, string> = {
  businessName: "Business Name",
  tin: "VAT Reg TIN",
  businessAddress: "Business Address",
  storeCode: "Store Code",
  terminalNumber: "Terminal No.",
  minNumber: "MIN",
  serialNumber: "Serial No.",
  accreditationNumber: "Accreditation No.",
  accreditationDate: "Accreditation Date",
  ptuNumber: "PTU No.",
  ptuDate: "PTU Date",
  softwareName: "Software",
  softwareVersion: "Version",
  supplierName: "Supplier",
  supplierTin: "Supplier TIN",
  supplierAddress: "Supplier Address",
};

export default function AdminBirRegistrationPage() {
  const pending = useQuery(api.admin.birRegistration.listPendingBirChanges);
  const approve = useMutation(api.admin.birRegistration.approveBirChange);
  const reject = useMutation(api.admin.birRegistration.rejectBirChange);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove(branchId: Id<"branches">) {
    setError(null);
    setBusyId(branchId as string);
    try {
      await approve({ branchId });
    } catch (err) {
      setError(friendlyError(err, "Couldn't approve."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(branchId: Id<"branches">) {
    const reason = window.prompt("Reason for rejecting this change?")?.trim();
    if (!reason) return;
    setError(null);
    setBusyId(branchId as string);
    try {
      await reject({ branchId, reason });
    } catch (err) {
      setError(friendlyError(err, "Couldn't reject."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">BIR Registration Approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review and approve branch BIR / POS registration changes. Approved values
          go live on that branch&apos;s receipts.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {pending === undefined ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      ) : pending.length === 0 ? (
        <div className="rounded-lg border py-12 text-center text-sm text-muted-foreground">
          No pending BIR registration changes.
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((req) => {
            const proposed = (req.pending ?? {}) as Record<string, string>;
            const current = (req.active ?? {}) as Record<string, string>;
            return (
              <div key={req.branchId as string} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{req.branchName}</p>
                    <p className="text-xs text-muted-foreground">
                      Requested by {req.requesterName}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(req.branchId as Id<"branches">)}
                      disabled={busyId === req.branchId}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReject(req.branchId as Id<"branches">)}
                      disabled={busyId === req.branchId}
                    >
                      Reject
                    </Button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium">Field</th>
                        <th className="px-3 py-1.5 text-left font-medium">Current</th>
                        <th className="px-3 py-1.5 text-left font-medium">Proposed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {Object.keys(FIELD_LABELS).map((key) => {
                        const cur = current[key] ?? "";
                        const next = proposed[key] ?? "";
                        if (!cur && !next) return null;
                        const changed = cur !== next;
                        return (
                          <tr key={key} className={changed ? "bg-amber-50" : ""}>
                            <td className="px-3 py-1.5 text-muted-foreground">
                              {FIELD_LABELS[key]}
                            </td>
                            <td className="px-3 py-1.5">{cur || "—"}</td>
                            <td className={`px-3 py-1.5 ${changed ? "font-semibold" : ""}`}>
                              {next || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState, useEffect } from "react";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BirConfig = Record<string, string>;

const FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: "businessName", label: "Registered Business Name" },
  { key: "tin", label: "VAT Reg TIN", placeholder: "000-000-000-00000" },
  { key: "businessAddress", label: "Business Address" },
  { key: "terminalNumber", label: "POS / Terminal No." },
  { key: "minNumber", label: "MIN (Machine ID No.)" },
  { key: "serialNumber", label: "Machine Serial No." },
  { key: "accreditationNumber", label: "Accreditation No." },
  { key: "accreditationDate", label: "Accreditation Date", placeholder: "e.g. Jan 15, 2026" },
  { key: "ptuNumber", label: "PTU No." },
  { key: "ptuDate", label: "PTU Date", placeholder: "e.g. Jan 20, 2026" },
  { key: "softwareName", label: "Software Name", placeholder: "RedBox POS" },
  { key: "softwareVersion", label: "Software Version" },
  { key: "supplierName", label: "Supplier / Vendor Name" },
  { key: "supplierTin", label: "Supplier TIN" },
  { key: "supplierAddress", label: "Supplier Address" },
];

export default function BranchBirRegistrationPage() {
  const reg = useQuery(api.admin.birRegistration.getBranchBirRegistration, {});
  const submit = useMutation(api.admin.birRegistration.submitBirChange);

  const [form, setForm] = useState<BirConfig>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Seed the form from the pending change (if any) else the active values
  useEffect(() => {
    if (!reg) return;
    const source = (reg.pending ?? reg.active ?? {}) as BirConfig;
    setForm({ ...source });
  }, [reg]);

  if (reg === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  if (reg === null) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No branch is assigned to your account.
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    setBusy(true);
    try {
      // strip empty strings → undefined
      const config: BirConfig = {};
      for (const { key } of FIELDS) {
        const val = form[key]?.trim();
        if (val) config[key] = val;
      }
      await submit({ branchId: reg!.branchId as Id<"branches">, config });
      setDone(true);
    } catch (err) {
      setError(friendlyError(err, "Couldn't submit the change."));
    } finally {
      setBusy(false);
    }
  }

  const isAccredited = !!(reg.active?.ptuNumber || reg.active?.accreditationNumber);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">BIR Registration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your branch&apos;s BIR / POS registration details for receipts. Changes
          require Admin approval before they take effect.
        </p>
      </div>

      {/* Status banners */}
      <div className="flex flex-wrap gap-2 text-sm">
        <span
          className={`rounded-full px-3 py-1 font-medium ${
            isAccredited ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {isAccredited ? "Accredited — official Sales Invoice" : "Not yet accredited — Order Slip"}
        </span>
        {reg.pendingStatus === "pending" && (
          <span className="rounded-full bg-blue-100 px-3 py-1 font-medium text-blue-700">
            Change pending Admin approval
          </span>
        )}
        {reg.pendingStatus === "rejected" && (
          <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-700">
            Last change rejected
          </span>
        )}
      </div>

      {reg.pendingStatus === "rejected" && reg.reviewNotes && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Rejected: {reg.reviewNotes}
        </div>
      )}
      {done && (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Submitted — waiting for Admin approval.
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={f.key}>{f.label}</Label>
              <Input
                id={f.key}
                value={form[f.key] ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>
            {busy ? "Submitting…" : "Submit for Approval"}
          </Button>
        </div>
      </form>
    </div>
  );
}

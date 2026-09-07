"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn, getErrorMessage } from "@/lib/utils";
import {
  Plus,
  MonitorSmartphone,
  PowerOff,
  Power,
  Loader2,
  ShieldCheck,
  Copy,
  Check,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Terminal = {
  _id: Id<"posTerminals">;
  label: string;
  terminalNumber: string;
  isActive: boolean;
  enrolledAt: number;
  lastSeenAt: number | null;
  minNumber: string | null;
  serialNumber: string | null;
  ptuNumber: string | null;
  ptuDate: string | null;
};

function formatDate(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ─── GenerateCodeForm ─────────────────────────────────────────────────────────

function GenerateCodeForm({ onDone }: { onDone: () => void }) {
  const createEnrollmentCode = useAction(api.pos.terminalsActions.createEnrollmentCode);

  const [label, setLabel] = useState("");
  const [terminalNumber, setTerminalNumber] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState<{ code: string; expiresAt: number } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit() {
    const errs: Record<string, string> = {};
    if (!label.trim()) errs.label = "Required";
    if (!terminalNumber.trim()) errs.terminalNumber = "Required";
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      const result = await createEnrollmentCode({
        label: label.trim(),
        terminalNumber: terminalNumber.trim(),
      });
      setIssued(result);
    } catch (err) {
      setErrors({ form: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  // Code issued — show it for the manager to carry to the register.
  if (issued) {
    const minutes = Math.max(0, Math.round((issued.expiresAt - Date.now()) / 60000));
    return (
      <div className="space-y-4 rounded-lg border bg-card p-5">
        <div className="space-y-1">
          <h2 className="font-semibold">Enrollment code for {label.trim()}</h2>
          <p className="text-sm text-muted-foreground">
            Type this code on the register itself. It works once and expires in {minutes}{" "}
            minute{minutes === 1 ? "" : "s"}.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <code className="flex-1 rounded-lg border bg-muted/50 px-4 py-4 text-center font-mono text-3xl tracking-[0.3em]">
            {issued.code}
          </code>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(issued.code).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                },
                () => {
                  /* clipboard blocked — the code is on screen anyway */
                }
              );
            }}
            className="rounded-lg border p-3 hover:bg-muted transition-colors"
            aria-label="Copy code"
          >
            {copied ? (
              <Check className="h-5 w-5 text-green-600" />
            ) : (
              <Copy className="h-5 w-5" />
            )}
          </button>
        </div>

        <button
          onClick={onDone}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <h2 className="font-semibold">Register a new terminal</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Terminal name
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Lane 1"
            autoComplete="off"
            className={cn(
              "w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary",
              errors.label ? "border-red-400" : "border-input"
            )}
          />
          {errors.label && <p className="text-xs text-red-500">{errors.label}</p>}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            BIR terminal number
          </label>
          <input
            value={terminalNumber}
            onChange={(e) => setTerminalNumber(e.target.value)}
            placeholder="01"
            autoComplete="off"
            className={cn(
              "w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary",
              errors.terminalNumber ? "border-red-400" : "border-input"
            )}
          />
          {errors.terminalNumber && (
            <p className="text-xs text-red-500">{errors.terminalNumber}</p>
          )}
        </div>
      </div>

      {errors.form && <p className="text-sm text-red-500">{errors.form}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Generate code
        </button>
        <button
          onClick={onDone}
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function TerminalRow({ terminal }: { terminal: Terminal }) {
  const setActive = useMutation(api.pos.terminals.setTerminalActive);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const verb = terminal.isActive ? "Deactivate" : "Reactivate";
    if (
      !window.confirm(
        terminal.isActive
          ? `${verb} ${terminal.label}? The register will be signed out immediately and cannot open a shift until it is enrolled again.`
          : `${verb} ${terminal.label}?`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await setActive({ terminalId: terminal._id, isActive: !terminal.isActive });
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-3">
        <div className="font-medium">{terminal.label}</div>
        <div className="text-xs text-muted-foreground">
          Terminal {terminal.terminalNumber}
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{formatDate(terminal.enrolledAt)}</td>
      <td className="px-4 py-3 text-muted-foreground">{formatDate(terminal.lastSeenAt)}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {terminal.minNumber ? `MIN ${terminal.minNumber}` : "MIN not set"}
        {terminal.ptuNumber ? ` · PTU ${terminal.ptuNumber}` : ""}
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            terminal.isActive
              ? "bg-green-500/10 text-green-600"
              : "bg-muted text-muted-foreground"
          )}
        >
          {terminal.isActive ? "Active" : "Revoked"}
        </span>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={toggle}
          disabled={busy}
          className="rounded-md border p-1.5 hover:bg-muted disabled:opacity-50 transition-colors"
          aria-label={terminal.isActive ? "Deactivate terminal" : "Reactivate terminal"}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : terminal.isActive ? (
            <PowerOff className="h-3.5 w-3.5" />
          ) : (
            <Power className="h-3.5 w-3.5" />
          )}
        </button>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BranchTerminalsPage() {
  const branchCtx = useQuery(api.dashboards.branchDashboard.getBranchContext);
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);

  const terminals = useQuery(api.pos.terminals.listTerminals, {
    includeInactive: showInactive,
  });

  if (branchCtx === undefined || terminals === undefined) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">POS Terminals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Registers approved to run the POS for {branchCtx?.branchName ?? "this branch"}
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Register Terminal
          </button>
        )}
      </div>

      <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Only registered terminals can open a shift or process sales. A cashier signing in
          from a phone or an unregistered computer will be refused. A manager still signs
          the machine in; registering identifies <em>which</em> register it is. Each
          terminal also carries its own BIR machine registration (MIN, serial and PTU).
        </span>
      </p>

      {adding && <GenerateCodeForm onDone={() => setAdding(false)} />}

      <div className="flex items-center gap-3">
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="accent-primary"
          />
          Show revoked
        </label>
        <span className="text-xs text-muted-foreground">
          {terminals.length} terminal{terminals.length !== 1 ? "s" : ""}
        </span>
      </div>

      {terminals.length === 0 ? (
        <div className="rounded-lg border p-10 text-center">
          <MonitorSmartphone className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No terminals registered yet. Generate a code above, then type it on the register.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  Terminal
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  Registered
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  Last used
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  BIR
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {terminals.map((t) => (
                <TerminalRow key={t._id} terminal={t as Terminal} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

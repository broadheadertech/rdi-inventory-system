"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Plus, Pencil, KeyRound, UserX, UserCheck, X, Check, Loader2 } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Cashier = {
  _id: Id<"cashierAccounts">;
  firstName: string;
  lastName: string;
  username: string;
  isActive: boolean;
  createdAt: number;
};

// ─── Inline form helpers ───────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  error?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className={cn(
          "w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary",
          error ? "border-red-400" : "border-input"
        )}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── AddCashierForm ───────────────────────────────────────────────────────────

function AddCashierForm({
  branchId,
  onDone,
}: {
  branchId: Id<"branches">;
  onDone: () => void;
}) {
  const createCashier = useAction(api.branches.cashierAccountsActions.createCashier);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.firstName = "Required";
    if (!lastName.trim()) errs.lastName = "Required";
    if (!username.trim()) errs.username = "Required";
    if (password.length < 6) errs.password = "At least 6 characters";
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSaving(true);
    try {
      await createCashier({ branchId, firstName, lastName, username, password });
      onDone();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrors({ submit: msg });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">New Cashier</p>
        <button onClick={onDone} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First Name" value={firstName} onChange={setFirstName} placeholder="e.g. Maria" error={errors.firstName} />
        <Field label="Last Name" value={lastName} onChange={setLastName} placeholder="e.g. Santos" error={errors.lastName} />
        <Field label="Username" value={username} onChange={setUsername} placeholder="e.g. maria.santos" error={errors.username} />
        <Field label="Password" value={password} onChange={setPassword} type="password" placeholder="Min. 6 characters" error={errors.password} />
      </div>
      {errors.submit && (
        <p className="text-xs text-red-500">{errors.submit}</p>
      )}
      <div className="flex justify-end gap-2">
        <button
          onClick={onDone}
          className="rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1.5"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Add Cashier
        </button>
      </div>
    </div>
  );
}

// ─── EditCashierRow ───────────────────────────────────────────────────────────

function EditCashierRow({
  cashier,
  onDone,
}: {
  cashier: Cashier;
  onDone: () => void;
}) {
  const updateCashier = useMutation(api.branches.cashierAccounts.updateCashier);
  const [firstName, setFirstName] = useState(cashier.firstName);
  const [lastName, setLastName] = useState(cashier.lastName);
  const [username, setUsername] = useState(cashier.username);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim() || !username.trim()) {
      setError("All fields required");
      return;
    }
    setSaving(true);
    try {
      await updateCashier({ accountId: cashier._id, firstName, lastName, username });
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b bg-primary/5">
      <td className="px-4 py-2" colSpan={2}>
        <div className="flex gap-2">
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="rounded border bg-background px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="First"
          />
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="rounded border bg-background px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Last"
          />
        </div>
      </td>
      <td className="px-4 py-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="rounded border bg-background px-2 py-1 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </td>
      <td className="px-4 py-2 text-xs text-red-500" colSpan={2}>{error}</td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="p-1 rounded text-green-600 hover:bg-green-50 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button onClick={onDone} className="p-1 rounded text-muted-foreground hover:bg-muted">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── ResetPasswordRow ─────────────────────────────────────────────────────────

function ResetPasswordRow({
  cashier,
  onDone,
}: {
  cashier: Cashier;
  onDone: () => void;
}) {
  const resetPassword = useAction(api.branches.cashierAccountsActions.resetCashierPassword);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleReset() {
    if (newPassword.length < 6) { setError("At least 6 characters"); return; }
    setSaving(true);
    try {
      await resetPassword({ accountId: cashier._id, newPassword });
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b bg-amber-50/60">
      <td className="px-4 py-2 text-xs text-muted-foreground" colSpan={2}>
        Reset password for <span className="font-medium text-foreground">{cashier.firstName} {cashier.lastName}</span>
      </td>
      <td className="px-4 py-2" colSpan={2}>
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min 6)"
            className={cn(
              "rounded border bg-background px-2 py-1 text-xs w-44 focus:outline-none focus:ring-1 focus:ring-primary",
              error ? "border-red-400" : ""
            )}
          />
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
      </td>
      <td className="px-4 py-2" colSpan={2}>
        <div className="flex items-center gap-1">
          <button
            onClick={handleReset}
            disabled={saving}
            className="p-1 rounded text-green-600 hover:bg-green-50 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button onClick={onDone} className="p-1 rounded text-muted-foreground hover:bg-muted">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── CashierRow ───────────────────────────────────────────────────────────────

function CashierRow({ cashier }: { cashier: Cashier }) {
  const toggleActive = useMutation(api.branches.cashierAccounts.toggleActive);
  const [mode, setMode] = useState<"view" | "edit" | "reset">("view");

  if (mode === "edit") {
    return <EditCashierRow cashier={cashier} onDone={() => setMode("view")} />;
  }
  if (mode === "reset") {
    return <ResetPasswordRow cashier={cashier} onDone={() => setMode("view")} />;
  }

  return (
    <tr className="border-b last:border-0 hover:bg-muted/20">
      <td className="px-4 py-3 font-medium">
        {cashier.firstName} {cashier.lastName}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {new Date(cashier.createdAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" })}
      </td>
      <td className="px-4 py-3 text-sm font-mono text-muted-foreground">
        {cashier.username}
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          "inline-flex px-2 py-0.5 rounded-full text-xs font-medium",
          cashier.isActive ? "bg-green-50 text-green-700" : "bg-muted text-muted-foreground"
        )}>
          {cashier.isActive ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMode("edit")}
            title="Edit"
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setMode("reset")}
            title="Reset password"
            className="p-1.5 rounded text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors"
          >
            <KeyRound className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => toggleActive({ accountId: cashier._id, isActive: !cashier.isActive })}
            title={cashier.isActive ? "Deactivate" : "Reactivate"}
            className={cn(
              "p-1.5 rounded transition-colors",
              cashier.isActive
                ? "text-muted-foreground hover:text-red-600 hover:bg-red-50"
                : "text-muted-foreground hover:text-green-600 hover:bg-green-50"
            )}
          >
            {cashier.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BranchCashiersPage() {
  const branchCtx = useQuery(api.dashboards.branchDashboard.getBranchContext);
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);

  const cashiers = useQuery(
    api.branches.cashierAccounts.listCashiers,
    { includeInactive: showInactive }
  );

  if (branchCtx === undefined || cashiers === undefined) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cashiers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage cashier accounts for {branchCtx?.branchName ?? "this branch"}
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Cashier
          </button>
        )}
      </div>

      {/* Add form */}
      {adding && branchCtx?.branchId && (
        <AddCashierForm
          branchId={branchCtx.branchId as unknown as Id<"branches">}
          onDone={() => setAdding(false)}
        />
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="accent-primary"
          />
          Show inactive
        </label>
        <span className="text-xs text-muted-foreground">
          {cashiers.length} cashier{cashiers.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      {cashiers.length === 0 ? (
        <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
          {showInactive ? "No cashier accounts yet." : "No active cashiers. Add one above or show inactive accounts."}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Added</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Username</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cashiers.map((c) => (
                <CashierRow key={c._id} cashier={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

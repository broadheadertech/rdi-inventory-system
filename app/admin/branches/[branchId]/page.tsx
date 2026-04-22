"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api as _api } from "@/convex/_generated/api";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = _api as any;
import type { Id } from "@/convex/_generated/dataModel";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Building2,
  Users,
  Pencil,
  Plus,
  UserCheck,
  XCircle,
  KeyRound,
} from "lucide-react";
import Link from "next/link";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";

// ─── constants ────────────────────────────────────────────────────────────────

const TIMEZONE_OPTIONS = [
  { value: "none", label: "Default (System)" },
  { value: "Asia/Manila", label: "Philippine Standard Time (UTC+8)" },
] as const;

const CLASSIFICATION_OPTIONS = [
  { value: "none", label: "No Classification" },
  { value: "premium", label: "Premium" },
  { value: "aclass", label: "A-Class" },
  { value: "bnc", label: "BNC" },
  { value: "outlet", label: "Outlet" },
] as const;

const CLASSIFICATION_LABELS: Record<string, string> = {
  premium: "Premium",
  aclass: "A-Class",
  bnc: "BNC",
  outlet: "Outlet",
};

const CLASSIFICATION_COLORS: Record<string, string> = {
  premium: "bg-purple-100 text-purple-800",
  aclass: "bg-blue-100 text-blue-800",
  bnc: "bg-green-100 text-green-800",
  outlet: "bg-amber-100 text-amber-800",
};

const CHANNEL_OPTIONS = [
  { value: "none", label: "No Channel" },
  { value: "inline", label: "Inline" },
  { value: "online", label: "Online" },
  { value: "outlet", label: "Outlet" },
  { value: "popup", label: "Popup" },
  { value: "dtc", label: "Direct To Consumer (DTC)" },
  { value: "warehouse", label: "Warehouse" },
  { value: "outright", label: "Outright" },
] as const;

const CHANNEL_LABELS: Record<string, string> = {
  inline: "Inline",
  online: "Online",
  outlet: "Outlet",
  popup: "Popup",
  dtc: "Direct To Consumer (DTC)",
  warehouse: "Warehouse",
  outright: "Outright",
};

const CHANNEL_COLORS: Record<string, string> = {
  inline: "bg-cyan-100 text-cyan-800",
  online: "bg-indigo-100 text-indigo-800",
  outlet: "bg-amber-100 text-amber-800",
  popup: "bg-pink-100 text-pink-800",
  dtc: "bg-teal-100 text-teal-800",
  warehouse: "bg-slate-100 text-slate-800",
  outright: "bg-orange-100 text-orange-800",
};

type Tab = "details" | "cashiers";

// ─── CashiersTab ─────────────────────────────────────────────────────────────

type CashierAccount = {
  _id: Id<"cashierAccounts">;
  branchId: Id<"branches">;
  firstName: string;
  lastName: string;
  username: string;
  isActive: boolean;
  createdAt: number;
};

type CashierForm = {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
  confirmPassword: string;
};

const emptyCashierForm = (): CashierForm => ({
  firstName: "",
  lastName: "",
  username: "",
  password: "",
  confirmPassword: "",
});

function CashiersTab({ branchId }: { branchId: Id<"branches"> }) {
  const accounts = useQuery(api.admin.cashierAccounts.listByBranch, {
    branchId,
    includeInactive: true,
  });

  const createAccount = useAction(api.admin.cashierAccountsActions.createCashierAccount);
  const updateAccount = useMutation(api.admin.cashierAccounts.updateCashierAccount);
  const resetPassword = useAction(api.admin.cashierAccountsActions.resetPassword);
  const deactivate = useMutation(api.admin.cashierAccounts.deactivateCashierAccount);
  const reactivate = useMutation(api.admin.cashierAccounts.reactivateCashierAccount);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<CashierAccount | null>(null);
  const [resetTarget, setResetTarget] = useState<CashierAccount | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [createForm, setCreateForm] = useState<CashierForm>(emptyCashierForm());
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", username: "" });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const [showInactive, setShowInactive] = useState(false);
  const filtered = (accounts ?? [] as CashierAccount[]).filter((a: CashierAccount) => showInactive || a.isActive);
  const pagination = usePagination(filtered);

  const validateCreateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!createForm.firstName.trim()) errors.firstName = "Required";
    if (!createForm.lastName.trim()) errors.lastName = "Required";
    if (!createForm.username.trim()) errors.username = "Required";
    if (createForm.password.length < 6) errors.password = "At least 6 characters";
    if (createForm.password !== createForm.confirmPassword)
      errors.confirmPassword = "Passwords do not match";
    setCreateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateCreateForm()) return;
    setIsSubmitting(true);
    try {
      await createAccount({
        branchId,
        firstName: createForm.firstName,
        lastName: createForm.lastName,
        username: createForm.username,
        password: createForm.password,
      });
      toast.success("Cashier account created");
      setShowCreateDialog(false);
      setCreateForm(emptyCashierForm());
      setCreateErrors({});
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingAccount) return;
    const errors: Record<string, string> = {};
    if (!editForm.firstName.trim()) errors.firstName = "Required";
    if (!editForm.lastName.trim()) errors.lastName = "Required";
    if (!editForm.username.trim()) errors.username = "Required";
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      await updateAccount({
        accountId: editingAccount._id,
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        username: editForm.username,
      });
      toast.success("Account updated");
      setEditingAccount(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setIsSubmitting(true);
    try {
      await resetPassword({ accountId: resetTarget._id, newPassword });
      toast.success("Password reset successfully");
      setResetTarget(null);
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (account: CashierAccount) => {
    try {
      if (account.isActive) {
        await deactivate({ accountId: account._id });
        toast.success(`${account.firstName} deactivated`);
      } else {
        await reactivate({ accountId: account._id });
        toast.success(`${account.firstName} reactivated`);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-medium">Cashier Accounts</h3>
          <button
            onClick={() => setShowInactive((v) => !v)}
            className="text-xs text-muted-foreground underline underline-offset-2"
          >
            {showInactive ? "Hide inactive" : "Show inactive"}
          </button>
        </div>
        <Button size="sm" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Cashier
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts === undefined ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : pagination.paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No cashier accounts yet. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              (pagination.paginatedData as CashierAccount[]).map((account) => (
                <TableRow key={account._id} className={!account.isActive ? "opacity-50" : ""}>
                  <TableCell className="font-medium">
                    {account.firstName} {account.lastName}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{account.username}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        account.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-500"
                      }
                    >
                      {account.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit"
                        onClick={() => {
                          setEditingAccount(account);
                          setEditForm({
                            firstName: account.firstName,
                            lastName: account.lastName,
                            username: account.username,
                          });
                          setEditErrors({});
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Reset password"
                        onClick={() => {
                          setResetTarget(account);
                          setNewPassword("");
                          setConfirmNewPassword("");
                        }}
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={account.isActive ? "Deactivate" : "Reactivate"}
                        onClick={() => handleToggleActive(account)}
                      >
                        {account.isActive ? (
                          <XCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <UserCheck className="h-4 w-4 text-green-600" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        totalItems={filtered.length}
        hasNextPage={pagination.hasNextPage}
        hasPrevPage={pagination.hasPrevPage}
        onNextPage={pagination.nextPage}
        onPrevPage={pagination.prevPage}
        noun="cashier"
      />

      {/* Create dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Cashier Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>First Name</Label>
                <Input
                  value={createForm.firstName}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, firstName: e.target.value }))
                  }
                  placeholder="Juan"
                />
                {createErrors.firstName && (
                  <p className="text-xs text-red-500">{createErrors.firstName}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Last Name</Label>
                <Input
                  value={createForm.lastName}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, lastName: e.target.value }))
                  }
                  placeholder="Dela Cruz"
                />
                {createErrors.lastName && (
                  <p className="text-xs text-red-500">{createErrors.lastName}</p>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Username</Label>
              <Input
                value={createForm.username}
                onChange={(e) =>
                  setCreateForm((p) => ({ ...p, username: e.target.value }))
                }
                placeholder="juan.delacruz"
                autoComplete="off"
              />
              {createErrors.username && (
                <p className="text-xs text-red-500">{createErrors.username}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <Input
                type="password"
                value={createForm.password}
                onChange={(e) =>
                  setCreateForm((p) => ({ ...p, password: e.target.value }))
                }
                placeholder="Min. 6 characters"
                autoComplete="new-password"
              />
              {createErrors.password && (
                <p className="text-xs text-red-500">{createErrors.password}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Confirm Password</Label>
              <Input
                type="password"
                value={createForm.confirmPassword}
                onChange={(e) =>
                  setCreateForm((p) => ({ ...p, confirmPassword: e.target.value }))
                }
                placeholder="Repeat password"
                autoComplete="new-password"
              />
              {createErrors.confirmPassword && (
                <p className="text-xs text-red-500">{createErrors.confirmPassword}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingAccount} onOpenChange={() => setEditingAccount(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Cashier Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>First Name</Label>
                <Input
                  value={editForm.firstName}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, firstName: e.target.value }))
                  }
                />
                {editErrors.firstName && (
                  <p className="text-xs text-red-500">{editErrors.firstName}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Last Name</Label>
                <Input
                  value={editForm.lastName}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, lastName: e.target.value }))
                  }
                />
                {editErrors.lastName && (
                  <p className="text-xs text-red-500">{editErrors.lastName}</p>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Username</Label>
              <Input
                value={editForm.username}
                onChange={(e) =>
                  setEditForm((p) => ({ ...p, username: e.target.value }))
                }
              />
              {editErrors.username && (
                <p className="text-xs text-red-500">{editErrors.username}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAccount(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog
        open={!!resetTarget}
        onOpenChange={() => {
          setResetTarget(null);
          setNewPassword("");
          setConfirmNewPassword("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reset Password — {resetTarget?.firstName} {resetTarget?.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 6 characters"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1">
              <Label>Confirm New Password</Label>
              <Input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Repeat password"
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleResetPassword} disabled={isSubmitting}>
              {isSubmitting ? "Resetting..." : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── DetailsTab ───────────────────────────────────────────────────────────────

function DetailsTab({ branchId }: { branchId: Id<"branches"> }) {
  const branch = useQuery(api.auth.branches.getBranchById, { branchId });
  const updateBranch = useMutation(api.auth.branches.updateBranch);
  const deactivateBranch = useMutation(api.auth.branches.deactivateBranch);
  const reactivateBranch = useMutation(api.auth.branches.reactivateBranch);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
    channel: "none",
    classification: "none",
    latitude: "",
    longitude: "",
    timezone: "none",
    openTime: "",
    closeTime: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);

  // Initialize form from branch data
  if (branch && !initialized) {
    setForm({
      name: branch.name,
      address: branch.address,
      phone: branch.phone ?? "",
      channel: branch.channel ?? "none",
      classification: branch.classification ?? "none",
      latitude: branch.latitude?.toString() ?? "",
      longitude: branch.longitude?.toString() ?? "",
      timezone: branch.configuration?.timezone ?? "none",
      openTime: branch.configuration?.businessHours?.openTime ?? "",
      closeTime: branch.configuration?.businessHours?.closeTime ?? "",
    });
    setInitialized(true);
  }

  const updateField = (field: string, value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (errors[field]) setErrors((p) => { const n = { ...p }; delete n[field]; return n; });
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.address.trim()) e.address = "Address is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await updateBranch({
        branchId,
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim() || undefined,
        channel: form.channel !== "none"
          ? (form.channel as "inline" | "online" | "outlet" | "popup" | "dtc" | "warehouse" | "outright")
          : undefined,
        classification:
          form.classification !== "none"
            ? (form.classification as "premium" | "aclass" | "bnc" | "outlet")
            : undefined,
        latitude: form.latitude ? parseFloat(form.latitude) : undefined,
        longitude: form.longitude ? parseFloat(form.longitude) : undefined,
        configuration: {
          timezone: form.timezone !== "none" ? form.timezone : undefined,
          businessHours:
            form.openTime && form.closeTime
              ? { openTime: form.openTime, closeTime: form.closeTime }
              : undefined,
        },
      });
      toast.success("Branch updated");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async () => {
    if (!branch) return;
    try {
      if (branch.isActive) {
        await deactivateBranch({ branchId });
        toast.success("Branch deactivated");
      } else {
        await reactivateBranch({ branchId });
        toast.success("Branch reactivated");
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (branch === undefined) {
    return <p className="text-muted-foreground text-sm">Loading...</p>;
  }
  if (!branch) {
    return <p className="text-muted-foreground text-sm">Branch not found.</p>;
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1">
          <Label>Branch Name</Label>
          <Input
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
          />
          {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
        </div>
        <div className="col-span-2 space-y-1">
          <Label>Address</Label>
          <Input
            value={form.address}
            onChange={(e) => updateField("address", e.target.value)}
          />
          {errors.address && <p className="text-xs text-red-500">{errors.address}</p>}
        </div>
        <div className="space-y-1">
          <Label>Phone</Label>
          <Input
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div className="space-y-1">
          <Label>Channel</Label>
          <Select value={form.channel} onValueChange={(v) => updateField("channel", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNEL_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Classification</Label>
          <Select
            value={form.classification}
            onValueChange={(v) => updateField("classification", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLASSIFICATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Timezone</Label>
          <Select value={form.timezone} onValueChange={(v) => updateField("timezone", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Open Time</Label>
          <Input
            type="time"
            value={form.openTime}
            onChange={(e) => updateField("openTime", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Close Time</Label>
          <Input
            type="time"
            value={form.closeTime}
            onChange={(e) => updateField("closeTime", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Latitude</Label>
          <Input
            type="number"
            value={form.latitude}
            onChange={(e) => updateField("latitude", e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div className="space-y-1">
          <Label>Longitude</Label>
          <Input
            type="number"
            value={form.longitude}
            onChange={(e) => updateField("longitude", e.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
        <Button
          variant="outline"
          onClick={handleToggleActive}
          className={
            branch.isActive ? "text-red-600 hover:text-red-700" : "text-green-600 hover:text-green-700"
          }
        >
          {branch.isActive ? (
            <>
              <XCircle className="h-4 w-4 mr-1" />
              Deactivate Branch
            </>
          ) : (
            <>
              <UserCheck className="h-4 w-4 mr-1" />
              Reactivate Branch
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BranchDetailPage() {
  const params = useParams();
  const branchId = params.branchId as Id<"branches">;
  const branch = useQuery(api.auth.branches.getBranchById, { branchId });
  const [activeTab, setActiveTab] = useState<Tab>("details");

  if (branch === undefined) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }
  if (!branch) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <p className="text-muted-foreground">Branch not found.</p>
        <Link href="/admin/branches">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Branches
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/branches">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">{branch.name}</h1>
          <Badge
            variant="secondary"
            className={
              branch.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"
            }
          >
            {branch.isActive ? "Active" : "Inactive"}
          </Badge>
          {branch.classification && (
            <Badge
              variant="secondary"
              className={CLASSIFICATION_COLORS[branch.classification] ?? ""}
            >
              {CLASSIFICATION_LABELS[branch.classification] ?? branch.classification}
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-0">
          {(
            [
              { id: "details", label: "Details", icon: Building2 },
              { id: "cashiers", label: "Cashiers", icon: Users },
            ] as { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[]
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "details" && <DetailsTab branchId={branchId} />}
        {activeTab === "cashiers" && <CashiersTab branchId={branchId} />}
      </div>
    </div>
  );
}

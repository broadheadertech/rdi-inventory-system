"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { getErrorMessage, cn } from "@/lib/utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { UserCheck, Plus, Pencil, Power, PowerOff, TrendingUp, Trophy } from "lucide-react";

type FA = {
  _id: Id<"fashionAssistants">;
  name: string;
  employeeCode?: string;
  isActive: boolean;
  createdAt: number;
};

// ─── Date Preset helpers ─────────────────────────────────────────────────────

type DatePreset = "today" | "weekly" | "monthly";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "weekly", label: "This Week" },
  { value: "monthly", label: "This Month" },
];

function getPresetMs(preset: DatePreset): { startMs: number; endMs: number } {
  const PHT = 8 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const nowPht = nowMs + PHT;
  const todayMidnightPht = nowPht - (nowPht % (24 * 60 * 60 * 1000));
  const todayStartMs = todayMidnightPht - PHT;

  if (preset === "today") {
    return { startMs: todayStartMs, endMs: nowMs };
  }
  if (preset === "weekly") {
    const dow = new Date(nowPht).getUTCDay();
    const daysSinceMon = dow === 0 ? 6 : dow - 1;
    return { startMs: todayStartMs - daysSinceMon * 86400000, endMs: nowMs };
  }
  // monthly
  const d = new Date(nowPht);
  return { startMs: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - PHT, endMs: nowMs };
}

function formatCentavos(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ─── Performance Section ─────────────────────────────────────────────────────

function PerformanceSection() {
  const [preset, setPreset] = useState<DatePreset>("weekly");
  const { startMs, endMs } = useMemo(() => getPresetMs(preset), [preset]);

  const performance = useQuery(api.pos.fashionAssistants.getPerformance, {
    startMs,
    endMs,
  });

  const totals = useMemo(() => {
    if (!performance) return { txns: 0, items: 0, revenue: 0 };
    return {
      txns: performance.reduce((s, r) => s + r.transactionCount, 0),
      items: performance.reduce((s, r) => s + r.itemsSold, 0),
      revenue: performance.reduce((s, r) => s + r.revenueCentavos, 0),
    };
  }, [performance]);

  const topPerformer = performance?.find((p) => p.revenueCentavos > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Sales Performance</h2>
        </div>
        <div className="flex gap-1">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPreset(p.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                preset === p.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">Total Transactions</p>
          <p className="text-2xl font-bold">{totals.txns}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">Items Sold</p>
          <p className="text-2xl font-bold">{totals.items}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">Total Sales</p>
          <p className="text-2xl font-bold">{formatCentavos(totals.revenue)}</p>
        </div>
      </div>

      {/* Top performer callout */}
      {topPerformer && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <Trophy className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Top Performer: {topPerformer.name}
            </p>
            <p className="text-xs text-amber-700">
              {formatCentavos(topPerformer.revenueCentavos)} revenue &middot; {topPerformer.itemsSold} items &middot; {topPerformer.transactionCount} transactions
            </p>
          </div>
        </div>
      )}

      {/* Performance table */}
      {performance === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : performance.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No fashion assistants found.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Assistant</TableHead>
                <TableHead className="text-right">Transactions</TableHead>
                <TableHead className="text-right">Items Sold</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Avg / Txn</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {performance.map((fa, i) => {
                const avgPerTxn = fa.transactionCount > 0
                  ? fa.revenueCentavos / fa.transactionCount
                  : 0;
                return (
                  <TableRow
                    key={String(fa._id)}
                    className={cn(!fa.isActive && "opacity-50")}
                  >
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{fa.name}</span>
                        {!fa.isActive && (
                          <Badge variant="outline" className="text-[10px] text-gray-400 border-gray-300">
                            Inactive
                          </Badge>
                        )}
                        {fa.employeeCode && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {fa.employeeCode}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {fa.transactionCount}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {fa.itemsSold}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCentavos(fa.revenueCentavos)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {formatCentavos(Math.round(avgPerTxn))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function FashionAssistantsPage() {
  const currentUser = useQuery(api.auth.users.getCurrentUser);
  const fashionAssistants = useQuery(api.pos.fashionAssistants.listAll);
  const createFA = useMutation(api.pos.fashionAssistants.create);
  const updateFA = useMutation(api.pos.fashionAssistants.update);
  const setActive = useMutation(api.pos.fashionAssistants.setActive);

  // Add/edit dialog state
  const [editTarget, setEditTarget] = useState<FA | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [saving, setSaving] = useState(false);

  // Deactivate confirm
  const [toggleTarget, setToggleTarget] = useState<FA | null>(null);

  const isManager = currentUser?.role === "admin" || currentUser?.role === "manager";

  function openAdd() {
    setEditTarget(null);
    setFormName("");
    setFormCode("");
    setShowForm(true);
  }

  function openEdit(fa: FA) {
    setEditTarget(fa);
    setFormName(fa.name);
    setFormCode(fa.employeeCode ?? "");
    setShowForm(true);
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      if (editTarget) {
        await updateFA({ id: editTarget._id, name: formName.trim(), employeeCode: formCode.trim() || undefined });
        toast.success("Fashion assistant updated");
      } else {
        await createFA({ name: formName.trim(), employeeCode: formCode.trim() || undefined });
        toast.success("Fashion assistant added");
      }
      setShowForm(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!toggleTarget) return;
    try {
      await setActive({ id: toggleTarget._id, isActive: !toggleTarget.isActive });
      toast.success(toggleTarget.isActive ? "Deactivated" : "Reactivated");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setToggleTarget(null);
    }
  }

  if (!isManager) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <UserCheck className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          Only managers can manage fashion assistants.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Performance Section ── */}
      <PerformanceSection />

      {/* ── Management Section ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Manage Assistants</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Add, edit, or deactivate floor staff. Selected at POS for incentive tracking.
            </p>
          </div>
          <Button onClick={openAdd} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-lg border overflow-hidden">
          {fashionAssistants === undefined ? (
            <div className="p-8 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : fashionAssistants.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-12 text-sm text-muted-foreground">
              <UserCheck className="h-10 w-10" />
              <p>No fashion assistants yet. Add one to start tracking.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Employee Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fashionAssistants.map((fa) => (
                  <TableRow key={String(fa._id)} className={cn(!fa.isActive && "opacity-50")}>
                    <TableCell className="font-medium">{fa.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {fa.employeeCode ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          fa.isActive
                            ? "text-green-600 border-green-500/30 bg-green-500/10"
                            : "text-gray-400 border-gray-300"
                        )}
                      >
                        {fa.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(fa.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(fa as FA)}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-8 w-8",
                            fa.isActive ? "text-destructive hover:text-destructive" : "text-green-600 hover:text-green-600"
                          )}
                          onClick={() => setToggleTarget(fa as FA)}
                          title={fa.isActive ? "Deactivate" : "Reactivate"}
                        >
                          {fa.isActive
                            ? <PowerOff className="h-3.5 w-3.5" />
                            : <Power className="h-3.5 w-3.5" />
                          }
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Edit Fashion Assistant" : "Add Fashion Assistant"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Maria Santos"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
            </div>
            <div className="space-y-2">
              <Label>Employee Code <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input
                placeholder="e.g. FA-001"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formName.trim() || saving}>
              {saving ? "Saving..." : editTarget ? "Save Changes" : "Add Assistant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate / Reactivate confirm */}
      <Dialog open={!!toggleTarget} onOpenChange={(open: boolean) => { if (!open) setToggleTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {toggleTarget?.isActive ? "Deactivate" : "Reactivate"} {toggleTarget?.name}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {toggleTarget?.isActive
              ? "This assistant will no longer appear in the POS selector."
              : "This assistant will appear again in the POS selector."}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToggleTarget(null)}>Cancel</Button>
            <Button
              variant={toggleTarget?.isActive ? "destructive" : "default"}
              onClick={handleToggleActive}
            >
              {toggleTarget?.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

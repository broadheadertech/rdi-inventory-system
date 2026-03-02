"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { cn, relativeTime } from "@/lib/utils";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ConfidenceBadge({
  confidence,
}: {
  confidence: "high" | "medium" | "low";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        confidence === "high" && "bg-green-100 text-green-800",
        confidence === "medium" && "bg-amber-100 text-amber-800",
        confidence === "low" && "bg-gray-100 text-gray-800"
      )}
    >
      {confidence.charAt(0).toUpperCase() + confidence.slice(1)}
    </span>
  );
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b animate-pulse">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 rounded bg-muted w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HQRestockPage() {
  const suggestions = useQuery(api.ai.restockSuggestions.listActiveSuggestions, {});
  const acceptMut = useMutation(api.ai.restockSuggestions.acceptSuggestion);
  const dismissMut = useMutation(api.ai.restockSuggestions.dismissSuggestion);

  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<{
    _id: Id<"restockSuggestions">;
    variantId: Id<"variants">;
    branchId: Id<"branches">;
    branchName: string;
    styleName: string;
    sku: string;
    size: string;
    color: string;
    suggestedQuantity: number;
    rationale: string;
  } | null>(null);
  const [selectedFromBranch, setSelectedFromBranch] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterBranch, setFilterBranch] = useState<string>("all");

  // Source branches query — only active when accept dialog is open
  const branchesWithStock = useQuery(
    api.ai.restockSuggestions.getBranchesWithStock,
    selectedSuggestion ? { variantId: selectedSuggestion.variantId } : "skip"
  );

  // Filter out the target branch from source options
  const sourceBranches = branchesWithStock?.filter(
    (b) =>
      selectedSuggestion &&
      (b.branchId as string) !== (selectedSuggestion.branchId as string)
  );

  // Compute summary metrics
  const totalActive = suggestions?.length ?? 0;
  const highConfidence =
    suggestions?.filter((s) => s.confidence === "high").length ?? 0;
  const avgDaysLeft =
    totalActive > 0
      ? Math.round(
          (suggestions?.reduce((sum, s) => sum + s.daysUntilStockout, 0) ?? 0) /
            totalActive
        )
      : 0;

  // Get unique branches for filter dropdown
  const uniqueBranches = suggestions
    ? [...new Map(suggestions.map((s) => [s.branchId, s.branchName])).entries()]
    : [];

  // Apply branch filter
  const filtered =
    filterBranch === "all"
      ? suggestions
      : suggestions?.filter((s) => (s.branchId as string) === filterBranch);

  const pagination = usePagination(filtered);

  function openAcceptDialog(suggestion: NonNullable<typeof selectedSuggestion>) {
    setSelectedSuggestion(suggestion);
    setSelectedFromBranch("");
    setError(null);
    setAcceptDialogOpen(true);
  }

  function openDismissDialog(suggestion: NonNullable<typeof selectedSuggestion>) {
    setSelectedSuggestion(suggestion);
    setError(null);
    setDismissDialogOpen(true);
  }

  function handleAccept() {
    if (!selectedSuggestion || !selectedFromBranch) return;
    setSubmitting(true);
    setError(null);
    acceptMut({
      suggestionId: selectedSuggestion._id,
      fromBranchId: selectedFromBranch as Id<"branches">,
    }).then(
      () => {
        setSubmitting(false);
        setAcceptDialogOpen(false);
        setSelectedSuggestion(null);
      },
      (err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to accept suggestion."
        );
        setSubmitting(false);
      }
    );
  }

  function handleDismiss() {
    if (!selectedSuggestion) return;
    setSubmitting(true);
    setError(null);
    dismissMut({ suggestionId: selectedSuggestion._id }).then(
      () => {
        setSubmitting(false);
        setDismissDialogOpen(false);
        setSelectedSuggestion(null);
      },
      (err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to dismiss suggestion."
        );
        setSubmitting(false);
      }
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Restock Suggestions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Data-driven restocking recommendations based on 14-day sales velocity
        </p>
      </div>

      {/* ── Summary Metrics ────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Active Suggestions</p>
          <p className="text-2xl font-bold mt-1">
            {suggestions === undefined ? "—" : totalActive}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">High Confidence</p>
          <p className="text-2xl font-bold mt-1 text-green-700">
            {suggestions === undefined ? "—" : highConfidence}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Avg Days Until Stockout
          </p>
          <p className="text-2xl font-bold mt-1 text-amber-700">
            {suggestions === undefined ? "—" : avgDaysLeft}
          </p>
        </div>
      </div>

      {/* ── Filter ─────────────────────────────────────────────────────── */}
      {uniqueBranches.length > 1 && (
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">
            Filter by branch:
          </label>
          <Select value={filterBranch} onValueChange={setFilterBranch}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {uniqueBranches.map(([id, name]) => (
                <SelectItem key={id} value={id as string}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── Suggestions Table ──────────────────────────────────────────── */}
      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Branch
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Product
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  SKU
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                  Stock
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                  Velocity
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                  Days Left
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                  Suggested Qty
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Confidence
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {suggestions === undefined && <SkeletonRows cols={9} />}

              {suggestions !== undefined &&
                (filtered?.length ?? 0) === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      {totalActive === 0
                        ? "No restock suggestions — the system needs 14+ days of sales data to generate recommendations."
                        : "No suggestions match the selected filter."}
                    </td>
                  </tr>
                )}

              {pagination.paginatedData.map((s) => (
                <tr key={s._id} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{s.branchName}</td>
                  <td className="px-4 py-3">
                    <div>
                      {s.styleName}
                      <span className="text-muted-foreground ml-1">
                        {s.size} / {s.color}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{s.sku}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {s.currentStock}
                    {s.incomingStock > 0 && (
                      <span className="text-muted-foreground text-xs ml-1">
                        (+{s.incomingStock})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {s.avgDailyVelocity}/day
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right tabular-nums font-medium",
                      s.daysUntilStockout <= 2 && "text-red-600",
                      s.daysUntilStockout > 2 &&
                        s.daysUntilStockout <= 5 &&
                        "text-amber-600"
                    )}
                  >
                    {s.daysUntilStockout}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {s.suggestedQuantity}
                  </td>
                  <td className="px-4 py-3">
                    <ConfidenceBadge confidence={s.confidence} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-green-200 text-green-700 hover:bg-green-50"
                        onClick={() =>
                          openAcceptDialog({
                            _id: s._id,
                            variantId: s.variantId,
                            branchId: s.branchId,
                            branchName: s.branchName,
                            styleName: s.styleName,
                            sku: s.sku,
                            size: s.size,
                            color: s.color,
                            suggestedQuantity: s.suggestedQuantity,
                            rationale: s.rationale,
                          })
                        }
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          openDismissDialog({
                            _id: s._id,
                            variantId: s.variantId,
                            branchId: s.branchId,
                            branchName: s.branchName,
                            styleName: s.styleName,
                            sku: s.sku,
                            size: s.size,
                            color: s.color,
                            suggestedQuantity: s.suggestedQuantity,
                            rationale: s.rationale,
                          })
                        }
                      >
                        Dismiss
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          hasNextPage={pagination.hasNextPage}
          hasPrevPage={pagination.hasPrevPage}
          onNextPage={pagination.nextPage}
          onPrevPage={pagination.prevPage}
          noun="suggestion"
        />
      </div>

      {/* ── Generated At ───────────────────────────────────────────────── */}
      {suggestions && suggestions.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          Last generated {relativeTime(suggestions[0].generatedAt)}
        </p>
      )}

      {/* ── Accept Dialog ──────────────────────────────────────────────── */}
      <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Accept Restock Suggestion</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {selectedSuggestion && (
              <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                <p>
                  <span className="font-medium">Product:</span>{" "}
                  {selectedSuggestion.styleName} — {selectedSuggestion.size} /{" "}
                  {selectedSuggestion.color}
                </p>
                <p>
                  <span className="font-medium">Target Branch:</span>{" "}
                  {selectedSuggestion.branchName}
                </p>
                <p>
                  <span className="font-medium">Quantity:</span>{" "}
                  {selectedSuggestion.suggestedQuantity} units
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  {selectedSuggestion.rationale}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Source Branch (ships from)
              </label>
              <Select
                value={selectedFromBranch}
                onValueChange={setSelectedFromBranch}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source branch..." />
                </SelectTrigger>
                <SelectContent>
                  {sourceBranches === undefined && (
                    <SelectItem value="__loading" disabled>
                      Loading branches...
                    </SelectItem>
                  )}
                  {sourceBranches?.length === 0 && (
                    <SelectItem value="__none" disabled>
                      No branches have stock of this variant
                    </SelectItem>
                  )}
                  {sourceBranches?.map((branch) => (
                    <SelectItem
                      key={branch.branchId}
                      value={branch.branchId as string}
                    >
                      {branch.branchName} ({branch.availableQuantity} available)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAcceptDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAccept}
              disabled={!selectedFromBranch || submitting}
            >
              {submitting ? "Creating Transfer..." : "Create Transfer Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dismiss Confirmation Dialog ────────────────────────────────── */}
      <Dialog open={dismissDialogOpen} onOpenChange={setDismissDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Dismiss Suggestion</DialogTitle>
          </DialogHeader>

          <div className="py-2">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to dismiss this restock suggestion for{" "}
              <span className="font-medium text-foreground">
                {selectedSuggestion?.styleName} ({selectedSuggestion?.sku})
              </span>{" "}
              at{" "}
              <span className="font-medium text-foreground">
                {selectedSuggestion?.branchName}
              </span>
              ?
            </p>
            {error && (
              <p className="text-sm text-destructive mt-2">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDismissDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDismiss}
              disabled={submitting}
            >
              {submitting ? "Dismissing..." : "Dismiss"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

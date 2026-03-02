"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCentavos(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function relativeDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

// ─── Proposal Form ───────────────────────────────────────────────────────────

interface ProposalItem {
  description: string;
  sku: string;
  quantity: number;
  unitPriceCentavos: number;
}

function ProposalForm({
  brands,
  onSubmitted,
}: {
  brands: string[];
  onSubmitted: () => void;
}) {
  const submitProposal = useMutation(api.suppliers.portal.submitProposal);
  const [brand, setBrand] = useState(brands[0] ?? "");
  const [items, setItems] = useState<ProposalItem[]>([
    { description: "", sku: "", quantity: 1, unitPriceCentavos: 0 },
  ]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addItem() {
    setItems([
      ...items,
      { description: "", sku: "", quantity: 1, unitPriceCentavos: 0 },
    ]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof ProposalItem, value: string | number) {
    setItems(
      items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  }

  const total = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceCentavos,
    0
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validItems = items.filter((item) => item.description.trim());
    if (validItems.length === 0) {
      setError("Add at least one item with a description.");
      return;
    }

    setSubmitting(true);
    try {
      await submitProposal({
        brand,
        items: validItems.map((item) => ({
          description: item.description.trim(),
          sku: item.sku.trim() || undefined,
          quantity: item.quantity,
          unitPriceCentavos: item.unitPriceCentavos,
        })),
        notes: notes.trim() || undefined,
      });
      // Reset form
      setItems([{ description: "", sku: "", quantity: 1, unitPriceCentavos: 0 }]);
      setNotes("");
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit proposal");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">Brand</label>
        <select
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="rounded border px-3 py-1.5 text-sm"
        >
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_100px_80px_120px_40px] gap-2 text-xs font-medium text-muted-foreground">
          <span>Description</span>
          <span>SKU</span>
          <span>Qty</span>
          <span>Unit Price</span>
          <span />
        </div>
        {items.map((item, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_100px_80px_120px_40px] gap-2"
          >
            <input
              type="text"
              placeholder="Item description"
              value={item.description}
              onChange={(e) => updateItem(i, "description", e.target.value)}
              className="rounded border px-2 py-1.5 text-sm"
            />
            <input
              type="text"
              placeholder="SKU"
              value={item.sku}
              onChange={(e) => updateItem(i, "sku", e.target.value)}
              className="rounded border px-2 py-1.5 text-sm"
            />
            <input
              type="number"
              min={1}
              value={item.quantity}
              onChange={(e) =>
                updateItem(i, "quantity", parseInt(e.target.value) || 1)
              }
              className="rounded border px-2 py-1.5 text-sm"
            />
            <input
              type="number"
              min={0}
              step={100}
              placeholder="centavos"
              value={item.unitPriceCentavos}
              onChange={(e) =>
                updateItem(
                  i,
                  "unitPriceCentavos",
                  parseInt(e.target.value) || 0
                )
              }
              className="rounded border px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="text-red-500 hover:text-red-700 text-sm"
              disabled={items.length <= 1}
            >
              X
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          className="text-sm text-primary hover:underline"
        >
          + Add item
        </button>
      </div>

      <div>
        <label className="text-sm font-medium">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
          placeholder="Volume discount, lead time, delivery terms..."
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          Total: {formatCentavos(total)}
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Proposal"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SupplierPortalPage() {
  const currentUser = useQuery(api.auth.users.getCurrentUser);
  const demandSummary = useQuery(api.suppliers.portal.getSupplierDemandSummary);
  const stockLevels = useQuery(
    api.suppliers.portal.getSupplierBrandStockLevels
  );
  const demandLogs = useQuery(api.suppliers.portal.getSupplierDemandLogs);
  const myProposals = useQuery(api.suppliers.portal.getMyProposals);

  const [activeTab, setActiveTab] = useState<
    "demand" | "stock" | "logs" | "proposal" | "proposals"
  >("demand");

  // Use user's assignedBrands for proposal form (not demand-derived)
  const supplierBrands = currentUser?.assignedBrands ?? [];

  const [proposalKey, setProposalKey] = useState(0);

  const demandPagination = usePagination(demandSummary);
  const stockPagination = usePagination(stockLevels);
  const logsPagination = usePagination(demandLogs);

  const tabs = [
    { key: "demand" as const, label: "Demand Summary" },
    { key: "stock" as const, label: "Stock Levels" },
    { key: "logs" as const, label: "Demand Logs" },
    { key: "proposal" as const, label: "New Proposal" },
    { key: "proposals" as const, label: "My Proposals" },
  ];

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Supplier Portal
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View demand signals and submit stock proposals
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {tab.key === "proposals" &&
              myProposals &&
              myProposals.filter((p) => p.status === "pending").length > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                  {myProposals.filter((p) => p.status === "pending").length}
                </span>
              )}
          </button>
        ))}
      </div>

      {/* ── Demand Summary Tab ── */}
      {activeTab === "demand" && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold">
            Weekly Demand Summary (Last 4 Weeks)
          </h2>
          {demandSummary === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-lg bg-muted"
                />
              ))}
            </div>
          ) : demandSummary.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No demand data available for your brands.
            </p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Week</th>
                    <th className="px-4 py-2 text-left font-medium">Brand</th>
                    <th className="px-4 py-2 text-right font-medium">
                      Requests
                    </th>
                    <th className="px-4 py-2 text-left font-medium">
                      Top Designs
                    </th>
                    <th className="px-4 py-2 text-left font-medium">
                      Top Sizes
                    </th>
                    <th className="px-4 py-2 text-left font-medium">
                      Branch Breakdown
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {demandPagination.paginatedData.map((s) => (
                    <tr key={s._id as string} className="hover:bg-muted/30">
                      <td className="px-4 py-2 whitespace-nowrap">
                        {s.weekLabel}
                      </td>
                      <td className="px-4 py-2 font-medium">{s.brand}</td>
                      <td className="px-4 py-2 text-right font-medium">
                        {s.requestCount}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {s.topDesigns
                          .slice(0, 3)
                          .map((d) => `${d.design} (${d.count})`)
                          .join(", ") || "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {s.topSizes
                          .slice(0, 3)
                          .map((sz) => `${sz.size} (${sz.count})`)
                          .join(", ") || "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {s.branchBreakdown
                          .map((b) => `${b.branchName}: ${b.count}`)
                          .join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination
                currentPage={demandPagination.currentPage}
                totalPages={demandPagination.totalPages}
                totalItems={demandPagination.totalItems}
                hasNextPage={demandPagination.hasNextPage}
                hasPrevPage={demandPagination.hasPrevPage}
                onNextPage={demandPagination.nextPage}
                onPrevPage={demandPagination.prevPage}
                noun="summary"
              />
            </div>
          )}
        </section>
      )}

      {/* ── Stock Levels Tab ── */}
      {activeTab === "stock" && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold">
            Stock Levels Across Branches
          </h2>
          {stockLevels === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-lg bg-muted"
                />
              ))}
            </div>
          ) : stockLevels.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No inventory data available for your brands.
            </p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Branch</th>
                    <th className="px-4 py-2 text-left font-medium">Brand</th>
                    <th className="px-4 py-2 text-left font-medium">Style</th>
                    <th className="px-4 py-2 text-left font-medium">SKU</th>
                    <th className="px-4 py-2 text-left font-medium">
                      Size / Color
                    </th>
                    <th className="px-4 py-2 text-right font-medium">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stockPagination.paginatedData.map((item, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-4 py-2">{item.branchName}</td>
                      <td className="px-4 py-2">{item.brandName}</td>
                      <td className="px-4 py-2">{item.styleName}</td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {item.sku}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {item.size} / {item.color}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2 text-right font-medium",
                          item.quantity <= 0
                            ? "text-red-600"
                            : item.quantity <= 5
                              ? "text-amber-600"
                              : "text-foreground"
                        )}
                      >
                        {item.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination
                currentPage={stockPagination.currentPage}
                totalPages={stockPagination.totalPages}
                totalItems={stockPagination.totalItems}
                hasNextPage={stockPagination.hasNextPage}
                hasPrevPage={stockPagination.hasPrevPage}
                onNextPage={stockPagination.nextPage}
                onPrevPage={stockPagination.prevPage}
                noun="item"
              />
            </div>
          )}
        </section>
      )}

      {/* ── Demand Logs Tab ── */}
      {activeTab === "logs" && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold">
            Recent Demand Logs
          </h2>
          {demandLogs === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-lg bg-muted"
                />
              ))}
            </div>
          ) : demandLogs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No demand logs found for your brands.
            </p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Date</th>
                    <th className="px-4 py-2 text-left font-medium">Branch</th>
                    <th className="px-4 py-2 text-left font-medium">Brand</th>
                    <th className="px-4 py-2 text-left font-medium">Design</th>
                    <th className="px-4 py-2 text-left font-medium">Size</th>
                    <th className="px-4 py-2 text-left font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logsPagination.paginatedData.map((log) => (
                    <tr
                      key={log._id as string}
                      className="hover:bg-muted/30"
                    >
                      <td className="px-4 py-2 whitespace-nowrap">
                        {relativeDate(log.createdAt)}
                      </td>
                      <td className="px-4 py-2">{log.branchName}</td>
                      <td className="px-4 py-2 font-medium">{log.brand}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {log.design ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {log.size ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground truncate max-w-[200px]">
                        {log.notes ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination
                currentPage={logsPagination.currentPage}
                totalPages={logsPagination.totalPages}
                totalItems={logsPagination.totalItems}
                hasNextPage={logsPagination.hasNextPage}
                hasPrevPage={logsPagination.hasPrevPage}
                onNextPage={logsPagination.nextPage}
                onPrevPage={logsPagination.prevPage}
                noun="log"
              />
            </div>
          )}
        </section>
      )}

      {/* ── New Proposal Tab ── */}
      {activeTab === "proposal" && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Submit Stock Proposal</h2>
          {supplierBrands.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No brands assigned to your account. Contact the admin.
            </p>
          ) : (
            <div className="rounded-lg border p-4">
              <ProposalForm
                key={proposalKey}
                brands={supplierBrands}
                onSubmitted={() => {
                  setProposalKey((k) => k + 1);
                  setActiveTab("proposals");
                }}
              />
            </div>
          )}
        </section>
      )}

      {/* ── My Proposals Tab ── */}
      {activeTab === "proposals" && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold">My Proposals</h2>
          {myProposals === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-lg bg-muted"
                />
              ))}
            </div>
          ) : myProposals.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No proposals submitted yet.
            </p>
          ) : (
            <div className="space-y-3">
              {myProposals.map((p) => (
                <div
                  key={p._id as string}
                  className="rounded-lg border p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{p.brand}</span>
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-medium",
                          STATUS_STYLES[p.status] ?? ""
                        )}
                      >
                        {p.status}
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {relativeDate(p.createdAt)}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">
                      {p.items.length} item{p.items.length !== 1 ? "s" : ""}
                    </span>
                    <span className="mx-2 text-muted-foreground">|</span>
                    <span className="font-medium">
                      {formatCentavos(p.totalCentavos)}
                    </span>
                  </div>
                  {p.notes && (
                    <p className="text-xs text-muted-foreground">{p.notes}</p>
                  )}
                  {p.reviewNotes && (
                    <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
                      <span className="font-medium">Review notes:</span>{" "}
                      {p.reviewNotes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

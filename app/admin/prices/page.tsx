"use client";

// Prices: every product's base price and what each branch sells it at.
//
// A branch follows the base price until it is given its own; resetting it puts
// it back on the base. One price is edited in place; many are changed at once
// by selecting products and applying a change — a set price, a percentage or
// an amount up or down, or a reset — to the base or to chosen branches.
// convex/admin/prices.ts applies the change with the same arithmetic the
// preview here uses (convex/_helpers/priceMath.ts).

import { useEffect, useMemo, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { History, Loader2, RotateCcw, Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { applyPriceOp, invalidPrice, type PriceOp, type Rounding } from "@/convex/_helpers/priceMath";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, getErrorMessage } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";

const PAGE_SIZE = 50;
// Keeps one mutation's reads and writes well inside Convex's limits.
const MAX_CELLS_PER_CALL = 400;

type OpType = "set" | "increasePct" | "decreasePct" | "increaseAmt" | "decreaseAmt" | "reset";

const OP_LABELS: Record<OpType, string> = {
  set: "Set price to (₱)",
  increasePct: "Increase by %",
  decreasePct: "Decrease by %",
  increaseAmt: "Increase by ₱",
  decreaseAmt: "Decrease by ₱",
  reset: "Reset to base price",
};

const ROUNDING_LABELS: Record<Rounding, string> = {
  none: "No rounding",
  peso: "Nearest peso",
  end9: "Nearest price ending in 9",
};

type EditingCell = { variantId: Id<"variants">; branchId: Id<"branches"> | "base" };

function pesosToCentavos(input: string): number | null {
  const n = Number(input.replace(/[₱,\s]/g, ""));
  return Number.isFinite(n) && input.trim() !== "" ? Math.round(n * 100) : null;
}

function buildOp(opType: OpType, value: string): PriceOp | string {
  if (opType === "reset") return { type: "reset" };
  const n = Number(value.replace(/[₱,%\s]/g, ""));
  if (value.trim() === "" || !Number.isFinite(n) || n <= 0) return "Enter a value above 0.";
  switch (opType) {
    case "set":
      return { type: "set", priceCentavos: Math.round(n * 100) };
    case "increasePct":
      return { type: "percent", percent: n };
    case "decreasePct":
      if (n >= 100) return "A decrease must be less than 100%.";
      return { type: "percent", percent: -n };
    case "increaseAmt":
      return { type: "amount", centavos: Math.round(n * 100) };
    case "decreaseAmt":
      return { type: "amount", centavos: -Math.round(n * 100) };
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export default function PricesPage() {
  const convex = useConvex();
  const options = useQuery(api.admin.prices.getPriceOptions);
  const changePrices = useMutation(api.admin.prices.changePrices);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [brandId, setBrandId] = useState<string>("all");
  const [ownOnly, setOwnOnly] = useState(false);
  const [chosenBranchIds, setChosenBranchIds] = useState<Id<"branches">[] | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const branches = useMemo(() => options?.branches ?? [], [options]);
  const shownBranchIds = chosenBranchIds ?? branches.map((b) => b.id);
  const shownBranches = branches.filter((b) => shownBranchIds.includes(b.id));

  const filters = {
    search: search || undefined,
    brandId: brandId === "all" ? undefined : (brandId as Id<"brands">),
    ownPricesIn: ownOnly ? shownBranchIds : undefined,
  };

  const data = useQuery(
    api.admin.prices.listPriceRows,
    options ? { ...filters, branchIds: shownBranchIds, page, pageSize: PAGE_SIZE } : "skip"
  );
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function toggleBranch(id: Id<"branches">) {
    const next = shownBranchIds.includes(id)
      ? shownBranchIds.filter((b) => b !== id)
      : [...shownBranchIds, id];
    setChosenBranchIds(next);
  }

  // ── Selection ──────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<Id<"variants">>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const selectedCount = allMatching ? total : selected.size;
  const pageAllSelected = rows.length > 0 && rows.every((r) => selected.has(r.variantId));

  function clearSelection() {
    setSelected(new Set());
    setAllMatching(false);
  }

  function toggleRow(id: Id<"variants">) {
    setAllMatching(false);
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setAllMatching(false);
    setSelected((s) => {
      const next = new Set(s);
      for (const r of rows) {
        if (pageAllSelected) next.delete(r.variantId);
        else next.add(r.variantId);
      }
      return next;
    });
  }

  // ── Inline edit ────────────────────────────────────────────────────────────
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingCell, setSavingCell] = useState(false);

  function startEdit(cell: EditingCell, currentCentavos: number) {
    setEditing(cell);
    setEditValue((currentCentavos / 100).toFixed(2));
  }

  async function saveEdit() {
    if (!editing || savingCell) return;
    const cell = editing;
    const centavos = pesosToCentavos(editValue);
    const problem = centavos === null ? "Enter a price." : invalidPrice(centavos);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSavingCell(true);
    try {
      const r = await changePrices({
        variantIds: [cell.variantId],
        target: cell.branchId === "base" ? { kind: "base" } : { kind: "branches", branchIds: [cell.branchId] },
        op: { type: "set", priceCentavos: centavos! },
      });
      if (r.skipped.length > 0) toast.error(r.skipped[0].reason);
      setEditing(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingCell(false);
    }
  }

  async function resetCell(variantId: Id<"variants">, branchId: Id<"branches">) {
    try {
      await changePrices({ variantIds: [variantId], target: { kind: "branches", branchIds: [branchId] }, op: { type: "reset" } });
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  // ── Bulk change ────────────────────────────────────────────────────────────
  const [targetKind, setTargetKind] = useState<"branches" | "base">("branches");
  const [bulkBranchIds, setBulkBranchIds] = useState<Id<"branches">[] | null>(null);
  const [opType, setOpType] = useState<OpType>("increasePct");
  const [opValue, setOpValue] = useState("");
  const [rounding, setRounding] = useState<Rounding>("peso");
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [lastSkipped, setLastSkipped] = useState<
    { sku: string; branchName: string | null; reason: string }[]
  >([]);

  const targetBranchIds = bulkBranchIds ?? shownBranchIds;
  const effectiveOpType: OpType = targetKind === "base" && opType === "reset" ? "set" : opType;
  const op = buildOp(effectiveOpType, opValue);
  const usesRounding = effectiveOpType !== "set" && effectiveOpType !== "reset";

  // What the change does to the first few selected rows on this page.
  const preview = useMemo(() => {
    if (typeof op === "string") return [];
    const firstBranch = targetBranchIds[0];
    return rows
      .filter((r) => allMatching || selected.has(r.variantId))
      .slice(0, 5)
      .map((r) => {
        const cell = targetKind === "base" ? null : r.prices.find((p) => p.branchId === firstBranch);
        const current = cell ? cell.priceCentavos : r.basePriceCentavos;
        const next = applyPriceOp(current, r.basePriceCentavos, op, usesRounding ? rounding : "none");
        return { r, current, next, problem: invalidPrice(next) };
      });
  }, [op, rows, selected, allMatching, targetKind, targetBranchIds, rounding, usesRounding]);

  async function applyBulk() {
    if (typeof op === "string") {
      toast.error(op);
      return;
    }
    if (targetKind === "branches" && targetBranchIds.length === 0) {
      toast.error("Choose at least one branch.");
      return;
    }
    setApplying(true);
    try {
      const ids = allMatching
        ? (await convex.query(api.admin.prices.listMatchingVariantIds, filters)).variantIds
        : [...selected];
      if (ids.length === 0) return;

      const where =
        targetKind === "base"
          ? "the base price"
          : `${targetBranchIds.length} branch${targetBranchIds.length === 1 ? "" : "es"}`;
      if (
        !window.confirm(
          `${OP_LABELS[effectiveOpType]}${effectiveOpType === "reset" ? "" : ` ${opValue}`} — ${ids.length} product${ids.length === 1 ? "" : "s"}, ${where}.\n\nApply this change?`
        )
      ) {
        return;
      }

      const perCall =
        targetKind === "base" ? 100 : Math.max(1, Math.min(100, Math.floor(MAX_CELLS_PER_CALL / targetBranchIds.length)));
      setProgress({ done: 0, total: ids.length });
      let changed = 0;
      let unchanged = 0;
      const skipped: typeof lastSkipped = [];
      for (const part of chunk(ids, perCall)) {
        const r = await changePrices({
          variantIds: part,
          target: targetKind === "base" ? { kind: "base" } : { kind: "branches", branchIds: targetBranchIds },
          op,
          rounding: usesRounding ? rounding : "none",
        });
        changed += r.changed;
        unchanged += r.unchanged;
        skipped.push(...r.skipped);
        setProgress((p) => ({ ...p, done: p.done + part.length }));
      }
      setLastSkipped(skipped);
      toast.success(
        `${changed} price${changed === 1 ? "" : "s"} changed` +
          (unchanged ? ` · ${unchanged} already at that price` : "") +
          (skipped.length ? ` · ${skipped.length} skipped` : "")
      );
      clearSelection();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setApplying(false);
    }
  }

  // ── History ────────────────────────────────────────────────────────────────
  const [historyFor, setHistoryFor] = useState<{ variantId: Id<"variants">; label: string } | null>(null);
  const history = useQuery(
    api.admin.prices.getPriceHistory,
    historyFor ? { variantId: historyFor.variantId } : "skip"
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Prices</h1>
        <p className="text-sm text-muted-foreground">
          Base prices and branch prices. A branch sells at the base price until it is given its own;
          <span className="font-medium text-foreground"> bold</span> prices are a branch&apos;s own.
          Click a price to edit it, or select products to change many at once.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Style, SKU, barcode, color, size…"
            className="pl-9"
          />
        </div>
        <Select
          value={brandId}
          onValueChange={(v) => {
            setBrandId(v);
            setPage(0);
            clearSelection();
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All brands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All brands</SelectItem>
            {options?.brands.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ownOnly}
            onChange={(e) => {
              setOwnOnly(e.target.checked);
              setPage(0);
              clearSelection();
            }}
          />
          Only products with a branch price
        </label>
      </div>

      {/* Branch columns */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Branches shown:</span>
        {branches.map((b) => (
          <button
            key={b.id}
            onClick={() => toggleBranch(b.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              shownBranchIds.includes(b.id)
                ? "border-primary bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {b.name}
          </button>
        ))}
        <button className="text-xs text-muted-foreground underline" onClick={() => setChosenBranchIds(null)}>
          All
        </button>
        <button className="text-xs text-muted-foreground underline" onClick={() => setChosenBranchIds([])}>
          None
        </button>
      </div>

      {/* Bulk change */}
      {selectedCount > 0 && (
        <section className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold">
              {selectedCount} product{selectedCount === 1 ? "" : "s"} selected
            </span>
            {!allMatching && pageAllSelected && total > rows.length && (
              <button className="text-primary underline" onClick={() => setAllMatching(true)}>
                Select all {total} matching products
              </button>
            )}
            <button className="text-muted-foreground underline" onClick={clearSelection}>
              Clear selection
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label>Change</Label>
              <div className="flex rounded-md border p-0.5 text-sm">
                {(["branches", "base"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setTargetKind(k)}
                    className={cn(
                      "rounded px-3 py-1.5",
                      targetKind === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    )}
                  >
                    {k === "branches" ? "Branch prices" : "Base price"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label>How</Label>
              <Select value={effectiveOpType} onValueChange={(v) => setOpType(v as OpType)}>
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(OP_LABELS) as OpType[])
                    .filter((k) => !(k === "reset" && targetKind === "base"))
                    .map((k) => (
                      <SelectItem key={k} value={k}>
                        {OP_LABELS[k]}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {effectiveOpType !== "reset" && (
              <div className="space-y-1">
                <Label htmlFor="op-value">Value</Label>
                <Input
                  id="op-value"
                  inputMode="decimal"
                  value={opValue}
                  onChange={(e) => setOpValue(e.target.value)}
                  placeholder={effectiveOpType.endsWith("Pct") ? "10" : "1,199.00"}
                  className="w-32"
                />
              </div>
            )}

            {usesRounding && (
              <div className="space-y-1">
                <Label>Rounding</Label>
                <Select value={rounding} onValueChange={(v) => setRounding(v as Rounding)}>
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROUNDING_LABELS) as Rounding[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {ROUNDING_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button onClick={applyBulk} disabled={applying || typeof op === "string"}>
              {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {applying ? `Applying ${progress.done} / ${progress.total}…` : "Apply"}
            </Button>
          </div>

          {targetKind === "branches" && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">In branches:</span>
              {branches.map((b) => {
                const on = targetBranchIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    onClick={() =>
                      setBulkBranchIds(on ? targetBranchIds.filter((x) => x !== b.id) : [...targetBranchIds, b.id])
                    }
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 font-medium",
                      on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"
                    )}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>
          )}

          {preview.length > 0 && (
            <div className="text-xs">
              <p className="mb-1 text-muted-foreground">
                For example
                {targetKind === "branches" && targetBranchIds[0]
                  ? ` at ${branches.find((b) => b.id === targetBranchIds[0])?.name}`
                  : " (base price)"}
                :
              </p>
              <ul className="space-y-0.5">
                {preview.map(({ r, current, next, problem }) => (
                  <li key={r.variantId} className="flex flex-wrap gap-2">
                    <span className="font-mono">{r.sku}</span>
                    <span>
                      {formatCurrency(current)} → <span className="font-semibold">{formatCurrency(next)}</span>
                    </span>
                    {problem && <span className="text-red-600">{problem}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {lastSkipped.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium">{lastSkipped.length} prices weren&apos;t changed</span>
            <button className="underline" onClick={() => setLastSkipped([])}>
              Dismiss
            </button>
          </div>
          <ul className="max-h-32 space-y-0.5 overflow-y-auto">
            {lastSkipped.slice(0, 100).map((s, i) => (
              <li key={i}>
                <span className="font-mono">{s.sku}</span>
                {s.branchName ? ` · ${s.branchName}` : " · base"} — {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="w-10 p-2">
                <input type="checkbox" checked={pageAllSelected} onChange={togglePage} aria-label="Select page" />
              </th>
              <th className="min-w-56 p-2 text-left font-medium">Product</th>
              <th className="p-2 text-right font-medium text-muted-foreground">Cost</th>
              <th className="p-2 text-right font-medium">Base</th>
              {shownBranches.map((b) => (
                <th key={b.id} className="min-w-28 p-2 text-right font-medium">
                  {b.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data === undefined ? (
              <tr>
                <td colSpan={4 + shownBranches.length} className="p-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4 + shownBranches.length} className="p-8 text-center text-muted-foreground">
                  No products match.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const isSelected = allMatching || selected.has(r.variantId);
                const priceCell = (
                  branchId: Id<"branches"> | "base",
                  centavos: number,
                  own: boolean
                ) => {
                  const isEditing =
                    editing?.variantId === r.variantId && editing.branchId === branchId;
                  if (isEditing) {
                    return (
                      <Input
                        autoFocus
                        value={editValue}
                        inputMode="decimal"
                        disabled={savingCell}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={saveEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") setEditing(null);
                        }}
                        className="h-8 w-28 text-right"
                      />
                    );
                  }
                  return (
                    <span className="group inline-flex items-center gap-1">
                      {branchId !== "base" && own && (
                        <button
                          title="Reset to base price"
                          onClick={() => resetCell(r.variantId, branchId)}
                          className="invisible rounded p-0.5 text-muted-foreground hover:text-foreground group-hover:visible"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        title={branchId === "base" ? "Base price" : own ? "This branch's own price" : "Follows the base price"}
                        onClick={() => startEdit({ variantId: r.variantId, branchId }, centavos)}
                        className={cn(
                          "rounded px-1.5 py-0.5 tabular-nums hover:bg-muted",
                          branchId === "base" || own ? "font-semibold text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {formatCurrency(centavos)}
                      </button>
                    </span>
                  );
                };

                return (
                  <tr key={r.variantId} className={cn("border-t", isSelected && "bg-primary/5")}>
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(r.variantId)}
                        aria-label={`Select ${r.sku}`}
                      />
                    </td>
                    <td className="p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{r.styleName}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.color} · {r.size}
                            {r.brandName ? ` · ${r.brandName}` : ""}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">{r.sku}</p>
                        </div>
                        <button
                          title="Price history"
                          onClick={() =>
                            setHistoryFor({ variantId: r.variantId, label: `${r.styleName} · ${r.color} · ${r.size}` })
                          }
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <History className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">
                      {r.costPriceCentavos !== null ? formatCurrency(r.costPriceCentavos) : "—"}
                    </td>
                    <td className="p-2 text-right">{priceCell("base", r.basePriceCentavos, false)}</td>
                    {shownBranches.map((b) => {
                      const p = r.prices.find((x) => x.branchId === b.id);
                      return (
                        <td key={b.id} className="p-2 text-right">
                          {p ? priceCell(b.id, p.priceCentavos, p.own) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pages */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total === 0 ? "0" : `${page * PAGE_SIZE + 1}–${Math.min(total, (page + 1) * PAGE_SIZE)}`} of {total} products
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      {/* History */}
      <Dialog open={historyFor !== null} onOpenChange={(open) => !open && setHistoryFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Price history</DialogTitle>
            <DialogDescription>{historyFor?.label}</DialogDescription>
          </DialogHeader>
          {history === undefined ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No price changes recorded yet.</p>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
              {history.map((h) => (
                <li key={h._id} className="rounded-md border p-2">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{h.branchName ?? "Base price"}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(h.changedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
                    </span>
                  </div>
                  <p>
                    {formatCurrency(h.oldPriceCentavos)} →{" "}
                    <span className="font-semibold">{formatCurrency(h.newPriceCentavos)}</span>
                    {h.action === "reset" && <span className="text-muted-foreground"> (back to base)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">by {h.changedByName}</p>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

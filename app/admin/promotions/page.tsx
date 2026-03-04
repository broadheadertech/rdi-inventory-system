"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Pencil, Plus, Search, ToggleLeft, ToggleRight } from "lucide-react";

// ─── Constants ──────────────────────────────────────────────────────────────

type PromoType = "percentage" | "fixedAmount" | "buyXGetY" | "tiered";

const PROMO_TYPE_OPTIONS: { value: PromoType; label: string }[] = [
  { value: "percentage", label: "Percentage" },
  { value: "fixedAmount", label: "Fixed Amount" },
  { value: "buyXGetY", label: "Buy X Get Y" },
  { value: "tiered", label: "Tiered" },
];

const PROMO_TYPE_LABELS: Record<PromoType, string> = {
  percentage: "Percentage",
  fixedAmount: "Fixed Amount",
  buyXGetY: "Buy X Get Y",
  tiered: "Tiered",
};

const PROMO_TYPE_COLORS: Record<PromoType, string> = {
  percentage: "bg-blue-100 text-blue-800",
  fixedAmount: "bg-purple-100 text-purple-800",
  buyXGetY: "bg-amber-100 text-amber-800",
  tiered: "bg-teal-100 text-teal-800",
};

type StatusFilter = "all" | "active" | "inactive" | "expired" | "upcoming";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert a Unix ms timestamp to an HTML date input value (YYYY-MM-DD). */
function tsToDateInput(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Convert an HTML date input value to Unix ms timestamp (start of day local). */
function dateInputToTs(value: string): number {
  if (!value) return 0;
  return new Date(value + "T00:00:00").getTime();
}

/** Derive the display status from a promotion document. */
function getPromoStatus(
  promo: { isActive: boolean; startDate: number; endDate?: number }
): "active" | "inactive" | "expired" | "upcoming" {
  const now = Date.now();
  if (!promo.isActive) return "inactive";
  if (promo.endDate !== undefined && now > promo.endDate) return "expired";
  if (now < promo.startDate) return "upcoming";
  return "active";
}

const STATUS_BADGE: Record<
  ReturnType<typeof getPromoStatus>,
  { label: string; className: string }
> = {
  active: { label: "Active", className: "bg-green-100 text-green-800" },
  inactive: { label: "Inactive", className: "bg-red-100 text-red-800" },
  expired: { label: "Expired", className: "bg-gray-100 text-gray-600" },
  upcoming: { label: "Upcoming", className: "bg-blue-100 text-blue-800" },
};

/** Return a readable string for the promo value column. */
function formatPromoValue(promo: {
  promoType: PromoType;
  percentageValue?: number;
  maxDiscountCentavos?: number;
  fixedAmountCentavos?: number;
  buyQuantity?: number;
  getQuantity?: number;
  minSpendCentavos?: number;
  tieredDiscountCentavos?: number;
}): string {
  switch (promo.promoType) {
    case "percentage": {
      let s = `${promo.percentageValue ?? 0}%`;
      if (promo.maxDiscountCentavos) {
        s += ` (max ${formatCurrency(promo.maxDiscountCentavos)})`;
      }
      return s;
    }
    case "fixedAmount":
      return formatCurrency(promo.fixedAmountCentavos ?? 0);
    case "buyXGetY":
      return `Buy ${promo.buyQuantity ?? 0}, Get ${promo.getQuantity ?? 0}`;
    case "tiered":
      return `Spend ${formatCurrency(promo.minSpendCentavos ?? 0)} -> ${formatCurrency(promo.tieredDiscountCentavos ?? 0)} off`;
    default:
      return "-";
  }
}

// ─── Form State ─────────────────────────────────────────────────────────────

interface PromoForm {
  name: string;
  description: string;
  promoType: PromoType;
  percentageValue: string;
  maxDiscountCentavos: string;
  fixedAmountCentavos: string;
  buyQuantity: string;
  getQuantity: string;
  minSpendCentavos: string;
  tieredDiscountCentavos: string;
  startDate: string;
  endDate: string;
  noExpiration: boolean;
  isActive: boolean;
  priority: string;
  allBranches: boolean;
  branchIds: Id<"branches">[];
  allProducts: boolean;
  brandIds: Id<"brands">[];
  allStock: boolean;
  agingTiers: ("green" | "yellow" | "red")[];
}

function emptyForm(): PromoForm {
  return {
    name: "",
    description: "",
    promoType: "percentage",
    percentageValue: "",
    maxDiscountCentavos: "",
    fixedAmountCentavos: "",
    buyQuantity: "",
    getQuantity: "",
    minSpendCentavos: "",
    tieredDiscountCentavos: "",
    startDate: "",
    endDate: "",
    noExpiration: false,
    isActive: true,
    priority: "0",
    allBranches: true,
    branchIds: [],
    allProducts: true,
    brandIds: [],
    allStock: true,
    agingTiers: [],
  };
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function PromotionsPage() {
  // Data
  const promotions = useQuery(api.admin.promotions.listPromotions);
  const branches = useQuery(api.auth.branches.listBranches);
  const brands = useQuery(api.pos.products.listPOSBrands);

  // Mutations
  const createPromotion = useMutation(api.admin.promotions.createPromotion);
  const updatePromotion = useMutation(api.admin.promotions.updatePromotion);
  const toggleStatus = useMutation(
    api.admin.promotions.togglePromotionStatus
  );

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingPromoId, setEditingPromoId] = useState<Id<"promotions"> | null>(
    null
  );
  const [form, setForm] = useState<PromoForm>(emptyForm());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Client-side filtering ───────────────────────────────────────────────

  const filteredPromotions = useMemo(() => {
    if (!promotions) return undefined;
    return promotions.filter((p) => {
      // Search
      if (
        searchQuery &&
        !p.name.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      // Status
      if (statusFilter !== "all") {
        const s = getPromoStatus(p);
        if (s !== statusFilter) return false;
      }
      // Type
      if (typeFilter !== "all" && p.promoType !== typeFilter) {
        return false;
      }
      return true;
    });
  }, [promotions, searchQuery, statusFilter, typeFilter]);

  const pagination = usePagination(filteredPromotions);

  // ── Scope summary for table ─────────────────────────────────────────────

  function scopeSummary(promo: {
    branchIds: Id<"branches">[];
    brandIds: Id<"brands">[];
    agingTiers?: string[];
  }): string {
    const parts: string[] = [];
    if (promo.branchIds.length === 0) {
      parts.push("All branches");
    } else {
      parts.push(
        `${promo.branchIds.length} branch${promo.branchIds.length !== 1 ? "es" : ""}`
      );
    }
    if (promo.brandIds.length === 0) {
      parts.push("All products");
    } else {
      parts.push(
        `${promo.brandIds.length} brand${promo.brandIds.length !== 1 ? "s" : ""}`
      );
    }
    if (promo.agingTiers && promo.agingTiers.length > 0) {
      const tierLabels: Record<string, string> = { green: "Green", yellow: "Yellow", red: "Red" };
      parts.push(promo.agingTiers.map((t) => tierLabels[t] ?? t).join(", ") + " stock");
    }
    return parts.join(" / ");
  }

  // ── Form helpers ────────────────────────────────────────────────────────

  function updateField<K extends keyof PromoForm>(key: K, value: PromoForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreateDialog() {
    setForm(emptyForm());
    setEditingPromoId(null);
    setShowCreateDialog(true);
  }

  function openEditDialog(promoId: Id<"promotions">) {
    const promo = promotions?.find((p) => p._id === promoId);
    if (!promo) return;
    setEditingPromoId(promoId);
    setForm({
      name: promo.name,
      description: promo.description ?? "",
      promoType: promo.promoType,
      percentageValue: promo.percentageValue?.toString() ?? "",
      maxDiscountCentavos: promo.maxDiscountCentavos?.toString() ?? "",
      fixedAmountCentavos: promo.fixedAmountCentavos?.toString() ?? "",
      buyQuantity: promo.buyQuantity?.toString() ?? "",
      getQuantity: promo.getQuantity?.toString() ?? "",
      minSpendCentavos: promo.minSpendCentavos?.toString() ?? "",
      tieredDiscountCentavos: promo.tieredDiscountCentavos?.toString() ?? "",
      startDate: tsToDateInput(promo.startDate),
      endDate: promo.endDate !== undefined ? tsToDateInput(promo.endDate) : "",
      noExpiration: promo.endDate === undefined,
      isActive: promo.isActive,
      priority: promo.priority.toString(),
      allBranches: promo.branchIds.length === 0,
      branchIds: promo.branchIds,
      allProducts: promo.brandIds.length === 0,
      brandIds: promo.brandIds,
      allStock: !promo.agingTiers || promo.agingTiers.length === 0,
      agingTiers: (promo.agingTiers ?? []) as ("green" | "yellow" | "red")[],
    });
    setShowCreateDialog(true);
  }

  function closeDialog() {
    setShowCreateDialog(false);
    setEditingPromoId(null);
    setForm(emptyForm());
  }

  function buildArgs() {
    const startTs = dateInputToTs(form.startDate);
    const endTs = form.noExpiration ? undefined : dateInputToTs(form.endDate);
    return {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      promoType: form.promoType,
      percentageValue:
        form.promoType === "percentage" && form.percentageValue
          ? parseFloat(form.percentageValue)
          : undefined,
      maxDiscountCentavos:
        form.promoType === "percentage" && form.maxDiscountCentavos
          ? parseInt(form.maxDiscountCentavos, 10)
          : undefined,
      fixedAmountCentavos:
        form.promoType === "fixedAmount" && form.fixedAmountCentavos
          ? parseInt(form.fixedAmountCentavos, 10)
          : undefined,
      buyQuantity:
        form.promoType === "buyXGetY" && form.buyQuantity
          ? parseInt(form.buyQuantity, 10)
          : undefined,
      getQuantity:
        form.promoType === "buyXGetY" && form.getQuantity
          ? parseInt(form.getQuantity, 10)
          : undefined,
      minSpendCentavos:
        form.promoType === "tiered" && form.minSpendCentavos
          ? parseInt(form.minSpendCentavos, 10)
          : undefined,
      tieredDiscountCentavos:
        form.promoType === "tiered" && form.tieredDiscountCentavos
          ? parseInt(form.tieredDiscountCentavos, 10)
          : undefined,
      branchIds: form.allBranches ? [] : form.branchIds,
      brandIds: form.allProducts ? [] : form.brandIds,
      categoryIds: [] as Id<"categories">[],
      variantIds: [] as Id<"variants">[],
      startDate: startTs,
      endDate: endTs,
      isActive: form.isActive,
      priority: parseInt(form.priority, 10) || 0,
      agingTiers: form.allStock ? undefined : form.agingTiers,
    };
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      toast.error("Promotion name is required");
      return;
    }
    if (!form.startDate) {
      toast.error("Start date is required");
      return;
    }
    if (!form.noExpiration && !form.endDate) {
      toast.error("End date is required (or enable 'No expiration')");
      return;
    }

    setIsSubmitting(true);
    try {
      const args = buildArgs();
      if (editingPromoId) {
        await updatePromotion({ promotionId: editingPromoId, ...args });
        toast.success("Promotion updated");
      } else {
        await createPromotion(args);
        toast.success("Promotion created");
      }
      closeDialog();
    } catch (error) {
      toast.error(
        `Failed to ${editingPromoId ? "update" : "create"} promotion: ${getErrorMessage(error)}`
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleStatus(
    promoId: Id<"promotions">,
    currentlyActive: boolean
  ) {
    try {
      await toggleStatus({
        promotionId: promoId,
        isActive: !currentlyActive,
      });
      toast.success(
        currentlyActive ? "Promotion deactivated" : "Promotion activated"
      );
    } catch (error) {
      toast.error(`Failed to toggle status: ${getErrorMessage(error)}`);
    }
  }

  // ── Loading state ───────────────────────────────────────────────────────

  if (promotions === undefined) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Promotions</h1>
        <p className="text-muted-foreground">Loading promotions...</p>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const activeBranches = branches?.filter((b) => b.isActive) ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Promotions</h1>
          <p className="text-sm text-muted-foreground">
            {filteredPromotions?.length ?? 0} promotion
            {(filteredPromotions?.length ?? 0) !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          New Promotion
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {PROMO_TYPE_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Date Range</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.paginatedData.length > 0 ? (
              pagination.paginatedData.map((promo) => {
                const status = getPromoStatus(promo);
                const badge = STATUS_BADGE[status];
                return (
                  <TableRow key={promo._id}>
                    <TableCell className="font-medium">{promo.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={PROMO_TYPE_COLORS[promo.promoType] ?? ""}
                      >
                        {PROMO_TYPE_LABELS[promo.promoType] ?? promo.promoType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatPromoValue(promo)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {scopeSummary(promo)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(promo.startDate)} -{" "}
                      {promo.endDate !== undefined ? formatDate(promo.endDate) : "No expiration"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={badge.className}>
                        {badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(promo._id)}
                          title="Edit promotion"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleToggleStatus(promo._id, promo.isActive)
                          }
                          title={
                            promo.isActive
                              ? "Deactivate promotion"
                              : "Activate promotion"
                          }
                        >
                          {promo.isActive ? (
                            <ToggleRight className="h-4 w-4 text-green-600" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-8"
                >
                  {searchQuery || statusFilter !== "all" || typeFilter !== "all"
                    ? "No promotions match the current filters"
                    : "No promotions found. Create your first promotion to get started."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        hasNextPage={pagination.hasNextPage}
        hasPrevPage={pagination.hasPrevPage}
        onNextPage={pagination.nextPage}
        onPrevPage={pagination.prevPage}
        noun="promotion"
      />

      {/* Create / Edit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPromoId ? "Edit Promotion" : "New Promotion"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="promo-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="promo-name"
                placeholder="e.g. Summer Sale 2026"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="promo-desc">Description</Label>
              <Input
                id="promo-desc"
                placeholder="Optional description"
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
              />
            </div>

            {/* Promo Type */}
            <div className="space-y-2">
              <Label htmlFor="promo-type">
                Promotion Type <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.promoType}
                onValueChange={(v) => updateField("promoType", v as PromoType)}
              >
                <SelectTrigger id="promo-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROMO_TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Conditional fields based on promoType */}
            {form.promoType === "percentage" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="promo-pct">
                    Percentage (%) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="promo-pct"
                    type="number"
                    min="1"
                    max="100"
                    placeholder="e.g. 20"
                    value={form.percentageValue}
                    onChange={(e) =>
                      updateField("percentageValue", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="promo-max-disc">
                    Max Discount (centavos)
                  </Label>
                  <Input
                    id="promo-max-disc"
                    type="number"
                    min="0"
                    placeholder="e.g. 50000"
                    value={form.maxDiscountCentavos}
                    onChange={(e) =>
                      updateField("maxDiscountCentavos", e.target.value)
                    }
                  />
                </div>
              </div>
            )}

            {form.promoType === "fixedAmount" && (
              <div className="space-y-2">
                <Label htmlFor="promo-fixed">
                  Discount Amount (centavos){" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="promo-fixed"
                  type="number"
                  min="1"
                  placeholder="e.g. 10000"
                  value={form.fixedAmountCentavos}
                  onChange={(e) =>
                    updateField("fixedAmountCentavos", e.target.value)
                  }
                />
              </div>
            )}

            {form.promoType === "buyXGetY" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="promo-buy-qty">
                    Buy Quantity <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="promo-buy-qty"
                    type="number"
                    min="1"
                    placeholder="e.g. 2"
                    value={form.buyQuantity}
                    onChange={(e) =>
                      updateField("buyQuantity", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="promo-get-qty">
                    Get Free Quantity{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="promo-get-qty"
                    type="number"
                    min="1"
                    placeholder="e.g. 1"
                    value={form.getQuantity}
                    onChange={(e) =>
                      updateField("getQuantity", e.target.value)
                    }
                  />
                </div>
              </div>
            )}

            {form.promoType === "tiered" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="promo-min-spend">
                    Min Spend (centavos){" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="promo-min-spend"
                    type="number"
                    min="1"
                    placeholder="e.g. 200000"
                    value={form.minSpendCentavos}
                    onChange={(e) =>
                      updateField("minSpendCentavos", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="promo-tiered-disc">
                    Discount Amount (centavos){" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="promo-tiered-disc"
                    type="number"
                    min="1"
                    placeholder="e.g. 50000"
                    value={form.tieredDiscountCentavos}
                    onChange={(e) =>
                      updateField("tieredDiscountCentavos", e.target.value)
                    }
                  />
                </div>
              </div>
            )}

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="promo-start">
                  Start Date <span className="text-destructive">*</span>
                </Label>
                <input
                  id="promo-start"
                  type="date"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.startDate}
                  onChange={(e) => updateField("startDate", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="promo-end">
                    End Date {!form.noExpiration && <span className="text-destructive">*</span>}
                  </Label>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.noExpiration}
                      onChange={(e) => {
                        updateField("noExpiration", e.target.checked);
                        if (e.target.checked) updateField("endDate", "");
                      }}
                      className="rounded border-gray-300"
                    />
                    No expiration
                  </label>
                </div>
                <input
                  id="promo-end"
                  type="date"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                  value={form.endDate}
                  onChange={(e) => updateField("endDate", e.target.value)}
                  disabled={form.noExpiration}
                />
              </div>
            </div>

            {/* Priority + Active */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="promo-priority">Priority</Label>
                <Input
                  id="promo-priority"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.priority}
                  onChange={(e) => updateField("priority", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Higher number = higher priority
                </p>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.isActive ? "active" : "inactive"}
                  onValueChange={(v) =>
                    updateField("isActive", v === "active")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Scope: Branches */}
            <div className="space-y-3">
              <Label>Branch Scope</Label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.allBranches}
                  onChange={(e) => {
                    updateField("allBranches", e.target.checked);
                    if (e.target.checked) updateField("branchIds", []);
                  }}
                  className="h-4 w-4 rounded border-gray-300"
                />
                All Branches
              </label>
              {!form.allBranches && (
                <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-1">
                  {activeBranches.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No active branches available
                    </p>
                  ) : (
                    activeBranches.map((branch) => (
                      <label
                        key={branch._id}
                        className="flex items-center gap-2 text-sm cursor-pointer py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={form.branchIds.includes(branch._id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              updateField("branchIds", [
                                ...form.branchIds,
                                branch._id,
                              ]);
                            } else {
                              updateField(
                                "branchIds",
                                form.branchIds.filter(
                                  (id) => id !== branch._id
                                )
                              );
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        {branch.name}
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Scope: Brands (Products) */}
            <div className="space-y-3">
              <Label>Product Scope (Brands)</Label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.allProducts}
                  onChange={(e) => {
                    updateField("allProducts", e.target.checked);
                    if (e.target.checked) updateField("brandIds", []);
                  }}
                  className="h-4 w-4 rounded border-gray-300"
                />
                All Products
              </label>
              {!form.allProducts && (
                <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-1">
                  {!brands || brands.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No brands available
                    </p>
                  ) : (
                    brands.map((brand) => (
                      <label
                        key={brand._id}
                        className="flex items-center gap-2 text-sm cursor-pointer py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={form.brandIds.includes(
                            brand._id as Id<"brands">
                          )}
                          onChange={(e) => {
                            const bid = brand._id as Id<"brands">;
                            if (e.target.checked) {
                              updateField("brandIds", [
                                ...form.brandIds,
                                bid,
                              ]);
                            } else {
                              updateField(
                                "brandIds",
                                form.brandIds.filter((id) => id !== bid)
                              );
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        {brand.name}
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Scope: Inventory Aging */}
            <div className="space-y-3">
              <Label>Inventory Aging Scope</Label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.allStock}
                  onChange={(e) => {
                    updateField("allStock", e.target.checked);
                    if (e.target.checked) updateField("agingTiers", []);
                  }}
                  className="h-4 w-4 rounded border-gray-300"
                />
                All Stock (no aging filter)
              </label>
              {!form.allStock && (
                <div className="border rounded-md p-3 space-y-1">
                  {(
                    [
                      { value: "green" as const, label: "Green (New, 0-90 days)", color: "text-green-700" },
                      { value: "yellow" as const, label: "Yellow (Mid-cycle, 91-180 days)", color: "text-yellow-700" },
                      { value: "red" as const, label: "Red (Old, 180+ days)", color: "text-red-700" },
                    ] as const
                  ).map((tier) => (
                    <label
                      key={tier.value}
                      className={`flex items-center gap-2 text-sm cursor-pointer py-0.5 ${tier.color}`}
                    >
                      <input
                        type="checkbox"
                        checked={form.agingTiers.includes(tier.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            updateField("agingTiers", [...form.agingTiers, tier.value]);
                          } else {
                            updateField(
                              "agingTiers",
                              form.agingTiers.filter((t) => t !== tier.value)
                            );
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      {tier.label}
                    </label>
                  ))}
                  <p className="text-xs text-muted-foreground mt-2">
                    Only items with batches in the selected aging tiers will be eligible for this promotion.
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeDialog}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting
                ? editingPromoId
                  ? "Saving..."
                  : "Creating..."
                : editingPromoId
                  ? "Save Changes"
                  : "Create Promotion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

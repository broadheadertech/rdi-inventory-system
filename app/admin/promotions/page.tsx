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

type PromoType = "percentage" | "fixedAmount" | "buyXGetY" | "tiered" | "crossSell" | "pwp";

const PROMO_TYPE_OPTIONS: { value: PromoType; label: string }[] = [
  { value: "percentage", label: "Percentage" },
  { value: "fixedAmount", label: "Fixed Amount" },
  { value: "buyXGetY", label: "Buy X Get Y" },
  { value: "tiered", label: "Tiered" },
  { value: "crossSell", label: "Cross-Sell Bundle" },
  { value: "pwp", label: "Purchase with Purchase" },
];

const PROMO_TYPE_LABELS: Record<PromoType, string> = {
  percentage: "Percentage",
  fixedAmount: "Fixed Amount",
  buyXGetY: "Buy X Get Y",
  tiered: "Tiered",
  crossSell: "Cross-Sell",
  pwp: "PWP",
};

const PROMO_TYPE_COLORS: Record<PromoType, string> = {
  percentage: "bg-blue-100 text-blue-800",
  fixedAmount: "bg-purple-100 text-purple-800",
  buyXGetY: "bg-amber-100 text-amber-800",
  tiered: "bg-teal-100 text-teal-800",
  crossSell: "bg-pink-100 text-pink-800",
  pwp: "bg-orange-100 text-orange-800",
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

type GenderValue = "mens" | "womens" | "unisex" | "kids" | "boys" | "girls";

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
  branchScopeMode: "all" | "byClassification" | "specific";
  branchIds: Id<"branches">[];
  branchClassifications: ("premium" | "aclass" | "bnc" | "outlet")[];
  allProducts: boolean;
  brandIds: Id<"brands">[];
  categoryIds: Id<"categories">[];
  styleIds: Id<"styles">[];
  genders: GenderValue[];
  selectedColors: string[];
  selectedSizes: string[];
  allStock: boolean;
  agingTiers: ("green" | "yellow" | "red")[];
  // crossSell
  crossSellRewardType: "percentage" | "fixedAmount";
  rewardBrandIds: Id<"brands">[];
  rewardCategoryIds: Id<"categories">[];
  rewardStyleIds: Id<"styles">[];
  rewardVariantIds: Id<"variants">[];
  // pwp
  pwpTriggerMinQuantity: string;
  pwpRewardStyleIds: Id<"styles">[];  // local picker state (not stored)
  pwpRewardVariantIds: Id<"variants">[];
  pwpRewardPriceCentavos: string;
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
    branchScopeMode: "all",
    branchIds: [],
    branchClassifications: [],
    allProducts: true,
    brandIds: [],
    categoryIds: [],
    styleIds: [],
    genders: [],
    selectedColors: [],
    selectedSizes: [],
    allStock: true,
    agingTiers: [],
    crossSellRewardType: "percentage",
    rewardBrandIds: [],
    rewardCategoryIds: [],
    rewardStyleIds: [],
    rewardVariantIds: [],
    pwpTriggerMinQuantity: "1",
    pwpRewardStyleIds: [],
    pwpRewardVariantIds: [],
    pwpRewardPriceCentavos: "",
  };
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function PromotionsPage() {
  // Data
  const promotions = useQuery(api.admin.promotions.listPromotions);
  const branches = useQuery(api.auth.branches.listBranches);
  const brands = useQuery(api.pos.products.listPOSBrands);
  const categories = useQuery(api.admin.promotions.listCategoriesForPromo);
  const styles = useQuery(api.admin.promotions.listStylesForPromo);
  const colorsList = useQuery(api.admin.colors.listColors);
  const sizesList = useQuery(api.admin.sizes.listSizes);

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

  // Reward variants — depends on form.rewardStyleIds so must come after form state
  const rewardVariants = useQuery(
    api.admin.promotions.listVariantsForStyles,
    form.rewardStyleIds.length > 0 ? { styleIds: form.rewardStyleIds } : "skip"
  );

  // PWP reward variants
  const pwpRewardVariants = useQuery(
    api.admin.promotions.listVariantsForStyles,
    form.pwpRewardStyleIds.length > 0 ? { styleIds: form.pwpRewardStyleIds } : "skip"
  );

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
    branchClassifications?: string[];
    brandIds: Id<"brands">[];
    categoryIds?: Id<"categories">[];
    styleIds?: Id<"styles">[];
    genders?: string[];
    colors?: string[];
    sizes?: string[];
    agingTiers?: string[];
  }): string {
    const parts: string[] = [];
    const hasClassifications = promo.branchClassifications && promo.branchClassifications.length > 0;
    const hasBranchIds = promo.branchIds.length > 0;
    if (!hasClassifications && !hasBranchIds) {
      parts.push("All branches");
    } else {
      const branchParts: string[] = [];
      if (hasClassifications) {
        const classLabels: Record<string, string> = { premium: "Premium", aclass: "A-Class", bnc: "BNC", outlet: "Outlet" };
        branchParts.push(promo.branchClassifications!.map((c) => classLabels[c] ?? c).join(", "));
      }
      if (hasBranchIds) {
        branchParts.push(`${promo.branchIds.length} branch${promo.branchIds.length !== 1 ? "es" : ""}`);
      }
      parts.push(branchParts.join(" + "));
    }
    const productParts: string[] = [];
    if (promo.brandIds.length > 0) productParts.push(`${promo.brandIds.length} brand(s)`);
    if (promo.categoryIds && promo.categoryIds.length > 0) productParts.push(`${promo.categoryIds.length} cat(s)`);
    if (promo.styleIds && promo.styleIds.length > 0) productParts.push(`${promo.styleIds.length} style(s)`);
    if (promo.genders && promo.genders.length > 0) productParts.push(promo.genders.join(", "));
    if (promo.colors && promo.colors.length > 0) productParts.push(`${promo.colors.length} color(s)`);
    if (promo.sizes && promo.sizes.length > 0) productParts.push(`${promo.sizes.length} size(s)`);
    parts.push(productParts.length > 0 ? productParts.join(", ") : "All products");
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
      branchScopeMode:
        (promo.branchClassifications && promo.branchClassifications.length > 0)
          ? "byClassification"
          : promo.branchIds.length > 0
            ? "specific"
            : "all",
      branchIds: promo.branchIds,
      branchClassifications: (promo.branchClassifications ?? []) as ("premium" | "aclass" | "bnc" | "outlet")[],
      allProducts:
        promo.brandIds.length === 0 &&
        (promo.categoryIds?.length ?? 0) === 0 &&
        (promo.styleIds?.length ?? 0) === 0 &&
        (promo.genders?.length ?? 0) === 0 &&
        (promo.colors?.length ?? 0) === 0 &&
        (promo.sizes?.length ?? 0) === 0,
      brandIds: promo.brandIds,
      categoryIds: (promo.categoryIds ?? []) as Id<"categories">[],
      styleIds: (promo.styleIds ?? []) as Id<"styles">[],
      genders: (promo.genders ?? []) as GenderValue[],
      selectedColors: promo.colors ?? [],
      selectedSizes: promo.sizes ?? [],
      allStock: !promo.agingTiers || promo.agingTiers.length === 0,
      agingTiers: (promo.agingTiers ?? []) as ("green" | "yellow" | "red")[],
      crossSellRewardType: (promo.crossSellRewardType ?? "percentage") as "percentage" | "fixedAmount",
      rewardBrandIds: (promo.rewardBrandIds ?? []) as Id<"brands">[],
      rewardCategoryIds: (promo.rewardCategoryIds ?? []) as Id<"categories">[],
      rewardStyleIds: (promo.rewardStyleIds ?? []) as Id<"styles">[],
      rewardVariantIds: (promo.rewardVariantIds ?? []) as Id<"variants">[],
      pwpTriggerMinQuantity: promo.pwpTriggerMinQuantity?.toString() ?? "1",
      pwpRewardStyleIds: [],  // local only — reset on edit; user re-selects to see variants
      pwpRewardVariantIds: (promo.pwpRewardVariantIds ?? []) as Id<"variants">[],
      pwpRewardPriceCentavos: promo.pwpRewardPriceCentavos?.toString() ?? "",
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
      branchIds: form.branchScopeMode === "specific" ? form.branchIds : [],
      branchClassifications: form.branchScopeMode === "byClassification" ? form.branchClassifications : undefined,
      brandIds: form.allProducts ? [] : form.brandIds,
      categoryIds: form.allProducts ? [] as Id<"categories">[] : form.categoryIds,
      variantIds: [] as Id<"variants">[],
      styleIds: form.allProducts ? undefined : (form.styleIds.length > 0 ? form.styleIds : undefined),
      genders: form.allProducts ? undefined : (form.genders.length > 0 ? form.genders : undefined),
      colors: form.allProducts ? undefined : (form.selectedColors.length > 0 ? form.selectedColors : undefined),
      sizes: form.allProducts ? undefined : (form.selectedSizes.length > 0 ? form.selectedSizes : undefined),
      startDate: startTs,
      endDate: endTs,
      isActive: form.isActive,
      priority: parseInt(form.priority, 10) || 0,
      agingTiers: form.allStock ? undefined : form.agingTiers,
      crossSellRewardType: form.promoType === "crossSell" ? form.crossSellRewardType : undefined,
      rewardBrandIds: form.promoType === "crossSell" ? form.rewardBrandIds : undefined,
      rewardCategoryIds: form.promoType === "crossSell" ? form.rewardCategoryIds : undefined,
      rewardStyleIds: form.promoType === "crossSell" && form.rewardStyleIds.length > 0 ? form.rewardStyleIds : undefined,
      rewardVariantIds: form.promoType === "crossSell" && form.rewardVariantIds.length > 0 ? form.rewardVariantIds : ([] as Id<"variants">[]),
      pwpTriggerMinQuantity: form.promoType === "pwp" && form.pwpTriggerMinQuantity ? parseInt(form.pwpTriggerMinQuantity, 10) : undefined,
      pwpRewardVariantIds: form.promoType === "pwp" && form.pwpRewardVariantIds.length > 0 ? form.pwpRewardVariantIds : undefined,
      pwpRewardPriceCentavos: form.promoType === "pwp" && form.pwpRewardPriceCentavos !== "" ? parseInt(form.pwpRewardPriceCentavos, 10) : undefined,
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

            {form.promoType === "crossSell" && (
              <div className="space-y-3 rounded-md border border-pink-200 bg-pink-50/40 p-3">
                <p className="text-xs font-semibold text-pink-700">
                  Cross-Sell: Reward Discount
                </p>
                <p className="text-xs text-muted-foreground">
                  When trigger products (defined in Product Scope below) are in the cart,
                  this discount applies to the reward products selected here.
                </p>

                {/* Reward discount type */}
                <div className="space-y-2">
                  <Label>Reward Discount Type</Label>
                  <Select
                    value={form.crossSellRewardType}
                    onValueChange={(v) => updateField("crossSellRewardType", v as "percentage" | "fixedAmount")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage Off</SelectItem>
                      <SelectItem value="fixedAmount">Fixed Amount Off</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.crossSellRewardType === "percentage" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Reward % Off <span className="text-destructive">*</span></Label>
                      <Input
                        type="number" min="1" max="100" placeholder="e.g. 20"
                        value={form.percentageValue}
                        onChange={(e) => updateField("percentageValue", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Discount Cap (centavos)</Label>
                      <Input
                        type="number" min="0" placeholder="e.g. 50000"
                        value={form.maxDiscountCentavos}
                        onChange={(e) => updateField("maxDiscountCentavos", e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {form.crossSellRewardType === "fixedAmount" && (
                  <div className="space-y-2">
                    <Label>Reward Fixed Amount (centavos) <span className="text-destructive">*</span></Label>
                    <Input
                      type="number" min="1" placeholder="e.g. 10000"
                      value={form.fixedAmountCentavos}
                      onChange={(e) => updateField("fixedAmountCentavos", e.target.value)}
                    />
                  </div>
                )}

                {/* Reward product scope */}
                <div className="space-y-2">
                  <Label>Reward Products — Brands</Label>
                  <div className="border rounded-md p-3 max-h-32 overflow-y-auto space-y-1 bg-background">
                    {!brands || brands.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No brands</p>
                    ) : (
                      brands.map((brand) => (
                        <label key={brand._id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                          <input
                            type="checkbox"
                            checked={form.rewardBrandIds.includes(brand._id as Id<"brands">)}
                            onChange={(e) => {
                              const bid = brand._id as Id<"brands">;
                              if (e.target.checked) {
                                updateField("rewardBrandIds", [...form.rewardBrandIds, bid]);
                              } else {
                                updateField("rewardBrandIds", form.rewardBrandIds.filter((id) => id !== bid));
                              }
                            }}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          {brand.name}
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Reward Products — Categories</Label>
                  <div className="border rounded-md p-3 max-h-32 overflow-y-auto space-y-1 bg-background">
                    {!categories || categories.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No categories</p>
                    ) : (
                      categories
                        .filter((cat) => form.rewardBrandIds.length === 0 || form.rewardBrandIds.includes(cat.brandId))
                        .map((cat) => (
                          <label key={cat._id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                            <input
                              type="checkbox"
                              checked={form.rewardCategoryIds.includes(cat._id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  updateField("rewardCategoryIds", [...form.rewardCategoryIds, cat._id]);
                                } else {
                                  updateField("rewardCategoryIds", form.rewardCategoryIds.filter((id) => id !== cat._id));
                                }
                              }}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            {cat.name}
                          </label>
                        ))
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Reward Products — Styles <span className="text-xs text-muted-foreground">(optional)</span></Label>
                  <div className="border rounded-md p-3 max-h-32 overflow-y-auto space-y-1 bg-background">
                    {!styles || styles.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No styles</p>
                    ) : (
                      styles
                        .filter((s) => form.rewardCategoryIds.length === 0 || form.rewardCategoryIds.includes(s.categoryId!))
                        .map((style) => (
                          <label key={style._id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                            <input
                              type="checkbox"
                              checked={form.rewardStyleIds.includes(style._id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  updateField("rewardStyleIds", [...form.rewardStyleIds, style._id]);
                                } else {
                                  // Clear variant selections belonging to this style when style is deselected
                                  const removedStyleId = style._id;
                                  const variantsOfStyle = rewardVariants?.filter((v) => v.styleId === removedStyleId).map((v) => v._id as Id<"variants">) ?? [];
                                  updateField("rewardStyleIds", form.rewardStyleIds.filter((id) => id !== removedStyleId));
                                  if (variantsOfStyle.length > 0) {
                                    updateField("rewardVariantIds", form.rewardVariantIds.filter((vid) => !variantsOfStyle.includes(vid)));
                                  }
                                }
                              }}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            {style.name}
                          </label>
                        ))
                    )}
                  </div>
                </div>

                {/* Specific reward variants — only shown when styles are selected */}
                {form.rewardStyleIds.length > 0 && (
                  <div className="space-y-2">
                    <Label>
                      Reward Products — Specific Variants{" "}
                      <span className="text-xs text-muted-foreground">(optional — leave empty to include all variants of selected styles)</span>
                    </Label>
                    <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-1 bg-background">
                      {rewardVariants === undefined ? (
                        <p className="text-xs text-muted-foreground">Loading...</p>
                      ) : rewardVariants.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No active variants for selected styles.</p>
                      ) : (
                        rewardVariants.map((variant) => {
                          const styleName = styles?.find((s) => s._id === variant.styleId)?.name ?? "";
                          return (
                            <label key={variant._id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                              <input
                                type="checkbox"
                                checked={form.rewardVariantIds.includes(variant._id as Id<"variants">)}
                                onChange={(e) => {
                                  const vid = variant._id as Id<"variants">;
                                  if (e.target.checked) {
                                    updateField("rewardVariantIds", [...form.rewardVariantIds, vid]);
                                  } else {
                                    updateField("rewardVariantIds", form.rewardVariantIds.filter((id) => id !== vid));
                                  }
                                }}
                                className="h-4 w-4 rounded border-gray-300"
                              />
                              <span className="flex-1 min-w-0">
                                <span className="font-medium">{styleName}</span>
                                <span className="text-muted-foreground"> · {variant.size} · {variant.color}</span>
                              </span>
                              {variant.sku && (
                                <span className="text-xs text-muted-foreground shrink-0">{variant.sku}</span>
                              )}
                            </label>
                          );
                        })
                      )}
                    </div>
                    {form.rewardVariantIds.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {form.rewardVariantIds.length} variant{form.rewardVariantIds.length !== 1 ? "s" : ""} selected
                      </p>
                    )}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Leave reward products empty = discount applies to ALL products not in the trigger scope.
                </p>
              </div>
            )}

            {form.promoType === "pwp" && (
              <div className="space-y-3 rounded-md border border-orange-200 bg-orange-50/40 p-3">
                <p className="text-xs font-semibold text-orange-700">
                  Purchase with Purchase (PWP)
                </p>
                <p className="text-xs text-muted-foreground">
                  When the customer buys the minimum quantity of trigger products (defined in Product Scope below),
                  they can purchase the reward product(s) at a special price.
                </p>

                {/* Trigger min quantity */}
                <div className="space-y-2">
                  <Label>Minimum Trigger Quantity <span className="text-destructive">*</span></Label>
                  <Input
                    type="number" min="1" placeholder="e.g. 3"
                    value={form.pwpTriggerMinQuantity}
                    onChange={(e) => updateField("pwpTriggerMinQuantity", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Customer must add at least this many trigger items to qualify.
                  </p>
                </div>

                {/* Reward special price */}
                <div className="space-y-2">
                  <Label>Reward Special Price (centavos) <span className="text-destructive">*</span></Label>
                  <Input
                    type="number" min="0" placeholder="e.g. 19900 = ₱199"
                    value={form.pwpRewardPriceCentavos}
                    onChange={(e) => updateField("pwpRewardPriceCentavos", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    The special price the reward item sells for. Discount = original price − this price.
                  </p>
                </div>

                {/* Reward product picker: pick styles → then variants */}
                <div className="space-y-2">
                  <Label>Reward Products — Pick by Style <span className="text-xs text-muted-foreground">(select to reveal variants)</span></Label>
                  <div className="border rounded-md p-3 max-h-32 overflow-y-auto space-y-1 bg-background">
                    {!styles || styles.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No styles</p>
                    ) : (
                      styles.map((style) => (
                        <label key={style._id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                          <input
                            type="checkbox"
                            checked={form.pwpRewardStyleIds.includes(style._id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                updateField("pwpRewardStyleIds", [...form.pwpRewardStyleIds, style._id]);
                              } else {
                                const removedStyleId = style._id;
                                const variantsOfStyle = pwpRewardVariants?.filter((v) => v.styleId === removedStyleId).map((v) => v._id as Id<"variants">) ?? [];
                                updateField("pwpRewardStyleIds", form.pwpRewardStyleIds.filter((id) => id !== removedStyleId));
                                if (variantsOfStyle.length > 0) {
                                  updateField("pwpRewardVariantIds", form.pwpRewardVariantIds.filter((vid) => !variantsOfStyle.includes(vid)));
                                }
                              }
                            }}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          {style.name}
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {form.pwpRewardStyleIds.length > 0 && (
                  <div className="space-y-2">
                    <Label>
                      Reward Products — Specific Variants <span className="text-destructive">*</span>
                      {" "}<span className="text-xs text-muted-foreground">(select exact items customer gets at special price)</span>
                    </Label>
                    <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-1 bg-background">
                      {pwpRewardVariants === undefined ? (
                        <p className="text-xs text-muted-foreground">Loading...</p>
                      ) : pwpRewardVariants.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No active variants for selected styles.</p>
                      ) : (
                        pwpRewardVariants.map((variant) => {
                          const styleName = styles?.find((s) => s._id === variant.styleId)?.name ?? "";
                          return (
                            <label key={variant._id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                              <input
                                type="checkbox"
                                checked={form.pwpRewardVariantIds.includes(variant._id as Id<"variants">)}
                                onChange={(e) => {
                                  const vid = variant._id as Id<"variants">;
                                  if (e.target.checked) {
                                    updateField("pwpRewardVariantIds", [...form.pwpRewardVariantIds, vid]);
                                  } else {
                                    updateField("pwpRewardVariantIds", form.pwpRewardVariantIds.filter((id) => id !== vid));
                                  }
                                }}
                                className="h-4 w-4 rounded border-gray-300"
                              />
                              <span className="flex-1 min-w-0">
                                <span className="font-medium">{styleName}</span>
                                <span className="text-muted-foreground"> · {variant.size} · {variant.color}</span>
                              </span>
                              {variant.sku && (
                                <span className="text-xs text-muted-foreground shrink-0">{variant.sku}</span>
                              )}
                            </label>
                          );
                        })
                      )}
                    </div>
                    {form.pwpRewardVariantIds.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {form.pwpRewardVariantIds.length} reward variant{form.pwpRewardVariantIds.length !== 1 ? "s" : ""} selected
                      </p>
                    )}
                  </div>
                )}
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
              <div className="space-y-2">
                {([
                  { value: "all" as const, label: "All Branches" },
                  { value: "byClassification" as const, label: "By Classification" },
                  { value: "specific" as const, label: "Specific Branches" },
                ]).map((option) => (
                  <label key={option.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="branchScopeMode"
                      value={option.value}
                      checked={form.branchScopeMode === option.value}
                      onChange={() => {
                        updateField("branchScopeMode", option.value);
                        if (option.value === "all") {
                          updateField("branchIds", []);
                          updateField("branchClassifications", []);
                        }
                      }}
                      className="h-4 w-4"
                    />
                    {option.label}
                  </label>
                ))}
              </div>

              {form.branchScopeMode === "byClassification" && (
                <div className="border rounded-md p-3 space-y-1">
                  {([
                    { value: "premium" as const, label: "Premium", color: "text-purple-700" },
                    { value: "aclass" as const, label: "A-Class", color: "text-blue-700" },
                    { value: "bnc" as const, label: "BNC", color: "text-green-700" },
                    { value: "outlet" as const, label: "Outlet", color: "text-amber-700" },
                  ]).map((cls) => (
                    <label
                      key={cls.value}
                      className={`flex items-center gap-2 text-sm cursor-pointer py-0.5 ${cls.color}`}
                    >
                      <input
                        type="checkbox"
                        checked={form.branchClassifications.includes(cls.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            updateField("branchClassifications", [...form.branchClassifications, cls.value]);
                          } else {
                            updateField(
                              "branchClassifications",
                              form.branchClassifications.filter((c) => c !== cls.value)
                            );
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      {cls.label}
                    </label>
                  ))}
                  <p className="text-xs text-muted-foreground mt-2">
                    Promotion applies to all branches with the selected classification(s).
                  </p>
                </div>
              )}

              {form.branchScopeMode === "specific" && (
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
                        {branch.classification && (
                          <Badge variant="secondary" className="text-xs ml-1">
                            {branch.classification === "aclass" ? "A-Class" : branch.classification.charAt(0).toUpperCase() + branch.classification.slice(1)}
                          </Badge>
                        )}
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Scope: Product Filters */}
            <div className="space-y-3">
              <Label>
                {form.promoType === "crossSell" || form.promoType === "pwp"
                  ? "Trigger Products (must be in cart)"
                  : "Product Scope"}
              </Label>
              {form.promoType === "crossSell" && (
                <p className="text-xs text-muted-foreground">
                  The discount fires when at least one of these products is in the cart.
                </p>
              )}
              {form.promoType === "pwp" && (
                <p className="text-xs text-muted-foreground">
                  Customer must have at least {form.pwpTriggerMinQuantity || "N"} of these products in their cart.
                </p>
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.allProducts}
                  onChange={(e) => {
                    updateField("allProducts", e.target.checked);
                    if (e.target.checked) {
                      updateField("brandIds", []);
                      updateField("categoryIds", []);
                      updateField("styleIds", []);
                      updateField("genders", []);
                      updateField("selectedColors", []);
                      updateField("selectedSizes", []);
                    }
                  }}
                  className="h-4 w-4 rounded border-gray-300"
                />
                All Products
              </label>
              {!form.allProducts && (
                <div className="space-y-3">
                  {/* Brands */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Brands</p>
                    <div className="border rounded-md p-3 max-h-32 overflow-y-auto space-y-1">
                      {!brands || brands.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No brands</p>
                      ) : (
                        brands.map((brand) => (
                          <label key={brand._id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                            <input
                              type="checkbox"
                              checked={form.brandIds.includes(brand._id as Id<"brands">)}
                              onChange={(e) => {
                                const bid = brand._id as Id<"brands">;
                                if (e.target.checked) {
                                  updateField("brandIds", [...form.brandIds, bid]);
                                } else {
                                  updateField("brandIds", form.brandIds.filter((id) => id !== bid));
                                }
                              }}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            {brand.name}
                          </label>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Categories */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Categories</p>
                    <div className="border rounded-md p-3 max-h-32 overflow-y-auto space-y-1">
                      {!categories || categories.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No categories</p>
                      ) : (
                        categories
                          .filter((cat) => form.brandIds.length === 0 || form.brandIds.includes(cat.brandId))
                          .map((cat) => (
                            <label key={cat._id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                              <input
                                type="checkbox"
                                checked={form.categoryIds.includes(cat._id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    updateField("categoryIds", [...form.categoryIds, cat._id]);
                                  } else {
                                    updateField("categoryIds", form.categoryIds.filter((id) => id !== cat._id));
                                  }
                                }}
                                className="h-4 w-4 rounded border-gray-300"
                              />
                              {cat.name}
                            </label>
                          ))
                      )}
                    </div>
                  </div>

                  {/* Styles */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Styles</p>
                    <div className="border rounded-md p-3 max-h-32 overflow-y-auto space-y-1">
                      {!styles || styles.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No styles</p>
                      ) : (
                        styles
                          .filter((s) => form.categoryIds.length === 0 || form.categoryIds.includes(s.categoryId!))
                          .map((style) => (
                            <label key={style._id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                              <input
                                type="checkbox"
                                checked={form.styleIds.includes(style._id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    updateField("styleIds", [...form.styleIds, style._id]);
                                  } else {
                                    updateField("styleIds", form.styleIds.filter((id) => id !== style._id));
                                  }
                                }}
                                className="h-4 w-4 rounded border-gray-300"
                              />
                              {style.name}
                            </label>
                          ))
                      )}
                    </div>
                  </div>

                  {/* Genders */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Genders</p>
                    <div className="border rounded-md p-3 flex flex-wrap gap-3">
                      {([
                        { value: "mens" as const, label: "Men" },
                        { value: "womens" as const, label: "Women" },
                        { value: "unisex" as const, label: "Unisex" },
                        { value: "kids" as const, label: "Kids" },
                        { value: "boys" as const, label: "Boys" },
                        { value: "girls" as const, label: "Girls" },
                      ]).map((g) => (
                        <label key={g.value} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.genders.includes(g.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                updateField("genders", [...form.genders, g.value]);
                              } else {
                                updateField("genders", form.genders.filter((v) => v !== g.value));
                              }
                            }}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          {g.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Colors */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Colors</p>
                    <div className="border rounded-md p-3 max-h-32 overflow-y-auto space-y-1">
                      {!colorsList || colorsList.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No colors — add them in Colors page</p>
                      ) : (
                        colorsList.filter((c) => c.isActive).map((color) => (
                          <label key={color._id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                            <input
                              type="checkbox"
                              checked={form.selectedColors.includes(color.name)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  updateField("selectedColors", [...form.selectedColors, color.name]);
                                } else {
                                  updateField("selectedColors", form.selectedColors.filter((n) => n !== color.name));
                                }
                              }}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            {color.hexCode && (
                              <span className="w-4 h-4 rounded-full border border-gray-300 inline-block flex-shrink-0" style={{ backgroundColor: color.hexCode }} />
                            )}
                            {color.name}
                          </label>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Size Groups */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Size Groups</p>
                    <div className="border rounded-md p-3 flex flex-wrap gap-3">
                      {!sizesList || sizesList.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No size groups — add them in Sizes page</p>
                      ) : (
                        sizesList.filter((s) => s.isActive).map((size) => (
                          <label key={size._id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={form.selectedSizes.includes(size.name)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  updateField("selectedSizes", [...form.selectedSizes, size.name]);
                                } else {
                                  updateField("selectedSizes", form.selectedSizes.filter((n) => n !== size.name));
                                }
                              }}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            {size.name}
                          </label>
                        ))
                      )}
                    </div>
                  </div>
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

"use client";

import { useState, useRef } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Variant } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { usePagination } from "@/lib/hooks/usePagination";
import { toast } from "sonner";
import Link from "next/link";
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
import { Label } from "@/components/ui/label";
import { TablePagination } from "@/components/shared/TablePagination";
import {
  Pencil,
  Box,
  Plus,
  Search,
  UserCheck,
  XCircle,
  ArrowLeft,
  ImagePlus,
  Trash2,
  Image as ImageIcon,
} from "lucide-react";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function VariantImageThumbnail({ storageId }: { storageId: Id<"_storage"> }) {
  const url = useQuery(api.catalog.images.getImageUrl, { storageId });
  if (!url) {
    return <div className="h-10 w-10 rounded bg-muted animate-pulse" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="Variant image" className="h-10 w-10 rounded object-cover" />
  );
}

const GENDER_LABELS: Record<string, string> = {
  mens: "Men's",
  womens: "Women's",
  unisex: "Unisex",
  kids: "Kids",
};

export default function VariantsPage() {
  const params = useParams();
  const brandId = params.brandId as Id<"brands">;
  const categoryId = params.categoryId as Id<"categories">;
  const styleId = params.styleId as Id<"styles">;

  const brand = useQuery(api.catalog.brands.getBrandById, { brandId });
  const category = useQuery(api.catalog.categories.getCategoryById, {
    categoryId,
  });
  const style = useQuery(api.catalog.styles.getStyleById, { styleId });
  const variants = useQuery(api.catalog.variants.listVariants, { styleId });
  const createVariant = useMutation(api.catalog.variants.createVariant);
  const updateVariant = useMutation(api.catalog.variants.updateVariant);
  const deactivateVariant = useMutation(
    api.catalog.variants.deactivateVariant
  );
  const reactivateVariant = useMutation(
    api.catalog.variants.reactivateVariant
  );

  // Image mutations
  const generateUploadUrl = useMutation(api.catalog.images.generateUploadUrl);
  const saveVariantImage = useMutation(api.catalog.images.saveVariantImage);
  const deleteVariantImage = useMutation(api.catalog.images.deleteVariantImage);
  const deleteStorageFile = useMutation(api.catalog.images.deleteStorageFile);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({
    sku: "",
    barcode: "",
    size: "",
    color: "",
    gender: "" as string,
    price: "",
    costPrice: "",
  });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});

  // Edit dialog state
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
  const [editForm, setEditForm] = useState({
    barcode: "",
    size: "",
    color: "",
    gender: "" as string,
    price: "",
    costPrice: "",
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // Filter variants
  const filteredVariants = variants?.filter((variant) => {
    const matchesSearch =
      searchQuery === "" ||
      variant.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      variant.size.toLowerCase().includes(searchQuery.toLowerCase()) ||
      variant.color.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (variant.barcode && variant.barcode.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && variant.isActive) ||
      (statusFilter === "inactive" && !variant.isActive);
    return matchesSearch && matchesStatus;
  });

  const pagination = usePagination(filteredVariants);

  const resetCreateForm = () => {
    setCreateForm({
      sku: "",
      barcode: "",
      size: "",
      color: "",
      gender: "",
      price: style ? (style.basePriceCentavos / 100).toFixed(2) : "",
      costPrice: "",
    });
    setCreateErrors({});
  };

  const updateCreateField = (field: string, value: string) => {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
    if (createErrors[field]) {
      setCreateErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validateCreateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!createForm.sku.trim()) errors.sku = "SKU is required";
    if (!createForm.size.trim()) errors.size = "Size is required";
    if (!createForm.color.trim()) errors.color = "Color is required";
    if (!createForm.price.trim()) {
      errors.price = "Price is required";
    } else {
      const price = parseFloat(createForm.price);
      if (isNaN(price) || price <= 0) {
        errors.price = "Price must be a positive number";
      }
    }
    setCreateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateCreateForm()) return;

    setIsSubmitting(true);
    try {
      await createVariant({
        styleId,
        sku: createForm.sku.trim(),
        ...(createForm.barcode.trim()
          ? { barcode: createForm.barcode.trim() }
          : {}),
        size: createForm.size.trim(),
        color: createForm.color.trim(),
        ...(createForm.gender && createForm.gender !== "none"
          ? {
              gender: createForm.gender as
                | "mens"
                | "womens"
                | "unisex"
                | "kids",
            }
          : {}),
        priceCentavos: Math.round(parseFloat(createForm.price) * 100),
        ...(createForm.costPrice.trim()
          ? { costPriceCentavos: Math.round(parseFloat(createForm.costPrice) * 100) }
          : {}),
      });
      toast.success("Variant created successfully");
      setShowCreateDialog(false);
      resetCreateForm();
    } catch (error) {
      toast.error(`Failed to create variant: ${getErrorMessage(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (variant: Variant) => {
    setEditingVariant(variant);
    setEditForm({
      barcode: variant.barcode ?? "",
      size: variant.size,
      color: variant.color,
      gender: variant.gender ?? "",
      price: (variant.priceCentavos / 100).toFixed(2),
      costPrice: variant.costPriceCentavos ? (variant.costPriceCentavos / 100).toFixed(2) : "",
    });
    setEditErrors({});
  };

  const updateEditField = (field: string, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
    if (editErrors[field]) {
      setEditErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validateEditForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!editForm.size.trim()) errors.size = "Size is required";
    if (!editForm.color.trim()) errors.color = "Color is required";
    if (!editForm.price.trim()) {
      errors.price = "Price is required";
    } else {
      const price = parseFloat(editForm.price);
      if (isNaN(price) || price <= 0) {
        errors.price = "Price must be a positive number";
      }
    }
    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveEdit = async () => {
    if (!editingVariant || !validateEditForm()) return;

    setIsSubmitting(true);
    try {
      await updateVariant({
        variantId: editingVariant._id,
        barcode: editForm.barcode.trim(),
        size: editForm.size.trim(),
        color: editForm.color.trim(),
        ...(editForm.gender && editForm.gender !== "none"
          ? {
              gender: editForm.gender as
                | "mens"
                | "womens"
                | "unisex"
                | "kids",
            }
          : { clearGender: true }),
        priceCentavos: Math.round(parseFloat(editForm.price) * 100),
        ...(editForm.costPrice.trim()
          ? { costPriceCentavos: Math.round(parseFloat(editForm.costPrice) * 100) }
          : {}),
      });
      toast.success("Variant updated successfully");
      setEditingVariant(null);
    } catch (error) {
      toast.error(`Failed to update variant: ${getErrorMessage(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (variant: Variant) => {
    const confirmed = window.confirm(
      `Deactivate variant "${variant.sku}"?`
    );
    if (!confirmed) return;

    try {
      await deactivateVariant({ variantId: variant._id });
      toast.success(`"${variant.sku}" deactivated`);
    } catch (error) {
      toast.error(`Failed to deactivate: ${getErrorMessage(error)}`);
    }
  };

  const handleReactivate = async (variant: Variant) => {
    try {
      await reactivateVariant({ variantId: variant._id });
      toast.success(`"${variant.sku}" reactivated`);
    } catch (error) {
      toast.error(`Failed to reactivate: ${getErrorMessage(error)}`);
    }
  };

  // Image handlers for variant edit dialog
  const handleVariantImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !editingVariant) return;

    if (editFileInputRef.current) editFileInputRef.current.value = "";

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Invalid file type. Please upload JPEG, PNG, or WebP.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }

    setIsUploading(true);
    let uploadedStorageId: Id<"_storage"> | null = null;
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!result.ok) {
        throw new Error("Image upload failed");
      }
      const { storageId } = await result.json();
      uploadedStorageId = storageId;
      await saveVariantImage({ variantId: editingVariant._id, storageId });
      setEditingVariant((prev) => prev ? { ...prev, storageId } : null);
      toast.success("Variant image uploaded");
    } catch (error) {
      if (uploadedStorageId) {
        try { await deleteStorageFile({ storageId: uploadedStorageId }); } catch { /* best-effort cleanup */ }
      }
      toast.error(`Failed to upload image: ${getErrorMessage(error)}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteVariantImage = async () => {
    if (!editingVariant) return;
    const confirmed = window.confirm("Delete this variant image?");
    if (!confirmed) return;

    try {
      await deleteVariantImage({ variantId: editingVariant._id });
      setEditingVariant((prev) => prev ? { ...prev, storageId: undefined } : null);
      toast.success("Variant image deleted");
    } catch (error) {
      toast.error(`Failed to delete image: ${getErrorMessage(error)}`);
    }
  };

  // Loading state
  if (
    brand === undefined ||
    category === undefined ||
    style === undefined ||
    variants === undefined
  ) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Variants</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (
    brand === null ||
    category === null ||
    style === null ||
    (category && category.brandId !== brandId) ||
    (style && style.categoryId !== categoryId)
  ) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/catalog"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Catalog
        </Link>
        <h1 className="text-2xl font-bold">Not Found</h1>
        <p className="text-muted-foreground">
          The requested brand, category, or style does not exist.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
        <Link
          href="/admin/catalog"
          className="hover:text-foreground transition-colors"
        >
          Catalog
        </Link>
        <span>/</span>
        <Link
          href={`/admin/catalog/brands/${brandId}`}
          className="hover:text-foreground transition-colors"
        >
          {brand.name}
        </Link>
        <span>/</span>
        <Link
          href={`/admin/catalog/brands/${brandId}/categories/${categoryId}`}
          className="hover:text-foreground transition-colors"
        >
          {category.name}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{style.name}</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{style.name}</h1>
            <Badge variant={style.isActive ? "default" : "destructive"}>
              {style.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Base price: {formatCurrency(style.basePriceCentavos)} &middot;{" "}
            {filteredVariants?.length ?? 0} variant
            {(filteredVariants?.length ?? 0) !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          onClick={() => {
            resetCreateForm();
            setShowCreateDialog(true);
          }}
          disabled={!style.isActive}
          title={
            style.isActive
              ? "Create new variant"
              : "Cannot add variants to inactive style"
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          New Variant
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by SKU, barcode, size, or color..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Variants Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Image</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>SRP</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.paginatedData.length > 0 ? (
              pagination.paginatedData.map((variant) => (
                <TableRow key={variant._id}>
                  <TableCell>
                    {variant.storageId ? (
                      <VariantImageThumbnail storageId={variant.storageId} />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Box className="h-4 w-4 text-muted-foreground" />
                      {variant.sku}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {variant.barcode || "—"}
                  </TableCell>
                  <TableCell>{variant.size}</TableCell>
                  <TableCell>{variant.color}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {variant.gender
                      ? GENDER_LABELS[variant.gender] ?? variant.gender
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {formatCurrency(variant.priceCentavos)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {variant.costPriceCentavos
                      ? formatCurrency(variant.costPriceCentavos)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={variant.isActive ? "default" : "destructive"}
                    >
                      {variant.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(variant)}
                        title="Edit variant"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {variant.isActive ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeactivate(variant)}
                          title="Deactivate variant"
                        >
                          <XCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReactivate(variant)}
                          title="Reactivate variant"
                        >
                          <UserCheck className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-muted-foreground py-8"
                >
                  {searchQuery || statusFilter !== "all"
                    ? "No variants match the current filters"
                    : "No variants yet. Create the first variant for this style."}
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
        noun="variant"
      />

      {/* Create Variant Dialog */}
      <Dialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            resetCreateForm();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Variant for {style.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-var-sku">
                SKU <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-var-sku"
                placeholder="e.g. NKE-AM90-BLK-42"
                value={createForm.sku}
                onChange={(e) => updateCreateField("sku", e.target.value)}
                className={createErrors.sku ? "border-destructive" : ""}
              />
              {createErrors.sku && (
                <p className="text-sm text-destructive">{createErrors.sku}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-var-barcode">Barcode</Label>
              <Input
                id="create-var-barcode"
                placeholder="Optional barcode"
                value={createForm.barcode}
                onChange={(e) =>
                  updateCreateField("barcode", e.target.value)
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="create-var-size">
                  Size <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="create-var-size"
                  placeholder="e.g. 42, M, XL"
                  value={createForm.size}
                  onChange={(e) => updateCreateField("size", e.target.value)}
                  className={createErrors.size ? "border-destructive" : ""}
                />
                {createErrors.size && (
                  <p className="text-sm text-destructive">
                    {createErrors.size}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-var-color">
                  Color <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="create-var-color"
                  placeholder="e.g. Black, Red"
                  value={createForm.color}
                  onChange={(e) => updateCreateField("color", e.target.value)}
                  className={createErrors.color ? "border-destructive" : ""}
                />
                {createErrors.color && (
                  <p className="text-sm text-destructive">
                    {createErrors.color}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select
                  value={createForm.gender || "none"}
                  onValueChange={(val) => updateCreateField("gender", val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    <SelectItem value="mens">Men&apos;s</SelectItem>
                    <SelectItem value="womens">Women&apos;s</SelectItem>
                    <SelectItem value="unisex">Unisex</SelectItem>
                    <SelectItem value="kids">Kids</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-var-price">
                  SRP (₱) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="create-var-price"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="e.g. 149.99"
                  value={createForm.price}
                  onChange={(e) => updateCreateField("price", e.target.value)}
                  className={createErrors.price ? "border-destructive" : ""}
                />
                {createErrors.price && (
                  <p className="text-sm text-destructive">
                    {createErrors.price}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-var-costprice">Cost Price (₱)</Label>
                <Input
                  id="create-var-costprice"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="Base price for branches"
                  value={createForm.costPrice}
                  onChange={(e) => updateCreateField("costPrice", e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                resetCreateForm();
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Variant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Variant Dialog */}
      <Dialog
        open={editingVariant !== null}
        onOpenChange={(open) => !open && setEditingVariant(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Variant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>SKU</Label>
              <Input value={editingVariant?.sku ?? ""} disabled />
              <p className="text-xs text-muted-foreground">
                SKU cannot be changed after creation
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-var-barcode">Barcode</Label>
              <Input
                id="edit-var-barcode"
                placeholder="Optional barcode"
                value={editForm.barcode}
                onChange={(e) =>
                  updateEditField("barcode", e.target.value)
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-var-size">
                  Size <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-var-size"
                  value={editForm.size}
                  onChange={(e) => updateEditField("size", e.target.value)}
                  className={editErrors.size ? "border-destructive" : ""}
                />
                {editErrors.size && (
                  <p className="text-sm text-destructive">
                    {editErrors.size}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-var-color">
                  Color <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-var-color"
                  value={editForm.color}
                  onChange={(e) => updateEditField("color", e.target.value)}
                  className={editErrors.color ? "border-destructive" : ""}
                />
                {editErrors.color && (
                  <p className="text-sm text-destructive">
                    {editErrors.color}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select
                  value={editForm.gender || "none"}
                  onValueChange={(val) => updateEditField("gender", val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    <SelectItem value="mens">Men&apos;s</SelectItem>
                    <SelectItem value="womens">Women&apos;s</SelectItem>
                    <SelectItem value="unisex">Unisex</SelectItem>
                    <SelectItem value="kids">Kids</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-var-price">
                  SRP (₱) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-var-price"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={editForm.price}
                  onChange={(e) => updateEditField("price", e.target.value)}
                  className={editErrors.price ? "border-destructive" : ""}
                />
                {editErrors.price && (
                  <p className="text-sm text-destructive">
                    {editErrors.price}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-var-costprice">Cost Price (₱)</Label>
                <Input
                  id="edit-var-costprice"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="Base price for branches"
                  value={editForm.costPrice}
                  onChange={(e) => updateEditField("costPrice", e.target.value)}
                />
              </div>
            </div>
            {/* Variant Image */}
            <div className="space-y-2">
              <Label>Variant Image</Label>
              <input
                ref={editFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleVariantImageUpload}
              />
              {editingVariant?.storageId ? (
                <div className="flex items-center gap-3">
                  <VariantImageThumbnail storageId={editingVariant.storageId} />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => editFileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      <ImagePlus className="mr-1 h-3 w-3" />
                      {isUploading ? "Uploading..." : "Replace"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteVariantImage}
                      disabled={isUploading}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Delete
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => editFileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    <ImagePlus className="mr-1 h-3 w-3" />
                    {isUploading ? "Uploading..." : "Upload Image"}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">
                    JPEG, PNG, or WebP. Max 5MB.
                  </p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingVariant(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

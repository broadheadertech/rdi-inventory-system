"use client";

import { useState, useRef } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Style } from "@/lib/types";
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
  Layers,
  Plus,
  Search,
  UserCheck,
  XCircle,
  ChevronRight,
  ArrowLeft,
  ImagePlus,
  Trash2,
  Star,
  Image as ImageIcon,
  X,
} from "lucide-react";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function StylePrimaryThumbnail({ styleId }: { styleId: Id<"styles"> }) {
  const url = useQuery(api.catalog.images.getStylePrimaryImageUrl, { styleId });

  if (!url) {
    return (
      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Primary product image"
      className="h-10 w-10 rounded object-cover"
    />
  );
}

function ImageThumbnail({ storageId }: { storageId: Id<"_storage"> }) {
  const url = useQuery(api.catalog.images.getImageUrl, { storageId });
  if (!url) {
    return <div className="h-20 w-20 rounded bg-muted animate-pulse" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Product image"
      className="h-20 w-20 rounded object-cover"
    />
  );
}

export default function StylesPage() {
  const params = useParams();
  const brandId = params.brandId as Id<"brands">;
  const categoryId = params.categoryId as Id<"categories">;

  const brand = useQuery(api.catalog.brands.getBrandById, { brandId });
  const category = useQuery(api.catalog.categories.getCategoryById, {
    categoryId,
  });
  const styles = useQuery(api.catalog.styles.listStyles, { categoryId });
  const createStyle = useMutation(api.catalog.styles.createStyle);
  const updateStyle = useMutation(api.catalog.styles.updateStyle);
  const deactivateStyle = useMutation(api.catalog.styles.deactivateStyle);
  const reactivateStyle = useMutation(api.catalog.styles.reactivateStyle);

  // Image mutations
  const generateUploadUrl = useMutation(api.catalog.images.generateUploadUrl);
  const saveStyleImage = useMutation(api.catalog.images.saveStyleImage);
  const deleteStyleImage = useMutation(api.catalog.images.deleteStyleImage);
  const setPrimaryImage = useMutation(api.catalog.images.setPrimaryImage);
  const deleteStorageFile = useMutation(api.catalog.images.deleteStorageFile);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Image gallery state
  const [selectedStyleId, setSelectedStyleId] = useState<Id<"styles"> | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Query images for selected style
  const styleImages = useQuery(
    api.catalog.images.listStyleImages,
    selectedStyleId ? { styleId: selectedStyleId } : "skip"
  );

  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    basePrice: "",
  });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});

  // Edit dialog state
  const [editingStyle, setEditingStyle] = useState<Style | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    basePrice: "",
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // Filter styles
  const filteredStyles = styles?.filter((style) => {
    const matchesSearch =
      searchQuery === "" ||
      style.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && style.isActive) ||
      (statusFilter === "inactive" && !style.isActive);
    return matchesSearch && matchesStatus;
  });

  const pagination = usePagination(filteredStyles);

  const resetCreateForm = () => {
    setCreateForm({ name: "", description: "", basePrice: "" });
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
    if (!createForm.name.trim()) errors.name = "Name is required";
    if (!createForm.basePrice.trim()) {
      errors.basePrice = "Base price is required";
    } else {
      const price = parseFloat(createForm.basePrice);
      if (isNaN(price) || price <= 0) {
        errors.basePrice = "Price must be a positive number";
      }
    }
    setCreateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateCreateForm()) return;

    setIsSubmitting(true);
    try {
      await createStyle({
        categoryId,
        name: createForm.name.trim(),
        ...(createForm.description.trim()
          ? { description: createForm.description.trim() }
          : {}),
        basePriceCentavos: Math.round(
          parseFloat(createForm.basePrice) * 100
        ),
      });
      toast.success("Style created successfully");
      setShowCreateDialog(false);
      resetCreateForm();
    } catch (error) {
      toast.error(`Failed to create style: ${getErrorMessage(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (style: Style) => {
    setEditingStyle(style);
    setEditForm({
      name: style.name,
      description: style.description ?? "",
      basePrice: (style.basePriceCentavos / 100).toFixed(2),
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
    if (!editForm.name.trim()) errors.name = "Name is required";
    if (!editForm.basePrice.trim()) {
      errors.basePrice = "Base price is required";
    } else {
      const price = parseFloat(editForm.basePrice);
      if (isNaN(price) || price <= 0) {
        errors.basePrice = "Price must be a positive number";
      }
    }
    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveEdit = async () => {
    if (!editingStyle || !validateEditForm()) return;

    setIsSubmitting(true);
    try {
      await updateStyle({
        styleId: editingStyle._id,
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        basePriceCentavos: Math.round(parseFloat(editForm.basePrice) * 100),
      });
      toast.success("Style updated successfully");
      setEditingStyle(null);
    } catch (error) {
      toast.error(`Failed to update style: ${getErrorMessage(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (style: Style) => {
    const confirmed = window.confirm(
      `Deactivate style "${style.name}"? Existing variants will remain.`
    );
    if (!confirmed) return;

    try {
      await deactivateStyle({ styleId: style._id });
      toast.success(`"${style.name}" deactivated`);
    } catch (error) {
      toast.error(`Failed to deactivate: ${getErrorMessage(error)}`);
    }
  };

  const handleReactivate = async (style: Style) => {
    try {
      await reactivateStyle({ styleId: style._id });
      toast.success(`"${style.name}" reactivated`);
    } catch (error) {
      toast.error(`Failed to reactivate: ${getErrorMessage(error)}`);
    }
  };

  // Image handlers
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedStyleId) return;

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";

    // Validate file type
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Invalid file type. Please upload JPEG, PNG, or WebP.");
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }

    setIsUploading(true);
    let uploadedStorageId: Id<"_storage"> | null = null;
    try {
      // Step 1: Get upload URL
      const uploadUrl = await generateUploadUrl();

      // Step 2: Upload file
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

      // Step 3: Save reference
      await saveStyleImage({ styleId: selectedStyleId, storageId });
      toast.success("Image uploaded successfully");
    } catch (error) {
      if (uploadedStorageId) {
        try { await deleteStorageFile({ storageId: uploadedStorageId }); } catch { /* best-effort cleanup */ }
      }
      toast.error(`Failed to upload image: ${getErrorMessage(error)}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteImage = async (imageId: Id<"productImages">) => {
    const confirmed = window.confirm("Delete this image?");
    if (!confirmed) return;

    try {
      await deleteStyleImage({ imageId });
      toast.success("Image deleted");
    } catch (error) {
      toast.error(`Failed to delete image: ${getErrorMessage(error)}`);
    }
  };

  const handleSetPrimary = async (imageId: Id<"productImages">) => {
    try {
      await setPrimaryImage({ imageId });
      toast.success("Primary image updated");
    } catch (error) {
      toast.error(`Failed to set primary: ${getErrorMessage(error)}`);
    }
  };

  const selectedStyleName = selectedStyleId
    ? styles?.find((s) => s._id === selectedStyleId)?.name
    : null;

  // Loading state
  if (
    brand === undefined ||
    category === undefined ||
    styles === undefined
  ) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Styles</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (brand === null || category === null || (category && category.brandId !== brandId)) {
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
          The requested brand or category does not exist.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
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
        <span className="text-foreground font-medium">{category.name}</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{category.name}</h1>
            <Badge variant={category.isActive ? "default" : "destructive"}>
              {category.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {filteredStyles?.length ?? 0} style
            {(filteredStyles?.length ?? 0) !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          disabled={!category.isActive}
          title={
            category.isActive
              ? "Create new style"
              : "Cannot add styles to inactive category"
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          New Style
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by style name..."
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

      {/* Styles Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Image</TableHead>
              <TableHead>Style</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Base Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.paginatedData.length > 0 ? (
              pagination.paginatedData.map((style) => (
                <TableRow key={style._id}>
                  <TableCell>
                    <StylePrimaryThumbnail styleId={style._id} />
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/catalog/brands/${brandId}/categories/${categoryId}/styles/${style._id}`}
                      className="flex items-center gap-2 hover:text-primary transition-colors"
                    >
                      <Layers className="h-4 w-4 text-muted-foreground" />
                      {style.name}
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate">
                    {style.description || "—"}
                  </TableCell>
                  <TableCell>
                    {formatCurrency(style.basePriceCentavos)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={style.isActive ? "default" : "destructive"}
                    >
                      {style.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedStyleId(
                          selectedStyleId === style._id ? null : style._id
                        )}
                        title="Manage images"
                      >
                        <ImagePlus className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(style)}
                        title="Edit style"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {style.isActive ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeactivate(style)}
                          title="Deactivate style"
                        >
                          <XCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReactivate(style)}
                          title="Reactivate style"
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
                  colSpan={6}
                  className="text-center text-muted-foreground py-8"
                >
                  {searchQuery || statusFilter !== "all"
                    ? "No styles match the current filters"
                    : "No styles yet. Create the first style for this category."}
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
        noun="style"
      />

      {/* Image Gallery for Selected Style */}
      {selectedStyleId && (
        <div className="rounded-md border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Images for {selectedStyleName}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedStyleId(null)}
              title="Close gallery"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Upload button */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleImageUpload}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || (styleImages?.length ?? 0) >= 5}
            >
              <ImagePlus className="mr-2 h-4 w-4" />
              {isUploading
                ? "Uploading..."
                : (styleImages?.length ?? 0) >= 5
                  ? "Max 5 images"
                  : "Upload Image"}
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              JPEG, PNG, or WebP. Max 5MB. {styleImages?.length ?? 0}/5 images.
            </p>
          </div>

          {/* Gallery grid */}
          {styleImages && styleImages.length > 0 ? (
            <div className="flex flex-wrap gap-4">
              {styleImages.map((img) => (
                <div
                  key={img._id}
                  className="relative group border rounded-lg p-1"
                >
                  <ImageThumbnail storageId={img.storageId} />
                  {img.isPrimary && (
                    <Badge className="absolute top-2 left-2 text-xs" variant="default">
                      Primary
                    </Badge>
                  )}
                  <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!img.isPrimary && (
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleSetPrimary(img._id)}
                        title="Set as primary"
                      >
                        <Star className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleDeleteImage(img._id)}
                      title="Delete image"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No images yet. Upload the first image for this style.
            </p>
          )}
        </div>
      )}

      {/* Create Style Dialog */}
      <Dialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            resetCreateForm();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Style in {category.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-style-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-style-name"
                placeholder="e.g. Air Max 90, Ultraboost 22"
                value={createForm.name}
                onChange={(e) => updateCreateField("name", e.target.value)}
                className={createErrors.name ? "border-destructive" : ""}
              />
              {createErrors.name && (
                <p className="text-sm text-destructive">{createErrors.name}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-style-desc">Description</Label>
              <Input
                id="create-style-desc"
                placeholder="Optional description"
                value={createForm.description}
                onChange={(e) =>
                  updateCreateField("description", e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-style-price">
                Base Price (₱) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-style-price"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="e.g. 149.99"
                value={createForm.basePrice}
                onChange={(e) =>
                  updateCreateField("basePrice", e.target.value)
                }
                className={createErrors.basePrice ? "border-destructive" : ""}
              />
              {createErrors.basePrice && (
                <p className="text-sm text-destructive">
                  {createErrors.basePrice}
                </p>
              )}
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
              {isSubmitting ? "Creating..." : "Create Style"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Style Dialog */}
      <Dialog
        open={editingStyle !== null}
        onOpenChange={(open) => !open && setEditingStyle(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Style</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-style-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-style-name"
                value={editForm.name}
                onChange={(e) => updateEditField("name", e.target.value)}
                className={editErrors.name ? "border-destructive" : ""}
              />
              {editErrors.name && (
                <p className="text-sm text-destructive">{editErrors.name}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-style-desc">Description</Label>
              <Input
                id="edit-style-desc"
                placeholder="Optional description"
                value={editForm.description}
                onChange={(e) =>
                  updateEditField("description", e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-style-price">
                Base Price (₱) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-style-price"
                type="number"
                step="0.01"
                min="0.01"
                value={editForm.basePrice}
                onChange={(e) =>
                  updateEditField("basePrice", e.target.value)
                }
                className={editErrors.basePrice ? "border-destructive" : ""}
              />
              {editErrors.basePrice && (
                <p className="text-sm text-destructive">
                  {editErrors.basePrice}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingStyle(null)}
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

"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Brand } from "@/lib/types";
import type { Id } from "@/convex/_generated/dataModel";
import { getErrorMessage } from "@/lib/utils";
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
import {
  Pencil,
  Package,
  Plus,
  Search,
  UserCheck,
  XCircle,
  ChevronRight,
  Upload,
  ImageIcon,
  Trash2,
  Loader2,
} from "lucide-react";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

type BrandListItem = Brand & { imageUrl: string | null };

export default function CatalogPage() {
  const brands = useQuery(api.catalog.brands.listBrands) as BrandListItem[] | undefined;
  const createBrand = useMutation(api.catalog.brands.createBrand);
  const updateBrand = useMutation(api.catalog.brands.updateBrand);
  const deactivateBrand = useMutation(api.catalog.brands.deactivateBrand);
  const reactivateBrand = useMutation(api.catalog.brands.reactivateBrand);
  const generateUploadUrl = useMutation(api.catalog.images.generateUploadUrl);
  const saveBrandImage = useMutation(api.catalog.brands.saveBrandImage);
  const deleteBrandImage = useMutation(api.catalog.brands.deleteBrandImage);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "" });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [createPendingFile, setCreatePendingFile] = useState<File | null>(null);
  const [createPreviewUrl, setCreatePreviewUrl] = useState<string | null>(null);
  const createFileRef = useRef<HTMLInputElement>(null);

  // Edit dialog state
  const [editingBrand, setEditingBrand] = useState<BrandListItem | null>(null);
  const [editForm, setEditForm] = useState({ name: "" });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [isUploadingEditImage, setIsUploadingEditImage] = useState(false);
  const editFileRef = useRef<HTMLInputElement>(null);

  // Filter brands
  const filteredBrands = brands?.filter((brand) => {
    const matchesSearch =
      searchQuery === "" ||
      brand.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && brand.isActive) ||
      (statusFilter === "inactive" && !brand.isActive);
    return matchesSearch && matchesStatus;
  });

  const pagination = usePagination(filteredBrands);

  // ─── Create dialog helpers ──────────────────────────────────────────────────

  const resetCreateForm = () => {
    setCreateForm({ name: "" });
    setCreateErrors({});
    setCreatePendingFile(null);
    if (createPreviewUrl) URL.revokeObjectURL(createPreviewUrl);
    setCreatePreviewUrl(null);
  };

  const validateCreateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!createForm.name.trim()) errors.name = "Name is required";
    setCreateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Invalid file type. Please upload JPEG, PNG, or WebP.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }
    if (createPreviewUrl) URL.revokeObjectURL(createPreviewUrl);
    setCreatePendingFile(file);
    setCreatePreviewUrl(URL.createObjectURL(file));
  };

  const handleCreate = async () => {
    if (!validateCreateForm()) return;

    setIsSubmitting(true);
    try {
      const brandId = await createBrand({ name: createForm.name.trim() });

      // Upload image if one was selected
      if (createPendingFile) {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": createPendingFile.type },
          body: createPendingFile,
        });
        const { storageId } = await result.json();
        await saveBrandImage({ brandId: brandId as Id<"brands">, storageId });
      }

      toast.success("Brand created successfully");
      setShowCreateDialog(false);
      resetCreateForm();
    } catch (error) {
      toast.error(`Failed to create brand: ${getErrorMessage(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Edit dialog helpers ────────────────────────────────────────────────────

  const openEditDialog = (brand: BrandListItem) => {
    setEditingBrand(brand);
    setEditForm({ name: brand.name });
    setEditErrors({});
  };

  const validateEditForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!editForm.name.trim()) errors.name = "Name is required";
    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveEdit = async () => {
    if (!editingBrand || !validateEditForm()) return;

    setIsSubmitting(true);
    try {
      await updateBrand({
        brandId: editingBrand._id,
        name: editForm.name.trim(),
      });
      toast.success("Brand updated successfully");
      setEditingBrand(null);
    } catch (error) {
      toast.error(`Failed to update brand: ${getErrorMessage(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingBrand) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Invalid file type. Please upload JPEG, PNG, or WebP.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }

    setIsUploadingEditImage(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json();
      await saveBrandImage({ brandId: editingBrand._id, storageId });
      toast.success("Brand image updated");
    } catch (error) {
      toast.error(`Failed to upload image: ${getErrorMessage(error)}`);
    } finally {
      setIsUploadingEditImage(false);
      // Reset file input
      if (editFileRef.current) editFileRef.current.value = "";
    }
  };

  const handleEditImageDelete = async () => {
    if (!editingBrand) return;

    setIsUploadingEditImage(true);
    try {
      await deleteBrandImage({ brandId: editingBrand._id });
      toast.success("Brand image removed");
    } catch (error) {
      toast.error(`Failed to remove image: ${getErrorMessage(error)}`);
    } finally {
      setIsUploadingEditImage(false);
    }
  };

  // ─── Deactivate / Reactivate ───────────────────────────────────────────────

  const handleDeactivate = async (brand: BrandListItem) => {
    const confirmed = window.confirm(
      `Deactivate brand "${brand.name}"? Existing products will remain, but no new products can be added.`
    );
    if (!confirmed) return;

    try {
      await deactivateBrand({ brandId: brand._id });
      toast.success(`"${brand.name}" deactivated`);
    } catch (error) {
      toast.error(`Failed to deactivate: ${getErrorMessage(error)}`);
    }
  };

  const handleReactivate = async (brand: BrandListItem) => {
    try {
      await reactivateBrand({ brandId: brand._id });
      toast.success(`"${brand.name}" reactivated`);
    } catch (error) {
      toast.error(`Failed to reactivate: ${getErrorMessage(error)}`);
    }
  };

  if (brands === undefined) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Product Catalog</h1>
        <p className="text-muted-foreground">Loading brands...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Product Catalog</h1>
          <p className="text-sm text-muted-foreground">
            {filteredBrands?.length ?? 0} brand
            {(filteredBrands?.length ?? 0) !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/catalog/import">
            <Button variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Import Products
            </Button>
          </Link>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Brand
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by brand name..."
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

      {/* Brands Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Brand</TableHead>
              <TableHead>Image</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.paginatedData.length > 0 ? (
              pagination.paginatedData.map((brand) => (
                <TableRow key={brand._id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/catalog/brands/${brand._id}`}
                      className="flex items-center gap-2 hover:text-primary transition-colors"
                    >
                      {brand.imageUrl ? (
                        <img
                          src={brand.imageUrl}
                          alt={brand.name}
                          className="h-8 w-8 rounded object-cover"
                        />
                      ) : (
                        <Package className="h-4 w-4 text-muted-foreground" />
                      )}
                      {brand.name}
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    </Link>
                  </TableCell>
                  <TableCell>
                    {brand.imageUrl ? (
                      <img
                        src={brand.imageUrl}
                        alt=""
                        className="h-8 w-8 rounded object-cover"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">None</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={brand.isActive ? "default" : "destructive"}
                    >
                      {brand.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(brand)}
                        title="Edit brand"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {brand.isActive ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeactivate(brand)}
                          title="Deactivate brand"
                        >
                          <XCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReactivate(brand)}
                          title="Reactivate brand"
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
                  colSpan={4}
                  className="text-center text-muted-foreground py-8"
                >
                  {searchQuery || statusFilter !== "all"
                    ? "No brands match the current filters"
                    : "No brands found. Create your first brand to get started."}
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
        noun="brand"
      />

      {/* Create Brand Dialog */}
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
            <DialogTitle>Create New Brand</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-name"
                placeholder="e.g. Nike, Adidas"
                value={createForm.name}
                onChange={(e) => {
                  setCreateForm({ name: e.target.value });
                  if (createErrors.name) {
                    setCreateErrors((prev) => {
                      const next = { ...prev };
                      delete next.name;
                      return next;
                    });
                  }
                }}
                className={createErrors.name ? "border-destructive" : ""}
              />
              {createErrors.name && (
                <p className="text-sm text-destructive">{createErrors.name}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Brand Image</Label>
              <input
                ref={createFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleCreateFileSelect}
              />
              {createPreviewUrl ? (
                <div className="flex items-center gap-3">
                  <img
                    src={createPreviewUrl}
                    alt="Preview"
                    className="h-16 w-16 rounded-lg object-cover border"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => createFileRef.current?.click()}
                    >
                      Change
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCreatePendingFile(null);
                        if (createPreviewUrl) URL.revokeObjectURL(createPreviewUrl);
                        setCreatePreviewUrl(null);
                        if (createFileRef.current) createFileRef.current.value = "";
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => createFileRef.current?.click()}
                >
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Upload Image
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                JPEG, PNG, or WebP. Max 5MB.
              </p>
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
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Brand"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Brand Dialog */}
      <Dialog
        open={editingBrand !== null}
        onOpenChange={(open) => !open && setEditingBrand(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Brand</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => {
                  setEditForm({ name: e.target.value });
                  if (editErrors.name) {
                    setEditErrors((prev) => {
                      const next = { ...prev };
                      delete next.name;
                      return next;
                    });
                  }
                }}
                className={editErrors.name ? "border-destructive" : ""}
              />
              {editErrors.name && (
                <p className="text-sm text-destructive">{editErrors.name}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Brand Image</Label>
              <input
                ref={editFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleEditImageUpload}
              />
              {editingBrand?.imageUrl ? (
                <div className="flex items-center gap-3">
                  <img
                    src={editingBrand.imageUrl}
                    alt={editingBrand.name}
                    className="h-16 w-16 rounded-lg object-cover border"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => editFileRef.current?.click()}
                      disabled={isUploadingEditImage}
                    >
                      {isUploadingEditImage ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Replace"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleEditImageDelete}
                      disabled={isUploadingEditImage}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => editFileRef.current?.click()}
                  disabled={isUploadingEditImage}
                >
                  {isUploadingEditImage ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="mr-2 h-4 w-4" />
                      Upload Image
                    </>
                  )}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                JPEG, PNG, or WebP. Max 5MB.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingBrand(null)}
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

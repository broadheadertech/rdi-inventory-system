"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Category } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";
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
  FolderOpen,
  Plus,
  Search,
  UserCheck,
  XCircle,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";

export default function BrandCategoriesPage() {
  const params = useParams();
  const brandId = params.brandId as Id<"brands">;

  const brand = useQuery(api.catalog.brands.getBrandById, { brandId });
  const categories = useQuery(api.catalog.categories.listCategories, {
    brandId,
  });
  const createCategory = useMutation(api.catalog.categories.createCategory);
  const updateCategory = useMutation(api.catalog.categories.updateCategory);
  const deactivateCategory = useMutation(
    api.catalog.categories.deactivateCategory
  );
  const reactivateCategory = useMutation(
    api.catalog.categories.reactivateCategory
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "" });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});

  // Edit dialog state
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editForm, setEditForm] = useState({ name: "" });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // Filter categories
  const filteredCategories = categories?.filter((category) => {
    const matchesSearch =
      searchQuery === "" ||
      category.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && category.isActive) ||
      (statusFilter === "inactive" && !category.isActive);
    return matchesSearch && matchesStatus;
  });

  const pagination = usePagination(filteredCategories);

  const resetCreateForm = () => {
    setCreateForm({ name: "" });
    setCreateErrors({});
  };

  const validateCreateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!createForm.name.trim()) errors.name = "Name is required";
    setCreateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateCreateForm()) return;

    setIsSubmitting(true);
    try {
      await createCategory({
        brandId,
        name: createForm.name.trim(),
      });
      toast.success("Category created successfully");
      setShowCreateDialog(false);
      resetCreateForm();
    } catch (error) {
      toast.error(`Failed to create category: ${getErrorMessage(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (category: Category) => {
    setEditingCategory(category);
    setEditForm({ name: category.name });
    setEditErrors({});
  };

  const validateEditForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!editForm.name.trim()) errors.name = "Name is required";
    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveEdit = async () => {
    if (!editingCategory || !validateEditForm()) return;

    setIsSubmitting(true);
    try {
      await updateCategory({
        categoryId: editingCategory._id,
        name: editForm.name.trim(),
      });
      toast.success("Category updated successfully");
      setEditingCategory(null);
    } catch (error) {
      toast.error(`Failed to update category: ${getErrorMessage(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (category: Category) => {
    const confirmed = window.confirm(
      `Deactivate category "${category.name}"? Existing products will remain.`
    );
    if (!confirmed) return;

    try {
      await deactivateCategory({ categoryId: category._id });
      toast.success(`"${category.name}" deactivated`);
    } catch (error) {
      toast.error(`Failed to deactivate: ${getErrorMessage(error)}`);
    }
  };

  const handleReactivate = async (category: Category) => {
    try {
      await reactivateCategory({ categoryId: category._id });
      toast.success(`"${category.name}" reactivated`);
    } catch (error) {
      toast.error(`Failed to reactivate: ${getErrorMessage(error)}`);
    }
  };

  // Loading state
  if (brand === undefined || categories === undefined) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Categories</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (brand === null) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/catalog"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Catalog
        </Link>
        <h1 className="text-2xl font-bold">Brand Not Found</h1>
        <p className="text-muted-foreground">
          The requested brand does not exist or has been removed.
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
        <span className="text-foreground font-medium">{brand.name}</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{brand.name}</h1>
            <Badge variant={brand.isActive ? "default" : "destructive"}>
              {brand.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {filteredCategories?.length ?? 0} categor
            {(filteredCategories?.length ?? 0) !== 1 ? "ies" : "y"}
          </p>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          disabled={!brand.isActive}
          title={
            brand.isActive
              ? "Create new category"
              : "Cannot add categories to inactive brand"
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          New Category
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by category name..."
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

      {/* Categories Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.paginatedData.length > 0 ? (
              pagination.paginatedData.map((category) => (
                <TableRow key={category._id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/catalog/brands/${brandId}/categories/${category._id}`}
                      className="flex items-center gap-2 hover:text-primary transition-colors group"
                    >
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                      {category.name}
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={category.isActive ? "default" : "destructive"}
                    >
                      {category.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(category)}
                        title="Edit category"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {category.isActive ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeactivate(category)}
                          title="Deactivate category"
                        >
                          <XCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReactivate(category)}
                          title="Reactivate category"
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
                  colSpan={3}
                  className="text-center text-muted-foreground py-8"
                >
                  {searchQuery || statusFilter !== "all"
                    ? "No categories match the current filters"
                    : "No categories yet. Create the first category for this brand."}
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
        noun="category"
      />

      {/* Create Category Dialog */}
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
            <DialogTitle>Create Category for {brand.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-cat-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-cat-name"
                placeholder="e.g. Shoes, Apparel, Accessories"
                value={createForm.name}
                onChange={(e) => {
                  setCreateForm({ name: e.target.value });
                  if (createErrors.name) {
                    setCreateErrors({});
                  }
                }}
                className={createErrors.name ? "border-destructive" : ""}
              />
              {createErrors.name && (
                <p className="text-sm text-destructive">{createErrors.name}</p>
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
              {isSubmitting ? "Creating..." : "Create Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Category Dialog */}
      <Dialog
        open={editingCategory !== null}
        onOpenChange={(open) => !open && setEditingCategory(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-cat-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-cat-name"
                value={editForm.name}
                onChange={(e) => {
                  setEditForm({ name: e.target.value });
                  if (editErrors.name) {
                    setEditErrors({});
                  }
                }}
                className={editErrors.name ? "border-destructive" : ""}
              />
              {editErrors.name && (
                <p className="text-sm text-destructive">{editErrors.name}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingCategory(null)}
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

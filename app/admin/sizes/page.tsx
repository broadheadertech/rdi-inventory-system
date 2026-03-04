"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";
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
import { Pencil, Plus, ToggleLeft, ToggleRight } from "lucide-react";

export default function SizesPage() {
  const sizes = useQuery(api.admin.sizes.listSizes);
  const createSize = useMutation(api.admin.sizes.createSize);
  const updateSize = useMutation(api.admin.sizes.updateSize);
  const toggleStatus = useMutation(api.admin.sizes.toggleSizeStatus);

  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<Id<"sizes"> | null>(null);
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [saving, setSaving] = useState(false);

  const pagination = usePagination(sizes ?? []);

  function openCreate() {
    setEditingId(null);
    setName("");
    setSortOrder(String((sizes?.length ?? 0) * 10));
    setShowDialog(true);
  }

  function openEdit(sizeId: Id<"sizes">) {
    const size = sizes?.find((s) => s._id === sizeId);
    if (!size) return;
    setEditingId(sizeId);
    setName(size.name);
    setSortOrder(size.sortOrder.toString());
    setShowDialog(true);
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateSize({
          sizeId: editingId,
          name: name.trim(),
          sortOrder: parseInt(sortOrder, 10) || 0,
        });
        toast.success("Size updated");
      } else {
        await createSize({
          name: name.trim(),
          sortOrder: parseInt(sortOrder, 10) || 0,
        });
        toast.success("Size created");
      }
      setShowDialog(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(sizeId: Id<"sizes">, isActive: boolean) {
    try {
      await toggleStatus({ sizeId, isActive: !isActive });
      toast.success(isActive ? "Size deactivated" : "Size activated");
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sizes</h1>
          <p className="text-sm text-muted-foreground">Manage size options for variants and promotions</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Size
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        {sizes === undefined ? (
          <div className="p-8 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : sizes.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No sizes yet. Add your first size.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Sort Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.paginatedData.map((size) => (
                <TableRow key={size._id}>
                  <TableCell className="font-medium">{size.name}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{size.sortOrder}</TableCell>
                  <TableCell>
                    <Badge variant={size.isActive ? "default" : "secondary"}>
                      {size.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(size._id)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggle(size._id, size.isActive)}
                        title={size.isActive ? "Deactivate" : "Activate"}
                      >
                        {size.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {(sizes?.length ?? 0) > 0 && (
        <TablePagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          hasNextPage={pagination.hasNextPage}
          hasPrevPage={pagination.hasPrevPage}
          onNextPage={pagination.nextPage}
          onPrevPage={pagination.prevPage}
        />
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Size" : "Add Size"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. XL, 2XL, 42" />
            </div>
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">Lower numbers appear first</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

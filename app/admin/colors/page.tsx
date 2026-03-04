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

export default function ColorsPage() {
  const colors = useQuery(api.admin.colors.listColors);
  const createColor = useMutation(api.admin.colors.createColor);
  const updateColor = useMutation(api.admin.colors.updateColor);
  const toggleStatus = useMutation(api.admin.colors.toggleColorStatus);

  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<Id<"colors"> | null>(null);
  const [name, setName] = useState("");
  const [hexCode, setHexCode] = useState("");
  const [saving, setSaving] = useState(false);

  const pagination = usePagination(colors ?? []);

  function openCreate() {
    setEditingId(null);
    setName("");
    setHexCode("");
    setShowDialog(true);
  }

  function openEdit(colorId: Id<"colors">) {
    const color = colors?.find((c) => c._id === colorId);
    if (!color) return;
    setEditingId(colorId);
    setName(color.name);
    setHexCode(color.hexCode ?? "");
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
        await updateColor({
          colorId: editingId,
          name: name.trim(),
          hexCode: hexCode.trim() || undefined,
        });
        toast.success("Color updated");
      } else {
        await createColor({
          name: name.trim(),
          hexCode: hexCode.trim() || undefined,
        });
        toast.success("Color created");
      }
      setShowDialog(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(colorId: Id<"colors">, isActive: boolean) {
    try {
      await toggleStatus({ colorId, isActive: !isActive });
      toast.success(isActive ? "Color deactivated" : "Color activated");
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Colors</h1>
          <p className="text-sm text-muted-foreground">Manage color options for variants and promotions</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Color
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        {colors === undefined ? (
          <div className="p-8 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : colors.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No colors yet. Add your first color.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Swatch</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Hex Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.paginatedData.map((color) => (
                <TableRow key={color._id}>
                  <TableCell>
                    <span
                      className="inline-block w-6 h-6 rounded-full border border-gray-300"
                      style={{ backgroundColor: color.hexCode || "#ccc" }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{color.name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {color.hexCode || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={color.isActive ? "default" : "secondary"}>
                      {color.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(color._id)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggle(color._id, color.isActive)}
                        title={color.isActive ? "Deactivate" : "Activate"}
                      >
                        {color.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {(colors?.length ?? 0) > 0 && (
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
            <DialogTitle>{editingId ? "Edit Color" : "Add Color"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Navy Blue" />
            </div>
            <div className="space-y-2">
              <Label>Hex Code (optional)</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={hexCode}
                  onChange={(e) => setHexCode(e.target.value)}
                  placeholder="#1a2b3c"
                  className="flex-1"
                />
                {hexCode && (
                  <span
                    className="w-8 h-8 rounded border border-gray-300 flex-shrink-0"
                    style={{ backgroundColor: hexCode }}
                  />
                )}
              </div>
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

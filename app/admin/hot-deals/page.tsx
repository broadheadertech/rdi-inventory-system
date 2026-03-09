"use client";

import { useState } from "react";
import Image from "next/image";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Flame, ImageIcon,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

const LABEL_PRESETS = ["HOT", "FLASH DEAL", "BEST SELLER", "LIMITED", "NEW"];

export default function HotDealsPage() {
  const deals = useQuery(api.admin.hotDeals.listHotDeals);
  const styles = useQuery(api.admin.hotDeals.listHotDeals); // we'll search styles separately
  const createDeal = useMutation(api.admin.hotDeals.createHotDeal);
  const updateDeal = useMutation(api.admin.hotDeals.updateHotDeal);
  const toggleDeal = useMutation(api.admin.hotDeals.toggleHotDealStatus);
  const removeDeal = useMutation(api.admin.hotDeals.deleteHotDeal);

  // For style search in the create dialog
  const allStyles = useQuery(api.storefront.homepage.getHomepageData);

  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<Id<"hotDeals"> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Id<"hotDeals"> | null>(null);

  // Form state
  const [selectedStyleId, setSelectedStyleId] = useState<string>("");
  const [label, setLabel] = useState("HOT");
  const [sortOrder, setSortOrder] = useState(0);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [styleSearch, setStyleSearch] = useState("");

  const pagination = usePagination(deals ?? []);

  // Filter styles for the picker
  const styleOptions = (allStyles?.featuredProducts ?? []).filter(
    (s) =>
      !styleSearch ||
      s.name.toLowerCase().includes(styleSearch.toLowerCase()) ||
      s.brandName.toLowerCase().includes(styleSearch.toLowerCase())
  );

  function openCreate() {
    setEditingId(null);
    setSelectedStyleId("");
    setLabel("HOT");
    setSortOrder((deals?.length ?? 0) + 1);
    setStartDate("");
    setEndDate("");
    setStyleSearch("");
    setShowDialog(true);
  }

  function openEdit(id: Id<"hotDeals">) {
    const deal = deals?.find((d) => d._id === id);
    if (!deal) return;
    setEditingId(id);
    setSelectedStyleId("");
    setLabel(deal.label);
    setSortOrder(deal.sortOrder);
    setStartDate(deal.startDate ? new Date(deal.startDate).toISOString().slice(0, 16) : "");
    setEndDate(deal.endDate ? new Date(deal.endDate).toISOString().slice(0, 16) : "");
    setStyleSearch("");
    setShowDialog(true);
  }

  async function handleSave() {
    if (!editingId && !selectedStyleId) {
      toast.error("Select a product");
      return;
    }
    setSaving(true);
    try {
      const start = startDate ? new Date(startDate).getTime() : undefined;
      const end = endDate ? new Date(endDate).getTime() : undefined;

      if (editingId) {
        await updateDeal({
          hotDealId: editingId,
          label,
          sortOrder,
          startDate: start,
          endDate: end,
        });
        toast.success("Hot deal updated");
      } else {
        await createDeal({
          styleId: selectedStyleId as Id<"styles">,
          label,
          sortOrder,
          startDate: start,
          endDate: end,
        });
        toast.success("Hot deal created");
      }
      setShowDialog(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: Id<"hotDeals">, isActive: boolean) {
    try {
      await toggleDeal({ hotDealId: id, isActive: !isActive });
      toast.success(isActive ? "Deactivated" : "Activated");
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function handleDelete(id: Id<"hotDeals">) {
    if (!confirm("Remove this hot deal?")) return;
    setDeleting(id);
    try {
      await removeDeal({ hotDealId: id });
      toast.success("Removed");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hot Deals</h1>
          <p className="text-sm text-muted-foreground">
            Feature products in the Hot Deals section on the storefront homepage
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Deal
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        {deals === undefined ? (
          <div className="p-8 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : deals.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-sm text-muted-foreground">
            <Flame className="h-10 w-10" />
            <p>No hot deals yet. Add products to feature on the homepage.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Image</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Label</TableHead>
                <TableHead className="w-16">Order</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.paginatedData.map((deal) => (
                <TableRow key={deal._id}>
                  <TableCell>
                    {deal.imageUrl ? (
                      <div className="relative h-10 w-10 overflow-hidden rounded bg-muted">
                        <Image src={deal.imageUrl} alt={deal.styleName} fill sizes="40px" className="object-cover" />
                      </div>
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-sm">{deal.styleName}</p>
                    <p className="text-xs text-muted-foreground">{deal.brandName}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">
                      {deal.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm">{deal.sortOrder}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {deal.startDate || deal.endDate ? (
                      <>
                        {deal.startDate && new Date(deal.startDate).toLocaleDateString()}
                        {" – "}
                        {deal.endDate ? new Date(deal.endDate).toLocaleDateString() : "No end"}
                      </>
                    ) : (
                      "Always"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={deal.isActive ? "default" : "secondary"}>
                      {deal.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(deal._id)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggle(deal._id, deal.isActive)}
                        title={deal.isActive ? "Deactivate" : "Activate"}
                      >
                        {deal.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(deal._id)}
                        disabled={deleting === deal._id}
                        title="Delete"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {(deals?.length ?? 0) > 0 && (
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

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Hot Deal" : "Add Hot Deal"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Product picker — only when creating */}
            {!editingId && (
              <div className="space-y-2">
                <Label>Product *</Label>
                <Input
                  placeholder="Search products..."
                  value={styleSearch}
                  onChange={(e) => setStyleSearch(e.target.value)}
                />
                <div className="max-h-40 overflow-y-auto rounded border">
                  {styleOptions.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground">No products found</p>
                  ) : (
                    styleOptions.slice(0, 20).map((s) => (
                      <button
                        key={String(s._id)}
                        type="button"
                        onClick={() => setSelectedStyleId(String(s._id))}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted transition-colors ${
                          selectedStyleId === String(s._id) ? "bg-primary/10" : ""
                        }`}
                      >
                        {s.primaryImageUrl ? (
                          <Image src={s.primaryImageUrl} alt="" width={28} height={28} className="rounded object-cover" />
                        ) : (
                          <div className="h-7 w-7 rounded bg-muted" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.brandName} — {formatCurrency(s.basePriceCentavos)}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Label *</Label>
              <Select value={label} onValueChange={setLabel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LABEL_PRESETS.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                min={0}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date (optional)</Label>
                <Input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>End Date (optional)</Label>
                <Input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
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

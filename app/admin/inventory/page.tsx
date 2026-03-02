"use client";

import { useState, useEffect, useCallback } from "react";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Pencil,
  Plus,
  Trash2,
  PackagePlus,
  Loader2,
} from "lucide-react";
import { StatusPill } from "@/components/inventory/StatusPill";

// ─── Constants ──────────────────────────────────────────────────────────────

const REASON_OPTIONS = [
  { value: "supplier_delivery", label: "Supplier Delivery" },
  { value: "damage_writeoff", label: "Damage / Write-off" },
  { value: "count_correction", label: "Count Correction" },
  { value: "return", label: "Customer Return" },
  { value: "other", label: "Other" },
] as const;

// ─── Types ──────────────────────────────────────────────────────────────────

type InventoryRow = {
  inventoryId: Id<"inventory">;
  branchId: Id<"branches">;
  branchName: string;
  styleName: string;
  sku: string;
  size: string;
  color: string;
  priceCentavos: number;
  quantity: number;
  lowStockThreshold: number;
  updatedAt: number;
};

type RestockItem = {
  variantId: Id<"variants">;
  sku: string;
  styleName: string;
  size: string;
  color: string;
  quantity: number;
  costPriceCentavos: number;
};

// ─── Stock Levels Tab ───────────────────────────────────────────────────────

function StockLevelsTab() {
  const branches = useQuery(api.auth.branches.listBranches);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const inventory = useQuery(
    api.inventory.stockLevels.getAllInventory,
    branchFilter
      ? {
          searchText: debouncedSearch || undefined,
          branchId: branchFilter as Id<"branches">,
        }
      : "skip"
  );
  const adjustStock = useMutation(api.inventory.stockLevels.adjustStock);

  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);
  const [adjustForm, setAdjustForm] = useState({
    newQuantity: "",
    reason: "",
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredInventory = inventory?.filter((item) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "out") return item.quantity === 0;
    if (statusFilter === "low")
      return item.quantity > 0 && item.quantity <= item.lowStockThreshold;
    if (statusFilter === "in") return item.quantity > item.lowStockThreshold;
    return true;
  });

  const pagination = usePagination(filteredInventory);

  const openAdjustDialog = (item: InventoryRow) => {
    setAdjusting(item);
    setAdjustForm({
      newQuantity: String(item.quantity),
      reason: "",
      notes: "",
    });
  };

  const handleAdjust = async () => {
    if (!adjusting) return;
    const qty = parseInt(adjustForm.newQuantity, 10);
    if (isNaN(qty) || qty < 0) {
      toast.error("Quantity must be a non-negative number");
      return;
    }
    if (!adjustForm.reason) {
      toast.error("Please select a reason");
      return;
    }
    if (qty === adjusting.quantity) {
      toast.error("Quantity is unchanged");
      return;
    }

    setIsSubmitting(true);
    try {
      const reasonLabel =
        REASON_OPTIONS.find((r) => r.value === adjustForm.reason)?.label ??
        adjustForm.reason;
      const fullReason = adjustForm.notes
        ? `${reasonLabel}: ${adjustForm.notes}`
        : reasonLabel;

      await adjustStock({
        inventoryId: adjusting.inventoryId,
        newQuantity: qty,
        reason: fullReason,
      });

      const diff = qty - adjusting.quantity;
      toast.success(
        `Stock adjusted: ${adjusting.sku} ${diff >= 0 ? "+" : ""}${diff} (${adjusting.quantity} → ${qty})`
      );
      setAdjusting(null);
    } catch (error) {
      toast.error(
        `Failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select a branch..." />
          </SelectTrigger>
          <SelectContent>
            {branches
              ?.filter((b) => b.isActive)
              .map((branch) => (
                <SelectItem key={branch._id} value={branch._id}>
                  {branch.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {branchFilter && (
          <>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by SKU or style..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="in">In Stock</SelectItem>
                <SelectItem value="low">Low Stock</SelectItem>
                <SelectItem value="out">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
        {branchFilter && filteredInventory && filteredInventory.length > 0 && (
          <p className="text-sm text-muted-foreground ml-auto">
            {filteredInventory.length} item
            {filteredInventory.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {!branchFilter ? (
        <div className="rounded-md border py-16 text-center text-muted-foreground">
          Select a branch above to view its inventory.
        </div>
      ) : inventory === undefined ? (
        <div className="text-muted-foreground">Loading inventory...</div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Style</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedData.length > 0 ? (
                  pagination.paginatedData.map((item) => (
                    <TableRow key={item.inventoryId}>
                      <TableCell className="font-medium">
                        {item.styleName}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {item.sku}
                      </TableCell>
                      <TableCell>{item.size}</TableCell>
                      <TableCell>{item.color}</TableCell>
                      <TableCell className="text-right font-medium">
                        {item.quantity}
                      </TableCell>
                      <TableCell>
                        <StatusPill
                          quantity={item.quantity}
                          lowStockThreshold={item.lowStockThreshold}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openAdjustDialog(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-muted-foreground py-8"
                    >
                      {searchQuery || statusFilter !== "all"
                        ? "No inventory matches the current filters"
                        : "No inventory found for this branch."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {filteredInventory && filteredInventory.length > 0 && (
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
        </>
      )}

      {/* Adjust Stock Dialog */}
      <Dialog
        open={adjusting !== null}
        onOpenChange={(open) => !open && setAdjusting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Stock</DialogTitle>
          </DialogHeader>
          {adjusting && (
            <div className="space-y-4 py-4">
              <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                <p>
                  <span className="text-muted-foreground">Style:</span>{" "}
                  {adjusting.styleName}
                </p>
                <p>
                  <span className="text-muted-foreground">SKU:</span>{" "}
                  {adjusting.sku}
                </p>
                <p>
                  <span className="text-muted-foreground">Size / Color:</span>{" "}
                  {adjusting.size} / {adjusting.color}
                </p>
                <p>
                  <span className="text-muted-foreground">Branch:</span>{" "}
                  {adjusting.branchName}
                </p>
                <p>
                  <span className="text-muted-foreground">Current Qty:</span>{" "}
                  {adjusting.quantity}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-qty">New Quantity</Label>
                <Input
                  id="new-qty"
                  type="number"
                  min={0}
                  value={adjustForm.newQuantity}
                  onChange={(e) =>
                    setAdjustForm({
                      ...adjustForm,
                      newQuantity: e.target.value,
                    })
                  }
                />
                {adjustForm.newQuantity &&
                  !isNaN(parseInt(adjustForm.newQuantity)) && (
                    <p className="text-xs text-muted-foreground">
                      Change:{" "}
                      {(() => {
                        const diff =
                          parseInt(adjustForm.newQuantity) - adjusting.quantity;
                        return diff >= 0 ? `+${diff}` : String(diff);
                      })()}
                    </p>
                  )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">Reason</Label>
                <Select
                  value={adjustForm.reason}
                  onValueChange={(value) =>
                    setAdjustForm({ ...adjustForm, reason: value })
                  }
                >
                  <SelectTrigger id="reason">
                    <SelectValue placeholder="Select reason..." />
                  </SelectTrigger>
                  <SelectContent>
                    {REASON_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Input
                  id="notes"
                  placeholder="e.g. PO #12345, damage during transit"
                  value={adjustForm.notes}
                  onChange={(e) =>
                    setAdjustForm({ ...adjustForm, notes: e.target.value })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjusting(null)}>
              Cancel
            </Button>
            <Button onClick={handleAdjust} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Receive Stock Tab ──────────────────────────────────────────────────────

function ReceiveStockTab() {
  const warehouse = useQuery(api.auth.branches.getWarehouseBranch);
  const bulkRestock = useMutation(api.inventory.stockLevels.bulkRestock);

  const branchId = warehouse?._id ?? "";
  const [searchText, setSearchText] = useState("");
  const [items, setItems] = useState<RestockItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const searchResults = useQuery(
    api.inventory.stockLevels.searchVariants,
    searchText.length >= 2 ? { searchText } : "skip"
  );

  const addItem = useCallback(
    (variant: {
      variantId: Id<"variants">;
      sku: string;
      styleName: string;
      size: string;
      color: string;
      costPriceCentavos: number;
    }) => {
      if (items.some((i) => i.variantId === variant.variantId)) {
        toast.error(`${variant.sku} is already in the list`);
        return;
      }
      setItems((prev) => [...prev, { ...variant, quantity: 1 }]);
      setSearchText("");
    },
    [items]
  );

  const updateQuantity = (index: number, qty: number) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, quantity: Math.max(1, qty) } : item
      )
    );
  };

  const updateCostPrice = (index: number, cost: number) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, costPriceCentavos: Math.max(0, cost) } : item
      )
    );
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!branchId) {
      toast.error("Warehouse not found — please seed data first");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one item");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await bulkRestock({
        branchId: branchId as Id<"branches">,
        items: items.map((i) => ({
          variantId: i.variantId,
          quantity: i.quantity,
          costPriceCentavos: i.costPriceCentavos,
        })),
        reason: "Supplier Delivery",
      });

      const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);
      toast.success(
        `Restocked ${totalUnits} units across ${result.total} items (${result.created} new, ${result.updated} updated)`
      );
      setItems([]);
    } catch (error) {
      toast.error(
        `Failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="space-y-6">
      {/* Warehouse target indicator */}
      <div className="flex items-center gap-2 rounded-lg border bg-blue-50 dark:bg-blue-950/30 px-4 py-3">
        <PackagePlus className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        <div>
          <p className="text-sm font-medium">
            Receiving into: {warehouse?.name ?? "Loading..."}
          </p>
          <p className="text-xs text-muted-foreground">
            Supplier → Warehouse → Transfers → Retail Branches
          </p>
        </div>
      </div>

      {/* Product search */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Add Products</p>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by SKU or style name..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pl-9"
          />
        </div>

        {searchText.length >= 2 &&
          searchResults &&
          searchResults.length > 0 && (
            <div className="max-w-md rounded-md border bg-white shadow-md max-h-60 overflow-y-auto">
              {searchResults.map((v) => (
                <button
                  key={v.variantId}
                  onClick={() => addItem(v)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
                >
                  <div>
                    <span className="font-medium">{v.styleName}</span>
                    <span className="text-muted-foreground ml-2">
                      {v.size} / {v.color}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {v.sku}
                    </span>
                    <Plus className="h-4 w-4 text-primary" />
                  </div>
                </button>
              ))}
            </div>
          )}
        {searchText.length >= 2 &&
          searchResults &&
          searchResults.length === 0 && (
            <p className="text-sm text-muted-foreground max-w-md">
              No variants found matching &quot;{searchText}&quot;
            </p>
          )}
      </div>

      {/* Items table */}
      {items.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Style</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Color</TableHead>
                <TableHead className="w-32">Quantity</TableHead>
                <TableHead className="w-32">Cost Price</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={item.variantId}>
                  <TableCell className="font-medium">
                    {item.styleName}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {item.sku}
                  </TableCell>
                  <TableCell>{item.size}</TableCell>
                  <TableCell>{item.color}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) =>
                        updateQuantity(
                          index,
                          parseInt(e.target.value, 10) || 1
                        )
                      }
                      className="w-24"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={(item.costPriceCentavos / 100).toFixed(2)}
                      onChange={(e) =>
                        updateCostPrice(
                          index,
                          Math.round(parseFloat(e.target.value || "0") * 100)
                        )
                      }
                      className="w-28"
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Submit */}
      {items.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
          <p className="text-sm">
            <span className="font-medium">{items.length}</span> item
            {items.length !== 1 ? "s" : ""},{" "}
            <span className="font-medium">{totalUnits}</span> total units
          </p>
          <Button onClick={handleSubmit} disabled={isSubmitting || !branchId}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Restocking...
              </>
            ) : (
              <>
                <PackagePlus className="mr-2 h-4 w-4" />
                Submit Restock
              </>
            )}
          </Button>
        </div>
      )}

      {items.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Search for products above and add them to build your restock order.
        </div>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          View stock levels across branches and receive supplier deliveries.
        </p>
      </div>

      <Tabs defaultValue="stock-levels">
        <TabsList>
          <TabsTrigger value="stock-levels">Stock Levels</TabsTrigger>
          <TabsTrigger value="receive-stock">Receive Stock</TabsTrigger>
        </TabsList>
        <TabsContent value="stock-levels" className="mt-4">
          <StockLevelsTab />
        </TabsContent>
        <TabsContent value="receive-stock" className="mt-4">
          <ReceiveStockTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

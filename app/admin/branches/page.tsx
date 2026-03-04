"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Branch } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
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
  Building2,
  Plus,
  Search,
  UserCheck,
  XCircle,
} from "lucide-react";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";

const TIMEZONE_OPTIONS = [
  { value: "none", label: "Default (System)" },
  { value: "Asia/Manila", label: "Philippine Standard Time (UTC+8)" },
] as const;

const CLASSIFICATION_OPTIONS = [
  { value: "none", label: "No Classification" },
  { value: "premium", label: "Premium" },
  { value: "aclass", label: "A-Class" },
  { value: "bnc", label: "BNC" },
  { value: "outlet", label: "Outlet" },
] as const;

const CLASSIFICATION_LABELS: Record<string, string> = {
  premium: "Premium",
  aclass: "A-Class",
  bnc: "BNC",
  outlet: "Outlet",
};

const CLASSIFICATION_COLORS: Record<string, string> = {
  premium: "bg-purple-100 text-purple-800",
  aclass: "bg-blue-100 text-blue-800",
  bnc: "bg-green-100 text-green-800",
  outlet: "bg-amber-100 text-amber-800",
};

export default function BranchesPage() {
  const branches = useQuery(api.auth.branches.listBranches);
  const createBranch = useMutation(api.auth.branches.createBranch);
  const updateBranch = useMutation(api.auth.branches.updateBranch);
  const deactivateBranch = useMutation(api.auth.branches.deactivateBranch);
  const reactivateBranch = useMutation(api.auth.branches.reactivateBranch);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    address: "",
    phone: "",
    type: "retail" as "retail" | "warehouse",
    classification: "none",
    latitude: "",
    longitude: "",
    timezone: "none",
    openTime: "",
    closeTime: "",
  });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});

  // Edit dialog state
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    address: "",
    phone: "",
    type: "retail" as "retail" | "warehouse",
    classification: "none",
    latitude: "",
    longitude: "",
    timezone: "none",
    openTime: "",
    closeTime: "",
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // Filter branches
  const filteredBranches = branches?.filter((branch) => {
    const matchesSearch =
      searchQuery === "" ||
      branch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      branch.address.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && branch.isActive) ||
      (statusFilter === "inactive" && !branch.isActive);
    return matchesSearch && matchesStatus;
  });

  const pagination = usePagination(filteredBranches);

  const resetCreateForm = () => {
    setCreateForm({ name: "", address: "", phone: "", type: "retail", classification: "none", latitude: "", longitude: "", timezone: "none", openTime: "", closeTime: "" });
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
    if (!createForm.address.trim()) errors.address = "Address is required";
    setCreateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateCreateForm()) return;

    setIsSubmitting(true);
    try {
      const configuration: {
        timezone?: string;
        businessHours?: { openTime: string; closeTime: string };
      } = {};
      if (createForm.timezone !== "none") configuration.timezone = createForm.timezone;
      if (createForm.openTime && createForm.closeTime) {
        configuration.businessHours = { openTime: createForm.openTime, closeTime: createForm.closeTime };
      }

      await createBranch({
        name: createForm.name.trim(),
        address: createForm.address.trim(),
        type: createForm.type,
        classification: createForm.classification !== "none"
          ? (createForm.classification as "premium" | "aclass" | "bnc" | "outlet")
          : undefined,
        phone: createForm.phone.trim() ? createForm.phone.trim() : undefined,
        latitude: createForm.latitude ? parseFloat(createForm.latitude) : undefined,
        longitude: createForm.longitude ? parseFloat(createForm.longitude) : undefined,
        configuration: Object.keys(configuration).length > 0 ? configuration : undefined,
      });
      toast.success("Branch created successfully");
      setShowCreateDialog(false);
      resetCreateForm();
    } catch (error) {
      toast.error(`Failed to create branch: ${getErrorMessage(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (branch: Branch) => {
    setEditingBranch(branch);
    setEditForm({
      name: branch.name,
      address: branch.address,
      phone: branch.phone ?? "",
      type: branch.type ?? "retail",
      classification: branch.classification ?? "none",
      latitude: branch.latitude?.toString() ?? "",
      longitude: branch.longitude?.toString() ?? "",
      timezone: branch.configuration?.timezone ?? "none",
      openTime: branch.configuration?.businessHours?.openTime ?? "",
      closeTime: branch.configuration?.businessHours?.closeTime ?? "",
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
    if (!editForm.address.trim()) errors.address = "Address is required";
    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveEdit = async () => {
    if (!editingBranch || !validateEditForm()) return;

    setIsSubmitting(true);
    try {
      const editConfig: {
        timezone?: string;
        businessHours?: { openTime: string; closeTime: string };
      } = {};
      if (editForm.timezone !== "none") editConfig.timezone = editForm.timezone;
      if (editForm.openTime && editForm.closeTime) {
        editConfig.businessHours = { openTime: editForm.openTime, closeTime: editForm.closeTime };
      }

      await updateBranch({
        branchId: editingBranch._id,
        name: editForm.name.trim(),
        address: editForm.address.trim(),
        type: editForm.type,
        classification: editForm.classification !== "none"
          ? (editForm.classification as "premium" | "aclass" | "bnc" | "outlet")
          : undefined,
        phone: editForm.phone.trim(),
        latitude: editForm.latitude ? parseFloat(editForm.latitude) : undefined,
        longitude: editForm.longitude ? parseFloat(editForm.longitude) : undefined,
        configuration: editConfig,
      });
      toast.success("Branch updated successfully");
      setEditingBranch(null);
    } catch (error) {
      toast.error(`Failed to update branch: ${getErrorMessage(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (branch: Branch) => {
    const confirmed = window.confirm(
      `Deactivate branch "${branch.name}"? Users assigned to this branch will need to be reassigned.`
    );
    if (!confirmed) return;

    try {
      await deactivateBranch({ branchId: branch._id });
      toast.success(`"${branch.name}" deactivated`);
    } catch (error) {
      toast.error(`Failed to deactivate: ${getErrorMessage(error)}`);
    }
  };

  const handleReactivate = async (branch: Branch) => {
    try {
      await reactivateBranch({ branchId: branch._id });
      toast.success(`"${branch.name}" reactivated`);
    } catch (error) {
      toast.error(`Failed to reactivate: ${getErrorMessage(error)}`);
    }
  };

  if (branches === undefined) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Branch Management</h1>
        <p className="text-muted-foreground">Loading branches...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Branch Management</h1>
          <p className="text-sm text-muted-foreground">
            {filteredBranches?.length ?? 0} branch
            {(filteredBranches?.length ?? 0) !== 1 ? "es" : ""}
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Branch
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or address..."
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

      {/* Branches Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.paginatedData.length > 0 ? (
              pagination.paginatedData.map((branch) => (
                <TableRow key={branch._id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {branch.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={branch.type === "warehouse" ? "secondary" : "outline"}>
                      {branch.type === "warehouse" ? "Warehouse" : "Retail"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {branch.classification ? (
                      <Badge variant="secondary" className={CLASSIFICATION_COLORS[branch.classification] ?? ""}>
                        {CLASSIFICATION_LABELS[branch.classification] ?? branch.classification}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{branch.address}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {branch.phone || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {branch.configuration?.businessHours
                      ? `${branch.configuration.businessHours.openTime}–${branch.configuration.businessHours.closeTime}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={branch.isActive ? "default" : "destructive"}
                    >
                      {branch.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(branch)}
                        title="Edit branch"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {branch.isActive ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeactivate(branch)}
                          title="Deactivate branch"
                        >
                          <XCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReactivate(branch)}
                          title="Reactivate branch"
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
                  colSpan={8}
                  className="text-center text-muted-foreground py-8"
                >
                  {searchQuery || statusFilter !== "all"
                    ? "No branches match the current filters"
                    : "No branches found. Create your first branch to get started."}
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
        noun="branch"
      />

      {/* Create Branch Dialog */}
      <Dialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            resetCreateForm();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Branch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-name"
                placeholder="e.g. SM Manila Branch"
                value={createForm.name}
                onChange={(e) => updateCreateField("name", e.target.value)}
                className={createErrors.name ? "border-destructive" : ""}
              />
              {createErrors.name && (
                <p className="text-sm text-destructive">{createErrors.name}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-address">
                Address <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-address"
                placeholder="e.g. 123 Rizal Ave, Manila"
                value={createForm.address}
                onChange={(e) => updateCreateField("address", e.target.value)}
                className={createErrors.address ? "border-destructive" : ""}
              />
              {createErrors.address && (
                <p className="text-sm text-destructive">
                  {createErrors.address}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-type">Branch Type</Label>
              <Select
                value={createForm.type}
                onValueChange={(value) => updateCreateField("type", value)}
              >
                <SelectTrigger id="create-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="retail">Retail Branch</SelectItem>
                  <SelectItem value="warehouse">Warehouse</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createForm.type === "retail" && (
              <div className="space-y-2">
                <Label htmlFor="create-classification">Branch Classification</Label>
                <Select
                  value={createForm.classification}
                  onValueChange={(value) => updateCreateField("classification", value)}
                >
                  <SelectTrigger id="create-classification">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLASSIFICATION_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Determines pricing tier and promotion eligibility
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="create-phone">Phone</Label>
              <Input
                id="create-phone"
                type="tel"
                placeholder="+63 2 1234 5678"
                value={createForm.phone}
                onChange={(e) => updateCreateField("phone", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="create-latitude">Latitude</Label>
                <Input
                  id="create-latitude"
                  type="number"
                  step="any"
                  placeholder="14.5995"
                  value={createForm.latitude}
                  onChange={(e) => updateCreateField("latitude", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-longitude">Longitude</Label>
                <Input
                  id="create-longitude"
                  type="number"
                  step="any"
                  placeholder="120.9842"
                  value={createForm.longitude}
                  onChange={(e) => updateCreateField("longitude", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-timezone">Timezone</Label>
              <Select
                value={createForm.timezone}
                onValueChange={(value) => updateCreateField("timezone", value)}
              >
                <SelectTrigger id="create-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="create-openTime">Opening Time</Label>
                <Input
                  id="create-openTime"
                  type="time"
                  value={createForm.openTime}
                  onChange={(e) => updateCreateField("openTime", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-closeTime">Closing Time</Label>
                <Input
                  id="create-closeTime"
                  type="time"
                  value={createForm.closeTime}
                  onChange={(e) => updateCreateField("closeTime", e.target.value)}
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
              {isSubmitting ? "Creating..." : "Create Branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Branch Dialog */}
      <Dialog
        open={editingBranch !== null}
        onOpenChange={(open) => !open && setEditingBranch(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Branch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => updateEditField("name", e.target.value)}
                className={editErrors.name ? "border-destructive" : ""}
              />
              {editErrors.name && (
                <p className="text-sm text-destructive">{editErrors.name}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-address">
                Address <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-address"
                value={editForm.address}
                onChange={(e) => updateEditField("address", e.target.value)}
                className={editErrors.address ? "border-destructive" : ""}
              />
              {editErrors.address && (
                <p className="text-sm text-destructive">
                  {editErrors.address}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-type">Branch Type</Label>
              <Select
                value={editForm.type}
                onValueChange={(value) => updateEditField("type", value)}
              >
                <SelectTrigger id="edit-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="retail">Retail Branch</SelectItem>
                  <SelectItem value="warehouse">Warehouse</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editForm.type === "retail" && (
              <div className="space-y-2">
                <Label htmlFor="edit-classification">Branch Classification</Label>
                <Select
                  value={editForm.classification}
                  onValueChange={(value) => updateEditField("classification", value)}
                >
                  <SelectTrigger id="edit-classification">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLASSIFICATION_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Determines pricing tier and promotion eligibility
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                type="tel"
                placeholder="+63 2 1234 5678"
                value={editForm.phone}
                onChange={(e) => updateEditField("phone", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-latitude">Latitude</Label>
                <Input
                  id="edit-latitude"
                  type="number"
                  step="any"
                  placeholder="14.5995"
                  value={editForm.latitude}
                  onChange={(e) => updateEditField("latitude", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-longitude">Longitude</Label>
                <Input
                  id="edit-longitude"
                  type="number"
                  step="any"
                  placeholder="120.9842"
                  value={editForm.longitude}
                  onChange={(e) => updateEditField("longitude", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-timezone">Timezone</Label>
              <Select
                value={editForm.timezone}
                onValueChange={(value) => updateEditField("timezone", value)}
              >
                <SelectTrigger id="edit-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-openTime">Opening Time</Label>
                <Input
                  id="edit-openTime"
                  type="time"
                  value={editForm.openTime}
                  onChange={(e) => updateEditField("openTime", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-closeTime">Closing Time</Label>
                <Input
                  id="edit-closeTime"
                  type="time"
                  value={editForm.closeTime}
                  onChange={(e) => updateEditField("closeTime", e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingBranch(null)}
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

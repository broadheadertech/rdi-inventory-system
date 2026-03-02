"use client";

import { useState } from "react";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { User } from "@/lib/types";
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
import { Pencil, UserX, UserCheck, Search } from "lucide-react";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "cashier", label: "Cashier" },
  { value: "warehouseStaff", label: "Warehouse Staff" },
  { value: "hqStaff", label: "HQ Staff" },
  { value: "viewer", label: "Viewer" },
] as const;

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-800",
  manager: "bg-blue-100 text-blue-800",
  cashier: "bg-green-100 text-green-800",
  warehouseStaff: "bg-amber-100 text-amber-800",
  hqStaff: "bg-purple-100 text-purple-800",
  viewer: "bg-gray-100 text-gray-800",
};

export default function UsersPage() {
  const users = useQuery(api.auth.users.getUsers);
  const branches = useQuery(api.auth.branches.listBranches);
  const setUserRole = useAction(api.auth.users.setUserRole);
  const assignBranch = useAction(api.auth.users.assignBranch);
  const deactivateUser = useMutation(api.auth.users.deactivateUser);
  const reactivateUser = useMutation(api.auth.users.reactivateUser);
  const updateUser = useMutation(api.auth.users.updateUser);

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    role: "",
    branchId: "" as string,
  });

  // Filter users
  const filteredUsers = users?.filter((user) => {
    const matchesSearch =
      searchQuery === "" ||
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const pagination = usePagination(filteredUsers);

  const openEditDialog = (user: User) => {
    setEditingUser(user);
    setEditForm({
      name: user.name,
      email: user.email,
      role: user.role,
      branchId: user.branchId ?? "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;

    const errors: string[] = [];

    // Update name/email if changed
    if (
      editForm.name !== editingUser.name ||
      editForm.email !== editingUser.email
    ) {
      try {
        await updateUser({
          userId: editingUser._id,
          name: editForm.name,
          email: editForm.email,
        });
      } catch (error) {
        errors.push(
          `Profile: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    // Update role if changed
    if (editForm.role !== editingUser.role) {
      try {
        await setUserRole({
          userId: editingUser._id,
          role: editForm.role as
            | "admin"
            | "manager"
            | "cashier"
            | "warehouseStaff"
            | "hqStaff"
            | "viewer",
        });
      } catch (error) {
        errors.push(
          `Role: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    // Update branch if changed
    const newBranchId = editForm.branchId || undefined;
    const oldBranchId = editingUser.branchId ?? undefined;
    if (newBranchId !== oldBranchId) {
      try {
        await assignBranch({
          userId: editingUser._id,
          branchId: newBranchId as Id<"branches"> | undefined,
        });
      } catch (error) {
        errors.push(
          `Branch: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    if (errors.length > 0) {
      toast.error(`Some updates failed: ${errors.join("; ")}`);
    } else {
      toast.success("User updated successfully");
    }
    setEditingUser(null);
  };

  const handleToggleActive = async (user: User) => {
    if (user.isActive) {
      const confirmed = window.confirm(
        `Are you sure you want to deactivate ${user.name}? They will lose access immediately.`
      );
      if (!confirmed) return;
    }

    try {
      if (user.isActive) {
        await deactivateUser({ userId: user._id });
        toast.success(`${user.name} deactivated`);
      } else {
        await reactivateUser({ userId: user._id });
        toast.success(`${user.name} reactivated`);
      }
    } catch (error) {
      toast.error(
        `Failed to update user: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  };

  if (users === undefined) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">User Management</h1>
        <p className="text-muted-foreground">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">User Management</h1>
        <p className="text-sm text-muted-foreground">
          {filteredUsers?.length ?? 0} user
          {(filteredUsers?.length ?? 0) !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {ROLE_OPTIONS.map((role) => (
              <SelectItem key={role.value} value={role.value}>
                {role.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Users Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.paginatedData.length > 0 ? (
              pagination.paginatedData.map((user) => (
                <TableRow key={user._id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={ROLE_COLORS[user.role] ?? ""}
                    >
                      {ROLE_OPTIONS.find((r) => r.value === user.role)?.label ??
                        user.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.role === "admin" || user.role === "hqStaff"
                      ? "HQ / All"
                      : user.branchId
                        ? (branches?.find((b) => b._id === user.branchId)
                            ?.name ?? "Assigned")
                        : "Unassigned"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={user.isActive ? "default" : "destructive"}
                    >
                      {user.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(user)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleActive(user)}
                      >
                        {user.isActive ? (
                          <UserX className="h-4 w-4 text-destructive" />
                        ) : (
                          <UserCheck className="h-4 w-4 text-green-600" />
                        )}
                      </Button>
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
                  {searchQuery || roleFilter !== "all"
                    ? "No users match the current filters"
                    : "No users found"}
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
        noun="user"
      />

      {/* Edit User Dialog */}
      <Dialog
        open={editingUser !== null}
        onOpenChange={(open) => !open && setEditingUser(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) =>
                  setEditForm({ ...editForm, email: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select
                value={editForm.role}
                onValueChange={(value) =>
                  setEditForm({ ...editForm, role: value })
                }
              >
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-branch">Branch</Label>
              <Select
                value={editForm.branchId || "none"}
                onValueChange={(value) =>
                  setEditForm({
                    ...editForm,
                    branchId: value === "none" ? "" : value,
                  })
                }
              >
                <SelectTrigger id="edit-branch">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (HQ)</SelectItem>
                  {branches
                    ?.filter((b) => b.isActive)
                    .map((branch) => (
                      <SelectItem key={branch._id} value={branch._id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

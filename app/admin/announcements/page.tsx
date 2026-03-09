"use client";

import { useState } from "react";
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
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Megaphone,
} from "lucide-react";

export default function AnnouncementsPage() {
  const announcements = useQuery(api.admin.announcements.listAnnouncements);
  const create = useMutation(api.admin.announcements.createAnnouncement);
  const update = useMutation(api.admin.announcements.updateAnnouncement);
  const toggle = useMutation(api.admin.announcements.toggleAnnouncementStatus);
  const remove = useMutation(api.admin.announcements.deleteAnnouncement);

  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<Id<"announcements"> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Id<"announcements"> | null>(null);

  // Form state
  const [message, setMessage] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const pagination = usePagination(announcements ?? []);

  function openCreate() {
    setEditingId(null);
    setMessage("");
    setSortOrder((announcements?.length ?? 0) + 1);
    setStartDate("");
    setEndDate("");
    setShowDialog(true);
  }

  function openEdit(id: Id<"announcements">) {
    const item = announcements?.find((a) => a._id === id);
    if (!item) return;
    setEditingId(id);
    setMessage(item.message);
    setSortOrder(item.sortOrder);
    setStartDate(item.startDate ? new Date(item.startDate).toISOString().slice(0, 16) : "");
    setEndDate(item.endDate ? new Date(item.endDate).toISOString().slice(0, 16) : "");
    setShowDialog(true);
  }

  async function handleSave() {
    if (!message.trim()) {
      toast.error("Message is required");
      return;
    }
    setSaving(true);
    try {
      const start = startDate ? new Date(startDate).getTime() : undefined;
      const end = endDate ? new Date(endDate).getTime() : undefined;

      if (editingId) {
        await update({
          announcementId: editingId,
          message: message.trim(),
          sortOrder,
          startDate: start,
          endDate: end,
        });
        toast.success("Announcement updated");
      } else {
        await create({
          message: message.trim(),
          sortOrder,
          startDate: start,
          endDate: end,
        });
        toast.success("Announcement created");
      }
      setShowDialog(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: Id<"announcements">, isActive: boolean) {
    try {
      await toggle({ announcementId: id, isActive: !isActive });
      toast.success(isActive ? "Deactivated" : "Activated");
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function handleDelete(id: Id<"announcements">) {
    if (!confirm("Delete this announcement?")) return;
    setDeleting(id);
    try {
      await remove({ announcementId: id });
      toast.success("Deleted");
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
          <h1 className="text-2xl font-bold">Announcements</h1>
          <p className="text-sm text-muted-foreground">
            Manage the marquee ticker messages shown at the top of the storefront
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Message
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        {announcements === undefined ? (
          <div className="p-8 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : announcements.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-sm text-muted-foreground">
            <Megaphone className="h-10 w-10" />
            <p>No announcements yet. The marquee will show auto-generated messages.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Message</TableHead>
                <TableHead className="w-16">Order</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.paginatedData.map((item) => (
                <TableRow key={item._id}>
                  <TableCell className="max-w-[300px] truncate font-medium">
                    {item.message}
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm">
                    {item.sortOrder}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.startDate || item.endDate ? (
                      <>
                        {item.startDate && new Date(item.startDate).toLocaleDateString()}
                        {" – "}
                        {item.endDate ? new Date(item.endDate).toLocaleDateString() : "No end"}
                      </>
                    ) : (
                      "Always"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.isActive ? "default" : "secondary"}>
                      {item.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(item._id)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggle(item._id, item.isActive)}
                        title={item.isActive ? "Deactivate" : "Activate"}
                      >
                        {item.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(item._id)}
                        disabled={deleting === item._id}
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

      {(announcements?.length ?? 0) > 0 && (
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
            <DialogTitle>{editingId ? "Edit Announcement" : "Add Announcement"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Message *</Label>
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="FREE SHIPPING ON ORDERS ABOVE P2,500"
              />
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
                <Input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date (optional)</Label>
                <Input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
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

"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Image from "next/image";
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
import { cn } from "@/lib/utils";
import {
  Upload, Trash2, Palette, Pencil, Plus, ToggleLeft, ToggleRight,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Asset Upload ─────────────────────────────────────────────────────────────

function AssetUpload({
  label,
  hint,
  currentUrl,
  onUpload,
  onDelete,
  uploading,
  accept,
  previewSize,
}: {
  label: string;
  hint: string;
  currentUrl: string | null;
  onUpload: (file: File) => void;
  onDelete: () => void;
  uploading: boolean;
  accept: string;
  previewSize: "logo" | "favicon";
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>

      <div className="flex items-center gap-4">
        {/* Preview */}
        <div
          className={cn(
            "rounded-lg border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0",
            previewSize === "logo" ? "w-32 h-16" : "w-16 h-16"
          )}
        >
          {currentUrl ? (
            <Image
              src={currentUrl}
              alt={label}
              width={previewSize === "logo" ? 128 : 64}
              height={previewSize === "logo" ? 64 : 64}
              className="object-contain w-full h-full"
            />
          ) : (
            <span className="text-xs text-muted-foreground">No image</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="h-4 w-4 mr-1.5" />
            {uploading ? "Uploading..." : "Upload"}
          </Button>
          {currentUrl && (
            <Button
              size="sm"
              variant="outline"
              onClick={onDelete}
              disabled={uploading}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Colors Section ───────────────────────────────────────────────────────────

function ColorsSection() {
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
    <>
      <SectionCard
        title="Colors"
        description="Manage color options for variants and promotions"
        action={
          <Button onClick={openCreate} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" /> Add Color
          </Button>
        }
      >
        {colors === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : colors.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No colors yet. Add your first color.
          </p>
        ) : (
          <>
            <div className="rounded-md border overflow-hidden">
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
            </div>
            {pagination.totalPages > 1 && (
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
      </SectionCard>

      {/* Color Create/Edit Dialog */}
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
    </>
  );
}

// ─── Size Groups Section ──────────────────────────────────────────────────────

function SizeGroupsSection() {
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
        toast.success("Size group updated");
      } else {
        await createSize({
          name: name.trim(),
          sortOrder: parseInt(sortOrder, 10) || 0,
        });
        toast.success("Size group created");
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
      toast.success(isActive ? "Size group deactivated" : "Size group activated");
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <>
      <SectionCard
        title="Size Groups"
        description="Manage size systems (e.g. EU, US, Apparel). Variants pick a group then enter the specific value."
        action={
          <Button onClick={openCreate} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" /> Add Size Group
          </Button>
        }
      >
        {sizes === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : sizes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No size groups yet. Add your first size group (e.g. EU, US, Apparel).
          </p>
        ) : (
          <>
            <div className="rounded-md border overflow-hidden">
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
            </div>
            {pagination.totalPages > 1 && (
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
      </SectionCard>

      {/* Size Group Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Size Group" : "Add Size Group"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. EU, US, Apparel" />
              <p className="text-xs text-muted-foreground">
                The sizing system name. Variants will select this group then enter a specific value.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">Lower numbers appear first in dropdowns</p>
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
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminSettingsPage() {
  const settings = useQuery(api.admin.settings.getSettings);
  const siteAssets = useQuery(api.admin.settings.getSiteAssets);
  const updateSetting = useMutation(api.admin.settings.updateSetting);
  const saveSiteAsset = useMutation(api.admin.settings.saveSiteAsset);
  const deleteSiteAsset = useMutation(api.admin.settings.deleteSiteAsset);
  const generateUploadUrl = useMutation(api.catalog.images.generateUploadUrl);

  // ── Local state for text inputs ──────────────────────────────────────────
  const [brandName, setBrandName] = useState<string | null>(null);
  const [brandPrimary, setBrandPrimary] = useState<string | null>(null);
  const [brandSecondary, setBrandSecondary] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  // Resolve display values (local edits take priority over server)
  const displayName = brandName ?? settings?.brandName ?? "RedBox Apparel";
  const displayPrimary = brandPrimary ?? settings?.brandPrimary ?? "#dc2626";
  const displaySecondary = brandSecondary ?? settings?.brandSecondary ?? "#1e293b";

  const hasChanges =
    (brandName !== null && brandName !== (settings?.brandName ?? "RedBox Apparel")) ||
    (brandPrimary !== null && brandPrimary !== (settings?.brandPrimary ?? "#dc2626")) ||
    (brandSecondary !== null && brandSecondary !== (settings?.brandSecondary ?? "#1e293b"));

  async function handleSaveBranding() {
    setSaving(true);
    try {
      const updates: { key: string; value: string }[] = [];
      if (brandName !== null) updates.push({ key: "brandName", value: brandName });
      if (brandPrimary !== null) updates.push({ key: "brandPrimary", value: brandPrimary });
      if (brandSecondary !== null) updates.push({ key: "brandSecondary", value: brandSecondary });

      await Promise.all(updates.map((u) => updateSetting(u)));

      // Reset local state
      setBrandName(null);
      setBrandPrimary(null);
      setBrandSecondary(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadAsset(
    file: File,
    key: "siteLogoStorageId" | "siteFaviconStorageId",
    setUploading: (v: boolean) => void
  ) {
    setUploading(true);
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await res.json();
      await saveSiteAsset({ key, storageId });
    } finally {
      setUploading(false);
    }
  }

  if (settings === undefined || siteAssets === undefined) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage branding, colors, and size groups
        </p>
      </div>

      {/* ── Site Logo ──────────────────────────────────────────────────────── */}
      <SectionCard
        title="Site Logo"
        description="Displayed in navigation sidebars and headers across all portals"
      >
        <AssetUpload
          label="Logo"
          hint="Recommended: PNG or SVG, 200x60px or similar aspect ratio"
          currentUrl={siteAssets.siteLogoUrl ?? null}
          onUpload={(file) =>
            handleUploadAsset(file, "siteLogoStorageId", setUploadingLogo)
          }
          onDelete={() => deleteSiteAsset({ key: "siteLogoStorageId" })}
          uploading={uploadingLogo}
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          previewSize="logo"
        />
      </SectionCard>

      {/* ── Favicon ────────────────────────────────────────────────────────── */}
      <SectionCard
        title="Favicon"
        description="The small icon shown in browser tabs and bookmarks"
      >
        <AssetUpload
          label="Favicon"
          hint="Recommended: PNG or ICO, 32x32px or 64x64px"
          currentUrl={siteAssets.siteFaviconUrl ?? null}
          onUpload={(file) =>
            handleUploadAsset(file, "siteFaviconStorageId", setUploadingFavicon)
          }
          onDelete={() => deleteSiteAsset({ key: "siteFaviconStorageId" })}
          uploading={uploadingFavicon}
          accept="image/png,image/x-icon,image/svg+xml,image/ico"
          previewSize="favicon"
        />
      </SectionCard>

      {/* ── Brand Identity ─────────────────────────────────────────────────── */}
      <SectionCard
        title="Brand Identity"
        description="Customize the brand name and colors used across the platform"
      >
        <div className="space-y-4">
          {/* Brand Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Brand Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setBrandName(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="RedBox Apparel"
            />
          </div>

          {/* Colors */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Primary Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={displayPrimary}
                  onChange={(e) => setBrandPrimary(e.target.value)}
                  className="h-9 w-12 rounded border cursor-pointer"
                />
                <input
                  type="text"
                  value={displayPrimary}
                  onChange={(e) => setBrandPrimary(e.target.value)}
                  className="flex-1 rounded-md border px-3 py-2 text-sm font-mono"
                  placeholder="#dc2626"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Secondary Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={displaySecondary}
                  onChange={(e) => setBrandSecondary(e.target.value)}
                  className="h-9 w-12 rounded border cursor-pointer"
                />
                <input
                  type="text"
                  value={displaySecondary}
                  onChange={(e) => setBrandSecondary(e.target.value)}
                  className="flex-1 rounded-md border px-3 py-2 text-sm font-mono"
                  placeholder="#1e293b"
                />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-lg border p-4 space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Preview</p>
            <div className="flex items-center gap-3">
              <div
                className="h-8 w-8 rounded-full"
                style={{ backgroundColor: displayPrimary }}
              />
              <div
                className="h-8 w-8 rounded-full"
                style={{ backgroundColor: displaySecondary }}
              />
              <span className="text-sm font-semibold">{displayName}</span>
            </div>
            <div className="flex gap-2 mt-2">
              <div
                className="rounded-md px-3 py-1.5 text-xs font-medium text-white"
                style={{ backgroundColor: displayPrimary }}
              >
                Primary Button
              </div>
              <div
                className="rounded-md px-3 py-1.5 text-xs font-medium text-white"
                style={{ backgroundColor: displaySecondary }}
              >
                Secondary Button
              </div>
            </div>
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleSaveBranding}
              disabled={!hasChanges || saving}
            >
              <Palette className="h-4 w-4 mr-1.5" />
              {saving ? "Saving..." : "Save Brand Settings"}
            </Button>
            {hasChanges && (
              <span className="text-xs text-muted-foreground">
                You have unsaved changes
              </span>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ── Colors ─────────────────────────────────────────────────────────── */}
      <ColorsSection />

      {/* ── Size Groups ────────────────────────────────────────────────────── */}
      <SizeGroupsSection />
    </div>
  );
}

"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, Palette } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
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
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your site logo, favicon, and brand identity
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
    </div>
  );
}

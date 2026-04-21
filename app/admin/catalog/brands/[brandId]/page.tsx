"use client";

import { useState, useRef } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getErrorMessage } from "@/lib/utils";
import { usePagination } from "@/lib/hooks/usePagination";
import { toast } from "sonner";
import Link from "next/link";
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
import { TablePagination } from "@/components/shared/TablePagination";
import {
  Plus, Search, UserCheck, XCircle, ArrowLeft, Package, ImageIcon, Pencil, Upload, X, Loader2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type ProductCode = {
  _id: Id<"productCodes">;
  type: string;
  description: string;
  code?: string;
  parentId?: Id<"productCodes">;
  isActive: boolean;
};

type StyleDoc = {
  _id: Id<"styles">;
  name: string;
  description?: string;
  styleCode?: string;
  brandId?: Id<"brands">;
  departmentId?: Id<"productCodes">;
  divisionId?: Id<"productCodes">;
  productCategoryId?: Id<"productCodes">;
  subCategoryId?: Id<"productCodes">;
  seasonId?: Id<"productCodes">;
  yearId?: Id<"productCodes">;
  productionId?: Id<"productCodes">;
  outlierId?: Id<"productCodes">;
  sku?: string;
  barcode?: string;
  color?: string;
  srp?: number;
  costPrice?: number;
  basePriceCentavos: number;
  isActive: boolean;
  isExclusive?: boolean;
};

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const EMPTY_FORM = {
  divisionId: "",
  categoryId: "",
  subCategoryId: "",
  departmentId: "",
  seasonId: "",
  yearId: "",
  productionId: "",
  outlierId: "",
  name: "",
  description: "",
  sku: "",
  barcode: "",
  color: "",
  costPrice: "",
  srp: "",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function StylePrimaryThumbnail({ styleId }: { styleId: Id<"styles"> }) {
  const url = useQuery(api.catalog.images.getStylePrimaryImageUrl, { styleId });
  if (!url) {
    return (
      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-10 w-10 rounded object-cover" />
  );
}

// ─── Product Form (shared between Add & Edit) ──────────────────────────────

type ColorOption = { _id: Id<"colors">; name: string; hexCode?: string; isActive: boolean };

function ProductFormFields({
  form,
  updateField,
  allCodes,
  brandCode,
  colors,
}: {
  form: typeof EMPTY_FORM;
  updateField: (field: string, value: string) => void;
  allCodes: ProductCode[];
  brandCode?: string;
  colors: ColorOption[];
}) {
  const divisions = allCodes.filter((c) => c.type === "division");
  const categories = allCodes.filter(
    (c) => c.type === "category" && (form.divisionId ? c.parentId === form.divisionId : true)
  );
  const subCategories = allCodes.filter(
    (c) => c.type === "subCategory" && (form.categoryId ? c.parentId === form.categoryId : true)
  );
  const departments = allCodes.filter((c) => c.type === "department");
  const seasons = allCodes.filter((c) => c.type === "season");
  const years = allCodes.filter((c) => c.type === "year");
  const productions = allCodes.filter((c) => c.type === "production");
  const outliers = allCodes.filter((c) => c.type === "outlier");

  // Style code preview
  const previewCode = (() => {
    if (!brandCode) return "—";
    const parts = [brandCode];
    const ids = [form.departmentId, form.categoryId, form.subCategoryId, form.seasonId, form.yearId, form.productionId];
    for (const id of ids) {
      const pc = id ? allCodes.find((c) => c._id === id) : null;
      parts.push(pc?.code ?? "?");
    }
    if (form.outlierId) {
      const pc = allCodes.find((c) => c._id === form.outlierId);
      parts.push(pc?.code ?? "?");
    }
    return parts.join("") + "-XXXX";
  })();

  return (
    <div className="space-y-4">
      {/* Style code preview */}
      <div className="rounded-lg border p-3 bg-muted/50">
        <p className="text-xs text-muted-foreground">Style Code Preview</p>
        <p className="font-mono text-base font-bold mt-0.5">{previewCode}</p>
      </div>

      {/* Cascading Dropdowns */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Division <span className="text-destructive">*</span></Label>
          <Select value={form.divisionId} onValueChange={(v) => updateField("divisionId", v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {divisions.map((d) => <SelectItem key={d._id} value={d._id}>{d.description}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Category <span className="text-destructive">*</span></Label>
          <Select value={form.categoryId} onValueChange={(v) => updateField("categoryId", v)} disabled={!form.divisionId}>
            <SelectTrigger><SelectValue placeholder={form.divisionId ? "Select" : "Pick division first"} /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => <SelectItem key={c._id} value={c._id}>{c.description}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Sub-Category <span className="text-destructive">*</span></Label>
          <Select value={form.subCategoryId} onValueChange={(v) => updateField("subCategoryId", v)} disabled={!form.categoryId}>
            <SelectTrigger><SelectValue placeholder={form.categoryId ? "Select" : "Pick category first"} /></SelectTrigger>
            <SelectContent>
              {subCategories.map((sc) => (
                <SelectItem key={sc._id} value={sc._id}>{sc.description} {sc.code && `[${sc.code}]`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Department <span className="text-destructive">*</span></Label>
          <Select value={form.departmentId} onValueChange={(v) => updateField("departmentId", v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {departments.map((d) => <SelectItem key={d._id} value={d._id}>{d.description} {d.code && `[${d.code}]`}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Season <span className="text-destructive">*</span></Label>
          <Select value={form.seasonId} onValueChange={(v) => updateField("seasonId", v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {seasons.map((s) => <SelectItem key={s._id} value={s._id}>{s.description} {s.code && `[${s.code}]`}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Year <span className="text-destructive">*</span></Label>
          <Select value={form.yearId} onValueChange={(v) => updateField("yearId", v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y._id} value={y._id}>{y.description} {y.code && `[${y.code}]`}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Production <span className="text-destructive">*</span></Label>
          <Select value={form.productionId} onValueChange={(v) => updateField("productionId", v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {productions.map((p) => <SelectItem key={p._id} value={p._id}>{p.description} {p.code && `[${p.code}]`}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Outlier</Label>
          <Select value={form.outlierId || "_none"} onValueChange={(v) => updateField("outlierId", v === "_none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">None</SelectItem>
              {outliers.map((o) => <SelectItem key={o._id} value={o._id}>{o.description} {o.code && `[${o.code}]`}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Product Details */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label>Product Name <span className="text-destructive">*</span></Label>
          <Input placeholder="e.g. CLASSIC CREW TEE" value={form.name} onChange={(e) => updateField("name", e.target.value)} />
        </div>
        <div className="col-span-2 space-y-1">
          <Label>Description</Label>
          <Input placeholder="Optional" value={form.description} onChange={(e) => updateField("description", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>SKU</Label>
          <Input placeholder="e.g. BH-TP-01" value={form.sku} onChange={(e) => updateField("sku", e.target.value)} className="uppercase" />
        </div>
        <div className="space-y-1">
          <Label>Barcode</Label>
          <Input placeholder="e.g. 8901234567890" value={form.barcode} onChange={(e) => updateField("barcode", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Color</Label>
          <Select value={form.color || "_none"} onValueChange={(v) => updateField("color", v === "_none" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select color" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">None</SelectItem>
              {colors.map((c) => (
                <SelectItem key={c._id} value={c.name}>
                  <div className="flex items-center gap-2">
                    {c.hexCode && (
                      <span className="inline-block w-3 h-3 rounded-full border" style={{ backgroundColor: c.hexCode }} />
                    )}
                    {c.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Cost Price</Label>
          <Input type="number" step="0.01" placeholder="0.00" value={form.costPrice} onChange={(e) => updateField("costPrice", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>SRP <span className="text-destructive">*</span></Label>
          <Input type="number" step="0.01" placeholder="0.00" value={form.srp} onChange={(e) => updateField("srp", e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function BrandProductsPage() {
  const params = useParams();
  const brandId = params.brandId as Id<"brands">;

  const brand = useQuery(api.catalog.brands.getBrandById, { brandId });
  const styles = useQuery(api.catalog.styles.listStyles, { brandId }) as StyleDoc[] | undefined;
  const allCodes = useQuery(api.catalog.productCodes.listAllActive) as ProductCode[] | undefined;

  const activeColors = useQuery(api.admin.colors.listActiveColors) as ColorOption[] | undefined;
  const createStyle = useMutation(api.catalog.styles.createStyle);
  const updateStyle = useMutation(api.catalog.styles.updateStyle);
  const deactivateStyle = useMutation(api.catalog.styles.deactivateStyle);
  const reactivateStyle = useMutation(api.catalog.styles.reactivateStyle);
  const generateUploadUrl = useMutation(api.catalog.images.generateUploadUrl);
  const saveStyleImage = useMutation(api.catalog.images.saveStyleImage);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sortKey, setSortKey] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Add dialog
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({ ...EMPTY_FORM });
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Edit dialog
  const [editingStyle, setEditingStyle] = useState<StyleDoc | null>(null);
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM });

  // Code lookup
  const codeMap = new Map<string, ProductCode>();
  allCodes?.forEach((c) => codeMap.set(c._id, c));
  const getCodeLabel = (id?: Id<"productCodes">) => {
    if (!id) return "—";
    return codeMap.get(id)?.description ?? "—";
  };

  // Filter
  const filteredStyles = styles?.filter((s) => {
    const matchesSearch = searchQuery === "" ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.styleCode ?? "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" ||
      (statusFilter === "active" && s.isActive) ||
      (statusFilter === "inactive" && !s.isActive);
    return matchesSearch && matchesStatus;
  });

  // Sort
  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };
  const SortIcon = ({ col }: { col: string }) => (
    <span className="ml-1 text-xs">{sortKey === col ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
  );

  const sortedStyles = [...(filteredStyles ?? [])].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const valA = (() => {
      switch (sortKey) {
        case "name": return a.name;
        case "styleCode": return a.styleCode ?? "";
        case "sku": return a.sku ?? "";
        case "barcode": return a.barcode ?? "";
        case "color": return a.color ?? "";
        case "costPrice": return a.costPrice ?? 0;
        case "srp": return a.srp ?? 0;
        case "status": return a.isActive ? "active" : "inactive";
        default: return "";
      }
    })();
    const valB = (() => {
      switch (sortKey) {
        case "name": return b.name;
        case "styleCode": return b.styleCode ?? "";
        case "sku": return b.sku ?? "";
        case "barcode": return b.barcode ?? "";
        case "color": return b.color ?? "";
        case "costPrice": return b.costPrice ?? 0;
        case "srp": return b.srp ?? 0;
        case "status": return b.isActive ? "active" : "inactive";
        default: return "";
      }
    })();
    if (typeof valA === "number" && typeof valB === "number") return (valA - valB) * dir;
    return String(valA).localeCompare(String(valB)) * dir;
  });

  const pagination = usePagination(sortedStyles);

  // ─── Add form helpers ─────────────────────────────────────────────────

  const updateAddField = (field: string, value: string) => {
    setAddForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "divisionId") { next.categoryId = ""; next.subCategoryId = ""; }
      if (field === "categoryId") { next.subCategoryId = ""; }
      return next;
    });
  };

  const resetAddForm = () => {
    setAddForm({ ...EMPTY_FORM });
    setPendingImage(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return toast.error("Use JPEG, PNG, or WebP");
    if (file.size > MAX_FILE_SIZE) return toast.error("Max 5MB");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingImage(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleAdd = async () => {
    const f = addForm;
    if (!f.divisionId || !f.categoryId || !f.subCategoryId || !f.departmentId || !f.seasonId || !f.yearId || !f.productionId) {
      return toast.error("All required code fields must be selected");
    }
    if (!f.name.trim()) return toast.error("Product name is required");
    if (!f.srp.trim()) return toast.error("SRP is required");
    const srpVal = parseFloat(f.srp);
    if (isNaN(srpVal) || srpVal <= 0) return toast.error("Invalid SRP");
    const costVal = f.costPrice.trim() ? parseFloat(f.costPrice) : undefined;
    if (costVal !== undefined && (isNaN(costVal) || costVal <= 0)) return toast.error("Invalid cost price");
    if (!brand?.code) return toast.error("Brand must have a code configured");

    setIsSubmitting(true);
    try {
      const styleId = await createStyle({
        brandId,
        departmentId: f.departmentId as Id<"productCodes">,
        divisionId: f.divisionId as Id<"productCodes">,
        productCategoryId: f.categoryId as Id<"productCodes">,
        subCategoryId: f.subCategoryId as Id<"productCodes">,
        seasonId: f.seasonId as Id<"productCodes">,
        yearId: f.yearId as Id<"productCodes">,
        productionId: f.productionId as Id<"productCodes">,
        outlierId: f.outlierId ? (f.outlierId as Id<"productCodes">) : undefined,
        name: f.name.trim(),
        description: f.description.trim() || undefined,
        sku: f.sku.trim() || undefined,
        barcode: f.barcode.trim() || undefined,
        color: f.color.trim() || undefined,
        srp: srpVal,
        costPrice: costVal,
      });

      if (pendingImage) {
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": pendingImage.type }, body: pendingImage });
        const { storageId } = await res.json();
        await saveStyleImage({ styleId: styleId as Id<"styles">, storageId });
      }

      toast.success("Product created");
      setShowAddDialog(false);
      resetAddForm();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Edit form helpers ────────────────────────────────────────────────

  const openEditDialog = (style: StyleDoc) => {
    setEditingStyle(style);
    setEditForm({
      divisionId: style.divisionId ?? "",
      categoryId: style.productCategoryId ?? "",
      subCategoryId: style.subCategoryId ?? "",
      departmentId: style.departmentId ?? "",
      seasonId: style.seasonId ?? "",
      yearId: style.yearId ?? "",
      productionId: style.productionId ?? "",
      outlierId: style.outlierId ?? "",
      name: style.name,
      description: style.description ?? "",
      sku: style.sku ?? "",
      barcode: style.barcode ?? "",
      color: style.color ?? "",
      costPrice: style.costPrice != null ? String(style.costPrice) : "",
      srp: style.srp != null ? String(style.srp) : String(style.basePriceCentavos / 100),
    });
  };

  const updateEditField = (field: string, value: string) => {
    setEditForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "divisionId") { next.categoryId = ""; next.subCategoryId = ""; }
      if (field === "categoryId") { next.subCategoryId = ""; }
      return next;
    });
  };

  const handleEdit = async () => {
    if (!editingStyle) return;
    const f = editForm;
    if (!f.name.trim()) return toast.error("Product name is required");
    const srpVal = f.srp.trim() ? parseFloat(f.srp) : undefined;
    const costVal = f.costPrice.trim() ? parseFloat(f.costPrice) : undefined;

    setIsSubmitting(true);
    try {
      await updateStyle({
        styleId: editingStyle._id,
        name: f.name.trim(),
        description: f.description.trim() || undefined,
        sku: f.sku.trim() || undefined,
        barcode: f.barcode.trim() || undefined,
        color: f.color.trim() || undefined,
        srp: srpVal,
        costPrice: costVal,
        divisionId: f.divisionId ? (f.divisionId as Id<"productCodes">) : undefined,
        productCategoryId: f.categoryId ? (f.categoryId as Id<"productCodes">) : undefined,
        subCategoryId: f.subCategoryId ? (f.subCategoryId as Id<"productCodes">) : undefined,
        departmentId: f.departmentId ? (f.departmentId as Id<"productCodes">) : undefined,
        seasonId: f.seasonId ? (f.seasonId as Id<"productCodes">) : undefined,
        yearId: f.yearId ? (f.yearId as Id<"productCodes">) : undefined,
        productionId: f.productionId ? (f.productionId as Id<"productCodes">) : undefined,
        outlierId: f.outlierId ? (f.outlierId as Id<"productCodes">) : undefined,
      });
      toast.success("Product updated");
      setEditingStyle(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Actions ──────────────────────────────────────────────────────────

  const handleDeactivate = async (id: Id<"styles">, name: string) => {
    if (!window.confirm(`Deactivate "${name}"?`)) return;
    try { await deactivateStyle({ styleId: id }); toast.success(`"${name}" deactivated`); }
    catch (err) { toast.error(getErrorMessage(err)); }
  };

  const handleReactivate = async (id: Id<"styles">, name: string) => {
    try { await reactivateStyle({ styleId: id }); toast.success(`"${name}" reactivated`); }
    catch (err) { toast.error(getErrorMessage(err)); }
  };

  // ─── Loading / Not found ──────────────────────────────────────────────

  if (brand === undefined || styles === undefined || allCodes === undefined) {
    return <div className="space-y-4"><h1 className="text-2xl font-bold">Products</h1><p className="text-muted-foreground text-sm">Loading...</p></div>;
  }
  if (!brand) {
    return <div className="space-y-4"><Link href="/admin/catalog" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back</Link><p className="text-muted-foreground">Brand not found.</p></div>;
  }

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/admin/catalog" className="hover:text-foreground transition-colors">Catalog</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{brand.name}</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{brand.name}</h1>
            {brand.code && <Badge variant="outline" className="font-mono">{brand.code}</Badge>}
            <Badge variant={brand.isActive ? "default" : "destructive"}>{brand.isActive ? "Active" : "Inactive"}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{filteredStyles?.length ?? 0} product{(filteredStyles?.length ?? 0) !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} disabled={!brand.isActive}>
          <Plus className="mr-2 h-4 w-4" /> Add Product
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name or style code..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Filter" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Products Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Image</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>Product Name<SortIcon col="name" /></TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("styleCode")}>Style Code<SortIcon col="styleCode" /></TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("sku")}>SKU<SortIcon col="sku" /></TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("barcode")}>Barcode<SortIcon col="barcode" /></TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("color")}>Color<SortIcon col="color" /></TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("costPrice")}>Cost Price<SortIcon col="costPrice" /></TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("srp")}>SRP<SortIcon col="srp" /></TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("status")}>Status<SortIcon col="status" /></TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.paginatedData.length > 0 ? (
              pagination.paginatedData.map((style) => (
                <TableRow key={style._id}>
                  <TableCell><StylePrimaryThumbnail styleId={style._id} /></TableCell>
                  <TableCell className="font-medium whitespace-nowrap">
                    <div className="flex items-center gap-2"><Package className="h-4 w-4 text-muted-foreground shrink-0" />{style.name}</div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{style.description || "—"}</TableCell>
                  <TableCell>{style.styleCode ? <span className="font-mono font-semibold text-sm">{style.styleCode}</span> : <span className="text-muted-foreground text-xs">Legacy</span>}</TableCell>
                  <TableCell className="text-sm font-mono whitespace-nowrap">{style.sku || "—"}</TableCell>
                  <TableCell className="text-sm font-mono whitespace-nowrap">{style.barcode || "—"}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{style.color || "—"}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{style.costPrice != null ? `₱${Number(style.costPrice).toLocaleString()}` : "—"}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{style.srp != null ? `₱${Number(style.srp).toLocaleString()}` : "—"}</TableCell>
                  <TableCell><Badge variant={style.isActive ? "default" : "destructive"}>{style.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(style)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                      {style.isActive ? (
                        <Button variant="ghost" size="sm" onClick={() => handleDeactivate(style._id, style.name)} title="Deactivate"><XCircle className="h-4 w-4 text-destructive" /></Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => handleReactivate(style._id, style.name)} title="Reactivate"><UserCheck className="h-4 w-4 text-green-600" /></Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  {searchQuery || statusFilter !== "all" ? "No products match the current filters" : "No products yet. Click \"Add Product\" to create one."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <TablePagination currentPage={pagination.currentPage} totalPages={pagination.totalPages} totalItems={pagination.totalItems} hasNextPage={pagination.hasNextPage} hasPrevPage={pagination.hasPrevPage} onNextPage={pagination.nextPage} onPrevPage={pagination.prevPage} noun="product" />

      {/* ── Add Product Dialog ─────────────────────────────────────────── */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { if (!open) { setShowAddDialog(false); resetAddForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Product — {brand.name}</DialogTitle>
          </DialogHeader>
          {/* Image */}
          <div className="space-y-2">
            <Label>Product Image</Label>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageSelect} />
            {previewUrl ? (
              <div className="flex items-center gap-3">
                <img src={previewUrl} alt="Preview" className="h-20 w-20 rounded-lg object-cover border" />
                <Button variant="ghost" size="sm" onClick={() => { setPendingImage(null); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}>
                  <X className="h-4 w-4 mr-1" /> Remove
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Upload Image
              </Button>
            )}
          </div>
          <ProductFormFields form={addForm} updateField={updateAddField} allCodes={allCodes ?? []} brandCode={brand.code} colors={activeColors ?? []} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); resetAddForm(); }} disabled={isSubmitting}>Cancel</Button>
            <Button onClick={handleAdd} disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</> : "Create Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Product Dialog ────────────────────────────────────────── */}
      <Dialog open={editingStyle !== null} onOpenChange={(open) => !open && setEditingStyle(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          <ProductFormFields form={editForm} updateField={updateEditField} allCodes={allCodes ?? []} brandCode={brand.code} colors={activeColors ?? []} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingStyle(null)} disabled={isSubmitting}>Cancel</Button>
            <Button onClick={handleEdit} disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

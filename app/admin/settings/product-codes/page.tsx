"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
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
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Plus, Pencil, XCircle, UserCheck, ArrowLeft,
} from "lucide-react";
import Link from "next/link";

// ─── Types & Constants ──────────────────────────────────────────────────────

type CodeType =
  | "department"
  | "division"
  | "category"
  | "subCategory"
  | "season"
  | "year"
  | "production"
  | "outlier"
  | "fit";

const CODE_TYPES: { value: CodeType; label: string; description: string; hasCode: boolean }[] = [
  { value: "department", label: "Department", description: "Top-level business department", hasCode: true },
  { value: "division", label: "Division", description: "Product division — description only, not used in style code", hasCode: false },
  { value: "category", label: "Category", description: "Product category classification", hasCode: true },
  { value: "subCategory", label: "Sub-Category", description: "Detailed sub-category", hasCode: true },
  { value: "season", label: "Season", description: "Seasonal collection identifier", hasCode: true },
  { value: "year", label: "Year", description: "Production year", hasCode: true },
  { value: "production", label: "Production", description: "Production batch or run", hasCode: true },
  { value: "outlier", label: "Outlier", description: "Special classification codes", hasCode: true },
  { value: "fit", label: "Fit", description: "Garment fit — used in Fit Performance reports", hasCode: false },
];

type ProductCode = {
  _id: Id<"productCodes">;
  type: CodeType;
  description: string;
  code: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

// ─── Brand Code Section ─────────────────────────────────────────────────────

function BrandCodesTab() {
  const brands = useQuery(api.catalog.brands.listBrands);
  const updateBrand = useMutation(api.catalog.brands.updateBrand);
  const [editingId, setEditingId] = useState<Id<"brands"> | null>(null);
  const [editCode, setEditCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSaveCode = async (brandId: Id<"brands">) => {
    setIsSubmitting(true);
    try {
      await updateBrand({ brandId, code: editCode.toUpperCase() });
      toast.success("Brand code updated");
      setEditingId(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!brands) return <p className="text-sm text-muted-foreground">Loading brands...</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Assign short codes to each brand. These codes form the first segment of the auto-generated style code.
      </p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Brand Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {brands.map((brand) => (
              <TableRow key={brand._id}>
                <TableCell className="font-medium">{brand.name}</TableCell>
                <TableCell>
                  {editingId === brand._id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editCode}
                        onChange={(e) => setEditCode(e.target.value)}
                        className="w-24 h-8 uppercase"
                        placeholder="e.g. BH"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveCode(brand._id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSaveCode(brand._id)}
                        disabled={isSubmitting}
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <span className={brand.code ? "font-mono font-semibold" : "text-muted-foreground"}>
                      {brand.code ?? "Not set"}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={brand.isActive ? "default" : "destructive"}>
                    {brand.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {editingId !== brand._id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(brand._id);
                        setEditCode(brand.code ?? "");
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {brands.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No brands configured. Add brands in the Catalog section first.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Product Code Type Tab ──────────────────────────────────────────────────

function ProductCodeTab({ type, label, description, hasCode = true }: { type: CodeType; label: string; description: string; hasCode?: boolean }) {
  const codes = useQuery(api.catalog.productCodes.listByType, { type }) as ProductCode[] | undefined;
  const createCode = useMutation(api.catalog.productCodes.create);
  const updateCode = useMutation(api.catalog.productCodes.update);
  const deactivateCode = useMutation(api.catalog.productCodes.deactivate);
  const reactivateCode = useMutation(api.catalog.productCodes.reactivate);

  const [showCreate, setShowCreate] = useState(false);
  const [createDesc, setCreateDesc] = useState("");
  const [createCodeVal, setCreateCodeVal] = useState("");
  const [editingId, setEditingId] = useState<Id<"productCodes"> | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editCodeVal, setEditCodeVal] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!createDesc.trim()) {
      toast.error("Description is required");
      return;
    }
    if (hasCode && !createCodeVal.trim()) {
      toast.error("Code is required");
      return;
    }
    setIsSubmitting(true);
    try {
      await createCode({
        type,
        description: createDesc.trim(),
        code: hasCode ? createCodeVal.trim() : undefined,
      });
      toast.success(`${label} code created`);
      setShowCreate(false);
      setCreateDesc("");
      setCreateCodeVal("");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (id: Id<"productCodes">) => {
    setIsSubmitting(true);
    try {
      await updateCode({
        id,
        description: editDesc.trim() || undefined,
        code: editCodeVal.trim() || undefined,
      });
      toast.success(`${label} code updated`);
      setEditingId(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (pc: ProductCode) => {
    try {
      if (pc.isActive) {
        await deactivateCode({ id: pc._id });
        toast.success("Deactivated");
      } else {
        await reactivateCode({ id: pc._id });
        toast.success("Reactivated");
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (!codes) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{description}</p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add {label}
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              {hasCode && <TableHead>Code</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {codes.map((pc) => (
              <TableRow key={pc._id}>
                <TableCell>
                  {editingId === pc._id ? (
                    <Input
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      className="h-8"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleUpdate(pc._id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                  ) : (
                    <span className="font-medium">{pc.description}</span>
                  )}
                </TableCell>
                {hasCode && (
                  <TableCell>
                    {editingId === pc._id ? (
                      <Input
                        value={editCodeVal}
                        onChange={(e) => setEditCodeVal(e.target.value)}
                        className="w-24 h-8 uppercase"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleUpdate(pc._id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                    ) : (
                      <span className="font-mono font-semibold">{pc.code}</span>
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <Badge variant={pc.isActive ? "default" : "destructive"}>
                    {pc.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {editingId === pc._id ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => handleUpdate(pc._id)} disabled={isSubmitting}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingId(pc._id);
                            setEditDesc(pc.description);
                            setEditCodeVal(pc.code);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {pc.isActive ? (
                          <Button variant="ghost" size="sm" onClick={() => handleToggle(pc)}>
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => handleToggle(pc)}>
                            <UserCheck className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {codes.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No {label.toLowerCase()} codes yet. Add one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => !open && setShowCreate(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {label} Code</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder={`e.g. ${label === "Year" ? "2026" : label === "Season" ? "Summer" : "Enter description"}`}
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
              />
            </div>
            {hasCode && (
              <div className="space-y-2">
                <Label>Code</Label>
                <Input
                  placeholder={`e.g. ${label === "Year" ? "26" : label === "Season" ? "SS" : "XX"}`}
                  value={createCodeVal}
                  onChange={(e) => setCreateCodeVal(e.target.value)}
                  className="uppercase"
                />
                <p className="text-xs text-muted-foreground">
                  Short code used in style code generation. Will be auto-uppercased.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ProductCodesSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/settings">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Product Code Configuration</h1>
          <p className="text-sm text-muted-foreground">
            Configure the codes that make up your auto-generated style codes
          </p>
        </div>
      </div>

      <div className="rounded-lg border p-4 bg-muted/50">
        <p className="text-sm font-medium">Style Code Format</p>
        <p className="text-xs text-muted-foreground mt-1">
          Style codes are auto-generated by combining codes from each attribute:
        </p>
        <div className="mt-2 font-mono text-sm bg-background p-3 rounded border">
          <span className="text-blue-600">[Brand]</span>
          <span className="text-purple-600">[Dept]</span>
          <span className="text-orange-600">[Cat]</span>
          <span className="text-pink-600">[SubCat]</span>
          <span className="text-teal-600">[Season]</span>
          <span className="text-red-600">[Year]</span>
          <span className="text-indigo-600">[Prod]</span>
          <span className="text-amber-600">[Outlier]</span>
          <span className="text-muted-foreground">-0001</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Division is a classification only and is not included in the style code.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Example: <span className="font-mono font-semibold">AMTT0126-0001</span>
        </p>
      </div>

      <Tabs defaultValue="brand" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="brand">Brand</TabsTrigger>
          {CODE_TYPES.map((ct) => (
            <TabsTrigger key={ct.value} value={ct.value}>
              {ct.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="brand">
          <BrandCodesTab />
        </TabsContent>

        {CODE_TYPES.map((ct) => (
          <TabsContent key={ct.value} value={ct.value}>
            <ProductCodeTab type={ct.value} label={ct.label} description={ct.description} hasCode={ct.hasCode} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

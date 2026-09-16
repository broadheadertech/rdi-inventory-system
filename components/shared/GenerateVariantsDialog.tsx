"use client";

// components/shared/GenerateVariantsDialog.tsx — a style's colours × sizes in one go.
//
// A product with five colours in three sizes is fifteen variants, and adding
// them one dialog at a time meant fifteen SKUs typed out by hand. Here the
// colours and the sizes are picked once and every combination is minted, with
// the SKUs spelled by the same buildVariantSku the server uses — so the preview
// below is exactly what gets saved.
//
// Combinations the style already has are shown as such and skipped, so this can
// be opened again after adding a colour and only the new squares are filled.

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Variant } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import {
  assignColorCodes,
  buildVariantSku,
  colorKey,
} from "@/convex/_helpers/variantSku";
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
import { cn } from "@/lib/utils";
import { Loader2, Plus, Wand2 } from "lucide-react";

const NO_GROUP = "__none";

/** A colour or size the cashier can switch on and off. */
function Chip({
  label,
  selected,
  onClick,
  hint,
  swatch,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  hint?: string;
  swatch?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input hover:bg-muted"
      )}
    >
      {swatch && (
        <span
          className="inline-block h-3 w-3 shrink-0 rounded-full border"
          style={{ backgroundColor: swatch }}
        />
      )}
      {label}
    </button>
  );
}

export function GenerateVariantsDialog({
  open,
  onOpenChange,
  styleId,
  styleName,
  styleCode,
  basePriceCentavos,
  variants,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  styleId: Id<"styles">;
  styleName: string;
  styleCode?: string;
  basePriceCentavos: number;
  /** The style's existing variants — what is already taken, and which letter each colour holds. */
  variants: Variant[];
}) {
  const activeColors = useQuery(api.admin.colors.listActiveColors);
  const activeSizes = useQuery(api.admin.sizes.listActiveSizes);
  const sizeSuggestions = useQuery(api.catalog.variants.listSizeSuggestions);
  const createMatrix = useMutation(api.catalog.variants.createVariantMatrix);

  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [sizeGroup, setSizeGroup] = useState<string>(NO_GROUP);
  const [customSize, setCustomSize] = useState("");
  const [price, setPrice] = useState((basePriceCentavos / 100).toFixed(2));
  const [costPrice, setCostPrice] = useState("");
  const [gender, setGender] = useState<string>(NO_GROUP);
  const [barcodeFromSku, setBarcodeFromSku] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function reset() {
    setSelectedColors([]);
    setSelectedSizes([]);
    setSizeGroup(NO_GROUP);
    setCustomSize("");
    setPrice((basePriceCentavos / 100).toFixed(2));
    setCostPrice("");
    setGender(NO_GROUP);
    setBarcodeFromSku(false);
  }

  function toggle(list: string[], value: string, set: (next: string[]) => void) {
    set(
      list.some((entry) => colorKey(entry) === colorKey(value))
        ? list.filter((entry) => colorKey(entry) !== colorKey(value))
        : [...list, value]
    );
  }

  // Sizes offered as chips: the ones already used in this size group, so a
  // shop's own sizes come back without being retyped.
  const suggestedSizes = useMemo(() => {
    const group = sizeGroup === NO_GROUP ? "" : sizeGroup;
    const match = (sizeSuggestions ?? []).find((row) => row.group === group);
    const fromData = match?.sizes ?? [];
    // Anything typed in by hand stays on the list while the dialog is open.
    const extras = selectedSizes.filter(
      (size) => !fromData.some((known) => colorKey(known) === colorKey(size))
    );
    return [...fromData, ...extras];
  }, [sizeSuggestions, sizeGroup, selectedSizes]);

  // What will be created, worked out exactly as the server will.
  const preview = useMemo(() => {
    if (!styleCode || selectedColors.length === 0 || selectedSizes.length === 0) {
      return { fresh: [] as { label: string; sku: string }[], existing: [] as string[] };
    }
    const existingCodes = new Map<string, string>();
    for (const variant of variants) {
      const key = colorKey(variant.color);
      if (variant.colorCode && !existingCodes.has(key)) {
        existingCodes.set(key, variant.colorCode);
      }
    }
    const codes = assignColorCodes(existingCodes, selectedColors);
    const taken = new Set(
      variants.map((variant) => `${colorKey(variant.color)}|${colorKey(variant.size)}`)
    );

    const fresh: { label: string; sku: string }[] = [];
    const existing: string[] = [];
    for (const color of selectedColors) {
      for (const size of selectedSizes) {
        const label = `${color} / ${size}`;
        if (taken.has(`${colorKey(color)}|${colorKey(size)}`)) {
          existing.push(label);
          continue;
        }
        fresh.push({
          label,
          sku: buildVariantSku({
            styleCode,
            colorCode: codes.get(colorKey(color)) ?? "",
            color,
            size,
          }),
        });
      }
    }
    return { fresh, existing };
  }, [styleCode, selectedColors, selectedSizes, variants]);

  const priceNumber = Number(price);
  const priceValid = Number.isFinite(priceNumber) && priceNumber > 0;
  const costNumber = Number(costPrice);
  const costValid = costPrice.trim() === "" || (Number.isFinite(costNumber) && costNumber > 0);
  const canSubmit =
    !!styleCode && preview.fresh.length > 0 && priceValid && costValid && !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const result = await createMatrix({
        styleId,
        colors: selectedColors,
        sizes: selectedSizes,
        ...(sizeGroup !== NO_GROUP ? { sizeGroup } : {}),
        ...(gender !== NO_GROUP
          ? { gender: gender as "mens" | "womens" | "unisex" | "kids" | "boys" | "girls" }
          : {}),
        priceCentavos: Math.round(priceNumber * 100),
        ...(costPrice.trim() ? { costPriceCentavos: Math.round(costNumber * 100) } : {}),
        ...(barcodeFromSku ? { barcodeFromSku: true } : {}),
      });

      const madeCount = result.created.length;
      toast.success(
        `Created ${madeCount} variant${madeCount === 1 ? "" : "s"}` +
          (result.skipped.length > 0 ? `, skipped ${result.skipped.length}` : "")
      );
      // Anything the server could not create is worth reading, not just counting.
      const notable = result.skipped.filter(
        (entry) => entry.reason !== "This style already has it"
      );
      for (const entry of notable.slice(0, 3)) {
        toast.warning(`${entry.label}: ${entry.reason}`);
      }
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            Generate variants for {styleName}
          </DialogTitle>
        </DialogHeader>

        {!styleCode ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            This product has no style code, so SKUs cannot be built from it. Add a
            style code first, or create the variants one at a time.
          </p>
        ) : (
          <div className="space-y-5">
            {/* Colours */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Colours</Label>
                <span className="text-xs text-muted-foreground">
                  {selectedColors.length} picked
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(activeColors ?? []).map((color) => (
                  <Chip
                    key={color._id}
                    label={color.name}
                    swatch={color.hexCode}
                    selected={selectedColors.some(
                      (entry) => colorKey(entry) === colorKey(color.name)
                    )}
                    onClick={() => toggle(selectedColors, color.name, setSelectedColors)}
                  />
                ))}
                {activeColors !== undefined && activeColors.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No colours set up yet — add them in Admin → Settings.
                  </p>
                )}
              </div>
            </div>

            {/* Sizes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Sizes</Label>
                <Select value={sizeGroup} onValueChange={setSizeGroup}>
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue placeholder="Size group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_GROUP}>No size group</SelectItem>
                    {(activeSizes ?? []).map((group) => (
                      <SelectItem key={group._id} value={group.name}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {suggestedSizes.map((size) => (
                  <Chip
                    key={size}
                    label={size}
                    selected={selectedSizes.some(
                      (entry) => colorKey(entry) === colorKey(size)
                    )}
                    onClick={() => toggle(selectedSizes, size, setSelectedSizes)}
                  />
                ))}
                {suggestedSizes.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No sizes used in this group yet — type them in below.
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  className="h-8 text-xs"
                  placeholder="Add a size — e.g. XXL, 38, 34C"
                  value={customSize}
                  onChange={(e) => setCustomSize(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const size = customSize.trim();
                      if (size) toggle(selectedSizes, size, setSelectedSizes);
                      setCustomSize("");
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const size = customSize.trim();
                    if (size) toggle(selectedSizes, size, setSelectedSizes);
                    setCustomSize("");
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Price, cost, gender */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="matrix-price">Price</Label>
                <Input
                  id="matrix-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
                {!priceValid && (
                  <p className="text-xs text-destructive">Enter a price above zero</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="matrix-cost">Cost Price</Label>
                <Input
                  id="matrix-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Optional"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                />
                {!costValid && (
                  <p className="text-xs text-destructive">Enter a cost above zero</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_GROUP}>None</SelectItem>
                    <SelectItem value="mens">Mens</SelectItem>
                    <SelectItem value="womens">Womens</SelectItem>
                    <SelectItem value="unisex">Unisex</SelectItem>
                    <SelectItem value="kids">Kids</SelectItem>
                    <SelectItem value="boys">Boys</SelectItem>
                    <SelectItem value="girls">Girls</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={barcodeFromSku}
                onChange={(e) => setBarcodeFromSku(e.target.checked)}
                className="mt-0.5 rounded border-gray-300"
              />
              <span>
                Use the SKU as the barcode. Leave this off if the garment already
                carries a printed barcode you intend to scan.
              </span>
            </label>

            {/* Preview */}
            <div className="rounded-md border bg-muted/40 p-3">
              {preview.fresh.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {selectedColors.length === 0 || selectedSizes.length === 0
                    ? "Pick colours and sizes to see what will be created."
                    : "Every combination picked already exists on this product."}
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium">
                    {preview.fresh.length} new variant
                    {preview.fresh.length === 1 ? "" : "s"}
                    {preview.existing.length > 0 && (
                      <span className="font-normal text-muted-foreground">
                        {" · "}
                        {preview.existing.length} already exist
                        {preview.existing.length === 1 ? "s" : ""}, skipped
                      </span>
                    )}
                  </p>
                  <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-muted-foreground">
                    {preview.fresh.slice(0, 6).map((entry) => (
                      <li key={entry.sku}>{entry.sku}</li>
                    ))}
                    {preview.fresh.length > 6 && (
                      <li className="font-sans">
                        …and {preview.fresh.length - 6} more
                      </li>
                    )}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting
              ? "Creating..."
              : `Create ${preview.fresh.length || ""} variant${
                  preview.fresh.length === 1 ? "" : "s"
                }`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

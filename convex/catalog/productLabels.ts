// convex/catalog/productLabels.ts — what goes on a product's QR label.
//
// RDI scans by code everywhere: the POS, goods receipt, packing and box
// receiving all resolve a scanned string by barcode first and by SKU second,
// and the camera scanner already accepts QR_CODE as a format. So a QR holding
// nothing but the SKU works on every one of those surfaces without a line of
// scanning code changing.
//
// What was missing was a label to scan. Not one of the 267 variants carries a
// manufacturer barcode, which is why scan-only receiving has so far depended on
// somebody having printed a SKU by hand. This feeds the label sheet.
//
// The price is the one field that goes stale: a branch override beats the base
// price, and an approved change makes every printed tag wrong. Both figures are
// returned so the page can say which it is printing and warn when a branch
// differs from base.

import { query } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { withBranchScope } from "../_helpers/withBranchScope";
import { HQ_ROLES } from "../_helpers/permissions";

// Anyone who might stand at a label printer.
const LABEL_ROLES = ["admin", "hqStaff", "warehouseStaff", "manager"];

/** A print run past this is a catalogue, not a label job. */
const MAX_LABEL_ROWS = 600;

export const listVariantsForLabels = query({
  args: {
    /** Prices and stock are read for this store. Omitted means base prices. */
    branchId: v.optional(v.id("branches")),
    brandId: v.optional(v.id("brands")),
    styleId: v.optional(v.id("styles")),
    /** Matches a SKU, a product name or a style code. */
    search: v.optional(v.string()),
    /** Only what the chosen store actually holds — the usual label job. */
    onlyInStock: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!LABEL_ROLES.includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }
    const isHq =
      (HQ_ROLES as readonly string[]).includes(scope.user.role) ||
      scope.user.role === "warehouseStaff";

    // A branch-scoped caller prices and counts against their own store only,
    // whatever the argument says.
    const branchId = isHq ? args.branchId : (scope.branchId ?? undefined);
    if (args.branchId && !isHq && args.branchId !== scope.branchId) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "You can only print labels for your own store.",
      });
    }

    const branch = branchId ? await ctx.db.get(branchId) : null;

    // Stock and overrides for the chosen store, read once rather than per row.
    const stockByVariant = new Map<string, number>();
    const overrideByVariant = new Map<string, number>();
    if (branchId) {
      for (const row of await ctx.db
        .query("inventory")
        .withIndex("by_branch", (q) => q.eq("branchId", branchId))
        .collect()) {
        stockByVariant.set(row.variantId as string, row.quantity);
      }
      for (const row of await ctx.db
        .query("branchPrices")
        .withIndex("by_branch", (q) => q.eq("branchId", branchId))
        .collect()) {
        overrideByVariant.set(row.variantId as string, row.priceCentavos);
      }
    }

    const variants = args.styleId
      ? await ctx.db
          .query("variants")
          .withIndex("by_style", (q) => q.eq("styleId", args.styleId as Id<"styles">))
          .collect()
      : await ctx.db.query("variants").collect();

    const search = args.search?.trim().toLowerCase() ?? "";
    const styleCache = new Map<string, Doc<"styles"> | null>();
    const brandNameCache = new Map<string, string | null>();
    const categoryBrand = new Map<string, Id<"brands"> | null>();

    const rows: {
      variantId: Id<"variants">;
      sku: string;
      productName: string;
      styleCode: string | null;
      size: string;
      color: string;
      brandName: string | null;
      basePriceCentavos: number;
      /** What this store charges: its override, else the base price. */
      priceCentavos: number;
      hasBranchOverride: boolean;
      stockAtBranch: number | null;
    }[] = [];
    let truncated = false;

    for (const variant of variants) {
      if (!variant.isActive) continue;

      let style = styleCache.get(variant.styleId as string);
      if (style === undefined) {
        style = await ctx.db.get(variant.styleId);
        styleCache.set(variant.styleId as string, style);
      }

      // Brand sits on the style, falling back to its category — the same
      // reading the rest of the reports use.
      let brandId = categoryBrand.get(variant.styleId as string);
      if (brandId === undefined) {
        brandId = style?.brandId ?? null;
        if (!brandId && style?.categoryId) {
          const category = await ctx.db.get(style.categoryId);
          brandId = category?.brandId ?? null;
        }
        categoryBrand.set(variant.styleId as string, brandId);
      }
      if (args.brandId && brandId !== args.brandId) continue;

      const productName = style?.name ?? "Unknown";
      const styleCode = style?.styleCode ?? null;
      if (
        search &&
        !variant.sku.toLowerCase().includes(search) &&
        !productName.toLowerCase().includes(search) &&
        !(styleCode ?? "").toLowerCase().includes(search)
      ) {
        continue;
      }

      const stock = branchId ? (stockByVariant.get(variant._id as string) ?? 0) : null;
      if (args.onlyInStock && (stock ?? 0) <= 0) continue;

      if (rows.length >= MAX_LABEL_ROWS) {
        truncated = true;
        break;
      }

      let brandName = brandId ? brandNameCache.get(brandId as string) : null;
      if (brandId && brandName === undefined) {
        brandName = (await ctx.db.get(brandId))?.name ?? null;
        brandNameCache.set(brandId as string, brandName);
      }

      const override = overrideByVariant.get(variant._id as string);
      rows.push({
        variantId: variant._id,
        sku: variant.sku,
        productName,
        styleCode,
        size: variant.size ?? "",
        color: variant.color ?? "",
        brandName: brandName ?? null,
        basePriceCentavos: variant.priceCentavos,
        priceCentavos: override ?? variant.priceCentavos,
        hasBranchOverride: override !== undefined,
        stockAtBranch: stock,
      });
    }

    rows.sort((a, b) => a.sku.localeCompare(b.sku));

    const branches = await ctx.db.query("branches").collect();

    return {
      rows,
      truncated,
      branchName: branch?.name ?? null,
      // Where the price on a label comes from, so the page can say so.
      pricedFor: branchId ? ("branch" as const) : ("base" as const),
      branches: branches
        .filter((b) => b.isActive && (isHq || b._id === scope.branchId))
        .map((b) => ({ _id: b._id, name: b.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      canPickBranch: isHq,
    };
  },
});

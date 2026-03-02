import { v, ConvexError } from "convex/values";
import { query } from "../_generated/server";
import { withBranchScope } from "../_helpers/withBranchScope";
import { requireRole, POS_ROLES } from "../_helpers/permissions";

// ─── POS Product Search Queries ─────────────────────────────────────────────

export const searchPOSProducts = query({
  args: {
    searchText: v.optional(v.string()),
    brandId: v.optional(v.id("brands")),
    categoryId: v.optional(v.id("categories")),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);

    // Enforce POS role at API level (defense-in-depth)
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const branchId = scope.branchId;

    // 1. Load all reference data (active only)
    const allBrands = await ctx.db.query("brands").collect();
    const activeBrands = allBrands.filter((b) => b.isActive);
    const brandById: Record<string, (typeof activeBrands)[number]> = {};
    for (const b of activeBrands) brandById[b._id] = b;

    const allCategories = await ctx.db.query("categories").collect();
    const activeCategories = allCategories.filter((c) => c.isActive);
    const categoryById: Record<string, (typeof activeCategories)[number]> = {};
    for (const c of activeCategories) categoryById[c._id] = c;

    const allStyles = await ctx.db.query("styles").collect();
    const activeStyles = allStyles.filter((s) => s.isActive);
    const styleById: Record<string, (typeof activeStyles)[number]> = {};
    for (const s of activeStyles) styleById[s._id] = s;

    // 2. Batch-load inventory for branch
    const inventoryByVariant: Record<string, number> = {};
    if (branchId) {
      const inventory = await ctx.db
        .query("inventory")
        .withIndex("by_branch", (q) => q.eq("branchId", branchId))
        .collect();
      for (const inv of inventory) {
        inventoryByVariant[inv.variantId] = inv.quantity;
      }
    }

    // 3. Batch-load primary images
    const allProductImages = await ctx.db.query("productImages").collect();
    const primaryStorageByStyle: Record<string, (typeof allProductImages)[number]["storageId"]> = {};
    for (const img of allProductImages) {
      if (img.isPrimary) {
        primaryStorageByStyle[img.styleId] = img.storageId;
      }
    }

    // 4. Load all active variants
    const allVariants = await ctx.db.query("variants").collect();
    const activeVariants = allVariants.filter((v) => v.isActive);

    // 5. Determine which styleIds match filters
    const matchingStyleIds = new Set<string>();
    const searchLower = args.searchText?.toLowerCase();

    for (const variant of activeVariants) {
      const style = styleById[variant.styleId];
      if (!style) continue;
      const category = categoryById[style.categoryId];
      if (!category) continue;
      const brand = brandById[category.brandId];
      if (!brand) continue;

      if (args.brandId && category.brandId !== args.brandId) continue;
      if (args.categoryId && style.categoryId !== args.categoryId) continue;

      if (searchLower) {
        const matchesStyle = style.name.toLowerCase().includes(searchLower);
        const matchesBrand = brand.name.toLowerCase().includes(searchLower);
        const matchesSku = variant.sku.toLowerCase().includes(searchLower);
        if (!matchesStyle && !matchesBrand && !matchesSku) continue;
      }

      matchingStyleIds.add(variant.styleId);
    }

    // 6. Group ALL active variants for matching styles
    const variantsByStyle: Record<string, typeof activeVariants> = {};
    for (const variant of activeVariants) {
      if (!matchingStyleIds.has(variant.styleId)) continue;
      if (!variantsByStyle[variant.styleId]) {
        variantsByStyle[variant.styleId] = [];
      }
      variantsByStyle[variant.styleId].push(variant);
    }

    // 7. Resolve image URLs in parallel
    const styleIdsArray = Array.from(matchingStyleIds);
    const imageUrls = await Promise.all(
      styleIdsArray.map((styleId) => {
        const storageId = primaryStorageByStyle[styleId];
        return storageId ? ctx.storage.getUrl(storageId) : Promise.resolve(null);
      })
    );
    const imageUrlByStyle: Record<string, string | null> = {};
    for (let i = 0; i < styleIdsArray.length; i++) {
      imageUrlByStyle[styleIdsArray[i]] = imageUrls[i];
    }

    // 8. Build results
    const results = [];
    for (const styleId of styleIdsArray) {
      const variants = variantsByStyle[styleId];
      if (!variants || variants.length === 0) continue;

      const style = styleById[styleId];
      const category = categoryById[style.categoryId];
      const brand = brandById[category.brandId];

      const sizes = variants.map((v) => ({
        variantId: v._id,
        sku: v.sku,
        size: v.size,
        color: v.color,
        priceCentavos: v.priceCentavos,
        stock: inventoryByVariant[v._id] ?? 0,
      }));

      results.push({
        styleId: style._id,
        styleName: style.name,
        brandName: brand.name,
        categoryName: category.name,
        basePriceCentavos: style.basePriceCentavos,
        imageUrl: imageUrlByStyle[styleId],
        sizes,
      });
    }

    results.sort((a, b) => {
      const brandCompare = a.brandName.localeCompare(b.brandName);
      if (brandCompare !== 0) return brandCompare;
      return a.styleName.localeCompare(b.styleName);
    });

    return results;
  },
});

export const listPOSBrands = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, POS_ROLES);

    const allBrands = await ctx.db.query("brands").collect();
    const allCategories = await ctx.db.query("categories").collect();
    const allStyles = await ctx.db.query("styles").collect();
    const allVariants = await ctx.db.query("variants").collect();

    // Build sets bottom-up: active variants → styles → categories → brands
    const activeVariantStyleIds = new Set(
      allVariants.filter((v) => v.isActive).map((v) => v.styleId as string)
    );
    const activeStyleCategoryIds = new Set(
      allStyles
        .filter((s) => s.isActive && activeVariantStyleIds.has(s._id as string))
        .map((s) => s.categoryId as string)
    );
    const activeCategoryBrandIds = new Set(
      allCategories
        .filter((c) => c.isActive && activeStyleCategoryIds.has(c._id as string))
        .map((c) => c.brandId as string)
    );

    return allBrands
      .filter((b) => b.isActive && activeCategoryBrandIds.has(b._id as string))
      .map((b) => ({ _id: b._id, name: b.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listPOSCategories = query({
  args: {
    brandId: v.optional(v.id("brands")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, POS_ROLES);

    let categories;
    if (args.brandId) {
      categories = await ctx.db
        .query("categories")
        .withIndex("by_brand", (q) => q.eq("brandId", args.brandId!))
        .collect();
    } else {
      categories = await ctx.db.query("categories").collect();
    }
    const activeCategories = categories.filter((c) => c.isActive);

    const allStyles = await ctx.db.query("styles").collect();
    const allVariants = await ctx.db.query("variants").collect();

    const activeVariantStyleIds = new Set(
      allVariants.filter((v) => v.isActive).map((v) => v.styleId as string)
    );
    const stylesByCategoryId: Record<string, boolean> = {};
    for (const style of allStyles) {
      if (style.isActive && activeVariantStyleIds.has(style._id as string)) {
        stylesByCategoryId[style.categoryId] = true;
      }
    }

    return activeCategories
      .filter((c) => stylesByCategoryId[c._id])
      .map((c) => ({ _id: c._id, name: c.name, brandId: c.brandId }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ─── Barcode Lookup ──────────────────────────────────────────────────────────

export const getVariantByBarcode = query({
  args: { barcode: v.string() },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);

    // Enforce POS role at API level (defense-in-depth)
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    // Index lookup — O(1)
    const variant = await ctx.db
      .query("variants")
      .withIndex("by_barcode", (q) => q.eq("barcode", args.barcode))
      .first();

    if (!variant || !variant.isActive) return null;

    // Resolve parent hierarchy — all must be active
    const style = await ctx.db.get(variant.styleId);
    if (!style || !style.isActive) return null;

    const category = await ctx.db.get(style.categoryId);
    if (!category || !category.isActive) return null;

    const brand = await ctx.db.get(category.brandId);
    if (!brand || !brand.isActive) return null;

    // Inventory lookup for branch
    const branchId = scope.branchId;
    let stock = 0;
    if (branchId) {
      const inv = await ctx.db
        .query("inventory")
        .withIndex("by_branch_variant", (q) =>
          q.eq("branchId", branchId).eq("variantId", variant._id)
        )
        .first();
      stock = inv?.quantity ?? 0;
    }

    return {
      variantId: variant._id,
      sku: variant.sku,
      barcode: variant.barcode!,
      size: variant.size,
      color: variant.color,
      priceCentavos: variant.priceCentavos,
      styleName: style.name,
      brandName: brand.name,
      categoryName: category.name,
      stock,
    };
  },
});

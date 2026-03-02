import { query } from "../_generated/server";
import { v } from "convex/values";
import { GARMENT_SIZE_ORDER } from "../_helpers/constants";

// ─── Public Queries (No Auth Required) ──────────────────────────────────────
// These queries are used by the customer-facing website.
// They do NOT require authentication — anyone can browse products.
// They only return active records (never expose inactive/draft products).

export const listActiveBrandsPublic = query({
  args: {},
  handler: async (ctx) => {
    const brands = await ctx.db.query("brands").collect();
    return brands
      .filter((b) => b.isActive)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((b) => ({ _id: b._id, name: b.name, logo: b.logo }));
  },
});

export const getBrandWithCategoriesPublic = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, args) => {
    const brand = await ctx.db.get(args.brandId);
    if (!brand || !brand.isActive) return null;

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_brand", (q) => q.eq("brandId", args.brandId))
      .collect();

    const activeCategories = categories
      .filter((c) => c.isActive)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ _id: c._id, name: c.name }));

    return {
      _id: brand._id,
      name: brand.name,
      logo: brand.logo,
      categories: activeCategories,
    };
  },
});

export const getStylesByCategoryPublic = query({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.categoryId);
    if (!category || !category.isActive) return [];

    const styles = await ctx.db
      .query("styles")
      .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId))
      .collect();

    const activeStyles = styles.filter((s) => s.isActive);

    // Enrich each style with primary image URL, variant count, and branch availability
    const enriched = await Promise.all(
      activeStyles.map(async (style) => {
        // Get primary image
        const images = await ctx.db
          .query("productImages")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .collect();
        const primary = images.find((img) => img.isPrimary);
        const primaryImageUrl = primary
          ? await ctx.storage.getUrl(primary.storageId)
          : null;

        // Get active variants
        const variants = await ctx.db
          .query("variants")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .collect();
        const activeVariants = variants.filter((vr) => vr.isActive);

        // Count distinct retail branches with stock > 0 and collect available sizes
        // Build set of warehouse branch IDs to exclude
        const allBranches = await ctx.db.query("branches").collect();
        const warehouseIds = new Set(
          allBranches.filter((b) => b.type === "warehouse").map((b) => b._id as string)
        );
        const branchSet = new Set<string>();
        const sizeSet = new Set<string>();
        for (const vr of activeVariants) {
          if (vr.size) sizeSet.add(vr.size);
          const inv = await ctx.db
            .query("inventory")
            .withIndex("by_variant", (q) => q.eq("variantId", vr._id))
            .collect();
          for (const row of inv) {
            if (row.quantity > 0 && !warehouseIds.has(row.branchId as string)) {
              branchSet.add(row.branchId as string);
            }
          }
        }

        return {
          _id: style._id,
          name: style.name,
          basePriceCentavos: style.basePriceCentavos,
          primaryImageUrl,
          variantCount: activeVariants.length,
          branchCount: branchSet.size,
          sizes: Array.from(sizeSet),
        };
      })
    );

    return enriched;
  },
});

export const getStyleDetailPublic = query({
  args: { styleId: v.id("styles") },
  handler: async (ctx, args) => {
    const style = await ctx.db.get(args.styleId);
    if (!style || !style.isActive) return null;

    // Get category for brand chain
    const category = await ctx.db.get(style.categoryId);
    const brand = category ? await ctx.db.get(category.brandId) : null;

    // Get all images sorted by sortOrder
    const images = await ctx.db
      .query("productImages")
      .withIndex("by_style", (q) => q.eq("styleId", args.styleId))
      .collect();
    images.sort((a, b) => a.sortOrder - b.sortOrder);
    const imageUrls = await Promise.all(
      images.map(async (img) => ({
        url: await ctx.storage.getUrl(img.storageId),
        isPrimary: img.isPrimary,
      }))
    );

    // Get all active variants
    const variants = await ctx.db
      .query("variants")
      .withIndex("by_style", (q) => q.eq("styleId", args.styleId))
      .collect();
    const activeVariants = variants
      .filter((vr) => vr.isActive)
      .map((vr) => ({
        _id: vr._id,
        size: vr.size,
        color: vr.color,
        priceCentavos: vr.priceCentavos,
        sku: vr.sku,
      }));

    // Branch stock summary per variant
    const variantStock = await Promise.all(
      activeVariants.map(async (vr) => {
        const inv = await ctx.db
          .query("inventory")
          .withIndex("by_variant", (q) => q.eq("variantId", vr._id))
          .collect();
        const branchesInStock = inv.filter((row) => row.quantity > 0).length;
        return { ...vr, branchesInStock };
      })
    );

    return {
      _id: style._id,
      name: style.name,
      description: style.description,
      basePriceCentavos: style.basePriceCentavos,
      brandName: brand?.name ?? "Unknown",
      categoryName: category?.name ?? "Unknown",
      images: imageUrls,
      variants: variantStock,
    };
  },
});

export const getAllBranchStockForStylePublic = query({
  args: { styleId: v.id("styles") },
  handler: async (ctx, args) => {
    // NO auth — public query
    const style = await ctx.db.get(args.styleId);
    if (!style || !style.isActive) return [];

    const variants = await ctx.db
      .query("variants")
      .withIndex("by_style", (q) => q.eq("styleId", args.styleId))
      .collect();
    const activeVariants = variants.filter((vr) => vr.isActive);
    if (activeVariants.length === 0) return [];

    // Get all active retail branches (exclude warehouse)
    const branches = await ctx.db.query("branches").collect();
    const activeBranches = branches.filter((b) => b.isActive && b.type !== "warehouse");

    // Build per-branch stock data
    const result = await Promise.all(
      activeBranches.map(async (branch) => {
        const branchVariants = await Promise.all(
          activeVariants.map(async (vr) => {
            const inv = await ctx.db
              .query("inventory")
              .withIndex("by_branch_variant", (q) =>
                q.eq("branchId", branch._id).eq("variantId", vr._id)
              )
              .unique();
            return {
              variantId: vr._id,
              size: vr.size,
              color: vr.color,
              quantity: inv?.quantity ?? 0,
              lowStockThreshold: inv?.lowStockThreshold ?? 5,
            };
          })
        );
        // Sort by garment size order
        branchVariants.sort((a, b) => {
          const orderA = GARMENT_SIZE_ORDER[a.size.toUpperCase()] ?? 99;
          const orderB = GARMENT_SIZE_ORDER[b.size.toUpperCase()] ?? 99;
          return orderA !== orderB ? orderA - orderB : a.size.localeCompare(b.size);
        });
        return {
          branchId: branch._id,
          branchName: branch.name,
          variants: branchVariants,
        };
      })
    );

    return result.sort((a, b) => a.branchName.localeCompare(b.branchName));
  },
});

export const listActiveBranchesPublic = query({
  args: {},
  handler: async (ctx) => {
    const branches = await ctx.db.query("branches").collect();
    return branches
      .filter((b) => b.isActive && b.type !== "warehouse")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((b) => ({
        _id: b._id,
        name: b.name,
        address: b.address,
        phone: b.phone,
        latitude: b.latitude,
        longitude: b.longitude,
        businessHours: b.configuration?.businessHours,
        timezone: b.configuration?.timezone,
      }));
  },
});

export const getImageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

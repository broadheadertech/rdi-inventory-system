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

    const brandLogoUrl = brand.storageId
      ? await ctx.storage.getUrl(brand.storageId)
      : null;

    const bannerUrl = brand.bannerStorageId
      ? await ctx.storage.getUrl(brand.bannerStorageId)
      : null;

    return {
      _id: brand._id,
      name: brand.name,
      logo: brand.logo,
      brandLogoUrl,
      bannerUrl,
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
        let expressAvailable = false;
        for (const vr of activeVariants) {
          if (vr.size) sizeSet.add(vr.size);
          const inv = await ctx.db
            .query("inventory")
            .withIndex("by_variant", (q) => q.eq("variantId", vr._id))
            .collect();
          for (const row of inv) {
            if (row.quantity > 0) {
              if (warehouseIds.has(row.branchId as string)) {
                expressAvailable = true;
              } else {
                branchSet.add(row.branchId as string);
              }
            }
          }
        }

        // Resolve brand logo for fallback
        const cat = await ctx.db.get(style.categoryId);
        const brandDoc = cat ? await ctx.db.get(cat.brandId) : null;
        const brandLogoUrl = brandDoc?.storageId
          ? await ctx.storage.getUrl(brandDoc.storageId)
          : null;

        return {
          _id: style._id,
          name: style.name,
          basePriceCentavos: style.basePriceCentavos,
          createdAt: style.createdAt,
          primaryImageUrl,
          brandLogoUrl,
          variantCount: activeVariants.length,
          branchCount: branchSet.size,
          sizes: Array.from(sizeSet),
          expressAvailable,
        };
      })
    );

    return enriched;
  },
});

export const getStylesByTagPublic = query({
  args: { tag: v.string() },
  handler: async (ctx, args) => {
    // Get all active categories with this tag
    const allCategories = await ctx.db.query("categories").collect();
    const tagCategories = allCategories.filter(
      (c) => c.isActive && c.tag === args.tag
    );
    if (tagCategories.length === 0) return null;

    // Pre-fetch warehouse IDs once
    const allBranches = await ctx.db.query("branches").collect();
    const warehouseIds = new Set(
      allBranches.filter((b) => b.type === "warehouse").map((b) => b._id as string)
    );

    // Pre-fetch brands for brand name resolution
    const allBrands = await ctx.db.query("brands").collect();
    const brandMap = new Map(allBrands.map((b) => [String(b._id), b]));

    // Gather all styles across all matching categories
    const allStyles = await Promise.all(
      tagCategories.map(async (cat) => {
        const brand = brandMap.get(String(cat.brandId));
        if (!brand || !brand.isActive) return [];
        const styles = await ctx.db
          .query("styles")
          .withIndex("by_category", (q) => q.eq("categoryId", cat._id))
          .collect();
        return styles
          .filter((s) => s.isActive)
          .map((s) => ({ ...s, categoryName: cat.name, brandName: brand.name }));
      })
    );
    const flatStyles = allStyles.flat();

    // Enrich each style
    const enriched = await Promise.all(
      flatStyles.map(async (style) => {
        const images = await ctx.db
          .query("productImages")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .collect();
        const primary = images.find((img) => img.isPrimary);
        const primaryImageUrl = primary
          ? await ctx.storage.getUrl(primary.storageId)
          : null;

        const variants = await ctx.db
          .query("variants")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .collect();
        const activeVariants = variants.filter((vr) => vr.isActive);

        const branchSet = new Set<string>();
        const sizeSet = new Set<string>();
        const colorSet = new Set<string>();
        const genderSet = new Set<string>();
        for (const vr of activeVariants) {
          if (vr.size) sizeSet.add(vr.size);
          if (vr.color) colorSet.add(vr.color);
          if (vr.gender) genderSet.add(vr.gender);
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

        // Brand logo
        const cat = await ctx.db.get(style.categoryId);
        const brandDoc = cat ? brandMap.get(String(cat.brandId)) : null;
        const brandLogoUrl = brandDoc?.storageId
          ? await ctx.storage.getUrl(brandDoc.storageId)
          : null;

        return {
          _id: style._id,
          name: style.name,
          categoryName: style.categoryName,
          brandName: style.brandName,
          basePriceCentavos: style.basePriceCentavos,
          createdAt: style.createdAt,
          primaryImageUrl,
          brandLogoUrl,
          variantCount: activeVariants.length,
          branchCount: branchSet.size,
          sizes: Array.from(sizeSet),
          colors: Array.from(colorSet),
          genders: Array.from(genderSet),
        };
      })
    );

    // Build available filter options
    const categoryNames = [...new Set(tagCategories.map((c) => c.name))].sort();
    const allColors = [...new Set(enriched.flatMap((s) => s.colors))].sort();
    const allSizes = [...new Set(enriched.flatMap((s) => s.sizes))];
    const allGenders = [...new Set(enriched.flatMap((s) => s.genders))];
    const brandNames = [...new Set(enriched.map((s) => s.brandName))].sort();

    return {
      tag: args.tag,
      styles: enriched,
      filters: {
        categories: categoryNames,
        brands: brandNames,
        colors: allColors,
        sizes: allSizes,
        genders: allGenders,
      },
    };
  },
});

export const getAllStylesForBrandPublic = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, args) => {
    const brand = await ctx.db.get(args.brandId);
    if (!brand || !brand.isActive) return null;

    // Get all active categories for this brand
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_brand", (q) => q.eq("brandId", args.brandId))
      .collect();
    const activeCategories = categories.filter((c) => c.isActive);

    // Brand logo
    const brandLogoUrl = brand.storageId
      ? await ctx.storage.getUrl(brand.storageId)
      : null;
    const bannerUrl = brand.bannerStorageId
      ? await ctx.storage.getUrl(brand.bannerStorageId)
      : null;

    // Pre-fetch warehouse IDs once
    const allBranches = await ctx.db.query("branches").collect();
    const warehouseIds = new Set(
      allBranches.filter((b) => b.type === "warehouse").map((b) => b._id as string)
    );

    // Gather all styles across all categories
    const allStyles = await Promise.all(
      activeCategories.map(async (cat) => {
        const styles = await ctx.db
          .query("styles")
          .withIndex("by_category", (q) => q.eq("categoryId", cat._id))
          .collect();
        return styles.filter((s) => s.isActive).map((s) => ({ ...s, categoryName: cat.name }));
      })
    );
    const flatStyles = allStyles.flat();

    // Enrich each style
    const enriched = await Promise.all(
      flatStyles.map(async (style) => {
        const images = await ctx.db
          .query("productImages")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .collect();
        const primary = images.find((img) => img.isPrimary);
        const primaryImageUrl = primary
          ? await ctx.storage.getUrl(primary.storageId)
          : null;

        const variants = await ctx.db
          .query("variants")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .collect();
        const activeVariants = variants.filter((vr) => vr.isActive);

        const branchSet = new Set<string>();
        const sizeSet = new Set<string>();
        const colorSet = new Set<string>();
        const genderSet = new Set<string>();
        for (const vr of activeVariants) {
          if (vr.size) sizeSet.add(vr.size);
          if (vr.color) colorSet.add(vr.color);
          if (vr.gender) genderSet.add(vr.gender);
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
          categoryName: style.categoryName,
          basePriceCentavos: style.basePriceCentavos,
          createdAt: style.createdAt,
          primaryImageUrl,
          variantCount: activeVariants.length,
          branchCount: branchSet.size,
          sizes: Array.from(sizeSet),
          colors: Array.from(colorSet),
          genders: Array.from(genderSet),
        };
      })
    );

    // Build available filter options
    const allCategoryNames = [...new Set(activeCategories.map((c) => c.name))].sort();
    const allColors = [...new Set(enriched.flatMap((s) => s.colors))].sort();
    const allSizes = [...new Set(enriched.flatMap((s) => s.sizes))];
    const allGenders = [...new Set(enriched.flatMap((s) => s.genders))];

    return {
      brand: {
        _id: brand._id,
        name: brand.name,
        brandLogoUrl,
        bannerUrl,
      },
      styles: enriched,
      filters: {
        categories: allCategoryNames,
        colors: allColors,
        sizes: allSizes,
        genders: allGenders,
      },
    };
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
        storageId: vr.storageId ?? null,
      }));

    // Branch stock summary per variant (with resolved image URLs)
    const variantStock = await Promise.all(
      activeVariants.map(async (vr) => {
        const inv = await ctx.db
          .query("inventory")
          .withIndex("by_variant", (q) => q.eq("variantId", vr._id))
          .collect();
        const branchesInStock = inv.filter((row) => row.quantity > 0).length;
        const totalStock = inv.reduce((sum, row) => sum + row.quantity, 0);
        const imageUrl = vr.storageId
          ? await ctx.storage.getUrl(vr.storageId)
          : null;
        return { ...vr, branchesInStock, totalStock, imageUrl };
      })
    );

    const brandLogoUrl = brand?.storageId
      ? await ctx.storage.getUrl(brand.storageId)
      : null;

    return {
      _id: style._id,
      name: style.name,
      description: style.description,
      basePriceCentavos: style.basePriceCentavos,
      brandName: brand?.name ?? "Unknown",
      categoryName: category?.name ?? "Unknown",
      images: imageUrls,
      brandLogoUrl,
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

export const searchStylesPublic = query({
  args: { searchTerm: v.string() },
  handler: async (ctx, args) => {
    const term = args.searchTerm.toLowerCase().trim();
    if (!term || term.length < 2) return [];

    const styles = await ctx.db.query("styles").collect();
    const activeStyles = styles.filter((s) => s.isActive);

    // Search by style name, then enrich matching results
    const matches = activeStyles.filter((s) =>
      s.name.toLowerCase().includes(term)
    );

    // Also search by brand/category name
    const categories = await ctx.db.query("categories").collect();
    const brands = await ctx.db.query("brands").collect();
    const brandMap = new Map(brands.map((b) => [String(b._id), b]));
    const catMap = new Map(categories.map((c) => [String(c._id), c]));

    const catMatches = categories.filter(
      (c) => c.isActive && c.name.toLowerCase().includes(term)
    );
    const brandMatches = brands.filter(
      (b) => b.isActive && b.name.toLowerCase().includes(term)
    );

    const matchedIds = new Set(matches.map((s) => String(s._id)));

    // Add styles from matching categories
    for (const cat of catMatches) {
      for (const s of activeStyles) {
        if (s.categoryId === cat._id && !matchedIds.has(String(s._id))) {
          matches.push(s);
          matchedIds.add(String(s._id));
        }
      }
    }

    // Add styles from matching brands
    for (const brand of brandMatches) {
      const brandCats = categories.filter((c) => c.brandId === brand._id);
      for (const cat of brandCats) {
        for (const s of activeStyles) {
          if (s.categoryId === cat._id && !matchedIds.has(String(s._id))) {
            matches.push(s);
            matchedIds.add(String(s._id));
          }
        }
      }
    }

    // Limit to 50 results and enrich
    const limited = matches.slice(0, 50);

    const enriched = await Promise.all(
      limited.map(async (style) => {
        const category = catMap.get(String(style.categoryId));
        const brand = category ? brandMap.get(String(category.brandId)) : null;

        const images = await ctx.db
          .query("productImages")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .collect();
        const primary = images.find((img) => img.isPrimary);
        const primaryImageUrl = primary
          ? await ctx.storage.getUrl(primary.storageId)
          : null;

        const variants = await ctx.db
          .query("variants")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .collect();
        const activeVariants = variants.filter((vr) => vr.isActive);

        const brandLogoUrl = brand?.storageId
          ? await ctx.storage.getUrl(brand.storageId)
          : null;

        return {
          _id: style._id,
          name: style.name,
          basePriceCentavos: style.basePriceCentavos,
          createdAt: style.createdAt,
          brandName: brand?.name ?? "",
          categoryName: category?.name ?? "",
          primaryImageUrl,
          brandLogoUrl,
          variantCount: activeVariants.length,
          branchCount: 0, // skip heavy stock calc for search results
          sizes: Array.from(new Set(activeVariants.map((v) => v.size))),
        };
      })
    );

    return enriched;
  },
});

export const getStylesByTagsPublic = query({
  args: { tags: v.array(v.string()) },
  handler: async (ctx, args) => {
    if (args.tags.length === 0) return { styles: [], filters: { brands: [], colors: [], sizes: [], genders: [] } };

    const tagSet = new Set(args.tags.map((t) => t.toLowerCase()));

    // Find categories whose tag matches ANY of the supplied tags,
    // OR brands whose tags array intersects.
    const allCategories = await ctx.db.query("categories").collect();
    const allBrands = await ctx.db.query("brands").collect();
    const brandMap = new Map(allBrands.map((b) => [String(b._id), b]));

    // Categories matching by their own tag
    const catTagMatches = allCategories.filter(
      (c) => c.isActive && c.tag && tagSet.has(c.tag.toLowerCase())
    );

    // Brands matching by their tags array
    const brandTagMatches = allBrands.filter(
      (b) => b.isActive && b.tags && b.tags.some((t) => tagSet.has(t.toLowerCase()))
    );
    const brandTagIds = new Set(brandTagMatches.map((b) => String(b._id)));

    // Categories belonging to matching brands (that weren't already matched)
    const catBrandMatches = allCategories.filter(
      (c) => c.isActive && brandTagIds.has(String(c.brandId)) && !catTagMatches.some((m) => m._id === c._id)
    );

    const matchedCategories = [...catTagMatches, ...catBrandMatches];
    if (matchedCategories.length === 0) return { styles: [], filters: { brands: [], colors: [], sizes: [], genders: [] } };

    // Pre-fetch warehouse IDs once
    const allBranches = await ctx.db.query("branches").collect();
    const warehouseIds = new Set(
      allBranches.filter((b) => b.type === "warehouse").map((b) => b._id as string)
    );

    // Gather all styles across matching categories
    const allStyles = await Promise.all(
      matchedCategories.map(async (cat) => {
        const brand = brandMap.get(String(cat.brandId));
        if (!brand || !brand.isActive) return [];
        const styles = await ctx.db
          .query("styles")
          .withIndex("by_category", (q) => q.eq("categoryId", cat._id))
          .collect();
        return styles
          .filter((s) => s.isActive)
          .map((s) => ({ ...s, categoryName: cat.name, brandName: brand.name }));
      })
    );
    const flatStyles = allStyles.flat();

    // Deduplicate by style ID (a style could appear via both category-tag and brand-tag)
    const seenIds = new Set<string>();
    const uniqueStyles = flatStyles.filter((s) => {
      const id = String(s._id);
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });

    // Enrich each style
    const enriched = await Promise.all(
      uniqueStyles.map(async (style) => {
        const images = await ctx.db
          .query("productImages")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .collect();
        const primary = images.find((img) => img.isPrimary);
        const primaryImageUrl = primary
          ? await ctx.storage.getUrl(primary.storageId)
          : null;

        const variants = await ctx.db
          .query("variants")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .collect();
        const activeVariants = variants.filter((vr) => vr.isActive);

        const branchSet = new Set<string>();
        const sizeSet = new Set<string>();
        const colorSet = new Set<string>();
        const genderSet = new Set<string>();
        for (const vr of activeVariants) {
          if (vr.size) sizeSet.add(vr.size);
          if (vr.color) colorSet.add(vr.color);
          if (vr.gender) genderSet.add(vr.gender);
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

        const cat = await ctx.db.get(style.categoryId);
        const brandDoc = cat ? brandMap.get(String(cat.brandId)) : null;
        const brandLogoUrl = brandDoc?.storageId
          ? await ctx.storage.getUrl(brandDoc.storageId)
          : null;

        return {
          _id: style._id,
          name: style.name,
          categoryName: style.categoryName,
          brandName: style.brandName,
          basePriceCentavos: style.basePriceCentavos,
          createdAt: style.createdAt,
          primaryImageUrl,
          brandLogoUrl,
          variantCount: activeVariants.length,
          branchCount: branchSet.size,
          sizes: Array.from(sizeSet),
          colors: Array.from(colorSet),
          genders: Array.from(genderSet),
        };
      })
    );

    // Build available filter options
    const allColors = [...new Set(enriched.flatMap((s) => s.colors))].sort();
    const allSizes = [...new Set(enriched.flatMap((s) => s.sizes))];
    const allGenders = [...new Set(enriched.flatMap((s) => s.genders))];
    const brandNames = [...new Set(enriched.map((s) => s.brandName))].sort();

    return {
      styles: enriched,
      filters: {
        brands: brandNames,
        colors: allColors,
        sizes: allSizes,
        genders: allGenders,
      },
    };
  },
});

export const getImageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

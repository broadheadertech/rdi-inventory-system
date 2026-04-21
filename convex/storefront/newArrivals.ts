import { query } from "../_generated/server";

// ─── New Arrivals Query ──────────────────────────────────────────────────────
// Returns active styles created within the last 30 days.
// Public — no auth required.

export const getNewArrivals = query({
  args: {},
  handler: async (ctx) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // ── Load active brands & categories ──
    const allBrands = await ctx.db.query("brands").collect();
    const activeBrandIds = new Set(
      allBrands.filter((b) => b.isActive).map((b) => String(b._id))
    );
    const brandMap = new Map(allBrands.map((b) => [String(b._id), b]));

    const allCategories = await ctx.db.query("categories").collect();
    const activeCategoryIds = new Set(
      allCategories
        .filter((c) => c.isActive && activeBrandIds.has(String(c.brandId)))
        .map((c) => String(c._id))
    );
    const categoryMap = new Map(
      allCategories.map((c) => [String(c._id), c])
    );

    // ── Get styles created within last 30 days ──
    const allStyles = await ctx.db.query("styles").collect();
    const newStyles = allStyles
      .filter(
        (s) =>
          s.isActive &&
          s.createdAt >= thirtyDaysAgo &&
          s.categoryId !== undefined && activeCategoryIds.has(String(s.categoryId))
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 24);

    if (newStyles.length === 0) return [];

    // ── Pre-fetch all variants for gender info ──
    const allVariants = await ctx.db.query("variants").collect();
    const activeVariants = allVariants.filter((v) => v.isActive);

    // Build styleId → variants lookup
    const styleVariantsMap = new Map<string, typeof activeVariants>();
    for (const v of activeVariants) {
      const sid = String(v.styleId);
      if (!styleVariantsMap.has(sid)) styleVariantsMap.set(sid, []);
      styleVariantsMap.get(sid)!.push(v);
    }

    // Pre-fetch warehouse IDs to exclude from branch counts
    const allBranches = await ctx.db.query("branches").collect();
    const warehouseIds = new Set(
      allBranches
        .filter((b) => b.channel === "warehouse")
        .map((b) => b._id as string)
    );

    // ── Enrich each style ──
    return Promise.all(
      newStyles.map(async (style) => {
        const category = style.categoryId ? categoryMap.get(String(style.categoryId)) : null;
        const brand = style.brandId
          ? brandMap.get(String(style.brandId))
          : category ? brandMap.get(String(category.brandId)) : null;

        // Primary image
        const images = await ctx.db
          .query("productImages")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .collect();
        const primary = images.find((img) => img.isPrimary);
        const primaryImageUrl = primary
          ? await ctx.storage.getUrl(primary.storageId)
          : null;

        // Brand logo
        const brandLogoUrl = brand?.storageId
          ? await ctx.storage.getUrl(brand.storageId)
          : null;

        // Variant info
        const styleVars = styleVariantsMap.get(String(style._id)) ?? [];
        const genderSet = new Set<string>();
        const tagSet = new Set<string>();
        const branchSet = new Set<string>();

        for (const v of styleVars) {
          if (v.gender) genderSet.add(v.gender);
          const inv = await ctx.db
            .query("inventory")
            .withIndex("by_variant", (q) => q.eq("variantId", v._id))
            .collect();
          for (const row of inv) {
            if (
              row.quantity > 0 &&
              !warehouseIds.has(row.branchId as string)
            ) {
              branchSet.add(row.branchId as string);
            }
          }
        }

        // Tags come from brand
        if (brand?.tags) {
          for (const t of brand.tags) tagSet.add(t);
        }

        return {
          styleId: style._id,
          name: style.name,
          brandName: brand?.name ?? "",
          categoryName: category?.name ?? "",
          primaryImageUrl,
          brandLogoUrl,
          basePriceCentavos: style.basePriceCentavos,
          createdAt: style.createdAt,
          genders: Array.from(genderSet),
          tags: Array.from(tagSet),
          variantCount: styleVars.length,
          branchCount: branchSet.size,
        };
      })
    );
  },
});

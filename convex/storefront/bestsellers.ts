import { query } from "../_generated/server";

// ─── Bestsellers Query ──────────────────────────────────────────────────────
// Aggregates POS transaction data from the last 30 days, groups by style,
// and returns the top 24 products sorted by total units sold.
// Public — no auth required.

export const getBestsellers = query({
  args: {},
  handler: async (ctx) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // ── Fetch recent transactions ──
    const recentTransactions = await ctx.db.query("transactions").collect();
    const recentTxIds = new Set(
      recentTransactions
        .filter((tx) => tx.createdAt >= thirtyDaysAgo)
        .map((tx) => String(tx._id))
    );

    // ── Fetch transaction items and group by styleId ──
    const allItems = await ctx.db.query("transactionItems").collect();
    const allVariants = await ctx.db.query("variants").collect();
    const variantMap = new Map(allVariants.map((v) => [String(v._id), v]));

    // styleId → total quantity sold
    const styleSales = new Map<string, number>();
    for (const item of allItems) {
      if (!recentTxIds.has(String(item.transactionId))) continue;
      const variant = variantMap.get(String(item.variantId));
      if (!variant) continue;
      const styleId = String(variant.styleId);
      styleSales.set(styleId, (styleSales.get(styleId) ?? 0) + item.quantity);
    }

    // ── Load active brands, categories, styles ──
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
    const categoryMap = new Map(allCategories.map((c) => [String(c._id), c]));

    const allStyles = await ctx.db.query("styles").collect();
    const activeStyleMap = new Map(
      allStyles
        .filter(
          (s) => s.isActive && s.categoryId !== undefined && activeCategoryIds.has(String(s.categoryId))
        )
        .map((s) => [String(s._id), s])
    );

    // ── Sort by sales descending, keep only active styles ──
    const sorted = [...styleSales.entries()]
      .filter(([styleId]) => activeStyleMap.has(styleId))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24);

    if (sorted.length === 0) return [];

    // ── Build variant lookups ──
    const activeVariants = allVariants.filter(
      (v) => v.isActive && activeStyleMap.has(String(v.styleId))
    );

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

    // ── Enrich each bestselling style ──
    return Promise.all(
      sorted.map(async ([styleId, soldCount]) => {
        const style = activeStyleMap.get(styleId)!;
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

        // Variant info — genders, sizes, branch availability
        const styleVars = styleVariantsMap.get(styleId) ?? [];
        const genderSet = new Set<string>();
        const sizeSet = new Set<string>();
        const branchSet = new Set<string>();

        for (const v of styleVars) {
          if (v.gender) genderSet.add(v.gender);
          if (v.size) sizeSet.add(v.size);
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

        return {
          styleId: style._id,
          name: style.name,
          brandName: brand?.name ?? "",
          primaryImageUrl,
          brandLogoUrl,
          basePriceCentavos: style.basePriceCentavos,
          soldCount,
          variantCount: styleVars.length,
          genders: Array.from(genderSet),
          sizes: Array.from(sizeSet),
          branchCount: branchSet.size,
          createdAt: style.createdAt,
        };
      })
    );
  },
});

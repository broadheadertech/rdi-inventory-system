import { query } from "../_generated/server";
import { v } from "convex/values";

// ─── Homepage Data Query ─────────────────────────────────────────────────────
// Single query that returns all data needed for the Zalora-style homepage.
// Public — no auth required.

export const getHomepageData = query({
  args: {},
  handler: async (ctx) => {
    // ── Brands ──
    const allBrands = await ctx.db.query("brands").collect();
    const activeBrands = allBrands
      .filter((b) => b.isActive)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((b) => ({ _id: b._id, name: b.name, logo: b.logo, storageId: b.storageId, bannerStorageId: b.bannerStorageId, tags: b.tags ?? [] }));

    // ── Categories ──
    const allCategories = await ctx.db.query("categories").collect();
    const brandMap = new Map(allBrands.map((b) => [String(b._id), b]));
    const activeBrandIds = new Set(activeBrands.map((b) => String(b._id)));
    // Only include categories whose parent brand is active
    const activeCategories = allCategories.filter(
      (c) => c.isActive && activeBrandIds.has(String(c.brandId))
    );
    const activeCategoryIds = new Set(activeCategories.map((c) => String(c._id)));

    // ── Styles + Variants (for gender, counts, prices) ──
    const allStyles = await ctx.db.query("styles").collect();
    // Only include styles whose parent category (and thus brand) is active
    const activeStyles = allStyles.filter(
      (s) => s.isActive && s.categoryId !== undefined && activeCategoryIds.has(String(s.categoryId))
    );
    const activeStyleIds = new Set(activeStyles.map((s) => String(s._id)));
    const allVariants = await ctx.db.query("variants").collect();
    const activeVariants = allVariants.filter(
      (v) => v.isActive && activeStyleIds.has(String(v.styleId))
    );

    // Build style → categoryId lookup
    const styleCatMap = new Map(
      activeStyles.map((s) => [String(s._id), String(s.categoryId ?? "")])
    );

    // Build categoryId → genders set
    const catGenders = new Map<string, Set<string>>();
    // Build styleId → genders set
    const styleGenders = new Map<string, Set<string>>();

    for (const v of activeVariants) {
      const gender = v.gender ?? "unisex";
      const styleId = String(v.styleId);
      const catId = styleCatMap.get(styleId);

      // Style genders
      if (!styleGenders.has(styleId)) styleGenders.set(styleId, new Set());
      styleGenders.get(styleId)!.add(gender);

      // Category genders
      if (catId) {
        if (!catGenders.has(catId)) catGenders.set(catId, new Set());
        catGenders.get(catId)!.add(gender);
      }
    }

    // Build categoryId → brandId lookup
    const catBrandMap = new Map(
      activeCategories.map((c) => [String(c._id), String(c.brandId)])
    );

    // Build brandId → genders set
    const brandGenders = new Map<string, Set<string>>();
    for (const [catId, genders] of catGenders) {
      const brandId = catBrandMap.get(catId);
      if (brandId) {
        if (!brandGenders.has(brandId)) brandGenders.set(brandId, new Set());
        for (const g of genders) brandGenders.get(brandId)!.add(g);
      }
    }

    // Enrich brands with genders (tags already included from activeBrands)
    const brandsWithGenders = await Promise.all(
      activeBrands.map(async (b) => ({
        ...b,
        genders: Array.from(brandGenders.get(String(b._id)) ?? []),
        imageUrl: b.storageId ? await ctx.storage.getUrl(b.storageId) : null,
        bannerUrl: b.bannerStorageId ? await ctx.storage.getUrl(b.bannerStorageId) : null,
      }))
    );

    // ── Deduplicate categories by name ──
    const catNameMap = new Map<
      string,
      {
        name: string;
        tag: string | undefined;
        categoryIds: string[];
        brandIds: string[];
        genders: Set<string>;
      }
    >();
    for (const cat of activeCategories) {
      const existing = catNameMap.get(cat.name);
      const catId = String(cat._id);
      const gendersForCat = catGenders.get(catId) ?? new Set<string>();

      if (existing) {
        existing.categoryIds.push(catId);
        if (!existing.brandIds.includes(String(cat.brandId))) {
          existing.brandIds.push(String(cat.brandId));
        }
        for (const g of gendersForCat) existing.genders.add(g);
        // Keep first tag found
        if (!existing.tag && cat.tag) existing.tag = cat.tag;
      } else {
        catNameMap.set(cat.name, {
          name: cat.name,
          tag: cat.tag,
          categoryIds: [catId],
          brandIds: [String(cat.brandId)],
          genders: new Set(gendersForCat),
        });
      }
    }
    const uniqueCategories = Array.from(catNameMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    // Category style counts (total + per-gender)
    const catStyleCount = new Map<string, number>();
    // catId → gender → count of styles that have at least one variant of that gender
    const catGenderStyleCount = new Map<string, Map<string, number>>();
    for (const style of activeStyles) {
      const key = String(style.categoryId ?? "");
      catStyleCount.set(key, (catStyleCount.get(key) ?? 0) + 1);

      const genders = styleGenders.get(String(style._id));
      if (genders) {
        if (!catGenderStyleCount.has(key)) catGenderStyleCount.set(key, new Map());
        const gMap = catGenderStyleCount.get(key)!;
        for (const g of genders) {
          gMap.set(g, (gMap.get(g) ?? 0) + 1);
        }
      }
    }

    const categoriesWithCount = await Promise.all(
      uniqueCategories.map(async (cat) => {
        let count = 0;
        // Merge gender counts across all category IDs sharing this name
        const mergedGenderCounts = new Map<string, number>();
        for (const catId of cat.categoryIds) {
          count += catStyleCount.get(catId) ?? 0;
          const gMap = catGenderStyleCount.get(catId);
          if (gMap) {
            for (const [g, n] of gMap) {
              mergedGenderCounts.set(g, (mergedGenderCounts.get(g) ?? 0) + n);
            }
          }
        }
        // Pick the first category with an image for the group
        let imageUrl: string | null = null;
        for (const catId of cat.categoryIds) {
          const catDoc = activeCategories.find((c) => String(c._id) === catId);
          if (catDoc?.storageId) {
            imageUrl = await ctx.storage.getUrl(catDoc.storageId);
            if (imageUrl) break;
          }
        }
        return {
          name: cat.name,
          tag: cat.tag,
          count,
          genderCounts: Object.fromEntries(mergedGenderCounts),
          brandIds: cat.brandIds,
          genders: Array.from(cat.genders),
          imageUrl,
        };
      })
    );

    // ── Collect all unique tags from brands ──
    const availableTags = [...new Set(activeBrands.flatMap(b => b.tags ?? []))].sort();

    // ── Featured Products (newest 12 styles) ──
    const newestStyles = [...activeStyles]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 12);

    const featuredProducts = await Promise.all(
      newestStyles.map(async (style) => {
        const category = allCategories.find(
          (c) => String(c._id) === String(style.categoryId ?? "")
        );
        const brand = style.brandId
          ? brandMap.get(String(style.brandId))
          : category ? brandMap.get(String(category.brandId)) : null;

        const images = await ctx.db
          .query("productImages")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .collect();
        const primary = images.find((img) => img.isPrimary);
        const primaryImageUrl = primary
          ? await ctx.storage.getUrl(primary.storageId)
          : null;

        const styleVars = activeVariants.filter(
          (v) => String(v.styleId) === String(style._id)
        );
        const minPrice =
          styleVars.length > 0
            ? Math.min(...styleVars.map((v) => v.priceCentavos))
            : style.basePriceCentavos;

        const genders = Array.from(
          styleGenders.get(String(style._id)) ?? []
        );

        const brandLogoUrl = brand?.storageId
          ? await ctx.storage.getUrl(brand.storageId)
          : null;

        return {
          _id: style._id,
          name: style.name,
          basePriceCentavos: style.basePriceCentavos,
          minPriceCentavos: minPrice,
          brandName: brand?.name ?? "",
          categoryName: category?.name ?? "",
          primaryImageUrl,
          brandLogoUrl,
          variantCount: styleVars.length,
          genders,
          tags: brand?.tags ?? [],
        };
      })
    );

    // ── Active Promotions ──
    const now = Date.now();
    const allPromos = await ctx.db.query("promotions").collect();
    const activePromos = allPromos
      .filter(
        (p) =>
          p.isActive &&
          p.startDate <= now &&
          (!p.endDate || p.endDate >= now)
      )
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 6)
      .map((p) => ({
        _id: p._id,
        name: p.name,
        description: p.description,
        promoType: p.promoType,
        percentageValue: p.percentageValue,
        fixedAmountCentavos: p.fixedAmountCentavos,
      }));

    // ── Banners ──
    const allBanners = await ctx.db.query("banners").collect();
    const activeBanners = allBanners.filter(
      (b) =>
        b.isActive &&
        (!b.startDate || b.startDate <= now) &&
        (!b.endDate || b.endDate >= now)
    );

    const heroBanners = await Promise.all(
      activeBanners
        .filter((b) => b.placement === "hero")
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(async (b) => ({
          _id: b._id,
          title: b.title,
          subtitle: b.subtitle,
          imageUrl: await ctx.storage.getUrl(b.imageStorageId),
          linkUrl: b.linkUrl,
        }))
    );

    const promoBanners = await Promise.all(
      activeBanners
        .filter((b) => b.placement === "promo" || b.placement === "flash_sale")
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(async (b) => ({
          _id: b._id,
          title: b.title,
          subtitle: b.subtitle,
          imageUrl: await ctx.storage.getUrl(b.imageStorageId),
          linkUrl: b.linkUrl,
          placement: b.placement,
          endDate: b.endDate,
        }))
    );

    return {
      brands: brandsWithGenders,
      categories: categoriesWithCount,
      availableTags,
      featuredProducts,
      promotions: activePromos,
      heroBanners,
      promoBanners,
    };
  },
});

// ─── Trending Products Query ──────────────────────────────────────────────────
// Returns bestselling products based on POS transaction data from the last 30 days.
// Public — no auth required.

export const getTrendingProducts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 12;
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // ── Fetch recent transactions ──
    const recentTransactions = await ctx.db
      .query("transactions")
      .collect();
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
        .filter((s) => s.isActive && s.categoryId !== undefined && activeCategoryIds.has(String(s.categoryId)))
        .map((s) => [String(s._id), s])
    );

    // ── Sort by sales descending, keep only active styles ──
    const sorted = [...styleSales.entries()]
      .filter(([styleId]) => activeStyleMap.has(styleId))
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    if (sorted.length === 0) return [];

    // ── Enrich each trending style ──
    const activeVariants = allVariants.filter(
      (v) => v.isActive && activeStyleMap.has(String(v.styleId))
    );
    // styleId → variant count
    const styleVariantCount = new Map<string, number>();
    for (const v of activeVariants) {
      const sid = String(v.styleId);
      styleVariantCount.set(sid, (styleVariantCount.get(sid) ?? 0) + 1);
    }

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

        return {
          styleId: style._id,
          name: style.name,
          brandName: brand?.name ?? "",
          primaryImageUrl,
          basePriceCentavos: style.basePriceCentavos,
          brandLogoUrl,
          soldCount,
          variantCount: styleVariantCount.get(styleId) ?? 0,
        };
      })
    );
  },
});

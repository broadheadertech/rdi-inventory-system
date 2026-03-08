import { query } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

// ─── "Complete the Look" Cross-Sell Recommendations ─────────────────────────
// Returns complementary products from the SAME brand but DIFFERENT categories.
// Public — no auth required.

export const getCompleteTheLook = query({
  args: { styleId: v.id("styles") },
  handler: async (ctx, args) => {
    // 1. Load the source style
    const style = await ctx.db.get(args.styleId);
    if (!style || !style.isActive) return null;

    // 2. Resolve category → brand
    const category = await ctx.db.get(style.categoryId);
    if (!category || !category.isActive) return null;

    const brand = await ctx.db.get(category.brandId);
    if (!brand || !brand.isActive) return null;

    // 3. Find all active categories for this brand (excluding the current one)
    const brandCategories = await ctx.db
      .query("categories")
      .withIndex("by_brand", (q) => q.eq("brandId", brand._id))
      .collect();

    const otherCategories = brandCategories.filter(
      (c) => c.isActive && String(c._id) !== String(category._id)
    );

    if (otherCategories.length === 0) return null;

    // 4. Gather active styles from those categories
    const candidateStyles = (
      await Promise.all(
        otherCategories.map(async (cat) => {
          const styles = await ctx.db
            .query("styles")
            .withIndex("by_category", (q) => q.eq("categoryId", cat._id))
            .collect();
          return styles
            .filter((s) => s.isActive)
            .map((s) => ({ ...s, categoryName: cat.name }));
        })
      )
    ).flat();

    if (candidateStyles.length === 0) return null;

    // 5. Sort by most recently created, take up to 6
    const top = candidateStyles
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 6);

    // 6. Enrich with primary image
    const enriched = await Promise.all(
      top.map(async (s) => {
        const images = await ctx.db
          .query("productImages")
          .withIndex("by_style", (q) => q.eq("styleId", s._id))
          .collect();
        const primary = images.find((img) => img.isPrimary);
        const primaryImageUrl = primary
          ? await ctx.storage.getUrl(primary.storageId)
          : null;

        return {
          styleId: s._id,
          name: s.name,
          brandName: brand.name,
          categoryName: s.categoryName,
          primaryImageUrl,
          basePriceCentavos: s.basePriceCentavos,
        };
      })
    );

    return {
      brandName: brand.name,
      items: enriched,
    };
  },
});

// ─── "Frequently Bought Together" Recommendations ───────────────────────────
// Analyses POS transaction data to find styles commonly purchased together.
// Returns top 3 co-purchased styles (different from the current one).
// Public — no auth required.

export const getFrequentlyBoughtTogether = query({
  args: { styleId: v.id("styles") },
  handler: async (ctx, args) => {
    // 1. Load the source style
    const style = await ctx.db.get(args.styleId);
    if (!style || !style.isActive) return [];

    // 2. Get all variants of this style
    const variants = await ctx.db
      .query("variants")
      .withIndex("by_style", (q) => q.eq("styleId", args.styleId))
      .collect();

    if (variants.length === 0) return [];

    // 3. For each variant, find transactionItems (use by_variant index)
    //    Collect unique transactionIds where this style was purchased.
    const transactionIds: Id<"transactions">[] = [];
    const seenTxIds = new Set<string>();
    for (const variant of variants) {
      const items = await ctx.db
        .query("transactionItems")
        .withIndex("by_variant", (q) => q.eq("variantId", variant._id))
        .take(100); // cap per variant to stay fast
      for (const item of items) {
        const key = String(item.transactionId);
        if (!seenTxIds.has(key)) {
          seenTxIds.add(key);
          transactionIds.push(item.transactionId);
        }
      }
    }

    if (transactionIds.length === 0) return [];

    // 4. For each transaction, load all items and find co-purchased variantIds
    const variantIdSet = new Set(variants.map((v) => String(v._id)));
    const coStyleCounts = new Map<string, number>(); // styleId -> count

    // Limit to 50 transactions to keep query fast
    const txSlice = transactionIds.slice(0, 50);

    for (const txId of txSlice) {
      const txItems = await ctx.db
        .query("transactionItems")
        .withIndex("by_transaction", (q) => q.eq("transactionId", txId))
        .collect();

      for (const item of txItems) {
        // Skip variants from the same style
        if (variantIdSet.has(String(item.variantId))) continue;
        // Resolve variant -> styleId
        const v = await ctx.db.get(item.variantId);
        if (!v) continue;
        const sid = String(v.styleId);
        coStyleCounts.set(sid, (coStyleCounts.get(sid) ?? 0) + 1);
      }
    }

    if (coStyleCounts.size === 0) return [];

    // 5. Sort by co-occurrence count, take top 3
    const topStyleIds = Array.from(coStyleCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id as unknown as Id<"styles">);

    // 6. Enrich each style with details
    const results = await Promise.all(
      topStyleIds.map(async (sid) => {
        const s = await ctx.db.get(sid);
        if (!s || !s.isActive) return null;

        const cat = await ctx.db.get(s.categoryId);
        const brand = cat ? await ctx.db.get(cat.brandId) : null;

        // Primary image
        const images = await ctx.db
          .query("productImages")
          .withIndex("by_style", (q) => q.eq("styleId", sid))
          .collect();
        const primary = images.find((img) => img.isPrimary);
        const primaryImageUrl = primary
          ? await ctx.storage.getUrl(primary.storageId)
          : null;

        return {
          styleId: s._id,
          name: s.name,
          brandName: brand?.name ?? "Unknown",
          primaryImageUrl,
          basePriceCentavos: s.basePriceCentavos,
        };
      })
    );

    return results.filter(
      (r): r is NonNullable<typeof r> => r !== null
    );
  },
});

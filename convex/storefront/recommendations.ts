import { query } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

// ─── "Complete the Look" Cross-Sell Recommendations ─────────────────────────
// Suggests complementary items that are currently in stock to create a complete
// outfit. Uses smart category matching (e.g. Tops → Pants, Shoes, Accessories)
// with fallback to other popular items from the same brand.
// Public — no auth required.

// Category-name patterns → complementary category keywords (case-insensitive)
const COMPLEMENTARY_MAP: Record<string, string[]> = {
  tops: ["pants", "bottoms", "shoes", "accessories", "belts"],
  shirts: ["pants", "bottoms", "shoes", "accessories", "belts"],
  pants: ["tops", "shirts", "shoes", "belts"],
  bottoms: ["tops", "shirts", "shoes", "belts"],
  shoes: ["socks", "pants", "bottoms"],
  socks: ["shoes"],
};

/** Check whether a category name matches any of the given keywords. */
function categoryMatchesAny(catName: string, keywords: string[]): boolean {
  const lower = catName.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

/** Derive complementary keywords from a category name. */
function getComplementaryKeywords(catName: string): string[] {
  const lower = catName.toLowerCase();
  for (const [key, complements] of Object.entries(COMPLEMENTARY_MAP)) {
    if (lower.includes(key)) return complements;
  }
  return []; // no smart match — will fall back to generic
}

export const getCompleteTheLook = query({
  args: { styleId: v.id("styles") },
  handler: async (ctx, args) => {
    // 1. Load the source style
    const style = await ctx.db.get(args.styleId);
    if (!style || !style.isActive) return [];

    // 2. Resolve category → brand
    const category = style.categoryId ? await ctx.db.get(style.categoryId) : null;
    if (!category?.isActive && !style.brandId) return [];

    const brandId = style.brandId ?? category?.brandId;
    const brand = brandId ? await ctx.db.get(brandId) : null;
    if (!brand || !brand.isActive) return [];

    // 3. Find all active categories for this brand (excluding the current one)
    const brandCategories = await ctx.db
      .query("categories")
      .withIndex("by_brand", (q) => q.eq("brandId", brand._id))
      .collect();

    const otherCategories = brandCategories.filter(
      (c) => c.isActive && (!category || String(c._id) !== String(category._id))
    );

    if (otherCategories.length === 0) return [];

    // 4. Determine complementary keywords and prioritise matching categories
    const keywords = getComplementaryKeywords(category?.name ?? "");

    // Split into "smart" matches and "generic" fallback
    const smartCategories = keywords.length > 0
      ? otherCategories.filter((c) => categoryMatchesAny(c.name, keywords))
      : [];
    const fallbackCategories = smartCategories.length > 0
      ? smartCategories
      : otherCategories; // generic: any other category from same brand

    // 5. Gather active styles from the chosen categories (cap per category)
    const candidateStyles = (
      await Promise.all(
        fallbackCategories.map(async (cat) => {
          const styles = await ctx.db
            .query("styles")
            .withIndex("by_category", (q) => q.eq("categoryId", cat._id))
            .take(20);
          return styles
            .filter((s) => s.isActive)
            .map((s) => ({ ...s, categoryName: cat.name }));
        })
      )
    ).flat();

    if (candidateStyles.length === 0) return [];

    // 6. Filter to styles that have at least one in-stock variant (quantity > 0)
    const inStockStyles = (
      await Promise.all(
        candidateStyles.map(async (s) => {
          const variants = await ctx.db
            .query("variants")
            .withIndex("by_style", (q) => q.eq("styleId", s._id))
            .take(30);
          const activeVariants = variants.filter((v) => v.isActive);
          if (activeVariants.length === 0) return null;

          // Check inventory for at least one variant with quantity > 0
          for (const variant of activeVariants) {
            const inventoryRows = await ctx.db
              .query("inventory")
              .withIndex("by_variant", (q) => q.eq("variantId", variant._id))
              .take(10);
            const totalQty = inventoryRows.reduce((sum, inv) => sum + inv.quantity, 0);
            if (totalQty > 0) return s; // at least one variant in stock
          }
          return null;
        })
      )
    ).filter((s): s is NonNullable<typeof s> => s !== null);

    if (inStockStyles.length === 0) return [];

    // 7. Sort by most recently created, take up to 4
    const top = inStockStyles
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 4);

    // 8. Enrich with primary image + brand name
    const enriched = await Promise.all(
      top.map(async (s) => {
        const images = await ctx.db
          .query("productImages")
          .withIndex("by_style", (q) => q.eq("styleId", s._id))
          .collect();
        const primary = images.find((img) => img.isPrimary);
        const imageUrl = primary
          ? await ctx.storage.getUrl(primary.storageId)
          : null;

        return {
          styleId: s._id,
          styleName: s.name,
          brandName: brand.name,
          categoryName: s.categoryName,
          priceCentavos: s.basePriceCentavos,
          imageUrl,
        };
      })
    );

    return enriched;
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

    // 6. Enrich each style with details + default variant for bundle add-to-cart
    const results = await Promise.all(
      topStyleIds.map(async (sid) => {
        const s = await ctx.db.get(sid);
        if (!s || !s.isActive) return null;

        const cat = s.categoryId ? await ctx.db.get(s.categoryId) : null;
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

        // Find a default variant (first active one) for bundle add-to-cart
        const styleVariants = await ctx.db
          .query("variants")
          .withIndex("by_style", (q) => q.eq("styleId", sid))
          .collect();
        const defaultVariant = styleVariants.find((v) => v.isActive) ?? null;

        return {
          styleId: s._id,
          name: s.name,
          brandName: brand?.name ?? "Unknown",
          primaryImageUrl,
          basePriceCentavos: s.basePriceCentavos,
          defaultVariantId: defaultVariant?._id ?? null,
        };
      })
    );

    return results.filter(
      (r): r is NonNullable<typeof r> => r !== null
    );
  },
});

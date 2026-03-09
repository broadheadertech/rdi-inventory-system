import { query } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

// ─── Trending in Your City ──────────────────────────────────────────────────
// Public query that surfaces the top-selling styles in a given city over the
// last 14 days, based on POS transaction data.

export const getTrendingInCity = query({
  args: {
    city: v.optional(v.string()),
  },
  handler: async (ctx, { city }) => {
    const targetCity = city ?? "Manila";
    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

    // 1. Fetch all branches and filter to ones whose address contains the city
    const allBranches = await ctx.db.query("branches").collect();
    const cityBranches = allBranches.filter(
      (b) =>
        b.isActive &&
        b.address.toLowerCase().includes(targetCity.toLowerCase())
    );

    if (cityBranches.length === 0) {
      return { city: targetCity, items: [] };
    }

    const cityBranchIds = new Set(
      cityBranches.map((b) => b._id.toString())
    );

    // 2. Query recent transactions from those branches
    const recentTransactions: Array<{
      _id: Id<"transactions">;
      branchId: Id<"branches">;
    }> = [];

    for (const branch of cityBranches) {
      const txns = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", branch._id).gte("createdAt", fourteenDaysAgo)
        )
        .collect();
      recentTransactions.push(
        ...txns.map((t) => ({ _id: t._id, branchId: t.branchId }))
      );
    }

    if (recentTransactions.length === 0) {
      return { city: targetCity, items: [] };
    }

    // 3. Fetch transaction items and aggregate by variant
    const variantQtyMap = new Map<string, number>();

    for (const txn of recentTransactions) {
      const items = await ctx.db
        .query("transactionItems")
        .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
        .collect();

      for (const item of items) {
        const vid = item.variantId.toString();
        variantQtyMap.set(vid, (variantQtyMap.get(vid) ?? 0) + item.quantity);
      }
    }

    // 4. Group by style — look up each variant's styleId
    const styleQtyMap = new Map<string, number>();
    const variantToStyle = new Map<string, string>();

    for (const [variantIdStr] of variantQtyMap) {
      const variant = await ctx.db.get(variantIdStr as Id<"variants">);
      if (variant) {
        variantToStyle.set(variantIdStr, variant.styleId.toString());
      }
    }

    for (const [variantIdStr, qty] of variantQtyMap) {
      const styleIdStr = variantToStyle.get(variantIdStr);
      if (styleIdStr) {
        styleQtyMap.set(styleIdStr, (styleQtyMap.get(styleIdStr) ?? 0) + qty);
      }
    }

    // 5. Sort by total sold descending, take top 10
    const sortedStyles = [...styleQtyMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // 6. Enrich with style name, brand name, price, and image
    const results = [];

    for (const [styleIdStr, totalSold] of sortedStyles) {
      const style = await ctx.db.get(styleIdStr as Id<"styles">);
      if (!style || !style.isActive) continue;

      const category = await ctx.db.get(style.categoryId);
      let brandName = "Unknown Brand";
      if (category) {
        const brand = await ctx.db.get(category.brandId);
        if (brand) brandName = brand.name;
      }

      // Get primary image
      const images = await ctx.db
        .query("productImages")
        .withIndex("by_style", (q) =>
          q.eq("styleId", styleIdStr as Id<"styles">)
        )
        .collect();
      const primaryImage = images.find((img) => img.isPrimary) ?? images[0];
      let imageUrl: string | null = null;
      if (primaryImage) {
        imageUrl = await ctx.storage.getUrl(primaryImage.storageId);
      }

      results.push({
        styleId: styleIdStr as Id<"styles">,
        styleName: style.name,
        brandName,
        totalSold,
        priceCentavos: style.basePriceCentavos,
        imageUrl,
        city: targetCity,
      });
    }

    return { city: targetCity, items: results };
  },
});

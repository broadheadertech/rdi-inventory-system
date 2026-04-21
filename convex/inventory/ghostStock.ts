// convex/inventory/ghostStock.ts — Detect items with stock but no recent sales

import { query } from "../_generated/server";
import { requireRole } from "../_helpers/permissions";
import { withBranchScope } from "../_helpers/withBranchScope";
import type { Id } from "../_generated/dataModel";

const GHOST_THRESHOLD_DAYS = 14;
const MAX_RESULTS = 100;

function makeBranchNameResolver(
  dbGet: (id: Id<"branches">) => Promise<{ name: string; isActive: boolean } | null>
) {
  const cache = new Map<Id<"branches">, string>();
  return async function getBranchName(branchId: Id<"branches">): Promise<string> {
    if (cache.has(branchId)) return cache.get(branchId) ?? "(inactive)";
    const branch = await dbGet(branchId);
    const name = branch?.isActive ? branch.name : "(inactive)";
    cache.set(branchId, name);
    return name;
  };
}

export const getGhostStock = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["admin", "hqStaff", "warehouseStaff", "manager"]);
    const scope = await withBranchScope(ctx);

    const now = Date.now();
    const thresholdMs = GHOST_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
    const cutoff = now - thresholdMs;

    // Load inventory — scoped to branch or all
    let inventoryItems;
    if (scope.branchId) {
      inventoryItems = await ctx.db
        .query("inventory")
        .withIndex("by_branch", (q) => q.eq("branchId", scope.branchId!))
        .collect();
    } else {
      inventoryItems = await ctx.db.query("inventory").collect();
    }

    // Filter to items with stock > 0
    const withStock = inventoryItems.filter((inv) => inv.quantity > 0);

    const getBranchName = makeBranchNameResolver((id) => ctx.db.get(id));

    // Style/category/brand caches
    const styleCache = new Map<string, { name: string; categoryId: Id<"categories"> | undefined; brandId: Id<"brands"> | undefined } | null>();
    const categoryCache = new Map<string, { brandId: Id<"brands"> } | null>();
    const brandCache = new Map<string, string>();

    const results: Array<{
      variantId: Id<"variants">;
      sku: string;
      size: string;
      color: string;
      styleName: string;
      brandName: string;
      branchName: string;
      quantity: number;
      lastSaleDate: number | null;
      daysSinceLastSale: number;
    }> = [];

    for (const inv of withStock) {
      // Load variant
      const variant = await ctx.db.get(inv.variantId);
      if (!variant || !variant.isActive) continue;

      // Check for recent sales via transactionItems → transactions
      const transactionItems = await ctx.db
        .query("transactionItems")
        .withIndex("by_variant", (q) => q.eq("variantId", inv.variantId))
        .collect();

      // Find most recent sale date
      let lastSaleDate: number | null = null;
      let hasRecentSale = false;

      for (const ti of transactionItems) {
        const txn = await ctx.db.get(ti.transactionId);
        if (!txn) continue;

        // If scoped to a branch, only consider sales from that branch
        if (scope.branchId && txn.branchId !== inv.branchId) continue;

        if (txn.createdAt >= cutoff) {
          hasRecentSale = true;
          break;
        }
        if (lastSaleDate === null || txn.createdAt > lastSaleDate) {
          lastSaleDate = txn.createdAt;
        }
      }

      if (hasRecentSale) continue;

      // Resolve style
      let styleData = styleCache.get(variant.styleId);
      if (styleData === undefined) {
        const style = await ctx.db.get(variant.styleId);
        styleData = style && style.isActive
          ? { name: style.name, categoryId: style.categoryId, brandId: style.brandId }
          : null;
        styleCache.set(variant.styleId, styleData);
      }
      if (!styleData) continue;

      // Resolve brand via style.brandId first, then category chain
      let resolvedBrandId = styleData.brandId;
      if (!resolvedBrandId) {
        if (!styleData.categoryId) continue;
        let catData = categoryCache.get(styleData.categoryId);
        if (catData === undefined) {
          const category = await ctx.db.get(styleData.categoryId);
          catData = category && category.isActive ? { brandId: category.brandId } : null;
          categoryCache.set(styleData.categoryId, catData);
        }
        if (!catData) continue;
        resolvedBrandId = catData.brandId;
      }

      let brandName = brandCache.get(resolvedBrandId);
      if (brandName === undefined) {
        const brand = await ctx.db.get(resolvedBrandId);
        brandName = brand?.name ?? "Unknown";
        brandCache.set(resolvedBrandId, brandName);
      }

      const branchName = await getBranchName(inv.branchId);

      const daysSinceLastSale = lastSaleDate
        ? Math.floor((now - lastSaleDate) / (24 * 60 * 60 * 1000))
        : 9999; // Never sold — sort to top

      results.push({
        variantId: inv.variantId,
        sku: variant.sku,
        size: variant.size,
        color: variant.color,
        styleName: styleData.name,
        brandName,
        branchName,
        quantity: inv.quantity,
        lastSaleDate,
        daysSinceLastSale,
      });
    }

    // Sort by daysSinceLastSale descending (oldest / never sold first)
    results.sort((a, b) => b.daysSinceLastSale - a.daysSinceLastSale);

    return results.slice(0, MAX_RESULTS);
  },
});

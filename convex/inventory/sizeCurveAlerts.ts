// convex/inventory/sizeCurveAlerts.ts — Smart Size Curve Alerts
// Analyzes which sizes sell fastest per branch and suggests reorder size distributions.

import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireRole } from "../_helpers/permissions";
import { withBranchScope } from "../_helpers/withBranchScope";

// ─── getSizeCurveAnalysis ────────────────────────────────────────────────────
// Returns up to 50 alerts for size imbalances (high sales % vs low stock %).

export const getSizeCurveAnalysis = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, [
      "admin",
      "manager",
      "warehouse_manager",
      "branch_manager",
    ]);
    const scope = await withBranchScope(ctx);

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // ── 1. Gather transactions from the last 30 days ─────────────────────────
    let transactions;
    if (scope.branchId) {
      transactions = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", scope.branchId!).gte("createdAt", thirtyDaysAgo)
        )
        .collect();
    } else {
      // Admin / HQ — all branches
      transactions = await ctx.db
        .query("transactions")
        .filter((q) => q.gte(q.field("createdAt"), thirtyDaysAgo))
        .collect();
    }

    if (transactions.length === 0) {
      return { alerts: [] };
    }

    // Build a set of transaction IDs for quick lookup
    const txIdSet = new Set(transactions.map((t) => t._id));
    // Also track which branch each transaction belongs to
    const txBranchMap = new Map<Id<"transactions">, Id<"branches">>();
    for (const t of transactions) {
      txBranchMap.set(t._id, t.branchId);
    }

    // ── 2. Gather transaction items for those transactions ───────────────────
    // transactionItems doesn't have a date index, so we iterate by transaction
    const allItems = [];
    for (const tx of transactions) {
      const items = await ctx.db
        .query("transactionItems")
        .withIndex("by_transaction", (q) => q.eq("transactionId", tx._id))
        .collect();
      allItems.push(...items);
    }

    if (allItems.length === 0) {
      return { alerts: [] };
    }

    // ── 3. Resolve variants and group sales by styleId → size ────────────────
    // Cache variant lookups
    const variantCache = new Map<
      Id<"variants">,
      { styleId: Id<"styles">; size: string } | null
    >();

    async function getVariantInfo(variantId: Id<"variants">) {
      if (variantCache.has(variantId)) return variantCache.get(variantId)!;
      const v = await ctx.db.get(variantId);
      const info = v ? { styleId: v.styleId, size: v.size } : null;
      variantCache.set(variantId, info);
      return info;
    }

    // styleId → size → totalQuantitySold
    const salesMap = new Map<Id<"styles">, Map<string, number>>();
    // Track branch IDs for inventory lookup
    const branchIdsInScope = new Set<Id<"branches">>();

    for (const item of allItems) {
      const info = await getVariantInfo(item.variantId);
      if (!info) continue;

      const branchId = txBranchMap.get(item.transactionId);
      if (branchId) branchIdsInScope.add(branchId);

      let sizeMap = salesMap.get(info.styleId);
      if (!sizeMap) {
        sizeMap = new Map();
        salesMap.set(info.styleId, sizeMap);
      }
      sizeMap.set(info.size, (sizeMap.get(info.size) ?? 0) + item.quantity);
    }

    // ── 4. For each style, compute sales % and stock % per size ──────────────
    // Get all inventory rows relevant to the branches in scope
    const inventoryByVariant = new Map<Id<"variants">, number>();
    const branchIds = scope.branchId
      ? [scope.branchId]
      : Array.from(branchIdsInScope);

    for (const bId of branchIds) {
      const invRows = await ctx.db
        .query("inventory")
        .withIndex("by_branch", (q) => q.eq("branchId", bId))
        .collect();
      for (const inv of invRows) {
        inventoryByVariant.set(
          inv.variantId,
          (inventoryByVariant.get(inv.variantId) ?? 0) + inv.quantity
        );
      }
    }

    // Build stock map: styleId → size → totalStock
    // We need to know which variants belong to which style and size
    // Re-use variantCache where possible, and query additional variants from inventory
    const allVariantIds = new Set<Id<"variants">>(inventoryByVariant.keys());
    for (const vId of allVariantIds) {
      if (!variantCache.has(vId)) {
        const v = await ctx.db.get(vId);
        variantCache.set(
          vId,
          v ? { styleId: v.styleId, size: v.size } : null
        );
      }
    }

    const stockMap = new Map<Id<"styles">, Map<string, number>>();
    for (const [vId, qty] of inventoryByVariant) {
      const info = variantCache.get(vId);
      if (!info) continue;
      // Only include styles that have sales data
      if (!salesMap.has(info.styleId)) continue;

      let sizeMap = stockMap.get(info.styleId);
      if (!sizeMap) {
        sizeMap = new Map();
        stockMap.set(info.styleId, sizeMap);
      }
      sizeMap.set(info.size, (sizeMap.get(info.size) ?? 0) + qty);
    }

    // ── 5. Identify imbalances and build alerts ──────────────────────────────
    type Alert = {
      styleId: Id<"styles">;
      styleName: string;
      brandName: string;
      size: string;
      salesPercent: number;
      stockPercent: number;
      imbalanceScore: number;
      recommendation: string;
    };

    const rawAlerts: Alert[] = [];

    // Cache style → category → brand lookups
    const styleCache = new Map<
      Id<"styles">,
      { name: string; categoryId: Id<"categories"> } | null
    >();
    const categoryBrandCache = new Map<Id<"categories">, string>();

    for (const [styleId, sizeSalesMap] of salesMap) {
      const totalSales = Array.from(sizeSalesMap.values()).reduce(
        (a, b) => a + b,
        0
      );
      if (totalSales === 0) continue;

      const sizeStockMap = stockMap.get(styleId);
      const totalStock = sizeStockMap
        ? Array.from(sizeStockMap.values()).reduce((a, b) => a + b, 0)
        : 0;

      for (const [size, soldQty] of sizeSalesMap) {
        const salesPercent = Math.round((soldQty / totalSales) * 100);
        const stockQty = sizeStockMap?.get(size) ?? 0;
        const stockPercent =
          totalStock > 0 ? Math.round((stockQty / totalStock) * 100) : 0;

        // Flag: >40% of sales but <20% of current inventory
        if (salesPercent > 40 && stockPercent < 20) {
          // Resolve style name and brand
          if (!styleCache.has(styleId)) {
            const s = await ctx.db.get(styleId);
            styleCache.set(
              styleId,
              s ? { name: s.name, categoryId: s.categoryId } : null
            );
          }
          const styleInfo = styleCache.get(styleId);
          if (!styleInfo) continue;

          if (!categoryBrandCache.has(styleInfo.categoryId)) {
            const cat = await ctx.db.get(styleInfo.categoryId);
            if (cat) {
              const brand = await ctx.db.get(cat.brandId);
              categoryBrandCache.set(
                styleInfo.categoryId,
                brand?.name ?? "Unknown"
              );
            } else {
              categoryBrandCache.set(styleInfo.categoryId, "Unknown");
            }
          }

          const brandName =
            categoryBrandCache.get(styleInfo.categoryId) ?? "Unknown";
          const imbalanceScore = salesPercent - stockPercent;

          rawAlerts.push({
            styleId,
            styleName: styleInfo.name,
            brandName,
            size,
            salesPercent,
            stockPercent,
            imbalanceScore,
            recommendation: `Increase ${size} allocation from ${stockPercent}% to ${salesPercent}%`,
          });
        }
      }
    }

    // Sort by imbalance severity (descending) and take top 50
    rawAlerts.sort((a, b) => b.imbalanceScore - a.imbalanceScore);
    const alerts = rawAlerts.slice(0, 50);

    return { alerts };
  },
});

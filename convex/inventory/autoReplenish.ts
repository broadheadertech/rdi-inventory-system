// convex/inventory/autoReplenish.ts — Auto-replenishment suggestions

import { query } from "../_generated/server";
import { requireRole } from "../_helpers/permissions";
import { withBranchScope } from "../_helpers/withBranchScope";
import type { Id } from "../_generated/dataModel";

const ALLOWED_ROLES = [
  "admin",
  "manager",
  "warehouse_manager",
  "branch_manager",
] as const;

export const getReplenishmentSuggestions = query({
  args: {},
  handler: async (ctx) => {
    // 1. Auth & branch scope
    await requireRole(ctx, ALLOWED_ROLES);
    const scope = await withBranchScope(ctx);

    // 2. Load inventory — branch-scoped or all branches for HQ
    let inventoryItems;
    if (scope.branchId) {
      inventoryItems = await ctx.db
        .query("inventory")
        .withIndex("by_branch", (q) => q.eq("branchId", scope.branchId!))
        .collect();
    } else {
      inventoryItems = await ctx.db.query("inventory").collect();
    }

    // 3. Filter to low-stock items
    const lowStockItems = inventoryItems.filter(
      (inv) => inv.quantity <= (inv.lowStockThreshold ?? 5)
    );

    // 4. Load all pending/approved/packed/inTransit transfers for incoming stock calc
    const incomingStatuses = [
      "requested",
      "approved",
      "packed",
      "inTransit",
    ] as const;

    // Build a map: branchId+variantId → total incoming quantity
    const incomingMap = new Map<string, number>();

    for (const status of incomingStatuses) {
      const transfers = await ctx.db
        .query("transfers")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();

      for (const transfer of transfers) {
        // Only count transfers TO the branch in question
        const transferItems = await ctx.db
          .query("transferItems")
          .withIndex("by_transfer", (q) =>
            q.eq("transferId", transfer._id)
          )
          .collect();

        for (const ti of transferItems) {
          const key = `${transfer.toBranchId}:${ti.variantId}`;
          incomingMap.set(
            key,
            (incomingMap.get(key) ?? 0) + ti.requestedQuantity
          );
        }
      }
    }

    // 5. Caches for branch/variant/style/category/brand lookups
    const branchCache = new Map<string, string>();
    const variantCache = new Map<string, { sku: string; size: string; color: string; styleId: Id<"styles"> } | null>();
    const styleCache = new Map<string, { name: string; categoryId: Id<"categories"> } | null>();
    const categoryCache = new Map<string, { brandId: Id<"brands"> } | null>();
    const brandCache = new Map<string, string>();

    // 6. Build suggestions
    const suggestions = await Promise.all(
      lowStockItems.map(async (inv) => {
        const threshold = inv.lowStockThreshold ?? 5;
        const baseSuggestion = threshold * 3;

        const incomingKey = `${inv.branchId}:${inv.variantId}`;
        const incomingStock = incomingMap.get(incomingKey) ?? 0;
        const suggestedReorder = baseSuggestion - incomingStock;

        // Skip if already covered by incoming transfers
        if (suggestedReorder <= 0) return null;

        // Resolve variant
        let variant = variantCache.get(inv.variantId as string);
        if (variant === undefined) {
          const v = await ctx.db.get(inv.variantId);
          variant = v && v.isActive
            ? { sku: v.sku, size: v.size, color: v.color, styleId: v.styleId }
            : null;
          variantCache.set(inv.variantId as string, variant);
        }
        if (!variant) return null;

        // Resolve style
        let style = styleCache.get(variant.styleId as string);
        if (style === undefined) {
          const s = await ctx.db.get(variant.styleId);
          style = s && s.isActive
            ? { name: s.name, categoryId: s.categoryId }
            : null;
          styleCache.set(variant.styleId as string, style);
        }
        if (!style) return null;

        // Resolve category -> brand
        let category = categoryCache.get(style.categoryId as string);
        if (category === undefined) {
          const c = await ctx.db.get(style.categoryId);
          category = c ? { brandId: c.brandId } : null;
          categoryCache.set(style.categoryId as string, category);
        }
        if (!category) return null;

        let brandName = brandCache.get(category.brandId as string);
        if (brandName === undefined) {
          const b = await ctx.db.get(category.brandId);
          brandName = b?.name ?? "Unknown";
          brandCache.set(category.brandId as string, brandName);
        }

        // Resolve branch name
        let branchName = branchCache.get(inv.branchId as string);
        if (branchName === undefined) {
          const branch = await ctx.db.get(inv.branchId);
          branchName = branch?.name ?? "Unknown";
          branchCache.set(inv.branchId as string, branchName);
        }

        return {
          variantId: inv.variantId,
          branchId: inv.branchId,
          branchName,
          sku: variant.sku,
          styleName: style.name,
          brandName,
          size: variant.size,
          color: variant.color,
          currentStock: inv.quantity,
          threshold,
          incomingStock,
          suggestedReorder,
        };
      })
    );

    // 7. Filter nulls, sort by quantity ascending (most urgent first), limit 100
    return suggestions
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.currentStock - b.currentStock)
      .slice(0, 100);
  },
});

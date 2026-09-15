import { v } from "convex/values";
import { query } from "../_generated/server";
import { withBranchScope } from "../_helpers/withBranchScope";
import type { Id } from "../_generated/dataModel";
import { branchPrice } from "../_helpers/branchPricing";

// ─── getSuggestions ──────────────────────────────────────────────────────────
// Finds products frequently bought alongside the given cart items.
//
// Algorithm:
//  1. For each cart variantId (up to 3), look up the 50 most recent
//     transactionItems for that variant to collect recent transactionIds.
//  2. For each transaction, count co-occurrences of other variantIds.
//  3. Sort by frequency, filter to in-stock & active items at this branch.
//  4. Return the top `limit` suggestions with full product details.

export const getSuggestions = query({
  args: {
    variantIds: v.array(v.id("variants")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!scope.branchId || args.variantIds.length === 0) return [];

    const branchId = scope.branchId;
    const maxReturn = Math.min(args.limit ?? 5, 10);
    const cartSet = new Set(args.variantIds.map(String));

    // Use up to 3 cart items for the lookup (enough signal, bounded cost)
    const queryVariants = args.variantIds.slice(0, 3);

    // Step 1: collect transactionIds from recent sales of cart items
    const txnIdSet = new Set<string>();
    for (const variantId of queryVariants) {
      const items = await ctx.db
        .query("transactionItems")
        .withIndex("by_variant", (q) => q.eq("variantId", variantId))
        .order("desc")
        .take(50);

      for (const item of items) {
        txnIdSet.add(String(item.transactionId));
        if (txnIdSet.size >= 150) break;
      }
    }

    if (txnIdSet.size === 0) return [];

    // Step 2: count co-occurrences across those transactions
    const coCount = new Map<string, number>();

    for (const txnIdStr of txnIdSet) {
      const txn = await ctx.db.get(txnIdStr as Id<"transactions">);
      // Skip voided, wrong branch, or return transactions
      if (!txn || txn.status === "voided" || txn.branchId !== branchId || txn.totalCentavos < 0) {
        continue;
      }

      const items = await ctx.db
        .query("transactionItems")
        .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
        .collect();

      for (const item of items) {
        const vid = String(item.variantId);
        if (!cartSet.has(vid)) {
          coCount.set(vid, (coCount.get(vid) ?? 0) + 1);
        }
      }
    }

    if (coCount.size === 0) return [];

    // Step 3: sort by frequency, take top candidates
    const candidates = [...coCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    // Step 4: filter to in-stock active items and enrich
    const suggestions: {
      variantId: Id<"variants">;
      styleName: string;
      size: string;
      color: string;
      priceCentavos: number;
      stock: number;
    }[] = [];

    for (const [vidStr] of candidates) {
      if (suggestions.length >= maxReturn) break;

      const variantId = vidStr as Id<"variants">;
      const variant = await ctx.db.get(variantId);
      if (!variant || !variant.isActive) continue;

      const inv = await ctx.db
        .query("inventory")
        .withIndex("by_branch_variant", (q) =>
          q.eq("branchId", branchId).eq("variantId", variantId)
        )
        .unique();
      if (!inv || inv.quantity <= 0) continue;

      const style = await ctx.db.get(variant.styleId);
      if (!style) continue;

      suggestions.push({
        variantId,
        styleName: style.name,
        size: variant.size,
        color: variant.color,
        priceCentavos: await branchPrice(ctx, branchId, variant),
        stock: inv.quantity,
      });
    }

    return suggestions;
  },
});

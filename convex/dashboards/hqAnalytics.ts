import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

// YYYYMMDD → UTC start-of-day timestamp
function dateToStartMs(s: string): number {
  return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
}
function dateToEndMs(s: string): number {
  return dateToStartMs(s) + 24 * 60 * 60 * 1000 - 1;
}

// ─── getHQInventoryHealth ─────────────────────────────────────────────────────
// Cross-branch inventory snapshot: per-branch SKU counts split into
// healthy / low-stock / out-of-stock, plus aggregate totals.
// Does NOT require a date range — it reflects the current stock state.

export const getHQInventoryHealth = query({
  args: {
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const allBranches = await ctx.db.query("branches").collect();

    const branches = allBranches
      .filter((b) => b.isActive)
      .filter((b) => !args.branchId || (b._id as string) === (args.branchId as string));

    const results = await Promise.all(
      branches.map(async (branch) => {
        const inventory = await ctx.db
          .query("inventory")
          .withIndex("by_branch", (q) => q.eq("branchId", branch._id))
          .collect();

        const totalSkus = inventory.length;
        const outOfStock = inventory.filter((i) => i.quantity <= 0).length;
        const lowStock = inventory.filter(
          (i) => i.quantity > 0 && i.quantity <= (i.lowStockThreshold ?? 5)
        ).length;
        const healthy = totalSkus - outOfStock - lowStock;
        const healthScore =
          totalSkus > 0 ? Math.round((healthy / totalSkus) * 100) : 100;

        return {
          branchId: branch._id as string,
          branchName: branch.name,
          branchType: branch.channel === "warehouse" ? "warehouse" : "retail",
          totalSkus,
          healthy,
          lowStock,
          outOfStock,
          healthScore,
        };
      })
    );

    const sorted = results.sort((a, b) => a.healthScore - b.healthScore);

    return {
      byBranch: sorted,
      totals: {
        totalSkus: sorted.reduce((s, r) => s + r.totalSkus, 0),
        healthy: sorted.reduce((s, r) => s + r.healthy, 0),
        lowStock: sorted.reduce((s, r) => s + r.lowStock, 0),
        outOfStock: sorted.reduce((s, r) => s + r.outOfStock, 0),
      },
    };
  },
});

// ─── getHQSlowMovers ──────────────────────────────────────────────────────────
// Items with ≥5 units in stock that had ZERO sales in the selected period.
// Sorted by quantity descending (most stock sitting idle = highest priority).
// Returns top 10 across all branches (or the specified branch).

export const getHQSlowMovers = query({
  args: {
    dateStart: v.string(), // YYYYMMDD
    dateEnd: v.string(),   // YYYYMMDD
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const startMs = dateToStartMs(args.dateStart);
    const endMs = dateToEndMs(args.dateEnd);

    // Scope to active branches
    const allBranches = await ctx.db.query("branches").collect();
    const branches = allBranches
      .filter((b) => b.isActive)
      .filter((b) => !args.branchId || (b._id as string) === (args.branchId as string));

    // Collect transactions in range per branch
    const allTxns = (
      await Promise.all(
        branches.map((b) =>
          ctx.db
            .query("transactions")
            .withIndex("by_branch_date", (q) =>
              q.eq("branchId", b._id).gte("createdAt", startMs)
            )
            .filter((q) => q.lte(q.field("createdAt"), endMs))
            .collect()
        )
      )
    ).flat();

    // Build variantId → total units sold map from transactionItems
    const soldMap = new Map<string, number>();
    for (const txn of allTxns) {
      const items = await ctx.db
        .query("transactionItems")
        .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
        .collect();
      for (const item of items) {
        const key = item.variantId as string;
        soldMap.set(key, (soldMap.get(key) ?? 0) + item.quantity);
      }
    }

    // Gather all inventory with meaningful stock (≥ 5 units)
    const allInventory = (
      await Promise.all(
        branches.map(async (branch) => {
          const inv = await ctx.db
            .query("inventory")
            .withIndex("by_branch", (q) => q.eq("branchId", branch._id))
            .collect();
          return inv.map((i) => ({
            ...i,
            branchName: branch.name,
            branchType: branch.channel === "warehouse" ? "warehouse" : "retail",
          }));
        })
      )
    ).flat();

    // Slow mover = stock ≥ 5 AND zero units sold in the selected period
    const slowMovers = allInventory
      .filter(
        (i) => i.quantity >= 5 && (soldMap.get(i.variantId as string) ?? 0) === 0
      )
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    // Enrich with variant → style product info
    const variantCache = new Map<
      string,
      { sku: string; styleName: string; size: string; color: string; priceCentavos: number }
    >();

    const enriched = await Promise.all(
      slowMovers.map(async (item) => {
        const vid = item.variantId as string;
        let info = variantCache.get(vid);
        if (!info) {
          const variant = await ctx.db.get(item.variantId as Id<"variants">);
          const style = variant ? await ctx.db.get(variant.styleId) : null;
          info = {
            sku: variant?.sku ?? "—",
            styleName: style?.name ?? "Unknown",
            size: variant?.size ?? "—",
            color: variant?.color ?? "—",
            priceCentavos: variant?.priceCentavos ?? 0,
          };
          variantCache.set(vid, info);
        }

        // Suggested action based on stock level
        let suggestion: string;
        if (item.quantity >= 20) {
          suggestion = "High idle stock — consider 30–50% markdown or bundle promotion";
        } else if (item.quantity >= 10) {
          suggestion = "Moderate idle stock — try a 20% promotional discount";
        } else {
          suggestion = "Feature in display area or transfer to a higher-demand branch";
        }

        return {
          variantId: vid,
          branchId: item.branchId as string,
          branchName: item.branchName,
          quantity: item.quantity,
          soldInPeriod: 0,
          suggestion,
          ...info,
        };
      })
    );

    return enriched;
  },
});

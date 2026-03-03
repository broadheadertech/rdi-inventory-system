import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { withBranchScope } from "../_helpers/withBranchScope";

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function getPHTDayStartMs(): number {
  const nowUtcMs = Date.now();
  const nowPhtMs = nowUtcMs + PHT_OFFSET_MS;
  const todayPhtStartMs = nowPhtMs - (nowPhtMs % DAY_MS);
  return todayPhtStartMs - PHT_OFFSET_MS;
}

// Resolve period from optional args — defaults to last 7 days
function resolvePeriod(args: { startMs?: number; endMs?: number }): {
  startMs: number;
  endMs: number;
  durationMs: number;
  durationDays: number;
} {
  const nowMs = Date.now();
  const endMs = args.endMs ?? nowMs;
  const startMs = args.startMs ?? getPHTDayStartMs() - 7 * DAY_MS;
  const durationMs = Math.max(endMs - startMs, 1);
  return { startMs, endMs, durationMs, durationDays: Math.max(1, durationMs / DAY_MS) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESCRIPTIVE ANALYSIS — What is happening
// ═══════════════════════════════════════════════════════════════════════════════

// ─── getWeeklySalesSummary ────────────────────────────────────────────────────
// Sales for the selected period with equivalent prior-period comparison.

export const getWeeklySalesSummary = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const { startMs, endMs, durationMs } = resolvePeriod(args);
    const prevStartMs = startMs - durationMs;
    const prevEndMs = startMs;

    // Detect warehouse
    const branch = await ctx.db.get(branchId);
    const isWarehouse = branch?.type === "warehouse";

    if (isWarehouse) {
      const allInvoices = await ctx.db
        .query("internalInvoices")
        .withIndex("by_createdAt", (q) => q.gte("createdAt", prevStartMs))
        .collect();

      const myInvoices = allInvoices.filter(
        (inv) => (inv.fromBranchId as string) === (branchId as string)
      );
      const curInv = myInvoices.filter((i) => i.createdAt >= startMs && i.createdAt <= endMs);
      const prevInv = myInvoices.filter((i) => i.createdAt >= prevStartMs && i.createdAt < prevEndMs);

      return {
        thisWeek: {
          revenueCentavos: curInv.reduce((s, i) => s + i.totalCentavos, 0),
          transactionCount: curInv.length,
          itemsSold: 0,
          avgTxnValueCentavos: curInv.length > 0
            ? Math.round(curInv.reduce((s, i) => s + i.totalCentavos, 0) / curInv.length)
            : 0,
        },
        lastWeek: {
          revenueCentavos: prevInv.reduce((s, i) => s + i.totalCentavos, 0),
          transactionCount: prevInv.length,
          itemsSold: 0,
          avgTxnValueCentavos: prevInv.length > 0
            ? Math.round(prevInv.reduce((s, i) => s + i.totalCentavos, 0) / prevInv.length)
            : 0,
        },
        isWarehouse: true,
      };
    }

    // Retail: POS transactions
    const recentTxns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", prevStartMs)
      )
      .collect();

    const curTxns = recentTxns.filter((t) => t.createdAt >= startMs && t.createdAt <= endMs);
    const prevTxns = recentTxns.filter((t) => t.createdAt >= prevStartMs && t.createdAt < prevEndMs);

    async function countItems(txns: typeof recentTxns): Promise<number> {
      const arrays = await Promise.all(
        txns.map((txn) =>
          ctx.db
            .query("transactionItems")
            .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
            .collect()
        )
      );
      return arrays.flat().reduce((s, item) => s + item.quantity, 0);
    }

    const [curItems, prevItems] = await Promise.all([
      countItems(curTxns),
      countItems(prevTxns),
    ]);

    const curRev = curTxns.reduce((s, t) => s + t.totalCentavos, 0);
    const prevRev = prevTxns.reduce((s, t) => s + t.totalCentavos, 0);

    return {
      thisWeek: {
        revenueCentavos: curRev,
        transactionCount: curTxns.length,
        itemsSold: curItems,
        avgTxnValueCentavos: curTxns.length > 0 ? Math.round(curRev / curTxns.length) : 0,
      },
      lastWeek: {
        revenueCentavos: prevRev,
        transactionCount: prevTxns.length,
        itemsSold: prevItems,
        avgTxnValueCentavos: prevTxns.length > 0 ? Math.round(prevRev / prevTxns.length) : 0,
      },
      isWarehouse: false,
    };
  },
});

// ─── getTopSellingProducts ────────────────────────────────────────────────────
// Top 5 products in the selected period by revenue.

export const getTopSellingProducts = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const { startMs, endMs } = resolvePeriod(args);

    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", startMs)
      )
      .filter((q) => q.lte(q.field("createdAt"), endMs))
      .collect();

    const variantAgg = new Map<string, { qty: number; revenue: number }>();
    for (const txn of txns) {
      const items = await ctx.db
        .query("transactionItems")
        .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
        .collect();
      for (const item of items) {
        const key = item.variantId as string;
        const existing = variantAgg.get(key) ?? { qty: 0, revenue: 0 };
        existing.qty += item.quantity;
        existing.revenue += item.lineTotalCentavos;
        variantAgg.set(key, existing);
      }
    }

    const sorted = Array.from(variantAgg.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5);

    const variantCache = new Map<string, { sku: string; styleName: string; size: string; color: string }>();

    return Promise.all(
      sorted.map(async ([variantId, agg]) => {
        let info = variantCache.get(variantId);
        if (!info) {
          const variant = await ctx.db.get(variantId as Id<"variants">);
          const style = variant ? await ctx.db.get(variant.styleId) : null;
          info = {
            sku: variant?.sku ?? "",
            styleName: style?.name ?? "Unknown",
            size: variant?.size ?? "",
            color: variant?.color ?? "",
          };
          variantCache.set(variantId, info);
        }
        return {
          variantId,
          ...info,
          totalQuantity: agg.qty,
          totalRevenueCentavos: agg.revenue,
        };
      })
    );
  },
});

// ─── getInventoryHealth ───────────────────────────────────────────────────────
// Stock snapshot: total SKUs, in-stock, low-stock, out-of-stock.

export const getInventoryHealth = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const inventory = await ctx.db
      .query("inventory")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();

    const activeAlerts = await ctx.db
      .query("lowStockAlerts")
      .withIndex("by_branch_status", (q) =>
        q.eq("branchId", branchId).eq("status", "active")
      )
      .collect();

    const totalSkus = inventory.length;
    const outOfStockCount = inventory.filter((i) => i.quantity <= 0).length;
    const inStockCount = totalSkus - outOfStockCount;

    return {
      totalSkus,
      inStockCount,
      lowStockCount: activeAlerts.length,
      outOfStockCount,
    };
  },
});

// ─── getPaymentMethodBreakdown ────────────────────────────────────────────────
// Cash vs GCash vs Maya distribution over the selected period.

export const getPaymentMethodBreakdown = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const { startMs, endMs } = resolvePeriod(args);

    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", startMs)
      )
      .filter((q) => q.lte(q.field("createdAt"), endMs))
      .collect();

    const methods: Record<string, { count: number; revenueCentavos: number }> = {
      cash: { count: 0, revenueCentavos: 0 },
      gcash: { count: 0, revenueCentavos: 0 },
      maya: { count: 0, revenueCentavos: 0 },
    };

    for (const txn of txns) {
      const method = txn.paymentMethod;
      if (methods[method]) {
        methods[method].count += 1;
        methods[method].revenueCentavos += txn.totalCentavos;
      }
    }

    const totalRevenue = txns.reduce((s, t) => s + t.totalCentavos, 0);

    return Object.entries(methods).map(([method, data]) => ({
      method,
      count: data.count,
      revenueCentavos: data.revenueCentavos,
      percentage: totalRevenue > 0 ? Math.round((data.revenueCentavos / totalRevenue) * 100) : 0,
    }));
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC ANALYSIS — Why is it happening
// ═══════════════════════════════════════════════════════════════════════════════

// ─── getProductVelocity ───────────────────────────────────────────────────────
// Fast movers (top 5) and slow movers (bottom 5) by daily velocity.

export const getProductVelocity = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const { startMs, endMs, durationDays } = resolvePeriod(args);

    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", startMs)
      )
      .filter((q) => q.lte(q.field("createdAt"), endMs))
      .collect();

    const variantSales = new Map<string, number>();
    for (const txn of txns) {
      const items = await ctx.db
        .query("transactionItems")
        .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
        .collect();
      for (const item of items) {
        const key = item.variantId as string;
        variantSales.set(key, (variantSales.get(key) ?? 0) + item.quantity);
      }
    }

    const inventory = await ctx.db
      .query("inventory")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();

    const inventoryMap = new Map<string, number>();
    for (const inv of inventory) {
      inventoryMap.set(inv.variantId as string, inv.quantity);
    }

    const allVariantIds = new Set([
      ...variantSales.keys(),
      ...inventory.filter((i) => i.quantity > 0).map((i) => i.variantId as string),
    ]);

    const entries: { variantId: string; totalSold: number; avgDaily: number; currentStock: number }[] = [];
    for (const vid of allVariantIds) {
      const totalSold = variantSales.get(vid) ?? 0;
      entries.push({
        variantId: vid,
        totalSold,
        avgDaily: Math.round((totalSold / durationDays) * 10) / 10,
        currentStock: inventoryMap.get(vid) ?? 0,
      });
    }

    const fastMovers = [...entries].sort((a, b) => b.avgDaily - a.avgDaily).slice(0, 5);
    const slowMovers = entries
      .filter((e) => e.currentStock > 0)
      .sort((a, b) => a.avgDaily - b.avgDaily)
      .slice(0, 5);

    const variantCache = new Map<string, { sku: string; styleName: string; size: string; color: string }>();
    async function enrich(items: typeof fastMovers) {
      return Promise.all(
        items.map(async (item) => {
          let info = variantCache.get(item.variantId);
          if (!info) {
            const variant = await ctx.db.get(item.variantId as Id<"variants">);
            const style = variant ? await ctx.db.get(variant.styleId) : null;
            info = {
              sku: variant?.sku ?? "",
              styleName: style?.name ?? "Unknown",
              size: variant?.size ?? "",
              color: variant?.color ?? "",
            };
            variantCache.set(item.variantId, info);
          }
          return { ...item, ...info };
        })
      );
    }

    return {
      fastMovers: await enrich(fastMovers),
      slowMovers: await enrich(slowMovers),
    };
  },
});

// ─── getDemandGapAnalysis ─────────────────────────────────────────────────────
// Items customers ask for vs what's actually in stock.

export const getDemandGapAnalysis = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const { startMs, endMs } = resolvePeriod(args);

    const demandLogs = await ctx.db
      .query("demandLogs")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();

    const recentLogs = demandLogs.filter((d) => d.createdAt >= startMs && d.createdAt <= endMs);

    const demandAgg = new Map<string, { brand: string; design: string; size: string; count: number }>();
    for (const log of recentLogs) {
      const key = `${log.brand}|${log.design ?? ""}|${log.size ?? ""}`;
      const existing = demandAgg.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        demandAgg.set(key, {
          brand: log.brand,
          design: log.design ?? "",
          size: log.size ?? "",
          count: 1,
        });
      }
    }

    const inventory = await ctx.db
      .query("inventory")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();

    const variantBrands = new Map<string, { brand: string; styleName: string; size: string; quantity: number }>();
    for (const inv of inventory) {
      const variant = await ctx.db.get(inv.variantId);
      if (!variant) continue;
      const style = await ctx.db.get(variant.styleId);
      if (!style) continue;
      const category = await ctx.db.get(style.categoryId);
      if (!category) continue;
      const brand = await ctx.db.get(category.brandId);
      if (!brand) continue;
      variantBrands.set(inv.variantId as string, {
        brand: brand.name,
        styleName: style.name,
        size: variant.size,
        quantity: inv.quantity,
      });
    }

    const gaps = Array.from(demandAgg.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((demand) => {
        const matchingStock = Array.from(variantBrands.values()).filter(
          (v) =>
            v.brand.toLowerCase() === demand.brand.toLowerCase() &&
            (!demand.size || v.size.toLowerCase() === demand.size.toLowerCase())
        );
        const totalStock = matchingStock.reduce((s, v) => s + v.quantity, 0);
        return {
          brand: demand.brand,
          design: demand.design,
          size: demand.size,
          requestCount: demand.count,
          inStock: totalStock > 0,
          currentQuantity: totalStock,
        };
      });

    return gaps;
  },
});

// ─── getTransferEfficiency ────────────────────────────────────────────────────
// Average fulfillment time for incoming transfers (fixed 30-day window).

export const getTransferEfficiency = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const branch = await ctx.db.get(branchId);
    const isWarehouse = branch?.type === "warehouse";

    const transfers = isWarehouse
      ? await ctx.db
          .query("transfers")
          .withIndex("by_from_branch", (q) => q.eq("fromBranchId", branchId))
          .order("desc")
          .collect()
      : await ctx.db
          .query("transfers")
          .withIndex("by_to_branch", (q) => q.eq("toBranchId", branchId))
          .order("desc")
          .collect();

    const thirtyDaysAgo = Date.now() - 30 * DAY_MS;

    const delivered = transfers.filter(
      (t) => t.status === "delivered" && t.deliveredAt && t.deliveredAt >= thirtyDaysAgo
    );

    const fulfillmentHours = delivered.map((t) => {
      const hours = (t.deliveredAt! - t.createdAt) / (1000 * 60 * 60);
      return Math.round(hours * 10) / 10;
    });

    const avgFulfillmentHours =
      fulfillmentHours.length > 0
        ? Math.round((fulfillmentHours.reduce((s, h) => s + h, 0) / fulfillmentHours.length) * 10) / 10
        : 0;

    const pending = transfers.filter(
      (t) => t.status !== "delivered" && t.status !== "rejected" && t.status !== "cancelled"
    );

    return {
      avgFulfillmentHours,
      completedCount: delivered.length,
      pendingCount: pending.length,
      isWarehouse,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// PREDICTIVE ANALYSIS — What will happen
// ═══════════════════════════════════════════════════════════════════════════════

// ─── getBranchRestockSuggestions ───────────────────────────────────────────────
// Active restock suggestions scoped to this branch.

export const getBranchRestockSuggestions = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const suggestions = await ctx.db
      .query("restockSuggestions")
      .withIndex("by_branch_status", (q) =>
        q.eq("branchId", branchId).eq("status", "active")
      )
      .collect();

    const variantCache = new Map<string, { sku: string; styleName: string; size: string; color: string }>();

    const enriched = await Promise.all(
      suggestions.map(async (s) => {
        let info = variantCache.get(s.variantId as string);
        if (!info) {
          const variant = await ctx.db.get(s.variantId);
          const style = variant ? await ctx.db.get(variant.styleId) : null;
          info = {
            sku: variant?.sku ?? "",
            styleName: style?.name ?? "Unknown",
            size: variant?.size ?? "",
            color: variant?.color ?? "",
          };
          variantCache.set(s.variantId as string, info);
        }
        return {
          id: s._id as string,
          ...info,
          suggestedQuantity: s.suggestedQuantity,
          currentStock: s.currentStock,
          avgDailyVelocity: s.avgDailyVelocity,
          daysUntilStockout: s.daysUntilStockout,
          incomingStock: s.incomingStock,
          confidence: s.confidence,
          rationale: s.rationale,
        };
      })
    );

    return enriched.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
  },
});

// ─── getProjectedWeeklyRevenue ────────────────────────────────────────────────
// Revenue projection based on current week's daily average.

export const getProjectedWeeklyRevenue = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const todayStart = getPHTDayStartMs();
    const nowPht = Date.now() + PHT_OFFSET_MS;
    const dayOfWeek = new Date(nowPht).getUTCDay();
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const mondayStart = todayStart - daysSinceMonday * DAY_MS;
    const lastMondayStart = mondayStart - 7 * DAY_MS;

    const branch = await ctx.db.get(branchId);
    const isWarehouse = branch?.type === "warehouse";

    if (isWarehouse) {
      const invoices = await ctx.db
        .query("internalInvoices")
        .withIndex("by_createdAt", (q) => q.gte("createdAt", lastMondayStart))
        .collect();

      const myInvoices = invoices.filter(
        (inv) => (inv.fromBranchId as string) === (branchId as string)
      );
      const thisWeekInv = myInvoices.filter((inv) => inv.createdAt >= mondayStart);
      const lastWeekInv = myInvoices.filter(
        (inv) => inv.createdAt >= lastMondayStart && inv.createdAt < mondayStart
      );

      const currentRev = thisWeekInv.reduce((s, i) => s + i.totalCentavos, 0);
      const daysElapsed = Math.max(1, daysSinceMonday + 1);

      return {
        currentWeekRevenueCentavos: currentRev,
        daysElapsed,
        dailyAverageCentavos: Math.round(currentRev / daysElapsed),
        projectedWeekTotalCentavos: Math.round((currentRev / daysElapsed) * 7),
        lastWeekTotalCentavos: lastWeekInv.reduce((s, i) => s + i.totalCentavos, 0),
        isWarehouse: true,
      };
    }

    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", lastMondayStart)
      )
      .collect();

    const thisWeekTxns = txns.filter((t) => t.createdAt >= mondayStart);
    const lastWeekTxns = txns.filter(
      (t) => t.createdAt >= lastMondayStart && t.createdAt < mondayStart
    );

    const currentRev = thisWeekTxns.reduce((s, t) => s + t.totalCentavos, 0);
    const daysElapsed = Math.max(1, daysSinceMonday + 1);

    return {
      currentWeekRevenueCentavos: currentRev,
      daysElapsed,
      dailyAverageCentavos: Math.round(currentRev / daysElapsed),
      projectedWeekTotalCentavos: Math.round((currentRev / daysElapsed) * 7),
      lastWeekTotalCentavos: lastWeekTxns.reduce((s, t) => s + t.totalCentavos, 0),
      isWarehouse: false,
    };
  },
});

// ─── getDemandForecast ────────────────────────────────────────────────────────
// Trending items from demand logs that may need stocking.

export const getDemandForecast = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const { startMs, endMs } = resolvePeriod(args);

    const demandLogs = await ctx.db
      .query("demandLogs")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();

    const recentLogs = demandLogs.filter((d) => d.createdAt >= startMs && d.createdAt <= endMs);

    const agg = new Map<string, { brand: string; design: string; count: number }>();
    for (const log of recentLogs) {
      const key = `${log.brand}|${log.design ?? ""}`;
      const existing = agg.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        agg.set(key, { brand: log.brand, design: log.design ?? "", count: 1 });
      }
    }

    const inventory = await ctx.db
      .query("inventory")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();

    const brandStock = new Map<string, number>();
    for (const inv of inventory) {
      const variant = await ctx.db.get(inv.variantId);
      if (!variant) continue;
      const style = await ctx.db.get(variant.styleId);
      if (!style) continue;
      const category = await ctx.db.get(style.categoryId);
      if (!category) continue;
      const brand = await ctx.db.get(category.brandId);
      if (!brand) continue;
      brandStock.set(
        brand.name.toLowerCase(),
        (brandStock.get(brand.name.toLowerCase()) ?? 0) + inv.quantity
      );
    }

    const forecast = Array.from(agg.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((item) => ({
        brand: item.brand,
        design: item.design,
        requestCount: item.count,
        isTrending: item.count >= 3,
        inStock: (brandStock.get(item.brand.toLowerCase()) ?? 0) > 0,
      }));

    return forecast;
  },
});

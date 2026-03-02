import { query } from "../_generated/server";
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

// ═══════════════════════════════════════════════════════════════════════════════
// DESCRIPTIVE ANALYSIS — What is happening
// ═══════════════════════════════════════════════════════════════════════════════

// ─── getWeeklySalesSummary ────────────────────────────────────────────────────
// 7-day sales with week-over-week comparison.

export const getWeeklySalesSummary = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const todayStart = getPHTDayStartMs();
    const thisWeekStart = todayStart - 7 * DAY_MS;
    const lastWeekStart = todayStart - 14 * DAY_MS;

    // Detect warehouse
    const branch = await ctx.db.get(branchId);
    const isWarehouse = branch?.type === "warehouse";

    if (isWarehouse) {
      // Warehouse: revenue from internal invoices
      const recentInvoices = await ctx.db
        .query("internalInvoices")
        .withIndex("by_createdAt", (q) => q.gte("createdAt", lastWeekStart))
        .collect();

      const myInvoices = recentInvoices.filter(
        (inv) => (inv.fromBranchId as string) === (branchId as string)
      );
      const thisWeekInv = myInvoices.filter((inv) => inv.createdAt >= thisWeekStart);
      const lastWeekInv = myInvoices.filter(
        (inv) => inv.createdAt >= lastWeekStart && inv.createdAt < thisWeekStart
      );

      return {
        thisWeek: {
          revenueCentavos: thisWeekInv.reduce((s, i) => s + i.totalCentavos, 0),
          transactionCount: thisWeekInv.length,
          itemsSold: 0,
          avgTxnValueCentavos: thisWeekInv.length > 0
            ? Math.round(thisWeekInv.reduce((s, i) => s + i.totalCentavos, 0) / thisWeekInv.length)
            : 0,
        },
        lastWeek: {
          revenueCentavos: lastWeekInv.reduce((s, i) => s + i.totalCentavos, 0),
          transactionCount: lastWeekInv.length,
          itemsSold: 0,
          avgTxnValueCentavos: lastWeekInv.length > 0
            ? Math.round(lastWeekInv.reduce((s, i) => s + i.totalCentavos, 0) / lastWeekInv.length)
            : 0,
        },
        isWarehouse: true,
      };
    }

    // Retail: POS transactions
    const recentTxns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", lastWeekStart)
      )
      .collect();

    const thisWeekTxns = recentTxns.filter((t) => t.createdAt >= thisWeekStart);
    const lastWeekTxns = recentTxns.filter(
      (t) => t.createdAt >= lastWeekStart && t.createdAt < thisWeekStart
    );

    // Items sold via transactionItems join
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

    const [thisWeekItems, lastWeekItems] = await Promise.all([
      countItems(thisWeekTxns),
      countItems(lastWeekTxns),
    ]);

    const thisWeekRev = thisWeekTxns.reduce((s, t) => s + t.totalCentavos, 0);
    const lastWeekRev = lastWeekTxns.reduce((s, t) => s + t.totalCentavos, 0);

    return {
      thisWeek: {
        revenueCentavos: thisWeekRev,
        transactionCount: thisWeekTxns.length,
        itemsSold: thisWeekItems,
        avgTxnValueCentavos: thisWeekTxns.length > 0 ? Math.round(thisWeekRev / thisWeekTxns.length) : 0,
      },
      lastWeek: {
        revenueCentavos: lastWeekRev,
        transactionCount: lastWeekTxns.length,
        itemsSold: lastWeekItems,
        avgTxnValueCentavos: lastWeekTxns.length > 0 ? Math.round(lastWeekRev / lastWeekTxns.length) : 0,
      },
      isWarehouse: false,
    };
  },
});

// ─── getTopSellingProducts ────────────────────────────────────────────────────
// Top 5 products this week by revenue.

export const getTopSellingProducts = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const todayStart = getPHTDayStartMs();
    const weekStart = todayStart - 7 * DAY_MS;

    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", weekStart)
      )
      .collect();

    // Aggregate items by variant
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

    // Sort by revenue, take top 5
    const sorted = Array.from(variantAgg.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5);

    // Enrich with variant/style info
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
// Cash vs GCash vs Maya distribution over 7 days.

export const getPaymentMethodBreakdown = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const todayStart = getPHTDayStartMs();
    const weekStart = todayStart - 7 * DAY_MS;

    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", weekStart)
      )
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
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const todayStart = getPHTDayStartMs();
    const weekStart = todayStart - 7 * DAY_MS;

    // Sales velocity from transactions
    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", weekStart)
      )
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

    // Get inventory for current stock levels
    const inventory = await ctx.db
      .query("inventory")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();

    const inventoryMap = new Map<string, number>();
    for (const inv of inventory) {
      inventoryMap.set(inv.variantId as string, inv.quantity);
    }

    // Build velocity entries (only items that have either sales or stock)
    const allVariantIds = new Set([...variantSales.keys(), ...inventory.filter((i) => i.quantity > 0).map((i) => i.variantId as string)]);

    const entries: { variantId: string; totalSold: number; avgDaily: number; currentStock: number }[] = [];
    for (const vid of allVariantIds) {
      const totalSold = variantSales.get(vid) ?? 0;
      entries.push({
        variantId: vid,
        totalSold,
        avgDaily: Math.round((totalSold / 7) * 10) / 10,
        currentStock: inventoryMap.get(vid) ?? 0,
      });
    }

    // Fast movers: highest avgDaily
    const fastMovers = [...entries].sort((a, b) => b.avgDaily - a.avgDaily).slice(0, 5);
    // Slow movers: items with stock > 0 but lowest sales
    const slowMovers = entries
      .filter((e) => e.currentStock > 0)
      .sort((a, b) => a.avgDaily - b.avgDaily)
      .slice(0, 5);

    // Enrich with variant info
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
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const todayStart = getPHTDayStartMs();
    const weekStart = todayStart - 7 * DAY_MS;

    // Fetch demand logs for this branch in the last 7 days
    const demandLogs = await ctx.db
      .query("demandLogs")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();

    const recentLogs = demandLogs.filter((d) => d.createdAt >= weekStart);

    // Aggregate by brand + design + size
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

    // Get all inventory for this branch to check stock
    const inventory = await ctx.db
      .query("inventory")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();

    // Build variant→brand lookup for matching
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

    // Match demand with stock
    const gaps = Array.from(demandAgg.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((demand) => {
        // Find matching inventory items by brand name
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
// Average fulfillment time for incoming transfers.

export const getTransferEfficiency = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const branch = await ctx.db.get(branchId);
    const isWarehouse = branch?.type === "warehouse";

    // Warehouse: outgoing transfers; Retail: incoming transfers
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

    // Delivered in last 30 days
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

    // Pending counts
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
    // PHT Monday boundary: find the Monday of this week
    const nowPht = Date.now() + PHT_OFFSET_MS;
    const dayOfWeek = new Date(nowPht).getUTCDay(); // 0=Sun, 1=Mon...
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

    // Retail
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
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const todayStart = getPHTDayStartMs();
    const weekStart = todayStart - 7 * DAY_MS;

    const demandLogs = await ctx.db
      .query("demandLogs")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();

    const recentLogs = demandLogs.filter((d) => d.createdAt >= weekStart);

    // Aggregate by brand + design
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

    // Check inventory for each demanded brand
    const inventory = await ctx.db
      .query("inventory")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();

    // Build brand→stock lookup
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

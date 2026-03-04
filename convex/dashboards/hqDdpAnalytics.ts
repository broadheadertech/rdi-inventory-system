import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function getPHTDayStartMs(): number {
  const nowUtcMs = Date.now();
  const nowPhtMs = nowUtcMs + PHT_OFFSET_MS;
  const todayPhtStartMs = nowPhtMs - (nowPhtMs % DAY_MS);
  return todayPhtStartMs - PHT_OFFSET_MS;
}

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
// DESCRIPTIVE — What happened (whole business)
// ═══════════════════════════════════════════════════════════════════════════════

export const getHQSalesSummary = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const { startMs, endMs, durationMs } = resolvePeriod(args);
    const prevStartMs = startMs - durationMs;
    const prevEndMs = startMs;

    const branches = await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const retailBranches = branches.filter((b) => b.type !== "warehouse");

    // Fetch all transactions across retail branches for both periods
    const allTxns = (
      await Promise.all(
        retailBranches.map((branch) =>
          ctx.db
            .query("transactions")
            .withIndex("by_branch_date", (q) =>
              q.eq("branchId", branch._id).gte("createdAt", prevStartMs)
            )
            .collect()
        )
      )
    ).flat();

    const curTxns = allTxns.filter((t) => t.createdAt >= startMs && t.createdAt <= endMs);
    const prevTxns = allTxns.filter((t) => t.createdAt >= prevStartMs && t.createdAt < prevEndMs);

    async function countItems(txns: typeof allTxns): Promise<number> {
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
      branchCount: retailBranches.length,
    };
  },
});

// ─── Top Selling Products (all branches) ─────────────────────────────────────

export const getHQTopSellingProducts = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const { startMs, endMs } = resolvePeriod(args);

    const branches = await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const retailBranches = branches.filter((b) => b.type !== "warehouse");

    const allTxns = (
      await Promise.all(
        retailBranches.map((branch) =>
          ctx.db
            .query("transactions")
            .withIndex("by_branch_date", (q) =>
              q.eq("branchId", branch._id).gte("createdAt", startMs)
            )
            .filter((q) => q.lte(q.field("createdAt"), endMs))
            .collect()
        )
      )
    ).flat();

    const variantAgg = new Map<string, { qty: number; revenue: number }>();
    for (const txn of allTxns) {
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
      .slice(0, 10);

    return Promise.all(
      sorted.map(async ([variantId, agg]) => {
        const variant = await ctx.db.get(variantId as Id<"variants">);
        const style = variant ? await ctx.db.get(variant.styleId) : null;
        return {
          variantId,
          sku: variant?.sku ?? "",
          styleName: style?.name ?? "Unknown",
          size: variant?.size ?? "",
          color: variant?.color ?? "",
          totalQuantity: agg.qty,
          totalRevenueCentavos: agg.revenue,
        };
      })
    );
  },
});

// ─── Payment Method Breakdown (all branches) ─────────────────────────────────

export const getHQPaymentMethodBreakdown = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const { startMs, endMs } = resolvePeriod(args);

    const branches = await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const retailBranches = branches.filter((b) => b.type !== "warehouse");

    const allTxns = (
      await Promise.all(
        retailBranches.map((branch) =>
          ctx.db
            .query("transactions")
            .withIndex("by_branch_date", (q) =>
              q.eq("branchId", branch._id).gte("createdAt", startMs)
            )
            .filter((q) => q.lte(q.field("createdAt"), endMs))
            .collect()
        )
      )
    ).flat();

    const methods: Record<string, { count: number; revenueCentavos: number }> = {
      cash: { count: 0, revenueCentavos: 0 },
      gcash: { count: 0, revenueCentavos: 0 },
      maya: { count: 0, revenueCentavos: 0 },
    };

    for (const txn of allTxns) {
      const method = txn.paymentMethod;
      if (methods[method]) {
        methods[method].count += 1;
        methods[method].revenueCentavos += txn.totalCentavos;
      }
    }

    const totalRevenue = allTxns.reduce((s, t) => s + t.totalCentavos, 0);

    return Object.entries(methods).map(([method, data]) => ({
      method,
      count: data.count,
      revenueCentavos: data.revenueCentavos,
      percentage: totalRevenue > 0 ? Math.round((data.revenueCentavos / totalRevenue) * 100) : 0,
    }));
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC — Why it happened (whole business)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Product Velocity (all branches) ─────────────────────────────────────────

export const getHQProductVelocity = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const { startMs, endMs, durationDays } = resolvePeriod(args);

    const branches = await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const retailBranches = branches.filter((b) => b.type !== "warehouse");

    const allTxns = (
      await Promise.all(
        retailBranches.map((branch) =>
          ctx.db
            .query("transactions")
            .withIndex("by_branch_date", (q) =>
              q.eq("branchId", branch._id).gte("createdAt", startMs)
            )
            .filter((q) => q.lte(q.field("createdAt"), endMs))
            .collect()
        )
      )
    ).flat();

    const variantSales = new Map<string, number>();
    const variantSellDays = new Map<string, Set<number>>();
    for (const txn of allTxns) {
      const txnDay = Math.floor((txn.createdAt + PHT_OFFSET_MS) / DAY_MS);
      const items = await ctx.db
        .query("transactionItems")
        .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
        .collect();
      for (const item of items) {
        const key = item.variantId as string;
        variantSales.set(key, (variantSales.get(key) ?? 0) + item.quantity);
        if (!variantSellDays.has(key)) variantSellDays.set(key, new Set());
        variantSellDays.get(key)!.add(txnDay);
      }
    }

    // Aggregate inventory across all retail branches
    const allInventory = (
      await Promise.all(
        retailBranches.map((branch) =>
          ctx.db
            .query("inventory")
            .withIndex("by_branch", (q) => q.eq("branchId", branch._id))
            .collect()
        )
      )
    ).flat();

    const inventoryMap = new Map<string, number>();
    for (const inv of allInventory) {
      const key = inv.variantId as string;
      inventoryMap.set(key, (inventoryMap.get(key) ?? 0) + inv.quantity);
    }

    const allVariantIds = new Set([
      ...variantSales.keys(),
      ...Array.from(inventoryMap.entries())
        .filter(([, qty]) => qty > 0)
        .map(([vid]) => vid),
    ]);

    const entries: { variantId: string; totalSold: number; avgDaily: number; sellDays: number; currentStock: number }[] = [];
    for (const vid of allVariantIds) {
      const totalSold = variantSales.get(vid) ?? 0;
      entries.push({
        variantId: vid,
        totalSold,
        avgDaily: Math.round(totalSold / durationDays),
        sellDays: variantSellDays.get(vid)?.size ?? 0,
        currentStock: inventoryMap.get(vid) ?? 0,
      });
    }

    // Fast movers: must sell on ≥2 distinct days to filter out single-day spikes
    const fastMovers = [...entries]
      .filter((e) => e.sellDays >= 2)
      .sort((a, b) => b.avgDaily - a.avgDaily)
      .slice(0, 5);
    const slowMovers = entries
      .filter((e) => e.currentStock > 0)
      .sort((a, b) => a.avgDaily - b.avgDaily)
      .slice(0, 5);

    async function enrich(items: typeof fastMovers) {
      return Promise.all(
        items.map(async (item) => {
          const variant = await ctx.db.get(item.variantId as Id<"variants">);
          const style = variant ? await ctx.db.get(variant.styleId) : null;
          return {
            ...item,
            sku: variant?.sku ?? "",
            styleName: style?.name ?? "Unknown",
            size: variant?.size ?? "",
            color: variant?.color ?? "",
          };
        })
      );
    }

    return {
      fastMovers: await enrich(fastMovers),
      slowMovers: await enrich(slowMovers),
    };
  },
});

// ─── Demand Gap Analysis (all branches) ──────────────────────────────────────

export const getHQDemandGapAnalysis = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const { startMs, endMs } = resolvePeriod(args);

    // All demand logs across all branches
    const allDemandLogs = await ctx.db
      .query("demandLogs")
      .collect();

    const recentLogs = allDemandLogs.filter((d) => d.createdAt >= startMs && d.createdAt <= endMs);

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

    // Aggregate total stock across all branches per brand
    const branches = await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const allInventory = (
      await Promise.all(
        branches.map((branch) =>
          ctx.db
            .query("inventory")
            .withIndex("by_branch", (q) => q.eq("branchId", branch._id))
            .collect()
        )
      )
    ).flat();

    const brandStock = new Map<string, number>();
    for (const inv of allInventory) {
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

    const gaps = Array.from(demandAgg.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((demand) => {
        const totalStock = brandStock.get(demand.brand.toLowerCase()) ?? 0;
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

// ─── Transfer Efficiency (all transfers) ─────────────────────────────────────

export const getHQTransferEfficiency = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    const thirtyDaysAgo = Date.now() - 30 * DAY_MS;

    // All delivered transfers in last 30 days
    const allTransfers = await ctx.db
      .query("transfers")
      .order("desc")
      .collect();

    const delivered = allTransfers.filter(
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

    const pending = allTransfers.filter(
      (t) => t.status !== "delivered" && t.status !== "rejected" && t.status !== "cancelled"
    );

    return {
      avgFulfillmentHours,
      completedCount: delivered.length,
      pendingCount: pending.length,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// PREDICTIVE — What will happen (whole business)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Projected Weekly Revenue (all retail branches) ──────────────────────────

export const getHQProjectedRevenue = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    const todayStart = getPHTDayStartMs();
    const nowPht = Date.now() + PHT_OFFSET_MS;
    const dayOfWeek = new Date(nowPht).getUTCDay();
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const mondayStart = todayStart - daysSinceMonday * DAY_MS;
    const lastMondayStart = mondayStart - 7 * DAY_MS;

    const branches = await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const retailBranches = branches.filter((b) => b.type !== "warehouse");

    const allTxns = (
      await Promise.all(
        retailBranches.map((branch) =>
          ctx.db
            .query("transactions")
            .withIndex("by_branch_date", (q) =>
              q.eq("branchId", branch._id).gte("createdAt", lastMondayStart)
            )
            .collect()
        )
      )
    ).flat();

    const thisWeekTxns = allTxns.filter((t) => t.createdAt >= mondayStart);
    const lastWeekTxns = allTxns.filter(
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
      branchCount: retailBranches.length,
    };
  },
});

// ─── Restock Suggestions (all branches) ──────────────────────────────────────

export const getHQRestockSuggestions = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    const suggestions = await ctx.db
      .query("restockSuggestions")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    // Enrich with variant + branch info
    const branchCache = new Map<string, string>();

    const enriched = await Promise.all(
      suggestions.map(async (s) => {
        const variant = await ctx.db.get(s.variantId);
        const style = variant ? await ctx.db.get(variant.styleId) : null;

        let branchName = branchCache.get(s.branchId as string);
        if (!branchName) {
          const branch = await ctx.db.get(s.branchId);
          branchName = branch?.name ?? "Unknown";
          branchCache.set(s.branchId as string, branchName);
        }

        return {
          id: s._id as string,
          sku: variant?.sku ?? "",
          styleName: style?.name ?? "Unknown",
          size: variant?.size ?? "",
          color: variant?.color ?? "",
          branchName,
          suggestedQuantity: s.suggestedQuantity,
          currentStock: s.currentStock,
          avgDailyVelocity: s.avgDailyVelocity,
          daysUntilStockout: s.daysUntilStockout,
          incomingStock: s.incomingStock,
          confidence: s.confidence,
        };
      })
    );

    return enriched.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout).slice(0, 20);
  },
});

// ─── Demand Forecast (all branches) ──────────────────────────────────────────

export const getHQDemandForecast = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const { startMs, endMs } = resolvePeriod(args);

    const allDemandLogs = await ctx.db
      .query("demandLogs")
      .collect();

    const recentLogs = allDemandLogs.filter((d) => d.createdAt >= startMs && d.createdAt <= endMs);

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

    // Total stock per brand across all branches
    const branches = await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const allInventory = (
      await Promise.all(
        branches.map((branch) =>
          ctx.db
            .query("inventory")
            .withIndex("by_branch", (q) => q.eq("branchId", branch._id))
            .collect()
        )
      )
    ).flat();

    const brandStock = new Map<string, number>();
    for (const inv of allInventory) {
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
        isTrending: item.count >= 5,
        inStock: (brandStock.get(item.brand.toLowerCase()) ?? 0) > 0,
      }));

    return forecast;
  },
});


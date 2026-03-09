// convex/inventory/surgeDetection.ts — Detect real-time demand spikes for products

import { query } from "../_generated/server";
import { requireRole } from "../_helpers/permissions";
import type { Id } from "../_generated/dataModel";

const SURGE_THRESHOLD = 2; // 2x velocity increase
const MAX_RESULTS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 7;

export const getSurgeAlerts = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["admin", "manager", "warehouse_manager"]);

    const now = Date.now();
    const currentWeekStart = now - WINDOW_DAYS * MS_PER_DAY;
    const priorWeekStart = currentWeekStart - WINDOW_DAYS * MS_PER_DAY;

    // Fetch transactions from the last 14 days
    const recentTransactions = await ctx.db
      .query("transactions")
      .collect();

    // Filter to last 14 days
    const relevantTxns = recentTransactions.filter(
      (t) => t.createdAt >= priorWeekStart
    );

    // Build sets of transaction IDs for each period
    const currentWeekTxnIds = new Set<Id<"transactions">>();
    const priorWeekTxnIds = new Set<Id<"transactions">>();

    for (const txn of relevantTxns) {
      if (txn.createdAt >= currentWeekStart) {
        currentWeekTxnIds.add(txn._id);
      } else {
        priorWeekTxnIds.add(txn._id);
      }
    }

    // Fetch all transaction items for relevant transactions
    const allTransactionItems = await ctx.db
      .query("transactionItems")
      .collect();

    // Aggregate sales per variant per period
    const currentWeekSales = new Map<Id<"variants">, number>();
    const priorWeekSales = new Map<Id<"variants">, number>();

    for (const item of allTransactionItems) {
      if (currentWeekTxnIds.has(item.transactionId)) {
        currentWeekSales.set(
          item.variantId,
          (currentWeekSales.get(item.variantId) ?? 0) + item.quantity
        );
      } else if (priorWeekTxnIds.has(item.transactionId)) {
        priorWeekSales.set(
          item.variantId,
          (priorWeekSales.get(item.variantId) ?? 0) + item.quantity
        );
      }
    }

    // Find variants with surge (current velocity >= 2x prior velocity)
    const surgeVariantIds: Array<{
      variantId: Id<"variants">;
      currentWeekSales: number;
      priorWeekSales: number;
      velocityMultiplier: number;
    }> = [];

    for (const [variantId, currentSales] of currentWeekSales) {
      const priorSales = priorWeekSales.get(variantId) ?? 0;

      // Current velocity = currentSales / 7, prior velocity = priorSales / 7
      // Since both divide by the same period, just compare raw totals
      // If prior is 0 but current > 0, that's an infinite surge — cap it
      if (priorSales === 0 && currentSales > 0) {
        surgeVariantIds.push({
          variantId,
          currentWeekSales: currentSales,
          priorWeekSales: 0,
          velocityMultiplier: currentSales >= 3 ? 99 : currentSales * 10,
        });
      } else if (priorSales > 0) {
        const multiplier = currentSales / priorSales;
        if (multiplier >= SURGE_THRESHOLD) {
          surgeVariantIds.push({
            variantId,
            currentWeekSales: currentSales,
            priorWeekSales: priorSales,
            velocityMultiplier: Math.round(multiplier * 10) / 10,
          });
        }
      }
    }

    // Sort by velocity multiplier descending, take top 30
    surgeVariantIds.sort((a, b) => b.velocityMultiplier - a.velocityMultiplier);
    const topSurges = surgeVariantIds.slice(0, MAX_RESULTS);

    // Resolve details for each surge variant
    const styleCache = new Map<string, { name: string; categoryId: Id<"categories"> } | null>();
    const categoryCache = new Map<string, { brandId: Id<"brands"> } | null>();
    const brandCache = new Map<string, string>();

    const results: Array<{
      variantId: Id<"variants">;
      sku: string;
      styleName: string;
      brandName: string;
      size: string;
      color: string;
      currentWeekSales: number;
      priorWeekSales: number;
      velocityMultiplier: number;
      totalStock: number;
      daysOfStockLeft: number;
    }> = [];

    for (const surge of topSurges) {
      const variant = await ctx.db.get(surge.variantId);
      if (!variant || !variant.isActive) continue;

      // Resolve style
      let styleData = styleCache.get(variant.styleId);
      if (styleData === undefined) {
        const style = await ctx.db.get(variant.styleId);
        styleData =
          style && style.isActive
            ? { name: style.name, categoryId: style.categoryId }
            : null;
        styleCache.set(variant.styleId, styleData);
      }
      if (!styleData) continue;

      // Resolve brand via category
      let catData = categoryCache.get(styleData.categoryId);
      if (catData === undefined) {
        const category = await ctx.db.get(styleData.categoryId);
        catData =
          category && category.isActive ? { brandId: category.brandId } : null;
        categoryCache.set(styleData.categoryId, catData);
      }
      if (!catData) continue;

      let brandName = brandCache.get(catData.brandId);
      if (brandName === undefined) {
        const brand = await ctx.db.get(catData.brandId);
        brandName = brand?.name ?? "Unknown";
        brandCache.set(catData.brandId, brandName);
      }

      // Calculate total stock across all branches
      const inventoryRecords = await ctx.db
        .query("inventory")
        .withIndex("by_variant", (q) => q.eq("variantId", surge.variantId))
        .collect();

      const totalStock = inventoryRecords.reduce(
        (sum, inv) => sum + inv.quantity,
        0
      );

      // Days of stock left = totalStock / (currentWeekSales / 7)
      const dailyVelocity = surge.currentWeekSales / WINDOW_DAYS;
      const daysOfStockLeft =
        dailyVelocity > 0
          ? Math.round((totalStock / dailyVelocity) * 10) / 10
          : 9999;

      results.push({
        variantId: surge.variantId,
        sku: variant.sku,
        styleName: styleData.name,
        brandName,
        size: variant.size,
        color: variant.color,
        currentWeekSales: surge.currentWeekSales,
        priorWeekSales: surge.priorWeekSales,
        velocityMultiplier: surge.velocityMultiplier,
        totalStock,
        daysOfStockLeft,
      });
    }

    return results;
  },
});

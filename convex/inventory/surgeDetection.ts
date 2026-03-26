// convex/inventory/surgeDetection.ts — Detect real-time demand spikes for products
//
// NOW READS FROM variantDailySnapshots instead of scanning ALL transactions + transactionItems.
// Query count: ~2 (two date reads from snapshots) + ~30 enrichment for top results.
// Previously: 2 full table scans (transactions + transactionItems) = potentially millions of rows.

import { query } from "../_generated/server";
import { requireRole } from "../_helpers/permissions";
import { getAllVariantSnapshots, getPHTDate } from "../snapshots/readers";

const SURGE_THRESHOLD = 2; // 2x velocity increase
const MAX_RESULTS = 30;

export const getSurgeAlerts = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["admin", "manager", "warehouse_manager"]);

    // Get today's and last week's snapshots
    const todayDate = getPHTDate(0);
    const lastWeekDate = getPHTDate(7);

    const [currentSnaps, priorSnaps] = await Promise.all([
      getAllVariantSnapshots(ctx, todayDate),
      getAllVariantSnapshots(ctx, lastWeekDate),
    ]);

    // Build prior week sales map
    const priorSalesMap = new Map<string, number>();
    for (const snap of priorSnaps) {
      priorSalesMap.set(snap.variantId as string, snap.totalQtySold);
    }

    // Find variants with surge
    const surgeVariants: Array<{
      variantId: typeof currentSnaps[0]["variantId"];
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

    for (const snap of currentSnaps) {
      const currentSales = snap.totalQtySold;
      const priorSales = priorSalesMap.get(snap.variantId as string) ?? 0;

      let velocityMultiplier = 0;
      if (priorSales === 0 && currentSales > 0) {
        velocityMultiplier = currentSales >= 3 ? 99 : currentSales * 10;
      } else if (priorSales > 0) {
        velocityMultiplier = Math.round((currentSales / priorSales) * 10) / 10;
      }

      if (velocityMultiplier < SURGE_THRESHOLD) continue;

      const dailyVelocity = snap.avgDailyVelocity7d;
      const daysOfStockLeft = dailyVelocity > 0
        ? Math.round((snap.totalStock / dailyVelocity) * 10) / 10
        : snap.totalStock > 0 ? 9999 : 0;

      surgeVariants.push({
        variantId: snap.variantId,
        sku: snap.sku,
        styleName: snap.styleName,
        brandName: snap.brandName,
        size: snap.size,
        color: snap.color,
        currentWeekSales: currentSales,
        priorWeekSales: priorSales,
        velocityMultiplier,
        totalStock: snap.totalStock,
        daysOfStockLeft,
      });
    }

    // Sort by velocity multiplier descending, take top 30
    surgeVariants.sort((a, b) => b.velocityMultiplier - a.velocityMultiplier);
    return surgeVariants.slice(0, MAX_RESULTS);
  },
});

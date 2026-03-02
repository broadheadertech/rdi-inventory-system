// convex/ai/branchScoring.ts — Branch Performance Scoring Engine
//
// Calculates a composite performance score (0–100) for each branch based on:
// - Sales Volume (40%): revenue + transaction count relative to best branch
// - Stock Accuracy (35%): inverse of active low-stock alerts
// - Fulfillment Speed (25%): average transfer completion time

import { internalMutation, query } from "../_generated/server";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8
const DAY_MS = 24 * 60 * 60 * 1000;

// Scoring weights
const WEIGHT_SALES = 0.4;
const WEIGHT_STOCK_ACCURACY = 0.35;
const WEIGHT_FULFILLMENT = 0.25;

/** Returns "YYYY-MM-DD" in PHT for the given offset (0 = today, 1 = yesterday). */
function getPHTDateString(offsetDays: number = 0): string {
  const nowUtcMs = Date.now();
  const phtMs = nowUtcMs + PHT_OFFSET_MS;
  const dayMs = phtMs - offsetDays * DAY_MS;
  const date = new Date(dayMs);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Returns UTC ms for the start of a PHT calendar day (0 = today, 1 = yesterday). */
function getPHTDayStartMs(offsetDays: number = 0): number {
  const nowUtcMs = Date.now();
  const nowPhtMs = nowUtcMs + PHT_OFFSET_MS;
  const todayPhtStartMs = nowPhtMs - (nowPhtMs % DAY_MS);
  return todayPhtStartMs - PHT_OFFSET_MS - offsetDays * DAY_MS;
}

// ─── generateBranchScores ────────────────────────────────────────────────────
// Daily cron job: calculate per-branch scores for yesterday, store in branchScores.

export const generateBranchScores = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const period = getPHTDateString(1); // Score yesterday
    const dayStart = getPHTDayStartMs(1);
    const dayEnd = dayStart + DAY_MS;

    // Idempotency: skip if already generated for this period
    const existing = await ctx.db
      .query("branchScores")
      .withIndex("by_period", (q) => q.eq("period", period))
      .first();
    if (existing) return;

    const branches = (await ctx.db.query("branches").collect()).filter(
      (b) => b.isActive
    );

    // Collect raw metrics per branch
    const branchMetrics: Array<{
      branchId: (typeof branches)[0]["_id"];
      revenue: number;
      txnCount: number;
      alertCount: number;
      avgTransferHours: number;
    }> = [];

    for (const branch of branches) {
      // 1. Sales metrics for the period (precise index bounds — no client filter needed)
      const periodTxns = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q
            .eq("branchId", branch._id)
            .gte("createdAt", dayStart)
            .lt("createdAt", dayEnd)
        )
        .collect();
      const revenue = periodTxns.reduce(
        (sum, t) => sum + t.totalCentavos,
        0
      );

      // 2. Active low-stock alerts (fewer = better stock accuracy)
      const alerts = await ctx.db
        .query("lowStockAlerts")
        .withIndex("by_branch_status", (q) =>
          q.eq("branchId", branch._id).eq("status", "active")
        )
        .take(200);

      // 3. Transfer fulfillment speed — delivered transfers TO this branch in last 30 days
      const thirtyDaysAgo = now - 30 * DAY_MS;
      const recentTransfers = await ctx.db
        .query("transfers")
        .withIndex("by_to_branch", (q) => q.eq("toBranchId", branch._id))
        .order("desc")
        .take(100);
      const completed = recentTransfers.filter(
        (t) =>
          t.status === "delivered" &&
          t.deliveredAt &&
          t.deliveredAt >= thirtyDaysAgo
      );
      let avgTransferHours = 0;
      if (completed.length > 0) {
        const totalHours = completed.reduce((sum, t) => {
          const hours =
            ((t.deliveredAt ?? t.createdAt) - t.createdAt) / (1000 * 60 * 60);
          return sum + hours;
        }, 0);
        avgTransferHours =
          Math.round((totalHours / completed.length) * 10) / 10;
      }

      branchMetrics.push({
        branchId: branch._id,
        revenue,
        txnCount: periodTxns.length,
        alertCount: alerts.length,
        avgTransferHours,
      });
    }

    if (branchMetrics.length === 0) return;

    // Compute relative scores across branches
    const maxRevenue = Math.max(
      ...branchMetrics.map((b) => b.revenue),
      1
    );
    const maxTxnCount = Math.max(
      ...branchMetrics.map((b) => b.txnCount),
      1
    );

    for (const metrics of branchMetrics) {
      // Sales Volume Score (0-100): relative to best branch
      const revScore = (metrics.revenue / maxRevenue) * 100;
      const txnScore = (metrics.txnCount / maxTxnCount) * 100;
      const salesVolumeScore = Math.round(revScore * 0.5 + txnScore * 0.5);

      // Stock Accuracy Score (0-100): inverse of alert count
      const stockAccuracyScore = Math.max(
        0,
        Math.round(100 - metrics.alertCount * 15)
      );

      // Fulfillment Speed Score (0-100): based on avg transfer hours
      let fulfillmentSpeedScore: number;
      if (metrics.avgTransferHours === 0) {
        fulfillmentSpeedScore = 75; // No data — neutral score
      } else if (metrics.avgTransferHours <= 12) {
        fulfillmentSpeedScore = 100;
      } else if (metrics.avgTransferHours <= 24) {
        fulfillmentSpeedScore = 85;
      } else if (metrics.avgTransferHours <= 48) {
        fulfillmentSpeedScore = 70;
      } else if (metrics.avgTransferHours <= 72) {
        fulfillmentSpeedScore = 50;
      } else {
        fulfillmentSpeedScore = 30;
      }

      const compositeScore = Math.round(
        salesVolumeScore * WEIGHT_SALES +
          stockAccuracyScore * WEIGHT_STOCK_ACCURACY +
          fulfillmentSpeedScore * WEIGHT_FULFILLMENT
      );

      await ctx.db.insert("branchScores", {
        branchId: metrics.branchId,
        period,
        salesVolumeScore,
        stockAccuracyScore,
        fulfillmentSpeedScore,
        compositeScore,
        salesRevenueCentavos: metrics.revenue,
        salesTransactionCount: metrics.txnCount,
        activeAlertCount: metrics.alertCount,
        avgTransferHours: metrics.avgTransferHours,
        generatedAt: now,
      });
    }
  },
});

// ─── getLatestBranchScores ───────────────────────────────────────────────────
// HQ-only query returning latest scores with trend data for all active branches.

export const getLatestBranchScores = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    const branches = (await ctx.db.query("branches").collect()).filter(
      (b) => b.isActive
    );

    const yesterdayStr = getPHTDateString(1);
    const dayBeforeStr = getPHTDateString(2);

    const results = await Promise.all(
      branches.map(async (branch) => {
        // Latest score (yesterday)
        const currentScore = await ctx.db
          .query("branchScores")
          .withIndex("by_branch_period", (q) =>
            q.eq("branchId", branch._id).eq("period", yesterdayStr)
          )
          .unique();

        // Previous score (day before yesterday) for trend
        const previousScore = await ctx.db
          .query("branchScores")
          .withIndex("by_branch_period", (q) =>
            q.eq("branchId", branch._id).eq("period", dayBeforeStr)
          )
          .unique();

        return {
          branchId: branch._id,
          branchName: branch.name,
          compositeScore: currentScore?.compositeScore ?? null,
          salesVolumeScore: currentScore?.salesVolumeScore ?? null,
          stockAccuracyScore: currentScore?.stockAccuracyScore ?? null,
          fulfillmentSpeedScore: currentScore?.fulfillmentSpeedScore ?? null,
          previousCompositeScore: previousScore?.compositeScore ?? null,
          trendDirection:
            currentScore && previousScore
              ? currentScore.compositeScore > previousScore.compositeScore
                ? ("up" as const)
                : currentScore.compositeScore < previousScore.compositeScore
                  ? ("down" as const)
                  : ("flat" as const)
              : null,
          period: currentScore?.period ?? null,
        };
      })
    );

    // Sort by compositeScore descending (null scores at bottom)
    return results.sort(
      (a, b) => (b.compositeScore ?? -1) - (a.compositeScore ?? -1)
    );
  },
});

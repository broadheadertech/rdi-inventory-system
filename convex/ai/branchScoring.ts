// convex/ai/branchScoring.ts — Branch Performance Scoring Engine
//
// Calculates a composite performance score (0–100) for each branch based on:
// - Sales Volume (40%): revenue + transaction count relative to best branch
// - Stock Accuracy (35%): inverse of active low-stock alerts
// - Fulfillment Speed (25%): average transfer completion time
//
// NOW READS FROM branchDailySnapshots instead of scanning raw tables.

import { internalMutation, query } from "../_generated/server";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { getAllBranchSnapshots, getPHTDate } from "../snapshots/readers";

// Scoring weights
const WEIGHT_SALES = 0.4;
const WEIGHT_STOCK_ACCURACY = 0.35;
const WEIGHT_FULFILLMENT = 0.25;

// ─── generateBranchScores ────────────────────────────────────────────────────
// Daily cron job: reads yesterday's branch snapshot, calculates scores, stores in branchScores.
// Query count at 400 branches: ~2 (one for snapshots, one for idempotency check)
// Previously: ~1,201 queries

export const generateBranchScores = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const yesterdayDate = getPHTDate(1);

    // Idempotency: skip if already generated for this period
    const existing = await ctx.db
      .query("branchScores")
      .withIndex("by_period", (q) => q.eq("period", yesterdayDate))
      .first();
    if (existing) return;

    // Read all branch snapshots for yesterday — single indexed query
    const snapshots = await getAllBranchSnapshots(ctx, yesterdayDate);
    if (snapshots.length === 0) return;

    // Compute relative scores across branches
    const maxRevenue = Math.max(...snapshots.map((s) => s.salesTotalCentavos), 1);
    const maxTxnCount = Math.max(...snapshots.map((s) => s.salesTransactionCount), 1);

    for (const snap of snapshots) {
      // Sales Volume Score (0-100): relative to best branch
      const revScore = (snap.salesTotalCentavos / maxRevenue) * 100;
      const txnScore = (snap.salesTransactionCount / maxTxnCount) * 100;
      const salesVolumeScore = Math.round(revScore * 0.5 + txnScore * 0.5);

      // Stock Accuracy Score (0-100): inverse of alert count
      const stockAccuracyScore = Math.max(
        0,
        Math.round(100 - snap.activeAlertCount * 15)
      );

      // Fulfillment Speed Score (0-100): based on avg transfer hours from snapshot
      let fulfillmentSpeedScore: number;
      if (snap.avgFulfillmentHours === 0) {
        fulfillmentSpeedScore = 75; // No data — neutral score
      } else if (snap.avgFulfillmentHours <= 12) {
        fulfillmentSpeedScore = 100;
      } else if (snap.avgFulfillmentHours <= 24) {
        fulfillmentSpeedScore = 85;
      } else if (snap.avgFulfillmentHours <= 48) {
        fulfillmentSpeedScore = 70;
      } else if (snap.avgFulfillmentHours <= 72) {
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
        branchId: snap.branchId,
        period: yesterdayDate,
        salesVolumeScore,
        stockAccuracyScore,
        fulfillmentSpeedScore,
        compositeScore,
        salesRevenueCentavos: snap.salesTotalCentavos,
        salesTransactionCount: snap.salesTransactionCount,
        activeAlertCount: snap.activeAlertCount,
        avgTransferHours: snap.avgFulfillmentHours,
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

    const yesterdayStr = getPHTDate(1);
    const dayBeforeStr = getPHTDate(2);

    const results = await Promise.all(
      branches.map(async (branch) => {
        const currentScore = await ctx.db
          .query("branchScores")
          .withIndex("by_branch_period", (q) =>
            q.eq("branchId", branch._id).eq("period", yesterdayStr)
          )
          .unique();

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

    return results.sort(
      (a, b) => (b.compositeScore ?? -1) - (a.compositeScore ?? -1)
    );
  },
});

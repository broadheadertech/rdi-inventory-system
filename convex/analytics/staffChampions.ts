import { query } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { requireRole } from "../_helpers/permissions";

// ─── Staff Champion Badges ──────────────────────────────────────────────────
// Returns the top 10 staff members ranked by transaction count over the last
// 30 days.  Optionally scoped to a single branch.

export const getStaffChampions = query({
  args: {
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, { branchId }) => {
    await requireRole(ctx, ["admin", "manager"]);

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // 1. Collect recent transactions (optionally filtered by branch)
    let transactions;
    if (branchId) {
      transactions = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", branchId).gte("createdAt", thirtyDaysAgo)
        )
        .collect();
    } else {
      // No branch filter — grab all and post-filter by date
      transactions = await ctx.db
        .query("transactions")
        .collect();
      transactions = transactions.filter((t) => t.createdAt >= thirtyDaysAgo);
    }

    // 2. Group by cashierId → { count, revenue }
    const staffMap = new Map<
      string,
      { transactionCount: number; totalRevenueCentavos: number; branchId: Id<"branches"> }
    >();

    for (const txn of transactions) {
      const key = txn.cashierId as unknown as string;
      const existing = staffMap.get(key);
      if (existing) {
        existing.transactionCount += 1;
        existing.totalRevenueCentavos += txn.totalCentavos;
      } else {
        staffMap.set(key, {
          transactionCount: 1,
          totalRevenueCentavos: txn.totalCentavos,
          branchId: txn.branchId,
        });
      }
    }

    // 3. Sort by transaction count descending, take top 10
    const sorted = [...staffMap.entries()]
      .sort((a, b) => b[1].transactionCount - a[1].transactionCount)
      .slice(0, 10);

    // 4. Look up user names and branch names
    const results = await Promise.all(
      sorted.map(async ([userId, stats]) => {
        const user = await ctx.db.get(userId as unknown as Id<"users">);
        const branch = await ctx.db.get(stats.branchId);
        return {
          userId,
          userName: user?.name ?? "Unknown",
          transactionCount: stats.transactionCount,
          totalRevenue: stats.totalRevenueCentavos,
          branchName: branch?.name ?? "Unknown",
        };
      })
    );

    return results;
  },
});

import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── getDemandEntries ────────────────────────────────────────────────────────
// Paginated list of demand log entries across all branches, filterable by
// date range, branch, and brand. Enriched with branch/user names and trending flag.

export const getDemandEntries = query({
  args: {
    dateStart: v.number(),
    dateEnd: v.number(),
    branchId: v.optional(v.id("branches")),
    brand: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const allLogs = await ctx.db
      .query("demandLogs")
      .withIndex("by_date", (q) =>
        q.gte("createdAt", args.dateStart).lte("createdAt", args.dateEnd)
      )
      .order("desc")
      .collect();

    // Filter by branch/brand if specified
    let filtered = allLogs;
    if (args.branchId) {
      filtered = filtered.filter((l) => l.branchId === args.branchId);
    }
    if (args.brand) {
      const lower = args.brand.toLowerCase();
      filtered = filtered.filter((l) =>
        l.brand.toLowerCase().includes(lower)
      );
    }

    // Compute trending keys across ALL filtered entries (before take)
    const trendingMap = new Map<string, number>();
    for (const log of filtered) {
      const key = log.brand + "|" + (log.design ?? "");
      trendingMap.set(key, (trendingMap.get(key) ?? 0) + 1);
    }

    // Take limited set for display
    const page = filtered.slice(0, args.limit ?? 50);

    // Batch-fetch branch names
    const uniqueBranchIds = [...new Set(page.map((l) => l.branchId))];
    const branchDocs = await Promise.all(
      uniqueBranchIds.map((id) => ctx.db.get(id))
    );
    const branchNameMap = new Map<string, string>();
    uniqueBranchIds.forEach((id, i) => {
      const doc = branchDocs[i];
      if (doc) branchNameMap.set(id as string, doc.name);
    });

    // Batch-fetch user names
    const uniqueUserIds = [...new Set(page.map((l) => l.loggedById))];
    const userDocs = await Promise.all(
      uniqueUserIds.map((id) => ctx.db.get(id))
    );
    const userNameMap = new Map<string, string>();
    uniqueUserIds.forEach((id, i) => {
      const doc = userDocs[i];
      if (doc) userNameMap.set(id as string, doc.name);
    });

    return page.map((log) => {
      const key = log.brand + "|" + (log.design ?? "");
      return {
        _id: log._id,
        brand: log.brand,
        design: log.design,
        size: log.size,
        notes: log.notes,
        createdAt: log.createdAt,
        branchName: branchNameMap.get(log.branchId as string) ?? "Unknown",
        loggedByName: userNameMap.get(log.loggedById as string) ?? "Unknown",
        isTrending: (trendingMap.get(key) ?? 0) >= 3,
      };
    });
  },
});

// ─── getDemandMetrics ────────────────────────────────────────────────────────
// Aggregate metrics for the metric cards row.

export const getDemandMetrics = query({
  args: { dateStart: v.number(), dateEnd: v.number() },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const logs = await ctx.db
      .query("demandLogs")
      .withIndex("by_date", (q) =>
        q.gte("createdAt", args.dateStart).lte("createdAt", args.dateEnd)
      )
      .collect();

    if (logs.length === 0) {
      return {
        totalEntries: 0,
        uniqueBrands: 0,
        topBrand: null,
        trendingCount: 0,
      };
    }

    // Count by brand
    const brandCounts = new Map<string, number>();
    const trendingKeys = new Map<string, number>();

    for (const log of logs) {
      brandCounts.set(log.brand, (brandCounts.get(log.brand) ?? 0) + 1);
      const key = log.brand + "|" + (log.design ?? "");
      trendingKeys.set(key, (trendingKeys.get(key) ?? 0) + 1);
    }

    // Top brand
    let topBrand: string | null = null;
    let topBrandCount = 0;
    for (const [brand, count] of brandCounts) {
      if (count > topBrandCount) {
        topBrand = brand;
        topBrandCount = count;
      }
    }

    // Trending count: unique combos with 3+ occurrences
    let trendingCount = 0;
    for (const count of trendingKeys.values()) {
      if (count >= 3) trendingCount++;
    }

    return {
      totalEntries: logs.length,
      uniqueBrands: brandCounts.size,
      topBrand: topBrand ? { brand: topBrand, count: topBrandCount } : null,
      trendingCount,
    };
  },
});

// ─── getTopDemandedBrands ────────────────────────────────────────────────────
// Top N brands by demand count for Recharts BarChart.

export const getTopDemandedBrands = query({
  args: {
    dateStart: v.number(),
    dateEnd: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const logs = await ctx.db
      .query("demandLogs")
      .withIndex("by_date", (q) =>
        q.gte("createdAt", args.dateStart).lte("createdAt", args.dateEnd)
      )
      .collect();

    const brandCounts = new Map<string, number>();
    for (const log of logs) {
      brandCounts.set(log.brand, (brandCounts.get(log.brand) ?? 0) + 1);
    }

    return [...brandCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, args.limit ?? 10)
      .map(([brand, count]) => ({ brand, count }));
  },
});

// ─── getDemandTrendByDay ─────────────────────────────────────────────────────
// Daily demand counts bucketed by PHT calendar day for Recharts LineChart.

export const getDemandTrendByDay = query({
  args: { dateStart: v.number(), dateEnd: v.number() },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const logs = await ctx.db
      .query("demandLogs")
      .withIndex("by_date", (q) =>
        q.gte("createdAt", args.dateStart).lte("createdAt", args.dateEnd)
      )
      .collect();

    // Bucket by PHT calendar day
    const dayCounts = new Map<string, number>();
    for (const log of logs) {
      const phtMs = log.createdAt + PHT_OFFSET_MS;
      const dayMs = phtMs - (phtMs % DAY_MS);
      const d = new Date(dayMs);
      const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      dayCounts.set(label, (dayCounts.get(label) ?? 0) + 1);
    }

    return [...dayCounts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));
  },
});

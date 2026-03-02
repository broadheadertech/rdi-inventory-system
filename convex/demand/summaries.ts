import { internalMutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import type { Id } from "../_generated/dataModel";

// ─── PHT helpers ─────────────────────────────────────────────────────────────

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8
const DAY_MS = 24 * 60 * 60 * 1000;

/** Returns the UTC ms timestamp for the most recent Monday 00:00 PHT. */
function getPreviousWeekBoundary(): { weekStart: number; weekEnd: number } {
  const nowPht = Date.now() + PHT_OFFSET_MS;
  // Floor to today midnight PHT
  const todayPhtMs = nowPht - (nowPht % DAY_MS);
  // Day of week in PHT (0=Sun..6=Sat)
  const dayOfWeek = new Date(todayPhtMs - PHT_OFFSET_MS).getUTCDay();
  // Monday of THIS week (current or most recent Monday)
  const daysToMonday = ((dayOfWeek + 6) % 7); // Mon=0, Tue=1, ..., Sun=6
  const thisMondayPht = todayPhtMs - daysToMonday * DAY_MS;
  // PREVIOUS week: Monday → Sunday
  const prevMondayPht = thisMondayPht - 7 * DAY_MS;
  const prevSundayEndPht = thisMondayPht - 1; // 1ms before this Monday

  return {
    weekStart: prevMondayPht - PHT_OFFSET_MS,   // Convert to UTC ms
    weekEnd: prevSundayEndPht - PHT_OFFSET_MS,   // Convert to UTC ms
  };
}

// ─── generateWeeklySummary ───────────────────────────────────────────────────
// Called by cron every Monday 6 AM PHT (Sunday 22:00 UTC).
// Aggregates the PREVIOUS week's demand logs into per-brand summary rows.

export const generateWeeklySummary = internalMutation({
  args: {},
  handler: async (ctx) => {
    const { weekStart, weekEnd } = getPreviousWeekBoundary();

    // Check idempotency — skip if this week already generated
    const existing = await ctx.db
      .query("demandWeeklySummaries")
      .withIndex("by_week", (q) => q.eq("weekStart", weekStart))
      .first();
    if (existing) return; // Already generated for this week

    // Fetch all demand logs in the previous week
    const logs = await ctx.db
      .query("demandLogs")
      .withIndex("by_date", (q) =>
        q.gte("createdAt", weekStart).lte("createdAt", weekEnd)
      )
      .collect();

    if (logs.length === 0) return; // No demand data for this week

    // Aggregate by brand
    const brandMap = new Map<
      string,
      {
        count: number;
        designs: Map<string, number>;
        sizes: Map<string, number>;
        branches: Map<string, number>;
      }
    >();

    for (const log of logs) {
      let entry = brandMap.get(log.brand);
      if (!entry) {
        entry = {
          count: 0,
          designs: new Map(),
          sizes: new Map(),
          branches: new Map(),
        };
        brandMap.set(log.brand, entry);
      }
      entry.count++;
      if (log.design) {
        entry.designs.set(log.design, (entry.designs.get(log.design) ?? 0) + 1);
      }
      if (log.size) {
        entry.sizes.set(log.size, (entry.sizes.get(log.size) ?? 0) + 1);
      }
      const branchKey = log.branchId as string;
      entry.branches.set(branchKey, (entry.branches.get(branchKey) ?? 0) + 1);
    }

    // Insert one row per brand
    const now = Date.now();
    for (const [brand, data] of brandMap) {
      const topDesigns = [...data.designs.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([design, count]) => ({ design, count }));

      const topSizes = [...data.sizes.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([size, count]) => ({ size, count }));

      const branchBreakdown = [...data.branches.entries()].map(
        ([branchId, count]) => ({
          branchId: branchId as Id<"branches">,
          count,
        })
      );

      await ctx.db.insert("demandWeeklySummaries", {
        weekStart,
        brand,
        requestCount: data.count,
        topDesigns,
        topSizes,
        branchBreakdown,
        generatedAt: now,
      });
    }
  },
});

// ─── getWeeklySummaries ──────────────────────────────────────────────────────
// Returns N weeks of demand summary data grouped by week for Recharts trend lines.

export const getWeeklySummaries = query({
  args: { weeks: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const maxWeeks = args.weeks ?? 8;
    const summaries = await ctx.db
      .query("demandWeeklySummaries")
      .withIndex("by_week")
      .order("desc")
      .collect();

    // Group by weekStart to identify distinct weeks
    const weekSet = new Set<number>();
    const filtered: typeof summaries = [];
    for (const s of summaries) {
      weekSet.add(s.weekStart);
      if (weekSet.size > maxWeeks) break;
      filtered.push(s);
    }

    // Group by week for Recharts consumption
    const weekMap = new Map<
      number,
      { weekStart: number; weekLabel: string; brands: { brand: string; count: number }[] }
    >();
    for (const s of filtered) {
      let week = weekMap.get(s.weekStart);
      if (!week) {
        const d = new Date(s.weekStart + PHT_OFFSET_MS);
        const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
        week = { weekStart: s.weekStart, weekLabel: label, brands: [] };
        weekMap.set(s.weekStart, week);
      }
      week.brands.push({ brand: s.brand, count: s.requestCount });
    }

    return [...weekMap.values()].sort((a, b) => a.weekStart - b.weekStart);
  },
});

// ─── getLatestWeekTopBrands ──────────────────────────────────────────────────
// Returns the top N brands from the most recent weekly summary.

export const getLatestWeekTopBrands = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const maxBrands = args.limit ?? 10;

    // Get the most recent weekStart
    const latest = await ctx.db
      .query("demandWeeklySummaries")
      .withIndex("by_week")
      .order("desc")
      .first();
    if (!latest) return { weekLabel: null, brands: [] };

    // Fetch all summaries for that week
    const weekSummaries = await ctx.db
      .query("demandWeeklySummaries")
      .withIndex("by_week", (q) => q.eq("weekStart", latest.weekStart))
      .collect();

    const sorted = weekSummaries
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, maxBrands);

    const d = new Date(latest.weekStart + PHT_OFFSET_MS);
    const weekLabel = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

    return {
      weekLabel,
      brands: sorted.map((s) => ({
        brand: s.brand,
        count: s.requestCount,
        topDesigns: s.topDesigns,
        topSizes: s.topSizes,
        branchBreakdown: s.branchBreakdown,
      })),
    };
  },
});

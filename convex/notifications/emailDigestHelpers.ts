// convex/notifications/emailDigestHelpers.ts
// Internal queries used by email digest actions. No "use node" — runs in Convex V8 runtime.

import { internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

// ─── Staff email recipients (admin, manager, hqStaff) ───────────────────────

export const _getManagementRecipients = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users
      .filter(
        (u) =>
          u.isActive &&
          ["admin", "manager", "hqStaff"].includes(u.role) &&
          u.email
      )
      .map((u) => ({ name: u.name, email: u.email! }));
  },
});

// ─── Branch-specific staff recipients ────────────────────────────────────────

export const _getBranchStaffRecipients = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users
      .filter(
        (u) =>
          u.isActive &&
          ["manager", "warehouseStaff", "branchStaff"].includes(u.role) &&
          u.email &&
          u.branchId
      )
      .map((u) => ({
        name: u.name,
        email: u.email!,
        branchId: u.branchId as Id<"branches">,
      }));
  },
});

// ─── Low Stock: active alerts grouped by branch ──────────────────────────────

export const _getLowStockDigestData = internalQuery({
  args: {},
  handler: async (ctx) => {
    const alerts = await ctx.db
      .query("lowStockAlerts")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    if (alerts.length === 0) return null;

    // Enrich with branch name + variant info
    const branchCache = new Map<string, string>();
    const variantCache = new Map<
      string,
      { sku: string; styleName: string; size: string; color: string }
    >();

    const enriched = [];
    for (const alert of alerts) {
      // Branch name
      let branchName = branchCache.get(alert.branchId as string);
      if (!branchName) {
        const branch = await ctx.db.get(alert.branchId);
        branchName = branch?.isActive ? branch.name : "(inactive)";
        branchCache.set(alert.branchId as string, branchName);
      }

      // Variant info
      let variantInfo = variantCache.get(alert.variantId as string);
      if (!variantInfo) {
        const variant = await ctx.db.get(alert.variantId);
        const style = variant ? await ctx.db.get(variant.styleId) : null;
        variantInfo = {
          sku: variant?.sku ?? "",
          styleName: style?.name ?? "Unknown",
          size: variant?.size ?? "",
          color: variant?.color ?? "",
        };
        variantCache.set(alert.variantId as string, variantInfo);
      }

      enriched.push({
        branchId: alert.branchId as string,
        branchName,
        ...variantInfo,
        quantity: alert.quantity,
        threshold: alert.threshold,
      });
    }

    // Group by branch
    const byBranch = new Map<
      string,
      {
        branchName: string;
        items: Array<{
          sku: string;
          styleName: string;
          size: string;
          color: string;
          quantity: number;
          threshold: number;
        }>;
      }
    >();
    for (const item of enriched) {
      let group = byBranch.get(item.branchId);
      if (!group) {
        group = { branchName: item.branchName, items: [] };
        byBranch.set(item.branchId, group);
      }
      group.items.push({
        sku: item.sku,
        styleName: item.styleName,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        threshold: item.threshold,
      });
    }

    return {
      totalAlerts: alerts.length,
      branchCount: byBranch.size,
      branches: [...byBranch.entries()].map(([branchId, data]) => ({
        branchId,
        branchName: data.branchName,
        alertCount: data.items.length,
        items: data.items.sort((a, b) => a.quantity - b.quantity).slice(0, 10),
      })),
    };
  },
});

// ─── Restock Suggestions: active suggestions ────────────────────────────────

export const _getRestockDigestData = internalQuery({
  args: {},
  handler: async (ctx) => {
    const suggestions = await ctx.db
      .query("restockSuggestions")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    if (suggestions.length === 0) return null;

    const branchCache = new Map<string, string>();
    const variantCache = new Map<
      string,
      { sku: string; styleName: string; size: string; color: string }
    >();

    const enriched = [];
    for (const s of suggestions) {
      let branchName = branchCache.get(s.branchId as string);
      if (!branchName) {
        const branch = await ctx.db.get(s.branchId);
        branchName = branch?.isActive ? branch.name : "(inactive)";
        branchCache.set(s.branchId as string, branchName);
      }

      let variantInfo = variantCache.get(s.variantId as string);
      if (!variantInfo) {
        const variant = await ctx.db.get(s.variantId);
        const style = variant ? await ctx.db.get(variant.styleId) : null;
        variantInfo = {
          sku: variant?.sku ?? "",
          styleName: style?.name ?? "Unknown",
          size: variant?.size ?? "",
          color: variant?.color ?? "",
        };
        variantCache.set(s.variantId as string, variantInfo);
      }

      enriched.push({
        branchName,
        ...variantInfo,
        suggestedQuantity: s.suggestedQuantity,
        currentStock: s.currentStock,
        daysUntilStockout: s.daysUntilStockout,
        confidence: s.confidence,
        rationale: s.rationale,
      });
    }

    // Sort by urgency
    enriched.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);

    const highCount = enriched.filter((s) => s.confidence === "high").length;
    const mediumCount = enriched.filter((s) => s.confidence === "medium").length;

    return {
      totalSuggestions: enriched.length,
      highConfidence: highCount,
      mediumConfidence: mediumCount,
      lowConfidence: enriched.length - highCount - mediumCount,
      items: enriched.slice(0, 20), // Top 20 most urgent
    };
  },
});

// ─── Demand Weekly Summary: latest week data ─────────────────────────────────

export const _getDemandDigestData = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Get the most recent weekStart
    const latest = await ctx.db
      .query("demandWeeklySummaries")
      .withIndex("by_week")
      .order("desc")
      .first();
    if (!latest) return null;

    const weekSummaries = await ctx.db
      .query("demandWeeklySummaries")
      .withIndex("by_week", (q) => q.eq("weekStart", latest.weekStart))
      .collect();

    if (weekSummaries.length === 0) return null;

    const sorted = weekSummaries.sort(
      (a, b) => b.requestCount - a.requestCount
    );
    const totalRequests = sorted.reduce((s, r) => s + r.requestCount, 0);

    // Resolve branch names for top brand breakdowns
    const branchCache = new Map<string, string>();
    async function getBranchName(branchId: string): Promise<string> {
      let name = branchCache.get(branchId);
      if (!name) {
        const branch = await ctx.db.get(branchId as Id<"branches">);
        name = branch?.isActive ? branch.name : "(inactive)";
        branchCache.set(branchId, name);
      }
      return name;
    }

    const topBrands = [];
    for (const s of sorted.slice(0, 10)) {
      const branchBreakdown = [];
      for (const bb of (s.branchBreakdown ?? []).slice(0, 5)) {
        const bName = await getBranchName(bb.branchId as string);
        branchBreakdown.push({ branchName: bName, count: bb.count });
      }
      topBrands.push({
        brand: s.brand,
        requestCount: s.requestCount,
        topDesigns: s.topDesigns?.slice(0, 3) ?? [],
        topSizes: s.topSizes?.slice(0, 5) ?? [],
        branchBreakdown,
      });
    }

    const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
    const d = new Date(latest.weekStart + PHT_OFFSET_MS);
    const weekLabel = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

    return {
      weekLabel,
      totalRequests,
      totalBrands: sorted.length,
      topBrands,
    };
  },
});

// ─── Branch Scores: latest scores ────────────────────────────────────────────

export const _getBranchScoresDigestData = internalQuery({
  args: {},
  handler: async (ctx) => {
    const branches = (await ctx.db.query("branches").collect()).filter(
      (b) => b.isActive
    );

    if (branches.length === 0) return null;

    // Get yesterday's date in PHT
    const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const nowPht = Date.now() + PHT_OFFSET_MS;
    const todayPhtMs = nowPht - (nowPht % DAY_MS);
    const yesterdayPhtMs = todayPhtMs - DAY_MS;
    const yesterdayDate = new Date(yesterdayPhtMs);
    const period = `${yesterdayDate.getUTCFullYear()}-${String(yesterdayDate.getUTCMonth() + 1).padStart(2, "0")}-${String(yesterdayDate.getUTCDate()).padStart(2, "0")}`;

    const scores = [];
    for (const branch of branches) {
      const score = await ctx.db
        .query("branchScores")
        .withIndex("by_branch_period", (q) =>
          q.eq("branchId", branch._id).eq("period", period)
        )
        .unique();

      if (score) {
        scores.push({
          branchName: branch.name,
          compositeScore: score.compositeScore,
          salesVolumeScore: score.salesVolumeScore,
          stockAccuracyScore: score.stockAccuracyScore,
          fulfillmentSpeedScore: score.fulfillmentSpeedScore,
          activeAlertCount: score.activeAlertCount,
          avgTransferHours: score.avgTransferHours,
        });
      }
    }

    if (scores.length === 0) return null;

    scores.sort((a, b) => b.compositeScore - a.compositeScore);

    const avgScore =
      Math.round(
        (scores.reduce((s, r) => s + r.compositeScore, 0) / scores.length) * 10
      ) / 10;

    const underperforming = scores.filter((s) => s.compositeScore < 50);

    return {
      period,
      branchCount: scores.length,
      averageScore: avgScore,
      underperformingCount: underperforming.length,
      scores,
    };
  },
});

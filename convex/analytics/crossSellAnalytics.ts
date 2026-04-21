import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { withBranchScope } from "../_helpers/withBranchScope";
import { requireRole } from "../_helpers/permissions";
import type { Id } from "../_generated/dataModel";

const MANAGER_ROLES = ["admin", "manager"] as const;
const POS_ROLES = ["admin", "manager", "cashier"] as const;

// ─── logAcceptance ────────────────────────────────────────────────────────────
// Called by CrossSellStrip when a cashier adds a suggestion to the cart.

export const logAcceptance = mutation({
  args: {
    suggestedVariantId: v.id("variants"),
    cartVariantIds: v.array(v.id("variants")),
    priceCentavos: v.number(),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) return;
    if (!scope.branchId) return;

    await ctx.db.insert("crossSellEvents", {
      branchId: scope.branchId,
      suggestedVariantId: args.suggestedVariantId,
      cartVariantIds: args.cartVariantIds,
      priceCentavos: args.priceCentavos,
      createdAt: Date.now(),
    });
  },
});

// ─── getCrossSellAnalytics ────────────────────────────────────────────────────
// Returns aggregated cross-sell stats for a given date range.
// Admin: can pass branchId to filter, or omit for all branches.
// Manager/viewer: auto-scoped to their branch.

export const getCrossSellAnalytics = query({
  args: {
    branchId: v.optional(v.id("branches")),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, MANAGER_ROLES);

    let events;

    if (user.role === "admin" && !args.branchId) {
      // All branches
      events = await ctx.db
        .query("crossSellEvents")
        .withIndex("by_date", (q) =>
          q.gte("createdAt", args.startDate).lte("createdAt", args.endDate)
        )
        .collect();
    } else {
      // Scoped to a specific branch
      const scopedBranchId = args.branchId ?? (await withBranchScope(ctx)).branchId;
      if (!scopedBranchId) return emptyResult();

      events = await ctx.db
        .query("crossSellEvents")
        .withIndex("by_branch_date", (q) =>
          q
            .eq("branchId", scopedBranchId)
            .gte("createdAt", args.startDate)
            .lte("createdAt", args.endDate)
        )
        .collect();
    }

    if (events.length === 0) return emptyResult();

    // Aggregate totals
    const totalAccepted = events.length;
    const totalRevenueCentavos = events.reduce((s, e) => s + e.priceCentavos, 0);

    // Count by suggested variant
    const variantCount = new Map<string, { count: number; revenueCentavos: number }>();
    for (const e of events) {
      const vid = String(e.suggestedVariantId);
      const existing = variantCount.get(vid) ?? { count: 0, revenueCentavos: 0 };
      variantCount.set(vid, {
        count: existing.count + 1,
        revenueCentavos: existing.revenueCentavos + e.priceCentavos,
      });
    }

    // Count trigger→suggestion pairs  (use first cart item as primary trigger)
    const pairCount = new Map<string, number>();
    for (const e of events) {
      for (const cartVid of e.cartVariantIds) {
        const key = `${String(cartVid)}→${String(e.suggestedVariantId)}`;
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }

    // Top 10 accepted suggestions
    const topVariantIds = [...variantCount.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    const topSuggestions = await Promise.all(
      topVariantIds.map(async ([vidStr, stats]) => {
        const variant = await ctx.db.get(vidStr as Id<"variants">);
        const style = variant ? await ctx.db.get(variant.styleId) : null;
        return {
          variantId: vidStr,
          styleName: style?.name ?? "Unknown",
          size: variant?.size ?? "",
          color: variant?.color ?? "",
          acceptedCount: stats.count,
          revenueCentavos: stats.revenueCentavos,
        };
      })
    );

    // Top 10 pairs
    const topPairEntries = [...pairCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const topPairs = await Promise.all(
      topPairEntries.map(async ([key, count]) => {
        const [cartVidStr, sugVidStr] = key.split("→");
        const [cartVariant, sugVariant] = await Promise.all([
          ctx.db.get(cartVidStr as Id<"variants">),
          ctx.db.get(sugVidStr as Id<"variants">),
        ]);
        const [cartStyle, sugStyle] = await Promise.all([
          cartVariant ? ctx.db.get(cartVariant.styleId) : null,
          sugVariant ? ctx.db.get(sugVariant.styleId) : null,
        ]);
        return {
          triggerName: cartStyle?.name ?? "Unknown",
          triggerVariant: `${cartVariant?.size ?? ""} · ${cartVariant?.color ?? ""}`,
          suggestedName: sugStyle?.name ?? "Unknown",
          suggestedVariant: `${sugVariant?.size ?? ""} · ${sugVariant?.color ?? ""}`,
          count,
        };
      })
    );

    // Unique accepted pairs count
    const uniquePairs = new Set(
      events.map((e) => String(e.suggestedVariantId))
    ).size;

    return {
      totalAccepted,
      totalRevenueCentavos,
      uniqueSuggestions: uniquePairs,
      topSuggestions,
      topPairs,
    };
  },
});

function emptyResult() {
  return {
    totalAccepted: 0,
    totalRevenueCentavos: 0,
    uniqueSuggestions: 0,
    topSuggestions: [] as {
      variantId: string;
      styleName: string;
      size: string;
      color: string;
      acceptedCount: number;
      revenueCentavos: number;
    }[],
    topPairs: [] as {
      triggerName: string;
      triggerVariant: string;
      suggestedName: string;
      suggestedVariant: string;
      count: number;
    }[],
  };
}

// ─── listBranchesForFilter ────────────────────────────────────────────────────
// Admin-only: returns branches for the branch filter dropdown.

export const listBranchesForFilter = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["admin"] as const);
    const branches = await ctx.db
      .query("branches")
      .filter((q) => q.neq(q.field("channel"), "warehouse"))
      .collect();
    return branches.map((b) => ({ _id: b._id, name: b.name }));
  },
});

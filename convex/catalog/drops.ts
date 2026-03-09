import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { requireRole } from "../_helpers/permissions";

const ADMIN_ROLES = ["admin"] as const;

// ─── Public: Upcoming Exclusive Drops ────────────────────────────────────────
export const getUpcomingDrops = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const styles = await ctx.db.query("styles").collect();
    const upcoming = styles.filter(
      (s) => s.isExclusive === true && s.dropDate != null && s.dropDate > now
    );

    const results = [];
    for (const style of upcoming) {
      const category = await ctx.db.get(style.categoryId);
      const brand = category ? await ctx.db.get(category.brandId) : null;

      const exclusiveBranchNames: string[] = [];
      if (style.exclusiveBranchIds) {
        for (const bId of style.exclusiveBranchIds) {
          const branch = await ctx.db.get(bId);
          if (branch) exclusiveBranchNames.push(branch.name);
        }
      }

      results.push({
        styleId: style._id,
        name: style.name,
        brandName: brand?.name ?? "Unknown",
        dropDate: style.dropDate!,
        exclusiveBranchNames,
      });
    }

    return results.sort((a, b) => a.dropDate - b.dropDate);
  },
});

export const listExclusiveDrops = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, [...ADMIN_ROLES]);

    const styles = await ctx.db.query("styles").collect();
    const exclusiveStyles = styles.filter((s) => s.isExclusive === true);

    const results = [];
    for (const style of exclusiveStyles) {
      const category = await ctx.db.get(style.categoryId);
      const brand = category ? await ctx.db.get(category.brandId) : null;

      // Resolve exclusive branch names
      const branchNames: string[] = [];
      if (style.exclusiveBranchIds) {
        for (const bId of style.exclusiveBranchIds) {
          const branch = await ctx.db.get(bId);
          if (branch) branchNames.push(branch.name);
        }
      }

      results.push({
        _id: style._id,
        name: style.name,
        brandName: brand?.name ?? "Unknown",
        categoryName: category?.name ?? "Unknown",
        priceCentavos: style.basePriceCentavos,
        exclusiveBranchIds: style.exclusiveBranchIds ?? [],
        exclusiveBranchNames: branchNames,
        isActive: style.isActive,
        createdAt: style.createdAt,
      });
    }

    return results.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const toggleExclusive = mutation({
  args: {
    styleId: v.id("styles"),
    isExclusive: v.boolean(),
    exclusiveBranchIds: v.optional(v.array(v.id("branches"))),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [...ADMIN_ROLES]);

    await ctx.db.patch(args.styleId, {
      isExclusive: args.isExclusive,
      exclusiveBranchIds: args.exclusiveBranchIds ?? [],
      updatedAt: Date.now(),
    });
  },
});

export const searchStyles = query({
  args: { search: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, [...ADMIN_ROLES]);

    if (!args.search.trim()) return [];

    const term = args.search.toLowerCase();
    const styles = await ctx.db.query("styles").collect();
    const matches = styles
      .filter((s) => s.name.toLowerCase().includes(term))
      .slice(0, 20);

    const results = [];
    for (const style of matches) {
      const category = await ctx.db.get(style.categoryId);
      const brand = category ? await ctx.db.get(category.brandId) : null;
      results.push({
        _id: style._id,
        name: style.name,
        brandName: brand?.name ?? "Unknown",
        isExclusive: style.isExclusive ?? false,
      });
    }

    return results;
  },
});

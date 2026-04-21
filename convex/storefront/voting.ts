import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

// ─── Vote for a product ──────────────────────────────────────────────────────

export const voteForProduct = mutation({
  args: { styleId: v.id("styles") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("You must be logged in to vote.");

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!customer) throw new Error("Customer account not found.");

    // Prevent duplicate votes
    const existing = await ctx.db
      .query("productVotes")
      .withIndex("by_customer_style", (q) =>
        q.eq("customerId", customer._id).eq("styleId", args.styleId)
      )
      .unique();

    if (existing) {
      throw new Error("You have already voted for this product.");
    }

    await ctx.db.insert("productVotes", {
      styleId: args.styleId,
      customerId: customer._id,
      votedAt: Date.now(),
    });
  },
});

// ─── Get vote count for a style ──────────────────────────────────────────────

export const getVoteCount = query({
  args: { styleId: v.id("styles") },
  handler: async (ctx, args) => {
    const votes = await ctx.db
      .query("productVotes")
      .withIndex("by_style", (q) => q.eq("styleId", args.styleId))
      .collect();

    const count = votes.length;

    // Check if current user has voted
    let hasVoted = false;
    const identity = await ctx.auth.getUserIdentity();
    if (identity) {
      const customer = await ctx.db
        .query("customers")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
        .unique();
      if (customer) {
        const existing = await ctx.db
          .query("productVotes")
          .withIndex("by_customer_style", (q) =>
            q.eq("customerId", customer._id).eq("styleId", args.styleId)
          )
          .unique();
        hasVoted = existing !== null;
      }
    }

    return { count, hasVoted };
  },
});

// ─── Get top voted products ──────────────────────────────────────────────────

export const getTopVotedProducts = query({
  args: {},
  handler: async (ctx) => {
    // Collect all votes and aggregate by style
    const allVotes = await ctx.db.query("productVotes").collect();

    const voteCounts = new Map<string, number>();
    for (const vote of allVotes) {
      const key = vote.styleId as string;
      voteCounts.set(key, (voteCounts.get(key) ?? 0) + 1);
    }

    // Sort by vote count descending and take top 20
    const sorted = [...voteCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    // Enrich with style and brand data
    const results = await Promise.all(
      sorted.map(async ([styleId, voteCount]) => {
        const style = await ctx.db.get(styleId as Id<"styles">);
        if (!style) return null;

        const category = style.categoryId ? await ctx.db.get(style.categoryId) : null;
        const brand = style.brandId
          ? await ctx.db.get(style.brandId)
          : category ? await ctx.db.get(category.brandId) : null;

        return {
          styleId: style._id,
          styleName: style.name,
          brandName: brand?.name ?? "",
          voteCount,
        };
      })
    );

    return results.filter(Boolean);
  },
});

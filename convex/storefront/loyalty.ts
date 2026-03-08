import { query } from "../_generated/server";
import { v } from "convex/values";

// ─── Queries ─────────────────────────────────────────────────────────────────

export const getMyLoyaltyAccount = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!customer) return null;

    const account = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .unique();

    if (!account) return null;

    return {
      _id: account._id,
      tier: account.tier,
      pointsBalance: account.pointsBalance,
      lifetimePoints: account.lifetimePoints,
      lifetimeSpendCentavos: account.lifetimeSpendCentavos,
      tierExpiresAt: account.tierExpiresAt ?? null,
    };
  },
});

export const getMyLoyaltyHistory = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { transactions: [], hasMore: false };

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!customer) return { transactions: [], hasMore: false };

    const account = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .unique();

    if (!account) return { transactions: [], hasMore: false };

    const limit = args.limit ?? 20;

    let txQuery = ctx.db
      .query("loyaltyTransactions")
      .withIndex("by_account", (q) => q.eq("loyaltyAccountId", account._id))
      .order("desc");

    const all = await txQuery.collect();

    // Manual cursor-based pagination using createdAt timestamp
    let filtered = all;
    if (args.cursor) {
      filtered = all.filter((t) => t.createdAt < args.cursor!);
    }

    const page = filtered.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const transactions = page.slice(0, limit).map((t) => ({
      _id: t._id,
      type: t.type,
      points: t.points,
      description: t.description,
      orderId: t.orderId ?? null,
      createdAt: t.createdAt,
    }));

    return {
      transactions,
      hasMore,
      nextCursor: hasMore ? transactions[transactions.length - 1]?.createdAt : undefined,
    };
  },
});

import { query } from "../_generated/server";

const TIER_PRIORITY: Record<string, number> = {
  platinum: 4,
  gold: 3,
  silver: 2,
  bronze: 1,
};

export const getMyReservePriority = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { hasPriority: false, tier: null, priorityMinutes: 0 };
    }

    const customer = await ctx.db
      .query("customers")
      .filter((q) => q.eq(q.field("clerkId"), identity.subject))
      .first();
    if (!customer) {
      return { hasPriority: false, tier: null, priorityMinutes: 0 };
    }

    const loyaltyAccount = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .first();

    if (!loyaltyAccount) {
      return { hasPriority: false, tier: null, priorityMinutes: 0 };
    }

    const tier = loyaltyAccount.tier;
    const priority = TIER_PRIORITY[tier] ?? 0;

    // Higher tiers get longer reservation hold times
    const priorityMinutes = priority >= 3 ? 60 : priority >= 2 ? 30 : 0;

    return {
      hasPriority: priority >= 2,
      tier,
      priorityMinutes,
    };
  },
});

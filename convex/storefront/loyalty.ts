import { query, mutation } from "../_generated/server";
import { v } from "convex/values";

// ─── Tier Perks Constants ────────────────────────────────────────────────────

export const TIER_PERKS = {
  bronze: {
    pointsMultiplier: 1,
    perks: [
      "1x points multiplier",
      "Birthday bonus: 500 points",
      "Access to member-only sales",
    ],
    birthdayBonusPoints: 500,
  },
  silver: {
    pointsMultiplier: 1.5,
    perks: [
      "1.5x points multiplier",
      "Birthday bonus: 500 points",
      "Free shipping on orders over \u20B11,500",
      "Early access to new collections",
    ],
    birthdayBonusPoints: 500,
  },
  gold: {
    pointsMultiplier: 2,
    perks: [
      "2x points multiplier",
      "Birthday bonus: 500 points",
      "Free shipping on all orders",
      "Early access to drops",
      "Priority customer support",
    ],
    birthdayBonusPoints: 500,
  },
  platinum: {
    pointsMultiplier: 3,
    perks: [
      "3x points multiplier",
      "Birthday double bonus: 1,000 points",
      "Free shipping on all orders",
      "Early access to drops",
      "Dedicated account manager",
      "VIP access to all events",
    ],
    birthdayBonusPoints: 1000,
  },
} as const;

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

// ─── Birthday Bonus ──────────────────────────────────────────────────────────

/**
 * Returns whether today is within 7 days of the customer's birthday and
 * whether the birthday bonus is still available to claim this year.
 */
export const checkBirthdayBonus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!customer || !customer.dateOfBirth) return null;

    const account = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .unique();

    if (!account) return null;

    const tier = account.tier as keyof typeof TIER_PERKS;
    const bonusPoints = TIER_PERKS[tier].birthdayBonusPoints;

    const now = new Date();
    const currentYear = now.getFullYear();

    // Parse birth month/day
    const [, birthMonth, birthDay] = customer.dateOfBirth.split("-").map(Number);

    // Build this year's birthday
    const birthdayThisYear = new Date(currentYear, birthMonth - 1, birthDay);

    // Check if within +/- 7 days of birthday
    const diffMs = now.getTime() - birthdayThisYear.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    const isBirthdayWindow = diffDays >= -7 && diffDays <= 7;

    // Check if already claimed this year by looking for a birthday bonus transaction
    const yearStart = new Date(currentYear, 0, 1).getTime();
    const yearEnd = new Date(currentYear + 1, 0, 1).getTime();

    const bonusTxs = await ctx.db
      .query("loyaltyTransactions")
      .withIndex("by_account_type", (q) =>
        q.eq("loyaltyAccountId", account._id).eq("type", "bonus")
      )
      .collect();

    const alreadyClaimed = bonusTxs.some(
      (tx) =>
        tx.description.includes("Birthday bonus") &&
        tx.createdAt >= yearStart &&
        tx.createdAt < yearEnd
    );

    // Compute next birthday for display
    let nextBirthday = birthdayThisYear.getTime();
    if (birthdayThisYear.getTime() < now.getTime() - 7 * 24 * 60 * 60 * 1000) {
      nextBirthday = new Date(currentYear + 1, birthMonth - 1, birthDay).getTime();
    }

    return {
      isBirthdayWindow,
      birthdayBonusAvailable: isBirthdayWindow && !alreadyClaimed,
      alreadyClaimed,
      bonusPoints,
      nextBirthday,
      dateOfBirth: customer.dateOfBirth,
    };
  },
});

export const claimBirthdayBonus = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!customer || !customer.dateOfBirth) {
      throw new Error("Customer not found or no birthday set");
    }

    const account = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .unique();

    if (!account) throw new Error("No loyalty account found");

    const tier = account.tier as keyof typeof TIER_PERKS;
    const bonusPoints = TIER_PERKS[tier].birthdayBonusPoints;

    const now = new Date();
    const currentYear = now.getFullYear();

    const [, birthMonth, birthDay] = customer.dateOfBirth.split("-").map(Number);
    const birthdayThisYear = new Date(currentYear, birthMonth - 1, birthDay);

    // Validate birthday window
    const diffMs = now.getTime() - birthdayThisYear.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays < -7 || diffDays > 7) {
      throw new Error("Not within birthday bonus window");
    }

    // Prevent double-claim
    const yearStart = new Date(currentYear, 0, 1).getTime();
    const yearEnd = new Date(currentYear + 1, 0, 1).getTime();

    const bonusTxs = await ctx.db
      .query("loyaltyTransactions")
      .withIndex("by_account_type", (q) =>
        q.eq("loyaltyAccountId", account._id).eq("type", "bonus")
      )
      .collect();

    const alreadyClaimed = bonusTxs.some(
      (tx) =>
        tx.description.includes("Birthday bonus") &&
        tx.createdAt >= yearStart &&
        tx.createdAt < yearEnd
    );

    if (alreadyClaimed) {
      throw new Error("Birthday bonus already claimed this year");
    }

    // Award points
    const nowTs = Date.now();
    await ctx.db.patch(account._id, {
      pointsBalance: account.pointsBalance + bonusPoints,
      lifetimePoints: account.lifetimePoints + bonusPoints,
      updatedAt: nowTs,
    });

    await ctx.db.insert("loyaltyTransactions", {
      loyaltyAccountId: account._id,
      type: "bonus",
      points: bonusPoints,
      description: `Birthday bonus ${currentYear} - Happy Birthday!`,
      createdAt: nowTs,
    });

    return { success: true, pointsAwarded: bonusPoints };
  },
});

// ─── Daily Check-In Rewards ───────────────────────────────────────────────

// Points schedule: day 1=5, day 2=10, day 3=15, day 4=20, day 5=25, day 6=30, day 7+=50
function getCheckInPoints(streakDay: number): number {
  if (streakDay >= 7) return 50;
  return streakDay * 5;
}

function getPhilippineDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function computeStreak(
  checkIns: { checkedInAt: number }[],
  startDate: string
): number {
  let streak = 0;
  let checkDate = startDate;
  for (const ci of checkIns) {
    const ciDate = getPhilippineDate(ci.checkedInAt);
    if (ciDate === checkDate) {
      streak++;
      const d = new Date(checkDate + "T00:00:00+08:00");
      d.setDate(d.getDate() - 1);
      checkDate = d.toISOString().slice(0, 10);
    }
  }
  return streak;
}

export const getCheckInStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!customer) return null;

    // Get recent check-ins sorted desc
    const checkIns = await ctx.db
      .query("checkIns")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .order("desc")
      .take(10);

    const todayPHT = getPhilippineDate(Date.now());
    const yesterdayPHT = getPhilippineDate(Date.now() - 24 * 60 * 60 * 1000);

    const hasCheckedInToday = checkIns.some(
      (c) => getPhilippineDate(c.checkedInAt) === todayPHT
    );

    // Calculate current streak
    let currentStreak = 0;
    if (hasCheckedInToday) {
      currentStreak = computeStreak(checkIns, todayPHT);
    } else {
      const yesterdayChecked = checkIns.some(
        (c) => getPhilippineDate(c.checkedInAt) === yesterdayPHT
      );
      if (yesterdayChecked) {
        currentStreak = computeStreak(checkIns, yesterdayPHT);
      }
    }

    const lastCheckIn = checkIns.length > 0 ? checkIns[0].checkedInAt : null;

    // Next reward: if already checked in today, show tomorrow's reward
    const nextStreakDay = hasCheckedInToday ? currentStreak + 1 : (currentStreak > 0 ? currentStreak + 1 : 1);
    const nextReward = getCheckInPoints(nextStreakDay);

    return {
      hasCheckedInToday,
      currentStreak,
      lastCheckIn,
      nextReward,
    };
  },
});

export const dailyCheckIn = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!customer) throw new Error("Customer not found");

    const account = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .unique();
    if (!account) throw new Error("No loyalty account");

    // Check if already checked in today
    const todayPHT = getPhilippineDate(Date.now());
    const recentCheckIns = await ctx.db
      .query("checkIns")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .order("desc")
      .take(10);

    if (recentCheckIns.some((c) => getPhilippineDate(c.checkedInAt) === todayPHT)) {
      throw new Error("Already checked in today");
    }

    // Calculate streak: if yesterday was checked in, continue streak; otherwise reset to 1
    const yesterdayPHT = getPhilippineDate(Date.now() - 24 * 60 * 60 * 1000);
    const yesterdayChecked = recentCheckIns.some(
      (c) => getPhilippineDate(c.checkedInAt) === yesterdayPHT
    );

    let streakDay: number;
    if (yesterdayChecked) {
      const prevStreak = computeStreak(recentCheckIns, yesterdayPHT);
      streakDay = prevStreak + 1;
    } else {
      streakDay = 1;
    }

    const pointsAwarded = getCheckInPoints(streakDay);
    const now = Date.now();

    await ctx.db.insert("checkIns", {
      customerId: customer._id,
      checkedInAt: now,
      streakDay,
      pointsAwarded,
    });

    // Award loyalty points
    const newBalance = account.pointsBalance + pointsAwarded;
    await ctx.db.patch(account._id, {
      pointsBalance: newBalance,
      lifetimePoints: account.lifetimePoints + pointsAwarded,
      updatedAt: now,
    });

    await ctx.db.insert("loyaltyTransactions", {
      loyaltyAccountId: account._id,
      type: "bonus",
      points: pointsAwarded,
      description: `Daily check-in (Day ${streakDay} streak)`,
      createdAt: now,
    });

    return { streakDay, pointsAwarded, totalPoints: newBalance };
  },
});

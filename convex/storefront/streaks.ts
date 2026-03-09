import { query } from "../_generated/server";

export const getMyStreak = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const customer = await ctx.db
      .query("customers")
      .filter((q) => q.eq(q.field("clerkId"), identity.subject))
      .first();
    if (!customer) return null;

    // Get all completed orders for this customer
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .collect();

    const deliveredOrders = orders.filter(
      (o) => o.status === "delivered" || o.status === "paid" || o.status === "shipped"
    );

    if (deliveredOrders.length === 0) {
      return { currentStreak: 0, longestStreak: 0, monthsWithPurchases: [] };
    }

    // Get unique months with purchases (YYYY-MM format)
    const months = new Set<string>();
    for (const order of deliveredOrders) {
      const d = new Date(order.createdAt);
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    const sortedMonths = [...months].sort().reverse();

    // Calculate current streak (consecutive months from current/last month)
    const now = new Date();
    let checkMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let currentStreak = 0;

    // Check if current month has purchase, if not start from last month
    if (!months.has(checkMonth)) {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      checkMonth = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
    }

    // Count consecutive months backward
    let d = new Date(checkMonth + "-01");
    while (months.has(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)) {
      currentStreak++;
      d = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    }

    // Calculate longest streak
    let longestStreak = 0;
    let tempStreak = 0;
    const allMonths = [...months].sort();
    for (let i = 0; i < allMonths.length; i++) {
      if (i === 0) {
        tempStreak = 1;
      } else {
        const prev = new Date(allMonths[i - 1] + "-01");
        const curr = new Date(allMonths[i] + "-01");
        const diffMonths = (curr.getFullYear() - prev.getFullYear()) * 12 + (curr.getMonth() - prev.getMonth());
        if (diffMonths === 1) {
          tempStreak++;
        } else {
          tempStreak = 1;
        }
      }
      longestStreak = Math.max(longestStreak, tempStreak);
    }

    // Bonus points per streak level
    const bonusPoints = currentStreak >= 6 ? 500 : currentStreak >= 3 ? 200 : currentStreak >= 2 ? 50 : 0;

    return {
      currentStreak,
      longestStreak,
      bonusPoints,
      monthsWithPurchases: sortedMonths.slice(0, 12),
    };
  },
});

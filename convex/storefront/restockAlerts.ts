import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const subscribeToRestock = mutation({
  args: {
    variantId: v.id("variants"),
    styleId: v.id("styles"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("clerkId"), identity.subject))
      .first();
    if (!user) throw new Error("User not found");

    // Check for existing active alert
    const existing = await ctx.db
      .query("restockAlerts")
      .withIndex("by_customer", (q) =>
        q.eq("customerId", user._id).eq("status", "active")
      )
      .filter((q) => q.eq(q.field("variantId"), args.variantId))
      .first();

    if (existing) {
      return { alreadySubscribed: true };
    }

    await ctx.db.insert("restockAlerts", {
      customerId: user._id,
      variantId: args.variantId,
      styleId: args.styleId,
      status: "active",
      createdAt: Date.now(),
    });

    return { alreadySubscribed: false };
  },
});

export const getMyRestockAlerts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("clerkId"), identity.subject))
      .first();
    if (!user) return [];

    const alerts = await ctx.db
      .query("restockAlerts")
      .withIndex("by_customer", (q) =>
        q.eq("customerId", user._id).eq("status", "active")
      )
      .collect();

    const results = [];
    for (const alert of alerts) {
      const style = await ctx.db.get(alert.styleId);
      const variant = await ctx.db.get(alert.variantId);
      if (!style || !variant) continue;

      results.push({
        _id: alert._id,
        styleName: style.name,
        size: variant.size,
        color: variant.color,
        createdAt: alert.createdAt,
      });
    }

    return results;
  },
});

export const cancelRestockAlert = mutation({
  args: { alertId: v.id("restockAlerts") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("clerkId"), identity.subject))
      .first();
    if (!user) throw new Error("User not found");

    const alert = await ctx.db.get(args.alertId);
    if (!alert || alert.customerId !== user._id) {
      throw new Error("Alert not found");
    }

    await ctx.db.patch(args.alertId, { status: "cancelled" });
  },
});

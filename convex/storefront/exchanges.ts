import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const requestExchange = mutation({
  args: {
    orderId: v.id("orders"),
    originalVariantId: v.id("variants"),
    requestedVariantId: v.id("variants"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const customer = await ctx.db
      .query("customers")
      .filter((q) => q.eq(q.field("clerkId"), identity.subject))
      .first();
    if (!customer) throw new Error("Customer not found");

    // Validate order belongs to customer
    const order = await ctx.db.get(args.orderId);
    if (!order || order.customerId !== customer._id) {
      throw new Error("Order not found");
    }

    // Store as user ID for the exchangeRequests table
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("clerkId"), identity.subject))
      .first();
    if (!user) throw new Error("User not found");

    const now = Date.now();
    const id = await ctx.db.insert("exchangeRequests", {
      orderId: args.orderId,
      customerId: user._id,
      originalVariantId: args.originalVariantId,
      requestedVariantId: args.requestedVariantId,
      reason: args.reason,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    return { exchangeId: id };
  },
});

export const getMyExchangeRequests = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("clerkId"), identity.subject))
      .first();
    if (!user) return [];

    const requests = await ctx.db
      .query("exchangeRequests")
      .withIndex("by_customer", (q) => q.eq("customerId", user._id))
      .order("desc")
      .collect();

    const results = [];
    for (const req of requests) {
      const originalVariant = await ctx.db.get(req.originalVariantId);
      const requestedVariant = await ctx.db.get(req.requestedVariantId);
      if (!originalVariant || !requestedVariant) continue;

      results.push({
        _id: req._id,
        orderId: req.orderId,
        status: req.status,
        reason: req.reason,
        originalSize: originalVariant.size,
        originalColor: originalVariant.color,
        requestedSize: requestedVariant.size,
        requestedColor: requestedVariant.color,
        createdAt: req.createdAt,
      });
    }

    return results;
  },
});

export const cancelExchangeRequest = mutation({
  args: { exchangeId: v.id("exchangeRequests") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("clerkId"), identity.subject))
      .first();
    if (!user) throw new Error("User not found");

    const req = await ctx.db.get(args.exchangeId);
    if (!req || req.customerId !== user._id) {
      throw new Error("Exchange request not found");
    }
    if (req.status !== "pending") {
      throw new Error("Can only cancel pending requests");
    }

    await ctx.db.patch(args.exchangeId, {
      status: "rejected",
      updatedAt: Date.now(),
    });
  },
});

import { query, mutation, MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const RETURN_REASONS = [
  "Wrong size",
  "Doesn't fit",
  "Not as described",
  "Defective/damaged",
  "Changed my mind",
  "Other",
] as const;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function requireCustomer(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Not authenticated");

  const customer = await ctx.db
    .query("customers")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (!customer) throw new ConvexError("Customer profile not found");
  return customer;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export const getReturnReasons = query({
  args: {},
  handler: async () => {
    return [...RETURN_REASONS];
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

export const requestReturn = mutation({
  args: {
    orderId: v.id("orders"),
    reason: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const customer = await requireCustomer(ctx);

    // Validate order ownership
    const order = await ctx.db.get(args.orderId);
    if (!order || order.customerId !== customer._id) {
      throw new ConvexError("Order not found");
    }

    // Validate status is "delivered"
    if (order.status !== "delivered") {
      throw new ConvexError("Only delivered orders can be returned");
    }

    // Check if within 7 days of delivery
    // Use shipment deliveredAt if available, otherwise fall back to order updatedAt
    const shipment = await ctx.db
      .query("shipments")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .unique();

    const deliveredAt = shipment?.deliveredAt ?? order.updatedAt;
    const now = Date.now();

    if (now - deliveredAt > SEVEN_DAYS_MS) {
      throw new ConvexError(
        "Return window has expired. Returns must be requested within 7 days of delivery."
      );
    }

    // Validate reason
    if (!RETURN_REASONS.includes(args.reason as (typeof RETURN_REASONS)[number])) {
      throw new ConvexError("Invalid return reason");
    }

    // Update order status
    await ctx.db.patch(args.orderId, {
      status: "returned",
      returnReason: args.reason,
      returnNotes: args.notes,
      returnRequestedAt: now,
      updatedAt: now,
    });

    return {
      success: true,
      message:
        "Your return request has been submitted. Please bring the item to your nearest RedBox branch within 7 days. Bring your order confirmation.",
    };
  },
});

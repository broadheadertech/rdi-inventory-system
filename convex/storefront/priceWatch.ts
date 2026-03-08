import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

/**
 * Price-drop alerts piggy-back on the wishlists table.
 * If *any* variant of a style is wishlisted the customer is "watching" that
 * style for price drops.  The toggle mutation adds / removes the first active
 * variant of the style so the customer doesn't need to pick a specific SKU.
 */

// ─── Queries ──────────────────────────────────────────────────────────────────

export const isWatchingStyle = query({
  args: { styleId: v.id("styles") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!customer) return false;

    // Get all variants for the style
    const variants = await ctx.db
      .query("variants")
      .withIndex("by_style", (q) => q.eq("styleId", args.styleId))
      .collect();

    const variantIds = new Set(variants.map((v) => v._id));

    // Check if any variant of this style is in the customer's wishlist
    const wishlistItems = await ctx.db
      .query("wishlists")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .collect();

    return wishlistItems.some((wi) => variantIds.has(wi.variantId));
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const togglePriceWatch = mutation({
  args: { styleId: v.id("styles") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!customer) throw new ConvexError("Customer profile not found");

    // Get all variants for the style
    const variants = await ctx.db
      .query("variants")
      .withIndex("by_style", (q) => q.eq("styleId", args.styleId))
      .collect();

    if (variants.length === 0) {
      throw new ConvexError("No variants found for this style");
    }

    const variantIds = new Set(variants.map((v) => v._id));

    // Find existing wishlist entries for any variant of this style
    const wishlistItems = await ctx.db
      .query("wishlists")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .collect();

    const matchingItems = wishlistItems.filter((wi) =>
      variantIds.has(wi.variantId)
    );

    if (matchingItems.length > 0) {
      // Already watching — remove all matching entries
      for (const item of matchingItems) {
        await ctx.db.delete(item._id);
      }
      return { watching: false };
    }

    // Not watching — add first active variant to wishlist
    const firstActive = variants.find((v) => v.isActive) ?? variants[0];
    await ctx.db.insert("wishlists", {
      customerId: customer._id,
      variantId: firstActive._id,
      addedAt: Date.now(),
    });

    return { watching: true };
  },
});

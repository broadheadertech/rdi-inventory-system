import { query, mutation, QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { MutationCtx } from "../_generated/server";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function requireCustomer(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Not authenticated");

  const customer = await ctx.db
    .query("customers")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (!customer)
    throw new ConvexError("Customer profile not found. Please sign in again.");
  return customer;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export const getStyleReviews = query({
  args: {
    styleId: v.id("styles"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;

    const allReviews = await ctx.db
      .query("reviews")
      .withIndex("by_style_approved", (q) =>
        q.eq("styleId", args.styleId).eq("isApproved", true)
      )
      .collect();

    // Sort by createdAt desc and take limit
    allReviews.sort((a, b) => b.createdAt - a.createdAt);
    const reviews = allReviews.slice(0, limit);

    // Resolve customer names and image URLs
    const results = await Promise.all(
      reviews.map(async (review) => {
        const customer = await ctx.db.get(review.customerId);
        let customerName = "Anonymous";
        if (customer) {
          const lastInitial = customer.lastName
            ? customer.lastName.charAt(0).toUpperCase() + "."
            : "";
          customerName = `${customer.firstName} ${lastInitial}`.trim();
        }

        // Resolve image URLs
        const imageUrls: string[] = [];
        if (review.imageStorageIds) {
          for (const storageId of review.imageStorageIds) {
            const url = await ctx.storage.getUrl(storageId);
            if (url) imageUrls.push(url);
          }
        }

        return {
          _id: review._id,
          rating: review.rating,
          title: review.title ?? null,
          body: review.body ?? null,
          customerName,
          isVerifiedPurchase: review.isVerifiedPurchase,
          imageUrls,
          helpfulCount: review.helpfulCount ?? 0,
          createdAt: review.createdAt,
        };
      })
    );

    // Compute rating summary from ALL approved reviews
    const totalCount = allReviews.length;
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let ratingSum = 0;
    for (const r of allReviews) {
      distribution[r.rating] = (distribution[r.rating] || 0) + 1;
      ratingSum += r.rating;
    }
    const averageRating = totalCount > 0 ? ratingSum / totalCount : 0;

    return {
      reviews: results,
      summary: {
        averageRating: Math.round(averageRating * 10) / 10,
        totalCount,
        distribution,
      },
    };
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

export const submitReview = mutation({
  args: {
    styleId: v.id("styles"),
    rating: v.number(),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    orderId: v.optional(v.id("orders")),
  },
  handler: async (ctx, args) => {
    const customer = await requireCustomer(ctx);

    // Validate rating
    if (args.rating < 1 || args.rating > 5 || !Number.isInteger(args.rating)) {
      throw new ConvexError("Rating must be an integer between 1 and 5");
    }

    // Verify the style exists
    const style = await ctx.db.get(args.styleId);
    if (!style) throw new ConvexError("Style not found");

    // Check if customer already reviewed this style
    const existingReviews = await ctx.db
      .query("reviews")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .collect();
    const alreadyReviewed = existingReviews.find(
      (r) => r.styleId === args.styleId
    );
    if (alreadyReviewed) {
      throw new ConvexError("You have already reviewed this product");
    }

    // Determine verified purchase: customer has a delivered order containing a variant of this style
    let isVerifiedPurchase = false;

    const customerOrders = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .collect();

    const deliveredOrders = customerOrders.filter(
      (o) => o.status === "delivered"
    );

    // Get all variant IDs for this style
    const styleVariants = await ctx.db
      .query("variants")
      .withIndex("by_style", (q) => q.eq("styleId", args.styleId))
      .collect();
    const styleVariantIds = new Set(styleVariants.map((v) => String(v._id)));

    for (const order of deliveredOrders) {
      const orderItems = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();

      if (orderItems.some((item) => styleVariantIds.has(String(item.variantId)))) {
        isVerifiedPurchase = true;
        break;
      }
    }

    const now = Date.now();
    const reviewId = await ctx.db.insert("reviews", {
      customerId: customer._id,
      styleId: args.styleId,
      orderId: args.orderId,
      rating: args.rating,
      title: args.title,
      body: args.body,
      isVerifiedPurchase,
      isApproved: false, // pending moderation
      helpfulCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    return { reviewId, isVerifiedPurchase };
  },
});

// ─── Size Feedback ───────────────────────────────────────────────────────────

async function getCustomerFromQuery(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("customers")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

/**
 * Returns delivered orders that the customer has NOT yet left size feedback on.
 * Each result includes the order + first item style info for display.
 */
export const getOrdersNeedingSizeFeedback = query({
  args: {},
  handler: async (ctx) => {
    const customer = await getCustomerFromQuery(ctx);
    if (!customer) return [];

    const allOrders = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .collect();

    const deliveredOrders = allOrders
      .filter((o) => o.status === "delivered")
      .sort((a, b) => b.createdAt - a.createdAt);

    if (deliveredOrders.length === 0) return [];

    // Determine which orders already have size feedback
    const existingReviews = await ctx.db
      .query("reviews")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .collect();

    const reviewedOrderIds = new Set(
      existingReviews
        .filter((r) => r.orderId && r.sizeFeedback)
        .map((r) => String(r.orderId))
    );

    // Show up to 3 prompts
    const needsFeedback = deliveredOrders
      .filter((o) => !reviewedOrderIds.has(String(o._id)))
      .slice(0, 3);

    const results = await Promise.all(
      needsFeedback.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();

        let styleName = "Your order";
        let imageUrl: string | null = null;

        if (items.length > 0) {
          const variant = await ctx.db.get(items[0].variantId);
          if (variant) {
            const style = await ctx.db.get(variant.styleId);
            if (style) {
              styleName = style.name;
              const images = await ctx.db
                .query("productImages")
                .withIndex("by_style", (q) => q.eq("styleId", style._id))
                .collect();
              const primary = images.find((img) => img.isPrimary);
              if (primary) {
                imageUrl = await ctx.storage.getUrl(primary.storageId);
              }
            }
          }
        }

        return {
          orderId: order._id,
          orderNumber: order.orderNumber,
          styleName,
          imageUrl,
          itemCount: items.reduce((s, i) => s + i.quantity, 0),
        };
      })
    );

    return results;
  },
});

export const submitSizeFeedback = mutation({
  args: {
    orderId: v.id("orders"),
    sizeFeedback: v.union(
      v.literal("runs_small"),
      v.literal("true_to_size"),
      v.literal("runs_large")
    ),
  },
  handler: async (ctx, args) => {
    const customer = await requireCustomer(ctx);

    const order = await ctx.db.get(args.orderId);
    if (!order || order.customerId !== customer._id) {
      throw new ConvexError("Order not found");
    }
    if (order.status !== "delivered") {
      throw new ConvexError("Order has not been delivered yet");
    }

    // Check for existing review on this order
    const existing = await ctx.db
      .query("reviews")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .first();

    if (existing && existing.sizeFeedback) {
      throw new ConvexError("Size feedback already submitted for this order");
    }

    // Resolve styleId from first order item
    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    if (items.length === 0) {
      throw new ConvexError("No items found in this order");
    }

    const variant = await ctx.db.get(items[0].variantId);
    if (!variant) throw new ConvexError("Product variant not found");

    const ratingMap = {
      runs_small: 3,
      true_to_size: 5,
      runs_large: 3,
    } as const;

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        sizeFeedback: args.sizeFeedback,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("reviews", {
        customerId: customer._id,
        styleId: variant.styleId,
        orderId: args.orderId,
        rating: ratingMap[args.sizeFeedback],
        title: "Size Feedback",
        body: args.sizeFeedback,
        sizeFeedback: args.sizeFeedback,
        isVerifiedPurchase: true,
        isApproved: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { success: true };
  },
});

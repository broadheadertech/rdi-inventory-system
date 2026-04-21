import { query, mutation, MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { Id } from "../_generated/dataModel";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateOrderNumber(): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RBX-${dateStr}-${rand}`;
}

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

export const getBuyAgainProducts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!customer) return [];

    // Get delivered orders, sorted newest first
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .collect();
    const deliveredOrders = orders
      .filter((o) => o.status === "delivered")
      .sort((a, b) => b.createdAt - a.createdAt);
    if (deliveredOrders.length === 0) return [];

    // Collect unique styleIds from order items (preserving recency order)
    const seenStyleIds = new Set<string>();
    const orderedStyleIds: Id<"styles">[] = [];

    for (const order of deliveredOrders) {
      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();
      for (const item of items) {
        const variant = await ctx.db.get(item.variantId);
        if (!variant) continue;
        const key = String(variant.styleId);
        if (!seenStyleIds.has(key)) {
          seenStyleIds.add(key);
          orderedStyleIds.push(variant.styleId);
        }
      }
      // Early exit once we have enough candidates
      if (orderedStyleIds.length >= 16) break;
    }

    // Filter to active styles from active categories/brands, and enrich
    const allBrands = await ctx.db.query("brands").collect();
    const activeBrandIds = new Set(
      allBrands.filter((b) => b.isActive).map((b) => String(b._id))
    );
    const brandMap = new Map(allBrands.map((b) => [String(b._id), b]));

    const allCategories = await ctx.db.query("categories").collect();
    const activeCategoryIds = new Set(
      allCategories
        .filter((c) => c.isActive && activeBrandIds.has(String(c.brandId)))
        .map((c) => String(c._id))
    );
    const categoryMap = new Map(allCategories.map((c) => [String(c._id), c]));

    const results: Array<{
      styleId: Id<"styles">;
      name: string;
      brandName: string;
      primaryImageUrl: string | null;
      basePriceCentavos: number;
    }> = [];

    for (const styleId of orderedStyleIds) {
      if (results.length >= 8) break;
      const style = await ctx.db.get(styleId);
      if (!style || !style.isActive) continue;
      if (!activeCategoryIds.has(String(style.categoryId))) continue;

      const category = categoryMap.get(String(style.categoryId));
      const brand = style.brandId
        ? brandMap.get(String(style.brandId))
        : category ? brandMap.get(String(category.brandId)) : null;

      const images = await ctx.db
        .query("productImages")
        .withIndex("by_style", (q) => q.eq("styleId", style._id))
        .collect();
      const primary = images.find((img) => img.isPrimary);
      const primaryImageUrl = primary
        ? await ctx.storage.getUrl(primary.storageId)
        : null;

      results.push({
        styleId: style._id,
        name: style.name,
        brandName: brand?.name ?? "",
        primaryImageUrl,
        basePriceCentavos: style.basePriceCentavos,
      });
    }

    return results;
  },
});

export const getMyOrders = query({
  args: {
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!customer) return [];

    let orders = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .collect();

    if (args.status) {
      orders = orders.filter((o) => o.status === args.status);
    }

    // Sort by newest first
    orders.sort((a, b) => b.createdAt - a.createdAt);

    // Enrich with item count and first item image
    const enriched = await Promise.all(
      orders.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();

        let firstImageUrl: string | null = null;
        if (items.length > 0) {
          const variant = await ctx.db.get(items[0].variantId);
          if (variant) {
            const style = await ctx.db.get(variant.styleId);
            if (style) {
              const images = await ctx.db
                .query("productImages")
                .withIndex("by_style", (q) => q.eq("styleId", style._id))
                .collect();
              const primary = images.find((img) => img.isPrimary);
              if (primary) firstImageUrl = await ctx.storage.getUrl(primary.storageId);
            }
          }
        }

        return {
          ...order,
          itemCount: items.reduce((s, i) => s + i.quantity, 0),
          firstImageUrl,
        };
      })
    );

    return enriched;
  },
});

export const getOrderDetail = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!customer) return null;

    const order = await ctx.db.get(args.orderId);
    if (!order || order.customerId !== customer._id) return null;

    // Get order items with enriched data
    const orderItems = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();

    const items = await Promise.all(
      orderItems.map(async (oi) => {
        const variant = await ctx.db.get(oi.variantId);
        const style = variant ? await ctx.db.get(variant.styleId) : null;

        let imageUrl: string | null = null;
        if (style) {
          const images = await ctx.db
            .query("productImages")
            .withIndex("by_style", (q) => q.eq("styleId", style._id))
            .collect();
          const primary = images.find((img) => img.isPrimary);
          if (primary) imageUrl = await ctx.storage.getUrl(primary.storageId);
        }

        return {
          ...oi,
          styleName: style?.name ?? "Unknown",
          color: variant?.color ?? "",
          size: variant?.size ?? "",
          imageUrl,
        };
      })
    );

    // Get shipment info
    const shipment = await ctx.db
      .query("shipments")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .unique();

    return {
      ...order,
      items,
      shipment,
    };
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

export const createOrder = mutation({
  args: {
    addressId: v.optional(v.id("customerAddresses")),
    paymentMethod: v.union(
      v.literal("cod"),
      v.literal("gcash"),
      v.literal("maya"),
      v.literal("card"),
      v.literal("bankTransfer")
    ),
    voucherCode: v.optional(v.string()),
    notes: v.optional(v.string()),
    shippingFeeCentavos: v.optional(v.number()),
    deliveryMethod: v.optional(
      v.union(v.literal("standard"), v.literal("express"), v.literal("sameDay"))
    ),
    fulfillmentType: v.optional(
      v.union(v.literal("delivery"), v.literal("pickup"))
    ),
    pickupBranchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const customer = await requireCustomer(ctx);

    const isPickup = args.fulfillmentType === "pickup";

    // Validate pickup branch
    if (isPickup) {
      if (!args.pickupBranchId) {
        throw new ConvexError("Please select a pickup branch");
      }
      const branch = await ctx.db.get(args.pickupBranchId);
      if (!branch || !branch.isActive || branch.channel === "warehouse") {
        throw new ConvexError("Selected pickup branch is not available");
      }
    }

    // Get address (required for delivery, optional for pickup)
    let address: {
      recipientName: string;
      phone: string;
      addressLine1: string;
      addressLine2?: string;
      city: string;
      province: string;
      postalCode: string;
      country: string;
      customerId: Id<"customers">;
    } | null = null;
    if (!isPickup) {
      if (!args.addressId) {
        throw new ConvexError("Please select a delivery address");
      }
      const addrDoc = await ctx.db.get(args.addressId);
      if (!addrDoc || addrDoc.customerId !== customer._id) {
        throw new ConvexError("Address not found");
      }
      address = addrDoc;
    }

    // Get cart
    const cart = await ctx.db
      .query("carts")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .unique();
    if (!cart) throw new ConvexError("Cart is empty");

    const cartItems = await ctx.db
      .query("cartItems")
      .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
      .collect();
    if (cartItems.length === 0) throw new ConvexError("Cart is empty");

    // Build order items and calculate totals
    let subtotalCentavos = 0;
    const orderItemsData: Array<{
      variantId: any;
      quantity: number;
      unitPriceCentavos: number;
      lineTotalCentavos: number;
    }> = [];

    for (const ci of cartItems) {
      const variant = await ctx.db.get(ci.variantId);
      if (!variant || !variant.isActive) {
        throw new ConvexError(`Product "${ci.variantId}" is no longer available`);
      }

      const lineTotal = variant.priceCentavos * ci.quantity;
      subtotalCentavos += lineTotal;

      orderItemsData.push({
        variantId: ci.variantId,
        quantity: ci.quantity,
        unitPriceCentavos: variant.priceCentavos,
        lineTotalCentavos: lineTotal,
      });
    }

    // Calculate shipping — use frontend-provided fee if given, else default
    const shippingFeeCentavos =
      args.shippingFeeCentavos !== undefined
        ? args.shippingFeeCentavos
        : subtotalCentavos >= 99900
          ? 0
          : 9900;

    // VAT calculation (already included in price, 12%)
    const vatAmountCentavos = Math.round(subtotalCentavos - subtotalCentavos / 1.12);

    const now = Date.now();
    const totalCentavos = subtotalCentavos + shippingFeeCentavos;

    // Create order
    const orderId = await ctx.db.insert("orders", {
      customerId: customer._id,
      orderNumber: generateOrderNumber(),
      status: args.paymentMethod === "cod" ? "processing" : "pending",
      subtotalCentavos,
      vatAmountCentavos,
      shippingFeeCentavos,
      discountAmountCentavos: 0,
      totalCentavos,
      // Address fields — only set for delivery orders
      ...(address
        ? {
            shippingAddressId: args.addressId,
            shippingAddress: {
              recipientName: address.recipientName,
              phone: address.phone,
              addressLine1: address.addressLine1,
              addressLine2: address.addressLine2,
              city: address.city,
              province: address.province,
              postalCode: address.postalCode,
              country: address.country,
            },
          }
        : {}),
      paymentMethod: args.paymentMethod,
      deliveryMethod: isPickup ? undefined : args.deliveryMethod,
      fulfillmentType: args.fulfillmentType ?? "delivery",
      pickupBranchId: isPickup ? args.pickupBranchId : undefined,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    // Create order items
    for (const item of orderItemsData) {
      await ctx.db.insert("orderItems", {
        orderId,
        ...item,
      });
    }

    // Clear cart
    for (const ci of cartItems) {
      await ctx.db.delete(ci._id);
    }
    await ctx.db.patch(cart._id, { updatedAt: now });

    const order = await ctx.db.get(orderId);
    return { orderId, orderNumber: order!.orderNumber };
  },
});

export const cancelOrder = mutation({
  args: {
    orderId: v.id("orders"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const customer = await requireCustomer(ctx);

    const order = await ctx.db.get(args.orderId);
    if (!order || order.customerId !== customer._id) {
      throw new ConvexError("Order not found");
    }

    const cancellableStatuses = ["pending", "paid", "processing"];
    if (!cancellableStatuses.includes(order.status)) {
      throw new ConvexError("Order cannot be cancelled at this stage");
    }

    await ctx.db.patch(args.orderId, {
      status: "cancelled",
      cancelledAt: Date.now(),
      cancelReason: args.reason ?? "Cancelled by customer",
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

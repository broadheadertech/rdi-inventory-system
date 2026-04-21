import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { Id } from "../_generated/dataModel";
import { MutationCtx } from "../_generated/server";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function requireCustomer(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Not authenticated");

  const customer = await ctx.db
    .query("customers")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (!customer) throw new ConvexError("Customer profile not found. Please sign in again.");
  return customer;
}

async function getOrCreateCart(ctx: MutationCtx, customerId: Id<"customers">) {
  const existing = await ctx.db
    .query("carts")
    .withIndex("by_customer", (q) => q.eq("customerId", customerId))
    .unique();

  if (existing) return existing;

  const cartId = await ctx.db.insert("carts", {
    customerId,
    updatedAt: Date.now(),
  });
  return (await ctx.db.get(cartId))!;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export const getMyCart = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!customer) return null;

    const cart = await ctx.db
      .query("carts")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .unique();
    if (!cart) return { items: [] as any[], totalCentavos: 0, itemCount: 0 };

    const cartItems = await ctx.db
      .query("cartItems")
      .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
      .collect();

    // Enrich each cart item with variant + style data
    const items = await Promise.all(
      cartItems.map(async (ci) => {
        const variant = await ctx.db.get(ci.variantId);
        if (!variant || !variant.isActive) return null;

        const style = await ctx.db.get(variant.styleId);
        if (!style || !style.isActive) return null;

        const category = style.categoryId ? await ctx.db.get(style.categoryId) : null;
        const brand = style.brandId
          ? await ctx.db.get(style.brandId)
          : category ? await ctx.db.get(category.brandId) : null;

        // Get primary image
        const images = await ctx.db
          .query("productImages")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .collect();
        const primary = images.find((img) => img.isPrimary);
        const imageUrl = primary ? await ctx.storage.getUrl(primary.storageId) : null;
        const brandLogoUrl = brand?.storageId
          ? await ctx.storage.getUrl(brand.storageId)
          : null;

        // Check total stock across retail branches
        const inventory = await ctx.db
          .query("inventory")
          .withIndex("by_variant", (q) => q.eq("variantId", variant._id))
          .collect();
        const allBranches = await ctx.db.query("branches").collect();
        const warehouseIds = new Set(
          allBranches.filter((b) => b.channel === "warehouse").map((b) => String(b._id))
        );
        const totalStock = inventory
          .filter((inv) => !warehouseIds.has(String(inv.branchId)))
          .reduce((sum, inv) => sum + inv.quantity, 0);

        return {
          _id: ci._id,
          variantId: variant._id,
          styleId: style._id,
          styleName: style.name,
          brandName: brand?.name ?? "",
          categoryName: category?.name ?? "",
          color: variant.color,
          size: variant.size,
          sku: variant.sku,
          priceCentavos: variant.priceCentavos,
          quantity: ci.quantity,
          lineTotalCentavos: variant.priceCentavos * ci.quantity,
          imageUrl,
          brandLogoUrl,
          totalStock,
          addedAt: ci.addedAt,
        };
      })
    );

    const validItems = items.filter((i) => i !== null);
    const totalCentavos = validItems.reduce((s, i) => s + i.lineTotalCentavos, 0);

    return {
      items: validItems,
      totalCentavos,
      itemCount: validItems.reduce((s, i) => s + i.quantity, 0),
    };
  },
});

export const getCartItemCount = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!customer) return 0;

    const cart = await ctx.db
      .query("carts")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .unique();
    if (!cart) return 0;

    const items = await ctx.db
      .query("cartItems")
      .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
      .collect();

    return items.reduce((s, i) => s + i.quantity, 0);
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

export const addToCart = mutation({
  args: {
    variantId: v.id("variants"),
    quantity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const customer = await requireCustomer(ctx);
    const qty = args.quantity ?? 1;
    if (qty < 1) throw new ConvexError("Quantity must be at least 1");

    const variant = await ctx.db.get(args.variantId);
    if (!variant || !variant.isActive) throw new ConvexError("Product not available");

    const cart = await getOrCreateCart(ctx, customer._id);

    const existing = await ctx.db
      .query("cartItems")
      .withIndex("by_cart_variant", (q) =>
        q.eq("cartId", cart._id).eq("variantId", args.variantId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { quantity: existing.quantity + qty });
    } else {
      await ctx.db.insert("cartItems", {
        cartId: cart._id,
        variantId: args.variantId,
        quantity: qty,
        addedAt: Date.now(),
      });
    }

    await ctx.db.patch(cart._id, { updatedAt: Date.now() });
    return { success: true };
  },
});

export const updateCartItemQuantity = mutation({
  args: {
    cartItemId: v.id("cartItems"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const customer = await requireCustomer(ctx);

    const cartItem = await ctx.db.get(args.cartItemId);
    if (!cartItem) throw new ConvexError("Cart item not found");

    const cart = await ctx.db.get(cartItem.cartId);
    if (!cart || cart.customerId !== customer._id) {
      throw new ConvexError("Not authorized");
    }

    if (args.quantity < 1) {
      await ctx.db.delete(args.cartItemId);
    } else {
      await ctx.db.patch(args.cartItemId, { quantity: args.quantity });
    }

    await ctx.db.patch(cart._id, { updatedAt: Date.now() });
    return { success: true };
  },
});

export const removeFromCart = mutation({
  args: { cartItemId: v.id("cartItems") },
  handler: async (ctx, args) => {
    const customer = await requireCustomer(ctx);

    const cartItem = await ctx.db.get(args.cartItemId);
    if (!cartItem) return;

    const cart = await ctx.db.get(cartItem.cartId);
    if (!cart || cart.customerId !== customer._id) {
      throw new ConvexError("Not authorized");
    }

    await ctx.db.delete(args.cartItemId);
    await ctx.db.patch(cart._id, { updatedAt: Date.now() });
  },
});

export const clearCart = mutation({
  args: {},
  handler: async (ctx) => {
    const customer = await requireCustomer(ctx);

    const cart = await ctx.db
      .query("carts")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .unique();
    if (!cart) return;

    const items = await ctx.db
      .query("cartItems")
      .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
      .collect();

    for (const item of items) {
      await ctx.db.delete(item._id);
    }

    await ctx.db.patch(cart._id, { updatedAt: Date.now() });
  },
});

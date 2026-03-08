import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { Doc } from "../_generated/dataModel";

// ─── Queries ─────────────────────────────────────────────────────────────────

export const getMyWishlist = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!customer) return [];

    const wishlistItems = await ctx.db
      .query("wishlists")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .collect();

    const items = await Promise.all(
      wishlistItems.map(async (wi) => {
        const variant = await ctx.db.get(wi.variantId);
        if (!variant || !variant.isActive) return null;

        const style = await ctx.db.get(variant.styleId);
        if (!style || !style.isActive) return null;

        const category = await ctx.db.get(style.categoryId);
        const brand = category ? await ctx.db.get(category.brandId) : null;

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

        // Check stock
        const inventory = await ctx.db
          .query("inventory")
          .withIndex("by_variant", (q) => q.eq("variantId", variant._id))
          .collect();
        const allBranches = await ctx.db.query("branches").collect();
        const warehouseIds = new Set(
          allBranches.filter((b) => b.type === "warehouse").map((b) => String(b._id))
        );
        const totalStock = inventory
          .filter((inv) => !warehouseIds.has(String(inv.branchId)))
          .reduce((sum, inv) => sum + inv.quantity, 0);

        return {
          _id: wi._id,
          variantId: variant._id,
          styleId: style._id,
          styleName: style.name,
          brandName: brand?.name ?? "",
          color: variant.color,
          size: variant.size,
          priceCentavos: variant.priceCentavos,
          imageUrl,
          brandLogoUrl,
          totalStock,
          addedAt: wi.addedAt,
        };
      })
    );

    return items.filter((i) => i !== null);
  },
});

export const isInWishlist = query({
  args: { variantId: v.id("variants") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!customer) return false;

    const item = await ctx.db
      .query("wishlists")
      .withIndex("by_customer_variant", (q) =>
        q.eq("customerId", customer._id).eq("variantId", args.variantId)
      )
      .unique();

    return !!item;
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

export const toggleWishlist = mutation({
  args: { variantId: v.id("variants") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!customer) throw new ConvexError("Customer profile not found");

    const existing = await ctx.db
      .query("wishlists")
      .withIndex("by_customer_variant", (q) =>
        q.eq("customerId", customer._id).eq("variantId", args.variantId)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { added: false };
    }

    await ctx.db.insert("wishlists", {
      customerId: customer._id,
      variantId: args.variantId,
      addedAt: Date.now(),
    });
    return { added: true };
  },
});

export const removeFromWishlist = mutation({
  args: { wishlistItemId: v.id("wishlists") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!customer) throw new ConvexError("Customer profile not found");

    const item = await ctx.db.get(args.wishlistItemId);
    if (!item || item.customerId !== customer._id) return;

    await ctx.db.delete(args.wishlistItemId);
  },
});

// ─── Shared Wishlist ──────────────────────────────────────────────────────────

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 24; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export const generateShareLink = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!customer) throw new ConvexError("Customer profile not found");

    // Return existing token if already generated
    if (customer.wishlistShareToken) {
      return { token: customer.wishlistShareToken };
    }

    // Generate a unique token
    let token = generateToken();
    // Ensure uniqueness
    let existing = await ctx.db
      .query("customers")
      .withIndex("by_wishlistShareToken", (q) =>
        q.eq("wishlistShareToken", token)
      )
      .unique();
    while (existing) {
      token = generateToken();
      existing = await ctx.db
        .query("customers")
        .withIndex("by_wishlistShareToken", (q) =>
          q.eq("wishlistShareToken", token)
        )
        .unique();
    }

    await ctx.db.patch(customer._id, { wishlistShareToken: token });
    return { token };
  },
});

export const getSharedWishlist = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const customer = await ctx.db
      .query("customers")
      .withIndex("by_wishlistShareToken", (q) =>
        q.eq("wishlistShareToken", args.token)
      )
      .unique();
    if (!customer) return null;

    const wishlistItems = await ctx.db
      .query("wishlists")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .collect();

    const items = await Promise.all(
      wishlistItems.map(async (wi) => {
        const variant = await ctx.db.get(wi.variantId);
        if (!variant || !variant.isActive) return null;

        const style = await ctx.db.get(variant.styleId);
        if (!style || !style.isActive) return null;

        const category = await ctx.db.get(style.categoryId);
        const brand = category ? await ctx.db.get(category.brandId) : null;

        // Get primary image
        const images = await ctx.db
          .query("productImages")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .collect();
        const primary = images.find((img) => img.isPrimary);
        const imageUrl = primary
          ? await ctx.storage.getUrl(primary.storageId)
          : null;
        const brandLogoUrl = brand?.storageId
          ? await ctx.storage.getUrl(brand.storageId)
          : null;

        return {
          variantId: variant._id,
          styleId: style._id,
          styleName: style.name,
          brandName: brand?.name ?? "",
          color: variant.color,
          size: variant.size,
          priceCentavos: variant.priceCentavos,
          imageUrl,
          brandLogoUrl,
        };
      })
    );

    return {
      ownerFirstName: customer.firstName,
      items: items.filter((i) => i !== null),
    };
  },
});

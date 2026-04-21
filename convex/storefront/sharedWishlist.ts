import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

// ─── Mutations ───────────────────────────────────────────────────────────────

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
      return customer.wishlistShareToken;
    }

    // Generate a random token
    const token =
      Math.random().toString(36).slice(2) + Date.now().toString(36);

    await ctx.db.patch(customer._id, { wishlistShareToken: token });
    return token;
  },
});

// ─── Queries ─────────────────────────────────────────────────────────────────

export const getSharedWishlist = query({
  args: { shareToken: v.string() },
  handler: async (ctx, args) => {
    const customer = await ctx.db
      .query("customers")
      .withIndex("by_wishlistShareToken", (q) =>
        q.eq("wishlistShareToken", args.shareToken)
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
        const imageUrl = primary
          ? await ctx.storage.getUrl(primary.storageId)
          : null;

        // Check stock availability (total quantity across all branches)
        const inventory = await ctx.db
          .query("inventory")
          .withIndex("by_variant", (q) => q.eq("variantId", variant._id))
          .collect();
        const totalQuantity = inventory.reduce(
          (sum, inv) => sum + inv.quantity,
          0
        );

        return {
          variantId: variant._id,
          styleId: style._id,
          styleName: style.name,
          brandName: brand?.name ?? "",
          size: variant.size,
          color: variant.color,
          priceCentavos: variant.priceCentavos,
          imageUrl,
          inStock: totalQuantity > 0,
        };
      })
    );

    return {
      customerName: `${customer.firstName} ${customer.lastName}`,
      items: items.filter(
        (i): i is NonNullable<typeof i> => i !== null
      ),
    };
  },
});

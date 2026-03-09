import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const toggleSaveItem = mutation({
  args: {
    styleId: v.id("styles"),
    variantId: v.optional(v.id("variants")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("clerkId"), identity.subject))
      .first();
    if (!user) throw new Error("User not found");

    const existing = await ctx.db
      .query("savedItems")
      .withIndex("by_customer_style", (q) =>
        q.eq("customerId", user._id).eq("styleId", args.styleId)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { saved: false };
    }

    await ctx.db.insert("savedItems", {
      customerId: user._id,
      styleId: args.styleId,
      variantId: args.variantId,
      savedAt: Date.now(),
    });

    return { saved: true };
  },
});

export const isItemSaved = query({
  args: { styleId: v.id("styles") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("clerkId"), identity.subject))
      .first();
    if (!user) return false;

    const existing = await ctx.db
      .query("savedItems")
      .withIndex("by_customer_style", (q) =>
        q.eq("customerId", user._id).eq("styleId", args.styleId)
      )
      .first();

    return !!existing;
  },
});

export const getMySavedItems = query({
  args: {
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { items: [], hasMore: false };

    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("clerkId"), identity.subject))
      .first();
    if (!user) return { items: [], hasMore: false };

    const limit = args.limit ?? 20;
    const allSaved = await ctx.db
      .query("savedItems")
      .withIndex("by_customer", (q) => q.eq("customerId", user._id))
      .order("desc")
      .collect();

    // Cursor-based pagination (timestamp)
    let filtered = allSaved;
    if (args.cursor) {
      filtered = allSaved.filter((s) => s.savedAt < args.cursor!);
    }

    const page = filtered.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const items = hasMore ? page.slice(0, limit) : page;

    const results = [];
    for (const item of items) {
      const style = await ctx.db.get(item.styleId);
      if (!style) continue;

      // Get primary image
      let primaryImageUrl: string | undefined;
      const imgs = await ctx.db
        .query("productImages")
        .withIndex("by_style", (q) => q.eq("styleId", style._id))
        .collect();
      const primary = imgs.find((img) => img.isPrimary);
      if (primary) {
        primaryImageUrl = (await ctx.storage.getUrl(primary.storageId)) ?? undefined;
      }

      results.push({
        _id: item._id,
        styleId: style._id,
        name: style.name,
        basePriceCentavos: style.basePriceCentavos,
        primaryImageUrl,
        savedAt: item.savedAt,
      });
    }

    return { items: results, hasMore };
  },
});

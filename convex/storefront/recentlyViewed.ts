import { query, mutation } from "../_generated/server";
import { v } from "convex/values";

// ─── Track a product view ────────────────────────────────────────────────────

export const trackView = mutation({
  args: { styleId: v.id("styles") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return; // silently skip for guest users

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!customer) return;

    // Upsert — update viewedAt if already exists
    const existing = await ctx.db
      .query("recentlyViewed")
      .withIndex("by_customer_style", (q) =>
        q.eq("customerId", customer._id).eq("styleId", args.styleId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { viewedAt: Date.now() });
    } else {
      await ctx.db.insert("recentlyViewed", {
        customerId: customer._id,
        styleId: args.styleId,
        viewedAt: Date.now(),
      });
    }

    // Keep only the latest 50 views
    const allViews = await ctx.db
      .query("recentlyViewed")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .collect();
    if (allViews.length > 50) {
      const sorted = allViews.sort((a, b) => b.viewedAt - a.viewedAt);
      const toDelete = sorted.slice(50);
      for (const item of toDelete) {
        await ctx.db.delete(item._id);
      }
    }
  },
});

// ─── Get recently viewed products ────────────────────────────────────────────

export const getRecentlyViewed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!customer) return [];

    const views = await ctx.db
      .query("recentlyViewed")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .collect();

    // Sort by most recent and limit
    const limit = args.limit ?? 20;
    const sorted = views.sort((a, b) => b.viewedAt - a.viewedAt).slice(0, limit);

    // Enrich with style data
    const enriched = await Promise.all(
      sorted.map(async (view) => {
        const style = await ctx.db.get(view.styleId);
        if (!style || !style.isActive) return null;

        const category = style.categoryId ? await ctx.db.get(style.categoryId) : null;
        const brand = style.brandId
          ? await ctx.db.get(style.brandId)
          : category ? await ctx.db.get(category.brandId) : null;

        const images = await ctx.db
          .query("productImages")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .collect();
        const primary = images.find((img) => img.isPrimary);
        const primaryImageUrl = primary
          ? await ctx.storage.getUrl(primary.storageId)
          : null;

        const brandLogoUrl = brand?.storageId
          ? await ctx.storage.getUrl(brand.storageId)
          : null;

        const variants = await ctx.db
          .query("variants")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .collect();
        const activeVariants = variants.filter((vr) => vr.isActive);

        return {
          _id: view._id,
          styleId: style._id,
          name: style.name,
          brandName: brand?.name ?? "",
          basePriceCentavos: style.basePriceCentavos,
          primaryImageUrl,
          brandLogoUrl,
          variantCount: activeVariants.length,
          viewedAt: view.viewedAt,
        };
      })
    );

    return enriched.filter(Boolean);
  },
});

import { query } from "../_generated/server";
import { v } from "convex/values";

export const getGalleryPhotos = query({
  args: {
    limit: v.optional(v.number()),
    styleId: v.optional(v.id("styles")),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    let reviews;

    if (args.styleId) {
      // Filter by style using the existing index
      reviews = await ctx.db
        .query("reviews")
        .withIndex("by_style_approved", (q) =>
          q.eq("styleId", args.styleId!).eq("isApproved", true)
        )
        .collect();
    } else {
      // Get recent approved reviews across all styles
      reviews = await ctx.db
        .query("reviews")
        .order("desc")
        .filter((q) => q.eq(q.field("isApproved"), true))
        .collect();
    }

    // Keep only reviews that have images
    const withImages = reviews.filter(
      (r) => r.imageStorageIds && r.imageStorageIds.length > 0
    );

    // Sort by most recent and cap at limit
    withImages.sort((a, b) => b.createdAt - a.createdAt);
    const capped = withImages.slice(0, limit);

    // Resolve related data in parallel
    const results = await Promise.all(
      capped.map(async (review) => {
        // Customer name
        const customer = await ctx.db.get(review.customerId);
        let customerName = "Anonymous";
        if (customer) {
          const lastInitial = customer.lastName
            ? customer.lastName.charAt(0).toUpperCase() + "."
            : "";
          customerName = `${customer.firstName} ${lastInitial}`.trim();
        }

        // Style + category + brand chain
        const style = await ctx.db.get(review.styleId);
        let styleName = "Unknown Style";
        let brandName = "Unknown Brand";
        if (style) {
          styleName = style.name;
          const category = style.categoryId ? await ctx.db.get(style.categoryId) : null;
          const resolvedBrandId = style.brandId ?? (category ? category.brandId : null);
          if (resolvedBrandId) {
            const brand = await ctx.db.get(resolvedBrandId);
            if (brand) brandName = brand.name;
          }
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
          reviewId: review._id,
          styleId: review.styleId,
          styleName,
          brandName,
          customerName,
          rating: review.rating,
          imageUrls,
          sizeFeedback: review.sizeFeedback ?? null,
          createdAt: review.createdAt,
        };
      })
    );

    return results;
  },
});

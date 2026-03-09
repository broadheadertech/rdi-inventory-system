import { query } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

// ─── Smart Search (No Auth Required) ─────────────────────────────────────────
// Lightweight autocomplete query for the customer-facing search bar.
// Returns up to 8 results mixing styles and brands.

type SearchResult = {
  type: "style" | "brand";
  id: string;
  name: string;
  brandName?: string;
  priceCentavos?: number;
  imageUrl?: string;
};

export const searchProducts = query({
  args: { term: v.string() },
  handler: async (ctx, args): Promise<SearchResult[]> => {
    const term = args.term.toLowerCase().trim();
    if (term.length < 2) return [];

    // Pre-fetch brands and categories for name resolution
    const allBrands = await ctx.db.query("brands").collect();
    const activeBrands = allBrands.filter((b) => b.isActive);
    const brandMap = new Map(activeBrands.map((b) => [String(b._id), b]));

    const allCategories = await ctx.db.query("categories").collect();
    const catMap = new Map(allCategories.map((c) => [String(c._id), c]));

    // ── Brand matches ──────────────────────────────────────────────────────
    const brandResults: SearchResult[] = activeBrands
      .filter((b) => b.name.toLowerCase().includes(term))
      .slice(0, 3)
      .map((b) => ({
        type: "brand" as const,
        id: String(b._id),
        name: b.name,
      }));

    // ── Style matches ──────────────────────────────────────────────────────
    const allStyles = await ctx.db.query("styles").collect();
    const matchingStyles = allStyles
      .filter((s) => s.isActive && s.name.toLowerCase().includes(term))
      .slice(0, 8);

    const styleResults: SearchResult[] = await Promise.all(
      matchingStyles.map(async (style) => {
        // Resolve brand name: style → category → brand
        const category = catMap.get(String(style.categoryId));
        const brand = category
          ? brandMap.get(String(category.brandId))
          : null;

        // Get primary product image
        const images = await ctx.db
          .query("productImages")
          .withIndex("by_style", (q) =>
            q.eq("styleId", style._id as Id<"styles">)
          )
          .collect();
        const primary = images.find((img) => img.isPrimary);
        const imageUrl = primary
          ? await ctx.storage.getUrl(primary.storageId)
          : null;

        return {
          type: "style" as const,
          id: String(style._id),
          name: style.name,
          brandName: brand?.name,
          priceCentavos: style.basePriceCentavos,
          imageUrl: imageUrl ?? undefined,
        };
      })
    );

    // Combine: styles first, then brands — cap at 8 total
    const combined: SearchResult[] = [...styleResults, ...brandResults];
    return combined.slice(0, 8);
  },
});

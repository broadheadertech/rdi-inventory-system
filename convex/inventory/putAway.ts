import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireRole } from "../_helpers/permissions";
import { withBranchScope } from "../_helpers/withBranchScope";

const PUT_AWAY_ROLES = [
  "warehouse_manager",
  "warehouse_staff",
  "branch_manager",
  "branch_staff",
] as const;

export const getSuggestedLocations = query({
  args: {
    variantId: v.id("variants"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [...PUT_AWAY_ROLES]);
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return { suggestions: [] };

    const variant = await ctx.db.get(args.variantId);
    if (!variant) return { suggestions: [] };

    // Get the style to determine category
    const style = await ctx.db.get(variant.styleId);
    if (!style) return { suggestions: [] };

    const category = style.categoryId ? await ctx.db.get(style.categoryId) : null;
    const categoryName = category?.name ?? "General";

    // Generate suggested locations based on category and size
    const sizeGroup = variant.sizeGroup ?? "default";
    const aisle = categoryName.charAt(0).toUpperCase();
    const shelf = sizeGroup === "default" ? "1" : sizeGroup;

    return {
      suggestions: [
        {
          location: `${aisle}-${shelf}-${variant.size}`,
          reason: `Category: ${categoryName}, Size: ${variant.size}`,
          priority: "primary" as const,
        },
        {
          location: `OVF-${aisle}-1`,
          reason: "Overflow area",
          priority: "secondary" as const,
        },
      ],
      variant: {
        sku: variant.sku,
        size: variant.size,
        color: variant.color,
      },
    };
  },
});

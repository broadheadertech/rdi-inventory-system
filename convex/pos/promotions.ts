import { v, ConvexError } from "convex/values";
import { query } from "../_generated/server";
import { withBranchScope } from "../_helpers/withBranchScope";
import { POS_ROLES } from "../_helpers/permissions";
// ─── getActivePromotions ────────────────────────────────────────────────────
// Returns promotions currently active for the cashier's branch.

export const getActivePromotions = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const branchId = scope.branchId;
    if (!branchId) return [];

    const branch = await ctx.db.get(branchId);
    const now = Date.now();

    const allActive = await ctx.db
      .query("promotions")
      .withIndex("by_isActive", (q) => q.eq("isActive", true))
      .collect();

    // Filter: within date range (endDate optional = no expiration) AND applicable to this branch
    const applicable = allActive.filter((promo) => {
      if (now < promo.startDate) return false;
      if (promo.endDate !== undefined && now > promo.endDate) return false;

      // Branch scope: classification OR specific branch IDs
      const hasClassFilter = promo.branchClassifications && promo.branchClassifications.length > 0;
      const hasBranchIdFilter = promo.branchIds.length > 0;
      if (hasClassFilter || hasBranchIdFilter) {
        const matchesClass = hasClassFilter && branch?.classification
          ? promo.branchClassifications!.includes(branch.classification)
          : false;
        const matchesBranchId = hasBranchIdFilter && promo.branchIds.includes(branchId);
        if (!matchesClass && !matchesBranchId) return false;
      }

      return true;
    });

    // Sort by priority (highest first)
    applicable.sort((a, b) => b.priority - a.priority);

    return applicable.map((p) => ({
      _id: p._id,
      name: p.name,
      description: p.description,
      promoType: p.promoType,
      percentageValue: p.percentageValue,
      maxDiscountCentavos: p.maxDiscountCentavos,
      fixedAmountCentavos: p.fixedAmountCentavos,
      buyQuantity: p.buyQuantity,
      getQuantity: p.getQuantity,
      minSpendCentavos: p.minSpendCentavos,
      tieredDiscountCentavos: p.tieredDiscountCentavos,
      brandIds: p.brandIds.map(String),
      categoryIds: p.categoryIds.map(String),
      variantIds: p.variantIds.map(String),
      styleIds: (p.styleIds ?? []).map(String),
      genders: p.genders ?? [],
      colors: p.colors ?? [],
      sizes: p.sizes ?? [],
      priority: p.priority,
      agingTiers: p.agingTiers ?? [],
      branchClassifications: p.branchClassifications ?? [],
    }));
  },
});

// ─── getVariantHierarchy ────────────────────────────────────────────────────
// Returns brandId + categoryId + agingTier for each variant in the cart.
// Used by client for promo eligibility preview.

export const getVariantHierarchy = query({
  args: {
    variantIds: v.array(v.id("variants")),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const branchId = scope.branchId;
    const result: Record<string, { brandId: string; categoryId: string; styleId: string; gender: string; color: string; sizeGroup: string; size: string; agingTier: "green" | "yellow" | "red" }> = {};

    // Cache to avoid repeated lookups
    const categoryBrandCache = new Map<string, string>();

    for (const variantId of args.variantIds) {
      const variant = await ctx.db.get(variantId);
      if (!variant) continue;

      const style = await ctx.db.get(variant.styleId);
      if (!style) continue;

      const categoryId = String(style.categoryId);
      let brandId = categoryBrandCache.get(categoryId);

      if (!brandId) {
        const category = await ctx.db.get(style.categoryId);
        if (category) {
          brandId = String(category.brandId);
          categoryBrandCache.set(categoryId, brandId);
        }
      }

      // Determine aging tier from oldest batch at this branch
      let agingTier: "green" | "yellow" | "red" = "green";
      if (branchId) {
        const oldestBatch = await ctx.db
          .query("inventoryBatches")
          .withIndex("by_branch_variant_received", (q) =>
            q.eq("branchId", branchId).eq("variantId", variantId)
          )
          .first(); // ascending by receivedAt = oldest first

        if (oldestBatch && oldestBatch.quantity > 0) {
          const ageDays = Math.floor((Date.now() - oldestBatch.receivedAt) / 86_400_000);
          if (ageDays > 180) agingTier = "red";
          else if (ageDays > 90) agingTier = "yellow";
        }
      }

      result[String(variantId)] = {
        brandId: brandId ?? "",
        categoryId,
        styleId: String(variant.styleId),
        gender: variant.gender ?? "",
        color: variant.color,
        sizeGroup: variant.sizeGroup ?? "",
        size: variant.size,
        agingTier,
      };
    }

    return result;
  },
});

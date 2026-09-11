import { v, ConvexError } from "convex/values";
import { query, mutation } from "../_generated/server";
import { requireRole, ADMIN_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

// ─── Queries ────────────────────────────────────────────────────────────────

export const listPromotions = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ADMIN_ROLES);
    return ctx.db.query("promotions").order("desc").collect();
  },
});

export const getPromotionById = query({
  args: { promotionId: v.id("promotions") },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);
    return ctx.db.get(args.promotionId);
  },
});

// ─── Shared Validation ──────────────────────────────────────────────────────

const promoTypeValidator = v.union(
  v.literal("percentage"),
  v.literal("fixedAmount"),
  v.literal("buyXGetY"),
  v.literal("tiered"),
  v.literal("crossSell"),
  v.literal("pwp")
);

const commonArgs = {
  name: v.string(),
  description: v.optional(v.string()),
  promoType: promoTypeValidator,
  percentageValue: v.optional(v.number()),
  maxDiscountCentavos: v.optional(v.number()),
  fixedAmountCentavos: v.optional(v.number()),
  buyQuantity: v.optional(v.number()),
  getQuantity: v.optional(v.number()),
  minSpendCentavos: v.optional(v.number()),
  tieredDiscountCentavos: v.optional(v.number()),
  discountApplication: v.optional(v.union(v.literal("wholePurchase"), v.literal("highestItem"))),
  branchIds: v.array(v.id("branches")),
  branchClassifications: v.optional(
    v.array(v.union(v.literal("premium"), v.literal("aclass"), v.literal("bnc"), v.literal("outlet")))
  ),
  brandIds: v.array(v.id("brands")),
  categoryIds: v.array(v.id("categories")),
  variantIds: v.array(v.id("variants")),
  styleIds: v.optional(v.array(v.id("styles"))),
  genders: v.optional(
    v.array(v.union(v.literal("mens"), v.literal("womens"), v.literal("unisex"), v.literal("kids"), v.literal("boys"), v.literal("girls")))
  ),
  colors: v.optional(v.array(v.string())),
  sizes: v.optional(v.array(v.string())),
  startDate: v.number(),
  endDate: v.optional(v.number()),
  isActive: v.boolean(),
  priority: v.number(),
  agingTiers: v.optional(v.array(v.union(v.literal("green"), v.literal("yellow"), v.literal("red")))),
  crossSellRewardType: v.optional(v.union(v.literal("percentage"), v.literal("fixedAmount"))),
  rewardBrandIds: v.optional(v.array(v.id("brands"))),
  rewardCategoryIds: v.optional(v.array(v.id("categories"))),
  rewardStyleIds: v.optional(v.array(v.id("styles"))),
  rewardVariantIds: v.optional(v.array(v.id("variants"))),
  pwpTriggerMinQuantity: v.optional(v.number()),
  pwpRewardVariantIds: v.optional(v.array(v.id("variants"))),
  pwpRewardPriceCentavos: v.optional(v.number()),
};

function validatePromoFields(args: {
  promoType: string;
  percentageValue?: number;
  maxDiscountCentavos?: number;
  fixedAmountCentavos?: number;
  buyQuantity?: number;
  getQuantity?: number;
  minSpendCentavos?: number;
  tieredDiscountCentavos?: number;
  crossSellRewardType?: "percentage" | "fixedAmount";
  pwpTriggerMinQuantity?: number;
  pwpRewardVariantIds?: string[];
  pwpRewardPriceCentavos?: number;
  startDate: number;
  endDate?: number;
}) {
  if (args.endDate !== undefined && args.startDate >= args.endDate) {
    throw new ConvexError("Start date must be before end date");
  }

  switch (args.promoType) {
    case "percentage": {
      const pct = args.percentageValue;
      if (pct === undefined || pct <= 0 || pct > 100) {
        throw new ConvexError("Percentage must be between 1 and 100");
      }
      if (args.maxDiscountCentavos !== undefined && args.maxDiscountCentavos <= 0) {
        throw new ConvexError("Max discount cap must be positive");
      }
      break;
    }
    case "fixedAmount": {
      if (!args.fixedAmountCentavos || args.fixedAmountCentavos <= 0) {
        throw new ConvexError("Fixed discount amount must be positive");
      }
      break;
    }
    case "buyXGetY": {
      if (!args.buyQuantity || args.buyQuantity < 1) {
        throw new ConvexError("Buy quantity must be at least 1");
      }
      if (!args.getQuantity || args.getQuantity < 1) {
        throw new ConvexError("Free quantity must be at least 1");
      }
      break;
    }
    case "tiered": {
      if (!args.minSpendCentavos || args.minSpendCentavos <= 0) {
        throw new ConvexError("Minimum spend must be positive");
      }
      if (!args.tieredDiscountCentavos || args.tieredDiscountCentavos <= 0) {
        throw new ConvexError("Tiered discount amount must be positive");
      }
      break;
    }
    case "crossSell": {
      if (!args.crossSellRewardType) {
        throw new ConvexError("Cross-sell reward type (percentage or fixed) is required");
      }
      if (args.crossSellRewardType === "percentage") {
        const pct = args.percentageValue;
        if (pct === undefined || pct <= 0 || pct > 100) {
          throw new ConvexError("Reward percentage must be between 1 and 100");
        }
      } else {
        if (!args.fixedAmountCentavos || args.fixedAmountCentavos <= 0) {
          throw new ConvexError("Reward fixed amount must be positive");
        }
      }
      break;
    }
    case "pwp": {
      if (!args.pwpTriggerMinQuantity || args.pwpTriggerMinQuantity < 1) {
        throw new ConvexError("Trigger minimum quantity must be at least 1");
      }
      if (!args.pwpRewardVariantIds || args.pwpRewardVariantIds.length === 0) {
        throw new ConvexError("At least one reward product must be selected");
      }
      if (args.pwpRewardPriceCentavos === undefined || args.pwpRewardPriceCentavos < 0) {
        throw new ConvexError("Reward special price must be 0 or more");
      }
      break;
    }
  }
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export const createPromotion = mutation({
  args: commonArgs,
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);

    validatePromoFields(args);

    const now = Date.now();
    const promotionId = await ctx.db.insert("promotions", {
      ...args,
      createdById: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "promotion.create",
      userId: user._id,
      entityType: "promotions",
      entityId: promotionId,
      after: { name: args.name, promoType: args.promoType, isActive: args.isActive },
    });

    return { promotionId };
  },
});

export const updatePromotion = mutation({
  args: {
    promotionId: v.id("promotions"),
    ...commonArgs,
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);

    const existing = await ctx.db.get(args.promotionId);
    if (!existing) throw new ConvexError("Promotion not found");

    validatePromoFields(args);

    const { promotionId, ...updates } = args;
    await ctx.db.patch(promotionId, {
      ...updates,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "promotion.update",
      userId: user._id,
      entityType: "promotions",
      entityId: promotionId,
      before: { name: existing.name, isActive: existing.isActive },
      after: { name: args.name, isActive: args.isActive },
    });

    return { promotionId };
  },
});

export const togglePromotionStatus = mutation({
  args: {
    promotionId: v.id("promotions"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);

    const existing = await ctx.db.get(args.promotionId);
    if (!existing) throw new ConvexError("Promotion not found");

    await ctx.db.patch(args.promotionId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: args.isActive ? "promotion.activate" : "promotion.deactivate",
      userId: user._id,
      entityType: "promotions",
      entityId: args.promotionId,
      before: { isActive: existing.isActive },
      after: { isActive: args.isActive },
    });

    return { promotionId: args.promotionId };
  },
});

// ─── Helper Queries for Form Pickers ────────────────────────────────────────

export const listCategoriesForPromo = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ADMIN_ROLES);
    const categories = await ctx.db.query("categories").collect();
    return categories.filter((c) => c.isActive);
  },
});

export const listStylesForPromo = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ADMIN_ROLES);
    const styles = await ctx.db.query("styles").collect();
    return styles.filter((s) => s.isActive);
  },
});

export const listVariantsForStyles = query({
  args: { styleIds: v.array(v.id("styles")) },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);
    if (args.styleIds.length === 0) return [];
    const batches = await Promise.all(
      args.styleIds.map((sid) =>
        ctx.db
          .query("variants")
          .withIndex("by_style", (q) => q.eq("styleId", sid))
          .collect()
      )
    );
    return batches.flat().filter((v) => v.isActive !== false);
  },
});

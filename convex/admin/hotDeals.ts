import { v, ConvexError } from "convex/values";
import { query, mutation } from "../_generated/server";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

// ─── Queries ────────────────────────────────────────────────────────────────

export const listHotDeals = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);
    const all = await ctx.db.query("hotDeals").collect();

    const enriched = await Promise.all(
      all.map(async (deal) => {
        const style = await ctx.db.get(deal.styleId);
        if (!style) return { ...deal, styleName: "(deleted)", brandName: "", imageUrl: null };

        const category = await ctx.db.get(style.categoryId);
        const brand = category ? await ctx.db.get(category.brandId) : null;

        const images = await ctx.db
          .query("productImages")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .collect();
        const primary = images.find((img) => img.isPrimary);
        const imageUrl = primary ? await ctx.storage.getUrl(primary.storageId) : null;

        return {
          ...deal,
          styleName: style.name,
          brandName: brand?.name ?? "",
          imageUrl,
        };
      })
    );

    return enriched.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/** Public — used by storefront homepage */
export const getActiveHotDeals = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const all = await ctx.db
      .query("hotDeals")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const valid = all.filter(
      (d) =>
        (!d.startDate || d.startDate <= now) &&
        (!d.endDate || d.endDate >= now)
    );

    const enriched = await Promise.all(
      valid.map(async (deal) => {
        const style = await ctx.db.get(deal.styleId);
        if (!style || !style.isActive) return null;

        const category = await ctx.db.get(style.categoryId);
        const brand = category ? await ctx.db.get(category.brandId) : null;

        const images = await ctx.db
          .query("productImages")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .collect();
        const primary = images.find((img) => img.isPrimary);
        const imageUrl = primary ? await ctx.storage.getUrl(primary.storageId) : null;

        const brandLogoUrl = brand?.storageId
          ? await ctx.storage.getUrl(brand.storageId)
          : null;

        // Get variant prices
        const variants = await ctx.db
          .query("variants")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .collect();
        const activeVariants = variants.filter((v) => v.isActive);
        const minPrice =
          activeVariants.length > 0
            ? Math.min(...activeVariants.map((v) => v.priceCentavos))
            : style.basePriceCentavos;

        return {
          _id: deal._id,
          styleId: style._id,
          styleName: style.name,
          brandName: brand?.name ?? "",
          label: deal.label,
          imageUrl,
          brandLogoUrl,
          basePriceCentavos: style.basePriceCentavos,
          minPriceCentavos: minPrice,
          sortOrder: deal.sortOrder,
        };
      })
    );

    return enriched
      .filter((d) => d !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

// ─── Mutations ──────────────────────────────────────────────────────────────

export const createHotDeal = mutation({
  args: {
    styleId: v.id("styles"),
    label: v.string(),
    sortOrder: v.number(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    // Check style exists
    const style = await ctx.db.get(args.styleId);
    if (!style) throw new ConvexError({ code: "NOT_FOUND", message: "Style not found" });

    // Check not already a hot deal
    const existing = await ctx.db
      .query("hotDeals")
      .withIndex("by_style", (q) => q.eq("styleId", args.styleId))
      .first();
    if (existing) throw new ConvexError({ code: "DUPLICATE", message: "This product is already a hot deal" });

    const id = await ctx.db.insert("hotDeals", {
      styleId: args.styleId,
      label: args.label,
      sortOrder: args.sortOrder,
      isActive: true,
      startDate: args.startDate,
      endDate: args.endDate,
      createdAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "hotDeal.create",
      userId: user._id,
      entityType: "hotDeals",
      entityId: id,
      after: { styleName: style.name, label: args.label },
    });

    return id;
  },
});

export const updateHotDeal = mutation({
  args: {
    hotDealId: v.id("hotDeals"),
    label: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const existing = await ctx.db.get(args.hotDealId);
    if (!existing) throw new ConvexError({ code: "NOT_FOUND", message: "Hot deal not found" });

    const { hotDealId, ...updates } = args;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) patch[key] = value;
    }

    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(hotDealId, patch);

    await _logAuditEntry(ctx, {
      action: "hotDeal.update",
      userId: user._id,
      entityType: "hotDeals",
      entityId: hotDealId,
      after: patch,
    });
  },
});

export const toggleHotDealStatus = mutation({
  args: {
    hotDealId: v.id("hotDeals"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const existing = await ctx.db.get(args.hotDealId);
    if (!existing) throw new ConvexError({ code: "NOT_FOUND", message: "Hot deal not found" });

    await ctx.db.patch(args.hotDealId, { isActive: args.isActive });

    await _logAuditEntry(ctx, {
      action: args.isActive ? "hotDeal.activate" : "hotDeal.deactivate",
      userId: user._id,
      entityType: "hotDeals",
      entityId: args.hotDealId,
    });
  },
});

export const deleteHotDeal = mutation({
  args: { hotDealId: v.id("hotDeals") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const existing = await ctx.db.get(args.hotDealId);
    if (!existing) throw new ConvexError({ code: "NOT_FOUND", message: "Hot deal not found" });

    await ctx.db.delete(args.hotDealId);

    await _logAuditEntry(ctx, {
      action: "hotDeal.delete",
      userId: user._id,
      entityType: "hotDeals",
      entityId: args.hotDealId,
    });
  },
});

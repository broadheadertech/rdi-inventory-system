import { query } from "../_generated/server";

export const getMyWrapped = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!customer) return null;

    // Get current year boundaries
    const now = new Date();
    const currentYear = now.getFullYear();
    const yearStart = new Date(currentYear, 0, 1).getTime();
    const yearEnd = new Date(currentYear + 1, 0, 1).getTime();

    // Get all orders for this customer this year
    const allOrders = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .collect();

    const validStatuses = ["delivered", "paid", "shipped"];
    const orders = allOrders.filter(
      (o) =>
        o.createdAt >= yearStart &&
        o.createdAt < yearEnd &&
        validStatuses.includes(o.status)
    );

    if (orders.length === 0) return null;

    const totalOrders = orders.length;
    const totalSpentCentavos = orders.reduce((sum, o) => sum + o.totalCentavos, 0);

    // Monthly spending
    const monthlySpending = Array.from({ length: 12 }, (_, i) => ({
      month: i,
      spentCentavos: 0,
    }));
    for (const order of orders) {
      const month = new Date(order.createdAt).getMonth();
      monthlySpending[month].spentCentavos += order.totalCentavos;
    }

    // Gather all order items
    const orderIds = new Set(orders.map((o) => o._id));
    const allOrderItems = [];
    for (const order of orders) {
      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();
      allOrderItems.push(...items);
    }

    const totalItems = allOrderItems.reduce((sum, item) => sum + item.quantity, 0);

    // Resolve variants, styles, categories, brands for analytics
    const colorCounts: Record<string, number> = {};
    const sizeCounts: Record<string, number> = {};
    const brandCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};

    // Cache lookups
    const variantCache = new Map<string, any>();
    const styleCache = new Map<string, any>();
    const categoryCache = new Map<string, any>();
    const brandCache = new Map<string, any>();

    for (const item of allOrderItems) {
      // Variant
      let variant = variantCache.get(item.variantId);
      if (!variant) {
        variant = await ctx.db.get(item.variantId);
        if (variant) variantCache.set(item.variantId, variant);
      }
      if (!variant) continue;

      const qty = item.quantity;

      // Color & Size
      colorCounts[variant.color] = (colorCounts[variant.color] ?? 0) + qty;
      sizeCounts[variant.size] = (sizeCounts[variant.size] ?? 0) + qty;

      // Style
      let style = styleCache.get(variant.styleId);
      if (!style) {
        style = await ctx.db.get(variant.styleId);
        if (style) styleCache.set(variant.styleId, style);
      }
      if (!style) continue;

      // Category
      let category = style.categoryId ? categoryCache.get(style.categoryId) : undefined;
      if (!category && style.categoryId) {
        category = await ctx.db.get(style.categoryId) ?? undefined;
        if (category) categoryCache.set(style.categoryId, category);
      }
      if (!category && !style.brandId) continue;

      if (category) {
        categoryCounts[category.name] = (categoryCounts[category.name] ?? 0) + qty;
      }

      // Brand
      const resolvedBrandId = style.brandId ?? category?.brandId;
      let brand = brandCache.get(resolvedBrandId);
      if (!brand) {
        brand = await ctx.db.get(resolvedBrandId);
        if (brand) brandCache.set(resolvedBrandId, brand);
      }
      if (!brand) continue;

      brandCounts[brand.name] = (brandCounts[brand.name] ?? 0) + qty;
    }

    // Helpers to find top entry
    function topEntry(counts: Record<string, number>): string | null {
      let max = 0;
      let top: string | null = null;
      for (const [key, count] of Object.entries(counts)) {
        if (count > max) {
          max = count;
          top = key;
        }
      }
      return top;
    }

    const favoriteColor = topEntry(colorCounts) ?? "Unknown";
    const favoriteSize = topEntry(sizeCounts) ?? "Unknown";
    const favoriteBrand = topEntry(brandCounts) ?? "Unknown";

    // Top 3 categories
    const topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));

    // Percentile estimate
    const spentPesos = totalSpentCentavos / 100;
    let percentile: string;
    if (spentPesos > 50000) {
      percentile = "Top 5%";
    } else if (spentPesos > 20000) {
      percentile = "Top 15%";
    } else if (spentPesos > 10000) {
      percentile = "Top 30%";
    } else {
      percentile = "Member";
    }

    return {
      year: currentYear,
      totalOrders,
      totalSpentCentavos,
      totalItems,
      favoriteColor,
      favoriteSize,
      favoriteBrand,
      topCategories,
      monthlySpending,
      percentile,
    };
  },
});

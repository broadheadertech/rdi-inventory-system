import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import { withBranchScope } from "../_helpers/withBranchScope";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function getPHTDayStartMs(): number {
  const nowUtcMs = Date.now();
  const nowPhtMs = nowUtcMs + PHT_OFFSET_MS;
  const todayPhtStartMs = nowPhtMs - (nowPhtMs % DAY_MS);
  return todayPhtStartMs - PHT_OFFSET_MS;
}

function resolvePeriod(args: { startMs?: number; endMs?: number }): {
  startMs: number;
  endMs: number;
  durationMs: number;
  durationDays: number;
} {
  const nowMs = Date.now();
  const endMs = args.endMs ?? nowMs;
  const startMs = args.startMs ?? getPHTDayStartMs() - 7 * DAY_MS;
  const durationMs = Math.max(endMs - startMs, 1);
  return { startMs, endMs, durationMs, durationDays: Math.max(1, durationMs / DAY_MS) };
}

// ─── Shared: build variant→hierarchy lookup ──────────────────────────────────

type HierarchyEntry = {
  brandId: string;
  brandName: string;
  categoryId: string;
  categoryName: string;
  styleName: string;
  size: string;
  color: string;
};

async function buildVariantHierarchy(
  ctx: { db: { get: (id: any) => Promise<any> } },
  variantIds: Set<string>
): Promise<Map<string, HierarchyEntry>> {
  const map = new Map<string, HierarchyEntry>();
  const styleCache = new Map<string, Doc<"styles"> | null>();
  const categoryCache = new Map<string, Doc<"categories"> | null>();
  const brandCache = new Map<string, Doc<"brands"> | null>();

  for (const vid of variantIds) {
    const variant = await ctx.db.get(vid as Id<"variants">);
    if (!variant) continue;

    const styleKey = variant.styleId as string;
    if (!styleCache.has(styleKey)) {
      styleCache.set(styleKey, await ctx.db.get(variant.styleId) ?? null);
    }
    const style = styleCache.get(styleKey)!;
    if (!style) continue;

    const catKey = style.categoryId ? (style.categoryId as string) : "";
    let category: Doc<"categories"> | null = null;
    if (catKey) {
      if (!categoryCache.has(catKey)) {
        categoryCache.set(catKey, await ctx.db.get(style.categoryId!) ?? null);
      }
      category = categoryCache.get(catKey)!;
    }
    if (!style.brandId && !category) continue;

    const brandKey = (style.brandId ?? category?.brandId) as string;
    if (!brandKey) continue;
    if (!brandCache.has(brandKey)) {
      brandCache.set(brandKey, await ctx.db.get(brandKey as Id<"brands">) ?? null);
    }
    const brand = brandCache.get(brandKey)!;
    if (!brand) continue;

    map.set(vid, {
      brandId: brand._id as string,
      brandName: brand.name,
      categoryId: (category?._id ?? "") as string,
      categoryName: category?.name ?? "",
      styleName: style.name,
      size: variant.size,
      color: variant.color,
    });
  }
  return map;
}

// ─── Shared: fetch transaction items aggregated by variant ───────────────────

type VariantAgg = { qty: number; revenue: number };

async function aggregateTransactionItems(
  ctx: any,
  txns: Doc<"transactions">[]
): Promise<Map<string, VariantAgg>> {
  const variantAgg = new Map<string, VariantAgg>();
  for (const txn of txns) {
    const items = await ctx.db
      .query("transactionItems")
      .withIndex("by_transaction", (q: any) => q.eq("transactionId", txn._id))
      .collect();
    for (const item of items) {
      const key = item.variantId as string;
      const existing = variantAgg.get(key) ?? { qty: 0, revenue: 0 };
      existing.qty += item.quantity;
      existing.revenue += item.lineTotalCentavos;
      variantAgg.set(key, existing);
    }
  }
  return variantAgg;
}

// ─── Shared: fetch transactions for branch or all retail branches ────────────

async function fetchBranchTransactions(
  ctx: any,
  branchId: Id<"branches">,
  startMs: number,
  endMs: number
): Promise<Doc<"transactions">[]> {
  return ctx.db
    .query("transactions")
    .withIndex("by_branch_date", (q: any) =>
      q.eq("branchId", branchId).gte("createdAt", startMs)
    )
    .filter((q: any) => q.lte(q.field("createdAt"), endMs))
    .collect();
}

async function fetchAllRetailTransactions(
  ctx: any,
  startMs: number,
  endMs: number
): Promise<Doc<"transactions">[]> {
  const branches = await ctx.db
    .query("branches")
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .collect();
  const retailBranches = branches.filter((b: any) => b.channel !== "warehouse");
  const allTxns = (
    await Promise.all(
      retailBranches.map((branch: any) =>
        ctx.db
          .query("transactions")
          .withIndex("by_branch_date", (q: any) =>
            q.eq("branchId", branch._id).gte("createdAt", startMs)
          )
          .filter((q: any) => q.lte(q.field("createdAt"), endMs))
          .collect()
      )
    )
  ).flat();
  return allTxns;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SALES BY CATEGORY
// ═══════════════════════════════════════════════════════════════════════════════

export const getSalesByCategory = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const { startMs, endMs } = resolvePeriod(args);
    const txns = await fetchBranchTransactions(ctx, branchId, startMs, endMs);
    const variantAgg = await aggregateTransactionItems(ctx, txns);
    const hierarchy = await buildVariantHierarchy(ctx, new Set(variantAgg.keys()));

    const categoryAgg = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const [vid, agg] of variantAgg) {
      const h = hierarchy.get(vid);
      if (!h) continue;
      const existing = categoryAgg.get(h.categoryId) ?? { name: h.categoryName, qty: 0, revenue: 0 };
      existing.qty += agg.qty;
      existing.revenue += agg.revenue;
      categoryAgg.set(h.categoryId, existing);
    }

    const totalRevenue = Array.from(categoryAgg.values()).reduce((s, c) => s + c.revenue, 0);
    return Array.from(categoryAgg.entries())
      .map(([categoryId, data]) => ({
        categoryId,
        name: data.name,
        unitsSold: data.qty,
        revenueCentavos: data.revenue,
        percentage: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0,
      }))
      .sort((a, b) => b.revenueCentavos - a.revenueCentavos);
  },
});

export const getHQSalesByCategory = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const { startMs, endMs } = resolvePeriod(args);
    const txns = await fetchAllRetailTransactions(ctx, startMs, endMs);
    const variantAgg = await aggregateTransactionItems(ctx, txns);
    const hierarchy = await buildVariantHierarchy(ctx, new Set(variantAgg.keys()));

    const categoryAgg = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const [vid, agg] of variantAgg) {
      const h = hierarchy.get(vid);
      if (!h) continue;
      const existing = categoryAgg.get(h.categoryId) ?? { name: h.categoryName, qty: 0, revenue: 0 };
      existing.qty += agg.qty;
      existing.revenue += agg.revenue;
      categoryAgg.set(h.categoryId, existing);
    }

    const totalRevenue = Array.from(categoryAgg.values()).reduce((s, c) => s + c.revenue, 0);
    return Array.from(categoryAgg.entries())
      .map(([categoryId, data]) => ({
        categoryId,
        name: data.name,
        unitsSold: data.qty,
        revenueCentavos: data.revenue,
        percentage: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0,
      }))
      .sort((a, b) => b.revenueCentavos - a.revenueCentavos);
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SALES BY SUBCATEGORY (drill-down: styles within a category)
// ═══════════════════════════════════════════════════════════════════════════════

export const getSalesBySubcategory = query({
  args: {
    categoryId: v.id("categories"),
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const { startMs, endMs } = resolvePeriod(args);
    const txns = await fetchBranchTransactions(ctx, branchId, startMs, endMs);
    const variantAgg = await aggregateTransactionItems(ctx, txns);
    const hierarchy = await buildVariantHierarchy(ctx, new Set(variantAgg.keys()));

    // Aggregate by style (subcategory level) within the selected category
    const styleAgg = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const [vid, agg] of variantAgg) {
      const h = hierarchy.get(vid);
      if (!h || h.categoryId !== (args.categoryId as string)) continue;
      const styleKey = h.styleName;
      const existing = styleAgg.get(styleKey) ?? { name: h.styleName, qty: 0, revenue: 0 };
      existing.qty += agg.qty;
      existing.revenue += agg.revenue;
      styleAgg.set(styleKey, existing);
    }

    const totalRevenue = Array.from(styleAgg.values()).reduce((s, c) => s + c.revenue, 0);
    return Array.from(styleAgg.values())
      .map((data) => ({
        name: data.name,
        unitsSold: data.qty,
        revenueCentavos: data.revenue,
        percentage: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0,
      }))
      .sort((a, b) => b.revenueCentavos - a.revenueCentavos)
      .slice(0, 15);
  },
});

export const getHQSalesBySubcategory = query({
  args: {
    categoryId: v.id("categories"),
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const { startMs, endMs } = resolvePeriod(args);
    const txns = await fetchAllRetailTransactions(ctx, startMs, endMs);
    const variantAgg = await aggregateTransactionItems(ctx, txns);
    const hierarchy = await buildVariantHierarchy(ctx, new Set(variantAgg.keys()));

    const styleAgg = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const [vid, agg] of variantAgg) {
      const h = hierarchy.get(vid);
      if (!h || h.categoryId !== (args.categoryId as string)) continue;
      const styleKey = h.styleName;
      const existing = styleAgg.get(styleKey) ?? { name: h.styleName, qty: 0, revenue: 0 };
      existing.qty += agg.qty;
      existing.revenue += agg.revenue;
      styleAgg.set(styleKey, existing);
    }

    const totalRevenue = Array.from(styleAgg.values()).reduce((s, c) => s + c.revenue, 0);
    return Array.from(styleAgg.values())
      .map((data) => ({
        name: data.name,
        unitsSold: data.qty,
        revenueCentavos: data.revenue,
        percentage: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0,
      }))
      .sort((a, b) => b.revenueCentavos - a.revenueCentavos)
      .slice(0, 15);
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// TOP BRANDS COMPARISON
// ═══════════════════════════════════════════════════════════════════════════════

export const getTopBrandsComparison = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const { startMs, endMs } = resolvePeriod(args);
    const txns = await fetchBranchTransactions(ctx, branchId, startMs, endMs);
    const variantAgg = await aggregateTransactionItems(ctx, txns);
    const hierarchy = await buildVariantHierarchy(ctx, new Set(variantAgg.keys()));

    const brandAgg = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const [vid, agg] of variantAgg) {
      const h = hierarchy.get(vid);
      if (!h) continue;
      const existing = brandAgg.get(h.brandId) ?? { name: h.brandName, qty: 0, revenue: 0 };
      existing.qty += agg.qty;
      existing.revenue += agg.revenue;
      brandAgg.set(h.brandId, existing);
    }

    const totalRevenue = Array.from(brandAgg.values()).reduce((s, c) => s + c.revenue, 0);
    const totalQty = Array.from(brandAgg.values()).reduce((s, c) => s + c.qty, 0);
    return Array.from(brandAgg.entries())
      .map(([brandId, data]) => ({
        brandId,
        name: data.name,
        unitsSold: data.qty,
        revenueCentavos: data.revenue,
        percentRevenue: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0,
        percentUnits: totalQty > 0 ? Math.round((data.qty / totalQty) * 100) : 0,
      }))
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 10);
  },
});

export const getHQTopBrandsComparison = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const { startMs, endMs } = resolvePeriod(args);
    const txns = await fetchAllRetailTransactions(ctx, startMs, endMs);
    const variantAgg = await aggregateTransactionItems(ctx, txns);
    const hierarchy = await buildVariantHierarchy(ctx, new Set(variantAgg.keys()));

    const brandAgg = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const [vid, agg] of variantAgg) {
      const h = hierarchy.get(vid);
      if (!h) continue;
      const existing = brandAgg.get(h.brandId) ?? { name: h.brandName, qty: 0, revenue: 0 };
      existing.qty += agg.qty;
      existing.revenue += agg.revenue;
      brandAgg.set(h.brandId, existing);
    }

    const totalRevenue = Array.from(brandAgg.values()).reduce((s, c) => s + c.revenue, 0);
    const totalQty = Array.from(brandAgg.values()).reduce((s, c) => s + c.qty, 0);
    return Array.from(brandAgg.entries())
      .map(([brandId, data]) => ({
        brandId,
        name: data.name,
        unitsSold: data.qty,
        revenueCentavos: data.revenue,
        percentRevenue: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0,
        percentUnits: totalQty > 0 ? Math.round((data.qty / totalQty) * 100) : 0,
      }))
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 10);
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// TOP CATEGORIES COMPARISON
// ═══════════════════════════════════════════════════════════════════════════════

export const getTopCategoriesComparison = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const { startMs, endMs } = resolvePeriod(args);
    const txns = await fetchBranchTransactions(ctx, branchId, startMs, endMs);
    const variantAgg = await aggregateTransactionItems(ctx, txns);
    const hierarchy = await buildVariantHierarchy(ctx, new Set(variantAgg.keys()));

    const categoryAgg = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const [vid, agg] of variantAgg) {
      const h = hierarchy.get(vid);
      if (!h) continue;
      const existing = categoryAgg.get(h.categoryId) ?? { name: h.categoryName, qty: 0, revenue: 0 };
      existing.qty += agg.qty;
      existing.revenue += agg.revenue;
      categoryAgg.set(h.categoryId, existing);
    }

    const totalRevenue = Array.from(categoryAgg.values()).reduce((s, c) => s + c.revenue, 0);
    const totalQty = Array.from(categoryAgg.values()).reduce((s, c) => s + c.qty, 0);
    return Array.from(categoryAgg.entries())
      .map(([categoryId, data]) => ({
        categoryId,
        name: data.name,
        unitsSold: data.qty,
        revenueCentavos: data.revenue,
        percentRevenue: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0,
        percentUnits: totalQty > 0 ? Math.round((data.qty / totalQty) * 100) : 0,
      }))
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 10);
  },
});

export const getHQTopCategoriesComparison = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const { startMs, endMs } = resolvePeriod(args);
    const txns = await fetchAllRetailTransactions(ctx, startMs, endMs);
    const variantAgg = await aggregateTransactionItems(ctx, txns);
    const hierarchy = await buildVariantHierarchy(ctx, new Set(variantAgg.keys()));

    const categoryAgg = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const [vid, agg] of variantAgg) {
      const h = hierarchy.get(vid);
      if (!h) continue;
      const existing = categoryAgg.get(h.categoryId) ?? { name: h.categoryName, qty: 0, revenue: 0 };
      existing.qty += agg.qty;
      existing.revenue += agg.revenue;
      categoryAgg.set(h.categoryId, existing);
    }

    const totalRevenue = Array.from(categoryAgg.values()).reduce((s, c) => s + c.revenue, 0);
    const totalQty = Array.from(categoryAgg.values()).reduce((s, c) => s + c.qty, 0);
    return Array.from(categoryAgg.entries())
      .map(([categoryId, data]) => ({
        categoryId,
        name: data.name,
        unitsSold: data.qty,
        revenueCentavos: data.revenue,
        percentRevenue: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0,
        percentUnits: totalQty > 0 ? Math.round((data.qty / totalQty) * 100) : 0,
      }))
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 10);
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// TOP PRODUCTS COMPARISON
// ═══════════════════════════════════════════════════════════════════════════════

export const getTopProductsComparison = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const { startMs, endMs } = resolvePeriod(args);
    const txns = await fetchBranchTransactions(ctx, branchId, startMs, endMs);
    const variantAgg = await aggregateTransactionItems(ctx, txns);
    const hierarchy = await buildVariantHierarchy(ctx, new Set(variantAgg.keys()));

    // Aggregate by style (product) rather than variant
    const styleAgg = new Map<string, { name: string; brandName: string; categoryName: string; qty: number; revenue: number }>();
    for (const [vid, agg] of variantAgg) {
      const h = hierarchy.get(vid);
      if (!h) continue;
      const existing = styleAgg.get(h.styleName) ?? { name: h.styleName, brandName: h.brandName, categoryName: h.categoryName, qty: 0, revenue: 0 };
      existing.qty += agg.qty;
      existing.revenue += agg.revenue;
      styleAgg.set(h.styleName, existing);
    }

    const totalQty = Array.from(styleAgg.values()).reduce((s, c) => s + c.qty, 0);
    const totalRevenue = Array.from(styleAgg.values()).reduce((s, c) => s + c.revenue, 0);
    return Array.from(styleAgg.values())
      .map((data) => ({
        name: data.name,
        brandName: data.brandName,
        categoryName: data.categoryName,
        unitsSold: data.qty,
        revenueCentavos: data.revenue,
        percentRevenue: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0,
        percentUnits: totalQty > 0 ? Math.round((data.qty / totalQty) * 100) : 0,
      }))
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 10);
  },
});

export const getHQTopProductsComparison = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const { startMs, endMs } = resolvePeriod(args);
    const txns = await fetchAllRetailTransactions(ctx, startMs, endMs);
    const variantAgg = await aggregateTransactionItems(ctx, txns);
    const hierarchy = await buildVariantHierarchy(ctx, new Set(variantAgg.keys()));

    const styleAgg = new Map<string, { name: string; brandName: string; categoryName: string; qty: number; revenue: number }>();
    for (const [vid, agg] of variantAgg) {
      const h = hierarchy.get(vid);
      if (!h) continue;
      const existing = styleAgg.get(h.styleName) ?? { name: h.styleName, brandName: h.brandName, categoryName: h.categoryName, qty: 0, revenue: 0 };
      existing.qty += agg.qty;
      existing.revenue += agg.revenue;
      styleAgg.set(h.styleName, existing);
    }

    const totalQty = Array.from(styleAgg.values()).reduce((s, c) => s + c.qty, 0);
    const totalRevenue = Array.from(styleAgg.values()).reduce((s, c) => s + c.revenue, 0);
    return Array.from(styleAgg.values())
      .map((data) => ({
        name: data.name,
        brandName: data.brandName,
        categoryName: data.categoryName,
        unitsSold: data.qty,
        revenueCentavos: data.revenue,
        percentRevenue: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0,
        percentUnits: totalQty > 0 ? Math.round((data.qty / totalQty) * 100) : 0,
      }))
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 10);
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESTOCK VS LAY LOW
// ═══════════════════════════════════════════════════════════════════════════════

export const getRestockVsLayLow = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const { startMs, endMs, durationDays } = resolvePeriod(args);
    const txns = await fetchBranchTransactions(ctx, branchId, startMs, endMs);
    const variantAgg = await aggregateTransactionItems(ctx, txns);

    // Get inventory for this branch
    const inventory = await ctx.db
      .query("inventory")
      .withIndex("by_branch", (q: any) => q.eq("branchId", branchId))
      .collect();

    const inventoryMap = new Map<string, number>();
    for (const inv of inventory) {
      inventoryMap.set(inv.variantId as string, inv.quantity);
    }

    // Combine all variant IDs (sold + in stock)
    const allVids = new Set([
      ...variantAgg.keys(),
      ...inventory.filter((i: any) => i.quantity > 0).map((i: any) => i.variantId as string),
    ]);

    const hierarchy = await buildVariantHierarchy(ctx, allVids);

    const results: {
      name: string;
      brandName: string;
      categoryName: string;
      size: string;
      color: string;
      currentStock: number;
      unitsSold: number;
      velocity: number;
      daysOfStock: number;
      sellThrough: number;
      verdict: "restock" | "lay_low" | "hold";
    }[] = [];

    for (const vid of allVids) {
      const h = hierarchy.get(vid);
      if (!h) continue;

      const sold = variantAgg.get(vid)?.qty ?? 0;
      const stock = inventoryMap.get(vid) ?? 0;
      if (sold === 0 && stock === 0) continue;

      const velocity = sold / durationDays;
      const daysOfStock = velocity > 0 ? Math.round(stock / velocity) : stock > 0 ? 999 : 0;
      const sellThrough = sold + stock > 0 ? Math.round((sold / (sold + stock)) * 100) : 0;

      let verdict: "restock" | "lay_low" | "hold";
      if (velocity >= 0.5 && daysOfStock < 14) {
        verdict = "restock";
      } else if ((velocity < 0.1 && daysOfStock > 90) || (sold === 0 && stock > 0)) {
        verdict = "lay_low";
      } else {
        verdict = "hold";
      }

      results.push({
        name: h.styleName,
        brandName: h.brandName,
        categoryName: h.categoryName,
        size: h.size,
        color: h.color,
        currentStock: stock,
        unitsSold: sold,
        velocity: Math.round(velocity * 100) / 100,
        daysOfStock,
        sellThrough,
        verdict,
      });
    }

    // Sort: restock first, then lay_low, then hold — within each, by velocity desc
    const order = { restock: 0, lay_low: 1, hold: 2 };
    results.sort((a, b) => order[a.verdict] - order[b.verdict] || b.velocity - a.velocity);

    return {
      items: results.slice(0, 30),
      summary: {
        restockCount: results.filter((r) => r.verdict === "restock").length,
        layLowCount: results.filter((r) => r.verdict === "lay_low").length,
        holdCount: results.filter((r) => r.verdict === "hold").length,
      },
    };
  },
});

export const getHQRestockVsLayLow = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const { startMs, endMs, durationDays } = resolvePeriod(args);
    const txns = await fetchAllRetailTransactions(ctx, startMs, endMs);
    const variantAgg = await aggregateTransactionItems(ctx, txns);

    // Aggregate inventory across all retail branches
    const branches = await ctx.db
      .query("branches")
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .collect();
    const retailBranches = branches.filter((b: any) => b.channel !== "warehouse");

    const allInventory = (
      await Promise.all(
        retailBranches.map((branch: any) =>
          ctx.db
            .query("inventory")
            .withIndex("by_branch", (q: any) => q.eq("branchId", branch._id))
            .collect()
        )
      )
    ).flat();

    const inventoryMap = new Map<string, number>();
    for (const inv of allInventory) {
      const key = inv.variantId as string;
      inventoryMap.set(key, (inventoryMap.get(key) ?? 0) + inv.quantity);
    }

    const allVids = new Set([
      ...variantAgg.keys(),
      ...Array.from(inventoryMap.entries())
        .filter(([, qty]) => qty > 0)
        .map(([vid]) => vid),
    ]);

    const hierarchy = await buildVariantHierarchy(ctx, allVids);

    const results: {
      name: string;
      brandName: string;
      categoryName: string;
      size: string;
      color: string;
      currentStock: number;
      unitsSold: number;
      velocity: number;
      daysOfStock: number;
      sellThrough: number;
      verdict: "restock" | "lay_low" | "hold";
    }[] = [];

    for (const vid of allVids) {
      const h = hierarchy.get(vid);
      if (!h) continue;

      const sold = variantAgg.get(vid)?.qty ?? 0;
      const stock = inventoryMap.get(vid) ?? 0;
      if (sold === 0 && stock === 0) continue;

      const velocity = sold / durationDays;
      const daysOfStock = velocity > 0 ? Math.round(stock / velocity) : stock > 0 ? 999 : 0;
      const sellThrough = sold + stock > 0 ? Math.round((sold / (sold + stock)) * 100) : 0;

      let verdict: "restock" | "lay_low" | "hold";
      if (velocity >= 0.5 && daysOfStock < 14) {
        verdict = "restock";
      } else if ((velocity < 0.1 && daysOfStock > 90) || (sold === 0 && stock > 0)) {
        verdict = "lay_low";
      } else {
        verdict = "hold";
      }

      results.push({
        name: h.styleName,
        brandName: h.brandName,
        categoryName: h.categoryName,
        size: h.size,
        color: h.color,
        currentStock: stock,
        unitsSold: sold,
        velocity: Math.round(velocity * 100) / 100,
        daysOfStock,
        sellThrough,
        verdict,
      });
    }

    const order = { restock: 0, lay_low: 1, hold: 2 };
    results.sort((a, b) => order[a.verdict] - order[b.verdict] || b.velocity - a.velocity);

    return {
      items: results.slice(0, 30),
      summary: {
        restockCount: results.filter((r) => r.verdict === "restock").length,
        layLowCount: results.filter((r) => r.verdict === "lay_low").length,
        holdCount: results.filter((r) => r.verdict === "hold").length,
      },
    };
  },
});

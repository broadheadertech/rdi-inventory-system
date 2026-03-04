import { query, type QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";

// NOTE: All queries use requireRole(ctx, HQ_ROLES) — NOT withBranchScope.

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

function getPhilippineDateRange(dateStr: string): { startMs: number; endMs: number } {
  const year = parseInt(dateStr.slice(0, 4));
  const month = parseInt(dateStr.slice(4, 6)) - 1;
  const day = parseInt(dateStr.slice(6, 8));
  const startMs = Date.UTC(year, month, day) - PHT_OFFSET_MS;
  const endMs = startMs + 86_400_000 - 1;
  return { startMs, endMs };
}

// ─── Classification types ────────────────────────────────────────────────────

type VelocityBucket = "high" | "medium" | "low" | "zero";
type DosBucket = "low" | "medium" | "high";
type Classification = "fast" | "normal" | "slow" | "dead";
type SubClassification =
  | "fast-restock"
  | "fast-healthy"
  | "fast-overstocked"
  | "normal-watch"
  | "normal"
  | "normal-low"
  | "slow-overstock"
  | "slow-critical"
  | "dead";

const CLASS_PRIORITY: Record<Classification, number> = {
  dead: 0,
  slow: 1,
  normal: 2,
  fast: 3,
};

function classifyDos(dos: number): DosBucket {
  if (dos < 14) return "low";
  if (dos <= 60) return "medium";
  return "high";
}

function matrixLookup(
  velocity: VelocityBucket,
  dos: DosBucket
): { classification: Classification; subClassification: SubClassification } {
  if (velocity === "zero") return { classification: "dead", subClassification: "dead" };

  if (velocity === "high") {
    if (dos === "low") return { classification: "fast", subClassification: "fast-restock" };
    if (dos === "medium") return { classification: "fast", subClassification: "fast-healthy" };
    return { classification: "fast", subClassification: "fast-overstocked" };
  }
  if (velocity === "medium") {
    if (dos === "low") return { classification: "normal", subClassification: "normal-watch" };
    if (dos === "medium") return { classification: "normal", subClassification: "normal" };
    return { classification: "slow", subClassification: "slow-overstock" };
  }
  // low velocity
  if (dos === "low") return { classification: "normal", subClassification: "normal-low" };
  if (dos === "medium") return { classification: "slow", subClassification: "slow-overstock" };
  return { classification: "slow", subClassification: "slow-critical" };
}

function computePercentiles(rates: number[]): { p25: number; p75: number } {
  if (rates.length === 0) return { p25: 0, p75: 0 };
  const sorted = [...rates].sort((a, b) => a - b);
  const p25Idx = Math.floor(sorted.length * 0.25);
  const p75Idx = Math.floor(sorted.length * 0.75);
  return { p25: sorted[p25Idx], p75: sorted[Math.min(p75Idx, sorted.length - 1)] };
}

function classifyVelocity(rate: number, p25: number, p75: number): VelocityBucket {
  if (rate === 0) return "zero";
  if (p25 === p75) {
    // All non-zero rates are identical — use simple thresholds
    if (rate >= 1) return "high";
    if (rate >= 0.1) return "medium";
    return "low";
  }
  if (rate >= p75) return "high";
  if (rate >= p25) return "medium";
  return "low";
}

// ─── Shared aggregation logic ────────────────────────────────────────────────

async function aggregateMovers(
  ctx: QueryCtx,
  args: { dateStart: string; dateEnd: string; branchId?: Id<"branches"> }
) {
  const { startMs } = getPhilippineDateRange(args.dateStart);
  const { endMs } = getPhilippineDateRange(args.dateEnd);
  const periodDays = Math.max(1, Math.round((endMs - startMs + 1) / 86_400_000));

  // Fetch branches
  const branches = args.branchId
    ? await ctx.db.get(args.branchId).then((b) => (b && b.isActive ? [b] : []))
    : await ctx.db
        .query("branches")
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();

  // Sales aggregation — parallel per-branch, capped at 2000 txns each
  const allTxnArrays = await Promise.all(
    branches.map((branch) =>
      ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", branch._id).gte("createdAt", startMs).lte("createdAt", endMs)
        )
        .take(2000)
    )
  );
  const allTxns = allTxnArrays.flat();

  // Build soldMap: variantId → totalSold
  const soldMap = new Map<string, number>();
  for (const txn of allTxns) {
    const items = await ctx.db
      .query("transactionItems")
      .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
      .collect();
    for (const item of items) {
      const key = item.variantId as string;
      soldMap.set(key, (soldMap.get(key) ?? 0) + item.quantity);
    }
  }

  // Inventory snapshot — parallel per-branch
  const allInventory = (
    await Promise.all(
      branches.map((branch) =>
        ctx.db
          .query("inventory")
          .withIndex("by_branch", (q) => q.eq("branchId", branch._id))
          .collect()
      )
    )
  ).flat();

  // Sum stock per variant (across branches when no filter)
  const stockMap = new Map<string, number>();
  for (const inv of allInventory) {
    const key = inv.variantId as string;
    stockMap.set(key, (stockMap.get(key) ?? 0) + inv.quantity);
  }

  // Union of variantIds with stock > 0 OR sales > 0
  const allVariantIds = new Set<string>();
  for (const [vid, qty] of stockMap) {
    if (qty > 0) allVariantIds.add(vid);
  }
  for (const vid of soldMap.keys()) {
    allVariantIds.add(vid);
  }

  // Compute metrics per variant
  const entries: {
    variantId: string;
    totalSold: number;
    dailySalesRate: number;
    currentStock: number;
    daysOfSupply: number | null; // null = no stock, 999999 = dead (sentinel for Infinity)
    velocityBucket: VelocityBucket;
    dosBucket: DosBucket;
    classification: Classification;
    subClassification: SubClassification;
  }[] = [];

  // First pass: compute rates for percentile calculation
  const nonZeroRates: number[] = [];
  const rawEntries: { variantId: string; totalSold: number; dailySalesRate: number; currentStock: number }[] = [];

  for (const vid of allVariantIds) {
    const totalSold = soldMap.get(vid) ?? 0;
    const currentStock = stockMap.get(vid) ?? 0;
    const dailySalesRate = Math.round((totalSold / periodDays) * 10) / 10;
    if (dailySalesRate > 0) nonZeroRates.push(dailySalesRate);
    rawEntries.push({ variantId: vid, totalSold, dailySalesRate, currentStock });
  }

  const { p25, p75 } = computePercentiles(nonZeroRates);

  // Second pass: classify
  for (const raw of rawEntries) {
    const velocityBucket = classifyVelocity(raw.dailySalesRate, p25, p75);

    let daysOfSupply: number | null;
    if (raw.currentStock <= 0) {
      daysOfSupply = null;
    } else if (raw.dailySalesRate === 0) {
      daysOfSupply = 999999; // Sentinel for Infinity (not valid JSON)
    } else {
      daysOfSupply = Math.round(raw.currentStock / raw.dailySalesRate);
    }

    // For classification: if no stock, treat DOS bucket as "low" (doesn't matter for zero-stock items)
    const dosBucket = daysOfSupply === null
      ? "low" as DosBucket
      : daysOfSupply >= 999999
        ? "high" as DosBucket
        : classifyDos(daysOfSupply);

    const { classification, subClassification } = matrixLookup(velocityBucket, dosBucket);

    entries.push({
      ...raw,
      daysOfSupply,
      velocityBucket,
      dosBucket,
      classification,
      subClassification,
    });
  }

  return { entries, periodDays, p25, p75 };
}

// ─── getProductMovers ────────────────────────────────────────────────────────

export const getProductMovers = query({
  args: {
    dateStart: v.string(),
    dateEnd: v.string(),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const { entries, periodDays, p25, p75 } = await aggregateMovers(ctx, args);

    // 4-wave batch enrichment (variant → style → category → brand)

    // Wave 1: variants
    const uniqueVariantIds = [...new Set(entries.map((e) => e.variantId))];
    const variantDocs = await Promise.all(
      uniqueVariantIds.map((id) => ctx.db.get(id as Id<"variants">))
    );
    const variantMap = new Map<
      string,
      { sku: string; size: string; color: string; priceCentavos: number; styleId: Id<"styles"> }
    >();
    uniqueVariantIds.forEach((id, i) => {
      const doc = variantDocs[i];
      if (doc) {
        variantMap.set(id, {
          sku: doc.sku ?? "—",
          size: doc.size ?? "—",
          color: doc.color ?? "—",
          priceCentavos: doc.priceCentavos ?? 0,
          styleId: doc.styleId,
        });
      }
    });

    // Wave 2: styles
    const uniqueStyleIds = [...new Set(
      Array.from(variantMap.values()).map((v) => v.styleId)
    )];
    const styleDocs = await Promise.all(
      uniqueStyleIds.map((id) => ctx.db.get(id))
    );
    const styleMap = new Map<string, { name: string; categoryId: Id<"categories"> }>();
    uniqueStyleIds.forEach((id, i) => {
      const doc = styleDocs[i];
      if (doc) styleMap.set(id as string, { name: doc.name, categoryId: doc.categoryId });
    });

    // Wave 3: categories
    const uniqueCategoryIds = [...new Set(
      Array.from(styleMap.values()).map((s) => s.categoryId)
    )];
    const categoryDocs = await Promise.all(
      uniqueCategoryIds.map((id) => ctx.db.get(id))
    );
    const categoryMap = new Map<string, { name: string; brandId: Id<"brands"> }>();
    uniqueCategoryIds.forEach((id, i) => {
      const doc = categoryDocs[i];
      if (doc) categoryMap.set(id as string, { name: doc.name, brandId: doc.brandId });
    });

    // Wave 4: brands
    const uniqueBrandIds = [...new Set(
      Array.from(categoryMap.values()).map((c) => c.brandId)
    )];
    const brandDocs = await Promise.all(
      uniqueBrandIds.map((id) => ctx.db.get(id))
    );
    const brandNameMap = new Map<string, string>();
    uniqueBrandIds.forEach((id, i) => {
      const doc = brandDocs[i];
      if (doc) brandNameMap.set(id as string, doc.name);
    });

    // Assemble enriched items
    const items = entries.map((entry) => {
      const variant = variantMap.get(entry.variantId);
      const style = variant ? styleMap.get(variant.styleId as string) : null;
      const category = style ? categoryMap.get(style.categoryId as string) : null;
      const brandName = category ? brandNameMap.get(category.brandId as string) ?? "Unknown" : "Unknown";

      return {
        variantId: entry.variantId,
        sku: variant?.sku ?? "—",
        styleName: style?.name ?? "Unknown",
        size: variant?.size ?? "—",
        color: variant?.color ?? "—",
        brandName,
        categoryName: category?.name ?? "Unknown",
        priceCentavos: variant?.priceCentavos ?? 0,
        currentStock: entry.currentStock,
        totalSold: entry.totalSold,
        dailySalesRate: entry.dailySalesRate,
        daysOfSupply: entry.daysOfSupply,
        classification: entry.classification,
        subClassification: entry.subClassification,
      };
    });

    // Sort: dead → slow → normal → fast, then DOS ascending
    items.sort((a, b) => {
      const classDiff = CLASS_PRIORITY[a.classification] - CLASS_PRIORITY[b.classification];
      if (classDiff !== 0) return classDiff;
      const dosA = a.daysOfSupply ?? -1;
      const dosB = b.daysOfSupply ?? -1;
      // 999999 sentinel sorts last within same class
      if (dosA >= 999999 && dosB < 999999) return 1;
      if (dosB >= 999999 && dosA < 999999) return -1;
      return dosA - dosB;
    });

    return {
      items,
      meta: {
        periodDays,
        p25,
        p75,
        totalVariants: items.length,
      },
    };
  },
});

// ─── getMoversOverview ───────────────────────────────────────────────────────

export const getMoversOverview = query({
  args: {
    dateStart: v.string(),
    dateEnd: v.string(),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const { entries } = await aggregateMovers(ctx, args);

    let fastMovers = 0;
    let normal = 0;
    let slowMovers = 0;
    let deadStock = 0;

    // Collect fast-restock items for urgent callout
    const fastRestockEntries: typeof entries = [];

    for (const entry of entries) {
      switch (entry.classification) {
        case "fast":
          fastMovers++;
          if (entry.subClassification === "fast-restock") {
            fastRestockEntries.push(entry);
          }
          break;
        case "normal":
          normal++;
          break;
        case "slow":
          slowMovers++;
          break;
        case "dead":
          deadStock++;
          break;
      }
    }

    // Enrich only top 3 fast-restock items (minimal enrichment)
    const top3 = fastRestockEntries
      .sort((a, b) => (a.daysOfSupply ?? 999999) - (b.daysOfSupply ?? 999999))
      .slice(0, 3);

    const urgentRestock = await Promise.all(
      top3.map(async (entry) => {
        const variant = await ctx.db.get(entry.variantId as Id<"variants">);
        const style = variant ? await ctx.db.get(variant.styleId) : null;
        return {
          sku: variant?.sku ?? "—",
          styleName: style?.name ?? "Unknown",
          size: variant?.size ?? "—",
          color: variant?.color ?? "—",
          daysOfSupply: entry.daysOfSupply as number,
        };
      })
    );

    return {
      fastMovers,
      normal,
      slowMovers,
      deadStock,
      totalVariants: entries.length,
      urgentRestock,
    };
  },
});

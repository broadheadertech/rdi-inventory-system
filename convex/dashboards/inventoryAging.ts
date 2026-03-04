import { query, type QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";

// ─── Aging tier config ───────────────────────────────────────────────────────

const GREEN_MAX = 90;  // 0–90 days = New
const YELLOW_MAX = 180; // 91–180 days = Mid-cycle
// 181+ = Old

type AgingTier = "green" | "yellow" | "red";

function classifyAge(ageDays: number): AgingTier {
  if (ageDays <= GREEN_MAX) return "green";
  if (ageDays <= YELLOW_MAX) return "yellow";
  return "red";
}

// ─── Shared aggregation ──────────────────────────────────────────────────────

type VariantAging = {
  variantId: string;
  totalQty: number;
  greenQty: number;
  yellowQty: number;
  redQty: number;
  totalCostCentavos: number;
  greenCostCentavos: number;
  yellowCostCentavos: number;
  redCostCentavos: number;
  oldestAgeDays: number;
  weightedAgeDaysSum: number;
};

async function aggregateAging(
  ctx: QueryCtx,
  args: { branchId?: Id<"branches"> }
) {
  const branches = args.branchId
    ? await ctx.db.get(args.branchId).then((b) => (b && b.isActive ? [b] : []))
    : await ctx.db
        .query("branches")
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();

  // Parallel per-branch batch fetch
  const allBatchArrays = await Promise.all(
    branches.map((branch) =>
      ctx.db
        .query("inventoryBatches")
        .withIndex("by_branch_variant", (q) => q.eq("branchId", branch._id))
        .collect()
    )
  );
  const allBatches = allBatchArrays.flat();

  const now = Date.now();
  const agingMap = new Map<string, VariantAging>();

  for (const batch of allBatches) {
    if (batch.quantity <= 0) continue;

    const ageDays = Math.floor((now - batch.receivedAt) / 86_400_000);
    const tier = classifyAge(ageDays);
    const batchCost = batch.quantity * batch.costPriceCentavos;
    const vid = batch.variantId as string;

    let entry = agingMap.get(vid);
    if (!entry) {
      entry = {
        variantId: vid,
        totalQty: 0,
        greenQty: 0,
        yellowQty: 0,
        redQty: 0,
        totalCostCentavos: 0,
        greenCostCentavos: 0,
        yellowCostCentavos: 0,
        redCostCentavos: 0,
        oldestAgeDays: 0,
        weightedAgeDaysSum: 0,
      };
      agingMap.set(vid, entry);
    }

    entry.totalQty += batch.quantity;
    entry.totalCostCentavos += batchCost;
    entry.weightedAgeDaysSum += ageDays * batch.quantity;
    if (ageDays > entry.oldestAgeDays) entry.oldestAgeDays = ageDays;

    if (tier === "green") {
      entry.greenQty += batch.quantity;
      entry.greenCostCentavos += batchCost;
    } else if (tier === "yellow") {
      entry.yellowQty += batch.quantity;
      entry.yellowCostCentavos += batchCost;
    } else {
      entry.redQty += batch.quantity;
      entry.redCostCentavos += batchCost;
    }
  }

  return Array.from(agingMap.values());
}

// ─── getAgingReport ──────────────────────────────────────────────────────────

const TIER_PRIORITY: Record<AgingTier, number> = { red: 0, yellow: 1, green: 2 };

export const getAgingReport = query({
  args: {
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const entries = await aggregateAging(ctx, args);

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

      const weightedAvgAge = entry.totalQty > 0
        ? Math.round(entry.weightedAgeDaysSum / entry.totalQty)
        : 0;

      const dominantTier: AgingTier =
        entry.redQty > 0 ? "red" :
        entry.yellowQty > 0 ? "yellow" : "green";

      return {
        variantId: entry.variantId,
        sku: variant?.sku ?? "—",
        styleName: style?.name ?? "Unknown",
        size: variant?.size ?? "—",
        color: variant?.color ?? "—",
        brandName,
        categoryName: category?.name ?? "Unknown",
        totalQty: entry.totalQty,
        greenQty: entry.greenQty,
        yellowQty: entry.yellowQty,
        redQty: entry.redQty,
        totalCostCentavos: entry.totalCostCentavos,
        greenCostCentavos: entry.greenCostCentavos,
        yellowCostCentavos: entry.yellowCostCentavos,
        redCostCentavos: entry.redCostCentavos,
        oldestAgeDays: entry.oldestAgeDays,
        weightedAvgAge,
        dominantTier,
      };
    });

    // Sort: red first → yellow → green, then oldest first within tier
    items.sort((a, b) => {
      const tierDiff = TIER_PRIORITY[a.dominantTier] - TIER_PRIORITY[b.dominantTier];
      if (tierDiff !== 0) return tierDiff;
      return b.oldestAgeDays - a.oldestAgeDays;
    });

    // Summary totals
    let greenSkus = 0, yellowSkus = 0, redSkus = 0;
    let totalCostCentavos = 0, greenCostCentavos = 0, yellowCostCentavos = 0, redCostCentavos = 0;
    let totalUnits = 0;
    for (const item of items) {
      if (item.dominantTier === "green") greenSkus++;
      else if (item.dominantTier === "yellow") yellowSkus++;
      else redSkus++;
      totalCostCentavos += item.totalCostCentavos;
      greenCostCentavos += item.greenCostCentavos;
      yellowCostCentavos += item.yellowCostCentavos;
      redCostCentavos += item.redCostCentavos;
      totalUnits += item.totalQty;
    }

    return {
      items,
      summary: {
        totalSkus: items.length,
        greenSkus,
        yellowSkus,
        redSkus,
        totalUnits,
        totalCostCentavos,
        greenCostCentavos,
        yellowCostCentavos,
        redCostCentavos,
        atRiskCostCentavos: yellowCostCentavos + redCostCentavos,
      },
    };
  },
});

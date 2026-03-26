// convex/dashboards/productMovers.ts
//
// NOW READS FROM variantDailySnapshots instead of scanning transactions + transactionItems.
// Query count: ~1 (snapshot read) + batch enrichment.
// Previously: ~800K+ queries at 400 branches.

import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { getAllVariantSnapshots, getPHTDate } from "../snapshots/readers";

// ─── Classification types ────────────────────────────────────────────────────

type DsiBucket = "low" | "medium" | "high";
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

function classifyDsi(dsi: number): DsiBucket {
  if (dsi < 14) return "low";
  if (dsi <= 60) return "medium";
  return "high";
}

function classifyByMI(
  mi: number,
  hasSales: boolean,
  dsiBucket: DsiBucket
): { classification: Classification; subClassification: SubClassification } {
  if (!hasSales) return { classification: "dead", subClassification: "dead" };

  if (mi >= 0.30) {
    if (dsiBucket === "low") return { classification: "fast", subClassification: "fast-restock" };
    if (dsiBucket === "medium") return { classification: "fast", subClassification: "fast-healthy" };
    return { classification: "fast", subClassification: "fast-overstocked" };
  }
  if (mi >= 0.10) {
    if (dsiBucket === "low") return { classification: "normal", subClassification: "normal-watch" };
    if (dsiBucket === "medium") return { classification: "normal", subClassification: "normal" };
    return { classification: "slow", subClassification: "slow-overstock" };
  }
  if (dsiBucket === "low") return { classification: "normal", subClassification: "normal-low" };
  if (dsiBucket === "medium") return { classification: "slow", subClassification: "slow-overstock" };
  return { classification: "slow", subClassification: "slow-critical" };
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

    // Read today's variant snapshots (already has velocity, stock, hierarchy)
    const todayDate = getPHTDate(0);
    const snapshots = await getAllVariantSnapshots(ctx, todayDate);

    const items = snapshots
      .filter((snap) => snap.totalQtySold > 0 || snap.totalStock > 0)
      .map((snap) => {
        const hasSales = snap.totalQtySold > 0;
        const ads = snap.avgDailyVelocity7d;
        const dsi = snap.daysOfSupply;
        const mi = snap.movementIndex;

        const dsiBucket: DsiBucket = !hasSales || snap.totalStock <= 0
          ? "low"
          : dsi >= 999 ? "high" : classifyDsi(dsi);

        const { classification, subClassification } = classifyByMI(mi, hasSales, dsiBucket);

        return {
          variantId: snap.variantId as string,
          sku: snap.sku,
          styleName: snap.styleName,
          size: snap.size,
          color: snap.color,
          brandName: snap.brandName,
          categoryName: snap.categoryName,
          priceCentavos: snap.priceCentavos,
          currentStock: snap.totalStock,
          totalSold: snap.totalQtySold,
          ads: Math.round(ads),
          dsi: Math.round(dsi),
          mi: Math.round(mi * 100) / 100,
          classification,
          subClassification,
        };
      });

    // Sort: dead → slow → normal → fast, then MI descending
    items.sort((a, b) => {
      const classDiff = CLASS_PRIORITY[a.classification] - CLASS_PRIORITY[b.classification];
      if (classDiff !== 0) return classDiff;
      return b.mi - a.mi;
    });

    // Calculate period days from args
    const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
    const startYear = parseInt(args.dateStart.slice(0, 4));
    const startMonth = parseInt(args.dateStart.slice(4, 6)) - 1;
    const startDay = parseInt(args.dateStart.slice(6, 8));
    const endYear = parseInt(args.dateEnd.slice(0, 4));
    const endMonth = parseInt(args.dateEnd.slice(4, 6)) - 1;
    const endDay = parseInt(args.dateEnd.slice(6, 8));
    const startMs = Date.UTC(startYear, startMonth, startDay) - PHT_OFFSET_MS;
    const endMs = Date.UTC(endYear, endMonth, endDay) - PHT_OFFSET_MS + 86_400_000 - 1;
    const periodDays = Math.max(1, Math.round((endMs - startMs + 1) / 86_400_000));

    return {
      items,
      meta: {
        periodDays,
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

    const todayDate = getPHTDate(0);
    const snapshots = await getAllVariantSnapshots(ctx, todayDate);

    let fastMovers = 0;
    let normal = 0;
    let slowMovers = 0;
    let deadStock = 0;

    const fastRestockEntries: Array<{
      sku: string;
      styleName: string;
      size: string;
      color: string;
      dsi: number;
      mi: number;
    }> = [];

    for (const snap of snapshots) {
      if (snap.totalQtySold === 0 && snap.totalStock === 0) continue;

      const hasSales = snap.totalQtySold > 0;
      const dsi = snap.daysOfSupply;
      const mi = snap.movementIndex;

      const dsiBucket: DsiBucket = !hasSales || snap.totalStock <= 0
        ? "low"
        : dsi >= 999 ? "high" : classifyDsi(dsi);

      const { classification, subClassification } = classifyByMI(mi, hasSales, dsiBucket);

      switch (classification) {
        case "fast":
          fastMovers++;
          if (subClassification === "fast-restock") {
            fastRestockEntries.push({
              sku: snap.sku,
              styleName: snap.styleName,
              size: snap.size,
              color: snap.color,
              dsi: Math.round(dsi),
              mi,
            });
          }
          break;
        case "normal": normal++; break;
        case "slow": slowMovers++; break;
        case "dead": deadStock++; break;
      }
    }

    // Top 3 urgent restocks
    fastRestockEntries.sort((a, b) => b.mi - a.mi);
    const urgentRestock = fastRestockEntries.slice(0, 3).map((e) => ({
      sku: e.sku,
      styleName: e.styleName,
      size: e.size,
      color: e.color,
      dsi: e.dsi,
    }));

    return {
      fastMovers,
      normal,
      slowMovers,
      deadStock,
      totalVariants: fastMovers + normal + slowMovers + deadStock,
      urgentRestock,
    };
  },
});

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

// ─── getLifecycleMovers ─────────────────────────────────────────────────────
//
// Classifies variants by cumulative sell-through % vs. weeks-since-first-receipt.
// Fast: sell-thru ≥ fast threshold for current week
// Slow: sell-thru ≤ slow threshold for current week
// Mid:  between slow and fast thresholds
//
// Week stages (informational — thresholds apply per calendar week since WK1):
//   WK 1: Received in Warehouse
//   WK 2: Received in all Metro Manila → South
//   WK 4: Received in all Stores incl. Vismin
//   WK 6: 1-month evaluation for all stores
//   WK 12+: Final grade (60% fast / 40% slow)

type LifecycleClass = "fast" | "mid" | "slow";

// [weekIndex 1..12] → { fast %, slow % }. Index 0 unused.
const LIFECYCLE_THRESHOLDS: ReadonlyArray<{ fast: number; slow: number }> = [
  { fast: 0, slow: 0 },     // idx 0 unused
  { fast: 5, slow: 3 },     // WK 1
  { fast: 10, slow: 7 },    // WK 2
  { fast: 15, slow: 10 },   // WK 3
  { fast: 20, slow: 13 },   // WK 4
  { fast: 25, slow: 17 },   // WK 5
  { fast: 30, slow: 20 },   // WK 6
  { fast: 35, slow: 23 },   // WK 7
  { fast: 40, slow: 27 },   // WK 8
  { fast: 45, slow: 30 },   // WK 9
  { fast: 50, slow: 33 },   // WK 10
  { fast: 55, slow: 37 },   // WK 11
  { fast: 60, slow: 40 },   // WK 12 (Grade)
];

function classifyLifecycle(sellThruPct: number, weekIndex: number): LifecycleClass {
  const wk = Math.max(1, Math.min(12, weekIndex));
  const { fast, slow } = LIFECYCLE_THRESHOLDS[wk];
  if (sellThruPct >= fast) return "fast";
  if (sellThruPct <= slow) return "slow";
  return "mid";
}

export const getLifecycleMovers = query({
  args: {
    branchId: v.optional(v.id("branches")),
    brandId: v.optional(v.id("brands")),
    classification: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const now = Date.now();
    const DAY = 86_400_000;
    const WEEK = 7 * DAY;
    // Include up to 12 full weeks + a grace week so WK 12 items still show
    const cutoff = now - 13 * WEEK;

    // Fetch branches for scoping
    const allBranches = await ctx.db.query("branches").collect();
    const branchIdFilter = args.branchId ? String(args.branchId) : null;

    // Collect inventory batches — full scan is the only option without a cross-branch index
    const allBatches = await ctx.db.query("inventoryBatches").collect();

    // Group by variantId → { firstReceivedAt, totalReceived }
    const variantLifecycle = new Map<
      string,
      { firstReceivedAt: number; totalReceived: number }
    >();
    for (const batch of allBatches) {
      if (batch.receivedAt < cutoff) continue;
      if (branchIdFilter && String(batch.branchId) !== branchIdFilter) continue;
      const vid = String(batch.variantId);
      const existing = variantLifecycle.get(vid);
      if (!existing) {
        variantLifecycle.set(vid, {
          firstReceivedAt: batch.receivedAt,
          totalReceived: batch.quantity,
        });
      } else {
        existing.totalReceived += batch.quantity;
        if (batch.receivedAt < existing.firstReceivedAt) {
          existing.firstReceivedAt = batch.receivedAt;
        }
      }
    }

    if (variantLifecycle.size === 0) {
      return { items: [], summary: { fast: 0, mid: 0, slow: 0, total: 0 } };
    }

    // Walk transactions in the lifecycle window — scope to branch if filter set
    const earliestReceipt = Math.min(
      ...[...variantLifecycle.values()].map((v) => v.firstReceivedAt)
    );
    const targetBranches = branchIdFilter
      ? allBranches.filter((b) => String(b._id) === branchIdFilter)
      : allBranches;

    const txnArrays = await Promise.all(
      targetBranches.map((branch) =>
        ctx.db
          .query("transactions")
          .withIndex("by_branch_date", (q) =>
            q.eq("branchId", branch._id).gte("createdAt", earliestReceipt)
          )
          .collect()
      )
    );

    // variantId → totalSoldSinceFirstReceipt
    const variantSold = new Map<string, number>();
    for (const txns of txnArrays) {
      for (const txn of txns) {
        if (txn.status === "voided") continue;
        const items = await ctx.db
          .query("transactionItems")
          .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
          .collect();
        for (const item of items) {
          const vid = String(item.variantId);
          const lifecycle = variantLifecycle.get(vid);
          if (!lifecycle) continue;
          if (txn.createdAt < lifecycle.firstReceivedAt) continue;
          variantSold.set(vid, (variantSold.get(vid) ?? 0) + item.quantity);
        }
      }
    }

    // Enrich using today's variant snapshots (has style/brand/hierarchy)
    const todayDate = getPHTDate(0);
    const snapshots = await getAllVariantSnapshots(ctx, todayDate);
    const snapshotMap = new Map<string, (typeof snapshots)[number]>();
    for (const snap of snapshots) snapshotMap.set(String(snap.variantId), snap);

    const brandIdFilter = args.brandId ? String(args.brandId) : null;

    type Item = {
      variantId: string;
      sku: string;
      styleName: string;
      size: string;
      color: string;
      brandName: string;
      brandId: string;
      categoryName: string;
      firstReceivedAt: number;
      weekIndex: number;
      totalReceived: number;
      totalSold: number;
      currentStock: number;
      sellThruPct: number;
      classification: LifecycleClass;
      fastThreshold: number;
      slowThreshold: number;
    };

    const items: Item[] = [];
    for (const [vid, lifecycle] of variantLifecycle) {
      const snap = snapshotMap.get(vid);
      if (!snap) continue;
      if (brandIdFilter && String(snap.brandId) !== brandIdFilter) continue;

      const sold = variantSold.get(vid) ?? 0;
      const daysElapsed = Math.max(0, Math.floor((now - lifecycle.firstReceivedAt) / DAY));
      const weekIndex = Math.max(1, Math.min(12, Math.floor(daysElapsed / 7) + 1));
      const sellThruPct =
        lifecycle.totalReceived > 0
          ? Math.round((sold / lifecycle.totalReceived) * 1000) / 10
          : 0;
      const classification = classifyLifecycle(sellThruPct, weekIndex);
      const { fast, slow } = LIFECYCLE_THRESHOLDS[weekIndex];

      items.push({
        variantId: vid,
        sku: snap.sku,
        styleName: snap.styleName,
        size: snap.size,
        color: snap.color,
        brandName: snap.brandName,
        brandId: String(snap.brandId),
        categoryName: snap.categoryName,
        firstReceivedAt: lifecycle.firstReceivedAt,
        weekIndex,
        totalReceived: lifecycle.totalReceived,
        totalSold: sold,
        currentStock: snap.totalStock,
        sellThruPct,
        classification,
        fastThreshold: fast,
        slowThreshold: slow,
      });
    }

    // Filter by classification if requested
    const filtered = args.classification
      ? items.filter((i) => i.classification === args.classification)
      : items;

    // Sort: slow → mid → fast, then by sell-thru deficit (worst first)
    const order: Record<LifecycleClass, number> = { slow: 0, mid: 1, fast: 2 };
    filtered.sort((a, b) => {
      const diff = order[a.classification] - order[b.classification];
      if (diff !== 0) return diff;
      return a.sellThruPct - b.sellThruPct;
    });

    const summary = {
      fast: items.filter((i) => i.classification === "fast").length,
      mid: items.filter((i) => i.classification === "mid").length,
      slow: items.filter((i) => i.classification === "slow").length,
      total: items.length,
    };

    return { items: filtered, summary };
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

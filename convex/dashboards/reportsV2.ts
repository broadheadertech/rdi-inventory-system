// convex/dashboards/reportsV2.ts — Unified reports summary + performance dimensions

import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";

const CHANNEL_VALUES = [
  "inline",
  "online",
  "outlet",
  "popup",
  "dtc",
  "warehouse",
  "outright",
] as const;
type Channel = (typeof CHANNEL_VALUES)[number];

const channelArg = v.optional(
  v.union(
    v.literal("inline"),
    v.literal("online"),
    v.literal("outlet"),
    v.literal("popup"),
    v.literal("dtc"),
    v.literal("warehouse"),
    v.literal("outright"),
  )
);

const periodKindArg = v.optional(
  v.union(
    v.literal("daily"),
    v.literal("weekly"),
    v.literal("monthly"),
    v.literal("yearly"),
    v.literal("custom"),
  )
);

const filterArgs = {
  dateStart: v.string(), // YYYYMMDD
  dateEnd: v.string(),   // YYYYMMDD inclusive
  brandId: v.optional(v.id("brands")),
  branchId: v.optional(v.id("branches")),
  channel: channelArg,
  periodKind: periodKindArg,
};

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;

function ymdToMs(ymd: string, endOfDay = false): number {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(4, 6)) - 1;
  const d = Number(ymd.slice(6, 8));
  const phtMidnight = Date.UTC(y, m, d) - PHT_OFFSET_MS;
  return endOfDay ? phtMidnight + 24 * 60 * 60 * 1000 - 1 : phtMidnight;
}

function shiftYmdByYear(ymd: string, years: number): string {
  const y = Number(ymd.slice(0, 4)) + years;
  return `${y}${ymd.slice(4)}`;
}

/** Reads org-wide monthly sales target (centavos) from the settings table. */
async function readOrgMonthlyTargetCentavos(
  ctx: { db: { query: (t: "settings") => any } },
): Promise<number> {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q: any) => q.eq("key", "orgMonthlyTargetCentavos"))
    .unique();
  const n = row ? Number(row.value) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Prorate monthly target to a date range: monthly × (days / 30). */
function prorateMonthlyTarget(monthlyCentavos: number, rangeDays: number): number {
  if (monthlyCentavos <= 0 || rangeDays <= 0) return 0;
  return Math.round((monthlyCentavos * rangeDays) / 30);
}

/** Target for the selected period preset. Monthly/Yearly = full period (not elapsed). */
function targetForPeriod(
  monthlyCentavos: number,
  rangeDays: number,
  periodKind: "daily" | "weekly" | "monthly" | "yearly" | "custom" | undefined,
): number {
  if (monthlyCentavos <= 0) return 0;
  switch (periodKind) {
    case "daily":
      return Math.round(monthlyCentavos / 30);
    case "weekly":
      return Math.round((monthlyCentavos * 7) / 30);
    case "monthly":
      return monthlyCentavos;
    case "yearly":
      return monthlyCentavos * 12;
    default:
      return prorateMonthlyTarget(monthlyCentavos, rangeDays);
  }
}

/** Resolve a style's brandId, preferring style.brandId and falling back to category.brandId. */
async function resolveStyleBrandId(
  ctx: {
    db: {
      get: (id: Id<"styles"> | Id<"categories">) => Promise<{ brandId?: Id<"brands"> } | null>;
    };
  },
  style: Doc<"styles">,
  categoryBrandCache: Map<string, Id<"brands"> | null>
): Promise<Id<"brands"> | null> {
  if (style.brandId) return style.brandId;
  if (!style.categoryId) return null;
  const key = style.categoryId as string;
  const cached = categoryBrandCache.get(key);
  if (cached !== undefined) return cached;
  const cat = (await ctx.db.get(style.categoryId)) as { brandId?: Id<"brands"> } | null;
  const resolved = cat?.brandId ?? null;
  categoryBrandCache.set(key, resolved);
  return resolved;
}

/** Pull transactions across allowed branches within a date range. */
async function fetchTxnsInRange(
  ctx: any,
  startMs: number,
  endMs: number,
  allowedBranchIds: Id<"branches">[],
): Promise<Doc<"transactions">[]> {
  const all: Doc<"transactions">[] = [];
  for (const bId of allowedBranchIds) {
    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q: any) =>
        q.eq("branchId", bId).gte("createdAt", startMs).lte("createdAt", endMs)
      )
      .collect();
    for (const t of txns) {
      if (t.status !== "voided") all.push(t);
    }
  }
  return all;
}

/** Resolve list of branch IDs matching the channel/branchId filters. */
async function resolveAllowedBranches(
  ctx: any,
  opts: { branchId?: Id<"branches">; channel?: Channel }
): Promise<{ ids: Id<"branches">[]; byId: Map<string, Doc<"branches">> }> {
  const branches = await ctx.db.query("branches").collect();
  const byId = new Map<string, Doc<"branches">>(
    branches.map((b: Doc<"branches">) => [b._id as string, b])
  );
  let filtered = branches.filter((b: Doc<"branches">) => b.isActive);
  if (opts.channel) filtered = filtered.filter((b: Doc<"branches">) => b.channel === opts.channel);
  if (opts.branchId) filtered = filtered.filter((b: Doc<"branches">) => b._id === opts.branchId);
  return { ids: filtered.map((b: Doc<"branches">) => b._id), byId };
}

// ─── getReportsSummary ────────────────────────────────────────────────────────
// Returns the 5 KPI cards: Sales, Units Sold, Against Target, Against LY,
// Projections — scoped to the filter combination.

export const getReportsSummary = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const startMs = ymdToMs(args.dateStart);
    const endMs = ymdToMs(args.dateEnd, true);

    // Target reads from settings and is independent of the branch/txn filter.
    const rangeDays = Math.max(1, Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)));
    const monthlyTarget = await readOrgMonthlyTargetCentavos(ctx);
    const targetCentavos = targetForPeriod(monthlyTarget, rangeDays, args.periodKind);

    const { ids: allowedIds } = await resolveAllowedBranches(ctx, {
      branchId: args.branchId,
      channel: args.channel,
    });

    if (allowedIds.length === 0) {
      return {
        salesCentavos: 0,
        unitsSold: 0,
        targetCentavos,
        targetPercent: 0,
        lyRevenueCentavos: 0,
        lyPercent: 0,
        projectedCentavos: 0,
      };
    }

    const txns = await fetchTxnsInRange(ctx, startMs, endMs, allowedIds);

    // Brand-filter pass + sales/units aggregation
    const variantCache = new Map<string, { styleId: Id<"styles">; brandId: Id<"brands"> | null } | null>();
    const styleBrandCache = new Map<string, Id<"brands"> | null>();
    const categoryBrandCache = new Map<string, Id<"brands"> | null>();

    async function getVariantBrand(variantId: Id<"variants">): Promise<Id<"brands"> | null> {
      const key = variantId as string;
      const cached = variantCache.get(key);
      if (cached !== undefined) return cached?.brandId ?? null;
      const variant = await ctx.db.get(variantId);
      if (!variant) {
        variantCache.set(key, null);
        return null;
      }
      const styleKey = variant.styleId as string;
      let brandId = styleBrandCache.get(styleKey);
      if (brandId === undefined) {
        const style = await ctx.db.get(variant.styleId);
        brandId = style ? await resolveStyleBrandId(ctx as any, style, categoryBrandCache) : null;
        styleBrandCache.set(styleKey, brandId);
      }
      variantCache.set(key, { styleId: variant.styleId, brandId });
      return brandId;
    }

    let salesCentavos = 0;
    let unitsSold = 0;
    for (const t of txns) {
      const items = await ctx.db
        .query("transactionItems")
        .withIndex("by_transaction", (q) => q.eq("transactionId", t._id))
        .collect();
      let lineSum = 0;
      let lineUnits = 0;
      let anyMatched = false;
      for (const item of items) {
        if (args.brandId) {
          const bId = await getVariantBrand(item.variantId);
          if (bId !== args.brandId) continue;
        }
        anyMatched = true;
        lineSum += item.lineTotalCentavos;
        lineUnits += item.quantity;
      }
      if (args.brandId) {
        // When filtering by brand, sum only matched line items (txn totals include other brands)
        salesCentavos += lineSum;
        unitsSold += lineUnits;
        void anyMatched;
      } else {
        salesCentavos += t.totalCentavos;
        unitsSold += lineUnits;
      }
    }

    // Target was computed before the branch filter short-circuit (always from settings).
    const targetPercent = targetCentavos > 0 ? (salesCentavos / targetCentavos) * 100 : 0;

    // Against LY — same date range shifted 1 year back
    const lyStart = ymdToMs(shiftYmdByYear(args.dateStart, -1));
    const lyEnd = ymdToMs(shiftYmdByYear(args.dateEnd, -1), true);
    const lyTxns = await fetchTxnsInRange(ctx, lyStart, lyEnd, allowedIds);
    let lyRevenueCentavos = 0;
    for (const t of lyTxns) {
      if (!args.brandId) {
        lyRevenueCentavos += t.totalCentavos;
        continue;
      }
      const items = await ctx.db
        .query("transactionItems")
        .withIndex("by_transaction", (q) => q.eq("transactionId", t._id))
        .collect();
      for (const item of items) {
        const bId = await getVariantBrand(item.variantId);
        if (bId === args.brandId) lyRevenueCentavos += item.lineTotalCentavos;
      }
    }
    const lyPercent = lyRevenueCentavos > 0 ? (salesCentavos / lyRevenueCentavos) * 100 : 0;

    // Projection — straight-line extrapolation to end of the selected range
    const now = Date.now();
    const elapsedMs = Math.min(now, endMs) - startMs;
    const totalRangeMs = endMs - startMs;
    const projectedCentavos =
      elapsedMs > 0 && totalRangeMs > 0
        ? Math.round((salesCentavos * totalRangeMs) / elapsedMs)
        : salesCentavos;

    return {
      salesCentavos,
      unitsSold,
      targetCentavos,
      targetPercent,
      lyRevenueCentavos,
      lyPercent,
      projectedCentavos,
    };
  },
});

// ─── getPerformanceByDimension ────────────────────────────────────────────────
// Unified query for the Performance pill. Dimension picks how rows are grouped:
//   people   → cashierId   (from transactions)
//   category → productCategoryId / categoryId
//   sku      → variantId
//   size     → variant.size
//   color    → variant.color
//   fit      → style.fitId

export const getPerformanceByDimension = query({
  args: {
    ...filterArgs,
    dimension: v.union(
      v.literal("people"),
      v.literal("department"),
      v.literal("category"),
      v.literal("sku"),
      v.literal("size"),
      v.literal("color"),
      v.literal("fit"),
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const startMs = ymdToMs(args.dateStart);
    const endMs = ymdToMs(args.dateEnd, true);
    const { ids: allowedIds } = await resolveAllowedBranches(ctx, {
      branchId: args.branchId,
      channel: args.channel,
    });

    if (allowedIds.length === 0) return [];

    const txns = await fetchTxnsInRange(ctx, startMs, endMs, allowedIds);

    type Row = {
      key: string;
      label: string;
      revenueCentavos: number;
      unitsSold: number;
      targetCentavos?: number;
      performancePercent?: number;
    };
    const agg = new Map<string, Row>();
    const bump = (key: string, label: string, revenue: number, units: number) => {
      const cur = agg.get(key);
      if (cur) {
        cur.revenueCentavos += revenue;
        cur.unitsSold += units;
      } else {
        agg.set(key, { key, label, revenueCentavos: revenue, unitsSold: units });
      }
    };

    // Cashiers dimension — simple path (no item scan)
    if (args.dimension === "people") {
      const cashierCache = new Map<string, string>();
      const getCashier = async (id: Id<"users">): Promise<string> => {
        const key = id as string;
        if (cashierCache.has(key)) return cashierCache.get(key) ?? "Unknown";
        const user = await ctx.db.get(id);
        const name = user?.name ?? user?.email ?? "Unknown";
        cashierCache.set(key, name);
        return name;
      };
      for (const t of txns) {
        const name = await getCashier(t.cashierId);
        // If brand filter active, need to scan items; otherwise use total
        if (args.brandId) {
          const items = await ctx.db
            .query("transactionItems")
            .withIndex("by_transaction", (q) => q.eq("transactionId", t._id))
            .collect();
          for (const it of items) {
            const variant = await ctx.db.get(it.variantId);
            if (!variant) continue;
            const style = await ctx.db.get(variant.styleId);
            if (!style) continue;
            const bId = style.brandId ??
              (style.categoryId ? (await ctx.db.get(style.categoryId))?.brandId : null);
            if (bId === args.brandId) {
              bump(t.cashierId as string, name, it.lineTotalCentavos, it.quantity);
            }
          }
        } else {
          // units from items
          const items = await ctx.db
            .query("transactionItems")
            .withIndex("by_transaction", (q) => q.eq("transactionId", t._id))
            .collect();
          const units = items.reduce((s, it) => s + it.quantity, 0);
          bump(t.cashierId as string, name, t.totalCentavos, units);
        }
      }

      // Compute a target per cashier: org-wide period target ÷ active cashiers in scope.
      const rangeDays = Math.max(1, Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)));
      const monthlyTarget = await readOrgMonthlyTargetCentavos(ctx);
      const scopeTargetCentavos = targetForPeriod(monthlyTarget, rangeDays, args.periodKind);

      const cashierCount = agg.size;
      const perCashierTarget =
        cashierCount > 0 && scopeTargetCentavos > 0
          ? Math.round(scopeTargetCentavos / cashierCount)
          : 0;

      for (const row of agg.values()) {
        row.targetCentavos = perCashierTarget;
        row.performancePercent =
          perCashierTarget > 0 ? (row.revenueCentavos / perCashierTarget) * 100 : 0;
      }

      return Array.from(agg.values()).sort((a, b) => b.revenueCentavos - a.revenueCentavos);
    }

    // Item-level dimensions — iterate txn items, resolve variant/style attributes
    const variantCache = new Map<string, Doc<"variants"> | null>();
    const styleCache = new Map<string, Doc<"styles"> | null>();
    const productCodeCache = new Map<string, string>();
    const categoryBrandCache = new Map<string, Id<"brands"> | null>();

    const getPC = async (id: Id<"productCodes"> | Id<"categories">): Promise<string> => {
      const key = id as string;
      if (productCodeCache.has(key)) return productCodeCache.get(key) ?? "Unknown";
      const doc = (await ctx.db.get(id)) as any;
      const label = doc?.description ?? doc?.name ?? "Unknown";
      productCodeCache.set(key, label);
      return label;
    };

    for (const t of txns) {
      const items = await ctx.db
        .query("transactionItems")
        .withIndex("by_transaction", (q) => q.eq("transactionId", t._id))
        .collect();
      for (const item of items) {
        let variant = variantCache.get(item.variantId as string);
        if (variant === undefined) {
          variant = await ctx.db.get(item.variantId);
          variantCache.set(item.variantId as string, variant);
        }
        if (!variant) continue;

        let style = styleCache.get(variant.styleId as string);
        if (style === undefined) {
          style = await ctx.db.get(variant.styleId);
          styleCache.set(variant.styleId as string, style);
        }
        if (!style) continue;

        // Apply brand filter
        if (args.brandId) {
          const bId = await resolveStyleBrandId(ctx as any, style, categoryBrandCache);
          if (bId !== args.brandId) continue;
        }

        if (args.dimension === "sku") {
          const label = variant.sku || "(no SKU)";
          bump(variant._id as string, label, item.lineTotalCentavos, item.quantity);
        } else if (args.dimension === "size") {
          const label = variant.size || "(none)";
          bump(label, label, item.lineTotalCentavos, item.quantity);
        } else if (args.dimension === "color") {
          const label = variant.color || "(none)";
          bump(label, label, item.lineTotalCentavos, item.quantity);
        } else if (args.dimension === "category") {
          const catPcId = style.productCategoryId ?? style.categoryId;
          if (!catPcId) {
            bump("(none)", "(none)", item.lineTotalCentavos, item.quantity);
          } else {
            const label = await getPC(catPcId);
            bump(catPcId as string, label, item.lineTotalCentavos, item.quantity);
          }
        } else if (args.dimension === "department") {
          // Department = variant.gender rolled up to existing department labels.
          //   mens                 → MENS
          //   womens               → LADIES
          //   unisex/kids/boys/... → UNISEX
          let dept: "MENS" | "LADIES" | "UNISEX" | "(none)";
          switch (variant.gender) {
            case "mens":
              dept = "MENS";
              break;
            case "womens":
              dept = "LADIES";
              break;
            case "unisex":
            case "kids":
            case "boys":
            case "girls":
              dept = "UNISEX";
              break;
            default:
              dept = "(none)";
          }
          bump(dept, dept, item.lineTotalCentavos, item.quantity);
        } else if (args.dimension === "fit") {
          if (!style.fitId) {
            bump("(none)", "(none)", item.lineTotalCentavos, item.quantity);
          } else {
            const label = await getPC(style.fitId);
            bump(style.fitId as string, label, item.lineTotalCentavos, item.quantity);
          }
        }
      }
    }

    return Array.from(agg.values()).sort((a, b) => b.revenueCentavos - a.revenueCentavos);
  },
});

// ─── getMovementsSummary ──────────────────────────────────────────────────────
// Inventory flow within the selected filters & date range.
//   received       → sum of inventoryBatches.quantity (branchId ∈ allowed, receivedAt in range)
//   sold           → sum of transactionItems.quantity (branchId ∈ allowed, txn.createdAt in range)
//   transferredOut → sum of transferItems.packedQuantity (fromBranchId ∈ allowed,
//                    transfer.packedAt in range, status ∈ packed/inTransit/delivered)
//   outgoing       = sold + transferredOut
//   netChange      = received − outgoing
//   liquidationRatePercent = outlet-channel sales / total sales × 100
// Also returns a per-branch breakdown with the same columns.

const OUTGOING_TRANSFER_STATUSES = ["packed", "inTransit", "delivered"] as const;

async function resolveVariantBrand(
  ctx: any,
  variantId: Id<"variants">,
  variantBrandCache: Map<string, Id<"brands"> | null>,
  styleBrandCache: Map<string, Id<"brands"> | null>,
  categoryBrandCache: Map<string, Id<"brands"> | null>,
): Promise<Id<"brands"> | null> {
  const vKey = variantId as string;
  const cached = variantBrandCache.get(vKey);
  if (cached !== undefined) return cached;
  const variant = await ctx.db.get(variantId);
  if (!variant) {
    variantBrandCache.set(vKey, null);
    return null;
  }
  const sKey = variant.styleId as string;
  let brandId = styleBrandCache.get(sKey);
  if (brandId === undefined) {
    const style = await ctx.db.get(variant.styleId);
    brandId = style ? await resolveStyleBrandId(ctx, style, categoryBrandCache) : null;
    styleBrandCache.set(sKey, brandId);
  }
  variantBrandCache.set(vKey, brandId);
  return brandId;
}

export const getMovementsSummary = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const startMs = ymdToMs(args.dateStart);
    const endMs = ymdToMs(args.dateEnd, true);
    const { ids: allowedIds, byId } = await resolveAllowedBranches(ctx, {
      branchId: args.branchId,
      channel: args.channel,
    });
    const allowedSet = new Set(allowedIds.map((id) => id as string));

    if (allowedIds.length === 0) {
      return {
        received: 0,
        sold: 0,
        transferredOut: 0,
        outgoing: 0,
        netChange: 0,
        liquidationRatePercent: 0,
        byBranch: [] as Array<{
          branchId: string;
          branchName: string;
          channel: string | null;
          received: number;
          sold: number;
          transferredOut: number;
          netChange: number;
        }>,
      };
    }

    // Brand-resolution caches (shared across passes)
    const variantBrandCache = new Map<string, Id<"brands"> | null>();
    const styleBrandCache = new Map<string, Id<"brands"> | null>();
    const categoryBrandCache = new Map<string, Id<"brands"> | null>();
    const matchesBrandFilter = async (variantId: Id<"variants">): Promise<boolean> => {
      if (!args.brandId) return true;
      const bId = await resolveVariantBrand(
        ctx,
        variantId,
        variantBrandCache,
        styleBrandCache,
        categoryBrandCache,
      );
      return bId === args.brandId;
    };

    // Per-branch aggregator
    type BranchAgg = { received: number; sold: number; transferredOut: number };
    const perBranch = new Map<string, BranchAgg>();
    const bump = (bId: string, field: keyof BranchAgg, qty: number) => {
      const cur = perBranch.get(bId) ?? { received: 0, sold: 0, transferredOut: 0 };
      cur[field] += qty;
      perBranch.set(bId, cur);
    };

    // 1. Received — scan inventoryBatches (filter by allowed branches, date, brand)
    // No cross-branch date index, but branch-filtered range exists only via by_branch_variant_received.
    // Fall back to .collect() and filter manually — fine for typical volumes.
    const batches = await ctx.db.query("inventoryBatches").collect();
    for (const b of batches) {
      if (!allowedSet.has(b.branchId as string)) continue;
      if (b.receivedAt < startMs || b.receivedAt > endMs) continue;
      if (!(await matchesBrandFilter(b.variantId))) continue;
      bump(b.branchId as string, "received", b.quantity);
    }

    // 2. Sold — scan transactions per allowed branch, then transactionItems
    for (const bId of allowedIds) {
      const txns = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", bId).gte("createdAt", startMs).lte("createdAt", endMs),
        )
        .collect();
      for (const t of txns) {
        if (t.status === "voided") continue;
        const items = await ctx.db
          .query("transactionItems")
          .withIndex("by_transaction", (q) => q.eq("transactionId", t._id))
          .collect();
        for (const it of items) {
          if (!(await matchesBrandFilter(it.variantId))) continue;
          bump(bId as string, "sold", it.quantity);
        }
      }
    }

    // 3. Transferred out — scan transfers in the relevant statuses, filter by fromBranchId + packedAt
    for (const status of OUTGOING_TRANSFER_STATUSES) {
      const transfers = await ctx.db
        .query("transfers")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      for (const tr of transfers) {
        if (!allowedSet.has(tr.fromBranchId as string)) continue;
        if (!tr.packedAt || tr.packedAt < startMs || tr.packedAt > endMs) continue;
        const items = await ctx.db
          .query("transferItems")
          .withIndex("by_transfer", (q) => q.eq("transferId", tr._id))
          .collect();
        for (const ti of items) {
          if (!(await matchesBrandFilter(ti.variantId))) continue;
          const qty = ti.packedQuantity ?? ti.requestedQuantity;
          bump(tr.fromBranchId as string, "transferredOut", qty);
        }
      }
    }

    // 4. Liquidation rate — outlet channel sales / total sales across allowed branches
    let totalSalesCentavos = 0;
    let outletSalesCentavos = 0;
    for (const bId of allowedIds) {
      const branch = byId.get(bId as string);
      if (!branch) continue;
      const txns = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", bId).gte("createdAt", startMs).lte("createdAt", endMs),
        )
        .collect();
      for (const t of txns) {
        if (t.status === "voided") continue;
        // If a brand filter is active, sum the brand-matching line totals only
        if (args.brandId) {
          const items = await ctx.db
            .query("transactionItems")
            .withIndex("by_transaction", (q) => q.eq("transactionId", t._id))
            .collect();
          for (const it of items) {
            if (!(await matchesBrandFilter(it.variantId))) continue;
            totalSalesCentavos += it.lineTotalCentavos;
            if (branch.channel === "outlet") outletSalesCentavos += it.lineTotalCentavos;
          }
        } else {
          totalSalesCentavos += t.totalCentavos;
          if (branch.channel === "outlet") outletSalesCentavos += t.totalCentavos;
        }
      }
    }
    const liquidationRatePercent =
      totalSalesCentavos > 0 ? (outletSalesCentavos / totalSalesCentavos) * 100 : 0;

    // Totals
    let received = 0;
    let sold = 0;
    let transferredOut = 0;
    const byBranch: Array<{
      branchId: string;
      branchName: string;
      channel: string | null;
      received: number;
      sold: number;
      transferredOut: number;
      netChange: number;
    }> = [];
    for (const [bId, agg] of perBranch.entries()) {
      received += agg.received;
      sold += agg.sold;
      transferredOut += agg.transferredOut;
      const branch = byId.get(bId);
      if (!branch) continue;
      byBranch.push({
        branchId: bId,
        branchName: branch.name,
        channel: branch.channel ?? null,
        received: agg.received,
        sold: agg.sold,
        transferredOut: agg.transferredOut,
        netChange: agg.received - agg.sold - agg.transferredOut,
      });
    }
    byBranch.sort((a, b) => b.received + b.sold + b.transferredOut - (a.received + a.sold + a.transferredOut));

    return {
      received,
      sold,
      transferredOut,
      outgoing: sold + transferredOut,
      netChange: received - sold - transferredOut,
      liquidationRatePercent,
      byBranch,
    };
  },
});

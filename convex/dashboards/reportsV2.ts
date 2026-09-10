// convex/dashboards/reportsV2.ts — Unified reports summary + performance dimensions

import { query, type QueryCtx } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { withBranchScope } from "../_helpers/withBranchScope";
import { resolveBranchMonthlyTarget, ymdToPeriodYm } from "./branchTargets";

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
// Roles allowed to read reports. HQ sees every branch; branch management is
// pinned to its own store.
const REPORT_ROLES = ["admin", "hqStaff", "manager", "viewer"] as const;

export type ReportScope = {
  branchId: Id<"branches"> | null;
  canAccessAllBranches: boolean;
};

/**
 * Report-specific scope check.
 *
 * withBranchScope admits every role that has a branch (cashiers and drivers
 * included), so reports layer their own role gate on top of it. Admin and HQ
 * staff get all branches; a manager or viewer gets exactly their own store and
 * cannot widen it through the filter arguments.
 */
async function resolveReportScope(ctx: QueryCtx): Promise<ReportScope> {
  const scope = await withBranchScope(ctx);
  if (!(REPORT_ROLES as readonly string[]).includes(scope.user.role)) {
    throw new ConvexError({ code: "UNAUTHORIZED" });
  }

  // Reports deliberately keep HQ on the whole org even while "View as Branch"
  // is active. The reports page has its own branch and channel filters, and
  // silently pinning the query would make those dropdowns look broken. For HQ,
  // narrowing here is a filter choice; for everyone else it is a scope
  // boundary, and withBranchScope has already guaranteed they have a branch.
  const isHq = scope.user.role === "admin" || scope.user.role === "hqStaff";

  return {
    branchId: isHq ? null : scope.branchId,
    canAccessAllBranches: isHq,
  };
}

async function resolveAllowedBranches(
  ctx: any,
  opts: { branchId?: Id<"branches">; channel?: Channel; scope: ReportScope }
): Promise<{ ids: Id<"branches">[]; byId: Map<string, Doc<"branches">> }> {
  const branches = await ctx.db.query("branches").collect();
  const byId = new Map<string, Doc<"branches">>(
    branches.map((b: Doc<"branches">) => [b._id as string, b])
  );

  // A branch-scoped caller only ever sees their own store. The branchId and
  // channel filter arguments come from the client, so they must not be able to
  // widen the scope — they are ignored entirely on this path.
  if (!opts.scope.canAccessAllBranches) {
    const own = branches.filter(
      (b: Doc<"branches">) => (b._id as string) === (opts.scope.branchId as string)
    );
    return { ids: own.map((b: Doc<"branches">) => b._id), byId };
  }

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
    const scope = await resolveReportScope(ctx);

    const startMs = ymdToMs(args.dateStart);
    const endMs = ymdToMs(args.dateEnd, true);

    const { ids: allowedIds } = await resolveAllowedBranches(ctx, {
      branchId: args.branchId,
      channel: args.channel,
      scope,
    });

    // Which target to measure against depends on what the report covers.
    //
    //   one store  → that store's own monthly goal (branchTargets, else the
    //                branch default). This is the only honest comparison for a
    //                single store, and the only one a manager ever sees.
    //   many stores → the org-wide setting, as before.
    //
    // HQ filtered down to one store that has no goal set yet falls back to the
    // org figure so nothing disappears from /admin/reports mid-rollout;
    // targetScope tells the UI to label it as an org number rather than pass
    // it off as the store's. A branch-scoped caller never gets that fallback —
    // an org target against one store's sales is a meaningless shortfall.
    const rangeDays = Math.max(1, Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)));

    let monthlyTarget = 0;
    let targetScope: "branch" | "org" | "none" = "none";

    if (allowedIds.length === 1) {
      monthlyTarget = await resolveBranchMonthlyTarget(
        ctx,
        allowedIds[0],
        ymdToPeriodYm(args.dateStart)
      );
      if (monthlyTarget > 0) targetScope = "branch";
    }

    if (targetScope === "none" && scope.canAccessAllBranches) {
      monthlyTarget = await readOrgMonthlyTargetCentavos(ctx);
      if (monthlyTarget > 0) targetScope = "org";
    }

    const targetCentavos = targetForPeriod(monthlyTarget, rangeDays, args.periodKind);
    const targetAvailable = targetScope !== "none";

    if (allowedIds.length === 0) {
      return {
        salesCentavos: 0,
        unitsSold: 0,
        targetCentavos,
        targetPercent: 0,
        targetAvailable,
        targetScope,
        transactionCount: 0,
        averageBasketCentavos: 0,
        returnTransactionCount: 0,
        returnedUnits: 0,
        returnsCentavos: 0,
        grossMarginCentavos: null,
        grossMarginPercent: null,
        costCoveragePercent: null,
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
    // Sales and units are net of returns, because returns are stored as
    // negative lines. These track the gross activity behind that netting, plus
    // cost for the lines that carry one.
    let transactionCount = 0;
    let returnTransactionCount = 0;
    let returnedUnits = 0;
    let returnsCentavos = 0;
    let costCentavos = 0;
    let costedRevenueCentavos = 0;

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

        if (item.quantity < 0) {
          returnedUnits += -item.quantity;
          returnsCentavos += -item.lineTotalCentavos;
        }

        const variantDoc = await ctx.db.get(item.variantId);
        const unitCost = variantDoc?.costPriceCentavos;
        if (unitCost !== undefined && unitCost > 0) {
          costCentavos += unitCost * item.quantity;
          costedRevenueCentavos += item.lineTotalCentavos;
        }
      }

      if (anyMatched || !args.brandId) {
        transactionCount++;
        // A refund or exchange is booked as its own transaction with a RET-
        // prefixed receipt number and a negative total.
        if (t.totalCentavos < 0 || t.receiptNumber.startsWith("RET-")) {
          returnTransactionCount++;
        }
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
      targetAvailable,
      targetScope,
      transactionCount,
      // Sales ÷ transactions — the number retail actually manages against.
      averageBasketCentavos:
        transactionCount > 0 ? Math.round(salesCentavos / transactionCount) : 0,
      returnTransactionCount,
      returnedUnits,
      returnsCentavos,
      grossMarginCentavos:
        costedRevenueCentavos > 0 ? costedRevenueCentavos - costCentavos : null,
      grossMarginPercent:
        costedRevenueCentavos > 0
          ? ((costedRevenueCentavos - costCentavos) / costedRevenueCentavos) * 100
          : null,
      // How much of sales we could actually cost. Margin is only as trustworthy
      // as this, so the UI shows it rather than implying full coverage.
      costCoveragePercent:
        salesCentavos > 0 ? (costedRevenueCentavos / salesCentavos) * 100 : null,
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
      v.literal("store"),
      v.literal("department"),
      v.literal("category"),
      v.literal("subCategory"),
      v.literal("sku"),
      v.literal("size"),
      v.literal("color"),
      v.literal("fit"),
    ),
  },
  handler: async (ctx, args) => {
    const scope = await resolveReportScope(ctx);

    const startMs = ymdToMs(args.dateStart);
    const endMs = ymdToMs(args.dateEnd, true);
    const { ids: allowedIds } = await resolveAllowedBranches(ctx, {
      branchId: args.branchId,
      channel: args.channel,
      scope,
    });

    if (allowedIds.length === 0) return [];

    const txns = await fetchTxnsInRange(ctx, startMs, endMs, allowedIds);

    type Row = {
      key: string;
      label: string;
      region?: string | null;
      revenueCentavos: number;
      unitsSold: number;
      // Cost is only counted for lines whose variant actually carries one.
      // costedRevenueCentavos is the revenue those lines represent, so margin %
      // is computed against what we can cost rather than against everything —
      // a margin computed over unpriced stock is worse than no margin at all.
      costCentavos?: number;
      costedRevenueCentavos?: number;
      // Returns are stored as negative lines, so revenue and units above are
      // already net of them. These surface the gross return activity.
      returnedUnits?: number;
      returnsCentavos?: number;
      currentSohUnits?: number;
      targetCentavos?: number;
      performancePercent?: number;
      topCalendarCode?: string | null;
      calendarCodeMix?: { code: string; revenueCentavos: number }[];
    };
    const agg = new Map<string, Row>();
    const calendarCodeAgg = new Map<string, Map<string, number>>();
    const bump = (key: string, label: string, revenue: number, units: number) => {
      const cur = agg.get(key);
      if (cur) {
        cur.revenueCentavos += revenue;
        cur.unitsSold += units;
      } else {
        agg.set(key, { key, label, revenueCentavos: revenue, unitsSold: units });
      }
    };
    /** Cost and returns for one sold (or returned) line. */
    const bumpCost = (
      key: string,
      label: string,
      item: { quantity: number; lineTotalCentavos: number },
      unitCostCentavos: number | undefined
    ) => {
      let cur = agg.get(key);
      if (!cur) {
        cur = { key, label, revenueCentavos: 0, unitsSold: 0 };
        agg.set(key, cur);
      }
      if (unitCostCentavos !== undefined && unitCostCentavos > 0) {
        // A negative quantity is a return, which puts stock back — so it
        // correctly reduces both cost and costed revenue.
        cur.costCentavos = (cur.costCentavos ?? 0) + unitCostCentavos * item.quantity;
        cur.costedRevenueCentavos =
          (cur.costedRevenueCentavos ?? 0) + item.lineTotalCentavos;
      }
      if (item.quantity < 0) {
        cur.returnedUnits = (cur.returnedUnits ?? 0) + -item.quantity;
        cur.returnsCentavos = (cur.returnsCentavos ?? 0) + -item.lineTotalCentavos;
      }
    };

    const bumpSoh = (key: string, label: string, units: number) => {
      const cur = agg.get(key);
      if (cur) {
        cur.currentSohUnits = (cur.currentSohUnits ?? 0) + units;
      } else {
        agg.set(key, {
          key,
          label,
          revenueCentavos: 0,
          unitsSold: 0,
          currentSohUnits: units,
        });
      }
    };
    const bumpCalendar = (rowKey: string, code: string, revenue: number) => {
      let m = calendarCodeAgg.get(rowKey);
      if (!m) {
        m = new Map<string, number>();
        calendarCodeAgg.set(rowKey, m);
      }
      m.set(code, (m.get(code) ?? 0) + revenue);
    };
    const finalizeCalendarCodes = () => {
      for (const row of agg.values()) {
        const m = calendarCodeAgg.get(row.key);
        if (!m || m.size === 0) {
          row.topCalendarCode = null;
          continue;
        }
        let bestCode: string | null = null;
        let bestRevenue = -1;
        const mix: { code: string; revenueCentavos: number }[] = [];
        for (const [code, revenue] of m.entries()) {
          mix.push({ code, revenueCentavos: revenue });
          if (revenue > bestRevenue) {
            bestRevenue = revenue;
            bestCode = code;
          }
        }
        mix.sort((a, b) => b.revenueCentavos - a.revenueCentavos);
        row.topCalendarCode = bestCode;
        row.calendarCodeMix = mix;
      }
    };

    // ── Calendar Code resolver — last 2 digits of year + 2-digit month (PHT)
    //   e.g. April 2026 → "2604"   December 2025 → "2512"
    const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
    const allBatches = await ctx.db.query("inventoryBatches").collect();
    const variantEarliestReceivedAt = new Map<string, number>();
    for (const b of allBatches) {
      const cur = variantEarliestReceivedAt.get(b.variantId as string);
      if (cur === undefined || b.receivedAt < cur) {
        variantEarliestReceivedAt.set(b.variantId as string, b.receivedAt);
      }
    }
    const calendarCodeForVariant = (variantId: Id<"variants">): string | null => {
      const ms = variantEarliestReceivedAt.get(variantId as string);
      if (ms === undefined) return null;
      const d = new Date(ms + PHT_OFFSET_MS);
      const yearTwoDigit = String(d.getUTCFullYear() % 100).padStart(2, "0");
      const month = String(d.getUTCMonth() + 1).padStart(2, "0");
      return `${yearTwoDigit}${month}`;
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
        const items = await ctx.db
          .query("transactionItems")
          .withIndex("by_transaction", (q) => q.eq("transactionId", t._id))
          .collect();
        if (args.brandId) {
          for (const it of items) {
            const variant = await ctx.db.get(it.variantId);
            if (!variant) continue;
            const style = await ctx.db.get(variant.styleId);
            if (!style) continue;
            const bId = style.brandId ??
              (style.categoryId ? (await ctx.db.get(style.categoryId))?.brandId : null);
            if (bId === args.brandId) {
              bump(t.cashierId as string, name, it.lineTotalCentavos, it.quantity);
              const code = calendarCodeForVariant(it.variantId);
              if (code) bumpCalendar(t.cashierId as string, code, it.lineTotalCentavos);
            }
          }
        } else {
          const units = items.reduce((s, it) => s + it.quantity, 0);
          bump(t.cashierId as string, name, t.totalCentavos, units);
          for (const it of items) {
            const code = calendarCodeForVariant(it.variantId);
            if (code) bumpCalendar(t.cashierId as string, code, it.lineTotalCentavos);
          }
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

      finalizeCalendarCodes();
      // Same shape as every other dimension. People performance is measured
      // against a sales target, not margin — attributing cost to a cashier
      // would mean scanning every line for a figure that says nothing about
      // how they sold — so the margin and return fields are explicitly null
      // rather than absent, and the UI hides those columns for this dimension.
      return Array.from(agg.values())
        .map((row) => ({
          ...row,
          marginCentavos: null,
          marginPercent: null,
          costCoveragePercent: null,
          returnedUnits: 0,
          returnsCentavos: 0,
          returnRatePercent: 0,
        }))
        .sort((a, b) => b.revenueCentavos - a.revenueCentavos);
    }

    // Store dimension — group by transaction.branchId. Brand filter requires item scan.
    if (args.dimension === "store") {
      const branchNameCache = new Map<string, string>();
      const branchRegionCache = new Map<string, string | null>();
      const branchById = await ctx.db.query("branches").collect();
      for (const b of branchById) {
        branchNameCache.set(b._id as string, b.name);
        branchRegionCache.set(
          b._id as string,
          (b as { region?: string }).region ?? null,
        );
      }

      // Brand-resolution caches reused for both txn items (sales) and inventory (SOH)
      const variantCache = new Map<string, Doc<"variants"> | null>();
      const styleCache = new Map<string, Doc<"styles"> | null>();
      const categoryBrandCache = new Map<string, Id<"brands"> | null>();

      for (const t of txns) {
        const branchKey = t.branchId as string;
        const branchName = branchNameCache.get(branchKey) ?? "Unknown";
        if (args.brandId) {
          const items = await ctx.db
            .query("transactionItems")
            .withIndex("by_transaction", (q) => q.eq("transactionId", t._id))
            .collect();
          for (const it of items) {
            let variant = variantCache.get(it.variantId as string);
            if (variant === undefined) {
              variant = await ctx.db.get(it.variantId);
              variantCache.set(it.variantId as string, variant);
            }
            if (!variant) continue;
            let style = styleCache.get(variant.styleId as string);
            if (style === undefined) {
              style = await ctx.db.get(variant.styleId);
              styleCache.set(variant.styleId as string, style);
            }
            if (!style) continue;
            const bId = await resolveStyleBrandId(ctx as any, style, categoryBrandCache);
            if (bId !== args.brandId) continue;
            bump(branchKey, branchName, it.lineTotalCentavos, it.quantity);
            bumpCost(branchKey, branchName, it, variant.costPriceCentavos);
            const code = calendarCodeForVariant(it.variantId);
            if (code) bumpCalendar(branchKey, code, it.lineTotalCentavos);
          }
        } else {
          const items = await ctx.db
            .query("transactionItems")
            .withIndex("by_transaction", (q) => q.eq("transactionId", t._id))
            .collect();
          const units = items.reduce((s, it) => s + it.quantity, 0);
          bump(branchKey, branchName, t.totalCentavos, units);
          for (const it of items) {
            // Cost needs the variant even when no brand filter forced a lookup.
            let v = variantCache.get(it.variantId as string);
            if (v === undefined) {
              v = await ctx.db.get(it.variantId);
              variantCache.set(it.variantId as string, v);
            }
            bumpCost(branchKey, branchName, it, v?.costPriceCentavos);
            const code = calendarCodeForVariant(it.variantId);
            if (code) bumpCalendar(branchKey, code, it.lineTotalCentavos);
          }
        }
      }

      // SOH per store — scoped to allowed branches & brand filter
      const allInventory = await ctx.db.query("inventory").collect();
      for (const inv of allInventory) {
        if (!allowedIds.includes(inv.branchId)) continue;
        if (inv.quantity <= 0) continue;
        if (args.brandId) {
          let variant = variantCache.get(inv.variantId as string);
          if (variant === undefined) {
            variant = await ctx.db.get(inv.variantId);
            variantCache.set(inv.variantId as string, variant);
          }
          if (!variant) continue;
          let style = styleCache.get(variant.styleId as string);
          if (style === undefined) {
            style = await ctx.db.get(variant.styleId);
            styleCache.set(variant.styleId as string, style);
          }
          if (!style) continue;
          const bId = await resolveStyleBrandId(ctx as any, style, categoryBrandCache);
          if (bId !== args.brandId) continue;
        }
        const branchKey = inv.branchId as string;
        const branchName = branchNameCache.get(branchKey) ?? "Unknown";
        bumpSoh(branchKey, branchName, inv.quantity);
      }

      // Per-store target = org period target ÷ active stores in scope
      const rangeDays = Math.max(1, Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)));
      const monthlyTarget = await readOrgMonthlyTargetCentavos(ctx);
      const scopeTargetCentavos = targetForPeriod(monthlyTarget, rangeDays, args.periodKind);
      const storeCount = agg.size;
      const perStoreTarget =
        storeCount > 0 && scopeTargetCentavos > 0
          ? Math.round(scopeTargetCentavos / storeCount)
          : 0;
      for (const row of agg.values()) {
        row.targetCentavos = perStoreTarget;
        row.performancePercent =
          perStoreTarget > 0 ? (row.revenueCentavos / perStoreTarget) * 100 : 0;
        row.region = branchRegionCache.get(row.key) ?? null;
      }

      finalizeCalendarCodes();
      // Store rows carry margin and returns like every other dimension.
      return Array.from(agg.values())
        .map((row) => {
          const costed = row.costedRevenueCentavos ?? 0;
          const cost = row.costCentavos ?? 0;
          const returned = row.returnedUnits ?? 0;
          return {
            ...row,
            marginCentavos: costed > 0 ? costed - cost : null,
            marginPercent: costed > 0 ? ((costed - cost) / costed) * 100 : null,
            costCoveragePercent:
              row.revenueCentavos > 0 ? (costed / row.revenueCentavos) * 100 : null,
            returnedUnits: returned,
            returnsCentavos: row.returnsCentavos ?? 0,
            returnRatePercent:
              row.unitsSold + returned > 0
                ? (returned / (row.unitsSold + returned)) * 100
                : 0,
          };
        })
        .sort((a, b) => b.revenueCentavos - a.revenueCentavos);
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

        let rowKey: string | null = null;
        if (args.dimension === "sku") {
          const label = variant.sku || "(no SKU)";
          rowKey = variant._id as string;
          bump(rowKey, label, item.lineTotalCentavos, item.quantity);
          bumpCost(rowKey, label, item, variant.costPriceCentavos);
        } else if (args.dimension === "size") {
          const label = variant.size || "(none)";
          rowKey = label;
          bump(rowKey, label, item.lineTotalCentavos, item.quantity);
          bumpCost(rowKey, label, item, variant.costPriceCentavos);
        } else if (args.dimension === "color") {
          const label = variant.color || "(none)";
          rowKey = label;
          bump(rowKey, label, item.lineTotalCentavos, item.quantity);
          bumpCost(rowKey, label, item, variant.costPriceCentavos);
        } else if (args.dimension === "category") {
          // Strict: only productCategoryId (the Category set in Settings).
          // Legacy style.categoryId is intentionally ignored.
          if (!style.productCategoryId) {
            rowKey = "(none)";
            bump(rowKey, "(none)", item.lineTotalCentavos, item.quantity);
          } else {
            const label = await getPC(style.productCategoryId);
            rowKey = style.productCategoryId as string;
            bump(rowKey, label, item.lineTotalCentavos, item.quantity);
          bumpCost(rowKey, label, item, variant.costPriceCentavos);
          }
        } else if (args.dimension === "subCategory") {
          // Strict: only style.subCategoryId from Settings → Product Codes.
          if (!style.subCategoryId) {
            rowKey = "(none)";
            bump(rowKey, "(none)", item.lineTotalCentavos, item.quantity);
          } else {
            const label = await getPC(style.subCategoryId);
            rowKey = style.subCategoryId as string;
            bump(rowKey, label, item.lineTotalCentavos, item.quantity);
          bumpCost(rowKey, label, item, variant.costPriceCentavos);
          }
        } else if (args.dimension === "department") {
          // Strict: only style.departmentId (Settings → Product Codes, type=department).
          if (!style.departmentId) {
            rowKey = "(none)";
            bump(rowKey, "(none)", item.lineTotalCentavos, item.quantity);
          } else {
            const label = await getPC(style.departmentId);
            rowKey = style.departmentId as string;
            bump(rowKey, label, item.lineTotalCentavos, item.quantity);
          bumpCost(rowKey, label, item, variant.costPriceCentavos);
          }
        } else if (args.dimension === "fit") {
          if (!style.fitId) {
            rowKey = "(none)";
            bump(rowKey, "(none)", item.lineTotalCentavos, item.quantity);
          } else {
            const label = await getPC(style.fitId);
            rowKey = style.fitId as string;
            bump(rowKey, label, item.lineTotalCentavos, item.quantity);
          bumpCost(rowKey, label, item, variant.costPriceCentavos);
          }
        }
        if (rowKey) {
          const code = calendarCodeForVariant(item.variantId);
          if (code) bumpCalendar(rowKey, code, item.lineTotalCentavos);
        }
      }
    }

    // ── Current SOH per row — scoped to allowed branches & brand filter ──
    const allInventory = await ctx.db.query("inventory").collect();
    const inventoryRows = allInventory.filter((inv) =>
      allowedIds.includes(inv.branchId),
    );
    for (const inv of inventoryRows) {
      if (inv.quantity <= 0) continue;

      let variant = variantCache.get(inv.variantId as string);
      if (variant === undefined) {
        variant = await ctx.db.get(inv.variantId);
        variantCache.set(inv.variantId as string, variant);
      }
      if (!variant) continue;

      let style = styleCache.get(variant.styleId as string);
      if (style === undefined) {
        style = await ctx.db.get(variant.styleId);
        styleCache.set(variant.styleId as string, style);
      }
      if (!style) continue;

      if (args.brandId) {
        const bId = await resolveStyleBrandId(ctx as any, style, categoryBrandCache);
        if (bId !== args.brandId) continue;
      }

      if (args.dimension === "sku") {
        const label = variant.sku || "(no SKU)";
        bumpSoh(variant._id as string, label, inv.quantity);
      } else if (args.dimension === "size") {
        const label = variant.size || "(none)";
        bumpSoh(label, label, inv.quantity);
      } else if (args.dimension === "color") {
        const label = variant.color || "(none)";
        bumpSoh(label, label, inv.quantity);
      } else if (args.dimension === "category") {
        // Strict: only productCategoryId (Settings). Legacy categoryId ignored.
        if (!style.productCategoryId) {
          bumpSoh("(none)", "(none)", inv.quantity);
        } else {
          const label = await getPC(style.productCategoryId);
          bumpSoh(style.productCategoryId as string, label, inv.quantity);
        }
      } else if (args.dimension === "subCategory") {
        if (!style.subCategoryId) {
          bumpSoh("(none)", "(none)", inv.quantity);
        } else {
          const label = await getPC(style.subCategoryId);
          bumpSoh(style.subCategoryId as string, label, inv.quantity);
        }
      } else if (args.dimension === "department") {
        // Strict: only style.departmentId from Settings → Product Codes.
        if (!style.departmentId) {
          bumpSoh("(none)", "(none)", inv.quantity);
        } else {
          const label = await getPC(style.departmentId);
          bumpSoh(style.departmentId as string, label, inv.quantity);
        }
      } else if (args.dimension === "fit") {
        if (!style.fitId) {
          bumpSoh("(none)", "(none)", inv.quantity);
        } else {
          const label = await getPC(style.fitId);
          bumpSoh(style.fitId as string, label, inv.quantity);
        }
      }
    }

    finalizeCalendarCodes();

    return Array.from(agg.values())
      .map((row) => {
        const costed = row.costedRevenueCentavos ?? 0;
        const cost = row.costCentavos ?? 0;
        // Margin is stated against costed revenue only, and costCoveragePercent
        // says how much of the row that actually is. A 62% margin covering a
        // third of sales is a very different claim from one covering all of it,
        // and the UI greys the figure out when coverage is thin.
        const marginCentavos = costed > 0 ? costed - cost : null;
        return {
          ...row,
          marginCentavos,
          marginPercent: costed > 0 ? ((costed - cost) / costed) * 100 : null,
          costCoveragePercent:
            row.revenueCentavos > 0 ? (costed / row.revenueCentavos) * 100 : null,
          returnedUnits: row.returnedUnits ?? 0,
          returnsCentavos: row.returnsCentavos ?? 0,
          // Returns as a share of gross units: units sold here are already net,
          // so gross is net + returned.
          returnRatePercent:
            row.unitsSold + (row.returnedUnits ?? 0) > 0
              ? ((row.returnedUnits ?? 0) / (row.unitsSold + (row.returnedUnits ?? 0))) * 100
              : 0,
        };
      })
      .sort((a, b) => b.revenueCentavos - a.revenueCentavos);
  },
});

// ─── getMovementsSummary ──────────────────────────────────────────────────────
// Inventory flow within the selected filters & date range.
//   bom            → SOH at the start of the period per branch
//                    (currentSOH − receivedInPeriod + soldInPeriod + transferredOutInPeriod)
//   received       → sum of inventoryBatches.quantity (branchId ∈ allowed, receivedAt in range)
//                    (kept for the Net calculation; not surfaced as its own column)
//   sold           → sum of transactionItems.quantity (branchId ∈ allowed, txn.createdAt in range)
//   transferredOut → sum of transferItems.packedQuantity (fromBranchId ∈ allowed,
//                    transfer.packedAt in range, status ∈ packed/inTransit/delivered)
//   outgoing       = sold + transferredOut
//   netChange      = received − outgoing  (period stock change; equals currentSOH − BOM)
//   currentSohUnits = sum(inventory.quantity) for allowed branches (with brand filter)
//   liquidationRatePercent = (bom − currentSohUnits) / bom × 100  (sell-through of BOM, 0–100%)
// Also returns a per-branch breakdown with bom in place of received.

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
    const scope = await resolveReportScope(ctx);

    const startMs = ymdToMs(args.dateStart);
    const endMs = ymdToMs(args.dateEnd, true);
    const { ids: allowedIds, byId } = await resolveAllowedBranches(ctx, {
      branchId: args.branchId,
      channel: args.channel,
      scope,
    });
    const allowedSet = new Set(allowedIds.map((id) => id as string));

    if (allowedIds.length === 0) {
      return {
        bom: 0,
        received: 0,
        sold: 0,
        transferredOut: 0,
        outgoing: 0,
        netChange: 0,
        currentSohUnits: 0,
        liquidationRatePercent: 0,
        byBranch: [] as Array<{
          branchId: string;
          branchName: string;
          channel: string | null;
          bom: number;
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
    // (legacy outlet/total ratio retained but no longer surfaced — replaced by BOM/MTD)
    void totalSalesCentavos;
    void outletSalesCentavos;

    // 5. Current SOH per allowed branch (with brand filter)
    const currentSohByBranch = new Map<string, number>();
    const inventoryRows = await ctx.db.query("inventory").collect();
    for (const inv of inventoryRows) {
      if (!allowedSet.has(inv.branchId as string)) continue;
      if (inv.quantity <= 0) continue;
      if (!(await matchesBrandFilter(inv.variantId))) continue;
      currentSohByBranch.set(
        inv.branchId as string,
        (currentSohByBranch.get(inv.branchId as string) ?? 0) + inv.quantity,
      );
    }

    // Totals — also derive BOM per branch:
    //   BOM = currentSOH − received(period) + sold(period) + transferredOut(period)
    let bomTotal = 0;
    let received = 0;
    let sold = 0;
    let transferredOut = 0;
    let currentSohUnits = 0;
    const byBranch: Array<{
      branchId: string;
      branchName: string;
      channel: string | null;
      bom: number;
      sold: number;
      transferredOut: number;
      netChange: number;
    }> = [];

    // Include branches that have current SOH but no period activity, so BOM still appears.
    const allBranchKeys = new Set<string>([
      ...perBranch.keys(),
      ...currentSohByBranch.keys(),
    ]);

    for (const bId of allBranchKeys) {
      const agg = perBranch.get(bId) ?? { received: 0, sold: 0, transferredOut: 0 };
      const currentSoh = currentSohByBranch.get(bId) ?? 0;
      const bom = currentSoh - agg.received + agg.sold + agg.transferredOut;
      received += agg.received;
      sold += agg.sold;
      transferredOut += agg.transferredOut;
      bomTotal += bom;
      currentSohUnits += currentSoh;
      const branch = byId.get(bId);
      if (!branch) continue;
      byBranch.push({
        branchId: bId,
        branchName: branch.name,
        channel: branch.channel ?? null,
        bom,
        sold: agg.sold,
        transferredOut: agg.transferredOut,
        netChange: agg.received - agg.sold - agg.transferredOut,
      });
    }
    byBranch.sort((a, b) => b.bom + b.sold + b.transferredOut - (a.bom + a.sold + a.transferredOut));

    // Sell-through of opening stock, clamped to [0, 100].
    const liquidationRatePercent =
      bomTotal > 0
        ? Math.max(0, Math.min(100, ((bomTotal - currentSohUnits) / bomTotal) * 100))
        : 0;

    return {
      bom: bomTotal,
      received,
      sold,
      transferredOut,
      outgoing: sold + transferredOut,
      netChange: received - sold - transferredOut,
      currentSohUnits,
      liquidationRatePercent,
      byBranch,
    };
  },
});

// ─── getPromotionContributions ────────────────────────────────────────────────
// For each promotion overlapping the report window, returns:
//   offer (name), salesCentavos, sharePercent of total period sales,
//   redemptions = distinct transactions that contained discounted lines while
//   the promo was active.
//
// Attribution heuristic: a transaction item is credited to a promo if
//   (1) the promo's [startDate, endDate] overlaps the txn timestamp,
//   (2) the line's unitPrice is below the variant's regular priceCentavos
//       (i.e., it was actually discounted), AND
//   (3) the line passes the promo's branch/brand scope where set.
// Multiple promos can match the same line; the line is split equally across
// all matching promos so totals stay consistent.

export const getPromotionContributions = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    const scope = await resolveReportScope(ctx);

    const startMs = ymdToMs(args.dateStart);
    const endMs = ymdToMs(args.dateEnd, true);
    const { ids: allowedIds } = await resolveAllowedBranches(ctx, {
      branchId: args.branchId,
      channel: args.channel,
      scope,
    });
    const allowedSet = new Set(allowedIds.map((id) => id as string));

    if (allowedIds.length === 0) {
      return {
        totalSalesCentavos: 0,
        promotions: [] as Array<{
          promotionId: string;
          offer: string;
          salesCentavos: number;
          sharePercent: number;
          redemptions: number;
        }>,
      };
    }

    // Pull all promos that overlap the report window
    const allPromos = await ctx.db.query("promotions").collect();
    const overlappingPromos = allPromos.filter((p) => {
      const ps = p.startDate ?? 0;
      const pe = p.endDate ?? Number.MAX_SAFE_INTEGER;
      return ps <= endMs && pe >= startMs;
    });

    // Caches
    const variantCache = new Map<string, Doc<"variants"> | null>();
    const styleBrandCache = new Map<string, Id<"brands"> | null>();
    const categoryBrandCache = new Map<string, Id<"brands"> | null>();

    type PromoAgg = {
      promotionId: string;
      offer: string;
      salesCentavos: number;
      txnIds: Set<string>;
    };
    const perPromo = new Map<string, PromoAgg>();
    const ensure = (p: Doc<"promotions">): PromoAgg => {
      const key = p._id as string;
      let cur = perPromo.get(key);
      if (!cur) {
        cur = {
          promotionId: key,
          offer: p.name,
          salesCentavos: 0,
          txnIds: new Set<string>(),
        };
        perPromo.set(key, cur);
      }
      return cur;
    };

    // Accumulate total period sales (for share%) across allowed branches
    let totalSalesCentavos = 0;

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

        type LineCtx = {
          item: Doc<"transactionItems">;
          variant: Doc<"variants">;
          isDiscounted: boolean;
          brandId: Id<"brands"> | null;
        };
        const lineCtxs: LineCtx[] = [];
        for (const it of items) {
          let variant = variantCache.get(it.variantId as string);
          if (variant === undefined) {
            variant = await ctx.db.get(it.variantId);
            variantCache.set(it.variantId as string, variant);
          }
          if (!variant) continue;

          let brandId = styleBrandCache.get(variant.styleId as string);
          if (brandId === undefined) {
            const style = await ctx.db.get(variant.styleId);
            brandId = style
              ? await resolveStyleBrandId(ctx as any, style, categoryBrandCache)
              : null;
            styleBrandCache.set(variant.styleId as string, brandId);
          }

          if (args.brandId && brandId !== args.brandId) continue;

          totalSalesCentavos += it.lineTotalCentavos;

          const isDiscounted =
            (variant.priceCentavos ?? 0) > 0 &&
            it.unitPriceCentavos < variant.priceCentavos;

          lineCtxs.push({ item: it, variant, isDiscounted, brandId });
        }

        // Path A — Direct attribution: txn explicitly tagged with a promotionId.
        const txnPromotionId = (t as { promotionId?: Id<"promotions"> }).promotionId;
        if (txnPromotionId) {
          const promo = overlappingPromos.find(
            (p) => (p._id as string) === (txnPromotionId as string),
          );
          if (promo) {
            const txnSales = lineCtxs.reduce(
              (s, l) => s + l.item.lineTotalCentavos,
              0,
            );
            if (txnSales > 0) {
              const agg = ensure(promo);
              agg.salesCentavos += txnSales;
              agg.txnIds.add(t._id as string);
            }
            continue; // direct attribution wins — skip the heuristic for this txn
          }
        }

        // Path B — Line-level heuristic for line-discounted lines without a tagged promotionId.
        for (const ctxLine of lineCtxs) {
          if (!ctxLine.isDiscounted) continue;
          const matching: Doc<"promotions">[] = [];
          for (const p of overlappingPromos) {
            const ps = p.startDate ?? 0;
            const pe = p.endDate ?? Number.MAX_SAFE_INTEGER;
            if (t.createdAt < ps || t.createdAt > pe) continue;

            if (
              p.branchIds &&
              p.branchIds.length > 0 &&
              !p.branchIds.some((id) => (id as string) === (bId as string))
            ) {
              continue;
            }
            if (
              p.brandIds &&
              p.brandIds.length > 0 &&
              ctxLine.brandId &&
              !p.brandIds.some((id) => (id as string) === (ctxLine.brandId as string))
            ) {
              continue;
            }
            if (
              p.variantIds &&
              p.variantIds.length > 0 &&
              !p.variantIds.some(
                (id) => (id as string) === (ctxLine.variant._id as string),
              )
            ) {
              continue;
            }
            matching.push(p);
          }
          if (matching.length === 0) continue;
          const split = ctxLine.item.lineTotalCentavos / matching.length;
          for (const p of matching) {
            const agg = ensure(p);
            agg.salesCentavos += split;
            agg.txnIds.add(t._id as string);
          }
        }
      }
    }

    const promotions = [...perPromo.values()]
      .map((a) => ({
        promotionId: a.promotionId,
        offer: a.offer,
        salesCentavos: Math.round(a.salesCentavos),
        sharePercent:
          totalSalesCentavos > 0 ? (a.salesCentavos / totalSalesCentavos) * 100 : 0,
        redemptions: a.txnIds.size,
      }))
      .sort((x, y) => y.salesCentavos - x.salesCentavos);

    return {
      totalSalesCentavos,
      promotions,
    };
  },
});

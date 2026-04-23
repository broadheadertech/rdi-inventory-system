import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import {
  getAllBranchSnapshots,
  getPHTDate,
} from "../snapshots/readers";

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;

const periodArg = v.optional(
  v.union(v.literal("daily"), v.literal("monthly"), v.literal("yearly"))
);

/** Start-of-period in UTC ms for PHT-local day/month/year boundaries. */
function getPeriodStartMs(period: "daily" | "monthly" | "yearly"): number {
  const phtNow = new Date(Date.now() + PHT_OFFSET_MS);
  const y = phtNow.getUTCFullYear();
  const m = phtNow.getUTCMonth();
  const d = phtNow.getUTCDate();
  const phtMidnight =
    period === "daily"
      ? Date.UTC(y, m, d)
      : period === "monthly"
        ? Date.UTC(y, m, 1)
        : Date.UTC(y, 0, 1);
  return phtMidnight - PHT_OFFSET_MS;
}

// NOTE: HQ_ROLES = ["admin", "hqStaff"]
// HQ staff bypass branch scoping — they see ALL branches' data.
// Do NOT use withBranchScope() here.

// ─── getHqMetrics ─────────────────────────────────────────────────────────────
// Top-row MetricCards: today + yesterday revenue/transaction totals, active alert
// count, and transfer status summary.
// Now reads from branchDailySnapshots instead of scanning all transactions.

export const getHqMetrics = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    const todayDate = getPHTDate(0);
    const yesterdayDate = getPHTDate(1);

    const [todaySnaps, yesterdaySnaps] = await Promise.all([
      getAllBranchSnapshots(ctx, todayDate),
      getAllBranchSnapshots(ctx, yesterdayDate),
    ]);

    const posTodayRevenue = todaySnaps.reduce((s, r) => s + r.salesTotalCentavos, 0);
    const posTodayCount = todaySnaps.reduce((s, r) => s + r.salesTransactionCount, 0);
    const posYesterdayRevenue = yesterdaySnaps.reduce((s, r) => s + r.salesTotalCentavos, 0);
    const posYesterdayCount = yesterdaySnaps.reduce((s, r) => s + r.salesTransactionCount, 0);

    const warehouseTodayRevenue = todaySnaps.reduce((s, r) => s + r.invoiceTotalCentavos, 0);
    const warehouseTodayCount = todaySnaps.reduce((s, r) => s + r.invoiceCount, 0);
    const warehouseYesterdayRevenue = yesterdaySnaps.reduce((s, r) => s + r.invoiceTotalCentavos, 0);

    const todayRevenueCentavos = posTodayRevenue + warehouseTodayRevenue;
    const todayTransactionCount = posTodayCount + warehouseTodayCount;
    const yesterdayRevenueCentavos = posYesterdayRevenue + warehouseYesterdayRevenue;
    const yesterdayTransactionCount = posYesterdayCount + yesterdaySnaps.reduce((s, r) => s + r.invoiceCount, 0);

    const activeAlertsCount = todaySnaps.reduce((s, r) => s + r.activeAlertCount, 0);
    const yesterdayAlertsCount = yesterdaySnaps.reduce((s, r) => s + r.activeAlertCount, 0);

    // Transfer counts — by_status index is efficient (no N+1)
    const [requestedTransfers, approvedTransfers, packedTransfers, inTransitTransfers] =
      await Promise.all([
        ctx.db.query("transfers").withIndex("by_status", (q) => q.eq("status", "requested")).collect(),
        ctx.db.query("transfers").withIndex("by_status", (q) => q.eq("status", "approved")).collect(),
        ctx.db.query("transfers").withIndex("by_status", (q) => q.eq("status", "packed")).collect(),
        ctx.db.query("transfers").withIndex("by_status", (q) => q.eq("status", "inTransit")).collect(),
      ]);

    return {
      todayRevenueCentavos,
      yesterdayRevenueCentavos,
      todayTransactionCount,
      yesterdayTransactionCount,
      warehouseTodayRevenueCentavos: warehouseTodayRevenue,
      warehouseYesterdayRevenueCentavos: warehouseYesterdayRevenue,
      warehouseTodayInvoiceCount: warehouseTodayCount,
      activeAlertsCount,
      todayNewAlertsCount: activeAlertsCount - yesterdayAlertsCount,
      yesterdayNewAlertsCount: 0, // historical data not in snapshots — show 0
      transferSummary: {
        pendingApproval: requestedTransfers.length,
        inFlight: approvedTransfers.length + packedTransfers.length + inTransitTransfers.length,
      },
    };
  },
});

// ─── getBranchStatusCards ─────────────────────────────────────────────────────
// Per-branch summary cards with health indicator.
// Now reads from branchDailySnapshots — one indexed read per branch date pair.

export const getBranchStatusCards = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    const todayDate = getPHTDate(0);
    const todaySnaps = await getAllBranchSnapshots(ctx, todayDate);

    // Need branch names + types
    const branches = await ctx.db.query("branches").collect();
    const branchMap = new Map(branches.filter((b) => b.isActive).map((b) => [b._id as string, b]));

    return todaySnaps
      .map((snap) => {
        const branch = branchMap.get(snap.branchId as string);
        if (!branch) return null;

        const todayRevenueCentavos = snap.salesTotalCentavos + snap.invoiceTotalCentavos;
        const todayTransactionCount = snap.salesTransactionCount + snap.invoiceCount;

        // Health status
        let healthStatus: "healthy" | "attention" | "critical" | "offline";
        if (todayTransactionCount === 0) {
          healthStatus = "offline";
        } else if (snap.activeAlertCount >= 3) {
          healthStatus = "critical";
        } else if (snap.activeAlertCount >= 1) {
          healthStatus = "attention";
        } else {
          healthStatus = "healthy";
        }

        return {
          branchId: snap.branchId,
          branchName: branch.name,
          todayRevenueCentavos,
          todayTransactionCount,
          activeAlertCount: snap.activeAlertCount,
          healthStatus,
          lastActivityAt: snap.generatedAt, // approximate — snapshot time
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  },
});

// ─── getAttentionItems ────────────────────────────────────────────────────────
// Priority-sorted list of actionable alerts for HQ.
// Transfer + unsynced queries are lightweight (index-bounded), no snapshot needed.

type AttentionItem = {
  id: string;
  type: "low-stock" | "pending-transfer" | "sync-conflict";
  priority: "critical" | "warning" | "info";
  title: string;
  description: string;
  branchName: string;
  linkTo: string;
};

export const getAttentionItems = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    const items: AttentionItem[] = [];

    const branchCache = new Map<string, string>();
    async function getBranchName(branchId: Id<"branches">): Promise<string> {
      const key = branchId as string;
      if (branchCache.has(key)) return branchCache.get(key) ?? "(inactive)";
      const branch = await ctx.db.get(branchId);
      const name = branch?.isActive ? branch.name : "(inactive)";
      branchCache.set(key, name);
      return name;
    }

    // 1. Low-stock alerts — use snapshot count to show summary instead of per-alert items
    const todayDate = getPHTDate(0);
    const snaps = await getAllBranchSnapshots(ctx, todayDate);
    for (const snap of snaps) {
      if (snap.activeAlertCount > 0) {
        const branchName = await getBranchName(snap.branchId);
        items.push({
          id: snap.branchId as string,
          type: "low-stock",
          priority: snap.activeAlertCount >= 3 ? "critical" : "warning",
          title: `${snap.activeAlertCount} low stock alert${snap.activeAlertCount > 1 ? "s" : ""} at ${branchName}`,
          description: `${snap.lowStockCount} items below threshold, ${snap.outOfStockCount} out of stock`,
          branchName,
          linkTo: "/admin/dashboard",
        });
      }
    }

    // 2. Pending transfer requests
    const requestedTransfers = await ctx.db
      .query("transfers")
      .withIndex("by_status", (q) => q.eq("status", "requested"))
      .collect();

    for (const transfer of requestedTransfers) {
      const fromBranchName = await getBranchName(transfer.fromBranchId);
      const toBranchName = await getBranchName(transfer.toBranchId);
      items.push({
        id: transfer._id as string,
        type: "pending-transfer",
        priority: "warning",
        title: "Transfer awaiting approval",
        description: `${fromBranchName} → ${toBranchName}`,
        branchName: fromBranchName,
        linkTo: "/admin/transfers",
      });
    }

    // 3. Unsynced offline transactions
    const offlineTxns = await ctx.db
      .query("transactions")
      .filter((q) => q.eq(q.field("isOffline"), true))
      .collect();
    const unsynced = offlineTxns.filter((t) => !t.syncedAt);

    for (const txn of unsynced) {
      const branchName = await getBranchName(txn.branchId);
      items.push({
        id: txn._id as string,
        type: "sync-conflict",
        priority: "critical",
        title: "Offline transaction not synced",
        description: `Branch: ${branchName} — Receipt ${txn.receiptNumber}`,
        branchName,
        linkTo: "/admin/transfers",
      });
    }

    const PRIORITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    return items.sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    );
  },
});

// ─── getHqSalesBreakdown ──────────────────────────────────────────────────────
// Overall sales + top-2 brand sales + gross profit for today's POS transactions.
// Scans today's transactions per active branch (index-bounded), resolves each
// item's brand via style.brandId with legacy category.brandId fallback.

export const getHqSalesBreakdown = query({
  args: { period: periodArg },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const period = args.period ?? "monthly";
    const startMs = getPeriodStartMs(period);

    const branches = await ctx.db.query("branches").collect();
    const activeBranches = branches.filter((b) => b.isActive);

    const allTxns: Doc<"transactions">[] = [];
    for (const branch of activeBranches) {
      const txns = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", branch._id).gte("createdAt", startMs)
        )
        .collect();
      allTxns.push(...txns);
    }

    const completedTxns = allTxns.filter((t) => t.status !== "voided");
    const totalSalesCentavos = completedTxns.reduce((s, t) => s + t.totalCentavos, 0);

    const items: Doc<"transactionItems">[] = [];
    for (const txn of completedTxns) {
      const txItems = await ctx.db
        .query("transactionItems")
        .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
        .collect();
      items.push(...txItems);
    }

    const variantCache = new Map<
      string,
      { styleId: Id<"styles">; costPriceCentavos: number } | null
    >();
    const styleBrandCache = new Map<string, Id<"brands"> | null>();
    const categoryBrandCache = new Map<string, Id<"brands"> | null>();
    const brandRevenue = new Map<string, number>();
    let grossProfitCentavos = 0;

    for (const item of items) {
      let variant = variantCache.get(item.variantId as string);
      if (variant === undefined) {
        const v = await ctx.db.get(item.variantId);
        variant = v
          ? { styleId: v.styleId, costPriceCentavos: v.costPriceCentavos ?? 0 }
          : null;
        variantCache.set(item.variantId as string, variant);
      }
      if (!variant) continue;

      const costThisLine = variant.costPriceCentavos * item.quantity;
      grossProfitCentavos += item.lineTotalCentavos - costThisLine;

      let brandId = styleBrandCache.get(variant.styleId as string);
      if (brandId === undefined) {
        const style = await ctx.db.get(variant.styleId);
        if (!style) {
          styleBrandCache.set(variant.styleId as string, null);
          continue;
        }
        let resolved: Id<"brands"> | null = style.brandId ?? null;
        if (!resolved && style.categoryId) {
          let catBrand = categoryBrandCache.get(style.categoryId as string);
          if (catBrand === undefined) {
            const cat = await ctx.db.get(style.categoryId);
            catBrand = cat?.brandId ?? null;
            categoryBrandCache.set(style.categoryId as string, catBrand);
          }
          resolved = catBrand;
        }
        brandId = resolved;
        styleBrandCache.set(variant.styleId as string, brandId);
      }
      if (!brandId) continue;

      brandRevenue.set(
        brandId as string,
        (brandRevenue.get(brandId as string) ?? 0) + item.lineTotalCentavos
      );
    }

    // Every active brand gets a card, ordered by name — zero sales if none today
    const allBrands = await ctx.db.query("brands").collect();
    const brandSales = allBrands
      .filter((b) => b.isActive)
      .map((b) => ({
        brandId: b._id as string,
        brandName: b.name,
        salesCentavos: brandRevenue.get(b._id as string) ?? 0,
      }))
      .sort((a, b) => a.brandName.localeCompare(b.brandName));

    return {
      totalSalesCentavos,
      brands: brandSales,
      grossProfitCentavos,
    };
  },
});

// ─── getHqInventoryBreakdown ──────────────────────────────────────────────────
// Overall stock-on-hand + per-brand SOH + liquidation rate (outlet-channel sales
// today as a % of total POS sales today). SOH scans the inventory table and
// resolves each variant's brand via style.brandId with legacy fallback.

export const getHqInventoryBreakdown = query({
  args: { period: periodArg },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const period = args.period ?? "monthly";
    const inventoryRows = await ctx.db.query("inventory").collect();

    const variantInfoCache = new Map<
      string,
      { styleId: Id<"styles">; costPriceCentavos: number; priceCentavos: number } | null
    >();
    const styleBrandCache = new Map<string, Id<"brands"> | null>();
    const categoryBrandCache = new Map<string, Id<"brands"> | null>();
    const brandSoh = new Map<string, number>();
    let totalSohUnits = 0;
    let totalSohCostCentavos = 0;
    let totalSohRetailCentavos = 0;

    for (const inv of inventoryRows) {
      totalSohUnits += inv.quantity;

      let info = variantInfoCache.get(inv.variantId as string);
      if (info === undefined) {
        const v = await ctx.db.get(inv.variantId);
        info = v
          ? {
              styleId: v.styleId,
              costPriceCentavos: v.costPriceCentavos ?? 0,
              priceCentavos: v.priceCentavos ?? 0,
            }
          : null;
        variantInfoCache.set(inv.variantId as string, info);
      }
      if (!info) continue;

      totalSohCostCentavos += info.costPriceCentavos * inv.quantity;
      totalSohRetailCentavos += info.priceCentavos * inv.quantity;

      const styleId = info.styleId;

      let brandId = styleBrandCache.get(styleId as string);
      if (brandId === undefined) {
        const style = await ctx.db.get(styleId);
        if (!style) {
          styleBrandCache.set(styleId as string, null);
          continue;
        }
        let resolved: Id<"brands"> | null = style.brandId ?? null;
        if (!resolved && style.categoryId) {
          let catBrand = categoryBrandCache.get(style.categoryId as string);
          if (catBrand === undefined) {
            const cat = await ctx.db.get(style.categoryId);
            catBrand = cat?.brandId ?? null;
            categoryBrandCache.set(style.categoryId as string, catBrand);
          }
          resolved = catBrand;
        }
        brandId = resolved;
        styleBrandCache.set(styleId as string, brandId);
      }
      if (!brandId) continue;

      brandSoh.set(
        brandId as string,
        (brandSoh.get(brandId as string) ?? 0) + inv.quantity
      );
    }

    const allBrands = await ctx.db.query("brands").collect();
    const brands = allBrands
      .filter((b) => b.isActive)
      .map((b) => ({
        brandId: b._id as string,
        brandName: b.name,
        sohUnits: brandSoh.get(b._id as string) ?? 0,
        parLevel: b.parLevel ?? 0,
      }))
      .sort((a, b) => a.brandName.localeCompare(b.brandName));

    // Liquidation rate = outlet-channel sales / total POS sales for the period
    const startMs = getPeriodStartMs(period);
    const branches = await ctx.db.query("branches").collect();
    const activeBranches = branches.filter((b) => b.isActive);

    let totalSalesCentavos = 0;
    let outletSalesCentavos = 0;
    for (const branch of activeBranches) {
      const txns = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", branch._id).gte("createdAt", startMs)
        )
        .collect();
      for (const t of txns) {
        if (t.status === "voided") continue;
        totalSalesCentavos += t.totalCentavos;
        if (branch.channel === "outlet") {
          outletSalesCentavos += t.totalCentavos;
        }
      }
    }

    const liquidationRatePercent =
      totalSalesCentavos > 0
        ? (outletSalesCentavos / totalSalesCentavos) * 100
        : 0;

    return {
      totalSohUnits,
      totalSohCostCentavos,
      totalSohRetailCentavos,
      brands,
      liquidationRatePercent,
    };
  },
});

// ─── getHqSalesTimeSeries ─────────────────────────────────────────────────────
// Revenue time-series for the dashboard graph, bucketed by the active period.
//   daily   → 24 hourly buckets (00:00–23:00 PHT)
//   monthly → one bucket per day-of-month in the current month
//   yearly  → 12 monthly buckets (Jan–Dec) of the current year

export const getHqSalesTimeSeries = query({
  args: { period: periodArg },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const period = args.period ?? "monthly";
    const phtNow = new Date(Date.now() + PHT_OFFSET_MS);
    const startMs = getPeriodStartMs(period);

    // Pull transactions for the period across all active branches
    const branches = await ctx.db.query("branches").collect();
    const activeBranches = branches.filter((b) => b.isActive);

    const allTxns: Doc<"transactions">[] = [];
    for (const branch of activeBranches) {
      const txns = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", branch._id).gte("createdAt", startMs)
        )
        .collect();
      allTxns.push(...txns);
    }
    const completed = allTxns.filter((t) => t.status !== "voided");

    // Build buckets
    type Bucket = { label: string; totalCentavos: number };
    let buckets: Bucket[] = [];
    const getBucketIndex = (createdAt: number): number => {
      const phtDate = new Date(createdAt + PHT_OFFSET_MS);
      if (period === "daily") return phtDate.getUTCHours();
      if (period === "monthly") return phtDate.getUTCDate() - 1;
      return phtDate.getUTCMonth();
    };

    if (period === "daily") {
      buckets = Array.from({ length: 24 }, (_, h) => ({
        label: `${String(h).padStart(2, "0")}:00`,
        totalCentavos: 0,
      }));
    } else if (period === "monthly") {
      const y = phtNow.getUTCFullYear();
      const m = phtNow.getUTCMonth();
      const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      buckets = Array.from({ length: daysInMonth }, (_, i) => ({
        label: String(i + 1),
        totalCentavos: 0,
      }));
    } else {
      const MONTH_LABELS = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
      ];
      buckets = MONTH_LABELS.map((label) => ({ label, totalCentavos: 0 }));
    }

    for (const t of completed) {
      const idx = getBucketIndex(t.createdAt);
      if (idx >= 0 && idx < buckets.length) {
        buckets[idx].totalCentavos += t.totalCentavos;
      }
    }

    return { period, buckets };
  },
});

// ─── getHqSalesBucketDetail ──────────────────────────────────────────────────
// Returns per-branch breakdown for a single bucket of getHqSalesTimeSeries.
//   period: "daily"   → bucketIndex 0..23 maps to PHT hour of today
//   period: "monthly" → bucketIndex 0..N maps to day-of-month (1-indexed N)
//   period: "yearly"  → bucketIndex 0..11 maps to PHT month of this year

export const getHqSalesBucketDetail = query({
  args: {
    period: periodArg,
    bucketIndex: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const period = args.period ?? "monthly";
    const phtNow = new Date(Date.now() + PHT_OFFSET_MS);
    const y = phtNow.getUTCFullYear();
    const m = phtNow.getUTCMonth();
    const d = phtNow.getUTCDate();

    let startMs: number;
    let endMs: number;
    let label: string;

    if (period === "daily") {
      const phtMidnight = Date.UTC(y, m, d);
      startMs = phtMidnight + args.bucketIndex * 60 * 60 * 1000 - PHT_OFFSET_MS;
      endMs = startMs + 60 * 60 * 1000 - 1;
      label = `${String(args.bucketIndex).padStart(2, "0")}:00`;
    } else if (period === "monthly") {
      const day = args.bucketIndex + 1;
      startMs = Date.UTC(y, m, day) - PHT_OFFSET_MS;
      endMs = startMs + 24 * 60 * 60 * 1000 - 1;
      label = `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m]} ${day}`;
    } else {
      // yearly — bucketIndex = month
      const monthStart = Date.UTC(y, args.bucketIndex, 1) - PHT_OFFSET_MS;
      const monthEnd = Date.UTC(y, args.bucketIndex + 1, 1) - PHT_OFFSET_MS - 1;
      startMs = monthStart;
      endMs = monthEnd;
      label = `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][args.bucketIndex]} ${y}`;
    }

    // Fetch transactions in the bucket window across all active branches
    const branches = await ctx.db.query("branches").collect();
    const activeBranches = branches.filter((b) => b.isActive);

    type BranchAgg = {
      branchId: Id<"branches">;
      branchName: string;
      channel: string | null;
      salesCentavos: number;
      transactionCount: number;
      itemsSold: number;
    };
    const perBranch = new Map<string, BranchAgg>();

    for (const branch of activeBranches) {
      const txns = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", branch._id).gte("createdAt", startMs).lte("createdAt", endMs)
        )
        .collect();
      let sales = 0;
      let txnCount = 0;
      let units = 0;
      for (const t of txns) {
        if (t.status === "voided") continue;
        sales += t.totalCentavos;
        txnCount++;
        const items = await ctx.db
          .query("transactionItems")
          .withIndex("by_transaction", (q) => q.eq("transactionId", t._id))
          .collect();
        for (const it of items) units += it.quantity;
      }
      if (sales > 0) {
        perBranch.set(branch._id as string, {
          branchId: branch._id,
          branchName: branch.name,
          channel: branch.channel ?? null,
          salesCentavos: sales,
          transactionCount: txnCount,
          itemsSold: units,
        });
      }
    }

    const items = [...perBranch.values()].sort((a, b) => b.salesCentavos - a.salesCentavos);
    const totalSalesCentavos = items.reduce((s, r) => s + r.salesCentavos, 0);
    const totalTxns = items.reduce((s, r) => s + r.transactionCount, 0);
    const totalUnits = items.reduce((s, r) => s + r.itemsSold, 0);

    return {
      period,
      bucketIndex: args.bucketIndex,
      label,
      startMs,
      endMs,
      totalSalesCentavos,
      totalTxns,
      totalUnits,
      items,
    };
  },
});

// ─── getStoreRanking ──────────────────────────────────────────────────────────
// Returns branches ranked by total sales (POS + invoice) for a specific PHT date.
// Used by the Dashboard "Store Ranking" section. Default date = yesterday.

export const getStoreRanking = query({
  args: {
    date: v.string(), // "YYYY-MM-DD" in PHT
    limit: v.optional(v.number()), // 10 or 20; if omitted, returns all
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const snaps = await getAllBranchSnapshots(ctx, args.date);
    if (snaps.length === 0) {
      return {
        date: args.date,
        items: [] as Array<{
          rank: number;
          branchId: Id<"branches">;
          branchName: string;
          channel: string | null;
          salesCentavos: number;
          transactionCount: number;
          itemsSold: number;
          sharePercent: number;
        }>,
        totalSalesCentavos: 0,
      };
    }

    // Enrich with branch metadata (name + channel)
    const branchIds = snaps.map((s) => s.branchId);
    const branchDocs = await Promise.all(branchIds.map((id) => ctx.db.get(id)));
    const branchMap = new Map<string, Doc<"branches">>();
    for (const b of branchDocs) {
      if (b) branchMap.set(b._id as string, b);
    }

    const combined = snaps
      .map((s) => {
        const branch = branchMap.get(s.branchId as string);
        const salesCentavos = s.salesTotalCentavos + s.invoiceTotalCentavos;
        return {
          branchId: s.branchId,
          branchName: branch?.name ?? "Unknown",
          channel: branch?.channel ?? null,
          salesCentavos,
          transactionCount: s.salesTransactionCount + s.invoiceCount,
          itemsSold: s.salesItemsSold,
        };
      })
      .filter((r) => r.salesCentavos > 0)
      .sort((a, b) => b.salesCentavos - a.salesCentavos);

    const totalSalesCentavos = combined.reduce((s, r) => s + r.salesCentavos, 0);

    const limited = typeof args.limit === "number" ? combined.slice(0, args.limit) : combined;

    return {
      date: args.date,
      totalSalesCentavos,
      items: limited.map((r, i) => ({
        rank: i + 1,
        branchId: r.branchId,
        branchName: r.branchName,
        channel: r.channel,
        salesCentavos: r.salesCentavos,
        transactionCount: r.transactionCount,
        itemsSold: r.itemsSold,
        sharePercent:
          totalSalesCentavos > 0 ? (r.salesCentavos / totalSalesCentavos) * 100 : 0,
      })),
    };
  },
});

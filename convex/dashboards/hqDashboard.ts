import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";

// NOTE: HQ_ROLES = ["admin", "hqStaff"]
// HQ staff bypass branch scoping — they see ALL branches' data.
// Do NOT use withBranchScope() here.

// ─── Philippine Time (UTC+8) day boundary helper ─────────────────────────────
// Returns the UTC millisecond timestamp for midnight PHT on the current calendar day.
function getPHTDayStartMs(): number {
  const PHT_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8
  const nowUtcMs = Date.now();
  const nowPhtMs = nowUtcMs + PHT_OFFSET_MS;
  // Floor to midnight PHT
  const todayPhtStartMs = nowPhtMs - (nowPhtMs % (24 * 60 * 60 * 1000));
  return todayPhtStartMs - PHT_OFFSET_MS; // convert back to UTC ms
}

// ─── getHqMetrics ─────────────────────────────────────────────────────────────
// Top-row MetricCards: today + yesterday revenue/transaction totals, active alert
// count, and transfer status summary.

export const getHqMetrics = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    const todayStart = getPHTDayStartMs();
    const yesterdayStart = todayStart - 86400000; // 24h before today start

    // Fetch all active branches — use per-branch index queries (bounded by ≤20 branches)
    const branches = await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Single query per branch covering yesterday + today (minimise roundtrips)
    const branchMetrics = await Promise.all(
      branches.map(async (branch) => {
        const recentTxns = await ctx.db
          .query("transactions")
          .withIndex("by_branch_date", (q) =>
            q.eq("branchId", branch._id).gte("createdAt", yesterdayStart)
          )
          .collect();

        const todayFiltered = recentTxns.filter((t) => t.createdAt >= todayStart);
        const yesterdayFiltered = recentTxns.filter((t) => t.createdAt < todayStart);

        return {
          todayRev: todayFiltered.reduce((sum, t) => sum + t.totalCentavos, 0),
          todayCount: todayFiltered.length,
          yesterdayRev: yesterdayFiltered.reduce((sum, t) => sum + t.totalCentavos, 0),
          yesterdayCount: yesterdayFiltered.length,
        };
      })
    );

    const posTodayRevenue = branchMetrics.reduce((s, b) => s + b.todayRev, 0);
    const posTodayCount = branchMetrics.reduce((s, b) => s + b.todayCount, 0);
    const posYesterdayRevenue = branchMetrics.reduce((s, b) => s + b.yesterdayRev, 0);
    const posYesterdayCount = branchMetrics.reduce((s, b) => s + b.yesterdayCount, 0);

    // Warehouse transfer revenue — internal invoices credited to warehouse
    const todayInvoices = await ctx.db
      .query("internalInvoices")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", todayStart))
      .collect();
    const yesterdayInvoices = await ctx.db
      .query("internalInvoices")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", yesterdayStart))
      .collect();

    const warehouseTodayRevenue = todayInvoices.reduce((s, inv) => s + inv.totalCentavos, 0);
    const warehouseTodayCount = todayInvoices.length;
    const yesterdayOnlyInvoices = yesterdayInvoices.filter((inv) => inv.createdAt < todayStart);
    const warehouseYesterdayRevenue = yesterdayOnlyInvoices.reduce((s, inv) => s + inv.totalCentavos, 0);
    const warehouseYesterdayCount = yesterdayOnlyInvoices.length;

    const todayRevenueCentavos = posTodayRevenue + warehouseTodayRevenue;
    const todayTransactionCount = posTodayCount + warehouseTodayCount;
    const yesterdayRevenueCentavos = posYesterdayRevenue + warehouseYesterdayRevenue;
    const yesterdayTransactionCount = posYesterdayCount + warehouseYesterdayCount;

    // Active alerts — full table scan (lowStockAlerts has no global by_status index)
    const activeAlerts = await ctx.db
      .query("lowStockAlerts")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    // Alert trend: new alerts created today vs yesterday (still-active only;
    // dismissed alerts are excluded since there is no historical snapshot)
    const todayNewAlertsCount = activeAlerts.filter(
      (a) => a._creationTime >= todayStart
    ).length;
    const yesterdayNewAlertsCount = activeAlerts.filter(
      (a) => a._creationTime >= yesterdayStart && a._creationTime < todayStart
    ).length;

    // Transfer counts — by_status index is efficient
    const [requestedTransfers, approvedTransfers, packedTransfers, inTransitTransfers] =
      await Promise.all([
        ctx.db
          .query("transfers")
          .withIndex("by_status", (q) => q.eq("status", "requested"))
          .collect(),
        ctx.db
          .query("transfers")
          .withIndex("by_status", (q) => q.eq("status", "approved"))
          .collect(),
        ctx.db
          .query("transfers")
          .withIndex("by_status", (q) => q.eq("status", "packed"))
          .collect(),
        ctx.db
          .query("transfers")
          .withIndex("by_status", (q) => q.eq("status", "inTransit"))
          .collect(),
      ]);

    return {
      todayRevenueCentavos,
      yesterdayRevenueCentavos,
      todayTransactionCount,
      yesterdayTransactionCount,
      // Warehouse transfer revenue (subset of total — for separate display)
      warehouseTodayRevenueCentavos: warehouseTodayRevenue,
      warehouseYesterdayRevenueCentavos: warehouseYesterdayRevenue,
      warehouseTodayInvoiceCount: warehouseTodayCount,
      activeAlertsCount: activeAlerts.length,
      todayNewAlertsCount,
      yesterdayNewAlertsCount,
      transferSummary: {
        pendingApproval: requestedTransfers.length, // needs HQ action
        inFlight:
          approvedTransfers.length +
          packedTransfers.length +
          inTransitTransfers.length,
      },
    };
  },
});

// ─── getBranchStatusCards ─────────────────────────────────────────────────────
// Per-branch summary cards with health indicator.

export const getBranchStatusCards = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    const todayStart = getPHTDayStartMs();
    const yesterday24hAgo = Date.now() - 24 * 60 * 60 * 1000;

    const branches = await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    return await Promise.all(
      branches.map(async (branch) => {
        // Today's transactions via by_branch_date index
        const todayTxns = await ctx.db
          .query("transactions")
          .withIndex("by_branch_date", (q) =>
            q.eq("branchId", branch._id).gte("createdAt", todayStart)
          )
          .collect();

        let todayRevenueCentavos = todayTxns.reduce(
          (sum, t) => sum + t.totalCentavos,
          0
        );
        let todayTransactionCount = todayTxns.length;

        // Warehouse branches: credit internal invoice revenue from transfers
        if (branch.type === "warehouse") {
          const todayInvoices = await ctx.db
            .query("internalInvoices")
            .withIndex("by_createdAt", (q) => q.gte("createdAt", todayStart))
            .collect();
          const warehouseInvoices = todayInvoices.filter(
            (inv) => inv.fromBranchId === branch._id
          );
          todayRevenueCentavos += warehouseInvoices.reduce(
            (sum, inv) => sum + inv.totalCentavos,
            0
          );
          todayTransactionCount += warehouseInvoices.length;
        }

        // Most recent transaction — order by_branch_date desc for correct createdAt ordering
        const lastTxn = await ctx.db
          .query("transactions")
          .withIndex("by_branch_date", (q) => q.eq("branchId", branch._id))
          .order("desc")
          .first();
        // For warehouse: also check latest invoice as "activity"
        let lastActivityAt = lastTxn?.createdAt ?? null;
        if (branch.type === "warehouse") {
          const lastInvoice = await ctx.db
            .query("internalInvoices")
            .withIndex("by_createdAt")
            .order("desc")
            .first();
          if (lastInvoice && lastInvoice.fromBranchId === branch._id) {
            const invoiceTime = lastInvoice.createdAt;
            if (!lastActivityAt || invoiceTime > lastActivityAt) {
              lastActivityAt = invoiceTime;
            }
          }
        }

        // Active alerts — per-branch by_branch_status index
        const branchAlerts = await ctx.db
          .query("lowStockAlerts")
          .withIndex("by_branch_status", (q) =>
            q.eq("branchId", branch._id).eq("status", "active")
          )
          .collect();
        const activeAlertCount = branchAlerts.length;

        // Health status logic (AC #2: healthy requires 0 alerts AND ≥1 transaction today)
        let healthStatus: "healthy" | "attention" | "critical" | "offline";
        if (!lastActivityAt || lastActivityAt < yesterday24hAgo) {
          healthStatus = "offline";
        } else if (activeAlertCount >= 3) {
          healthStatus = "critical";
        } else if (activeAlertCount >= 1) {
          healthStatus = "attention";
        } else if (todayTransactionCount > 0) {
          healthStatus = "healthy";
        } else {
          // Active within 24h but no sales today (e.g. branch not yet open this morning)
          healthStatus = "offline";
        }

        return {
          branchId: branch._id,
          branchName: branch.name,
          todayRevenueCentavos,
          todayTransactionCount,
          activeAlertCount,
          healthStatus,
          lastActivityAt,
        };
      })
    );
  },
});

// ─── getAttentionItems ────────────────────────────────────────────────────────
// Priority-sorted list of actionable alerts for HQ.

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

    // Branch name cache — same pattern as fulfillment.ts (use ?? not ! per L1 lesson)
    const branchCache = new Map<string, string>();
    async function getBranchName(branchId: Id<"branches">): Promise<string> {
      const key = branchId as string;
      if (branchCache.has(key)) return branchCache.get(key) ?? "(inactive)";
      const branch = await ctx.db.get(branchId);
      const name = branch?.isActive ? branch.name : "(inactive)";
      branchCache.set(key, name);
      return name;
    }

    // 1. Low-stock alerts (warning priority)
    // No global by_status index on lowStockAlerts — use full scan with filter
    const activeAlerts = await ctx.db
      .query("lowStockAlerts")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    for (const alert of activeAlerts) {
      const branchName = await getBranchName(alert.branchId);
      items.push({
        id: alert._id as string,
        type: "low-stock",
        priority: "warning",
        title: `Low stock at ${branchName}`,
        description: "Stock level below minimum threshold — click to review",
        branchName,
        linkTo: "/admin/dashboard",
      });
    }

    // 2. Pending transfer requests — status "requested" needs HQ approval action
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

    // 3. Unsynced offline transactions (critical priority)
    // No compound index for isOffline+syncedAt — in-memory filter is acceptable
    // (offline transactions are infrequent; full scan is bounded by transaction volume)
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

    // Sort: critical first, then warning, then info
    const PRIORITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    return items.sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    );
  },
});

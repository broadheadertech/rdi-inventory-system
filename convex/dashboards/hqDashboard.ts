import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import {
  getAllBranchSnapshots,
  getPHTDate,
} from "../snapshots/readers";

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

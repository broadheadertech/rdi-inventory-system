import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { withBranchScope } from "../_helpers/withBranchScope";

// NOTE: Branch dashboard uses withBranchScope(ctx) — NOT requireRole(ctx, HQ_ROLES).
// scope.branchId is null for admin users (HQ bypass) — all queries guard with if (!branchId).

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8 — used by getPHTDayStartMs and getHourlySalesChart

// ─── Philippine Time (UTC+8) day boundary helper ─────────────────────────────
// Same helper as hqDashboard.ts — returns UTC ms for midnight PHT today.
function getPHTDayStartMs(): number {
  const nowUtcMs = Date.now();
  const nowPhtMs = nowUtcMs + PHT_OFFSET_MS;
  const todayPhtStartMs = nowPhtMs - (nowPhtMs % (24 * 60 * 60 * 1000));
  return todayPhtStartMs - PHT_OFFSET_MS; // convert back to UTC ms
}

// ─── Hour label helper ────────────────────────────────────────────────────────
function formatHourLabel(hour: number): string {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}

// ─── getBranchMetrics ─────────────────────────────────────────────────────────
// Today + yesterday: revenue, txn count, items sold (via transactionItems join), avg txn value.

export const getBranchMetrics = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null; // Admin with no branch context — frontend handles null gracefully

    const todayStart = getPHTDayStartMs();
    const yesterdayStart = todayStart - 86400000; // 24h before today start

    // Single indexed query covering yesterday + today — partition in memory
    const recentTxns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", yesterdayStart)
      )
      .collect();

    const todayTxns = recentTxns.filter((t) => t.createdAt >= todayStart);
    const yesterdayTxns = recentTxns.filter((t) => t.createdAt < todayStart);

    const todayRevenueCentavos = todayTxns.reduce((s, t) => s + t.totalCentavos, 0);
    const yesterdayRevenueCentavos = yesterdayTxns.reduce((s, t) => s + t.totalCentavos, 0);
    const todayTransactionCount = todayTxns.length;
    const yesterdayTransactionCount = yesterdayTxns.length;
    const todayAvgTxnValueCentavos =
      todayTransactionCount > 0
        ? Math.round(todayRevenueCentavos / todayTransactionCount)
        : 0;
    const yesterdayAvgTxnValueCentavos =
      yesterdayTransactionCount > 0
        ? Math.round(yesterdayRevenueCentavos / yesterdayTransactionCount)
        : 0;

    // Items sold: N+1 join on transactionItems via by_transaction index.
    // Bounded by daily txn count (~50-200); Promise.all parallelises the fetches.
    const todayItemArrays = await Promise.all(
      todayTxns.map((txn) =>
        ctx.db
          .query("transactionItems")
          .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
          .collect()
      )
    );
    const todayItemsSold = todayItemArrays.flat().reduce((s, item) => s + item.quantity, 0);

    const yesterdayItemArrays = await Promise.all(
      yesterdayTxns.map((txn) =>
        ctx.db
          .query("transactionItems")
          .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
          .collect()
      )
    );
    const yesterdayItemsSold = yesterdayItemArrays
      .flat()
      .reduce((s, item) => s + item.quantity, 0);

    return {
      todayRevenueCentavos,
      yesterdayRevenueCentavos,
      todayTransactionCount,
      yesterdayTransactionCount,
      todayItemsSold,
      yesterdayItemsSold,
      todayAvgTxnValueCentavos,
      yesterdayAvgTxnValueCentavos,
    };
  },
});

// ─── getHourlySalesChart ──────────────────────────────────────────────────────
// 24-bucket hourly revenue array for today in PHT timezone.

export const getHourlySalesChart = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const todayStart = getPHTDayStartMs();

    const todayTxns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", todayStart)
      )
      .collect();

    // Initialize 24 hourly buckets: hour 0 = midnight PHT … hour 23 = 11pm PHT
    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: formatHourLabel(hour),
      revenueCentavos: 0,
      txnCount: 0,
    }));

    for (const txn of todayTxns) {
      // Convert UTC timestamp to PHT hour-of-day
      const txnPhtMs = txn.createdAt + PHT_OFFSET_MS;
      const hour = Math.floor(txnPhtMs / (1000 * 60 * 60)) % 24;
      hourly[hour].revenueCentavos += txn.totalCentavos;
      hourly[hour].txnCount += 1;
    }

    return hourly;
  },
});

// ─── getBranchAlerts ──────────────────────────────────────────────────────────
// Active low-stock alerts for this branch, enriched with variant SKU + style name.

export const getBranchAlerts = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null; // Admin bypass — null signals "no branch context" for consistent frontend messaging

    // by_branch_status index for efficient per-branch query (NOT full table scan — that's for HQ)
    const alerts = await ctx.db
      .query("lowStockAlerts")
      .withIndex("by_branch_status", (q) =>
        q.eq("branchId", branchId).eq("status", "active")
      )
      .collect();

    // Enrich each alert with variant SKU and style name for display
    return await Promise.all(
      alerts.map(async (alert) => {
        const variant = await ctx.db.get(alert.variantId);
        const style = variant ? await ctx.db.get(variant.styleId) : null;
        return {
          id: alert._id as string,
          variantSku: variant?.sku ?? "(unknown)",
          styleName: style?.name ?? "(unknown)",
          currentQuantity: alert.quantity,
          threshold: alert.threshold,
        };
      })
    );
  },
});

// ─── getPendingTransfers ──────────────────────────────────────────────────────
// Outgoing and incoming transfers (excluding delivered + rejected), with branch names.

export const getPendingTransfers = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null; // Admin bypass — null signals "no branch context" for consistent frontend messaging

    // by_from_branch and by_to_branch indexes confirmed in schema
    // order("desc") returns most recent transfers first — expected by managers
    const [outgoingAll, incomingAll] = await Promise.all([
      ctx.db
        .query("transfers")
        .withIndex("by_from_branch", (q) => q.eq("fromBranchId", branchId))
        .order("desc")
        .collect(),
      ctx.db
        .query("transfers")
        .withIndex("by_to_branch", (q) => q.eq("toBranchId", branchId))
        .order("desc")
        .collect(),
    ]);

    // Exclude terminal states — type-safe inline check avoids Array.includes union mismatch
    const outgoing = outgoingAll.filter(
      (t) => t.status !== "delivered" && t.status !== "rejected"
    );
    const incoming = incomingAll.filter(
      (t) => t.status !== "delivered" && t.status !== "rejected"
    );

    // Branch name cache — same pattern as hqDashboard.ts (use ?? not !)
    const branchCache = new Map<string, string>();
    async function getBranchName(id: Id<"branches">): Promise<string> {
      const key = id as string;
      if (branchCache.has(key)) return branchCache.get(key) ?? "(unknown)";
      const branch = await ctx.db.get(id);
      const name = branch?.name ?? "(unknown)";
      branchCache.set(key, name);
      return name;
    }

    const [outgoingEnriched, incomingEnriched] = await Promise.all([
      Promise.all(
        outgoing.map(async (t) => ({
          id: t._id as string,
          toBranchName: await getBranchName(t.toBranchId),
          status: t.status,
          createdAt: t.createdAt,
        }))
      ),
      Promise.all(
        incoming.map(async (t) => ({
          id: t._id as string,
          fromBranchName: await getBranchName(t.fromBranchId),
          status: t.status,
          createdAt: t.createdAt,
        }))
      ),
    ]);

    return { outgoing: outgoingEnriched, incoming: incomingEnriched };
  },
});

// ─── getBranchContext ─────────────────────────────────────────────────────────
// Lightweight query returning the branch type for frontend layout switching.

export const getBranchContext = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const branch = await ctx.db.get(branchId);
    if (!branch) return null;

    return {
      branchId: branchId as string,
      branchName: branch.name,
      branchType: (branch.type ?? "retail") as "retail" | "warehouse",
    };
  },
});

// ─── getWarehouseMetrics ──────────────────────────────────────────────────────
// Today's overview cards with yesterday comparison for warehouse branches.

export const getWarehouseMetrics = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const todayStart = getPHTDayStartMs();
    const yesterdayStart = todayStart - 86400000;

    // Invoice revenue — same pattern as hqDashboard.ts
    const recentInvoices = await ctx.db
      .query("internalInvoices")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", yesterdayStart))
      .collect();

    const myInvoices = recentInvoices.filter(
      (inv) => (inv.fromBranchId as string) === (branchId as string)
    );
    const todayInvoices = myInvoices.filter((inv) => inv.createdAt >= todayStart);
    const yesterdayInvoices = myInvoices.filter((inv) => inv.createdAt < todayStart);

    const todayRevenueCentavos = todayInvoices.reduce((s, inv) => s + inv.totalCentavos, 0);
    const yesterdayRevenueCentavos = yesterdayInvoices.reduce((s, inv) => s + inv.totalCentavos, 0);
    const todayInvoiceCount = todayInvoices.length;
    const yesterdayInvoiceCount = yesterdayInvoices.length;

    // Transfers dispatched — outgoing transfers with shippedAt today/yesterday
    const outgoing = await ctx.db
      .query("transfers")
      .withIndex("by_from_branch", (q) => q.eq("fromBranchId", branchId))
      .collect();

    const todayDispatched = outgoing.filter(
      (t) => t.shippedAt && t.shippedAt >= todayStart
    ).length;
    const yesterdayDispatched = outgoing.filter(
      (t) => t.shippedAt && t.shippedAt >= yesterdayStart && t.shippedAt < todayStart
    ).length;

    // Pending queue — requested + approved + packed status
    const pendingCount = outgoing.filter(
      (t) => t.status === "requested" || t.status === "approved" || t.status === "packed"
    ).length;

    return {
      todayRevenueCentavos,
      yesterdayRevenueCentavos,
      todayInvoiceCount,
      yesterdayInvoiceCount,
      todayDispatched,
      yesterdayDispatched,
      pendingCount,
    };
  },
});

// ─── getWarehouseTransferPipeline ─────────────────────────────────────────────
// Four pipeline stage counts for outgoing warehouse transfers.

export const getWarehouseTransferPipeline = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const outgoing = await ctx.db
      .query("transfers")
      .withIndex("by_from_branch", (q) => q.eq("fromBranchId", branchId))
      .collect();

    return {
      awaitingApproval: outgoing.filter((t) => t.status === "requested").length,
      awaitingPacking: outgoing.filter((t) => t.status === "approved").length,
      readyToDispatch: outgoing.filter((t) => t.status === "packed").length,
      inTransit: outgoing.filter((t) => t.status === "inTransit").length,
    };
  },
});

// ─── getRecentWarehouseInvoices ───────────────────────────────────────────────
// Last 5 invoices from this warehouse, enriched with destination branch name.

export const getRecentWarehouseInvoices = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const allInvoices = await ctx.db
      .query("internalInvoices")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();

    const myInvoices = allInvoices
      .filter((inv) => (inv.fromBranchId as string) === (branchId as string))
      .slice(0, 5);

    // Branch name cache
    const branchCache = new Map<string, string>();
    async function getBranchName(id: Id<"branches">): Promise<string> {
      const key = id as string;
      if (branchCache.has(key)) return branchCache.get(key) ?? "(unknown)";
      const branch = await ctx.db.get(id);
      const name = branch?.name ?? "(unknown)";
      branchCache.set(key, name);
      return name;
    }

    return Promise.all(
      myInvoices.map(async (inv) => ({
        id: inv._id as string,
        invoiceNumber: inv.invoiceNumber,
        toBranchName: await getBranchName(inv.toBranchId),
        totalCentavos: inv.totalCentavos,
        createdAt: inv.createdAt,
      }))
    );
  },
});

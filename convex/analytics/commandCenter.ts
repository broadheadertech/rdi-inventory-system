import { query } from "../_generated/server";
import { requireRole } from "../_helpers/permissions";
import { withBranchScope } from "../_helpers/withBranchScope";
import { Id } from "../_generated/dataModel";

// ─── Morning Command Center ─────────────────────────────────────────────────
// Daily summary dashboard for branch managers — sales, transfers, stock, reservations.

/** Midnight boundary helpers (Philippine Standard Time = UTC+8) */
function getTodayMidnightPHT(): number {
  const now = new Date();
  // Shift to PHT by adding 8 hours, then floor to midnight, then shift back
  const phtMs = now.getTime() + 8 * 60 * 60 * 1000;
  const phtDate = new Date(phtMs);
  phtDate.setUTCHours(0, 0, 0, 0);
  return phtDate.getTime() - 8 * 60 * 60 * 1000; // back to UTC
}

function getYesterdayMidnightPHT(): number {
  return getTodayMidnightPHT() - 24 * 60 * 60 * 1000;
}

export const getDailySummary = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["admin", "manager"]);
    const scope = await withBranchScope(ctx);

    // For admin/HQ users without a specific branch, return null
    if (!scope.branchId) {
      return null;
    }

    const branchId = scope.branchId as Id<"branches">;
    const todayStart = getTodayMidnightPHT();
    const yesterdayStart = getYesterdayMidnightPHT();

    // ── Today's Sales ──────────────────────────────────────────────────────
    const todayTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", todayStart)
      )
      .collect();

    const todaySales = {
      count: todayTransactions.length,
      totalCentavos: todayTransactions.reduce(
        (sum, t) => sum + t.totalCentavos,
        0
      ),
    };

    // ── Yesterday's Sales (for comparison) ─────────────────────────────────
    const yesterdayTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q
          .eq("branchId", branchId)
          .gte("createdAt", yesterdayStart)
          .lt("createdAt", todayStart)
      )
      .collect();

    const yesterdaySales = {
      count: yesterdayTransactions.length,
      totalCentavos: yesterdayTransactions.reduce(
        (sum, t) => sum + t.totalCentavos,
        0
      ),
    };

    // ── Pending Transfers ──────────────────────────────────────────────────
    // Transfers where this branch is the destination with active statuses
    const requestedTransfers = await ctx.db
      .query("transfers")
      .withIndex("by_to_branch", (q) => q.eq("toBranchId", branchId))
      .collect();

    const pendingTransfers = requestedTransfers.filter(
      (t) =>
        t.status === "requested" ||
        t.status === "approved" ||
        t.status === "packed" ||
        t.status === "inTransit"
    ).length;

    // ── Low Stock Count ────────────────────────────────────────────────────
    const inventoryItems = await ctx.db
      .query("inventory")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();

    const lowStockCount = inventoryItems.filter((inv) => inv.quantity < 5).length;

    // ── Pending Reservations ───────────────────────────────────────────────
    const pendingReservations = await ctx.db
      .query("reservations")
      .withIndex("by_branch_status", (q) =>
        q.eq("branchId", branchId).eq("status", "pending")
      )
      .collect();

    return {
      todaySales,
      yesterdaySales,
      pendingTransfers,
      lowStockCount,
      pendingReservations: pendingReservations.length,
    };
  },
});

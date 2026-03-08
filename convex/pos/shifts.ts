import { v, ConvexError } from "convex/values";
import { query, mutation } from "../_generated/server";
import { withBranchScope } from "../_helpers/withBranchScope";
import { POS_ROLES } from "../_helpers/permissions";

// ─── getActiveShift ─────────────────────────────────────────────────────────
// Returns the currently open shift for this cashier, plus running cash balance.

export const getActiveShift = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const branchId = scope.branchId;
    if (!branchId) return null;

    const shift = await ctx.db
      .query("cashierShifts")
      .withIndex("by_cashier_status", (q) =>
        q.eq("cashierId", scope.userId).eq("status", "open")
      )
      .first();

    if (!shift) return null;

    // Compute running cash balance: fund + cash sales since shift opened
    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", shift.openedAt)
      )
      .collect();

    // Only count this cashier's transactions
    const myTxns = txns.filter(
      (t) => (t.cashierId as string) === (scope.userId as string)
    );

    let cashSalesCentavos = 0;
    let gcashSalesCentavos = 0;
    let mayaSalesCentavos = 0;
    let transactionCount = 0;

    for (const t of myTxns) {
      transactionCount++;
      const splitAmt = t.splitPayment?.amountCentavos ?? 0;
      const primaryAmt = splitAmt > 0 ? t.totalCentavos - splitAmt : t.totalCentavos;

      // Primary payment method
      if (t.paymentMethod === "cash") cashSalesCentavos += primaryAmt;
      else if (t.paymentMethod === "gcash") gcashSalesCentavos += primaryAmt;
      else if (t.paymentMethod === "maya") mayaSalesCentavos += primaryAmt;

      // Secondary (split) payment method
      if (t.splitPayment) {
        if (t.splitPayment.method === "cash") cashSalesCentavos += splitAmt;
        else if (t.splitPayment.method === "gcash") gcashSalesCentavos += splitAmt;
        else if (t.splitPayment.method === "maya") mayaSalesCentavos += splitAmt;
      }
    }

    // Cash in drawer = starting fund + net cash sales
    const cashBalanceCentavos = shift.cashFundCentavos + cashSalesCentavos;

    return {
      shiftId: shift._id,
      cashFundCentavos: shift.cashFundCentavos,
      cashBalanceCentavos,
      cashSalesCentavos,
      gcashSalesCentavos,
      mayaSalesCentavos,
      transactionCount,
      openedAt: shift.openedAt,
    };
  },
});

// ─── openShift ──────────────────────────────────────────────────────────────
// Opens a new shift with a starting cash fund.

export const openShift = mutation({
  args: {
    cashFundCentavos: v.number(),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    if (args.cashFundCentavos < 0) {
      throw new ConvexError("Cash fund cannot be negative");
    }

    const branchId = scope.branchId;
    if (!branchId) throw new ConvexError("No branch assigned");

    // Check for already-open shift
    const existing = await ctx.db
      .query("cashierShifts")
      .withIndex("by_cashier_status", (q) =>
        q.eq("cashierId", scope.userId).eq("status", "open")
      )
      .first();

    if (existing) {
      throw new ConvexError("You already have an open shift. Close it first.");
    }

    const shiftId = await ctx.db.insert("cashierShifts", {
      branchId,
      cashierId: scope.userId,
      cashFundCentavos: args.cashFundCentavos,
      status: "open",
      openedAt: Date.now(),
    });

    return { shiftId };
  },
});

// ─── closeShift ─────────────────────────────────────────────────────────────
// Closes the current shift and records the final cash balance.

export const closeShift = mutation({
  args: {
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const branchId = scope.branchId;
    if (!branchId) throw new ConvexError("No branch assigned");

    const shift = await ctx.db
      .query("cashierShifts")
      .withIndex("by_cashier_status", (q) =>
        q.eq("cashierId", scope.userId).eq("status", "open")
      )
      .first();

    if (!shift) {
      throw new ConvexError("No open shift to close");
    }

    // Compute final cash balance
    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", shift.openedAt)
      )
      .collect();

    const myTxns = txns.filter(
      (t) => (t.cashierId as string) === (scope.userId as string)
    );

    let cashSales = 0;
    for (const t of myTxns) {
      const splitAmt = t.splitPayment?.amountCentavos ?? 0;
      const primaryAmt = splitAmt > 0 ? t.totalCentavos - splitAmt : t.totalCentavos;
      if (t.paymentMethod === "cash") cashSales += primaryAmt;
      if (t.splitPayment?.method === "cash") cashSales += splitAmt;
    }

    const finalBalance = shift.cashFundCentavos + cashSales;

    await ctx.db.patch(shift._id, {
      status: "closed",
      closedAt: Date.now(),
      closedCashBalanceCentavos: finalBalance,
      notes: args.notes,
    });

    return {
      shiftId: shift._id,
      cashFundCentavos: shift.cashFundCentavos,
      closedCashBalanceCentavos: finalBalance,
      cashSalesCentavos: cashSales,
    };
  },
});

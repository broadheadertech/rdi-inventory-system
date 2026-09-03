import { v, ConvexError } from "convex/values";
import { query, mutation, type QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { withBranchScope } from "../_helpers/withBranchScope";
import { POS_ROLES } from "../_helpers/permissions";
import { requireTerminal, touchTerminal } from "../_helpers/requireTerminal";

// ─── helpers ──────────────────────────────────────────────────────────────────

async function computeShiftCash(
  ctx: QueryCtx,
  branchId: Id<"branches">,
  shift: { openedAt: number; changeFundCentavos?: number; cashFundCentavos: number }
) {
  const txns = await ctx.db
    .query("transactions")
    .withIndex("by_branch_date", (q) =>
      q.eq("branchId", branchId).gte("createdAt", shift.openedAt)
    )
    .collect();

  let cashSalesCentavos = 0;
  let gcashSalesCentavos = 0;
  let mayaSalesCentavos = 0;
  let transactionCount = 0;

  for (const t of txns) {
    transactionCount++;
    const splitAmt = t.splitPayment?.amountCentavos ?? 0;
    const primaryAmt = splitAmt > 0 ? t.totalCentavos - splitAmt : t.totalCentavos;

    if (t.paymentMethod === "cash") cashSalesCentavos += primaryAmt;
    else if (t.paymentMethod === "gcash") gcashSalesCentavos += primaryAmt;
    else if (t.paymentMethod === "maya") mayaSalesCentavos += primaryAmt;

    if (t.splitPayment) {
      if (t.splitPayment.method === "cash") cashSalesCentavos += splitAmt;
      else if (t.splitPayment.method === "gcash") gcashSalesCentavos += splitAmt;
      else if (t.splitPayment.method === "maya") mayaSalesCentavos += splitAmt;
    }
  }

  const changeFund = shift.changeFundCentavos ?? shift.cashFundCentavos;
  const cashInRegister = changeFund + cashSalesCentavos;

  return {
    cashSalesCentavos,
    gcashSalesCentavos,
    mayaSalesCentavos,
    transactionCount,
    cashInRegisterCentavos: cashInRegister,
  };
}

// ─── getActiveShift ─────────────────────────────────────────────────────────
// Returns the currently open shift for this branch (one at a time per branch).

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
      .withIndex("by_branch_status", (q) =>
        q.eq("branchId", branchId).eq("status", "open")
      )
      .first();

    if (!shift) return null;

    // Resolve cashier name from sub-account or Clerk user
    let cashierName = "Cashier";
    if (shift.cashierAccountId) {
      const account = await ctx.db.get(shift.cashierAccountId);
      if (account) cashierName = `${account.firstName} ${account.lastName}`;
    } else {
      const user = await ctx.db.get(shift.cashierId);
      if (user) cashierName = user.name ?? "Cashier";
    }

    const cash = await computeShiftCash(ctx, branchId, shift);

    return {
      shiftId: shift._id,
      cashierName,
      cashierAccountId: shift.cashierAccountId ?? null,
      changeFundCentavos: shift.changeFundCentavos ?? shift.cashFundCentavos,
      cashFundCentavos: shift.cashFundCentavos,
      openedAt: shift.openedAt,
      ...cash,
    };
  },
});

// ─── openShift ──────────────────────────────────────────────────────────────
// Opens a new shift. Accepts optional cashierAccountId for sub-account shifts.

export const openShift = mutation({
  args: {
    changeFundCentavos: v.optional(v.number()),
    cashFundCentavos: v.number(),
    cashierAccountId: v.optional(v.id("cashierAccounts")),
    deviceToken: v.optional(v.string()),
    prevShiftId: v.optional(v.id("cashierShifts")),
    handoverCashInRegisterCentavos: v.optional(v.number()),
    handoverChangeFundCentavos: v.optional(v.number()),
    handoverCashFundCentavos: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    if ((args.changeFundCentavos ?? 0) < 0) {
      throw new ConvexError("Change fund cannot be negative");
    }
    if (args.cashFundCentavos < 0) {
      throw new ConvexError("Cash fund cannot be negative");
    }

    const branchId = scope.branchId;
    if (!branchId) throw new ConvexError("No branch assigned");

    // Device binding — a shift may only be opened from an enrolled register.
    const terminal = await requireTerminal(ctx, args.deviceToken, branchId);

    // Only one open shift per branch at a time
    const existing = await ctx.db
      .query("cashierShifts")
      .withIndex("by_branch_status", (q) =>
        q.eq("branchId", branchId).eq("status", "open")
      )
      .first();

    if (existing) {
      throw new ConvexError("A shift is already open for this branch. Close it first.");
    }

    const shiftId = await ctx.db.insert("cashierShifts", {
      branchId,
      cashierId: scope.userId,
      cashierAccountId: args.cashierAccountId,
      terminalId: terminal?._id,
      changeFundCentavos: args.changeFundCentavos,
      cashFundCentavos: args.cashFundCentavos,
      status: "open",
      openedAt: Date.now(),
      prevShiftId: args.prevShiftId,
      handoverCashInRegisterCentavos: args.handoverCashInRegisterCentavos,
      handoverChangeFundCentavos: args.handoverChangeFundCentavos,
      handoverCashFundCentavos: args.handoverCashFundCentavos,
    });

    await touchTerminal(ctx, terminal);

    return { shiftId };
  },
});

// ─── closeShift ─────────────────────────────────────────────────────────────
// Closes the current shift. closeType: "turnover" | "endOfDay".

export const closeShift = mutation({
  args: {
    closeType: v.optional(v.union(v.literal("turnover"), v.literal("endOfDay"))),
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
      .withIndex("by_branch_status", (q) =>
        q.eq("branchId", branchId).eq("status", "open")
      )
      .first();

    if (!shift) {
      throw new ConvexError("No open shift to close");
    }

    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", shift.openedAt)
      )
      .collect();

    let cashSales = 0;
    for (const t of txns) {
      const splitAmt = t.splitPayment?.amountCentavos ?? 0;
      const primaryAmt = splitAmt > 0 ? t.totalCentavos - splitAmt : t.totalCentavos;
      if (t.paymentMethod === "cash") cashSales += primaryAmt;
      if (t.splitPayment?.method === "cash") cashSales += splitAmt;
    }

    const changeFund = shift.changeFundCentavos ?? shift.cashFundCentavos;
    const cashInRegister = changeFund + cashSales;

    await ctx.db.patch(shift._id, {
      status: "closed",
      closedAt: Date.now(),
      closeType: args.closeType ?? "turnover",
      closedCashBalanceCentavos: cashInRegister,
      notes: args.notes,
    });

    return {
      shiftId: shift._id,
      changeFundCentavos: changeFund,
      cashFundCentavos: shift.cashFundCentavos,
      cashSalesCentavos: cashSales,
      cashInRegisterCentavos: cashInRegister,
      closeType: args.closeType ?? "turnover",
    };
  },
});

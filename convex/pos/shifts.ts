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
  shift: {
    openedAt: number;
    changeFundCentavos?: number;
    cashFundCentavos: number;
    terminalId?: Id<"posTerminals">;
  }
) {
  const all = await ctx.db
    .query("transactions")
    .withIndex("by_branch_date", (q) =>
      q.eq("branchId", branchId).gte("createdAt", shift.openedAt)
    )
    .collect();

  // A drawer holds only what its own register took. Counting the branch would
  // show Lane 1 the sum of every lane and make its cash count read as short.
  const txns = shift.terminalId
    ? all.filter((t) => t.terminalId === shift.terminalId)
    : all;

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
  args: { deviceToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const branchId = scope.branchId;
    if (!branchId) return null;

    // A shift belongs to a register, not to a store. On an enrolled terminal
    // only that terminal's shift counts, so Lane 2 does not walk into Lane 1's
    // open shift — which would let it trade with no cashier login and file its
    // sales under Lane 1's cashier.
    const terminal = await requireTerminal(ctx, args.deviceToken, branchId);

    const shift = terminal
      ? await ctx.db
          .query("cashierShifts")
          .withIndex("by_terminal_status", (q) =>
            q.eq("terminalId", terminal._id).eq("status", "open")
          )
          .first()
      : // Unbound device: fall back to the branch's open shift, and only ever
        // to one that predates terminals, so an enrolled lane's shift is never
        // picked up by a laptop.
        (
          await ctx.db
            .query("cashierShifts")
            .withIndex("by_branch_status", (q) =>
              q.eq("branchId", branchId).eq("status", "open")
            )
            .collect()
        ).find((sh) => sh.terminalId === undefined) ?? null;

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

    // One open shift per register — or per branch on an unbound device.
    const existing = terminal
      ? await ctx.db
          .query("cashierShifts")
          .withIndex("by_terminal_status", (q) =>
            q.eq("terminalId", terminal._id).eq("status", "open")
          )
          .first()
      : (
          await ctx.db
            .query("cashierShifts")
            .withIndex("by_branch_status", (q) =>
              q.eq("branchId", branchId).eq("status", "open")
            )
            .collect()
        ).find((sh) => sh.terminalId === undefined);

    if (existing) {
      throw new ConvexError(
        terminal
          ? `A shift is already open on ${terminal.label}. Close it first.`
          : "A shift is already open for this branch. Close it first."
      );
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
    deviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const branchId = scope.branchId;
    if (!branchId) throw new ConvexError("No branch assigned");

    // Close this register's shift. Closing by branch would let one lane end
    // another lane's shift and bank its float.
    const terminal = await requireTerminal(ctx, args.deviceToken, branchId);

    const shift = terminal
      ? await ctx.db
          .query("cashierShifts")
          .withIndex("by_terminal_status", (q) =>
            q.eq("terminalId", terminal._id).eq("status", "open")
          )
          .first()
      : (
          await ctx.db
            .query("cashierShifts")
            .withIndex("by_branch_status", (q) =>
              q.eq("branchId", branchId).eq("status", "open")
            )
            .collect()
        ).find((sh) => sh.terminalId === undefined);

    if (!shift) {
      throw new ConvexError("No open shift to close");
    }

    const allTxns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", shift.openedAt)
      )
      .collect();
    // Only this register's sales — otherwise a second lane's takings inflate
    // this drawer's expected cash and every count comes out short.
    const txns = shift.terminalId
      ? allTxns.filter((t) => t.terminalId === shift.terminalId)
      : allTxns;

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

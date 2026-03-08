import { v, ConvexError } from "convex/values";
import { query, mutation, QueryCtx, MutationCtx } from "../_generated/server";
import { withBranchScope } from "../_helpers/withBranchScope";
import { POS_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";
import type { Id } from "../_generated/dataModel";

// ─── Helpers ────────────────────────────────────────────────────────────────

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DATE_FORMAT = /^\d{8}$/;

/**
 * Validates a YYYYMMDD date string format.
 */
function validateDateFormat(dateStr: string): void {
  if (!DATE_FORMAT.test(dateStr)) {
    throw new ConvexError({
      code: "INVALID_DATE",
      message: "Date must be in YYYYMMDD format",
    });
  }
}

/**
 * Converts a YYYYMMDD string to start-of-day and end-of-day Unix timestamps in PHT.
 */
function getPhilippineDateRange(dateStr: string): {
  startMs: number;
  endMs: number;
} {
  const year = parseInt(dateStr.slice(0, 4));
  const month = parseInt(dateStr.slice(4, 6)) - 1;
  const day = parseInt(dateStr.slice(6, 8));
  const startMs = Date.UTC(year, month, day) - PHT_OFFSET_MS;
  const endMs = startMs + 86_400_000 - 1;
  return { startMs, endMs };
}

/**
 * Queries today's transactions for a branch and aggregates sales by payment method.
 * Also sums cash funds from all shifts that overlap this day.
 * expectedCashCentavos = totalCashFund + cashSales (what should be in the drawer).
 * Shared between getDailySummary (query) and submitReconciliation (mutation).
 */
async function _computeDailySummary(
  ctx: QueryCtx | MutationCtx,
  branchId: Id<"branches">,
  dateStr: string
) {
  const { startMs, endMs } = getPhilippineDateRange(dateStr);

  const transactions = await ctx.db
    .query("transactions")
    .withIndex("by_branch_date", (q) =>
      q
        .eq("branchId", branchId)
        .gte("createdAt", startMs)
        .lte("createdAt", endMs)
    )
    .collect();

  let transactionCount = 0;
  let totalSalesCentavos = 0;
  let cashSalesCentavos = 0;
  let gcashSalesCentavos = 0;
  let mayaSalesCentavos = 0;

  for (const txn of transactions) {
    transactionCount++;
    totalSalesCentavos += txn.totalCentavos;

    const splitAmt = txn.splitPayment?.amountCentavos ?? 0;
    const primaryAmt = splitAmt > 0 ? txn.totalCentavos - splitAmt : txn.totalCentavos;

    if (txn.paymentMethod === "cash") {
      cashSalesCentavos += primaryAmt;
    } else if (txn.paymentMethod === "gcash") {
      gcashSalesCentavos += primaryAmt;
    } else if (txn.paymentMethod === "maya") {
      mayaSalesCentavos += primaryAmt;
    }

    if (txn.splitPayment) {
      if (txn.splitPayment.method === "cash") cashSalesCentavos += splitAmt;
      else if (txn.splitPayment.method === "gcash") gcashSalesCentavos += splitAmt;
      else if (txn.splitPayment.method === "maya") mayaSalesCentavos += splitAmt;
    }
  }

  // Sum cash funds from all shifts that overlap this day
  const allShifts = await ctx.db
    .query("cashierShifts")
    .withIndex("by_branch_status", (q) => q.eq("branchId", branchId))
    .collect();

  let totalCashFundCentavos = 0;
  for (const shift of allShifts) {
    const closed = shift.closedAt ?? Date.now();
    // Shift overlaps with this day
    if (shift.openedAt <= endMs && closed >= startMs) {
      totalCashFundCentavos += shift.cashFundCentavos;
    }
  }

  // Expected cash in drawer = starting funds + cash sales
  const expectedCashCentavos = totalCashFundCentavos + cashSalesCentavos;

  return {
    transactionCount,
    totalSalesCentavos,
    cashSalesCentavos,
    gcashSalesCentavos,
    mayaSalesCentavos,
    totalCashFundCentavos,
    expectedCashCentavos,
  };
}

// ─── Get Daily Summary ──────────────────────────────────────────────────────

export const getDailySummary = query({
  args: {
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    validateDateFormat(args.date);
    const branchId = scope.branchId!;
    return _computeDailySummary(ctx, branchId, args.date);
  },
});

// ─── Submit Reconciliation ──────────────────────────────────────────────────

export const submitReconciliation = mutation({
  args: {
    date: v.string(),
    actualCashCentavos: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    validateDateFormat(args.date);

    if (args.actualCashCentavos < 0) {
      throw new ConvexError({
        code: "INVALID_AMOUNT",
        message: "Physical cash count cannot be negative",
      });
    }

    const branchId = scope.branchId!;

    // Server-authoritative: independently calculate expected cash from transactions
    const summary = await _computeDailySummary(ctx, branchId, args.date);
    const {
      transactionCount,
      totalSalesCentavos,
      cashSalesCentavos,
      gcashSalesCentavos,
      mayaSalesCentavos,
      expectedCashCentavos,
    } = summary;
    const differenceCentavos = args.actualCashCentavos - expectedCashCentavos;

    const reconciliationId = await ctx.db.insert("reconciliations", {
      branchId,
      cashierId: scope.userId,
      reconciliationDate: args.date,
      expectedCashCentavos,
      actualCashCentavos: args.actualCashCentavos,
      differenceCentavos,
      transactionCount,
      cashSalesCentavos,
      gcashSalesCentavos,
      mayaSalesCentavos,
      totalSalesCentavos,
      notes: args.notes,
      createdAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "reconciliation.submit",
      userId: scope.userId,
      branchId,
      entityType: "reconciliations",
      entityId: reconciliationId,
      after: {
        expectedCashCentavos,
        actualCashCentavos: args.actualCashCentavos,
        differenceCentavos,
        reconciliationDate: args.date,
      },
    });

    return {
      reconciliationId,
      differenceCentavos,
      expectedCashCentavos,
      actualCashCentavos: args.actualCashCentavos,
    };
  },
});

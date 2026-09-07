import { v, ConvexError } from "convex/values";
import { query, mutation, QueryCtx } from "../_generated/server";
import { withBranchScope } from "../_helpers/withBranchScope";
import { requireTerminal } from "../_helpers/requireTerminal";
import { POS_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";
import type { Id, Doc } from "../_generated/dataModel";

// ─── Helpers ────────────────────────────────────────────────────────────────

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Get today's date in PHT as YYYYMMDD string */
function getTodayPHT(): string {
  const pht = new Date(Date.now() + PHT_OFFSET_MS);
  const year = pht.getUTCFullYear();
  const month = String(pht.getUTCMonth() + 1).padStart(2, "0");
  const day = String(pht.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/** Converts a YYYYMMDD string to start-of-day and end-of-day Unix timestamps in PHT. */
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

/** Format ms timestamp to PHT hour (0-23) */
function toPHTHour(ms: number): number {
  const pht = new Date(ms + PHT_OFFSET_MS);
  return pht.getUTCHours();
}

type ProductSale = {
  variantId: string;
  styleName: string;
  sku: string;
  size: string;
  color: string;
  quantitySold: number;
  totalRevenueCentavos: number;
};

/**
 * Aggregates transactions + items into a detailed reading.
 * Shared between X, Y, and Z readings.
 */
async function _buildReadingData(
  ctx: QueryCtx,
  transactions: Doc<"transactions">[],
) {
  let totalSalesCentavos = 0;
  let cashSalesCentavos = 0;
  let gcashSalesCentavos = 0;
  let mayaSalesCentavos = 0;
  let vatAmountCentavos = 0;
  let discountAmountCentavos = 0;

  // Hourly sales: [0..23] → centavos
  const hourlySales: number[] = new Array(24).fill(0);

  // Receipt number tracking
  let firstReceipt: string | null = null;
  let lastReceipt: string | null = null;

  // Per-transaction item collection
  const productMap = new Map<string, ProductSale>();

  for (const txn of transactions) {
    // Skip voided transactions — they did not result in actual sales
    if (txn.status === "voided") continue;

    totalSalesCentavos += txn.totalCentavos;
    vatAmountCentavos += txn.vatAmountCentavos;
    discountAmountCentavos += txn.discountAmountCentavos;

    const splitAmt = txn.splitPayment?.amountCentavos ?? 0;
    const primaryAmt = splitAmt > 0 ? txn.totalCentavos - splitAmt : txn.totalCentavos;

    if (txn.paymentMethod === "cash") cashSalesCentavos += primaryAmt;
    else if (txn.paymentMethod === "gcash") gcashSalesCentavos += primaryAmt;
    else if (txn.paymentMethod === "maya") mayaSalesCentavos += primaryAmt;

    if (txn.splitPayment) {
      if (txn.splitPayment.method === "cash") cashSalesCentavos += splitAmt;
      else if (txn.splitPayment.method === "gcash") gcashSalesCentavos += splitAmt;
      else if (txn.splitPayment.method === "maya") mayaSalesCentavos += splitAmt;
    }

    // Hourly bucket
    const hour = toPHTHour(txn.createdAt);
    hourlySales[hour] += txn.totalCentavos;

    // Receipt range
    if (!firstReceipt || txn.receiptNumber < firstReceipt) firstReceipt = txn.receiptNumber;
    if (!lastReceipt || txn.receiptNumber > lastReceipt) lastReceipt = txn.receiptNumber;

    // Get line items for this transaction
    const items = await ctx.db
      .query("transactionItems")
      .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
      .collect();

    for (const item of items) {
      const key = item.variantId as string;
      const existing = productMap.get(key);
      if (existing) {
        existing.quantitySold += item.quantity;
        existing.totalRevenueCentavos += item.lineTotalCentavos;
      } else {
        productMap.set(key, {
          variantId: key,
          styleName: "",
          sku: "",
          size: "",
          color: "",
          quantitySold: item.quantity,
          totalRevenueCentavos: item.lineTotalCentavos,
        });
      }
    }
  }

  // Resolve product names for top sellers
  const allProducts = Array.from(productMap.values());
  // Only resolve the top 10 to limit DB reads
  allProducts.sort((a, b) => b.quantitySold - a.quantitySold);
  const topProducts = allProducts.slice(0, 10);

  for (const product of topProducts) {
    const variant = await ctx.db.get(product.variantId as Id<"variants">);
    if (variant) {
      const style = await ctx.db.get(variant.styleId);
      product.styleName = style?.name ?? "Unknown";
      product.sku = variant.sku;
      product.size = variant.size;
      product.color = variant.color;
    }
  }

  // Trim hourly sales to only hours with activity
  const hourlyBreakdown = hourlySales
    .map((amount, hour) => ({ hour, amountCentavos: amount }))
    .filter((h) => h.amountCentavos > 0);

  const completedCount = transactions.filter((t) => t.status !== "voided").length;

  return {
    transactionCount: completedCount,
    totalSalesCentavos,
    cashSalesCentavos,
    gcashSalesCentavos,
    mayaSalesCentavos,
    vatAmountCentavos,
    discountAmountCentavos,
    firstReceiptNumber: firstReceipt,
    lastReceiptNumber: lastReceipt,
    topProducts,
    hourlyBreakdown,
    averageTransactionCentavos:
      completedCount > 0
        ? Math.round(totalSalesCentavos / completedCount)
        : 0,
    totalItemsSold: allProducts.reduce((s, p) => s + p.quantitySold, 0),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// X-READING — Mid-shift snapshot (read-only, does not close shift)
// ═══════════════════════════════════════════════════════════════════════════════

export const getXReading = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const branchId = scope.branchId;
    if (!branchId) return null;

    // Find the current open shift
    const shift = await ctx.db
      .query("cashierShifts")
      .withIndex("by_cashier_status", (q) =>
        q.eq("cashierId", scope.userId).eq("status", "open")
      )
      .first();

    if (!shift) return null;

    // Get all transactions since shift opened for this cashier
    const allTxns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", shift.openedAt)
      )
      .collect();

    const myTxns = allTxns.filter(
      (t) => (t.cashierId as string) === (scope.userId as string)
    );

    const reading = await _buildReadingData(ctx, myTxns);

    return {
      readingType: "X" as const,
      generatedAt: Date.now(),
      cashierName: scope.user.name ?? "Cashier",
      shiftId: shift._id,
      shiftOpenedAt: shift.openedAt,
      cashFundCentavos: shift.cashFundCentavos,
      cashInDrawerCentavos: shift.cashFundCentavos + reading.cashSalesCentavos,
      ...reading,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// Y-READING — End-of-shift report (for a specific closed shift)
// ═══════════════════════════════════════════════════════════════════════════════

export const getYReading = query({
  args: {
    shiftId: v.id("cashierShifts"),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const shift = await ctx.db.get(args.shiftId);
    if (!shift) throw new ConvexError("Shift not found");

    // Admin can view any shift; cashier/manager can only view their own
    if (
      scope.user.role !== "admin" &&
      (shift.cashierId as string) !== (scope.userId as string)
    ) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const branchId = shift.branchId;
    const endMs = shift.closedAt ?? Date.now();

    // Get all transactions during this shift
    const allTxns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", shift.openedAt).lte("createdAt", endMs)
      )
      .collect();

    const myTxns = allTxns.filter(
      (t) => (t.cashierId as string) === (shift.cashierId as string)
    );

    const reading = await _buildReadingData(ctx, myTxns);

    // Get cashier name
    const cashier = await ctx.db.get(shift.cashierId);

    return {
      readingType: "Y" as const,
      generatedAt: Date.now(),
      cashierName: cashier?.name ?? "Cashier",
      shiftId: shift._id,
      shiftOpenedAt: shift.openedAt,
      shiftClosedAt: shift.closedAt ?? null,
      shiftDurationMs: endMs - shift.openedAt,
      cashFundCentavos: shift.cashFundCentavos,
      closedCashBalanceCentavos: shift.closedCashBalanceCentavos ?? null,
      cashInDrawerCentavos:
        shift.closedCashBalanceCentavos ??
        shift.cashFundCentavos + reading.cashSalesCentavos,
      status: shift.status,
      notes: shift.notes ?? null,
      ...reading,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// Z-READING — End-of-day grand total (aggregates all shifts for the day)
// ═══════════════════════════════════════════════════════════════════════════════

export const getZReading = query({
  args: {
    date: v.optional(v.string()), // YYYYMMDD, defaults to today
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const branchId = scope.branchId;
    if (!branchId) return null;

    const dateStr = args.date ?? getTodayPHT();
    const { startMs, endMs } = getPhilippineDateRange(dateStr);

    // Get ALL transactions for this branch on this date
    const allTxns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q
          .eq("branchId", branchId)
          .gte("createdAt", startMs)
          .lte("createdAt", endMs)
      )
      .collect();

    const reading = await _buildReadingData(ctx, allTxns);

    // Get all shifts that were open during this day
    // (opened before day-end OR still open)
    const allShifts = await ctx.db
      .query("cashierShifts")
      .withIndex("by_branch_status", (q) => q.eq("branchId", branchId))
      .collect();

    // Filter shifts relevant to this day
    const dayShifts = allShifts.filter((s) => {
      const opened = s.openedAt;
      const closed = s.closedAt ?? Date.now();
      // Shift overlaps with the day
      return opened <= endMs && closed >= startMs;
    });

    // Per-cashier breakdown
    const cashierMap = new Map<
      string,
      {
        cashierId: string;
        cashierName: string;
        shiftCount: number;
        transactionCount: number;
        totalSalesCentavos: number;
        cashSalesCentavos: number;
        gcashSalesCentavos: number;
        mayaSalesCentavos: number;
        cashFundCentavos: number;
      }
    >();

    for (const shift of dayShifts) {
      const key = shift.cashierId as string;
      const existing = cashierMap.get(key);
      if (existing) {
        existing.shiftCount++;
        existing.cashFundCentavos += shift.cashFundCentavos;
      } else {
        const cashier = await ctx.db.get(shift.cashierId);
        cashierMap.set(key, {
          cashierId: key,
          cashierName: cashier?.name ?? "Unknown",
          shiftCount: 1,
          transactionCount: 0,
          totalSalesCentavos: 0,
          cashSalesCentavos: 0,
          gcashSalesCentavos: 0,
          mayaSalesCentavos: 0,
          cashFundCentavos: shift.cashFundCentavos,
        });
      }
    }

    // Assign transactions to cashiers
    for (const txn of allTxns) {
      const key = txn.cashierId as string;
      const cashierData = cashierMap.get(key);
      if (cashierData) {
        cashierData.transactionCount++;
        cashierData.totalSalesCentavos += txn.totalCentavos;

        const splitAmt = txn.splitPayment?.amountCentavos ?? 0;
        const primaryAmt = splitAmt > 0 ? txn.totalCentavos - splitAmt : txn.totalCentavos;

        if (txn.paymentMethod === "cash") cashierData.cashSalesCentavos += primaryAmt;
        else if (txn.paymentMethod === "gcash") cashierData.gcashSalesCentavos += primaryAmt;
        else if (txn.paymentMethod === "maya") cashierData.mayaSalesCentavos += primaryAmt;

        if (txn.splitPayment) {
          if (txn.splitPayment.method === "cash") cashierData.cashSalesCentavos += splitAmt;
          else if (txn.splitPayment.method === "gcash") cashierData.gcashSalesCentavos += splitAmt;
          else if (txn.splitPayment.method === "maya") cashierData.mayaSalesCentavos += splitAmt;
        }
      }
    }

    const cashierBreakdown = Array.from(cashierMap.values()).sort(
      (a, b) => b.totalSalesCentavos - a.totalSalesCentavos
    );

    // Check if a reconciliation already exists for this date
    const existingReconciliation = await ctx.db
      .query("reconciliations")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).eq("reconciliationDate", dateStr)
      )
      .first();

    // Calculate total cash funds for the day
    const totalCashFundCentavos = dayShifts.reduce(
      (s, shift) => s + shift.cashFundCentavos,
      0
    );

    const openShiftCount = dayShifts.filter((s) => s.status === "open").length;
    const closedShiftCount = dayShifts.filter((s) => s.status === "closed").length;

    // Accumulated grand total context (BIR): previous total + today's projection,
    // and whether this date has already been finalized into a Z-reading.
    const lastZ = await ctx.db
      .query("zReadings")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .order("desc")
      .first();
    const finalizedForDate = await ctx.db
      .query("zReadings")
      .withIndex("by_branch_date", (q) => q.eq("branchId", branchId).eq("date", dateStr))
      .first();
    const previousGrandTotalCentavos = lastZ?.accumulatedGrandTotalCentavos ?? 0;

    return {
      readingType: "Z" as const,
      zCounterNext: (lastZ?.zCounter ?? 0) + 1,
      alreadyFinalized: !!finalizedForDate,
      finalizedZCounter: finalizedForDate?.zCounter ?? null,
      previousGrandTotalCentavos,
      projectedGrandTotalCentavos: previousGrandTotalCentavos + reading.totalSalesCentavos,
      generatedAt: Date.now(),
      date: dateStr,
      branchId,
      totalShifts: dayShifts.length,
      openShiftCount,
      closedShiftCount,
      totalCashFundCentavos,
      expectedCashInDrawerCentavos: totalCashFundCentavos + reading.cashSalesCentavos,
      cashierBreakdown,
      reconciliation: existingReconciliation
        ? {
            actualCashCentavos: existingReconciliation.actualCashCentavos,
            expectedCashCentavos: existingReconciliation.expectedCashCentavos,
            differenceCentavos: existingReconciliation.differenceCentavos,
            submittedAt: existingReconciliation.createdAt,
          }
        : null,
      ...reading,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// Recent closed shifts — for Y-Reading history
// ═══════════════════════════════════════════════════════════════════════════════

export const getRecentClosedShifts = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const branchId = scope.branchId;
    if (!branchId) return [];

    const shifts = await ctx.db
      .query("cashierShifts")
      .withIndex("by_branch_status", (q) =>
        q.eq("branchId", branchId).eq("status", "closed")
      )
      .order("desc")
      .take(20);

    const result = [];
    for (const shift of shifts) {
      const cashier = await ctx.db.get(shift.cashierId);
      result.push({
        shiftId: shift._id,
        cashierName: cashier?.name ?? "Unknown",
        openedAt: shift.openedAt,
        closedAt: shift.closedAt!,
        cashFundCentavos: shift.cashFundCentavos,
        closedCashBalanceCentavos: shift.closedCashBalanceCentavos!,
      });
    }

    return result;
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// FINALIZE Z-READING — persists the day's Z with an accumulated grand total
// ═══════════════════════════════════════════════════════════════════════════════

export const finalizeZReading = mutation({
  args: { date: v.optional(v.string()), deviceToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }
    const branchId = scope.branchId;
    if (!branchId) {
      throw new ConvexError({ code: "INVALID_STATE", message: "No branch in scope." });
    }

    const dateStr = args.date ?? getTodayPHT();

    // A Z-reading closes ONE machine's day: each register has its own MIN,
    // Z-counter and non-resettable grand total, so two lanes each finalise
    // their own. Readings from before terminal binding stay branch-wide.
    const terminal = await requireTerminal(ctx, args.deviceToken, branchId);

    // One Z-reading per machine per day (BIR end-of-day close)
    const existing = terminal
      ? await ctx.db
          .query("zReadings")
          .withIndex("by_terminal_date", (q) =>
            q.eq("terminalId", terminal._id).eq("date", dateStr)
          )
          .first()
      : (
          await ctx.db
            .query("zReadings")
            .withIndex("by_branch_date", (q) =>
              q.eq("branchId", branchId).eq("date", dateStr)
            )
            .collect()
        ).find((r) => r.terminalId === undefined);
    if (existing) {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "A Z-reading has already been finalized for this date.",
      });
    }

    const { startMs, endMs } = getPhilippineDateRange(dateStr);
    const txns = (
      await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", branchId).gte("createdAt", startMs).lte("createdAt", endMs)
        )
        .collect()
    ).filter((t) =>
      // Only this machine's sales roll into this machine's grand total. Sales
      // from before terminal binding have no terminalId and belong to the
      // branch-wide sequence.
      terminal ? t.terminalId === terminal._id : t.terminalId === undefined
    );

    let gross = 0, vatable = 0, vatExempt = 0, vat = 0, discount = 0;
    let cash = 0, gcash = 0, maya = 0, count = 0, voided = 0;
    let firstSI: string | null = null;
    let lastSI: string | null = null;

    for (const t of txns) {
      if (t.status === "voided") { voided++; continue; }
      count++;
      gross += t.totalCentavos;
      const isDisc = t.discountType === "senior" || t.discountType === "pwd";
      if (isDisc) {
        vatExempt += t.subtotalCentavos - t.vatAmountCentavos;
        discount += t.discountAmountCentavos;
      } else {
        vatable += t.subtotalCentavos;
        vat += t.vatAmountCentavos;
      }
      const splitAmt = t.splitPayment?.amountCentavos ?? 0;
      const primary = splitAmt > 0 ? t.totalCentavos - splitAmt : t.totalCentavos;
      if (t.paymentMethod === "cash") cash += primary;
      else if (t.paymentMethod === "gcash") gcash += primary;
      else maya += primary;
      if (t.splitPayment) {
        const m = t.splitPayment.method;
        if (m === "cash") cash += splitAmt;
        else if (m === "gcash") gcash += splitAmt;
        else maya += splitAmt;
      }
      if (!firstSI || t.receiptNumber < firstSI) firstSI = t.receiptNumber;
      if (!lastSI || t.receiptNumber > lastSI) lastSI = t.receiptNumber;
    }

    // Roll this machine's accumulated grand total forward and increment its
    // Z-counter. The counter never resets — only the day's figures do.
    const last = terminal
      ? await ctx.db
          .query("zReadings")
          .withIndex("by_terminal", (q) => q.eq("terminalId", terminal._id))
          .order("desc")
          .first()
      : (
          await ctx.db
            .query("zReadings")
            .withIndex("by_branch", (q) => q.eq("branchId", branchId))
            .order("desc")
            .collect()
        ).find((r) => r.terminalId === undefined);
    const previousGrandTotalCentavos = last?.accumulatedGrandTotalCentavos ?? 0;
    const zCounter = (last?.zCounter ?? 0) + 1;
    const accumulatedGrandTotalCentavos = previousGrandTotalCentavos + gross;

    const now = Date.now();
    const zId = await ctx.db.insert("zReadings", {
      branchId,
      terminalId: terminal?._id,
      zCounter,
      date: dateStr,
      beginningSI: firstSI ?? undefined,
      endingSI: lastSI ?? undefined,
      transactionCount: count,
      voidedCount: voided,
      grossSalesCentavos: gross,
      vatableSalesCentavos: vatable,
      vatExemptSalesCentavos: vatExempt,
      zeroRatedSalesCentavos: 0,
      vatAmountCentavos: vat,
      discountCentavos: discount,
      cashSalesCentavos: cash,
      gcashSalesCentavos: gcash,
      mayaSalesCentavos: maya,
      previousGrandTotalCentavos,
      accumulatedGrandTotalCentavos,
      generatedById: scope.userId,
      generatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "pos.zReadingFinalized",
      userId: scope.userId,
      branchId,
      entityType: "zReadings",
      entityId: zId,
      after: { zCounter, date: dateStr, accumulatedGrandTotalCentavos },
    });

    return { zCounter, previousGrandTotalCentavos, accumulatedGrandTotalCentavos };
  },
});

// ─── Finalized Z-reading history ───────────────────────────────────────────────

export const listZReadings = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }
    const branchId = scope.branchId;
    if (!branchId) return [];
    return await ctx.db
      .query("zReadings")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .order("desc")
      .take(60);
  },
});

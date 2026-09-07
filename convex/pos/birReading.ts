// convex/pos/birReading.ts — BIR-format X / Y / Z reading data (system base).
//
// Produces the full structured payload behind the printable BIR reading stub
// (header, counters, transaction summary, tender summary, transaction details,
// VAT computations, and accumulated grand totals for Z).

import { query, QueryCtx } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { withBranchScope } from "../_helpers/withBranchScope";
import { requireTerminal } from "../_helpers/requireTerminal";
import { POS_ROLES } from "../_helpers/permissions";
import { removeVat, calculateVat } from "../_helpers/taxCalculations";
import type { Doc } from "../_generated/dataModel";

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;

function getTodayPHT(): string {
  const pht = new Date(Date.now() + PHT_OFFSET_MS);
  return `${pht.getUTCFullYear()}${String(pht.getUTCMonth() + 1).padStart(2, "0")}${String(pht.getUTCDate()).padStart(2, "0")}`;
}

function dateRange(dateStr: string): { startMs: number; endMs: number } {
  const year = parseInt(dateStr.slice(0, 4));
  const month = parseInt(dateStr.slice(4, 6)) - 1;
  const day = parseInt(dateStr.slice(6, 8));
  const startMs = Date.UTC(year, month, day) - PHT_OFFSET_MS;
  return { startMs, endMs: startMs + 86_400_000 - 1 };
}

async function aggregate(ctx: QueryCtx, txns: Doc<"transactions">[]) {
  let gross = 0, returns = 0, scDiscount = 0, pwdDiscount = 0, othersDiscount = 0;
  let vatAdjustments = 0, vatable = 0, vat = 0, vatExempt = 0;
  let cash = 0, gcash = 0, maya = 0;
  let cashCount = 0, gcashCount = 0, mayaCount = 0;
  let salesCount = 0, itemsSold = 0, scTxn = 0, pwdTxn = 0, cancelled = 0;
  let firstSI: string | null = null;
  let lastSI: string | null = null;

  for (const t of txns) {
    // Voided transactions = cancelled sales
    if (t.status === "voided") { cancelled++; continue; }

    // Return transactions are stored with a negative total — track as Returns
    if (t.totalCentavos < 0) {
      const amt = Math.abs(t.totalCentavos);
      returns += amt;
      if (t.paymentMethod === "cash") cash -= amt;
      else if (t.paymentMethod === "gcash") gcash -= amt;
      else maya -= amt;
      continue;
    }

    salesCount++;
    // Gross = pre-discount, VAT-inclusive selling amount (subtotal)
    gross += t.subtotalCentavos;

    const splitAmt = t.splitPayment?.amountCentavos ?? 0;
    const primary = splitAmt > 0 ? t.totalCentavos - splitAmt : t.totalCentavos;
    if (t.paymentMethod === "cash") { cash += primary; cashCount++; }
    else if (t.paymentMethod === "gcash") { gcash += primary; gcashCount++; }
    else { maya += primary; mayaCount++; }
    if (t.splitPayment) {
      const m = t.splitPayment.method;
      if (m === "cash") cash += splitAmt;
      else if (m === "gcash") gcash += splitAmt;
      else maya += splitAmt;
    }

    if (t.discountType === "senior" || t.discountType === "pwd") {
      // SC/PWD: VAT removed (→ VAT-exempt sale + VAT adjustment) then 20% off
      vatExempt += removeVat(t.subtotalCentavos);
      vatAdjustments += calculateVat(t.subtotalCentavos);
      if (t.discountType === "senior") { scDiscount += t.discountAmountCentavos; scTxn++; }
      else { pwdDiscount += t.discountAmountCentavos; pwdTxn++; }
    } else {
      vatable += t.subtotalCentavos - t.vatAmountCentavos;
      vat += t.vatAmountCentavos;
      othersDiscount += t.promoDiscountAmountCentavos ?? 0;
    }

    if (!firstSI || t.receiptNumber < firstSI) firstSI = t.receiptNumber;
    if (!lastSI || t.receiptNumber > lastSI) lastSI = t.receiptNumber;

    const items = await ctx.db
      .query("transactionItems")
      .withIndex("by_transaction", (q) => q.eq("transactionId", t._id))
      .collect();
    itemsSold += items.reduce((s, i) => s + i.quantity, 0);
  }

  const subTotal = gross - returns;
  const netSales = subTotal - scDiscount - pwdDiscount - othersDiscount - vatAdjustments;

  return {
    grossSalesCount: salesCount,
    grossSalesCentavos: gross,
    returnsCentavos: returns,
    subTotalCentavos: subTotal,
    scDiscountCentavos: scDiscount,
    pwdDiscountCentavos: pwdDiscount,
    othersDiscountCentavos: othersDiscount,
    vatAdjustmentsCentavos: vatAdjustments,
    netSalesCentavos: netSales,
    tender: {
      cash: { count: cashCount, amountCentavos: cash },
      gcash: { count: gcashCount, amountCentavos: gcash },
      maya: { count: mayaCount, amountCentavos: maya },
      grandTotalCentavos: cash + gcash + maya,
    },
    details: {
      salesTransactionCount: salesCount,
      itemsSoldCount: itemsSold,
      noSalesTransaction: 0,
      transactionReprintCount: 0,
      cashDepositReprintCount: 0,
      withdrawalReprintCount: 0,
      lineVoidsCount: 0,
      cancelledTransactionCount: cancelled,
      priceOverrides: 0,
      scTransactionCount: scTxn,
      pwdTransactionCount: pwdTxn,
    },
    vat: {
      vatableSalesCentavos: vatable,
      vatAmountCentavos: vat,
      vatExemptSalesCentavos: vatExempt,
      zeroRatedSalesCentavos: 0,
    },
    beginningSI: firstSI,
    endingSI: lastSI,
    salesInvoiceCounter: salesCount,
  };
}

export const getBirReading = query({
  args: {
    readingType: v.union(v.literal("X"), v.literal("Y"), v.literal("Z")),
    date: v.optional(v.string()),       // YYYYMMDD (Z)
    shiftId: v.optional(v.id("cashierShifts")), // (Y)
    deviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }
    const branchId = scope.branchId;
    if (!branchId) return null;

    const dateStr = args.date ?? getTodayPHT();

    // BIR registers machines, not stores: a reading covers ONE register. Every
    // machine has its own MIN, PTU, Z-counter, SI series and non-resettable
    // grand total, so folding two lanes into one reading would report figures
    // that reconcile against neither machine's MIN.
    const terminal = await requireTerminal(ctx, args.deviceToken, branchId);

    // Sales made before terminal binding have no terminalId and can only be
    // reported branch-wide; they are never mixed into a machine's figures.
    const forThisTerminal = (t: Doc<"transactions">) =>
      terminal ? t.terminalId === terminal._id : t.terminalId === undefined;

    // Select transactions for the reading window (and remember the window bounds)
    let txns: Doc<"transactions">[] = [];
    let winStart = 0;
    let winEnd = Date.now();
    if (args.readingType === "Z") {
      const { startMs, endMs } = dateRange(dateStr);
      winStart = startMs;
      winEnd = endMs;
      txns = (
        await ctx.db
          .query("transactions")
          .withIndex("by_branch_date", (q) =>
            q.eq("branchId", branchId).gte("createdAt", startMs).lte("createdAt", endMs)
          )
          .collect()
      ).filter(forThisTerminal);
    } else if (args.readingType === "Y" && args.shiftId) {
      const shift = await ctx.db.get(args.shiftId);
      if (!shift) return null;
      const endMs = shift.closedAt ?? Date.now();
      winStart = shift.openedAt;
      winEnd = endMs;
      const all = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", shift.branchId).gte("createdAt", shift.openedAt).lte("createdAt", endMs)
        )
        .collect();
      txns = all.filter(
        (t) => (t.cashierId as string) === (shift.cashierId as string) && forThisTerminal(t)
      );
    } else {
      // X — current open shift for this cashier
      const shift = await ctx.db
        .query("cashierShifts")
        .withIndex("by_cashier_status", (q) =>
          q.eq("cashierId", scope.userId).eq("status", "open")
        )
        .first();
      if (!shift) return null;
      winStart = shift.openedAt;
      const all = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", branchId).gte("createdAt", shift.openedAt)
        )
        .collect();
      txns = all.filter(
        (t) => (t.cashierId as string) === (scope.userId as string) && forThisTerminal(t)
      );
    }

    const agg = await aggregate(ctx, txns);

    // Count receipt reprints within the same window
    const reprints = await ctx.db
      .query("receiptReprints")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", winStart).lte("createdAt", winEnd)
      )
      .collect();
    agg.details.transactionReprintCount = reprints.length;

    // Drawer operations within the window (No Sale / Cash In / Cash Out)
    const ops = await ctx.db
      .query("drawerOperations")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", winStart).lte("createdAt", winEnd)
      )
      .collect();
    let cashInCount = 0, cashInCentavos = 0, cashOutCount = 0, cashOutCentavos = 0, noSale = 0;
    for (const op of ops) {
      if (op.type === "noSale") noSale++;
      else if (op.type === "payIn") { cashInCount++; cashInCentavos += op.amountCentavos; }
      else { cashOutCount++; cashOutCentavos += op.amountCentavos; }
    }
    agg.details.noSalesTransaction = noSale;

    // Header — from the branch's approved BIR registration
    const reg = await ctx.db
      .query("birRegistrations")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .unique();
    const bir = reg?.active ?? {};
    const branch = await ctx.db.get(branchId);

    // Z-counter + accumulated grand total (Z only)
    let zCounter: number | null = null;
    let oldGrandTotalCentavos: number | null = null;
    let newGrandTotalCentavos: number | null = null;
    if (args.readingType === "Z") {
      // Both the Z-counter and the accumulated grand total belong to the
      // machine. The grand total is the figure an examiner reconciles against
      // that machine's MIN, so a branch-wide total would reconcile against
      // nothing. Readings taken before terminals existed stay on the branch
      // sequence and are never folded into a machine's.
      const finalized = terminal
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
          ).find((r) => r.terminalId === undefined) ?? null;

      const lastZ = terminal
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
          ).find((r) => r.terminalId === undefined) ?? null;
      if (finalized) {
        zCounter = finalized.zCounter;
        oldGrandTotalCentavos = finalized.previousGrandTotalCentavos;
        newGrandTotalCentavos = finalized.accumulatedGrandTotalCentavos;
      } else {
        zCounter = (lastZ?.zCounter ?? 0) + 1;
        oldGrandTotalCentavos = lastZ?.accumulatedGrandTotalCentavos ?? 0;
        newGrandTotalCentavos = oldGrandTotalCentavos + agg.netSalesCentavos;
      }
    }

    return {
      readingType: args.readingType,
      title:
        args.readingType === "Z"
          ? "End Of Day Report (Z-Read)"
          : args.readingType === "Y"
            ? "End Of Shift Report (Y-Read)"
            : "Mid-Shift Report (X-Read)",
      header: {
        businessName: bir.businessName || "RETAIL DYNAMICS INDUSTRIES INC.",
        address: bir.businessAddress || branch?.address || "",
        vatRegTin: bir.tin || "",
        // Per-machine values live on posTerminals; the branch config keeps only
        // establishment data (name, address, TIN, store code).
        serialNumber: terminal?.serialNumber || bir.serialNumber || "",
        minNumber: terminal?.minNumber || bir.minNumber || "",
      },
      counters: {
        // BIR expects a numeric Reset Counter: the number of times the
        // accumulated grand total has been reset. This system never resets it
        // (the grand total is cumulative for the life of the machine), so it is
        // always 0 — printed zero-padded like the Z-counter, per the standard,
        // rather than as the words some vendors substitute.
        resetCounter: 0,
        zCounter,
        storeCode: bir.storeCode || "001",
        terminalNo: terminal?.terminalNumber || bir.terminalNumber || "1",
        date: dateStr,
        generatedAt: Date.now(),
        beginningSI: agg.beginningSI,
        endingSI: agg.endingSI,
        salesInvoiceCounter: agg.salesInvoiceCounter,
      },
      transactionSummary: {
        grossSalesCount: agg.grossSalesCount,
        grossSalesCentavos: agg.grossSalesCentavos,
        returnsCentavos: agg.returnsCentavos,
        subTotalCentavos: agg.subTotalCentavos,
        scDiscountCentavos: agg.scDiscountCentavos,
        pwdDiscountCentavos: agg.pwdDiscountCentavos,
        othersDiscountCentavos: agg.othersDiscountCentavos,
        vatAdjustmentsCentavos: agg.vatAdjustmentsCentavos,
        netSalesCentavos: agg.netSalesCentavos,
      },
      tenderSummary: agg.tender,
      cashMovements: { cashInCount, cashInCentavos, cashOutCount, cashOutCentavos },
      transactionDetails: agg.details,
      vatComputations: agg.vat,
      accumulated:
        args.readingType === "Z"
          ? { oldGrandTotalCentavos, newGrandTotalCentavos }
          : null,
    };
  },
});

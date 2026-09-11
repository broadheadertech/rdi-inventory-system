import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireRole, ADMIN_ROLES } from "../_helpers/permissions";
import { addTenders, emptyTenderTotals } from "../_helpers/tenders";

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

function getPhilippineDateRange(dateStr: string): { startMs: number; endMs: number } {
  const year = parseInt(dateStr.slice(0, 4));
  const month = parseInt(dateStr.slice(4, 6)) - 1;
  const day = parseInt(dateStr.slice(6, 8));
  const startMs = Date.UTC(year, month, day) - PHT_OFFSET_MS;
  const endMs = startMs + 86_400_000 - 1;
  return { startMs, endMs };
}

// ─── getCashierShiftReport ────────────────────────────────────────────────────
// Per-shift sales summary for the cashier report tab.
// One row per shift — cashier name, branch, open/close times, sales by method.

export const getCashierShiftReport = query({
  args: {
    dateStart: v.string(), // YYYYMMDD PHT
    dateEnd: v.string(),   // YYYYMMDD PHT
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);

    const { startMs } = getPhilippineDateRange(args.dateStart);
    const { endMs } = getPhilippineDateRange(args.dateEnd);

    // Fetch shifts opened within the date range
    let shifts;
    if (args.branchId) {
      shifts = await ctx.db
        .query("cashierShifts")
        .withIndex("by_branch_opened", (q) =>
          q.eq("branchId", args.branchId!).gte("openedAt", startMs)
        )
        .filter((q) => q.lte(q.field("openedAt"), endMs))
        .collect();
    } else {
      // All branches — full scan filtered in memory
      const all = await ctx.db.query("cashierShifts").collect();
      shifts = all.filter((s) => s.openedAt >= startMs && s.openedAt <= endMs);
    }

    // Resolve cashier names and branch names up-front to avoid N+1 per-field lookups
    const branchCache = new Map<string, string>();
    const userCache = new Map<string, string>();
    const accountCache = new Map<string, string>();

    const results = await Promise.all(
      shifts.map(async (shift) => {
        // Cashier name
        let cashierName = "Unknown";
        if (shift.cashierAccountId) {
          const sid = String(shift.cashierAccountId);
          if (!accountCache.has(sid)) {
            const acct = await ctx.db.get(shift.cashierAccountId);
            accountCache.set(sid, acct ? `${acct.firstName} ${acct.lastName}` : "Unknown");
          }
          cashierName = accountCache.get(sid)!;
        } else {
          const uid = String(shift.cashierId);
          if (!userCache.has(uid)) {
            const user = await ctx.db.get(shift.cashierId);
            userCache.set(uid, user?.name ?? "Unknown");
          }
          cashierName = userCache.get(uid)!;
        }

        // Branch name
        const bid = String(shift.branchId);
        if (!branchCache.has(bid)) {
          const branch = await ctx.db.get(shift.branchId);
          branchCache.set(bid, branch?.name ?? "Unknown");
        }
        const branchName = branchCache.get(bid)!;

        // Transactions within this shift's time window
        // Since only one shift can be open per branch at a time, the time window
        // uniquely identifies which transactions belong to this shift.
        const shiftEnd = shift.closedAt ?? Date.now();
        const txns = await ctx.db
          .query("transactions")
          .withIndex("by_branch_date", (q) =>
            q.eq("branchId", shift.branchId).gte("createdAt", shift.openedAt)
          )
          .filter((q) => q.lte(q.field("createdAt"), shiftEnd))
          .collect();

        const tenders = emptyTenderTotals();
        let voidedCount = 0;

        for (const t of txns) {
          if (t.status === "voided") { voidedCount++; continue; }
          addTenders(tenders, t);
        }

        const completedTxns = txns.filter((t) => t.status !== "voided");

        return {
          shiftId: shift._id,
          cashierName,
          branchName,
          branchId: shift.branchId,
          openedAt: shift.openedAt,
          closedAt: shift.closedAt ?? null,
          status: shift.status,
          closeType: shift.closeType ?? null,
          changeFundCentavos: shift.changeFundCentavos ?? shift.cashFundCentavos,
          cashFundCentavos: shift.cashFundCentavos,
          cashSalesCentavos: tenders.cash,
          gcashSalesCentavos: tenders.gcash,
          mayaSalesCentavos: tenders.maya,
          bankTransferSalesCentavos: tenders.bankTransfer,
          totalSalesCentavos:
            tenders.cash + tenders.gcash + tenders.maya + tenders.bankTransfer,
          transactionCount: completedTxns.length,
          voidedCount,
        };
      })
    );

    // Sort by openedAt descending (most recent first)
    return results.sort((a, b) => b.openedAt - a.openedAt);
  },
});

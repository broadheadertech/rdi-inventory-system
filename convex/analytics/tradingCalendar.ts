import { query, mutation, QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { requireRole } from "../_helpers/permissions";

const HQ_ROLES = ["admin", "hqStaff"] as const;
const PHT = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Static PH Holidays / Events ──────────────────────────────────────────────

type StaticEvent = {
  month: number; // 1-12 for fixed; 0 = recurring (appears every month)
  day: number;
  name: string;
  category: "Holiday" | "Season" | "Event" | "Sale Event" | "Payday";
  demandImpact: "low" | "medium" | "high" | "very_high";
};

const PH_EVENTS: StaticEvent[] = [
  { month: 1,  day: 1,  name: "New Year's Day",        category: "Holiday",    demandImpact: "high" },
  { month: 2,  day: 14, name: "Valentine's Day",        category: "Event",      demandImpact: "high" },
  { month: 3,  day: 1,  name: "Graduation Season",      category: "Season",     demandImpact: "very_high" },
  { month: 4,  day: 9,  name: "Araw ng Kagitingan",     category: "Holiday",    demandImpact: "low" },
  { month: 5,  day: 1,  name: "Labor Day",              category: "Holiday",    demandImpact: "medium" },
  { month: 6,  day: 1,  name: "Back to School",         category: "Season",     demandImpact: "very_high" },
  { month: 6,  day: 12, name: "Independence Day",       category: "Holiday",    demandImpact: "medium" },
  { month: 8,  day: 21, name: "Ninoy Aquino Day",       category: "Holiday",    demandImpact: "low" },
  { month: 8,  day: 26, name: "National Heroes Day",    category: "Holiday",    demandImpact: "low" },
  { month: 9,  day: 1,  name: "BER Months Start",       category: "Season",     demandImpact: "high" },
  { month: 10, day: 31, name: "Halloween / Undas",      category: "Holiday",    demandImpact: "medium" },
  { month: 11, day: 1,  name: "All Saints' Day",        category: "Holiday",    demandImpact: "low" },
  { month: 11, day: 11, name: "11.11 Sale",             category: "Sale Event", demandImpact: "very_high" },
  { month: 11, day: 30, name: "Bonifacio Day",          category: "Holiday",    demandImpact: "low" },
  { month: 12, day: 8,  name: "Feast of Immaculate Conception", category: "Holiday", demandImpact: "low" },
  { month: 12, day: 12, name: "12.12 Sale",             category: "Sale Event", demandImpact: "very_high" },
  { month: 12, day: 24, name: "Christmas Eve",          category: "Holiday",    demandImpact: "high" },
  { month: 12, day: 25, name: "Christmas Day",          category: "Holiday",    demandImpact: "very_high" },
  { month: 12, day: 30, name: "Rizal Day",              category: "Holiday",    demandImpact: "low" },
  { month: 12, day: 31, name: "New Year's Eve",         category: "Holiday",    demandImpact: "high" },
  // Recurring paydays
  { month: 0,  day: 15, name: "Mid-Month Payday",       category: "Payday",     demandImpact: "high" },
  { month: 0,  day: 30, name: "End-Month Payday",       category: "Payday",     demandImpact: "high" },
];

function toYYYYMMDD(year: number, month: number, day: number): string {
  return `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

// ─── Promotion display ────────────────────────────────────────────────────────

type PromoDoc = {
  promoType: string;
  percentageValue?: number;
  fixedAmountCentavos?: number;
  buyQuantity?: number;
  getQuantity?: number;
  minSpendCentavos?: number;
  tieredDiscountCentavos?: number;
  pwpRewardPriceCentavos?: number;
};

/** Short human summary of the offer, e.g. "20% off" or "Buy 2 Get 1". */
function describeOffer(p: PromoDoc): string {
  const peso = (c: number) => `₱${(c / 100).toLocaleString("en-PH")}`;
  switch (p.promoType) {
    case "percentage":
      return p.percentageValue ? `${p.percentageValue}% off` : "Percentage off";
    case "fixedAmount":
      return p.fixedAmountCentavos ? `${peso(p.fixedAmountCentavos)} off` : "Amount off";
    case "buyXGetY":
      return p.buyQuantity && p.getQuantity
        ? `Buy ${p.buyQuantity} Get ${p.getQuantity}`
        : "Buy X Get Y";
    case "tiered":
      return p.minSpendCentavos && p.tieredDiscountCentavos
        ? `${peso(p.tieredDiscountCentavos)} off ${peso(p.minSpendCentavos)}+`
        : "Tiered discount";
    case "crossSell":
      return "Cross-sell offer";
    case "pwp":
      return p.pwpRewardPriceCentavos
        ? `Purchase with purchase at ${peso(p.pwpRewardPriceCentavos)}`
        : "Purchase with purchase";
    default:
      return "Promotion";
  }
}

// ─── Sales helpers ────────────────────────────────────────────────────────────

function phtDateKey(ms: number): string {
  const d = new Date(ms + PHT);
  return toYYYYMMDD(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Every transaction rung at an active retail branch in [startMs, endMs). */
async function loadRetailTransactions(ctx: QueryCtx, startMs: number, endMs: number) {
  const allBranches = await ctx.db
    .query("branches")
    .filter((q) => q.eq(q.field("isActive"), true))
    .collect();
  const retailBranches = allBranches.filter((b) => b.channel !== "warehouse");

  const txns = (
    await Promise.all(
      retailBranches.map((branch) =>
        ctx.db
          .query("transactions")
          .withIndex("by_branch_date", (q) =>
            q.eq("branchId", branch._id).gte("createdAt", startMs)
          )
          .filter((q) => q.lt(q.field("createdAt"), endMs))
          .collect()
      )
    )
  ).flat();

  return { allBranches, txns };
}

// A refund or exchange is booked as its own transaction with a RET- receipt
// number — the same test reportsV2 uses.
function isReturnTxn(t: Doc<"transactions">): boolean {
  return t.totalCentavos < 0 || t.receiptNumber.startsWith("RET-");
}

/**
 * The promotion a transaction counts toward, or null.
 *
 * A sale records its promotion directly. A return records none, so it is traced
 * through its RET- receipt number to the sale it reverses: a refunded promo sale
 * should come off that promo's figures rather than linger in them. Receipt
 * numbers are only unique within an invoice series, so a match at the
 * returning branch wins over one elsewhere.
 */
async function promotionFor(
  ctx: QueryCtx,
  t: Doc<"transactions">,
  cache: Map<string, Id<"promotions"> | null>
): Promise<Id<"promotions"> | null> {
  if (!isReturnTxn(t)) return t.promotionId ?? null;
  if (!t.receiptNumber.startsWith("RET-")) return null;

  const originalReceipt = t.receiptNumber.slice("RET-".length);
  const cacheKey = `${t.branchId}|${originalReceipt}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const matches = await ctx.db
    .query("transactions")
    .withIndex("by_receiptNumber", (q) => q.eq("receiptNumber", originalReceipt))
    .collect();
  const sale =
    matches.find((m) => m.branchId === t.branchId) ??
    (matches.length === 1 ? matches[0] : undefined);

  const promotionId = sale?.promotionId ?? null;
  cache.set(cacheKey, promotionId);
  return promotionId;
}

/**
 * What a transaction adds to its promotion's sales. A sale adds what was paid.
 * A return takes off only what was refunded (its negative subtotal) — the items
 * handed over in an exchange are a new purchase, not the promo's.
 */
function promoSalesAmount(t: Doc<"transactions">): number {
  return isReturnTxn(t) ? t.subtotalCentavos : t.totalCentavos;
}

type PromoTally = {
  salesCentavos: number;
  transactionCount: number;
  discountCentavos: number;
};

function addToTally(tally: PromoTally, t: Doc<"transactions">): void {
  tally.salesCentavos += promoSalesAmount(t);
  if (!isReturnTxn(t)) {
    tally.transactionCount += 1;
    tally.discountCentavos += t.promoDiscountAmountCentavos ?? 0;
  }
}

function sumTallies(tallies: Iterable<PromoTally>): PromoTally {
  const total: PromoTally = { salesCentavos: 0, transactionCount: 0, discountCentavos: 0 };
  for (const t of tallies) {
    total.salesCentavos += t.salesCentavos;
    total.transactionCount += t.transactionCount;
    total.discountCentavos += t.discountCentavos;
  }
  return total;
}

// ─── getCalendarMonth ─────────────────────────────────────────────────────────
// Returns daily revenue + static + custom events for every day in the month,
// and how much of it was sold with a promotion.

export const getCalendarMonth = query({
  args: {
    year: v.number(),
    month: v.number(), // 1-12
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const { year, month } = args;
    const daysInMonth = new Date(year, month, 0).getDate();

    // PHT-aligned month boundaries
    const startMs = Date.UTC(year, month - 1, 1) - PHT;
    const endMs   = Date.UTC(year, month, 1) - PHT; // exclusive

    const { allBranches, txns: allTxns } = await loadRetailTransactions(ctx, startMs, endMs);

    // Every promotion, not only this month's, so a return of an earlier promo
    // sale can still be named.
    const allPromos = await ctx.db.query("promotions").collect();
    const promoById = new Map(allPromos.map((p) => [p._id as string, p]));

    // Group revenue by PHT date. Voided sales never happened, so they are left
    // out, as in Reports. Returns stay in so a day nets to what was actually
    // taken, but only sales count as transactions.
    const revenueByDay = new Map<string, { revenueCentavos: number; transactionCount: number }>();
    const promoByDay = new Map<string, Map<string, PromoTally>>();
    const promoByMonth = new Map<string, PromoTally>();
    const returnCache = new Map<string, Id<"promotions"> | null>();

    for (const txn of allTxns) {
      if (txn.status === "voided") continue;

      const key = phtDateKey(txn.createdAt);
      const existing = revenueByDay.get(key) ?? { revenueCentavos: 0, transactionCount: 0 };
      existing.revenueCentavos += txn.totalCentavos;
      if (!isReturnTxn(txn)) existing.transactionCount += 1;
      revenueByDay.set(key, existing);

      const promotionId = await promotionFor(ctx, txn, returnCache);
      if (!promotionId) continue;

      const dayTallies = promoByDay.get(key) ?? new Map<string, PromoTally>();
      promoByDay.set(key, dayTallies);
      for (const tallies of [dayTallies, promoByMonth]) {
        const tally = tallies.get(promotionId) ?? {
          salesCentavos: 0,
          transactionCount: 0,
          discountCentavos: 0,
        };
        addToTally(tally, txn);
        tallies.set(promotionId, tally);
      }
    }

    // Fetch custom events for this month
    const monthStart = toYYYYMMDD(year, month, 1);
    const monthEnd   = toYYYYMMDD(year, month, daysInMonth);
    const customEvents = await ctx.db
      .query("tradingEvents")
      .withIndex("by_date", (q) => q.gte("date", monthStart).lte("date", monthEnd))
      .collect();

    const customByDay = new Map<string, typeof customEvents>();
    for (const ev of customEvents) {
      const arr = customByDay.get(ev.date) ?? [];
      arr.push(ev);
      customByDay.set(ev.date, arr);
    }

    // Promotions overlapping this month. endDate absent means open-ended.
    const monthPromos = allPromos.filter((p) => {
      const promoEnd = p.endDate ?? Number.MAX_SAFE_INTEGER;
      return p.startDate < endMs && promoEnd >= startMs;
    });

    // Resolve branch names once so a day can say where a promo runs.
    const branchNameById = new Map<string, string>(
      allBranches.map((b) => [b._id as string, b.name])
    );

    const promoMeta = monthPromos.map((p) => {
      const month = promoByMonth.get(p._id as string);
      return {
        id: p._id as string,
        name: p.name,
        promoType: p.promoType,
        offer: describeOffer(p),
        isActive: p.isActive,
        priority: p.priority,
        startDate: p.startDate,
        endDate: p.endDate ?? null,
        allBranches: p.branchIds.length === 0,
        branchNames: p.branchIds
          .map((id) => branchNameById.get(id as string))
          .filter((n): n is string => Boolean(n)),
        monthSalesCentavos: month?.salesCentavos ?? 0,
        monthTransactionCount: month?.transactionCount ?? 0,
        monthDiscountCentavos: month?.discountCentavos ?? 0,
      };
    });

    // Build static holiday index for this month
    const staticByDay = new Map<string, StaticEvent[]>();
    for (const ev of PH_EVENTS) {
      const matchesMonth = ev.month === month || ev.month === 0;
      const targetDay = ev.day <= daysInMonth ? ev.day : null;
      if (!matchesMonth || !targetDay) continue;
      const key = toYYYYMMDD(year, month, targetDay);
      const arr = staticByDay.get(key) ?? [];
      arr.push(ev);
      staticByDay.set(key, arr);
    }

    // Build day array
    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      const key = toYYYYMMDD(year, month, d);
      const rev = revenueByDay.get(key);

      // A promotion counts for a day when its range covers any part of that
      // PHT day, so a promo ending at noon still marks the day it ran.
      const dayStart = Date.UTC(year, month - 1, d) - PHT;
      const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1;
      const dayPromos = promoMeta.filter((p) => {
        const promoEnd = p.endDate ?? Number.MAX_SAFE_INTEGER;
        return p.startDate <= dayEnd && promoEnd >= dayStart;
      });

      // Sales that used a promo this day, by the promo actually recorded on the
      // sale. Can include a promo not scheduled for the day — a return of an
      // earlier promo sale, typically.
      const dayTallies = promoByDay.get(key) ?? new Map<string, PromoTally>();
      const byPromotion = [...dayTallies.entries()]
        .map(([id, tally]) => {
          const promo = promoById.get(id);
          return {
            id,
            name: promo?.name ?? "Deleted promotion",
            offer: promo ? describeOffer(promo) : "",
            ...tally,
          };
        })
        .sort((a, b) => b.salesCentavos - a.salesCentavos);

      return {
        date: key,
        day: d,
        revenueCentavos: rev?.revenueCentavos ?? 0,
        transactionCount: rev?.transactionCount ?? 0,
        staticEvents: (staticByDay.get(key) ?? []).map((e) => ({
          name: e.name,
          category: e.category,
          demandImpact: e.demandImpact,
        })),
        customEvents: (customByDay.get(key) ?? []).map((e) => ({
          id: e._id as string,
          name: e.name,
          type: e.type,
          notes: e.notes,
        })),
        promotions: dayPromos.map((p) => ({
          id: p.id,
          name: p.name,
          promoType: p.promoType,
          offer: p.offer,
          isActive: p.isActive,
          allBranches: p.allBranches,
          branchNames: p.branchNames,
          // Lets the UI draw a run as a bar rather than repeating a dot.
          isStart: p.startDate >= dayStart && p.startDate <= dayEnd,
          isEnd:
            p.endDate !== null && p.endDate >= dayStart && p.endDate <= dayEnd,
        })),
        promoSales: { ...sumTallies(dayTallies.values()), byPromotion },
      };
    });

    const maxDayRevenue = Math.max(...days.map((d) => d.revenueCentavos), 1);
    const monthPromoSales = sumTallies(promoByMonth.values());

    return {
      year,
      month,
      daysInMonth,
      // 0=Sun, 1=Mon … 6=Sat — used by frontend to compute grid offset
      firstDayOfWeek: new Date(year, month - 1, 1).getDay(),
      days,
      // Every promotion touching this month, for the timeline strip below the grid.
      promotions: promoMeta.sort((a, b) => a.startDate - b.startDate),
      daysWithPromotions: days.filter((d) => d.promotions.length > 0).length,
      totalRevenueCentavos: days.reduce((s, d) => s + d.revenueCentavos, 0),
      maxDayRevenueCentavos: maxDayRevenue,
      promoSalesCentavos: monthPromoSales.salesCentavos,
      promoTransactionCount: monthPromoSales.transactionCount,
      promoDiscountCentavos: monthPromoSales.discountCentavos,
    };
  },
});

// ─── getDayPromoSales ─────────────────────────────────────────────────────────
// The individual sales on one day that used a promotion, plus returns of such
// sales, newest first.

const DAY_PROMO_SALES_LIMIT = 200;

export const getDayPromoSales = query({
  args: {
    date: v.string(), // YYYYMMDD, PHT
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    if (!/^\d{8}$/.test(args.date)) return { rows: [], totalCount: 0 };

    const startMs =
      Date.UTC(+args.date.slice(0, 4), +args.date.slice(4, 6) - 1, +args.date.slice(6, 8)) - PHT;
    const { allBranches, txns } = await loadRetailTransactions(ctx, startMs, startMs + DAY_MS);

    const branchNameById = new Map<string, string>(
      allBranches.map((b) => [b._id as string, b.name])
    );
    const promoCache = new Map<string, Doc<"promotions"> | null>();
    const returnCache = new Map<string, Id<"promotions"> | null>();

    const rows = [];
    for (const t of txns) {
      if (t.status === "voided") continue;

      const promotionId = await promotionFor(ctx, t, returnCache);
      if (!promotionId) continue;

      let promo = promoCache.get(promotionId);
      if (promo === undefined) {
        promo = await ctx.db.get(promotionId);
        promoCache.set(promotionId, promo);
      }

      const isReturn = isReturnTxn(t);
      rows.push({
        id: t._id as string,
        receiptNumber: t.receiptNumber,
        createdAt: t.createdAt,
        branchName: branchNameById.get(t.branchId as string) ?? "Unknown branch",
        promotionName: promo?.name ?? "Deleted promotion",
        isReturn,
        amountCentavos: promoSalesAmount(t),
        discountCentavos: isReturn ? 0 : (t.promoDiscountAmountCentavos ?? 0),
      });
    }

    rows.sort((a, b) => b.createdAt - a.createdAt);
    return { rows: rows.slice(0, DAY_PROMO_SALES_LIMIT), totalCount: rows.length };
  },
});

// ─── createTradingEvent ───────────────────────────────────────────────────────

export const createTradingEvent = mutation({
  args: {
    date: v.string(),
    name: v.string(),
    type: v.union(
      v.literal("promotion"),
      v.literal("event"),
      v.literal("closure"),
      v.literal("note")
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);
    await ctx.db.insert("tradingEvents", {
      date: args.date,
      name: args.name,
      type: args.type,
      notes: args.notes,
      createdAt: Date.now(),
      createdById: user._id,
    });
  },
});

// ─── deleteTradingEvent ───────────────────────────────────────────────────────

export const deleteTradingEvent = mutation({
  args: { id: v.id("tradingEvents") },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    await ctx.db.delete(args.id);
  },
});

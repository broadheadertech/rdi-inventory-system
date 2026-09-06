import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../_helpers/permissions";

const HQ_ROLES = ["admin", "hqStaff"] as const;
const PHT = 8 * 60 * 60 * 1000;

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

// ─── getCalendarMonth ─────────────────────────────────────────────────────────
// Returns daily revenue + static + custom events for every day in the month.

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

    // Fetch all retail branch transactions in this month
    const allBranches = await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    const retailBranches = allBranches.filter((b) => b.channel !== "warehouse");

    const allTxns = (
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

    // Group revenue by PHT date
    const revenueByDay = new Map<string, { revenueCentavos: number; transactionCount: number }>();
    for (const txn of allTxns) {
      const d = new Date(txn.createdAt + PHT);
      const key = toYYYYMMDD(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      const existing = revenueByDay.get(key) ?? { revenueCentavos: 0, transactionCount: 0 };
      existing.revenueCentavos += txn.totalCentavos;
      existing.transactionCount += 1;
      revenueByDay.set(key, existing);
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
    const allPromos = await ctx.db.query("promotions").collect();
    const monthPromos = allPromos.filter((p) => {
      const promoEnd = p.endDate ?? Number.MAX_SAFE_INTEGER;
      return p.startDate < endMs && promoEnd >= startMs;
    });

    // Resolve branch names once so a day can say where a promo runs.
    const branchNameById = new Map<string, string>(
      allBranches.map((b) => [b._id as string, b.name])
    );

    const promoMeta = monthPromos.map((p) => ({
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
    }));

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
      };
    });

    const maxDayRevenue = Math.max(...days.map((d) => d.revenueCentavos), 1);

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
    };
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

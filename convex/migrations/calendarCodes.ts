// convex/migrations/calendarCodes.ts — quarters become months.
//
// The calendar slot in a style code (the "04" in ALTT0425) was configured as a
// Season holding four quarters. It is a month in practice, so the four quarter
// rows are replaced by the twelve months.
//
// Nothing referenced the quarter rows — no style carried one — so this takes
// nothing with it. Style codes already issued keep the text they were given;
// they are stored strings, not a live reference.
//
// Run once:  npx convex run migrations/calendarCodes:replaceQuartersWithMonths

import { internalMutation } from "../_generated/server";

const MONTHS = [
  ["01", "JANUARY"],
  ["02", "FEBRUARY"],
  ["03", "MARCH"],
  ["04", "APRIL"],
  ["05", "MAY"],
  ["06", "JUNE"],
  ["07", "JULY"],
  ["08", "AUGUST"],
  ["09", "SEPTEMBER"],
  ["10", "OCTOBER"],
  ["11", "NOVEMBER"],
  ["12", "DECEMBER"],
] as const;

export const replaceQuartersWithMonths = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Already run against the old Season rows, which no longer exist as a type.
    // What remains is a safety net: any quarter still sitting under the new
    // type, so running this again is harmless.
    const retired = (await ctx.db
      .query("productCodes")
      .withIndex("by_type", (q) => q.eq("type", "month"))
      .collect()).filter((r) => /quarter/i.test(r.description));

    let removed = 0;
    for (const row of retired) {
      await ctx.db.delete(row._id);
      removed++;
    }

    const have = new Set(
      (await ctx.db
        .query("productCodes")
        .withIndex("by_type", (q) => q.eq("type", "month"))
        .collect()).map((r) => r.code)
    );

    const now = Date.now();
    let added = 0;
    for (const [code, description] of MONTHS) {
      if (have.has(code)) continue;
      await ctx.db.insert("productCodes", {
        type: "month" as const,
        code,
        description,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      added++;
    }

    return { removed, added };
  },
});

// convex/dashboards/branchTargets.ts — per-branch monthly sales goals.
//
// Resolution order for a given month:
//   1. branchTargets row for that branch + month  (seasonal override)
//   2. branches.monthlyTargetCentavos             (the store's standing goal)
//   3. none                                       (reports show no target)
//
// Goals are set by admin/HQ only. A store that sets its own goal is not being
// held to one, so managers read these but never write them.

import { query, mutation, type QueryCtx, type MutationCtx } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { withBranchScope } from "../_helpers/withBranchScope";

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** "YYYYMM" in PHT for a YYYYMMDD date string. */
export function ymdToPeriodYm(ymd: string): string {
  return ymd.slice(0, 6);
}

/** Current "YYYYMM" in PHT. */
export function currentPeriodYm(): string {
  const d = new Date(Date.now() + PHT_OFFSET_MS);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isValidPeriodYm(periodYm: string): boolean {
  if (!/^\d{6}$/.test(periodYm)) return false;
  const month = Number(periodYm.slice(4, 6));
  return month >= 1 && month <= 12;
}

/**
 * The monthly goal in centavos for one branch in one month, or 0 when none is set.
 *
 * Shared with reportsV2, which prorates the result across the report's date
 * range the same way the org-wide target is prorated.
 */
export async function resolveBranchMonthlyTarget(
  ctx: QueryCtx | MutationCtx,
  branchId: Id<"branches">,
  periodYm: string
): Promise<number> {
  const override = await ctx.db
    .query("branchTargets")
    .withIndex("by_branch_period", (q) =>
      q.eq("branchId", branchId).eq("periodYm", periodYm)
    )
    .unique();

  if (override && override.monthlyTargetCentavos > 0) {
    return override.monthlyTargetCentavos;
  }

  const branch = await ctx.db.get(branchId);
  const fallback = branch?.monthlyTargetCentavos ?? 0;
  return fallback > 0 ? fallback : 0;
}

// ─── getBranchTargets ─────────────────────────────────────────────────────────
// Admin/HQ view: every active branch with its standing goal and the override
// for the requested month (defaults to the current month).

export const getBranchTargets = query({
  args: { periodYm: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const periodYm = args.periodYm ?? currentPeriodYm();
    if (!isValidPeriodYm(periodYm)) {
      throw new ConvexError("Period must be in YYYYMM format");
    }

    const branches = await ctx.db.query("branches").collect();
    const active = branches
      .filter((b) => b.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));

    const rows = [];
    for (const branch of active) {
      const override = await ctx.db
        .query("branchTargets")
        .withIndex("by_branch_period", (q) =>
          q.eq("branchId", branch._id).eq("periodYm", periodYm)
        )
        .unique();

      rows.push({
        branchId: branch._id,
        branchName: branch.name,
        channel: branch.channel ?? null,
        region: branch.region ?? null,
        defaultTargetCentavos: branch.monthlyTargetCentavos ?? 0,
        overrideTargetCentavos: override?.monthlyTargetCentavos ?? null,
        effectiveTargetCentavos:
          override?.monthlyTargetCentavos ?? branch.monthlyTargetCentavos ?? 0,
      });
    }

    return { periodYm, branches: rows };
  },
});

// ─── getMyBranchGoal ──────────────────────────────────────────────────────────
// Read-only view for a store manager: this month's goal for their own branch.

export const getMyBranchGoal = query({
  args: { periodYm: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);

    const periodYm = args.periodYm ?? currentPeriodYm();
    if (!isValidPeriodYm(periodYm)) {
      throw new ConvexError("Period must be in YYYYMM format");
    }

    // HQ without a branch in view has no single store to report a goal for.
    const branchId = scope.branchId;
    if (!branchId) return null;

    const branch = await ctx.db.get(branchId);
    if (!branch) return null;

    const monthlyTargetCentavos = await resolveBranchMonthlyTarget(ctx, branchId, periodYm);

    return {
      branchId,
      branchName: branch.name,
      periodYm,
      monthlyTargetCentavos,
      hasGoal: monthlyTargetCentavos > 0,
    };
  },
});

// ─── setBranchDefaultTarget ───────────────────────────────────────────────────
// The store's standing monthly goal, used for any month with no override.

export const setBranchDefaultTarget = mutation({
  args: {
    branchId: v.id("branches"),
    monthlyTargetCentavos: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    if (!Number.isFinite(args.monthlyTargetCentavos) || args.monthlyTargetCentavos < 0) {
      throw new ConvexError("Goal cannot be negative");
    }

    const branch = await ctx.db.get(args.branchId);
    if (!branch) throw new ConvexError("Branch not found");

    await ctx.db.patch(args.branchId, {
      // 0 clears the goal rather than storing a meaningless zero target.
      monthlyTargetCentavos:
        args.monthlyTargetCentavos > 0 ? Math.round(args.monthlyTargetCentavos) : undefined,
      updatedAt: Date.now(),
    });
  },
});

// ─── setBranchPeriodTarget ────────────────────────────────────────────────────
// A month-specific override, for seasonality.

export const setBranchPeriodTarget = mutation({
  args: {
    branchId: v.id("branches"),
    periodYm: v.string(),
    monthlyTargetCentavos: v.number(),
  },
  handler: async (ctx, args) => {
    const caller = await requireRole(ctx, HQ_ROLES);

    if (!isValidPeriodYm(args.periodYm)) {
      throw new ConvexError("Period must be in YYYYMM format");
    }
    if (!Number.isFinite(args.monthlyTargetCentavos) || args.monthlyTargetCentavos < 0) {
      throw new ConvexError("Goal cannot be negative");
    }

    const branch = await ctx.db.get(args.branchId);
    if (!branch) throw new ConvexError("Branch not found");

    const existing = await ctx.db
      .query("branchTargets")
      .withIndex("by_branch_period", (q) =>
        q.eq("branchId", args.branchId).eq("periodYm", args.periodYm)
      )
      .unique();

    // Zero removes the override so the branch default applies again.
    if (args.monthlyTargetCentavos <= 0) {
      if (existing) await ctx.db.delete(existing._id);
      return;
    }

    const value = Math.round(args.monthlyTargetCentavos);

    if (existing) {
      await ctx.db.patch(existing._id, {
        monthlyTargetCentavos: value,
        setById: caller._id,
        updatedAt: Date.now(),
      });
      return;
    }

    await ctx.db.insert("branchTargets", {
      branchId: args.branchId,
      periodYm: args.periodYm,
      monthlyTargetCentavos: value,
      setById: caller._id,
      updatedAt: Date.now(),
    });
  },
});

// ─── getBranchYearTrajectory ──────────────────────────────────────────────────
// The year's goal against the year so far, per store and for the whole company.
//
// A goal for the month says nothing about whether a store is going to make its
// year. Three figures do:
//
//   expected by today   the year's goal prorated to this point — whole months
//                       that have passed in full, plus the part of this month
//                       that has elapsed. Seasonality is respected, because it
//                       sums each month's own goal rather than dividing the
//                       year by twelve.
//   pace                what the store has actually taken, against that. 100%
//                       is exactly on track.
//   projected           where the year lands if the rest of it goes at the same
//                       pace, measured against the goal rather than the
//                       calendar, so a store carrying a heavy December is not
//                       flattered in March.
//
// The monthly rows carry each month's goal and takings so the page can draw the
// two cumulative lines — which is the trajectory a manager actually reads.

const MONTH_MS = 24 * 60 * 60 * 1000;

/** Milliseconds at the PHT start of a month, "YYYYMM". */
function periodStartMs(periodYm: string): number {
  const y = Number(periodYm.slice(0, 4));
  const m = Number(periodYm.slice(4, 6)) - 1;
  return Date.UTC(y, m, 1) - PHT_OFFSET_MS;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** The PHT "YYYYMM" a timestamp falls in. */
function periodYmOf(ms: number): string {
  const d = new Date(ms + PHT_OFFSET_MS);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const getBranchYearTrajectory = query({
  args: { year: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const nowMs = Date.now();
    const nowPht = new Date(nowMs + PHT_OFFSET_MS);
    const year = args.year ?? nowPht.getUTCFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > 2999) {
      throw new ConvexError("Year must be a four-digit year");
    }

    const months: string[] = [];
    for (let m = 1; m <= 12; m++) {
      months.push(`${year}${String(m).padStart(2, "0")}`);
    }

    const yearStartMs = periodStartMs(months[0]);
    const yearEndMs = Date.UTC(year + 1, 0, 1) - PHT_OFFSET_MS;
    const cutoffMs = Math.min(nowMs, yearEndMs);

    // How much of the year has been lived, month by month. A month gone in full
    // counts once; the month in progress counts by the days elapsed.
    const elapsedFraction = months.map((periodYm, index) => {
      const startMs = periodStartMs(periodYm);
      if (cutoffMs <= startMs) return 0;
      const days = daysInMonth(year, index);
      const endMs = startMs + days * MONTH_MS;
      if (cutoffMs >= endMs) return 1;
      return (cutoffMs - startMs) / (endMs - startMs);
    });

    const branches = (await ctx.db.query("branches").collect())
      .filter((b) => b.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));

    const rows = [];
    // Company-wide monthly totals, for the trajectory lines.
    const orgGoalByMonth = months.map(() => 0);
    const orgActualByMonth = months.map(() => 0);

    for (const branch of branches) {
      const goals: number[] = [];
      for (const periodYm of months) {
        goals.push(await resolveBranchMonthlyTarget(ctx, branch._id, periodYm));
      }

      // One index range per store, totals only — no line items needed.
      const txns = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", branch._id).gte("createdAt", yearStartMs).lt("createdAt", cutoffMs)
        )
        .collect();

      const actuals = months.map(() => 0);
      for (const t of txns) {
        if (t.status === "voided") continue;
        const index = months.indexOf(periodYmOf(t.createdAt));
        // Returns are their own transactions with a negative total, so summing
        // totals nets them out as every other report does.
        if (index >= 0) actuals[index] += t.totalCentavos;
      }

      const yearGoalCentavos = goals.reduce((sum, g) => sum + g, 0);
      const actualCentavos = actuals.reduce((sum, a) => sum + a, 0);
      const expectedCentavos = goals.reduce(
        (sum, g, i) => sum + g * elapsedFraction[i],
        0
      );

      for (let i = 0; i < months.length; i++) {
        orgGoalByMonth[i] += goals[i];
        orgActualByMonth[i] += actuals[i];
      }

      rows.push({
        branchId: branch._id,
        branchName: branch.name,
        channel: branch.channel ?? null,
        region: branch.region ?? null,
        yearGoalCentavos,
        actualCentavos,
        expectedCentavos: Math.round(expectedCentavos),
        varianceCentavos: Math.round(actualCentavos - expectedCentavos),
        pacePercent:
          expectedCentavos > 0 ? (actualCentavos / expectedCentavos) * 100 : null,
        attainmentPercent:
          yearGoalCentavos > 0 ? (actualCentavos / yearGoalCentavos) * 100 : null,
        // Where the year lands at this pace, weighted by the goal rather than
        // the calendar, so a store with a heavy December is judged fairly.
        projectedCentavos:
          expectedCentavos > 0
            ? Math.round((actualCentavos * yearGoalCentavos) / expectedCentavos)
            : null,
        months: months.map((periodYm, i) => ({
          periodYm,
          goalCentavos: goals[i],
          actualCentavos: actuals[i],
          elapsedFraction: elapsedFraction[i],
        })),
      });
    }

    const totalGoal = orgGoalByMonth.reduce((s, g) => s + g, 0);
    const totalActual = orgActualByMonth.reduce((s, a) => s + a, 0);
    const totalExpected = orgGoalByMonth.reduce(
      (sum, g, i) => sum + g * elapsedFraction[i],
      0
    );

    // Cumulative, which is what the two trajectory lines are drawn from. A
    // month still to come carries no actual line — it is not zero sales, it is
    // sales that have not happened, and a line dropping to the floor would say
    // the wrong thing.
    let runningGoal = 0;
    let runningActual = 0;
    const trajectory = months.map((periodYm, i) => {
      runningGoal += orgGoalByMonth[i];
      runningActual += orgActualByMonth[i];
      return {
        periodYm,
        cumulativeGoalCentavos: runningGoal,
        cumulativeActualCentavos: elapsedFraction[i] > 0 ? runningActual : null,
        elapsedFraction: elapsedFraction[i],
      };
    });

    return {
      year,
      asOfMs: cutoffMs,
      totals: {
        yearGoalCentavos: totalGoal,
        actualCentavos: totalActual,
        expectedCentavos: Math.round(totalExpected),
        varianceCentavos: Math.round(totalActual - totalExpected),
        pacePercent: totalExpected > 0 ? (totalActual / totalExpected) * 100 : null,
        attainmentPercent: totalGoal > 0 ? (totalActual / totalGoal) * 100 : null,
        projectedCentavos:
          totalExpected > 0
            ? Math.round((totalActual * totalGoal) / totalExpected)
            : null,
      },
      trajectory,
      branches: rows,
    };
  },
});

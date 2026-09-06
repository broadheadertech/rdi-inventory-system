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

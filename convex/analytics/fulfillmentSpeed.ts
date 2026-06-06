import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { withBranchScope } from "../_helpers/withBranchScope";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hoursFromMs(ms: number): number {
  return Math.round((ms / 3_600_000) * 10) / 10; // 1 decimal
}

type StageStats = {
  count: number;
  totalHours: number;
  avgHours: number;
  minHours: number;
  maxHours: number;
  medianHours: number;
};

function computeStats(values: number[]): StageStats {
  if (values.length === 0) {
    return { count: 0, totalHours: 0, avgHours: 0, minHours: 0, maxHours: 0, medianHours: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((s, v) => s + v, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];

  return {
    count: sorted.length,
    totalHours: hoursFromMs(total),
    avgHours: hoursFromMs(total / sorted.length),
    minHours: hoursFromMs(sorted[0]),
    maxHours: hoursFromMs(sorted[sorted.length - 1]),
    medianHours: hoursFromMs(median),
  };
}

// ─── Shared aggregation ──────────────────────────────────────────────────────

async function aggregateFulfillmentSpeed(
  ctx: { db: any },
  args: { periodDays: number; branchId?: Id<"branches"> }
) {
  const now = Date.now();
  const periodStart = now - args.periodDays * 86_400_000;

  // Get delivered transfers in the period
  const allTransfers: Doc<"transfers">[] = await ctx.db
    .query("transfers")
    .withIndex("by_status", (q: any) => q.eq("status", "delivered"))
    .collect();

  let transfers = allTransfers.filter(
    (t: Doc<"transfers">) => t.deliveredAt && t.deliveredAt >= periodStart
  );

  // Optional branch filter (from or to)
  if (args.branchId) {
    transfers = transfers.filter(
      (t: Doc<"transfers">) =>
        t.fromBranchId === args.branchId || t.toBranchId === args.branchId
    );
  }

  // Compute durations per stage
  const requestToApproved: number[] = [];
  const approvedToShipped: number[] = [];
  const shippedToDelivered: number[] = [];
  const endToEnd: number[] = [];

  type TransferDetail = {
    transferId: string;
    fromBranchId: string;
    toBranchId: string;
    createdAt: number;
    approvedAt: number | null;
    shippedAt: number | null;
    deliveredAt: number;
    requestToApprovedHours: number | null;
    approvedToShippedHours: number | null;
    shippedToDeliveredHours: number | null;
    endToEndHours: number;
  };

  const details: TransferDetail[] = [];

  for (const t of transfers) {
    const delivered = t.deliveredAt!;
    const e2e = delivered - t.createdAt;
    endToEnd.push(e2e);

    let rtaH: number | null = null;
    let atsH: number | null = null;
    let stdH: number | null = null;

    if (t.approvedAt) {
      const rta = t.approvedAt - t.createdAt;
      requestToApproved.push(rta);
      rtaH = hoursFromMs(rta);
    }

    if (t.approvedAt && t.shippedAt) {
      const ats = t.shippedAt - t.approvedAt;
      approvedToShipped.push(ats);
      atsH = hoursFromMs(ats);
    }

    if (t.shippedAt) {
      const std = delivered - t.shippedAt;
      shippedToDelivered.push(std);
      stdH = hoursFromMs(std);
    }

    details.push({
      transferId: t._id as string,
      fromBranchId: t.fromBranchId as string,
      toBranchId: t.toBranchId as string,
      createdAt: t.createdAt,
      approvedAt: t.approvedAt ?? null,
      shippedAt: t.shippedAt ?? null,
      deliveredAt: delivered,
      requestToApprovedHours: rtaH,
      approvedToShippedHours: atsH,
      shippedToDeliveredHours: stdH,
      endToEndHours: hoursFromMs(e2e),
    });
  }

  // Sort by delivered date descending (most recent first)
  details.sort((a, b) => b.deliveredAt - a.deliveredAt);

  return {
    stages: {
      requestToApproved: computeStats(requestToApproved),
      approvedToShipped: computeStats(approvedToShipped),
      shippedToDelivered: computeStats(shippedToDelivered),
      endToEnd: computeStats(endToEnd),
    },
    totalDelivered: transfers.length,
    details,
  };
}

// ─── Enrich with branch names ────────────────────────────────────────────────

async function enrichDetails(
  ctx: { db: any },
  details: { fromBranchId: string; toBranchId: string }[]
) {
  const branchIds = new Set<string>();
  for (const d of details) {
    branchIds.add(d.fromBranchId);
    branchIds.add(d.toBranchId);
  }
  const branchDocs = await Promise.all(
    [...branchIds].map((id) => ctx.db.get(id as Id<"branches">))
  );
  const nameMap = new Map<string, string>();
  [...branchIds].forEach((id, i) => {
    nameMap.set(id, branchDocs[i]?.name ?? "Unknown");
  });
  return nameMap;
}

// ─── getFulfillmentSpeed (HQ) ────────────────────────────────────────────────

export const getFulfillmentSpeed = query({
  args: {
    periodDays: v.number(),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const result = await aggregateFulfillmentSpeed(ctx, {
      periodDays: args.periodDays,
      branchId: args.branchId,
    });

    const nameMap = await enrichDetails(ctx, result.details);

    // Get active branches for filter dropdown
    const allBranches: Doc<"branches">[] = await ctx.db.query("branches").collect();
    const activeBranches = allBranches
      .filter((b: Doc<"branches">) => b.isActive)
      .map((b: Doc<"branches">) => ({ _id: b._id, name: b.name }));

    return {
      ...result,
      details: result.details.map((d) => ({
        ...d,
        fromBranchName: nameMap.get(d.fromBranchId) ?? "Unknown",
        toBranchName: nameMap.get(d.toBranchId) ?? "Unknown",
      })),
      branches: activeBranches,
    };
  },
});

// ─── getBranchFulfillmentSpeed (branch-scoped) ──────────────────────────────

export const getBranchFulfillmentSpeed = query({
  args: {
    periodDays: v.number(),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);

    // HQ/admin (no branch) → all branches; branch users → their branch.
    const result = await aggregateFulfillmentSpeed(ctx, {
      periodDays: args.periodDays,
      branchId: scope.branchId ?? undefined,
    });

    const nameMap = await enrichDetails(ctx, result.details);

    return {
      ...result,
      details: result.details.map((d) => ({
        ...d,
        fromBranchName: nameMap.get(d.fromBranchId) ?? "Unknown",
        toBranchName: nameMap.get(d.toBranchId) ?? "Unknown",
      })),
    };
  },
});

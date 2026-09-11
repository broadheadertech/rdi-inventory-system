import { query, mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";
import { internal } from "../_generated/api";

// M2 fix: per-invocation branch name cache (same pattern as fulfillment.ts)
function makeBranchNameResolver(
  dbGet: (id: Id<"branches">) => Promise<{ name: string; isActive: boolean } | null>
) {
  const cache = new Map<Id<"branches">, string>();
  return async function getBranchName(branchId: Id<"branches">): Promise<string> {
    if (cache.has(branchId)) return cache.get(branchId) ?? "(inactive)";
    const branch = await dbGet(branchId);
    const name = branch?.isActive ? branch.name : "(inactive)";
    cache.set(branchId, name);
    return name;
  };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export const listPackedForAssignment = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    const transfers = await ctx.db
      .query("transfers")
      .withIndex("by_status", (q) => q.eq("status", "packed"))
      .collect();

    // Only transfers without a driver assigned
    const unassigned = transfers.filter((t) => !t.driverId);

    const getBranchName = makeBranchNameResolver((id) => ctx.db.get(id));

    const enriched = await Promise.all(
      unassigned.map(async (transfer) => {
        const fromBranchName = await getBranchName(transfer.fromBranchId);
        const toBranchName = await getBranchName(transfer.toBranchId);
        const requestor = await ctx.db.get(transfer.requestedById);
        const items = await ctx.db
          .query("transferItems")
          .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
          .collect();

        return {
          _id: transfer._id,
          fromBranchName,
          toBranchName,
          requestorName: requestor?.name ?? "(unknown)",
          itemCount: items.length,
          packedAt: transfer.packedAt ?? transfer.updatedAt,
          createdAt: transfer.createdAt,
        };
      })
    );

    return enriched.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const listActiveDrivers = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    const drivers = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "driver"))
      .collect();

    return drivers
      .filter((d) => d.isActive)
      .map((d) => ({ _id: d._id, name: d.name, email: d.email }));
  },
});

export const listActiveDeliveries = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    const transfers = await ctx.db
      .query("transfers")
      .withIndex("by_status", (q) => q.eq("status", "inTransit"))
      .collect();

    const driverAssigned = transfers.filter((t) => t.driverId);

    const getBranchName = makeBranchNameResolver((id) => ctx.db.get(id));

    const enriched = await Promise.all(
      driverAssigned.map(async (transfer) => {
        const driver = transfer.driverId
          ? await ctx.db.get(transfer.driverId)
          : null;
        const fromBranchName = await getBranchName(transfer.fromBranchId);
        const toBranchName = await getBranchName(transfer.toBranchId);
        const items = await ctx.db
          .query("transferItems")
          .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
          .collect();

        return {
          _id: transfer._id,
          driverName: driver?.name ?? "(unknown)",
          fromBranchName,
          toBranchName,
          itemCount: items.length,
          driverArrivedAt: transfer.driverArrivedAt ?? null,
          // Handed over and waiting for the branch's count.
          driverHandedOverAt: transfer.driverHandedOverAt ?? null,
          shippedAt: transfer.shippedAt ?? null,
          createdAt: transfer.createdAt,
        };
      })
    );

    return enriched.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const listCompletedDeliveries = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    // H1 fix: cap initial fetch with .order("desc").take(200) instead of unbounded .collect()
    const transfers = await ctx.db
      .query("transfers")
      .withIndex("by_status", (q) => q.eq("status", "delivered"))
      .order("desc")
      .take(200);

    const driverDelivered = transfers.filter((t) => t.driverId);

    const getBranchName = makeBranchNameResolver((id) => ctx.db.get(id));

    const enriched = await Promise.all(
      driverDelivered.slice(0, 50).map(async (transfer) => {
        const driver = transfer.driverId
          ? await ctx.db.get(transfer.driverId)
          : null;
        const fromBranchName = await getBranchName(transfer.fromBranchId);
        const toBranchName = await getBranchName(transfer.toBranchId);
        const items = await ctx.db
          .query("transferItems")
          .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
          .collect();

        return {
          _id: transfer._id,
          driverName: driver?.name ?? "(unknown)",
          fromBranchName,
          toBranchName,
          itemCount: items.length,
          deliveredAt: transfer.deliveredAt ?? null,
          createdAt: transfer.createdAt,
        };
      })
    );

    return enriched.sort((a, b) => (b.deliveredAt ?? 0) - (a.deliveredAt ?? 0));
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

export const assignDriverToTransfer = mutation({
  args: {
    transferId: v.id("transfers"),
    driverId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Transfer not found.",
      });
    }
    if (transfer.status !== "packed") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Only packed transfers can be assigned to drivers.",
      });
    }

    const driver = await ctx.db.get(args.driverId);
    if (!driver || !driver.isActive || driver.role !== "driver") {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Invalid or inactive driver.",
      });
    }

    const now = Date.now();

    // Compute expected delivery date from expectedDeliveryDays set during packing
    const expectedDeliveryDate = transfer.expectedDeliveryDays
      ? now + transfer.expectedDeliveryDays * 86_400_000
      : undefined;

    await ctx.db.patch(args.transferId, {
      status: "inTransit",
      driverId: args.driverId,
      shippedAt: now,
      shippedById: user._id,
      ...(expectedDeliveryDate ? { expectedDeliveryDate } : {}),
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "transfer.assignDriver",
      userId: user._id,
      entityType: "transfers",
      entityId: args.transferId,
      before: { status: "packed" },
      after: {
        status: "inTransit",
        driverId: args.driverId,
        shippedById: user._id,
        expectedDeliveryDate,
      },
    });

    await ctx.scheduler.runAfter(0, internal.logistics.notifications._processNotification, {
      type: "driver_assigned",
      transferId: args.transferId,
    });
  },
});

// ─── Driver Analytics ───────────────────────────────────────────────────────

export const getDriverAnalytics = query({
  args: {
    periodDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const periodMs = (args.periodDays ?? 90) * 86_400_000;
    const cutoff = Date.now() - periodMs;

    // Get all delivered transfers with drivers
    const deliveredTransfers = await ctx.db
      .query("transfers")
      .withIndex("by_status", (q) => q.eq("status", "delivered"))
      .collect();

    const recentDriverDeliveries = deliveredTransfers.filter(
      (t) => t.driverId && t.deliveredAt && (t.deliveredAt >= cutoff)
    );

    // Get all active drivers
    const allDrivers = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "driver"))
      .collect();

    const driverMap = new Map(allDrivers.map((d) => [d._id as string, d]));
    const getBranchName = makeBranchNameResolver((id) => ctx.db.get(id));

    // Group by driver
    const driverStats = new Map<string, {
      driverId: string;
      driverName: string;
      totalDeliveries: number;
      onTime: number;
      late: number;
      totalDeliveryTimeMs: number;
      deliveries: {
        transferId: string;
        route: string;
        shippedAt: number;
        deliveredAt: number;
        expectedDate: number | null;
        deliveryTimeHours: number;
        isOnTime: boolean;
      }[];
    }>();

    for (const t of recentDriverDeliveries) {
      const did = t.driverId as string;
      if (!driverStats.has(did)) {
        const driver = driverMap.get(did);
        driverStats.set(did, {
          driverId: did,
          driverName: driver?.name ?? "Unknown",
          totalDeliveries: 0,
          onTime: 0,
          late: 0,
          totalDeliveryTimeMs: 0,
          deliveries: [],
        });
      }

      const stats = driverStats.get(did)!;
      const deliveryTimeMs = (t.deliveredAt ?? 0) - (t.shippedAt ?? 0);
      const deliveryTimeHours = Math.round(deliveryTimeMs / 3_600_000 * 10) / 10;
      const isOnTime = t.expectedDeliveryDate
        ? (t.deliveredAt ?? 0) <= t.expectedDeliveryDate
        : true; // no ETA = assume on time

      const fromName = await getBranchName(t.fromBranchId);
      const toName = await getBranchName(t.toBranchId);

      stats.totalDeliveries++;
      if (isOnTime) stats.onTime++;
      else stats.late++;
      stats.totalDeliveryTimeMs += deliveryTimeMs;
      stats.deliveries.push({
        transferId: t._id as string,
        route: `${fromName} → ${toName}`,
        shippedAt: t.shippedAt ?? 0,
        deliveredAt: t.deliveredAt ?? 0,
        expectedDate: t.expectedDeliveryDate ?? null,
        deliveryTimeHours,
        isOnTime,
      });
    }

    const rankings = [...driverStats.values()]
      .map((s) => ({
        driverId: s.driverId,
        driverName: s.driverName,
        totalDeliveries: s.totalDeliveries,
        onTime: s.onTime,
        late: s.late,
        onTimeRate: s.totalDeliveries > 0
          ? Math.round((s.onTime / s.totalDeliveries) * 100)
          : 0,
        avgDeliveryHours: s.totalDeliveries > 0
          ? Math.round((s.totalDeliveryTimeMs / s.totalDeliveries / 3_600_000) * 10) / 10
          : 0,
        recentDeliveries: s.deliveries
          .sort((a, b) => b.deliveredAt - a.deliveredAt)
          .slice(0, 10),
      }))
      .sort((a, b) => b.onTimeRate - a.onTimeRate || b.totalDeliveries - a.totalDeliveries);

    // In-transit with ETA tracking
    const inTransit = await ctx.db
      .query("transfers")
      .withIndex("by_status", (q) => q.eq("status", "inTransit"))
      .collect();

    const now = Date.now();
    const activeDeliveries = await Promise.all(
      inTransit
        .filter((t) => t.driverId)
        .map(async (t) => {
          const driver = driverMap.get(t.driverId as string);
          const toName = await getBranchName(t.toBranchId);
          const isOverdue = t.expectedDeliveryDate ? now > t.expectedDeliveryDate : false;
          const daysOverdue = t.expectedDeliveryDate && isOverdue
            ? Math.ceil((now - t.expectedDeliveryDate) / 86_400_000)
            : 0;

          return {
            transferId: t._id as string,
            driverName: driver?.name ?? "Unknown",
            toBranchName: toName,
            shippedAt: t.shippedAt ?? 0,
            expectedDeliveryDate: t.expectedDeliveryDate ?? null,
            expectedDeliveryDays: t.expectedDeliveryDays ?? null,
            isOverdue,
            daysOverdue,
            driverArrived: !!t.driverArrivedAt,
          };
        })
    );

    return {
      rankings,
      activeDeliveries: activeDeliveries.sort((a, b) =>
        (b.isOverdue ? 1 : 0) - (a.isOverdue ? 1 : 0) || (a.expectedDeliveryDate ?? Infinity) - (b.expectedDeliveryDate ?? Infinity)
      ),
      totalDeliveriesInPeriod: recentDriverDeliveries.length,
      overallOnTimeRate: recentDriverDeliveries.length > 0
        ? Math.round(
            (recentDriverDeliveries.filter((t) =>
              !t.expectedDeliveryDate || (t.deliveredAt ?? 0) <= t.expectedDeliveryDate
            ).length / recentDriverDeliveries.length) * 100
          )
        : 100,
    };
  },
});

import { query, mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

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
    await ctx.db.patch(args.transferId, {
      status: "inTransit",
      driverId: args.driverId,
      shippedAt: now,
      shippedById: user._id,
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
      },
    });
  },
});

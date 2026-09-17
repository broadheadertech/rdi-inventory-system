import { query, mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { requireRole, DRIVER_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";
import { internal } from "../_generated/api";

// ─── Queries ─────────────────────────────────────────────────────────────────

export const listMyDeliveries = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, DRIVER_ROLES);

    const transfers = await ctx.db
      .query("transfers")
      .withIndex("by_driver", (q) => q.eq("driverId", user._id))
      .collect();

    // Still the driver's job: in transit and not yet handed over. After the
    // handover the branch is counting it (in-memory — by_driver index doesn't
    // include status).
    const active = transfers.filter((t) => t.status === "inTransit" && !t.driverHandedOverAt);

    const enriched = await Promise.all(
      active.map(async (transfer) => {
        const toBranch = await ctx.db.get(transfer.toBranchId);
        const items = await ctx.db
          .query("transferItems")
          .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
          .collect();

        return {
          _id: transfer._id,
          toBranchName: toBranch?.isActive ? toBranch.name : "(inactive)",
          toBranchAddress: toBranch?.address ?? "",
          itemCount: items.length,
          driverAcceptedAt: transfer.driverAcceptedAt ?? null,
          driverArrivedAt: transfer.driverArrivedAt ?? null,
          createdAt: transfer.createdAt,
        };
      })
    );

    // Oldest first = highest delivery priority
    return enriched.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const getDeliveryDetail = query({
  args: { transferId: v.id("transfers") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, DRIVER_ROLES);

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) return null;
    if (transfer.driverId !== user._id) return null;
    if (transfer.status !== "inTransit") return null;

    const toBranch = await ctx.db.get(transfer.toBranchId);
    const fromBranch = await ctx.db.get(transfer.fromBranchId);

    const items = await ctx.db
      .query("transferItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
      .collect();

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const variant = await ctx.db.get(item.variantId);
        const style = variant ? await ctx.db.get(variant.styleId) : null;
        return {
          styleName: style?.name ?? "Unknown",
          size: variant?.size ?? "",
          color: variant?.color ?? "",
          packedQuantity: item.packedQuantity ?? item.requestedQuantity,
        };
      })
    );

    // Fetch boxes for this transfer (if any)
    const boxes = await ctx.db
      .query("transferBoxes")
      .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
      .collect();

    let boxBreakdown: {
      boxNumber: number;
      boxCode: string;
      status: string;
      totalItems: number;
    }[] = [];

    if (boxes.length > 0) {
      boxBreakdown = boxes
        .sort((a, b) => a.boxNumber - b.boxNumber)
        .map((box) => ({
          boxNumber: box.boxNumber,
          boxCode: box.boxCode,
          status: box.status,
          totalItems: box.totalItems,
        }));
    }

    return {
      transferId: transfer._id,
      fromBranchName: fromBranch?.isActive ? fromBranch.name : "(inactive)",
      toBranchName: toBranch?.isActive ? toBranch.name : "(inactive)",
      toBranchAddress: toBranch?.address ?? "",
      toBranchLatitude: toBranch?.latitude ?? null,
      toBranchLongitude: toBranch?.longitude ?? null,
      itemCount: items.length,
      items: enrichedItems,
      boxes: boxBreakdown,
      deliveryMode: boxes.length > 0 ? ("box" as const) : ("piece" as const),
      driverAcceptedAt: transfer.driverAcceptedAt ?? null,
      driverArrivedAt: transfer.driverArrivedAt ?? null,
      driverHandedOverAt: transfer.driverHandedOverAt ?? null,
      createdAt: transfer.createdAt,
    };
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

export const acceptDelivery = mutation({
  args: { transferId: v.id("transfers") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, DRIVER_ROLES);

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    }
    if (transfer.status !== "inTransit") {
      throw new ConvexError({ code: "INVALID_STATE", message: "Transfer is not in transit." });
    }
    if (transfer.driverId !== user._id) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Transfer not assigned to you." });
    }
    if (transfer.driverAcceptedAt) {
      throw new ConvexError({ code: "INVALID_STATE", message: "Already accepted." });
    }

    const now = Date.now();
    await ctx.db.patch(args.transferId, {
      driverAcceptedAt: now,
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "transfer.driverAccepted",
      userId: user._id,
      entityType: "transfers",
      entityId: args.transferId,
      after: { driverAcceptedAt: now },
    });
  },
});

export const markArrived = mutation({
  args: { transferId: v.id("transfers") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, DRIVER_ROLES);

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    }
    if (transfer.status !== "inTransit") {
      throw new ConvexError({ code: "INVALID_STATE", message: "Transfer is not in transit." });
    }
    if (transfer.driverId !== user._id) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Transfer not assigned to you." });
    }
    if (!transfer.driverAcceptedAt) {
      throw new ConvexError({ code: "INVALID_STATE", message: "Accept the delivery before marking arrived." });
    }
    if (transfer.driverArrivedAt) {
      throw new ConvexError({ code: "INVALID_STATE", message: "Already marked as arrived." });
    }

    const now = Date.now();
    await ctx.db.patch(args.transferId, {
      driverArrivedAt: now,
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "transfer.driverArrived",
      userId: user._id,
      entityType: "transfers",
      entityId: args.transferId,
      after: { driverArrivedAt: now },
    });

    await ctx.scheduler.runAfter(0, internal.logistics.notifications._processNotification, {
      type: "driver_arrived",
      transferId: args.transferId,
    });
  },
});

// ─── driverConfirmDelivery ───────────────────────────────────────────────────
// The driver's handover: the goods are at the branch and in its hands. It adds
// no stock. It used to credit the full packed quantity with no one counting,
// which closed the transfer before the branch could — so a shortage in the
// truck was booked as received and the branch could never record it. Now the
// branch's count at Receiving adds what actually arrived and closes the
// transfer; this only records that the driver's part is done.

export const driverConfirmDelivery = mutation({
  args: {
    transferId: v.id("transfers"),
    /** Who at the branch took the goods — the driver's half of the handover. */
    receivedByName: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, DRIVER_ROLES);

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    }
    if (transfer.status !== "inTransit") {
      throw new ConvexError({ code: "INVALID_STATE", message: "Only in-transit transfers can be handed over." });
    }
    if (transfer.driverId !== user._id) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Transfer not assigned to you." });
    }
    if (!transfer.driverArrivedAt) {
      throw new ConvexError({ code: "INVALID_STATE", message: "Must mark arrived before handing over." });
    }
    if (transfer.driverHandedOverAt) {
      throw new ConvexError({ code: "INVALID_STATE", message: "Already handed over." });
    }
    const receivedByName = args.receivedByName.trim();
    if (receivedByName === "") {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Name who at the branch took the goods.",
      });
    }

    const now = Date.now();
    await ctx.db.patch(args.transferId, {
      driverHandedOverAt: now,
      driverReceivedByName: receivedByName,
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "transfer.driverHandedOver",
      userId: user._id,
      entityType: "transfers",
      entityId: args.transferId,
      after: { driverHandedOverAt: now, receivedByName },
    });

    // Tells the branch to count it in Receiving.
    await ctx.scheduler.runAfter(0, internal.logistics.notifications._processNotification, {
      type: "driver_delivered",
      transferId: args.transferId,
    });
  },
});

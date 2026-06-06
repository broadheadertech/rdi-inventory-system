import { query, mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireRole, DRIVER_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";
import { clearReservedOnDelivery } from "../_helpers/transferStock";
import { generateInternalInvoice } from "../_helpers/internalInvoice";
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

    // Filter for inTransit only (in-memory — by_driver index doesn't include status)
    const active = transfers.filter((t) => t.status === "inTransit");

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

export const driverConfirmDelivery = mutation({
  args: { transferId: v.id("transfers") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, DRIVER_ROLES);

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    }
    if (transfer.status !== "inTransit") {
      throw new ConvexError({ code: "INVALID_STATE", message: "Only in-transit transfers can be confirmed." });
    }
    if (transfer.driverId !== user._id) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Transfer not assigned to you." });
    }
    if (!transfer.driverArrivedAt) {
      throw new ConvexError({ code: "INVALID_STATE", message: "Must mark arrived before confirming delivery." });
    }

    const items = await ctx.db
      .query("transferItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", args.transferId))
      .collect();

    const now = Date.now();

    // Bulk inventory upsert — all packed quantities → destination branch
    for (const item of items) {
      const qty = item.packedQuantity ?? item.requestedQuantity;
      if (qty > 0) {
        const existing = await ctx.db
          .query("inventory")
          .withIndex("by_branch_variant", (q) =>
            q.eq("branchId", transfer.toBranchId).eq("variantId", item.variantId)
          )
          .unique();

        if (existing) {
          await ctx.db.patch(existing._id, {
            quantity: existing.quantity + qty,
            arrivedAt: now,
            updatedAt: now,
          });
        } else {
          await ctx.db.insert("inventory", {
            branchId: transfer.toBranchId,
            variantId: item.variantId,
            quantity: qty,
            arrivedAt: now,
            updatedAt: now,
          });
        }

        // Create FIFO batch at destination
        const variant = await ctx.db.get(item.variantId);
        await ctx.db.insert("inventoryBatches", {
          branchId: transfer.toBranchId,
          variantId: item.variantId,
          quantity: qty,
          costPriceCentavos: variant?.costPriceCentavos ?? variant?.priceCentavos ?? 0,
          receivedAt: now,
          source: "transfer",
          sourceId: args.transferId as string,
          createdAt: now,
        });

        // Set receivedQuantity for consistency with 6.3 receiving flow
        await ctx.db.patch(item._id, { receivedQuantity: qty });
      }
    }

    // Clear reserved stock at source — goods have physically left
    await clearReservedOnDelivery(ctx, args.transferId, transfer.fromBranchId);

    // Update transfer status
    await ctx.db.patch(args.transferId, {
      status: "delivered",
      deliveredAt: now,
      deliveredById: user._id,
      updatedAt: now,
    });

    // Generate internal invoice for stock requests only (not returns)
    let invoiceId: Id<"internalInvoices"> | null = null;
    if (transfer.type !== "return") {
      invoiceId = await generateInternalInvoice(ctx, {
        transferId: args.transferId,
        fromBranchId: transfer.fromBranchId,
        toBranchId: transfer.toBranchId,
        userId: user._id,
      });
    }

    await _logAuditEntry(ctx, {
      action: "transfer.driverDeliver",
      userId: user._id,
      entityType: "transfers",
      entityId: args.transferId,
      before: { status: "inTransit" },
      after: { status: "delivered", deliveredById: user._id },
    });

    if (invoiceId) {
      await _logAuditEntry(ctx, {
        action: "internalInvoice.generate",
        userId: user._id,
        entityType: "internalInvoices",
        entityId: invoiceId,
        after: { transferId: args.transferId },
      });
    }

    await ctx.scheduler.runAfter(0, internal.logistics.notifications._processNotification, {
      type: "driver_delivered",
      transferId: args.transferId,
    });
  },
});

import { query, mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import { requireRole, WAREHOUSE_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";
import { clearReservedOnDelivery } from "../_helpers/transferStock";
import { generateInternalInvoice } from "../_helpers/internalInvoice";

// ─── Box Code Generation ────────────────────────────────────────────────────

function generateBoxCode(transferId: string, boxNumber: number): string {
  // Use last 8 chars of transfer ID for brevity
  const shortId = transferId.slice(-8);
  const paddedBox = String(boxNumber).padStart(3, "0");
  return `TRF-${shortId}-BOX-${paddedBox}`;
}

// ─── Create a new box for a transfer ────────────────────────────────────────

export const createBox = mutation({
  args: { transferId: v.id("transfers") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, WAREHOUSE_ROLES);

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    }
    if (transfer.status !== "approved" && transfer.status !== "packed") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Transfer must be in approved or packed status to create boxes.",
      });
    }

    // Get existing boxes to determine next box number
    const existingBoxes = await ctx.db
      .query("transferBoxes")
      .withIndex("by_transfer", (q) => q.eq("transferId", args.transferId))
      .collect();

    const nextNumber = existingBoxes.length + 1;
    const boxCode = generateBoxCode(args.transferId, nextNumber);

    const boxId = await ctx.db.insert("transferBoxes", {
      transferId: args.transferId,
      boxNumber: nextNumber,
      boxCode,
      totalItems: 0,
      status: "packing",
      createdAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "transferBox.create",
      userId: user._id,
      entityType: "transferBoxes",
      entityId: boxId,
      after: { transferId: args.transferId, boxCode, boxNumber: nextNumber },
    });

    return { boxId, boxCode, boxNumber: nextNumber };
  },
});

// ─── Scan item into box ─────────────────────────────────────────────────────

export const scanItemIntoBox = mutation({
  args: {
    boxId: v.id("transferBoxes"),
    barcode: v.string(),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, WAREHOUSE_ROLES);

    if (!Number.isInteger(args.quantity) || args.quantity < 1) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Quantity must be a positive integer.",
      });
    }

    const box = await ctx.db.get(args.boxId);
    if (!box) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Box not found." });
    }
    if (box.status !== "packing") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Box is already sealed.",
      });
    }

    // Find variant by barcode or SKU
    let variant: Doc<"variants"> | null = await ctx.db
      .query("variants")
      .withIndex("by_barcode", (q) => q.eq("barcode", args.barcode))
      .first();

    if (!variant) {
      variant = await ctx.db
        .query("variants")
        .withIndex("by_sku", (q) => q.eq("sku", args.barcode))
        .first();
    }

    if (!variant) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: `No product found for barcode/SKU "${args.barcode}".`,
      });
    }

    // Verify this variant is part of the transfer
    const transfer = await ctx.db.get(box.transferId);
    if (!transfer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    }

    const transferItems = await ctx.db
      .query("transferItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", box.transferId))
      .collect();

    const matchingItem = transferItems.find((ti) => ti.variantId === variant!._id);
    if (!matchingItem) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: `This product is not part of transfer. SKU: ${variant.sku}`,
      });
    }

    // Check how much has already been packed across all boxes for this variant
    const allBoxItems = await ctx.db
      .query("transferBoxItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", box.transferId))
      .collect();

    const alreadyPacked = allBoxItems
      .filter((bi) => bi.variantId === variant!._id)
      .reduce((sum, bi) => sum + bi.quantity, 0);

    const maxAllowed = matchingItem.requestedQuantity;
    if (alreadyPacked + args.quantity > maxAllowed) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: `Cannot pack ${args.quantity} more — already packed ${alreadyPacked} of ${maxAllowed} requested.`,
      });
    }

    // Check if same variant already in this box — merge quantities
    const existingInBox = allBoxItems.find(
      (bi) => bi.boxId === args.boxId && bi.variantId === variant!._id
    );

    if (existingInBox) {
      await ctx.db.patch(existingInBox._id, {
        quantity: existingInBox.quantity + args.quantity,
      });
    } else {
      await ctx.db.insert("transferBoxItems", {
        boxId: args.boxId,
        transferId: box.transferId,
        variantId: variant._id,
        quantity: args.quantity,
        scannedAt: Date.now(),
        scannedById: user._id,
      });
    }

    // Update box total count
    await ctx.db.patch(args.boxId, {
      totalItems: box.totalItems + args.quantity,
    });

    const style = await ctx.db.get(variant.styleId);

    return {
      variantId: variant._id,
      sku: variant.sku,
      size: variant.size,
      color: variant.color,
      styleName: style?.name ?? "Unknown",
      quantityAdded: args.quantity,
      totalInBox: (existingInBox?.quantity ?? 0) + args.quantity,
      totalPackedForVariant: alreadyPacked + args.quantity,
      maxAllowed,
    };
  },
});

// ─── Remove item from box ───────────────────────────────────────────────────

export const removeItemFromBox = mutation({
  args: {
    boxItemId: v.id("transferBoxItems"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, WAREHOUSE_ROLES);

    const boxItem = await ctx.db.get(args.boxItemId);
    if (!boxItem) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Box item not found." });
    }

    const box = await ctx.db.get(boxItem.boxId);
    if (!box || box.status !== "packing") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Cannot remove items from a sealed box.",
      });
    }

    await ctx.db.patch(boxItem.boxId, {
      totalItems: Math.max(0, box.totalItems - boxItem.quantity),
    });

    await ctx.db.delete(args.boxItemId);
  },
});

// ─── Seal a box ─────────────────────────────────────────────────────────────

export const sealBox = mutation({
  args: { boxId: v.id("transferBoxes") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, WAREHOUSE_ROLES);

    const box = await ctx.db.get(args.boxId);
    if (!box) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Box not found." });
    }
    if (box.status !== "packing") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Box is already sealed.",
      });
    }
    if (box.totalItems === 0) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Cannot seal an empty box.",
      });
    }

    const now = Date.now();
    await ctx.db.patch(args.boxId, {
      status: "sealed",
      sealedAt: now,
      sealedById: user._id,
    });

    await _logAuditEntry(ctx, {
      action: "transferBox.seal",
      userId: user._id,
      entityType: "transferBoxes",
      entityId: args.boxId,
      after: { boxCode: box.boxCode, totalItems: box.totalItems },
    });
  },
});

// ─── Delete an empty/unsealeld box ──────────────────────────────────────────

export const deleteBox = mutation({
  args: { boxId: v.id("transferBoxes") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, WAREHOUSE_ROLES);

    const box = await ctx.db.get(args.boxId);
    if (!box) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Box not found." });
    }
    if (box.status !== "packing") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Cannot delete a sealed box.",
      });
    }

    // Delete all items in the box
    const boxItems = await ctx.db
      .query("transferBoxItems")
      .withIndex("by_box", (q) => q.eq("boxId", args.boxId))
      .collect();
    for (const item of boxItems) {
      await ctx.db.delete(item._id);
    }

    await ctx.db.delete(args.boxId);
  },
});

// ─── Complete packing (seal all boxes + finalize transfer) ──────────────────

export const completeBoxPacking = mutation({
  args: {
    transferId: v.id("transfers"),
    expectedDeliveryDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, WAREHOUSE_ROLES);

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    }
    if (transfer.status !== "approved") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Transfer must be in approved status to complete packing.",
      });
    }

    const boxes = await ctx.db
      .query("transferBoxes")
      .withIndex("by_transfer", (q) => q.eq("transferId", args.transferId))
      .collect();

    if (boxes.length === 0) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "No boxes created. Pack items into at least one box first.",
      });
    }

    // Verify all boxes are sealed
    const unsealedBoxes = boxes.filter((b) => b.status === "packing");
    if (unsealedBoxes.length > 0) {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: `${unsealedBoxes.length} box(es) still open. Seal all boxes before completing packing.`,
      });
    }

    // Compute packed quantities from box items and update transferItems
    const allBoxItems = await ctx.db
      .query("transferBoxItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", args.transferId))
      .collect();

    // Sum by variant
    const packedByVariant = new Map<string, number>();
    for (const bi of allBoxItems) {
      const vid = bi.variantId as string;
      packedByVariant.set(vid, (packedByVariant.get(vid) ?? 0) + bi.quantity);
    }

    // Update transferItems with packed quantities
    const transferItems = await ctx.db
      .query("transferItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", args.transferId))
      .collect();

    for (const ti of transferItems) {
      const packed = packedByVariant.get(ti.variantId as string) ?? 0;
      await ctx.db.patch(ti._id, { packedQuantity: packed });
    }

    const now = Date.now();
    await ctx.db.patch(args.transferId, {
      status: "packed",
      packedAt: now,
      packedById: user._id,
      expectedDeliveryDays: args.expectedDeliveryDays,
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "transfer.boxPackComplete",
      userId: user._id,
      entityType: "transfers",
      entityId: args.transferId,
      after: {
        status: "packed",
        boxCount: boxes.length,
        expectedDeliveryDays: args.expectedDeliveryDays,
      },
    });
  },
});

// ─── Queries ────────────────────────────────────────────────────────────────

export const getBoxesForTransfer = query({
  args: { transferId: v.id("transfers") },
  handler: async (ctx, args) => {
    await requireRole(ctx, WAREHOUSE_ROLES);

    const boxes = await ctx.db
      .query("transferBoxes")
      .withIndex("by_transfer", (q) => q.eq("transferId", args.transferId))
      .collect();

    const enriched = await Promise.all(
      boxes.map(async (box) => {
        const items = await ctx.db
          .query("transferBoxItems")
          .withIndex("by_box", (q) => q.eq("boxId", box._id))
          .collect();

        const enrichedItems = await Promise.all(
          items.map(async (bi) => {
            const variant = await ctx.db.get(bi.variantId);
            const style = variant ? await ctx.db.get(variant.styleId) : null;
            return {
              _id: bi._id,
              variantId: bi.variantId,
              sku: variant?.sku ?? "",
              barcode: variant?.barcode ?? null,
              size: variant?.size ?? "",
              color: variant?.color ?? "",
              styleName: style?.name ?? "Unknown",
              quantity: bi.quantity,
            };
          })
        );

        return {
          _id: box._id,
          boxNumber: box.boxNumber,
          boxCode: box.boxCode,
          totalItems: box.totalItems,
          status: box.status,
          sealedAt: box.sealedAt ?? null,
          items: enrichedItems,
        };
      })
    );

    return enriched.sort((a, b) => a.boxNumber - b.boxNumber);
  },
});

// Get transfer packing progress (how much is packed vs requested)
export const getPackingProgress = query({
  args: { transferId: v.id("transfers") },
  handler: async (ctx, args) => {
    await requireRole(ctx, WAREHOUSE_ROLES);

    const transferItems = await ctx.db
      .query("transferItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", args.transferId))
      .collect();

    const allBoxItems = await ctx.db
      .query("transferBoxItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", args.transferId))
      .collect();

    const packedByVariant = new Map<string, number>();
    for (const bi of allBoxItems) {
      const vid = bi.variantId as string;
      packedByVariant.set(vid, (packedByVariant.get(vid) ?? 0) + bi.quantity);
    }

    const items = await Promise.all(
      transferItems.map(async (ti) => {
        const variant = await ctx.db.get(ti.variantId);
        const style = variant ? await ctx.db.get(variant.styleId) : null;
        const packed = packedByVariant.get(ti.variantId as string) ?? 0;
        return {
          variantId: ti.variantId,
          sku: variant?.sku ?? "",
          barcode: variant?.barcode ?? null,
          size: variant?.size ?? "",
          color: variant?.color ?? "",
          styleName: style?.name ?? "Unknown",
          requested: ti.requestedQuantity,
          packed,
          remaining: ti.requestedQuantity - packed,
        };
      })
    );

    const totalRequested = items.reduce((s, i) => s + i.requested, 0);
    const totalPacked = items.reduce((s, i) => s + i.packed, 0);

    return {
      items,
      totalRequested,
      totalPacked,
      totalRemaining: totalRequested - totalPacked,
      isComplete: totalPacked >= totalRequested,
    };
  },
});

// ─── Box QR Lookup (for branch receiving) ───────────────────────────────────

export const lookupBoxByCode = query({
  args: { boxCode: v.string() },
  handler: async (ctx, args) => {
    // Allow branch staff to look up boxes too
    const box = await ctx.db
      .query("transferBoxes")
      .withIndex("by_boxCode", (q) => q.eq("boxCode", args.boxCode))
      .first();

    if (!box) return null;

    const transfer = await ctx.db.get(box.transferId);
    if (!transfer) return null;

    const fromBranch = await ctx.db.get(transfer.fromBranchId);
    const toBranch = await ctx.db.get(transfer.toBranchId);

    const items = await ctx.db
      .query("transferBoxItems")
      .withIndex("by_box", (q) => q.eq("boxId", box._id))
      .collect();

    const enrichedItems = await Promise.all(
      items.map(async (bi) => {
        const variant = await ctx.db.get(bi.variantId);
        const style = variant ? await ctx.db.get(variant.styleId) : null;
        return {
          variantId: bi.variantId,
          sku: variant?.sku ?? "",
          barcode: variant?.barcode ?? null,
          size: variant?.size ?? "",
          color: variant?.color ?? "",
          styleName: style?.name ?? "Unknown",
          quantity: bi.quantity,
        };
      })
    );

    return {
      boxId: box._id,
      boxCode: box.boxCode,
      boxNumber: box.boxNumber,
      totalItems: box.totalItems,
      status: box.status,
      transferId: box.transferId,
      transferStatus: transfer.status,
      fromBranchName: fromBranch?.name ?? "Unknown",
      toBranchName: toBranch?.name ?? "Unknown",
      items: enrichedItems,
    };
  },
});

// ─── Branch confirms box receipt ────────────────────────────────────────────

export const confirmBoxReceipt = mutation({
  args: {
    boxId: v.id("transferBoxes"),
    hasDiscrepancy: v.boolean(),
    discrepancyNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["admin", "manager", "warehouseStaff"]);

    const box = await ctx.db.get(args.boxId);
    if (!box) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Box not found." });
    }
    if (box.status !== "sealed") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: `Box is in "${box.status}" status — can only confirm sealed boxes.`,
      });
    }

    const now = Date.now();
    await ctx.db.patch(args.boxId, {
      status: args.hasDiscrepancy ? "discrepancy" : "received",
      receivedAt: now,
      receivedById: user._id,
      ...(args.discrepancyNotes ? { discrepancyNotes: args.discrepancyNotes } : {}),
    });

    // Check if all boxes in this transfer are now received/discrepancy
    const allBoxes = await ctx.db
      .query("transferBoxes")
      .withIndex("by_transfer", (q) => q.eq("transferId", box.transferId))
      .collect();

    const allProcessed = allBoxes.every(
      (b) => b._id === args.boxId || b.status === "received" || b.status === "discrepancy"
    );

    if (allProcessed) {
      const transfer = await ctx.db.get(box.transferId);
      if (transfer && transfer.status === "inTransit") {
        // Auto-complete the transfer delivery
        const transferItems = await ctx.db
          .query("transferItems")
          .withIndex("by_transfer", (q) => q.eq("transferId", box.transferId))
          .collect();

        // Sum received quantities from box items
        const allBoxItems = await ctx.db
          .query("transferBoxItems")
          .withIndex("by_transfer", (q) => q.eq("transferId", box.transferId))
          .collect();

        const receivedByVariant = new Map<string, number>();
        for (const bi of allBoxItems) {
          // Only count items from received boxes (not discrepancy ones)
          const biBox = allBoxes.find((b) => b._id === bi.boxId);
          const boxStatus = bi.boxId === args.boxId
            ? (args.hasDiscrepancy ? "discrepancy" : "received")
            : biBox?.status;
          if (boxStatus === "received") {
            const vid = bi.variantId as string;
            receivedByVariant.set(vid, (receivedByVariant.get(vid) ?? 0) + bi.quantity);
          }
        }

        // Update transferItems and inventory
        for (const ti of transferItems) {
          const received = receivedByVariant.get(ti.variantId as string) ?? 0;
          await ctx.db.patch(ti._id, { receivedQuantity: received });

          if (received > 0) {
            const existing = await ctx.db
              .query("inventory")
              .withIndex("by_branch_variant", (q) =>
                q.eq("branchId", transfer.toBranchId).eq("variantId", ti.variantId)
              )
              .unique();

            if (existing) {
              await ctx.db.patch(existing._id, {
                quantity: existing.quantity + received,
                arrivedAt: now,
                updatedAt: now,
              });
            } else {
              await ctx.db.insert("inventory", {
                branchId: transfer.toBranchId,
                variantId: ti.variantId,
                quantity: received,
                arrivedAt: now,
                updatedAt: now,
              });
            }

            // FIFO batch
            const recvVariant = await ctx.db.get(ti.variantId);
            await ctx.db.insert("inventoryBatches", {
              branchId: transfer.toBranchId,
              variantId: ti.variantId,
              quantity: received,
              costPriceCentavos: recvVariant?.costPriceCentavos ?? recvVariant?.priceCentavos ?? 0,
              receivedAt: now,
              source: "transfer",
              sourceId: box.transferId as string,
              createdAt: now,
            });
          }
        }

        // Clear reserved stock at source
        await clearReservedOnDelivery(ctx, box.transferId, transfer.fromBranchId);

        // Mark transfer delivered
        const hasAnyDiscrepancy = allBoxes.some(
          (b) => (b._id === args.boxId ? args.hasDiscrepancy : b.status === "discrepancy")
        );

        await ctx.db.patch(box.transferId, {
          status: "delivered",
          deliveredAt: now,
          deliveredById: user._id,
          updatedAt: now,
        });

        // Generate invoice if not a return
        if (transfer.type !== "return") {
          await generateInternalInvoice(ctx, {
            transferId: box.transferId,
            fromBranchId: transfer.fromBranchId,
            toBranchId: transfer.toBranchId,
            userId: user._id,
          });
        }

        await _logAuditEntry(ctx, {
          action: "transfer.boxDeliveryComplete",
          userId: user._id,
          entityType: "transfers",
          entityId: box.transferId,
          after: {
            status: "delivered",
            boxesReceived: allBoxes.filter((b) =>
              b._id === args.boxId ? !args.hasDiscrepancy : b.status === "received"
            ).length,
            boxesWithDiscrepancy: allBoxes.filter((b) =>
              b._id === args.boxId ? args.hasDiscrepancy : b.status === "discrepancy"
            ).length,
          },
        });
      }
    }

    return { allProcessed };
  },
});

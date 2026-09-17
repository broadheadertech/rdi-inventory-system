import { query, mutation, type QueryCtx, type MutationCtx } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import { requireRole, WAREHOUSE_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";
import { clearReservedOnDelivery } from "../_helpers/transferStock";
import { generateInternalInvoice } from "../_helpers/internalInvoice";
import { raiseBoxDispute } from "../disputes";
import {
  boxScanCounts,
  latestStandingScan,
  resolveScanCode,
} from "../_helpers/receivingScans";

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

/**
 * The wrong items scanned into a box, grouped by what was scanned, with the box
 * of the same transfer each stray product was actually packed in.
 */
export async function wrongScanSummary(
  ctx: QueryCtx | MutationCtx,
  box: Doc<"transferBoxes">
) {
  const rejected = await ctx.db
    .query("receivingRejectedScans")
    .withIndex("by_box", (q) => q.eq("boxId", box._id))
    .collect();

  // Where each product on this transfer was packed, so a stray can be sent home.
  const transferBoxItems = await ctx.db
    .query("transferBoxItems")
    .withIndex("by_transfer", (q) => q.eq("transferId", box.transferId))
    .collect();
  const boxCodeById = new Map<string, string>();
  for (const b of await ctx.db
    .query("transferBoxes")
    .withIndex("by_transfer", (q) => q.eq("transferId", box.transferId))
    .collect()) {
    boxCodeById.set(b._id as string, b.boxCode);
  }

  const groups = new Map<
    string,
    {
      reason: "notInBox" | "unknownCode";
      code: string;
      sku: string | null;
      label: string;
      count: number;
      packedInBoxCodes: string[];
    }
  >();

  for (const scan of rejected) {
    const key = scan.variantId ? `v:${scan.variantId}` : `c:${scan.code}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }

    let sku: string | null = null;
    let label = scan.code;
    let packedInBoxCodes: string[] = [];
    if (scan.variantId) {
      const variant = await ctx.db.get(scan.variantId);
      const style = variant ? await ctx.db.get(variant.styleId) : null;
      sku = variant?.sku ?? null;
      label = variant
        ? `${style?.name ?? "Unknown"} · ${variant.size} / ${variant.color}`
        : scan.code;
      packedInBoxCodes = [
        ...new Set(
          transferBoxItems
            .filter((bi) => bi.variantId === scan.variantId && bi.boxId !== box._id)
            .map((bi) => boxCodeById.get(bi.boxId as string))
            .filter((code): code is string => !!code)
        ),
      ];
    }

    groups.set(key, {
      reason: scan.reason,
      code: scan.code,
      sku,
      label,
      count: 1,
      packedInBoxCodes,
    });
  }

  const items = [...groups.values()].sort((a, b) => b.count - a.count);
  return {
    total: rejected.length,
    notInBox: rejected.filter((r) => r.reason === "notInBox").length,
    unknownCode: rejected.filter((r) => r.reason === "unknownCode").length,
    items,
  };
}

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

    // What has been scanned out of the box so far — the only count it has.
    const scanned = await boxScanCounts(ctx, box._id);

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
          scannedQuantity: scanned.get(bi.variantId as string) ?? 0,
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
      wrongScans: await wrongScanSummary(ctx, box),
    };
  },
});

// ─── Branch scans a box in, piece by piece ──────────────────────────────────
// A box is not received by confirming its code. Every piece in it is scanned,
// and the box is received for the pieces that were — so a box short at packing
// shows up short at the branch instead of being credited in full unopened.

export const scanBoxPiece = mutation({
  args: { boxId: v.id("transferBoxes"), code: v.string() },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["admin", "manager", "warehouseStaff"]);

    const box = await ctx.db.get(args.boxId);
    if (!box) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Box not found." });
    }
    if (box.status !== "sealed") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: `Box is in "${box.status}" status — only sealed boxes can be received.`,
      });
    }

    const code = args.code.trim();
    const now = Date.now();

    const match = await resolveScanCode(ctx, code);
    if (!match) {
      await ctx.db.insert("receivingRejectedScans", {
        boxId: args.boxId,
        code,
        reason: "unknownCode",
        scannedById: user._id,
        scannedAt: now,
      });
      return {
        ok: false as const,
        reason: "unknownCode" as const,
        message: `No product found for "${code}".`,
      };
    }

    const packed = await ctx.db
      .query("transferBoxItems")
      .withIndex("by_box", (q) => q.eq("boxId", args.boxId))
      .collect();
    const packedQuantity = packed
      .filter((bi) => bi.variantId === match.variant._id)
      .reduce((sum, bi) => sum + bi.quantity, 0);
    if (packedQuantity === 0) {
      await ctx.db.insert("receivingRejectedScans", {
        boxId: args.boxId,
        code,
        reason: "notInBox",
        variantId: match.variant._id,
        scannedById: user._id,
        scannedAt: now,
      });
      // Say where it does belong, when it is on this transfer at all.
      const elsewhere = await ctx.db
        .query("transferBoxItems")
        .withIndex("by_transfer", (q) => q.eq("transferId", box.transferId))
        .collect();
      const home = elsewhere.find((bi) => bi.variantId === match.variant._id);
      const homeBox = home ? await ctx.db.get(home.boxId) : null;
      return {
        ok: false as const,
        reason: "notInBox" as const,
        message: homeBox
          ? `Wrong item: ${match.variant.sku} is packed in ${homeBox.boxCode}, not this box.`
          : `Wrong item: ${match.variant.sku} is not on this transfer.`,
      };
    }

    await ctx.db.insert("receivingScans", {
      boxId: args.boxId,
      variantId: match.variant._id,
      code,
      matchedBy: match.matchedBy,
      scannedById: user._id,
      scannedAt: now,
    });

    const counts = await boxScanCounts(ctx, args.boxId);
    return {
      ok: true as const,
      sku: match.variant.sku,
      scannedQuantity: counts.get(match.variant._id as string) ?? 0,
      packedQuantity,
    };
  },
});

export const undoLastBoxScan = mutation({
  args: { boxId: v.id("transferBoxes") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["admin", "manager", "warehouseStaff"]);

    const box = await ctx.db.get(args.boxId);
    if (!box || box.status !== "sealed") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Only a box still being received can have a scan undone.",
      });
    }

    const scan = await latestStandingScan(ctx, { boxId: args.boxId });
    if (!scan) {
      throw new ConvexError({ code: "NOTHING_TO_UNDO", message: "No scan to undo." });
    }
    await ctx.db.patch(scan._id, { undoneAt: Date.now(), undoneById: user._id });

    const variant = await ctx.db.get(scan.variantId);
    return { sku: variant?.sku ?? scan.code };
  },
});

// ─── Branch confirms box receipt ────────────────────────────────────────────
// Whether a box has a discrepancy is decided by its scans against what was
// packed, not by a button. A box is always credited for what was scanned in
// it: crediting a 59-of-60 box nothing, as before, left 59 real pieces in the
// store and out of the system. Disputes record the difference; they never add
// stock, so nothing is counted twice.

export const confirmBoxReceipt = mutation({
  args: {
    boxId: v.id("transferBoxes"),
    // Anything the receiver saw that the counts do not — a crushed box, wet
    // stock. Added to the discrepancy note, never used to decide it.
    discrepancyNotes: v.optional(v.string()),
    // The box never arrived. Nothing can be scanned from a box that is not
    // there, so this is the one way to close it — and it can only credit zero,
    // so it opens no back door to a typed count.
    boxMissing: v.optional(v.boolean()),
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

    const packedItems = await ctx.db
      .query("transferBoxItems")
      .withIndex("by_box", (q) => q.eq("boxId", args.boxId))
      .collect();
    const scanned = await boxScanCounts(ctx, args.boxId);

    const totalScanned = [...scanned.values()].reduce((sum, n) => sum + n, 0);
    if (args.boxMissing && totalScanned > 0) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Pieces from this box have been scanned, so it is not missing. Undo them first.",
      });
    }
    if (!args.boxMissing && totalScanned === 0) {
      throw new ConvexError({
        code: "NOTHING_SCANNED",
        message:
          "Nothing in this box has been scanned. Scan each piece, or report the box missing.",
      });
    }

    // Packed against scanned, per variant.
    const packedByVariant = new Map<string, number>();
    for (const bi of packedItems) {
      const key = bi.variantId as string;
      packedByVariant.set(key, (packedByVariant.get(key) ?? 0) + bi.quantity);
    }
    const differences: string[] = [];
    for (const [variantKey, packedQty] of packedByVariant) {
      const scannedQty = scanned.get(variantKey) ?? 0;
      if (scannedQty === packedQty) continue;
      const sku =
        (await ctx.db.get(variantKey as Id<"variants">))?.sku ?? variantKey;
      const diff = scannedQty - packedQty;
      differences.push(`${sku} ${scannedQty} of ${packedQty} (${diff > 0 ? "+" : ""}${diff})`);
    }

    const hasDiscrepancy = differences.length > 0;
    const receiverNotes = args.discrepancyNotes?.trim();
    const wrong = await wrongScanSummary(ctx, box);
    const wrongNote =
      wrong.total > 0
        ? `${wrong.total} wrong-item scan${wrong.total === 1 ? "" : "s"}: ` +
          wrong.items
            .map(
              (w) =>
                `${w.sku ?? w.code} x${w.count}` +
                (w.packedInBoxCodes.length > 0 ? ` (packed in ${w.packedInBoxCodes.join(", ")})` : "")
            )
            .join(", ")
        : null;
    const discrepancyNotes = [
      ...(args.boxMissing ? ["Box missing — nothing received"] : []),
      ...differences,
      ...(wrongNote ? [wrongNote] : []),
      ...(receiverNotes ? [receiverNotes] : []),
    ].join("; ");

    const now = Date.now();
    await ctx.db.patch(args.boxId, {
      status: hasDiscrepancy ? "discrepancy" : "received",
      receivedAt: now,
      receivedById: user._id,
      ...(discrepancyNotes ? { discrepancyNotes } : {}),
    });

    if (hasDiscrepancy) {
      await raiseBoxDispute(ctx, (await ctx.db.get(args.boxId))!);
    }

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
        const transferItems = await ctx.db
          .query("transferItems")
          .withIndex("by_transfer", (q) => q.eq("transferId", box.transferId))
          .collect();

        // What every box in the transfer actually received, from its scans.
        const receivedByVariant = new Map<string, number>();
        for (const b of allBoxes) {
          const counts = await boxScanCounts(ctx, b._id);
          for (const [variantKey, n] of counts) {
            receivedByVariant.set(variantKey, (receivedByVariant.get(variantKey) ?? 0) + n);
          }
        }

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
              b._id === args.boxId ? !hasDiscrepancy : b.status === "received"
            ).length,
            boxesWithDiscrepancy: allBoxes.filter((b) =>
              b._id === args.boxId ? hasDiscrepancy : b.status === "discrepancy"
            ).length,
          },
        });
      }
    }

    return { allProcessed, hasDiscrepancy, differences };
  },
});

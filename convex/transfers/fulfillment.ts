import { query, mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireRole, WAREHOUSE_ROLES } from "../_helpers/permissions";
import {
  latestStandingScan,
  resolveScanCode,
  transferScanCounts,
} from "../_helpers/receivingScans";
import { withBranchScope } from "../_helpers/withBranchScope";
import { _logAuditEntry } from "../_helpers/auditLog";
import { clearReservedOnDelivery } from "../_helpers/transferStock";
import { generateInternalInvoice } from "../_helpers/internalInvoice";
import { internal } from "../_generated/api";
import { raiseTransferDispute } from "../disputes";

// NOTE: Use requireRole (NOT withBranchScope) — warehouse staff handle all
// cross-branch transfers, not limited to their own branch.

// M3 fix: shared branch name resolver factory — creates a per-invocation resolver
// with its own Map cache so the same branch isn't fetched twice per query call.
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

export const listApprovedTransfers = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, WAREHOUSE_ROLES);

    const transfers = await ctx.db
      .query("transfers")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .collect();

    const getBranchName = makeBranchNameResolver((id) => ctx.db.get(id));

    const enriched = await Promise.all(
      transfers.map(async (transfer) => {
        const fromBranchName = await getBranchName(transfer.fromBranchId);
        const toBranchName = await getBranchName(transfer.toBranchId);
        const items = await ctx.db
          .query("transferItems")
          .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
          .collect();
        return {
          _id: transfer._id,
          fromBranchName,
          toBranchName,
          itemCount: items.length,
          approvedAt: transfer.approvedAt ?? null,
          createdAt: transfer.createdAt,
        };
      })
    );

    // Oldest first = highest packing priority
    return enriched.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const getTransferPackingData = query({
  args: { transferId: v.id("transfers") },
  handler: async (ctx, args) => {
    await requireRole(ctx, WAREHOUSE_ROLES);

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    }
    if (transfer.status !== "approved") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Transfer is not in approved status.",
      });
    }

    const fromBranch = await ctx.db.get(transfer.fromBranchId);
    const toBranch = await ctx.db.get(transfer.toBranchId);

    const items = await ctx.db
      .query("transferItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
      .collect();

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const variant = await ctx.db.get(item.variantId);
        const style = variant ? await ctx.db.get(variant.styleId) : null;
        return {
          itemId: item._id,
          variantId: item.variantId,
          sku: variant?.sku ?? "",
          barcode: variant?.barcode ?? null,
          size: variant?.size ?? "",
          color: variant?.color ?? "",
          styleName: style?.name ?? "Unknown",
          requestedQuantity: item.requestedQuantity,
        };
      })
    );

    return {
      transferId: transfer._id,
      fromBranchName: fromBranch?.isActive ? fromBranch.name : "(inactive)",
      toBranchName: toBranch?.isActive ? toBranch.name : "(inactive)",
      notes: transfer.notes ?? null,
      createdAt: transfer.createdAt,
      items: enrichedItems,
    };
  },
});

export const completeTransferPacking = mutation({
  args: {
    transferId: v.id("transfers"),
    packedItems: v.array(
      v.object({
        itemId: v.id("transferItems"),
        packedQuantity: v.number(),
      })
    ),
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
        message: "Only approved transfers can be packed.",
      });
    }

    // Validate all packed quantities are non-negative integers
    for (const item of args.packedItems) {
      if (!Number.isInteger(item.packedQuantity) || item.packedQuantity < 0) {
        throw new ConvexError({
          code: "INVALID_ARGUMENT",
          message: "packedQuantity must be a non-negative integer.",
        });
      }
    }

    // H1+M3 fix: fetch actual transferItems to enforce ownership + completeness
    const transferItems = await ctx.db
      .query("transferItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", args.transferId))
      .collect();

    // M3 fix: all items must be represented — no partial pack allowed
    if (args.packedItems.length !== transferItems.length) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: `Expected ${transferItems.length} packed items, got ${args.packedItems.length}.`,
      });
    }

    // H1 fix: every itemId must belong to this transfer — prevents cross-transfer corruption
    const itemById = new Map(transferItems.map((row) => [row._id as string, row]));
    for (const item of args.packedItems) {
      const original = itemById.get(item.itemId as string);
      if (!original) {
        throw new ConvexError({
          code: "INVALID_ARGUMENT",
          message: "One or more items do not belong to this transfer.",
        });
      }
      // Can't pack more than what was requested/reserved
      if (item.packedQuantity > original.requestedQuantity) {
        throw new ConvexError({
          code: "INVALID_ARGUMENT",
          message: `Cannot pack ${item.packedQuantity} — only ${original.requestedQuantity} were requested.`,
        });
      }
    }

    // Update each transferItems row with packed quantity
    for (const item of args.packedItems) {
      await ctx.db.patch(item.itemId, { packedQuantity: item.packedQuantity });
    }

    const now = Date.now();
    await ctx.db.patch(args.transferId, {
      status: "packed",
      packedAt: now,
      packedById: user._id,
      ...(args.expectedDeliveryDays ? { expectedDeliveryDays: args.expectedDeliveryDays } : {}),
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "transfer.pack",
      userId: user._id,
      entityType: "transfers",
      entityId: args.transferId,
      before: { status: "approved" },
      after: { status: "packed", packedById: user._id },
    });

    await ctx.scheduler.runAfter(0, internal.logistics.notifications._processNotification, {
      type: "transfer_packed",
      transferId: args.transferId,
    });
  },
});

// ─── Dispatch functions ────────────────────────────────────────────────────────

export const listPackedTransfers = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, WAREHOUSE_ROLES);

    const transfers = await ctx.db
      .query("transfers")
      .withIndex("by_status", (q) => q.eq("status", "packed"))
      .collect();

    const getBranchName = makeBranchNameResolver((id) => ctx.db.get(id));

    const enriched = await Promise.all(
      transfers.map(async (transfer) => {
        const fromBranchName = await getBranchName(transfer.fromBranchId);
        const toBranchName = await getBranchName(transfer.toBranchId);
        const items = await ctx.db
          .query("transferItems")
          .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
          .collect();
        return {
          _id: transfer._id,
          fromBranchName,
          toBranchName,
          itemCount: items.length,
          packedAt: transfer.packedAt ?? null,
          createdAt: transfer.createdAt,
        };
      })
    );

    return enriched.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const markTransferInTransit = mutation({
  args: { transferId: v.id("transfers") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, WAREHOUSE_ROLES);

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    }
    if (transfer.status !== "packed") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Only packed transfers can be dispatched.",
      });
    }

    const now = Date.now();

    // Compute expected delivery date from expectedDeliveryDays set during packing
    const expectedDeliveryDate = transfer.expectedDeliveryDays
      ? now + transfer.expectedDeliveryDays * 86_400_000
      : undefined;

    await ctx.db.patch(args.transferId, {
      status: "inTransit",
      shippedAt: now,
      shippedById: user._id,
      ...(expectedDeliveryDate ? { expectedDeliveryDate } : {}),
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "transfer.dispatch",
      userId: user._id,
      entityType: "transfers",
      entityId: args.transferId,
      before: { status: "packed" },
      after: { status: "inTransit", shippedById: user._id, expectedDeliveryDate },
    });
  },
});

// ─── Receiving functions ───────────────────────────────────────────────────────

export const listInTransitTransfers = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, WAREHOUSE_ROLES);

    const transfers = await ctx.db
      .query("transfers")
      .withIndex("by_status", (q) => q.eq("status", "inTransit"))
      .collect();

    const getBranchName = makeBranchNameResolver((id) => ctx.db.get(id));

    const enriched = await Promise.all(
      transfers.map(async (transfer) => {
        const fromBranchName = await getBranchName(transfer.fromBranchId);
        const toBranchName = await getBranchName(transfer.toBranchId);
        const items = await ctx.db
          .query("transferItems")
          .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
          .collect();
        const boxes = await ctx.db
          .query("transferBoxes")
          .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
          .collect();
        return {
          _id: transfer._id,
          fromBranchName,
          toBranchName,
          itemCount: items.length,
          shippedAt: transfer.shippedAt ?? null,
          createdAt: transfer.createdAt,
          deliveryMode: boxes.length > 0 ? ("box" as const) : ("piece" as const),
          boxCount: boxes.length,
        };
      })
    );

    return enriched.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const getTransferReceivingData = query({
  args: { transferId: v.id("transfers") },
  handler: async (ctx, args) => {
    await requireRole(ctx, [...WAREHOUSE_ROLES, "manager"]);

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    }
    if (transfer.status !== "inTransit") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Transfer is not in transit.",
      });
    }

    const fromBranch = await ctx.db.get(transfer.fromBranchId);
    const toBranch = await ctx.db.get(transfer.toBranchId);

    const items = await ctx.db
      .query("transferItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
      .collect();

    // What has been scanned so far — the only count receiving has.
    const scanned = await transferScanCounts(ctx, transfer._id);

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const variant = await ctx.db.get(item.variantId);
        const style = variant ? await ctx.db.get(variant.styleId) : null;
        return {
          itemId: item._id,
          variantId: item.variantId,
          sku: variant?.sku ?? "",
          barcode: variant?.barcode ?? null,
          size: variant?.size ?? "",
          color: variant?.color ?? "",
          styleName: style?.name ?? "Unknown",
          // Manifest shows what was packed, not original request
          packedQuantity: item.packedQuantity ?? item.requestedQuantity,
          scannedQuantity: scanned.get(item.variantId as string) ?? 0,
        };
      })
    );

    // Where the driver is, for the branch's information — the branch's count
    // completes the delivery whether or not the driver has confirmed handover.
    const driver = transfer.driverId ? await ctx.db.get(transfer.driverId) : null;

    return {
      transferId: transfer._id,
      driverName: driver?.name ?? null,
      driverArrivedAt: transfer.driverArrivedAt ?? null,
      driverHandedOverAt: transfer.driverHandedOverAt ?? null,
      fromBranchName: fromBranch?.isActive ? fromBranch.name : "(inactive)",
      toBranchName: toBranch?.isActive ? toBranch.name : "(inactive)",
      notes: transfer.notes ?? null,
      createdAt: transfer.createdAt,
      items: enrichedItems,
    };
  },
});

// ─── Scanning a transfer in, piece by piece ─────────────────────────────────
// Receiving has no typed quantity. Each scan is its own call and its own row,
// and confirmTransferDelivery counts those rows — so a transfer can only be
// received for the pieces someone actually scanned.

export const scanTransferPiece = mutation({
  args: { transferId: v.id("transfers"), code: v.string() },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, [...WAREHOUSE_ROLES, "manager"]);

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    }
    if (transfer.status !== "inTransit") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Only in-transit transfers can be received.",
      });
    }

    const match = await resolveScanCode(ctx, args.code);
    if (!match) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: `No product found for barcode/SKU "${args.code.trim()}".`,
      });
    }

    const items = await ctx.db
      .query("transferItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", args.transferId))
      .collect();
    const line = items.find((i) => i.variantId === match.variant._id);
    if (!line) {
      throw new ConvexError({
        code: "NOT_ON_TRANSFER",
        message: `${match.variant.sku} is not on this transfer.`,
      });
    }

    await ctx.db.insert("receivingScans", {
      transferId: args.transferId,
      variantId: match.variant._id,
      code: args.code.trim(),
      matchedBy: match.matchedBy,
      scannedById: user._id,
      scannedAt: Date.now(),
    });

    const counts = await transferScanCounts(ctx, args.transferId);
    return {
      itemId: line._id,
      sku: match.variant.sku,
      scannedQuantity: counts.get(match.variant._id as string) ?? 0,
      packedQuantity: line.packedQuantity ?? line.requestedQuantity,
    };
  },
});

export const undoLastTransferScan = mutation({
  args: { transferId: v.id("transfers") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, [...WAREHOUSE_ROLES, "manager"]);

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer || transfer.status !== "inTransit") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Only in-transit transfers can be received.",
      });
    }

    const scan = await latestStandingScan(ctx, { transferId: args.transferId });
    if (!scan) {
      throw new ConvexError({ code: "NOTHING_TO_UNDO", message: "No scan to undo." });
    }
    await ctx.db.patch(scan._id, { undoneAt: Date.now(), undoneById: user._id });

    const variant = await ctx.db.get(scan.variantId);
    return { sku: variant?.sku ?? scan.code };
  },
});

export const confirmTransferDelivery = mutation({
  args: {
    transferId: v.id("transfers"),
    // What was received is counted from the scans, never sent by the page.
    // Only a note about damage travels with the confirmation.
    damageNotes: v.optional(
      v.array(
        v.object({
          itemId: v.id("transferItems"),
          notes: v.string(),
        })
      )
    ),
    // Counting more than was packed adds stock the source never deducted, so
    // the receiver has to confirm the extra pieces are physically there.
    confirmOverage: v.optional(v.boolean()),
    // The delivery never arrived. Nothing can be scanned from goods that are
    // not there, so this is the one way to close it — and it can only receive
    // zero, so it opens no back door to a typed count.
    nothingArrived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, [...WAREHOUSE_ROLES, "manager"]);

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    }
    if (transfer.status !== "inTransit") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Only in-transit transfers can be confirmed.",
      });
    }
    // A driver's delivery is finished by this count too. The driver only
    // records the handover; what arrived is what the receiver counts here.

    const transferItems = await ctx.db
      .query("transferItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", args.transferId))
      .collect();

    // Damage notes may only name lines on this transfer.
    const validItemIds = new Set(transferItems.map((row) => row._id as string));
    for (const note of args.damageNotes ?? []) {
      if (!validItemIds.has(note.itemId as string)) {
        throw new ConvexError({
          code: "INVALID_ARGUMENT",
          message: "One or more items do not belong to this transfer.",
        });
      }
    }

    // The count is the scans. A line nobody scanned was received as zero.
    const scanned = await transferScanCounts(ctx, args.transferId);
    const notesByItem = new Map(
      (args.damageNotes ?? [])
        .filter((note) => note.notes.trim() !== "")
        .map((note) => [note.itemId as string, note.notes.trim()])
    );
    const receivedItems = transferItems.map((row) => ({
      itemId: row._id,
      receivedQuantity: scanned.get(row.variantId as string) ?? 0,
      damageNotes: notesByItem.get(row._id as string),
    }));

    const nothingScanned = receivedItems.every((item) => item.receivedQuantity === 0);
    if (args.nothingArrived && !nothingScanned) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Pieces have been scanned, so the delivery did arrive. Undo them first.",
      });
    }
    if (!args.nothingArrived && nothingScanned) {
      throw new ConvexError({
        code: "NOTHING_SCANNED",
        message:
          "Nothing has been scanned yet. Scan each piece, or report that nothing arrived.",
      });
    }

    const now = Date.now();
    const discrepancies: { sku: string; packed: number; received: number; type: string; damageNotes?: string }[] = [];

    const itemById = new Map(transferItems.map((row) => [row._id as string, row]));

    const overCounted = receivedItems.some((item) => {
      const original = itemById.get(item.itemId as string)!;
      return item.receivedQuantity > (original.packedQuantity ?? original.requestedQuantity);
    });
    if (overCounted && !args.confirmOverage) {
      throw new ConvexError({
        code: "OVERAGE_UNCONFIRMED",
        message:
          "More pieces were counted than were packed. Confirm the extra pieces are physically here before completing.",
      });
    }

    for (const item of receivedItems) {
      const original = itemById.get(item.itemId as string)!;
      const packedQty = original.packedQuantity ?? original.requestedQuantity;

      await ctx.db.patch(item.itemId, {
        receivedQuantity: item.receivedQuantity,
        ...(item.damageNotes ? { damageNotes: item.damageNotes } : {}),
      });

      // Inventory upsert — add what was actually received (even if overage)
      if (item.receivedQuantity > 0) {
        const existing = await ctx.db
          .query("inventory")
          .withIndex("by_branch_variant", (q) =>
            q.eq("branchId", transfer.toBranchId).eq("variantId", original.variantId)
          )
          .unique();

        if (existing) {
          await ctx.db.patch(existing._id, {
            quantity: existing.quantity + item.receivedQuantity,
            arrivedAt: now,
            updatedAt: now,
          });
        } else {
          await ctx.db.insert("inventory", {
            branchId: transfer.toBranchId,
            variantId: original.variantId,
            quantity: item.receivedQuantity,
            arrivedAt: now,
            updatedAt: now,
          });
        }

        // Create FIFO batch at destination
        const recvVariant = await ctx.db.get(original.variantId);
        await ctx.db.insert("inventoryBatches", {
          branchId: transfer.toBranchId,
          variantId: original.variantId,
          quantity: item.receivedQuantity,
          costPriceCentavos: recvVariant?.costPriceCentavos ?? recvVariant?.priceCentavos ?? 0,
          receivedAt: now,
          source: "transfer",
          sourceId: args.transferId as string,
          createdAt: now,
        });
      }

      // Track discrepancy: damage, shortage, OR overage
      if (item.damageNotes || item.receivedQuantity !== packedQty) {
        const variant = await ctx.db.get(original.variantId);
        const type = item.damageNotes
          ? "damaged"
          : item.receivedQuantity < packedQty
            ? "shortage"
            : "overage";
        discrepancies.push({
          sku: variant?.sku ?? original.variantId,
          packed: packedQty,
          received: item.receivedQuantity,
          type,
          ...(item.damageNotes ? { damageNotes: item.damageNotes } : {}),
        });
      }
    }

    // Clear reserved stock at source — goods have physically left
    await clearReservedOnDelivery(ctx, args.transferId, transfer.fromBranchId);

    await ctx.db.patch(args.transferId, {
      status: "delivered",
      deliveredAt: now,
      deliveredById: user._id,
      updatedAt: now,
    });

    // Shortages, overages and damage go to the receiving branch's Disputes.
    if (discrepancies.length > 0) {
      await raiseTransferDispute(ctx, (await ctx.db.get(args.transferId))!);
    }

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
      action: "transfer.deliver",
      userId: user._id,
      entityType: "transfers",
      entityId: args.transferId,
      before: { status: "inTransit" },
      after: {
        status: "delivered",
        deliveredById: user._id,
        type: transfer.type ?? "stockRequest",
        ...(transfer.driverId
          ? { driverId: transfer.driverId, driverHandedOverAt: transfer.driverHandedOverAt ?? null }
          : {}),
      },
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

    if (discrepancies.length > 0) {
      await _logAuditEntry(ctx, {
        action: "transfer.deliveryDiscrepancy",
        userId: user._id,
        entityType: "transfers",
        entityId: args.transferId,
        after: {
          totalIssues: discrepancies.length,
          items: discrepancies,
        },
      });
    }

    await ctx.scheduler.runAfter(0, internal.logistics.notifications._processNotification, {
      type: "transfer_confirmed",
      transferId: args.transferId,
    });
  },
});

// ─── Branch-scoped: list in-transit transfers to this branch ──────────────

export const listBranchInTransitTransfers = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    if (!scope.branchId) return [];

    const transfers = await ctx.db
      .query("transfers")
      .withIndex("by_to_branch", (q) => q.eq("toBranchId", scope.branchId!))
      .collect();

    const inTransit = transfers.filter((t) => t.status === "inTransit");

    const getBranchName = makeBranchNameResolver((id) => ctx.db.get(id));

    const enriched = await Promise.all(
      inTransit.map(async (transfer) => {
        const fromBranchName = await getBranchName(transfer.fromBranchId);
        const toBranchName = await getBranchName(transfer.toBranchId);
        const items = await ctx.db
          .query("transferItems")
          .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
          .collect();
        const boxes = await ctx.db
          .query("transferBoxes")
          .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
          .collect();
        return {
          _id: transfer._id,
          fromBranchName,
          toBranchName,
          itemCount: items.length,
          shippedAt: transfer.shippedAt ?? null,
          createdAt: transfer.createdAt,
          deliveryMode: boxes.length > 0 ? ("box" as const) : ("piece" as const),
          boxCount: boxes.length,
        };
      })
    );

    return enriched.sort((a, b) => a.createdAt - b.createdAt);
  },
});

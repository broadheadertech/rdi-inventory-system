import { query, mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireRole, WAREHOUSE_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";
import { clearReservedOnDelivery } from "../_helpers/transferStock";
import { generateInternalInvoice } from "../_helpers/internalInvoice";

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
    await ctx.db.patch(args.transferId, {
      status: "inTransit",
      shippedAt: now,
      shippedById: user._id,
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "transfer.dispatch",
      userId: user._id,
      entityType: "transfers",
      entityId: args.transferId,
      before: { status: "packed" },
      after: { status: "inTransit", shippedById: user._id },
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
        return {
          _id: transfer._id,
          fromBranchName,
          toBranchName,
          itemCount: items.length,
          shippedAt: transfer.shippedAt ?? null,
          createdAt: transfer.createdAt,
        };
      })
    );

    return enriched.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const getTransferReceivingData = query({
  args: { transferId: v.id("transfers") },
  handler: async (ctx, args) => {
    await requireRole(ctx, WAREHOUSE_ROLES);

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

export const confirmTransferDelivery = mutation({
  args: {
    transferId: v.id("transfers"),
    receivedItems: v.array(
      v.object({
        itemId: v.id("transferItems"),
        receivedQuantity: v.number(),
        damageNotes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, WAREHOUSE_ROLES);

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
    if (transfer.driverId) {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "This transfer is assigned to a driver. The driver must confirm delivery.",
      });
    }

    // Validate quantities
    for (const item of args.receivedItems) {
      if (!Number.isInteger(item.receivedQuantity) || item.receivedQuantity < 0) {
        throw new ConvexError({
          code: "INVALID_ARGUMENT",
          message: "receivedQuantity must be a non-negative integer.",
        });
      }
    }

    // H1 fix: verify item ownership BEFORE patching (learned from 6.2 code review)
    const transferItems = await ctx.db
      .query("transferItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", args.transferId))
      .collect();

    // M3 fix: all items must be represented
    if (args.receivedItems.length !== transferItems.length) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: `Expected ${transferItems.length} items, got ${args.receivedItems.length}.`,
      });
    }

    const validItemIds = new Set(transferItems.map((row) => row._id as string));
    for (const item of args.receivedItems) {
      if (!validItemIds.has(item.itemId as string)) {
        throw new ConvexError({
          code: "INVALID_ARGUMENT",
          message: "One or more items do not belong to this transfer.",
        });
      }
    }

    const now = Date.now();
    const discrepancies: { sku: string; packed: number; received: number; type: string; damageNotes?: string }[] = [];

    const itemById = new Map(transferItems.map((row) => [row._id as string, row]));

    for (const item of args.receivedItems) {
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
            updatedAt: now,
          });
        } else {
          await ctx.db.insert("inventory", {
            branchId: transfer.toBranchId,
            variantId: original.variantId,
            quantity: item.receivedQuantity,
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
      after: { status: "delivered", deliveredById: user._id, type: transfer.type ?? "stockRequest" },
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
  },
});

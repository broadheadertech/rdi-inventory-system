import { query, mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { withBranchScope } from "../_helpers/withBranchScope";
import { HQ_ROLES, BRANCH_MANAGEMENT_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";
import { releaseHeldStock } from "../_helpers/transferStock";
import { internal } from "../_generated/api";

// L2 fix: build the combined role set without duplicating "admin"
const TRANSFER_CREATE_ROLES: readonly string[] = Array.from(
  new Set([...BRANCH_MANAGEMENT_ROLES, ...HQ_ROLES])
);

export const listActiveBranches = query({
  args: {},
  handler: async (ctx) => {
    await withBranchScope(ctx);
    return await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

// Get the active warehouse branch — used by branch transfer form to auto-resolve source/destination
export const getWarehouseBranch = query({
  args: {},
  handler: async (ctx) => {
    await withBranchScope(ctx);
    const all = await ctx.db.query("branches").collect();
    const warehouse = all.find((b) => b.channel === "warehouse" && b.isActive);
    return warehouse ? { _id: warehouse._id, name: warehouse.name } : null;
  },
});

export const createTransferRequest = mutation({
  args: {
    fromBranchId: v.id("branches"),
    toBranchId: v.id("branches"),
    type: v.optional(v.union(v.literal("stockRequest"), v.literal("return"), v.literal("interBranch"))),
    notes: v.optional(v.string()),
    // M3 fix: accept sku string — resolve to variantId inside handler
    items: v.array(
      v.object({
        sku: v.string(),
        requestedQuantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);

    if (!TRANSFER_CREATE_ROLES.includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const transferType = args.type ?? "stockRequest";

    if (args.items.length === 0) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "At least one item is required.",
      });
    }
    for (const item of args.items) {
      if (!Number.isInteger(item.requestedQuantity) || item.requestedQuantity <= 0) {
        // M2 fix: validate positive integer quantity
        throw new ConvexError({
          code: "INVALID_ARGUMENT",
          message: "Requested quantity must be a positive whole number.",
        });
      }
    }
    if (args.fromBranchId === args.toBranchId) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Source and destination branches must be different.",
      });
    }

    const fromBranch = await ctx.db.get(args.fromBranchId);
    if (!fromBranch || !fromBranch.isActive) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Source branch not found or inactive.",
      });
    }
    const toBranch = await ctx.db.get(args.toBranchId);
    if (!toBranch || !toBranch.isActive) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Destination branch not found or inactive.",
      });
    }

    // Direction enforcement for branch users (non-HQ)
    const isHQ = (HQ_ROLES as readonly string[]).includes(scope.user.role);
    if (!isHQ) {
      if (transferType === "stockRequest") {
        // Stock requests: must be FROM warehouse TO retail branch
        if (fromBranch.channel !== "warehouse") {
          throw new ConvexError({
            code: "INVALID_ARGUMENT",
            message: "Stock requests must come from the central warehouse.",
          });
        }
      } else if (transferType === "return") {
        // Returns: must be FROM retail branch TO warehouse
        if (toBranch.channel !== "warehouse") {
          throw new ConvexError({
            code: "INVALID_ARGUMENT",
            message: "Returns must be sent to the central warehouse.",
          });
        }
        // Returns require a reason
        if (!args.notes?.trim()) {
          throw new ConvexError({
            code: "INVALID_ARGUMENT",
            message: "A reason is required for return requests.",
          });
        }
      } else if (transferType === "interBranch") {
        // Inter-branch: must be FROM user's own retail branch TO another retail branch
        if (fromBranch.channel === "warehouse" || toBranch.channel === "warehouse") {
          throw new ConvexError({
            code: "INVALID_ARGUMENT",
            message: "Inter-branch transfers must be between retail branches.",
          });
        }
        if (scope.branchId && scope.branchId !== args.fromBranchId) {
          throw new ConvexError({
            code: "UNAUTHORIZED",
            message: "You can only send from your own branch.",
          });
        }
      }
    }

    // M3 fix: resolve each SKU to a variantId — validates existence + active status
    const resolvedItems: {
      variantId: Id<"variants">;
      requestedQuantity: number;
      inventoryId: Id<"inventory">;
      currentQty: number;
      currentReserved: number;
    }[] = [];
    for (const item of args.items) {
      const sku = item.sku.trim();
      if (!sku) {
        throw new ConvexError({
          code: "INVALID_ARGUMENT",
          message: "SKU cannot be empty.",
        });
      }
      const variant = await ctx.db
        .query("variants")
        .withIndex("by_sku", (q) => q.eq("sku", sku))
        .unique();
      if (!variant || !variant.isActive) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: `SKU not found or inactive: ${sku}`,
        });
      }
      // Validate stock at source branch
      const inventoryRecord = await ctx.db
        .query("inventory")
        .withIndex("by_branch_variant", (q) =>
          q.eq("branchId", args.fromBranchId).eq("variantId", variant._id)
        )
        .unique();
      const available = inventoryRecord?.quantity ?? 0;
      if (item.requestedQuantity > available) {
        throw new ConvexError({
          code: "INSUFFICIENT_STOCK",
          message: `Not enough stock for ${sku}: requested ${item.requestedQuantity}, but only ${available} available at source branch.`,
        });
      }

      resolvedItems.push({
        variantId: variant._id,
        requestedQuantity: item.requestedQuantity,
        inventoryId: inventoryRecord!._id,
        currentQty: available,
        currentReserved: inventoryRecord!.reservedQuantity ?? 0,
      });
    }

    // Hold stock: deduct from quantity, add to reservedQuantity
    for (const item of resolvedItems) {
      await ctx.db.patch(item.inventoryId, {
        quantity: item.currentQty - item.requestedQuantity,
        reservedQuantity: item.currentReserved + item.requestedQuantity,
        updatedAt: Date.now(),
      });

      // FIFO: consume oldest batches at source branch
      let remaining = item.requestedQuantity;
      const batches = await ctx.db
        .query("inventoryBatches")
        .withIndex("by_branch_variant_received", (q) =>
          q.eq("branchId", args.fromBranchId).eq("variantId", item.variantId)
        )
        .collect();

      for (const batch of batches) {
        if (remaining <= 0) break;
        const take = Math.min(batch.quantity, remaining);
        if (take === batch.quantity) {
          await ctx.db.delete(batch._id);
        } else {
          await ctx.db.patch(batch._id, { quantity: batch.quantity - take });
        }
        remaining -= take;
      }
    }

    const now = Date.now();
    const newTransferId = await ctx.db.insert("transfers", {
      fromBranchId: args.fromBranchId,
      toBranchId: args.toBranchId,
      requestedById: scope.userId,
      type: transferType,
      status: "requested",
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    for (const item of resolvedItems) {
      await ctx.db.insert("transferItems", {
        transferId: newTransferId,
        variantId: item.variantId,
        requestedQuantity: item.requestedQuantity,
      });
    }

    await _logAuditEntry(ctx, {
      action: "transfer.create",
      userId: scope.userId,
      branchId: scope.branchId ?? args.toBranchId,
      entityType: "transfers",
      entityId: newTransferId,
      after: {
        fromBranchId: args.fromBranchId,
        toBranchId: args.toBranchId,
        status: "requested",
      },
    });

    await ctx.scheduler.runAfter(0, internal.logistics.notifications._processNotification, {
      type: "transfer_requested",
      transferId: newTransferId,
    });

    return newTransferId;
  },
});

export const listTransfers = query({
  args: {
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);

    let rawTransfers;
    if (scope.branchId === null) {
      // HQ/admin — query all transfers, filter status in memory
      rawTransfers = await ctx.db.query("transfers").collect();
      if (args.status) {
        rawTransfers = rawTransfers.filter(
          (transfer) => transfer.status === args.status
        );
      }
    } else {
      // Branch-scoped: merge from + to indexed queries
      const outgoing = await ctx.db
        .query("transfers")
        .withIndex("by_from_branch", (q) =>
          q.eq("fromBranchId", scope.branchId as Id<"branches">)
        )
        .collect();
      const incoming = await ctx.db
        .query("transfers")
        .withIndex("by_to_branch", (q) =>
          q.eq("toBranchId", scope.branchId as Id<"branches">)
        )
        .collect();

      const seen = new Set<string>();
      const combined = [...outgoing, ...incoming].filter((transfer) => {
        if (seen.has(transfer._id)) return false;
        seen.add(transfer._id);
        return true;
      });

      rawTransfers = args.status
        ? combined.filter((transfer) => transfer.status === args.status)
        : combined;
    }

    // L3 fix: cache branch lookups to avoid fetching the same branch per-transfer
    const branchCache = new Map<Id<"branches">, { name: string; isActive: boolean } | null>();
    async function getBranch(branchId: Id<"branches">) {
      if (branchCache.has(branchId)) return branchCache.get(branchId) ?? null;
      const branch = await ctx.db.get(branchId);
      const result = branch ? { name: branch.name, isActive: branch.isActive } : null;
      branchCache.set(branchId, result);
      return result;
    }

    // Enrich each transfer
    const enriched = await Promise.all(
      rawTransfers.map(async (transfer) => {
        const fromBranch = await getBranch(transfer.fromBranchId);
        const toBranch = await getBranch(transfer.toBranchId);
        const requestor = await ctx.db.get(transfer.requestedById);

        let approverName: string | null = null;
        if (transfer.approvedById) {
          const approver = await ctx.db.get(transfer.approvedById);
          approverName = approver?.name ?? null;
        }

        let rejectorName: string | null = null;
        if (transfer.rejectedById) {
          const rejector = await ctx.db.get(transfer.rejectedById);
          rejectorName = rejector?.name ?? null;
        }

        const items = await ctx.db
          .query("transferItems")
          .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
          .collect();

        const enrichedItems = await Promise.all(
          items.map(async (item) => {
            const variant = await ctx.db.get(item.variantId);
            const style = variant ? await ctx.db.get(variant.styleId) : null;
            return {
              variantId: item.variantId,
              sku: variant?.sku ?? "",
              size: variant?.size ?? "",
              color: variant?.color ?? "",
              styleName: style?.name ?? "Unknown",
              requestedQuantity: item.requestedQuantity,
            };
          })
        );

        return {
          _id: transfer._id,
          fromBranchId: transfer.fromBranchId,
          toBranchId: transfer.toBranchId,
          fromBranchName:
            fromBranch?.isActive ? fromBranch.name : "(inactive)",
          toBranchName:
            toBranch?.isActive ? toBranch.name : "(inactive)",
          requestedById: transfer.requestedById,
          requestorName: requestor?.name ?? "Unknown",
          type: transfer.type ?? "stockRequest",
          status: transfer.status,
          notes: transfer.notes ?? null,
          createdAt: transfer.createdAt,
          updatedAt: transfer.updatedAt,
          approvedById: transfer.approvedById ?? null,
          approvedAt: transfer.approvedAt ?? null,
          approverName,
          rejectedById: transfer.rejectedById ?? null,
          rejectedAt: transfer.rejectedAt ?? null,
          rejectorName,
          rejectedReason: transfer.rejectedReason ?? null,
          items: enrichedItems,
        };
      })
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const approveTransfer = mutation({
  args: {
    transferId: v.id("transfers"),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);

    if (!(HQ_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    }
    if (transfer.status !== "requested") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Only transfers with status 'requested' can be approved.",
      });
    }

    // L1 fix: single Date.now() call for both timestamp fields
    const now = Date.now();
    await ctx.db.patch(args.transferId, {
      status: "approved",
      approvedById: scope.userId,
      approvedAt: now,
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "transfer.approve",
      userId: scope.userId,
      entityType: "transfers",
      entityId: args.transferId,
      before: { status: "requested" },
      after: { status: "approved" },
    });

    await ctx.scheduler.runAfter(0, internal.logistics.notifications._processNotification, {
      type: "transfer_approved",
      transferId: args.transferId,
    });
  },
});

export const rejectTransfer = mutation({
  args: {
    transferId: v.id("transfers"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);

    if (!(HQ_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    if (args.reason.trim().length === 0) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Rejection reason is required.",
      });
    }

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    }
    if (transfer.status !== "requested") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Only transfers with status 'requested' can be rejected.",
      });
    }

    // Release held stock back to available
    await releaseHeldStock(ctx, args.transferId, transfer.fromBranchId);

    // L1 fix: single Date.now() call for both timestamp fields
    const now = Date.now();
    await ctx.db.patch(args.transferId, {
      status: "rejected",
      rejectedById: scope.userId,
      rejectedAt: now,
      rejectedReason: args.reason.trim(),
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "transfer.reject",
      userId: scope.userId,
      entityType: "transfers",
      entityId: args.transferId,
      before: { status: "requested" },
      after: { status: "rejected", reason: args.reason.trim() },
    });

    await ctx.scheduler.runAfter(0, internal.logistics.notifications._processNotification, {
      type: "transfer_rejected",
      transferId: args.transferId,
      extra: { reason: args.reason.trim() },
    });
  },
});


// ─── Cancel Transfer ──────────────────────────────────────────────────────────

export const cancelTransfer = mutation({
  args: {
    transferId: v.id("transfers"),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    }

    // Can only cancel pending transfers — approved transfers are committed
    if (transfer.status !== "requested") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Only pending (requested) transfers can be cancelled. Approved transfers are committed.",
      });
    }

    // Who can cancel: the requestor, admin, or hqStaff
    const isRequestor = scope.userId === transfer.requestedById;
    const isHQ = (HQ_ROLES as readonly string[]).includes(scope.user.role);
    if (!isRequestor && !isHQ) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "You can only cancel your own transfers." });
    }

    // Release held stock back to available
    await releaseHeldStock(ctx, args.transferId, transfer.fromBranchId);

    const now = Date.now();
    await ctx.db.patch(args.transferId, {
      status: "cancelled",
      cancelledById: scope.userId,
      cancelledAt: now,
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "transfer.cancel",
      userId: scope.userId,
      entityType: "transfers",
      entityId: args.transferId,
      before: { status: transfer.status },
      after: { status: "cancelled" },
    });

    await ctx.scheduler.runAfter(0, internal.logistics.notifications._processNotification, {
      type: "transfer_cancelled",
      transferId: args.transferId,
    });
  },
});

// ─── Inter-Branch: Acknowledge (receiving branch accepts) ────────────────────

export const acknowledgeInterBranch = mutation({
  args: { transferId: v.id("transfers") },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    }
    if (transfer.type !== "interBranch") {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Only inter-branch transfers can be acknowledged.",
      });
    }
    if (transfer.status !== "requested") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Only pending transfers can be acknowledged.",
      });
    }

    // Only the receiving branch manager or HQ can acknowledge
    const isHQ = (HQ_ROLES as readonly string[]).includes(scope.user.role);
    const isReceivingBranch = scope.branchId === transfer.toBranchId;
    if (!isHQ && !isReceivingBranch) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Only the receiving branch can acknowledge this transfer.",
      });
    }

    const now = Date.now();
    await ctx.db.patch(args.transferId, {
      status: "approved",  // reuse approved status — means "acknowledged, ready to pack"
      approvedById: scope.userId,
      approvedAt: now,
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "interBranch.acknowledge",
      userId: scope.userId,
      entityType: "transfers",
      entityId: args.transferId,
      before: { status: "requested" },
      after: { status: "approved" },
    });
  },
});

// ─── Inter-Branch: Decline (receiving branch rejects) ────────────────────────

export const declineInterBranch = mutation({
  args: {
    transferId: v.id("transfers"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);

    if (!args.reason.trim()) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "A reason is required when declining.",
      });
    }

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    }
    if (transfer.type !== "interBranch") {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Only inter-branch transfers can be declined.",
      });
    }
    if (transfer.status !== "requested") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Only pending transfers can be declined.",
      });
    }

    // Only the receiving branch manager or HQ can decline
    const isHQ = (HQ_ROLES as readonly string[]).includes(scope.user.role);
    const isReceivingBranch = scope.branchId === transfer.toBranchId;
    if (!isHQ && !isReceivingBranch) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Only the receiving branch can decline this transfer.",
      });
    }

    // Release held stock back to sender
    await releaseHeldStock(ctx, args.transferId, transfer.fromBranchId);

    const now = Date.now();
    await ctx.db.patch(args.transferId, {
      status: "rejected",
      rejectedById: scope.userId,
      rejectedAt: now,
      rejectedReason: args.reason.trim(),
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "interBranch.decline",
      userId: scope.userId,
      entityType: "transfers",
      entityId: args.transferId,
      before: { status: "requested" },
      after: { status: "rejected", reason: args.reason.trim() },
    });
  },
});

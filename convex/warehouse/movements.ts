// convex/warehouse/movements.ts — Stock Movement (Moving In / Out) for the warehouse.
//
// Reuses the existing transfer engine's stock semantics:
//   - createMovement holds source stock (FIFO) and creates the transfer directly
//     in "inTransit" (collapsing request→approve→pack→ship into one dispatch).
//   - Confirmation is the existing transfers.fulfillment.confirmTransferDelivery,
//     which lands stock at the destination and flags shortages/discrepancies.
//
// Direction is derived from the branches:
//   from = warehouse  → Moving Out (stockRequest)
//   to   = warehouse  → Moving In  (return)
//   neither warehouse → branch → branch (interBranch)

import { query, mutation, internalMutation } from "../_generated/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import { requireRole, WAREHOUSE_ROLES } from "../_helpers/permissions";
import { releaseHeldStock } from "../_helpers/transferStock";
import { internal } from "../_generated/api";

// Maintenance: cancel a non-terminal movement and release its held source stock.
// Invoked from the CLI to clean up test/stuck movements.
export const _cancelMovement = internalMutation({
  args: { transferId: v.id("transfers") },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.transferId);
    if (!t) return { ok: false, reason: "not found" };
    if (t.status === "delivered" || t.status === "cancelled" || t.status === "rejected") {
      return { ok: false, reason: `already ${t.status}` };
    }
    await releaseHeldStock(ctx, args.transferId, t.fromBranchId);
    const now = Date.now();
    await ctx.db.patch(args.transferId, {
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

const MOVEMENT_ROLES = [...WAREHOUSE_ROLES, "manager"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveDirection(
  from: Doc<"branches">,
  to: Doc<"branches">
): { direction: "out" | "in" | "branch"; type: "stockRequest" | "return" | "interBranch" } {
  if (from.channel === "warehouse") return { direction: "out", type: "stockRequest" };
  if (to.channel === "warehouse") return { direction: "in", type: "return" };
  return { direction: "branch", type: "interBranch" };
}

async function variantLabel(ctx: QueryCtx | MutationCtx, variantId: Id<"variants">) {
  const variant = await ctx.db.get(variantId);
  if (!variant) return { sku: String(variantId), styleName: "Unknown", size: "", color: "" };
  const style = await ctx.db.get(variant.styleId);
  return {
    sku: variant.sku,
    styleName: style?.name ?? "Unknown",
    size: variant.size,
    color: variant.color,
  };
}

// ─── Branch picker data ─────────────────────────────────────────────────────────

export const listMovementBranches = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, MOVEMENT_ROLES);
    const branches = await ctx.db.query("branches").collect();
    return branches
      .filter((b) => b.isActive)
      .map((b) => ({
        _id: b._id,
        name: b.name,
        isWarehouse: b.channel === "warehouse",
      }));
  },
});

// ─── Variant search (with available stock at a branch) ──────────────────────────

export const searchVariants = query({
  args: { search: v.string(), branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    await requireRole(ctx, MOVEMENT_ROLES);
    const term = args.search.trim().toLowerCase();
    if (term.length < 2) return [];

    const variants = await ctx.db.query("variants").take(2000);
    const matches: Array<{
      variantId: Id<"variants">;
      sku: string;
      styleName: string;
      size: string;
      color: string;
      available: number;
    }> = [];

    for (const variant of variants) {
      if (!variant.isActive) continue;
      const skuMatch = variant.sku.toLowerCase().includes(term);
      const barcodeMatch = variant.barcode?.toLowerCase().includes(term);
      if (!skuMatch && !barcodeMatch) continue;

      let available = 0;
      if (args.branchId) {
        const inv = await ctx.db
          .query("inventory")
          .withIndex("by_branch_variant", (q) =>
            q.eq("branchId", args.branchId!).eq("variantId", variant._id)
          )
          .unique();
        available = inv?.quantity ?? 0;
      }

      const label = await variantLabel(ctx, variant._id);
      matches.push({ variantId: variant._id, ...label, available });
      if (matches.length >= 15) break;
    }
    return matches;
  },
});

// ─── Create + dispatch a movement (status → inTransit) ──────────────────────────

export const createMovement = mutation({
  args: {
    fromBranchId: v.id("branches"),
    toBranchId: v.id("branches"),
    notes: v.optional(v.string()),
    items: v.array(
      v.object({
        variantId: v.id("variants"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, MOVEMENT_ROLES);

    if (args.fromBranchId === args.toBranchId) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Source and destination must be different.",
      });
    }
    if (args.items.length === 0) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Add at least one item.",
      });
    }

    const fromBranch = await ctx.db.get(args.fromBranchId);
    const toBranch = await ctx.db.get(args.toBranchId);
    if (!fromBranch || !fromBranch.isActive) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Source branch not found." });
    }
    if (!toBranch || !toBranch.isActive) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Destination branch not found." });
    }

    const { type } = deriveDirection(fromBranch, toBranch);

    // Merge duplicate variants
    const qtyByVariant = new Map<string, number>();
    for (const item of args.items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new ConvexError({
          code: "INVALID_ARGUMENT",
          message: "Quantities must be positive whole numbers.",
        });
      }
      const key = item.variantId as string;
      qtyByVariant.set(key, (qtyByVariant.get(key) ?? 0) + item.quantity);
    }

    // Validate stock at source (enforce — no negative stock) and hold it (FIFO)
    const resolved: Array<{
      variantId: Id<"variants">;
      quantity: number;
      inventoryId: Id<"inventory">;
      currentQty: number;
      currentReserved: number;
    }> = [];

    for (const [variantId, quantity] of qtyByVariant) {
      const vId = variantId as Id<"variants">;
      const inv = await ctx.db
        .query("inventory")
        .withIndex("by_branch_variant", (q) =>
          q.eq("branchId", args.fromBranchId).eq("variantId", vId)
        )
        .unique();
      const available = inv?.quantity ?? 0;
      if (!inv || quantity > available) {
        const label = await variantLabel(ctx, vId);
        throw new ConvexError({
          code: "INSUFFICIENT_STOCK",
          message: `Not enough stock for ${label.sku}: need ${quantity}, have ${available} at source.`,
        });
      }
      resolved.push({
        variantId: vId,
        quantity,
        inventoryId: inv._id,
        currentQty: available,
        currentReserved: inv.reservedQuantity ?? 0,
      });
    }

    const now = Date.now();

    // Hold stock: quantity → reserved, consume FIFO batches at source
    for (const item of resolved) {
      await ctx.db.patch(item.inventoryId, {
        quantity: item.currentQty - item.quantity,
        reservedQuantity: item.currentReserved + item.quantity,
        updatedAt: now,
      });

      let remaining = item.quantity;
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

    // Create the movement as a Request — it flows through the staged pipeline
    // (Approve → Pack → Assign/Dispatch → Confirm). Source stock is held now.
    const transferId = await ctx.db.insert("transfers", {
      fromBranchId: args.fromBranchId,
      toBranchId: args.toBranchId,
      requestedById: user._id,
      type,
      status: "requested",
      notes: args.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });

    for (const item of resolved) {
      await ctx.db.insert("transferItems", {
        transferId,
        variantId: item.variantId,
        requestedQuantity: item.quantity,
      });
    }

    await ctx.scheduler.runAfter(0, internal.logistics.notifications._processNotification, {
      type: "transfer_requested",
      transferId,
    });

    return transferId;
  },
});

// ─── List warehouse-touching movements ──────────────────────────────────────────

export const listMovements = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, MOVEMENT_ROLES);

    const branches = await ctx.db.query("branches").collect();
    const warehouse = branches.find((b) => b.channel === "warehouse" && b.isActive);
    if (!warehouse) return [];
    const nameById = new Map(branches.map((b) => [b._id as string, b.name]));

    const outgoing = await ctx.db
      .query("transfers")
      .withIndex("by_from_branch", (q) => q.eq("fromBranchId", warehouse._id))
      .collect();
    const incoming = await ctx.db
      .query("transfers")
      .withIndex("by_to_branch", (q) => q.eq("toBranchId", warehouse._id))
      .collect();

    const all = [...outgoing, ...incoming].sort((a, b) => b.createdAt - a.createdAt);

    return await Promise.all(
      all.map(async (t) => {
        const items = await ctx.db
          .query("transferItems")
          .withIndex("by_transfer", (q) => q.eq("transferId", t._id))
          .collect();
        const isOut = t.fromBranchId === warehouse._id;
        const hasDiscrepancy =
          t.status === "delivered" &&
          items.some(
            (i) =>
              (i.receivedQuantity ?? 0) !==
              (i.packedQuantity ?? i.requestedQuantity)
          );
        return {
          _id: t._id,
          direction: isOut ? ("out" as const) : ("in" as const),
          otherBranchName: isOut
            ? nameById.get(t.toBranchId as string) ?? "Unknown"
            : nameById.get(t.fromBranchId as string) ?? "Unknown",
          status: t.status,
          hasDiscrepancy,
          driverAssigned: !!t.driverId,
          lineCount: items.length,
          totalQty: items.reduce((s, i) => s + (i.packedQuantity ?? i.requestedQuantity), 0),
          createdAt: t.createdAt,
        };
      })
    );
  },
});

// ─── Get one movement (detail + confirm view) ──────────────────────────────────

export const getMovement = query({
  args: { transferId: v.id("transfers") },
  handler: async (ctx, args) => {
    await requireRole(ctx, MOVEMENT_ROLES);

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) return null;

    const fromBranch = await ctx.db.get(transfer.fromBranchId);
    const toBranch = await ctx.db.get(transfer.toBranchId);
    const direction =
      fromBranch?.channel === "warehouse"
        ? "out"
        : toBranch?.channel === "warehouse"
          ? "in"
          : "branch";

    const items = await ctx.db
      .query("transferItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", args.transferId))
      .collect();

    const enriched = await Promise.all(
      items.map(async (i) => {
        const label = await variantLabel(ctx, i.variantId);
        return {
          itemId: i._id,
          ...label,
          requestedQuantity: i.requestedQuantity,
          packedQuantity: i.packedQuantity ?? null,
          receivedQuantity: i.receivedQuantity ?? null,
          damageNotes: i.damageNotes ?? null,
        };
      })
    );

    const driver = transfer.driverId ? await ctx.db.get(transfer.driverId) : null;

    return {
      _id: transfer._id,
      direction,
      status: transfer.status,
      fromBranchName: fromBranch?.name ?? "Unknown",
      toBranchName: toBranch?.name ?? "Unknown",
      notes: transfer.notes ?? null,
      // Lifecycle timeline
      createdAt: transfer.createdAt,
      approvedAt: transfer.approvedAt ?? null,
      packedAt: transfer.packedAt ?? null,
      shippedAt: transfer.shippedAt ?? null,
      deliveredAt: transfer.deliveredAt ?? null,
      rejectedReason: transfer.rejectedReason ?? null,
      driverId: transfer.driverId ?? null,
      driverName: driver?.name ?? null,
      items: enriched,
    };
  },
});

import { v, ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { withBranchScope } from "../_helpers/withBranchScope";
import { POS_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";
import { calculateTaxBreakdown } from "../_helpers/taxCalculations";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Get Philippine date info (UTC+8) for receipt number generation.
 */
function getPhilippineDate(): { datePart: string; startOfDayMs: number } {
  const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const phtDate = new Date(nowMs + PHT_OFFSET_MS);
  const year = phtDate.getUTCFullYear();
  const month = String(phtDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(phtDate.getUTCDate()).padStart(2, "0");
  const datePart = `${year}${month}${day}`;
  const startOfDayUTC =
    Date.UTC(year, phtDate.getUTCMonth(), phtDate.getUTCDate()) -
    PHT_OFFSET_MS;
  return { datePart, startOfDayMs: startOfDayUTC };
}

// ─── Create Transaction ─────────────────────────────────────────────────────

export const createTransaction = mutation({
  args: {
    items: v.array(
      v.object({
        variantId: v.id("variants"),
        quantity: v.number(),
        unitPriceCentavos: v.number(),
      })
    ),
    paymentMethod: v.union(
      v.literal("cash"),
      v.literal("gcash"),
      v.literal("maya")
    ),
    discountType: v.union(
      v.literal("senior"),
      v.literal("pwd"),
      v.literal("none")
    ),
    amountTenderedCentavos: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // 1. Auth gate
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }
    const branchId = scope.branchId!;

    // 2. Validate non-empty cart (M1)
    if (args.items.length === 0) {
      throw new ConvexError({
        code: "INVALID_PAYMENT",
        message: "Cart is empty",
      });
    }

    // 3. Validate quantities are positive integers (H3)
    for (const item of args.items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new ConvexError({
          code: "INVALID_PAYMENT",
          message: "Invalid item quantity",
        });
      }
    }

    // 4. Validate cash payment has amount tendered
    if (args.paymentMethod === "cash") {
      if (args.amountTenderedCentavos === undefined) {
        throw new ConvexError({
          code: "INVALID_PAYMENT",
          message: "Cash payment requires amount tendered",
        });
      }
    }

    // 5. Stock validation + authoritative price lookup (H1: NEVER trust client prices)
    const validatedItems: {
      variantId: Id<"variants">;
      quantity: number;
      unitPriceCentavos: number;
      inventoryId: Id<"inventory">;
      inventoryQuantity: number;
    }[] = [];
    const insufficientItems: {
      variantId: string;
      requested: number;
      available: number;
    }[] = [];

    for (const item of args.items) {
      // Look up authoritative price from variants table
      const variant = await ctx.db.get(item.variantId);
      if (!variant || !variant.isActive) {
        throw new ConvexError({
          code: "INVALID_PAYMENT",
          message: "Invalid or inactive product",
        });
      }

      const inventoryRecord = await ctx.db
        .query("inventory")
        .withIndex("by_branch_variant", (q) =>
          q.eq("branchId", branchId).eq("variantId", item.variantId)
        )
        .unique();

      if (!inventoryRecord || inventoryRecord.quantity < item.quantity) {
        insufficientItems.push({
          variantId: item.variantId,
          requested: item.quantity,
          available: inventoryRecord?.quantity ?? 0,
        });
      } else {
        validatedItems.push({
          variantId: item.variantId,
          quantity: item.quantity,
          unitPriceCentavos: variant.priceCentavos,
          inventoryId: inventoryRecord._id,
          inventoryQuantity: inventoryRecord.quantity,
        });
      }
    }

    if (insufficientItems.length > 0) {
      throw new ConvexError({
        code: "INSUFFICIENT_STOCK",
        data: insufficientItems,
      });
    }

    // 6. Server-side tax calculation using AUTHORITATIVE prices (not client values)
    const taxBreakdown = calculateTaxBreakdown(validatedItems, args.discountType);

    // 7. Validate cash sufficiency
    if (
      args.paymentMethod === "cash" &&
      args.amountTenderedCentavos! < taxBreakdown.totalCentavos
    ) {
      throw new ConvexError({
        code: "INVALID_PAYMENT",
        message: "Amount tendered is less than total",
      });
    }

    // 8. Generate receipt number (sequential per branch per day)
    // NOTE (M2): .collect() loads all today's transactions to count them.
    // Convex lacks a native .count() — acceptable for typical branch volumes
    // (~200/day). Consider a counter document if volume exceeds 500+/day.
    const { datePart, startOfDayMs } = getPhilippineDate();
    const todayTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", startOfDayMs)
      )
      .collect();
    const seq = (todayTransactions.length + 1).toString().padStart(4, "0");
    const receiptNumber = `${datePart}-${seq}`;

    // 9. Insert transaction record
    const changeCentavos =
      args.paymentMethod === "cash"
        ? args.amountTenderedCentavos! - taxBreakdown.totalCentavos
        : undefined;

    const transactionId = await ctx.db.insert("transactions", {
      branchId,
      cashierId: scope.userId,
      receiptNumber,
      subtotalCentavos: taxBreakdown.subtotalCentavos,
      vatAmountCentavos: taxBreakdown.vatAmountCentavos,
      discountAmountCentavos: taxBreakdown.discountAmountCentavos,
      totalCentavos: taxBreakdown.totalCentavos,
      paymentMethod: args.paymentMethod,
      discountType: args.discountType,
      amountTenderedCentavos:
        args.paymentMethod === "cash"
          ? args.amountTenderedCentavos
          : undefined,
      changeCentavos,
      isOffline: false,
      createdAt: Date.now(),
    });

    // 10. Insert transaction items (using SERVER-validated prices)
    for (const vi of validatedItems) {
      await ctx.db.insert("transactionItems", {
        transactionId,
        variantId: vi.variantId,
        quantity: vi.quantity,
        unitPriceCentavos: vi.unitPriceCentavos,
        lineTotalCentavos: vi.unitPriceCentavos * vi.quantity,
      });
    }

    // 11. Decrement inventory + FIFO batch consumption
    for (const vi of validatedItems) {
      await ctx.db.patch(vi.inventoryId, {
        quantity: vi.inventoryQuantity - vi.quantity,
        updatedAt: Date.now(),
      });
      // Non-blocking: alert check runs in a separate transaction after this one commits
      await ctx.scheduler.runAfter(0, internal.inventory.alerts.checkInventoryAlert, {
        inventoryId: vi.inventoryId,
      });

      // FIFO: consume oldest batches first
      let remaining = vi.quantity;
      const batches = await ctx.db
        .query("inventoryBatches")
        .withIndex("by_branch_variant_received", (q) =>
          q.eq("branchId", branchId).eq("variantId", vi.variantId)
        )
        .collect(); // Ascending by receivedAt = oldest first

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

    // 12. Audit log
    await _logAuditEntry(ctx, {
      action: "transaction.create",
      userId: scope.userId,
      branchId,
      entityType: "transactions",
      entityId: transactionId,
      after: {
        receiptNumber,
        totalCentavos: taxBreakdown.totalCentavos,
        paymentMethod: args.paymentMethod,
        itemCount: args.items.length,
      },
    });

    // 13. Return result
    return {
      transactionId,
      receiptNumber,
      totalCentavos: taxBreakdown.totalCentavos,
      changeCentavos: changeCentavos ?? 0,
    };
  },
});

import { v, ConvexError } from "convex/values";
import { query, mutation } from "../_generated/server";
import { withBranchScope } from "../_helpers/withBranchScope";
import { POS_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

// ─── Return reasons ─────────────────────────────────────────────────────────

const RETURN_REASONS = [
  "wrong_size",
  "defective",
  "changed_mind",
  "other",
] as const;

const returnReasonValidator = v.union(
  v.literal("wrong_size"),
  v.literal("defective"),
  v.literal("changed_mind"),
  v.literal("other")
);

// ─── lookupTransaction ──────────────────────────────────────────────────────
// Find a transaction by receipt number and return it with items + product details.

export const lookupTransaction = query({
  args: {
    receiptNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const trimmed = args.receiptNumber.trim();
    if (!trimmed) return null;

    // Look up transaction by receipt number
    const transaction = await ctx.db
      .query("transactions")
      .withIndex("by_receiptNumber", (q) => q.eq("receiptNumber", trimmed))
      .first();

    if (!transaction) return null;

    // Branch-scope check: cashier can only look up receipts from their own branch
    if (scope.branchId && transaction.branchId !== scope.branchId) {
      return null;
    }

    // Return transactions (negative totals) cannot themselves be returned
    if (transaction.totalCentavos < 0) return null;

    // Fetch transaction items with product details
    const items = await ctx.db
      .query("transactionItems")
      .withIndex("by_transaction", (q) =>
        q.eq("transactionId", transaction._id)
      )
      .collect();

    const enrichedItems = [];
    for (const item of items) {
      const variant = await ctx.db.get(item.variantId);
      let styleName = "Unknown Product";
      let size = "";
      let color = "";
      let sku = "";

      if (variant) {
        size = variant.size;
        color = variant.color;
        sku = variant.sku;
        const style = await ctx.db.get(variant.styleId);
        if (style) {
          styleName = style.name;
        }
      }

      enrichedItems.push({
        _id: item._id,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPriceCentavos: item.unitPriceCentavos,
        lineTotalCentavos: item.lineTotalCentavos,
        styleName,
        size,
        color,
        sku,
      });
    }

    // Check if any returns have already been processed against this transaction
    // by looking for return transactions that reference this receipt number
    const existingReturns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", transaction.branchId)
      )
      .filter((q) =>
        q.and(
          q.lt(q.field("totalCentavos"), 0),
          q.eq(
            q.field("receiptNumber"),
            `RET-${transaction.receiptNumber}`
          )
        )
      )
      .collect();

    // Sum up already-returned quantities per variant
    const returnedQuantities: Record<string, number> = {};
    for (const ret of existingReturns) {
      const retItems = await ctx.db
        .query("transactionItems")
        .withIndex("by_transaction", (q) => q.eq("transactionId", ret._id))
        .collect();
      for (const ri of retItems) {
        const key = ri.variantId as string;
        returnedQuantities[key] =
          (returnedQuantities[key] ?? 0) + Math.abs(ri.quantity);
      }
    }

    return {
      _id: transaction._id,
      receiptNumber: transaction.receiptNumber,
      branchId: transaction.branchId,
      totalCentavos: transaction.totalCentavos,
      paymentMethod: transaction.paymentMethod,
      discountType: transaction.discountType,
      createdAt: transaction.createdAt,
      items: enrichedItems,
      returnedQuantities,
    };
  },
});

// ─── processReturn ──────────────────────────────────────────────────────────
// Process a return/exchange for selected items from a transaction.

export const processReturn = mutation({
  args: {
    transactionId: v.id("transactions"),
    returnItems: v.array(
      v.object({
        variantId: v.id("variants"),
        quantity: v.number(),
        reason: returnReasonValidator,
      })
    ),
    returnType: v.union(v.literal("refund"), v.literal("exchange")),
    // For exchange: replacement items to add
    exchangeItems: v.optional(
      v.array(
        v.object({
          variantId: v.id("variants"),
          quantity: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    // 1. Auth gate
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }
    const branchId = scope.branchId!;

    // 2. Require active shift
    const shift = await ctx.db
      .query("cashierShifts")
      .withIndex("by_cashier_status", (q) =>
        q.eq("cashierId", scope.userId).eq("status", "open")
      )
      .first();

    if (!shift) {
      throw new ConvexError({
        code: "NO_ACTIVE_SHIFT",
        message: "You must have an active shift to process returns.",
      });
    }

    // 3. Validate original transaction
    const originalTx = await ctx.db.get(args.transactionId);
    if (!originalTx) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Original transaction not found.",
      });
    }

    // Branch isolation
    if (originalTx.branchId !== branchId) {
      throw new ConvexError({
        code: "BRANCH_MISMATCH",
        message: "Transaction belongs to a different branch.",
      });
    }

    // Cannot return a return transaction
    if (originalTx.totalCentavos < 0) {
      throw new ConvexError({
        code: "INVALID_RETURN",
        message: "Cannot process return on a return transaction.",
      });
    }

    // 4. Validate return items
    if (args.returnItems.length === 0) {
      throw new ConvexError({
        code: "INVALID_RETURN",
        message: "No items selected for return.",
      });
    }

    // Fetch original transaction items
    const originalItems = await ctx.db
      .query("transactionItems")
      .withIndex("by_transaction", (q) =>
        q.eq("transactionId", args.transactionId)
      )
      .collect();

    const originalItemMap = new Map(
      originalItems.map((item) => [item.variantId as string, item])
    );

    // Check existing returns for this transaction
    const existingReturns = await ctx.db
      .query("transactions")
      .withIndex("by_receiptNumber", (q) =>
        q.eq("receiptNumber", `RET-${originalTx.receiptNumber}`)
      )
      .collect();

    const alreadyReturnedQty: Record<string, number> = {};
    for (const ret of existingReturns) {
      const retItems = await ctx.db
        .query("transactionItems")
        .withIndex("by_transaction", (q) => q.eq("transactionId", ret._id))
        .collect();
      for (const ri of retItems) {
        const key = ri.variantId as string;
        alreadyReturnedQty[key] =
          (alreadyReturnedQty[key] ?? 0) + Math.abs(ri.quantity);
      }
    }

    // Validate each return item
    let refundTotalCentavos = 0;
    const validatedReturnItems: {
      variantId: typeof args.returnItems[number]["variantId"];
      quantity: number;
      unitPriceCentavos: number;
      reason: typeof args.returnItems[number]["reason"];
    }[] = [];

    for (const returnItem of args.returnItems) {
      if (!Number.isInteger(returnItem.quantity) || returnItem.quantity <= 0) {
        throw new ConvexError({
          code: "INVALID_RETURN",
          message: "Return quantity must be a positive integer.",
        });
      }

      const originalItem = originalItemMap.get(returnItem.variantId as string);
      if (!originalItem) {
        throw new ConvexError({
          code: "INVALID_RETURN",
          message: "Item not found in original transaction.",
        });
      }

      const alreadyReturned =
        alreadyReturnedQty[returnItem.variantId as string] ?? 0;
      const maxReturnable = originalItem.quantity - alreadyReturned;

      if (returnItem.quantity > maxReturnable) {
        throw new ConvexError({
          code: "INVALID_RETURN",
          message: `Cannot return more than ${maxReturnable} units of this item (${alreadyReturned} already returned).`,
        });
      }

      const lineRefund = originalItem.unitPriceCentavos * returnItem.quantity;
      refundTotalCentavos += lineRefund;

      validatedReturnItems.push({
        variantId: returnItem.variantId,
        quantity: returnItem.quantity,
        unitPriceCentavos: originalItem.unitPriceCentavos,
        reason: returnItem.reason,
      });
    }

    // 5. For exchange: validate replacement items and compute their total
    let exchangeTotalCentavos = 0;
    const validatedExchangeItems: {
      variantId: typeof args.returnItems[number]["variantId"];
      quantity: number;
      unitPriceCentavos: number;
      inventoryId: string;
      inventoryQty: number;
    }[] = [];

    if (args.returnType === "exchange" && args.exchangeItems) {
      for (const exchangeItem of args.exchangeItems) {
        if (
          !Number.isInteger(exchangeItem.quantity) ||
          exchangeItem.quantity <= 0
        ) {
          throw new ConvexError({
            code: "INVALID_RETURN",
            message: "Exchange quantity must be a positive integer.",
          });
        }

        const variant = await ctx.db.get(exchangeItem.variantId);
        if (!variant || !variant.isActive) {
          throw new ConvexError({
            code: "INVALID_RETURN",
            message: "Exchange item not found or inactive.",
          });
        }

        const inventoryRecord = await ctx.db
          .query("inventory")
          .withIndex("by_branch_variant", (q) =>
            q.eq("branchId", branchId).eq("variantId", exchangeItem.variantId)
          )
          .unique();

        if (
          !inventoryRecord ||
          inventoryRecord.quantity < exchangeItem.quantity
        ) {
          throw new ConvexError({
            code: "INSUFFICIENT_STOCK",
            message: `Insufficient stock for exchange item ${variant.sku}.`,
          });
        }

        const lineTotal = variant.priceCentavos * exchangeItem.quantity;
        exchangeTotalCentavos += lineTotal;

        validatedExchangeItems.push({
          variantId: exchangeItem.variantId,
          quantity: exchangeItem.quantity,
          unitPriceCentavos: variant.priceCentavos,
          inventoryId: inventoryRecord._id as string,
          inventoryQty: inventoryRecord.quantity,
        });
      }
    }

    // 6. Create return transaction (negative amounts)
    // Net amount: negative for refund, difference for exchange
    const netAmountCentavos =
      args.returnType === "exchange"
        ? exchangeTotalCentavos - refundTotalCentavos
        : -refundTotalCentavos;

    const receiptNumber = `RET-${originalTx.receiptNumber}`;

    const returnTxId = await ctx.db.insert("transactions", {
      branchId,
      cashierId: scope.userId,
      receiptNumber,
      subtotalCentavos: -refundTotalCentavos,
      vatAmountCentavos: 0,
      discountAmountCentavos: 0,
      totalCentavos: netAmountCentavos,
      paymentMethod: originalTx.paymentMethod,
      discountType: "none",
      isOffline: false,
      createdAt: Date.now(),
    });

    // 7. Insert return items (negative quantities)
    for (const ri of validatedReturnItems) {
      await ctx.db.insert("transactionItems", {
        transactionId: returnTxId,
        variantId: ri.variantId,
        quantity: -ri.quantity,
        unitPriceCentavos: ri.unitPriceCentavos,
        lineTotalCentavos: -(ri.unitPriceCentavos * ri.quantity),
      });
    }

    // 8. Insert exchange items (positive quantities) if exchange
    if (args.returnType === "exchange") {
      for (const ei of validatedExchangeItems) {
        await ctx.db.insert("transactionItems", {
          transactionId: returnTxId,
          variantId: ei.variantId,
          quantity: ei.quantity,
          unitPriceCentavos: ei.unitPriceCentavos,
          lineTotalCentavos: ei.unitPriceCentavos * ei.quantity,
        });
      }
    }

    // 9. Update inventory — add returned items back to branch stock
    for (const ri of validatedReturnItems) {
      const inventoryRecord = await ctx.db
        .query("inventory")
        .withIndex("by_branch_variant", (q) =>
          q.eq("branchId", branchId).eq("variantId", ri.variantId)
        )
        .unique();

      if (inventoryRecord) {
        await ctx.db.patch(inventoryRecord._id, {
          quantity: inventoryRecord.quantity + ri.quantity,
          updatedAt: Date.now(),
        });
      } else {
        // Create inventory record if it doesn't exist (edge case)
        await ctx.db.insert("inventory", {
          branchId,
          variantId: ri.variantId,
          quantity: ri.quantity,
          updatedAt: Date.now(),
        });
      }
    }

    // 10. For exchange: decrement inventory for new items
    if (args.returnType === "exchange") {
      for (const ei of validatedExchangeItems) {
        await ctx.db.patch(ei.inventoryId as any, {
          quantity: ei.inventoryQty - ei.quantity,
          updatedAt: Date.now(),
        });
      }
    }

    // 11. Audit log
    await _logAuditEntry(ctx, {
      action: "transaction.return",
      userId: scope.userId,
      branchId,
      entityType: "transactions",
      entityId: returnTxId,
      after: {
        originalReceiptNumber: originalTx.receiptNumber,
        returnReceiptNumber: receiptNumber,
        returnType: args.returnType,
        refundTotalCentavos,
        exchangeTotalCentavos:
          args.returnType === "exchange" ? exchangeTotalCentavos : 0,
        netAmountCentavos,
        itemCount: validatedReturnItems.length,
        reasons: validatedReturnItems.map((ri) => ri.reason),
      },
    });

    return {
      returnTransactionId: returnTxId,
      receiptNumber,
      refundTotalCentavos,
      exchangeTotalCentavos:
        args.returnType === "exchange" ? exchangeTotalCentavos : 0,
      netAmountCentavos,
    };
  },
});

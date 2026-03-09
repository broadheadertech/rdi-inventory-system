import { v, ConvexError } from "convex/values";
import { query, mutation } from "../_generated/server";
import { withBranchScope } from "../_helpers/withBranchScope";
import { POS_ROLES } from "../_helpers/permissions";

// ─── Get Receipt Data ───────────────────────────────────────────────────────

export const getReceiptData = query({
  args: {
    transactionId: v.id("transactions"),
  },
  handler: async (ctx, args) => {
    // 1. Auth gate — same pattern as convex/pos/transactions.ts
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    // 2. Load transaction record
    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Transaction not found",
      });
    }

    // 3. Branch isolation — verify transaction belongs to user's branch
    if (!scope.canAccessAllBranches && transaction.branchId !== scope.branchId) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    // 4. Load transaction items with variant/style enrichment
    const transactionItems = await ctx.db
      .query("transactionItems")
      .withIndex("by_transaction", (q) =>
        q.eq("transactionId", args.transactionId)
      )
      .collect();

    const enrichedItems = await Promise.all(
      transactionItems.map(async (item) => {
        const variant = await ctx.db.get(item.variantId);
        const style = variant ? await ctx.db.get(variant.styleId) : null;

        return {
          styleName: style?.name ?? "Unknown Product",
          sku: variant?.sku ?? "",
          size: variant?.size ?? "",
          color: variant?.color ?? "",
          quantity: item.quantity,
          unitPriceCentavos: item.unitPriceCentavos,
          lineTotalCentavos: item.lineTotalCentavos,
        };
      })
    );

    // 5. Load branch info
    const branch = await ctx.db.get(transaction.branchId);

    // 6. Load business settings (graceful defaults if not set)
    const businessNameSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "businessName"))
      .unique();
    const tinSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "tin"))
      .unique();
    const businessAddressSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "businessAddress"))
      .unique();

    // 7. Load cashier name
    const cashier = await ctx.db.get(transaction.cashierId);

    // 8. Load promotion name if applied
    let promoName: string | null = null;
    if (transaction.promotionId) {
      const promo = await ctx.db.get(transaction.promotionId);
      promoName = promo?.name ?? null;
    }

    // 9. Return structured receipt data
    return {
      transaction: {
        receiptNumber: transaction.receiptNumber,
        createdAt: transaction.createdAt,
        subtotalCentavos: transaction.subtotalCentavos,
        vatAmountCentavos: transaction.vatAmountCentavos,
        discountAmountCentavos: transaction.discountAmountCentavos,
        promoDiscountAmountCentavos: transaction.promoDiscountAmountCentavos ?? 0,
        promoName,
        totalCentavos: transaction.totalCentavos,
        paymentMethod: transaction.paymentMethod,
        discountType: transaction.discountType ?? "none",
        amountTenderedCentavos: transaction.amountTenderedCentavos,
        changeCentavos: transaction.changeCentavos,
        splitPayment: transaction.splitPayment ?? null,
      },
      items: enrichedItems,
      branch: {
        name: branch?.name ?? "",
        address: branch?.address ?? "",
      },
      business: {
        name: businessNameSetting?.value ?? "RedBox Apparel",
        tin: tinSetting?.value ?? "",
      },
      businessAddress:
        businessAddressSetting?.value ?? branch?.address ?? "",
      cashierName: cashier?.name ?? "Unknown",
    };
  },
});

// ─── Send Digital Receipt ─────────────────────────────────────────────────

export const sendDigitalReceipt = mutation({
  args: {
    transactionId: v.id("transactions"),
    type: v.union(v.literal("email"), v.literal("sms")),
    destination: v.string(),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transaction not found" });
    }

    if (!scope.canAccessAllBranches && transaction.branchId !== scope.branchId) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    // Duplicate check — prevent sending to the same destination+type twice
    const existing = await ctx.db
      .query("digitalReceipts")
      .withIndex("by_transaction", (q) =>
        q.eq("transactionId", args.transactionId)
      )
      .collect();

    const isDuplicate = existing.some(
      (r) => r.type === args.type && r.destination === args.destination
    );
    if (isDuplicate) {
      throw new ConvexError({
        code: "DUPLICATE",
        message: `Receipt already sent via ${args.type} to ${args.destination}`,
      });
    }

    await ctx.db.insert("digitalReceipts", {
      transactionId: args.transactionId,
      type: args.type,
      destination: args.destination,
      sentAt: Date.now(),
    });

    return { success: true };
  },
});

// ─── Get Receipt History ──────────────────────────────────────────────────

export const getReceiptHistory = query({
  args: {
    transactionId: v.id("transactions"),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transaction not found" });
    }

    if (!scope.canAccessAllBranches && transaction.branchId !== scope.branchId) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const receipts = await ctx.db
      .query("digitalReceipts")
      .withIndex("by_transaction", (q) =>
        q.eq("transactionId", args.transactionId)
      )
      .collect();

    return receipts;
  },
});

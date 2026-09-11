import { query } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";

/** The offer as a customer reads it, e.g. "20% OFF your highest-priced item". */
function describeDiscount(promo: Doc<"promotions">): string {
  const onHighest =
    promo.discountApplication === "highestItem" ? " your highest-priced item" : "";
  if (promo.promoType === "percentage" && promo.percentageValue) {
    return `${promo.percentageValue}% OFF${onHighest}`;
  }
  if (promo.promoType === "fixedAmount" && promo.fixedAmountCentavos) {
    const amount = (promo.fixedAmountCentavos / 100).toLocaleString("en-PH");
    return `₱${amount} OFF${onHighest}`;
  }
  if (promo.promoType === "buyXGetY") {
    return `Buy ${promo.buyQuantity ?? 0} Get ${promo.getQuantity ?? 0}`;
  }
  if (promo.promoType === "tiered" && promo.tieredDiscountCentavos) {
    const amount = (promo.tieredDiscountCentavos / 100).toLocaleString("en-PH");
    return `₱${amount} OFF`;
  }
  return "";
}

// ─── Get Available Vouchers (Public) ─────────────────────────────────────────
// Returns active vouchers with masked codes and linked promotion details.

export const getAvailableVouchers = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const allVouchers = await ctx.db.query("vouchers").collect();

    const activeVouchers = allVouchers.filter(
      (v) =>
        v.isActive &&
        v.startDate <= now &&
        (!v.endDate || v.endDate >= now) &&
        (!v.usageLimit || v.usedCount < v.usageLimit)
    );

    // Resolve promotions for each voucher
    const results = await Promise.all(
      activeVouchers.map(async (voucher) => {
        const promo = await ctx.db.get(voucher.promotionId);
        if (!promo || !promo.isActive) return null;

        const discountDescription = describeDiscount(promo);

        // Mask the code: show first 4 chars, mask the rest
        const code = voucher.code;
        const maskedCode =
          code.length > 4
            ? code.slice(0, 4) + "****"
            : code + "****";

        return {
          _id: voucher._id,
          maskedCode,
          promoName: promo.name,
          promoType: promo.promoType,
          discountDescription,
          percentageValue: promo.percentageValue,
          fixedAmountCentavos: promo.fixedAmountCentavos,
          minOrderCentavos: voucher.minOrderCentavos,
          endDate: voucher.endDate,
        };
      })
    );

    return results.filter((r) => r !== null);
  },
});

// ─── Collect Voucher (Requires Auth) ─────────────────────────────────────────
// Returns the full unmasked voucher code for the customer to copy.

export const collectVoucher = query({
  args: { voucherId: v.id("vouchers") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!customer) throw new ConvexError("Customer profile not found.");

    const voucher = await ctx.db.get(args.voucherId);
    if (!voucher) throw new ConvexError("Voucher not found.");

    const now = Date.now();
    if (
      !voucher.isActive ||
      voucher.startDate > now ||
      (voucher.endDate && voucher.endDate < now)
    ) {
      throw new ConvexError("This voucher is no longer available.");
    }

    if (voucher.usageLimit && voucher.usedCount >= voucher.usageLimit) {
      throw new ConvexError("This voucher has reached its usage limit.");
    }

    // Check per-customer limit
    if (voucher.perCustomerLimit) {
      const redemptions = await ctx.db
        .query("voucherRedemptions")
        .withIndex("by_customer_voucher", (q) =>
          q.eq("customerId", customer._id).eq("voucherId", voucher._id)
        )
        .collect();

      if (redemptions.length >= voucher.perCustomerLimit) {
        throw new ConvexError("You have already used this voucher the maximum number of times.");
      }
    }

    // Resolve promotion for display
    const promo = await ctx.db.get(voucher.promotionId);

    const discountDescription = promo ? describeDiscount(promo) : "";

    return {
      code: voucher.code,
      promoName: promo?.name ?? "Promotion",
      discountDescription,
      minOrderCentavos: voucher.minOrderCentavos,
      endDate: voucher.endDate,
    };
  },
});

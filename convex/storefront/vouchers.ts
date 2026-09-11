import { query, type QueryCtx, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  calculatePromoDiscount,
  type CartItemForPromo,
  type PromoInput,
} from "../_helpers/promoCalculations";

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

// ─── Redeeming a voucher online ───────────────────────────────────────────────

type OrderLine = {
  variantId: Id<"variants">;
  quantity: number;
  unitPriceCentavos: number;
};

type VoucherResult =
  | {
      ok: true;
      voucher: Doc<"vouchers">;
      promotion: Doc<"promotions">;
      discountCentavos: number;
      description: string;
    }
  | { ok: false; reason: string };

function peso(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

/** The voucher a customer typed — as typed, or upper-cased, since codes are shared by word of mouth. */
async function findVoucher(ctx: QueryCtx | MutationCtx, code: string) {
  const typed = code.trim();
  if (!typed) return null;
  for (const candidate of new Set([typed, typed.toUpperCase()])) {
    const voucher = await ctx.db
      .query("vouchers")
      .withIndex("by_code", (q) => q.eq("code", candidate))
      .first();
    if (voucher) return voucher;
  }
  return null;
}

/** A promotion as the shared calculator reads it — the same calculation the POS uses. */
function toPromoInput(p: Doc<"promotions">): PromoInput {
  return {
    name: p.name,
    promoType: p.promoType,
    percentageValue: p.percentageValue,
    maxDiscountCentavos: p.maxDiscountCentavos,
    fixedAmountCentavos: p.fixedAmountCentavos,
    buyQuantity: p.buyQuantity,
    getQuantity: p.getQuantity,
    minSpendCentavos: p.minSpendCentavos,
    tieredDiscountCentavos: p.tieredDiscountCentavos,
    discountApplication: p.discountApplication,
    brandIds: p.brandIds.map(String),
    categoryIds: p.categoryIds.map(String),
    variantIds: p.variantIds.map(String),
    styleIds: (p.styleIds ?? []).map(String),
    genders: p.genders ?? [],
    colors: p.colors ?? [],
    sizes: p.sizes ?? [],
    agingTiers: p.agingTiers ?? [],
    crossSellRewardType: p.crossSellRewardType,
    rewardBrandIds: (p.rewardBrandIds ?? []).map(String),
    rewardCategoryIds: (p.rewardCategoryIds ?? []).map(String),
    rewardStyleIds: (p.rewardStyleIds ?? []).map(String),
    rewardVariantIds: (p.rewardVariantIds ?? []).map(String),
    pwpTriggerMinQuantity: p.pwpTriggerMinQuantity,
    pwpRewardVariantIds: (p.pwpRewardVariantIds ?? []).map(String),
    pwpRewardPriceCentavos: p.pwpRewardPriceCentavos,
  };
}

/** Order lines with the brand, category and attributes a promotion's scope is written in. */
async function promoItems(
  ctx: QueryCtx | MutationCtx,
  lines: OrderLine[]
): Promise<CartItemForPromo[]> {
  const categoryBrand = new Map<string, string>();
  const items: CartItemForPromo[] = [];
  for (const line of lines) {
    const variant = await ctx.db.get(line.variantId);
    if (!variant) continue;
    const style = await ctx.db.get(variant.styleId);
    if (!style) continue;

    // Brand: the style's own, or — for older styles — its category's.
    const categoryId = String(style.categoryId ?? "");
    let brandId = style.brandId ? String(style.brandId) : categoryBrand.get(categoryId);
    if (!brandId && style.categoryId) {
      const category = await ctx.db.get(style.categoryId);
      if (category) {
        brandId = String(category.brandId);
        categoryBrand.set(categoryId, brandId);
      }
    }

    items.push({
      variantId: String(line.variantId),
      brandId: brandId ?? "",
      categoryId,
      styleId: String(variant.styleId),
      gender: variant.gender ?? "",
      color: variant.color,
      sizeGroup: variant.sizeGroup ?? "",
      size: variant.size,
      unitPriceCentavos: line.unitPriceCentavos,
      quantity: line.quantity,
    });
  }
  return items;
}

/**
 * What a voucher code takes off an online order, or why it can't be used.
 *
 * The voucher's own limits — dates, total uses, uses per customer, minimum
 * spend — and its promotion's — active, dates, product scope, discount rule —
 * both apply. Branch scope is a store-floor rule and does not apply online;
 * a promotion limited to aged stock never matches, since an online line has no
 * store stock to age.
 */
export async function evaluateVoucher(
  ctx: QueryCtx | MutationCtx,
  args: { code: string; customerId: Id<"customers">; lines: OrderLine[] }
): Promise<VoucherResult> {
  const voucher = await findVoucher(ctx, args.code);
  if (!voucher) return { ok: false, reason: "That voucher code doesn't exist." };

  const now = Date.now();
  if (
    !voucher.isActive ||
    voucher.startDate > now ||
    (voucher.endDate !== undefined && voucher.endDate < now)
  ) {
    return { ok: false, reason: "This voucher is not available right now." };
  }
  if (voucher.usageLimit && voucher.usedCount >= voucher.usageLimit) {
    return { ok: false, reason: "This voucher has been fully redeemed." };
  }
  if (voucher.perCustomerLimit) {
    const used = await ctx.db
      .query("voucherRedemptions")
      .withIndex("by_customer_voucher", (q) =>
        q.eq("customerId", args.customerId).eq("voucherId", voucher._id)
      )
      .collect();
    if (used.length >= voucher.perCustomerLimit) {
      return { ok: false, reason: "You've already used this voucher the maximum number of times." };
    }
  }

  const subtotal = args.lines.reduce((s, l) => s + l.unitPriceCentavos * l.quantity, 0);
  if (voucher.minOrderCentavos && subtotal < voucher.minOrderCentavos) {
    return { ok: false, reason: `Spend at least ${peso(voucher.minOrderCentavos)} to use this voucher.` };
  }

  const promotion = await ctx.db.get(voucher.promotionId);
  if (
    !promotion ||
    !promotion.isActive ||
    promotion.startDate > now ||
    (promotion.endDate !== undefined && promotion.endDate < now)
  ) {
    return { ok: false, reason: "The promotion behind this voucher has ended." };
  }

  const result = calculatePromoDiscount(await promoItems(ctx, args.lines), toPromoInput(promotion));
  if (!result.applicable || result.discountCentavos <= 0) {
    return { ok: false, reason: "This voucher doesn't apply to the items in your bag." };
  }

  return {
    ok: true,
    voucher,
    promotion,
    discountCentavos: Math.min(result.discountCentavos, subtotal),
    description: result.description,
  };
}

/** Records a voucher used on an order: a redemption row and one more use. */
export async function redeemVoucher(
  ctx: MutationCtx,
  voucher: Doc<"vouchers">,
  customerId: Id<"customers">,
  orderId: Id<"orders">
): Promise<void> {
  await ctx.db.insert("voucherRedemptions", {
    voucherId: voucher._id,
    customerId,
    orderId,
    redeemedAt: Date.now(),
  });
  await ctx.db.patch(voucher._id, { usedCount: voucher.usedCount + 1 });
}

/** Gives a cancelled order's voucher back: its redemption goes and the use is returned. */
export async function releaseVoucherForOrder(
  ctx: MutationCtx,
  order: Doc<"orders">
): Promise<void> {
  const code = order.voucherCode;
  if (!code) return;
  const voucher = await ctx.db
    .query("vouchers")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
  if (!voucher) return;

  const redemptions = await ctx.db
    .query("voucherRedemptions")
    .withIndex("by_customer_voucher", (q) =>
      q.eq("customerId", order.customerId).eq("voucherId", voucher._id)
    )
    .collect();
  const redemption = redemptions.find((r) => r.orderId === order._id);
  if (!redemption) return;

  await ctx.db.delete(redemption._id);
  await ctx.db.patch(voucher._id, { usedCount: Math.max(0, voucher.usedCount - 1) });
}

// ─── Preview a voucher at checkout ────────────────────────────────────────────
// Checked against the customer's bag as it is now, so the discount shown is the
// one createOrder will apply — it checks again when the order is placed.

export const previewVoucher = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { ok: false as const, reason: "Sign in to use a voucher." };

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!customer) return { ok: false as const, reason: "Customer profile not found." };

    const cart = await ctx.db
      .query("carts")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .unique();
    const cartItems = cart
      ? await ctx.db
          .query("cartItems")
          .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
          .collect()
      : [];

    // Priced as createOrder prices them: from the catalogue, never the client.
    const lines: OrderLine[] = [];
    for (const ci of cartItems) {
      const variant = await ctx.db.get(ci.variantId);
      if (!variant || !variant.isActive) continue;
      lines.push({
        variantId: ci.variantId,
        quantity: ci.quantity,
        unitPriceCentavos: variant.priceCentavos,
      });
    }
    if (lines.length === 0) return { ok: false as const, reason: "Your bag is empty." };

    const result = await evaluateVoucher(ctx, {
      code: args.code,
      customerId: customer._id,
      lines,
    });
    return result.ok
      ? {
          ok: true as const,
          code: result.voucher.code,
          discountCentavos: result.discountCentavos,
          description: result.description,
        }
      : { ok: false as const, reason: result.reason };
  },
});

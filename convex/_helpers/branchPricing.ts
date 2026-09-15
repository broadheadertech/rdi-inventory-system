// convex/_helpers/branchPricing.ts — the price a branch sells at.
//
// Every variant has a base price (variants.priceCentavos). A branch sells at
// its own price when it has one in branchPrices, and at the base price
// otherwise. The online store is a branch like any other: the one on the
// "online" channel. Anything that shows or charges a price for a branch goes
// through here, so a branch price can't be shown in one place and missed in
// another.

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

/** The active branch that serves the online store, if there is one. */
export async function onlineBranchId(ctx: Ctx): Promise<Id<"branches"> | null> {
  const branch = await ctx.db
    .query("branches")
    .filter((q) => q.and(q.eq(q.field("channel"), "online"), q.eq(q.field("isActive"), true)))
    .first();
  return branch?._id ?? null;
}

/** The branch's own price row for a variant, if it has one. */
export async function branchPriceRow(
  ctx: Ctx,
  branchId: Id<"branches">,
  variantId: Id<"variants">
): Promise<Doc<"branchPrices"> | null> {
  return await ctx.db
    .query("branchPrices")
    .withIndex("by_branch_variant", (q) => q.eq("branchId", branchId).eq("variantId", variantId))
    .unique();
}

/** What a branch sells a variant at. With no branch, the base price. */
export async function branchPrice(
  ctx: Ctx,
  branchId: Id<"branches"> | null | undefined,
  variant: Pick<Doc<"variants">, "_id" | "priceCentavos">
): Promise<number> {
  if (!branchId) return variant.priceCentavos;
  const row = await branchPriceRow(ctx, branchId, variant._id);
  return row?.priceCentavos ?? variant.priceCentavos;
}

/**
 * Prices for one branch, cached for the life of a query. `variant` is what the
 * branch sells a variant at. `style` is the price a style's card shows: the
 * style's base price, unless the branch has its own price for any of the
 * style's variants — then the lowest price it sells an active variant at.
 */
export function pricingFor(ctx: Ctx, branchId: Id<"branches"> | null) {
  const variantPrices = new Map<string, number>();
  const stylePrices = new Map<string, number>();

  async function variant(v: Pick<Doc<"variants">, "_id" | "priceCentavos">): Promise<number> {
    const cached = variantPrices.get(v._id);
    if (cached !== undefined) return cached;
    const price = await branchPrice(ctx, branchId, v);
    variantPrices.set(v._id, price);
    return price;
  }

  async function style(s: Pick<Doc<"styles">, "_id" | "basePriceCentavos">): Promise<number> {
    const cached = stylePrices.get(s._id);
    if (cached !== undefined) return cached;
    let price = s.basePriceCentavos;
    if (branchId) {
      const rows = await ctx.db
        .query("branchPrices")
        .withIndex("by_branch_style", (q) => q.eq("branchId", branchId).eq("styleId", s._id))
        .collect();
      if (rows.length > 0) {
        const own = new Map(rows.map((r) => [r.variantId as string, r.priceCentavos]));
        const variants = await ctx.db
          .query("variants")
          .withIndex("by_style", (q) => q.eq("styleId", s._id))
          .collect();
        const prices = variants
          .filter((v) => v.isActive)
          .map((v) => own.get(v._id) ?? v.priceCentavos);
        if (prices.length > 0) price = Math.min(...prices);
      }
    }
    stylePrices.set(s._id, price);
    return price;
  }

  return { branchId, variant, style };
}

/** Prices as the online store sells them. */
export async function onlinePricing(ctx: Ctx) {
  return pricingFor(ctx, await onlineBranchId(ctx));
}

/**
 * Prices for an online order: the pickup branch's for in-store pickup, the
 * online store's for delivery. A branch that can't take pickups falls back to
 * online prices — createOrder refuses such a branch before it prices anything.
 */
export async function checkoutPricing(ctx: Ctx, pickupBranchId?: Id<"branches"> | null) {
  if (pickupBranchId) {
    const branch = await ctx.db.get(pickupBranchId);
    if (branch && branch.isActive && branch.channel !== "warehouse") {
      return pricingFor(ctx, pickupBranchId);
    }
  }
  return onlinePricing(ctx);
}

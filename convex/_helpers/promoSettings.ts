// convex/_helpers/promoSettings.ts — the shop's promotion stacking limits.
//
// Kept in the settings table so an admin can change them in Admin → Settings
// without a deploy. Read by the POS (to show the limits as the cashier picks
// promotions) and by createTransaction (which enforces them).

import type { QueryCtx, MutationCtx } from "../_generated/server";
import { clampRules, DEFAULT_PROMO_RULES, type PromoRules } from "./promoStacking";

export const PROMO_SETTING_KEYS = {
  maxPerSale: "promo.maxPerSale",
  maxDiscountPercent: "promo.maxDiscountPercent",
} as const;

export async function readPromoRules(ctx: QueryCtx | MutationCtx): Promise<PromoRules> {
  const read = async (key: string) => {
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const value = row ? Number(row.value) : NaN;
    return Number.isFinite(value) ? value : null;
  };
  const [maxPerSale, maxDiscountPercent] = await Promise.all([
    read(PROMO_SETTING_KEYS.maxPerSale),
    read(PROMO_SETTING_KEYS.maxDiscountPercent),
  ]);
  return clampRules({
    maxPerSale: maxPerSale ?? DEFAULT_PROMO_RULES.maxPerSale,
    maxDiscountPercent: maxDiscountPercent ?? DEFAULT_PROMO_RULES.maxDiscountPercent,
  });
}

// convex/_helpers/promoStacking.ts — more than one promotion on a sale.
//
// A sale may carry several promotions, held in check by three rules:
//
//   exclusive promo   a promotion marked "can't be combined" (buy 1 take 1,
//                     staff discount) is the only one on the sale
//   how many          at most rules.maxPerSale promotions
//   how much          the promotions together take at most
//                     rules.maxDiscountPercent of the sale; past that the
//                     total is trimmed to the cap
//
// Every promotion is worked out from the original prices and the results are
// added, so two 10% promos take 20%, and each is easy to read on the receipt.
// The POS preview and the server both stack through here, so what the till
// shows is what the sale gives.

import {
  calculatePromoDiscount,
  type CartItemForPromo,
  type PromoContext,
  type PromoInput,
} from "./promoCalculations";

export type PromoRules = {
  /** How many promotions one sale may carry. */
  maxPerSale: number;
  /** The most the promotions together may take off, as a percentage of the sale. */
  maxDiscountPercent: number;
};

/** What a shop gets before an admin changes it: one promotion, no cap — today's behaviour. */
export const DEFAULT_PROMO_RULES: PromoRules = { maxPerSale: 1, maxDiscountPercent: 100 };

export type StackablePromo = PromoInput & {
  id: string;
  /** Can't be combined with any other promotion. */
  exclusive?: boolean;
};

export type AppliedPromo = {
  id: string;
  name: string;
  discountCentavos: number;
  description: string;
};

export type DroppedPromo = { id: string; name: string; reason: string };

export type PromoStack = {
  applied: AppliedPromo[];
  dropped: DroppedPromo[];
  /** What comes off the sale, after the cap. */
  discountCentavos: number;
  /** What the promotions came to before the cap. */
  uncappedCentavos: number;
  capped: boolean;
  /** One line for the totals and the receipt. */
  description: string;
};

export function clampRules(rules: Partial<PromoRules> | null | undefined): PromoRules {
  const maxPerSale = Math.max(1, Math.floor(rules?.maxPerSale ?? DEFAULT_PROMO_RULES.maxPerSale));
  const percent = rules?.maxDiscountPercent ?? DEFAULT_PROMO_RULES.maxDiscountPercent;
  return {
    maxPerSale,
    maxDiscountPercent: Math.min(100, Math.max(0, percent)),
  };
}

/**
 * The promotions a sale ends up with. `baseCentavos` is the sale before any
 * promotion — what the percentage cap is measured against.
 */
export function stackPromos(
  items: CartItemForPromo[],
  promos: StackablePromo[],
  baseCentavos: number,
  rules: PromoRules,
  /** What the cashier picked — the gift line, and whether it is a substitute. */
  context: PromoContext = {}
): PromoStack {
  const limits = clampRules(rules);
  const dropped: DroppedPromo[] = [];

  // Each promotion against the original prices.
  const evaluated = promos.map((promo) => ({
    promo,
    result: calculatePromoDiscount(items, promo, context),
  }));
  let kept = evaluated.filter((e) => e.result.applicable && e.result.discountCentavos > 0);
  for (const e of evaluated) {
    if (!kept.includes(e)) {
      dropped.push({ id: e.promo.id, name: e.promo.name, reason: "Doesn't apply to this cart." });
    }
  }

  // Biggest saving first: what survives the caps is what helps the customer most.
  kept.sort((a, b) => b.result.discountCentavos - a.result.discountCentavos);

  // An exclusive promotion stands alone.
  const exclusive = kept.find((e) => e.promo.exclusive);
  if (exclusive && kept.length > 1) {
    for (const e of kept) {
      if (e !== exclusive) {
        dropped.push({
          id: e.promo.id,
          name: e.promo.name,
          reason: `Can't be combined with ${exclusive.promo.name}.`,
        });
      }
    }
    kept = [exclusive];
  }

  // At most this many promotions on one sale.
  if (kept.length > limits.maxPerSale) {
    for (const e of kept.slice(limits.maxPerSale)) {
      dropped.push({
        id: e.promo.id,
        name: e.promo.name,
        reason: `Only ${limits.maxPerSale} promo${limits.maxPerSale === 1 ? "" : "s"} can be used on one sale.`,
      });
    }
    kept = kept.slice(0, limits.maxPerSale);
  }

  const applied: AppliedPromo[] = kept.map((e) => ({
    id: e.promo.id,
    name: e.promo.name,
    discountCentavos: e.result.discountCentavos,
    description: e.result.description,
  }));

  const uncappedCentavos = applied.reduce((sum, a) => sum + a.discountCentavos, 0);

  // The most the promotions may take off this sale.
  const ceiling = Math.floor((Math.max(0, baseCentavos) * limits.maxDiscountPercent) / 100);
  let discountCentavos = uncappedCentavos;
  let capped = false;
  if (uncappedCentavos > ceiling) {
    capped = true;
    discountCentavos = ceiling;
    // Trim each promotion in proportion, so the receipt still adds up.
    let left = ceiling;
    applied.forEach((a, i) => {
      const share =
        i === applied.length - 1
          ? left
          : Math.floor((a.discountCentavos * ceiling) / uncappedCentavos);
      a.discountCentavos = Math.max(0, Math.min(share, left));
      left -= a.discountCentavos;
    });
  }

  const description =
    applied.length === 0
      ? ""
      : applied.length === 1
        ? applied[0].description
        : `${applied.length} promos: ${applied.map((a) => a.name).join(" + ")}`;

  return {
    applied,
    dropped,
    discountCentavos,
    uncappedCentavos,
    capped,
    description: capped ? `${description} (capped at ${limits.maxDiscountPercent}%)` : description,
  };
}

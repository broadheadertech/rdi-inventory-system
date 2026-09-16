// convex/_helpers/promoGiveaway.ts — what a promotion handed over, not just what it sold.
//
// "Items sold" counts what the customer bought under a promotion. It says
// nothing about what the shop gave away to get that sale. These two are the
// other half of the picture:
//
//   units    how many pieces left the shop free
//   value    what those pieces were worth, in money
//
// Only some promotions hand over goods. A gift with purchase gives one item;
// buy-2-take-1 gives one per completed group; "spend X, cheapest item free"
// gives one. A straight 20%-off gives nothing away as an item — it takes money
// off things the customer was buying anyway, so it reports zero here rather
// than muddling the count.
//
// The value is always the discount the sale actually recorded, so a ₱799 gift
// under a ₱599 cap counts as ₱599 — what the shop really gave up.

export type GiveawayPromo = {
  promoType: string;
  buyQuantity?: number;
  getQuantity?: number;
  tieredRewardType?: "amount" | "cheapestFree";
};

export type Giveaway = { units: number; valueCentavos: number };

export const NO_GIVEAWAY: Giveaway = { units: 0, valueCentavos: 0 };

export function giveawayForSale(
  promo: GiveawayPromo,
  args: {
    /** What this promotion took off this sale. */
    discountCentavos: number;
    /** Units of this sale inside the promotion's product scope — buy-X-get-Y counts groups of them. */
    unitsInScope: number;
    /** Whether the sale recorded a gift line for a gift-with-purchase. */
    hasGift: boolean;
  }
): Giveaway {
  if (args.discountCentavos <= 0) return NO_GIVEAWAY;

  switch (promo.promoType) {
    case "gwp":
      // One item, whatever the cap let it be worth.
      return args.hasGift
        ? { units: 1, valueCentavos: args.discountCentavos }
        : NO_GIVEAWAY;

    case "buyXGetY": {
      const buy = promo.buyQuantity ?? 0;
      const get = promo.getQuantity ?? 0;
      if (buy <= 0 || get <= 0) return NO_GIVEAWAY;
      const groups = Math.floor(args.unitsInScope / (buy + get));
      if (groups <= 0) return NO_GIVEAWAY;
      return { units: groups * get, valueCentavos: args.discountCentavos };
    }

    case "tiered":
      // Only the "cheapest item free" reward hands over an item; a flat amount
      // off a spend is money, not goods.
      return promo.tieredRewardType === "cheapestFree"
        ? { units: 1, valueCentavos: args.discountCentavos }
        : NO_GIVEAWAY;

    default:
      // percentage, fixedAmount, crossSell — money off what was already being
      // bought. pwp sells its reward at a special price rather than giving it.
      return NO_GIVEAWAY;
  }
}

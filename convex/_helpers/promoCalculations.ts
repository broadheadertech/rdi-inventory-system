// Pure promo calculation functions — NO Convex dependencies.
// Importable by both Convex mutations and React components.

// ─── Types ──────────────────────────────────────────────────────────────────

export type PromoInput = {
  name: string;
  promoType: "percentage" | "fixedAmount" | "buyXGetY" | "tiered" | "crossSell" | "pwp";
  percentageValue?: number;
  maxDiscountCentavos?: number;
  fixedAmountCentavos?: number;
  buyQuantity?: number;
  getQuantity?: number;
  minSpendCentavos?: number;
  tieredDiscountCentavos?: number;
  // percentage / fixedAmount: take the discount from the in-scope total
  // (default), or from one unit of the highest-priced in-scope item.
  discountApplication?: "wholePurchase" | "highestItem";
  // Product scope (empty arrays = all products) — for crossSell/pwp this is the TRIGGER scope
  brandIds: string[];
  categoryIds: string[];
  variantIds: string[];
  // Extended scope (optional — empty/undefined = all)
  styleIds?: string[];
  genders?: string[];
  colors?: string[];
  sizes?: string[];
  // Aging tier scope (empty = all stock)
  agingTiers?: string[];
  // crossSell reward scope
  crossSellRewardType?: "percentage" | "fixedAmount";
  rewardBrandIds?: string[];
  rewardCategoryIds?: string[];
  rewardStyleIds?: string[];
  rewardVariantIds?: string[];
  // pwp (Purchase with Purchase)
  pwpTriggerMinQuantity?: number;
  pwpRewardVariantIds?: string[];
  pwpRewardPriceCentavos?: number;
};

export type CartItemForPromo = {
  variantId: string;
  brandId: string;
  categoryId: string;
  styleId?: string;
  gender?: string;
  color?: string;
  sizeGroup?: string;
  size?: string;
  unitPriceCentavos: number;
  quantity: number;
  agingTier?: "green" | "yellow" | "red";
};

export type PromoResult = {
  applicable: boolean;
  discountCentavos: number;
  description: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Filter cart items to only those within the promo's product scope.
 * All filters are AND-based — item must match every non-empty filter.
 * Empty/undefined scope = skip that filter (match all).
 */
export function filterEligibleItems(
  items: CartItemForPromo[],
  promo: PromoInput
): CartItemForPromo[] {
  let filtered = items;

  // Product hierarchy filters (AND)
  if (promo.brandIds.length > 0) {
    filtered = filtered.filter((item) => promo.brandIds.includes(item.brandId));
  }
  if (promo.categoryIds.length > 0) {
    filtered = filtered.filter((item) => promo.categoryIds.includes(item.categoryId));
  }
  if (promo.styleIds && promo.styleIds.length > 0) {
    filtered = filtered.filter((item) => item.styleId && promo.styleIds!.includes(item.styleId));
  }
  if (promo.variantIds.length > 0) {
    filtered = filtered.filter((item) => promo.variantIds.includes(item.variantId));
  }

  // Extended filters (AND)
  if (promo.genders && promo.genders.length > 0) {
    filtered = filtered.filter((item) => {
      if (!item.gender) return false;
      if (promo.genders!.includes(item.gender)) return true;
      // "kids" scope also matches "boys" and "girls"
      if (promo.genders!.includes("kids") && (item.gender === "boys" || item.gender === "girls")) return true;
      return false;
    });
  }
  if (promo.colors && promo.colors.length > 0) {
    filtered = filtered.filter((item) => item.color && promo.colors!.includes(item.color));
  }
  if (promo.sizes && promo.sizes.length > 0) {
    filtered = filtered.filter((item) => item.sizeGroup && promo.sizes!.includes(item.sizeGroup));
  }

  // Aging tier filter (AND)
  if (promo.agingTiers && promo.agingTiers.length > 0) {
    filtered = filtered.filter(
      (item) => item.agingTier && promo.agingTiers!.includes(item.agingTier)
    );
  }

  return filtered;
}

// ─── Main Calculator ────────────────────────────────────────────────────────

/**
 * Calculate the discount for a promo against the given cart items.
 * Items should already be enriched with brandId/categoryId.
 */
export function calculatePromoDiscount(
  items: CartItemForPromo[],
  promo: PromoInput
): PromoResult {
  const eligible = filterEligibleItems(items, promo);

  if (eligible.length === 0) {
    return { applicable: false, discountCentavos: 0, description: "" };
  }

  const eligibleTotal = eligible.reduce(
    (sum, item) => sum + item.unitPriceCentavos * item.quantity,
    0
  );

  // What a percentage or fixed-amount discount is taken from. "highestItem" is
  // a single unit of the priciest in-scope item: Pants ₱100 + Shirt ₱50 at 10%
  // off gives ₱10, and two Pants still give ₱10.
  const discountBase =
    promo.discountApplication === "highestItem"
      ? Math.max(...eligible.map((item) => item.unitPriceCentavos))
      : eligibleTotal;

  switch (promo.promoType) {
    case "percentage":
      return calcPercentage(discountBase, promo);
    case "fixedAmount":
      return calcFixedAmount(discountBase, promo);
    case "buyXGetY":
      return calcBuyXGetY(eligible, promo);
    case "tiered":
      return calcTiered(eligibleTotal, promo);
    case "crossSell":
      return calcCrossSell(items, promo);
    case "pwp":
      return calcPWP(items, promo);
    default:
      return { applicable: false, discountCentavos: 0, description: "" };
  }
}

// ─── Per-Type Calculators ───────────────────────────────────────────────────

function highestItemSuffix(promo: PromoInput): string {
  return promo.discountApplication === "highestItem" ? " on the highest-priced item" : "";
}

function calcPercentage(
  base: number,
  promo: PromoInput
): PromoResult {
  const pct = promo.percentageValue ?? 0;
  if (pct <= 0 || pct > 100) {
    return { applicable: false, discountCentavos: 0, description: "" };
  }

  let discount = Math.round(base * (pct / 100));

  // Cap at max if set
  if (promo.maxDiscountCentavos && discount > promo.maxDiscountCentavos) {
    discount = promo.maxDiscountCentavos;
  }

  return {
    applicable: true,
    discountCentavos: discount,
    description: `${promo.name} (${pct}% off${highestItemSuffix(promo)})`,
  };
}

function calcFixedAmount(
  base: number,
  promo: PromoInput
): PromoResult {
  const fixedOff = promo.fixedAmountCentavos ?? 0;
  if (fixedOff <= 0) {
    return { applicable: false, discountCentavos: 0, description: "" };
  }

  // Never more than what it is taken from
  const discount = Math.min(fixedOff, base);

  return {
    applicable: true,
    discountCentavos: discount,
    description: `${promo.name} (₱${(fixedOff / 100).toFixed(0)} off${highestItemSuffix(promo)})`,
  };
}

function calcBuyXGetY(
  eligible: CartItemForPromo[],
  promo: PromoInput
): PromoResult {
  const buyQty = promo.buyQuantity ?? 0;
  const getQty = promo.getQuantity ?? 0;
  if (buyQty <= 0 || getQty <= 0) {
    return { applicable: false, discountCentavos: 0, description: "" };
  }

  // Expand items into individual units sorted by price ascending (cheapest first)
  const unitPrices: number[] = [];
  for (const item of eligible) {
    for (let i = 0; i < item.quantity; i++) {
      unitPrices.push(item.unitPriceCentavos);
    }
  }
  unitPrices.sort((a, b) => a - b);

  const totalQty = unitPrices.length;
  const groupSize = buyQty + getQty;

  if (totalQty < groupSize) {
    return { applicable: false, discountCentavos: 0, description: "" };
  }

  // For every full group, the cheapest `getQty` items are free
  const fullGroups = Math.floor(totalQty / groupSize);
  let discount = 0;

  // The cheapest items in the cart become the free ones
  const freeCount = fullGroups * getQty;
  for (let i = 0; i < freeCount && i < unitPrices.length; i++) {
    discount += unitPrices[i];
  }

  return {
    applicable: true,
    discountCentavos: discount,
    description: `${promo.name} (Buy ${buyQty} Get ${getQty} Free)`,
  };
}

function calcTiered(
  eligibleTotal: number,
  promo: PromoInput
): PromoResult {
  const minSpend = promo.minSpendCentavos ?? 0;
  const discountOff = promo.tieredDiscountCentavos ?? 0;

  if (minSpend <= 0 || discountOff <= 0) {
    return { applicable: false, discountCentavos: 0, description: "" };
  }

  if (eligibleTotal < minSpend) {
    return { applicable: false, discountCentavos: 0, description: "" };
  }

  const discount = Math.min(discountOff, eligibleTotal);

  return {
    applicable: true,
    discountCentavos: discount,
    description: `${promo.name} (₱${(discountOff / 100).toFixed(0)} off on ₱${(minSpend / 100).toFixed(0)}+)`,
  };
}

function calcPWP(
  allItems: CartItemForPromo[],
  promo: PromoInput
): PromoResult {
  const minQty = promo.pwpTriggerMinQuantity ?? 1;
  const rewardVids = promo.pwpRewardVariantIds ?? [];
  const rewardPrice = promo.pwpRewardPriceCentavos ?? 0;

  if (rewardVids.length === 0 || rewardPrice < 0) {
    return { applicable: false, discountCentavos: 0, description: "" };
  }

  // Step 1: Check trigger — total quantity of eligible trigger items >= minQty
  const triggerItems = filterEligibleItems(allItems, promo);
  const triggerQty = triggerItems.reduce((sum, i) => sum + i.quantity, 0);

  if (triggerQty < minQty) {
    return { applicable: false, discountCentavos: 0, description: "" };
  }

  // Step 2: Find reward items in cart (must be in pwpRewardVariantIds, not the trigger scope)
  const rewardVidSet = new Set(rewardVids);
  const rewardItems = allItems.filter((i) => rewardVidSet.has(i.variantId));

  if (rewardItems.length === 0) {
    return { applicable: false, discountCentavos: 0, description: "" };
  }

  // Step 3: Discount = (currentPrice - rewardPrice) per reward unit, floored at 0
  let discount = 0;
  for (const item of rewardItems) {
    const savingPerUnit = Math.max(0, item.unitPriceCentavos - rewardPrice);
    discount += savingPerUnit * item.quantity;
  }

  if (discount === 0) {
    return { applicable: false, discountCentavos: 0, description: "" };
  }

  return {
    applicable: true,
    discountCentavos: discount,
    description: `${promo.name} (Buy ${minQty}+ get reward at ₱${(rewardPrice / 100).toFixed(0)})`,
  };
}

function calcCrossSell(
  allItems: CartItemForPromo[],
  promo: PromoInput
): PromoResult {
  // Step 1: Check trigger — at least one eligible trigger item must be in cart
  const triggerItems = filterEligibleItems(allItems, promo);
  if (triggerItems.length === 0) {
    return { applicable: false, discountCentavos: 0, description: "" };
  }

  // Step 2: Find reward items — items matching the reward scope
  const rewardPromoScope: PromoInput = {
    ...promo,
    brandIds: promo.rewardBrandIds ?? [],
    categoryIds: promo.rewardCategoryIds ?? [],
    variantIds: promo.rewardVariantIds ?? [],
    styleIds: promo.rewardStyleIds,
    genders: undefined,
    colors: undefined,
    sizes: undefined,
    agingTiers: undefined,
  };

  const rewardItems = filterEligibleItems(allItems, rewardPromoScope);

  // Exclude trigger items from rewards to avoid double-counting
  const triggerSet = new Set(triggerItems.map((i) => i.variantId));
  const pureRewardItems = rewardItems.filter((i) => !triggerSet.has(i.variantId));

  if (pureRewardItems.length === 0) {
    return { applicable: false, discountCentavos: 0, description: "" };
  }

  const rewardTotal = pureRewardItems.reduce(
    (sum, item) => sum + item.unitPriceCentavos * item.quantity,
    0
  );

  const rewardType = promo.crossSellRewardType ?? "percentage";

  if (rewardType === "percentage") {
    const pct = promo.percentageValue ?? 0;
    if (pct <= 0 || pct > 100) {
      return { applicable: false, discountCentavos: 0, description: "" };
    }
    let discount = Math.round(rewardTotal * (pct / 100));
    if (promo.maxDiscountCentavos && discount > promo.maxDiscountCentavos) {
      discount = promo.maxDiscountCentavos;
    }
    return {
      applicable: true,
      discountCentavos: discount,
      description: `${promo.name} (${pct}% off reward items)`,
    };
  } else {
    const fixedOff = promo.fixedAmountCentavos ?? 0;
    if (fixedOff <= 0) {
      return { applicable: false, discountCentavos: 0, description: "" };
    }
    const discount = Math.min(fixedOff, rewardTotal);
    return {
      applicable: true,
      discountCentavos: discount,
      description: `${promo.name} (₱${(fixedOff / 100).toFixed(0)} off reward items)`,
    };
  }
}

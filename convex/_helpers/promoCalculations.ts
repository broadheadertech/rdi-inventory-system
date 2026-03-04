// Pure promo calculation functions — NO Convex dependencies.
// Importable by both Convex mutations and React components.

// ─── Types ──────────────────────────────────────────────────────────────────

export type PromoInput = {
  name: string;
  promoType: "percentage" | "fixedAmount" | "buyXGetY" | "tiered";
  percentageValue?: number;
  maxDiscountCentavos?: number;
  fixedAmountCentavos?: number;
  buyQuantity?: number;
  getQuantity?: number;
  minSpendCentavos?: number;
  tieredDiscountCentavos?: number;
  // Product scope (empty arrays = all products)
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
    filtered = filtered.filter((item) => item.gender && promo.genders!.includes(item.gender));
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

  switch (promo.promoType) {
    case "percentage":
      return calcPercentage(eligible, eligibleTotal, promo);
    case "fixedAmount":
      return calcFixedAmount(eligibleTotal, promo);
    case "buyXGetY":
      return calcBuyXGetY(eligible, promo);
    case "tiered":
      return calcTiered(eligibleTotal, promo);
    default:
      return { applicable: false, discountCentavos: 0, description: "" };
  }
}

// ─── Per-Type Calculators ───────────────────────────────────────────────────

function calcPercentage(
  _eligible: CartItemForPromo[],
  eligibleTotal: number,
  promo: PromoInput
): PromoResult {
  const pct = promo.percentageValue ?? 0;
  if (pct <= 0 || pct > 100) {
    return { applicable: false, discountCentavos: 0, description: "" };
  }

  let discount = Math.round(eligibleTotal * (pct / 100));

  // Cap at max if set
  if (promo.maxDiscountCentavos && discount > promo.maxDiscountCentavos) {
    discount = promo.maxDiscountCentavos;
  }

  return {
    applicable: true,
    discountCentavos: discount,
    description: `${promo.name} (${pct}% off)`,
  };
}

function calcFixedAmount(
  eligibleTotal: number,
  promo: PromoInput
): PromoResult {
  const fixedOff = promo.fixedAmountCentavos ?? 0;
  if (fixedOff <= 0) {
    return { applicable: false, discountCentavos: 0, description: "" };
  }

  // Don't discount more than the eligible total
  const discount = Math.min(fixedOff, eligibleTotal);

  return {
    applicable: true,
    discountCentavos: discount,
    description: `${promo.name} (₱${(fixedOff / 100).toFixed(0)} off)`,
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

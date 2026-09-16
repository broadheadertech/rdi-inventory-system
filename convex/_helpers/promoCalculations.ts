// Pure promo calculation functions — NO Convex dependencies (type imports only).
// Importable by both Convex mutations and React components.

import type { Doc } from "../_generated/dataModel";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PromoInput = {
  name: string;
  promoType: "percentage" | "fixedAmount" | "buyXGetY" | "tiered" | "crossSell" | "pwp" | "gwp";
  percentageValue?: number;
  maxDiscountCentavos?: number;
  fixedAmountCentavos?: number;
  buyQuantity?: number;
  getQuantity?: number;
  minSpendCentavos?: number;
  tieredDiscountCentavos?: number;
  // tiered: a fixed amount off (default), or the cheapest counted item free
  tieredRewardType?: "amount" | "cheapestFree";
  // percentage / fixedAmount: needs at least this many in-scope items
  minQuantity?: number;
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
  // gwp (Gift with Purchase) — the most the gift may be worth, and whether a
  // cashier may put something else in its place when it is out of stock. The
  // reward* fields above say what the gift may be.
  giftMaxValueCentavos?: number;
  giftAllowSubstitute?: boolean;
};

/**
 * What the cashier chose, which some promotions need on top of the cart: which
 * line is the gift, and whether it stands in for one that was out of stock.
 */
export type PromoContext = {
  giftVariantId?: string;
  giftSubstituted?: boolean;
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
  /** Only for reading back on a receipt — "Aero Cap free". */
  styleName?: string;
};

/** A promotion document as the calculator reads it — shared by the POS sale and online vouchers. */
export function toPromoInput(p: Doc<"promotions">): PromoInput {
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
    tieredRewardType: p.tieredRewardType,
    minQuantity: p.minQuantity,
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
    giftMaxValueCentavos: p.giftMaxValueCentavos,
    giftAllowSubstitute: p.giftAllowSubstitute,
  };
}

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
  promo: PromoInput,
  context: PromoContext = {}
): PromoResult {
  const eligible = filterEligibleItems(items, promo);

  if (eligible.length === 0) {
    return { applicable: false, discountCentavos: 0, description: "" };
  }

  const eligibleTotal = eligible.reduce(
    (sum, item) => sum + item.unitPriceCentavos * item.quantity,
    0
  );
  const eligibleQuantity = eligible.reduce((sum, item) => sum + item.quantity, 0);

  // A minimum quantity: "2 polos → 50% off" gives nothing on one polo.
  if (
    (promo.promoType === "percentage" || promo.promoType === "fixedAmount") &&
    promo.minQuantity &&
    eligibleQuantity < promo.minQuantity
  ) {
    return {
      applicable: false,
      discountCentavos: 0,
      description: `${promo.name} (needs ${promo.minQuantity} items)`,
    };
  }

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
      return calcTiered(eligible, eligibleTotal, promo);
    case "crossSell":
      return calcCrossSell(items, promo);
    case "pwp":
      return calcPWP(items, promo);
    case "gwp":
      return calcGWP(items, eligible, promo, context);
    default:
      return { applicable: false, discountCentavos: 0, description: "" };
  }
}

// ─── Per-Type Calculators ───────────────────────────────────────────────────

function highestItemSuffix(promo: PromoInput): string {
  const onHighest = promo.discountApplication === "highestItem" ? " on the highest-priced item" : "";
  const minQuantity = promo.minQuantity && promo.minQuantity > 1 ? ` when buying ${promo.minQuantity}+` : "";
  return onHighest + minQuantity;
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
  eligible: CartItemForPromo[],
  eligibleTotal: number,
  promo: PromoInput
): PromoResult {
  const minSpend = promo.minSpendCentavos ?? 0;
  if (minSpend <= 0 || eligibleTotal < minSpend) {
    return { applicable: false, discountCentavos: 0, description: "" };
  }

  // Reach the spend and one unit of the cheapest counted item is free — the
  // standard rule, so the customer can't pick an expensive item as the freebie.
  if (promo.tieredRewardType === "cheapestFree") {
    const cheapest = Math.min(...eligible.map((item) => item.unitPriceCentavos));
    return {
      applicable: true,
      discountCentavos: cheapest,
      description: `${promo.name} (Spend ₱${(minSpend / 100).toFixed(0)}, cheapest item free)`,
    };
  }

  const discountOff = promo.tieredDiscountCentavos ?? 0;
  if (discountOff <= 0) {
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

// ─── Progress toward a promotion ────────────────────────────────────────────
// For the POS: whether a cart gets a promotion now, what it saves, and what
// adding would reach it (or reach more of it). The saving is the calculator's
// own result, so a suggestion never promises more than the sale gives.

export type PromoProgress = {
  applies: boolean;
  discountCentavos: number;
  description: string;
  /** What to add to reach the promotion, or to get more from it. */
  hint: string | null;
  /** How far the cart is from that, 0–1 — smaller is closer. */
  gap: number;
};

function peso(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

function items(n: number): string {
  return `${n} more item${n === 1 ? "" : "s"}`;
}

function offerLabel(promo: PromoInput): string {
  if (promo.promoType === "percentage") return `${promo.percentageValue ?? 0}% off`;
  if (promo.promoType === "fixedAmount") return `${peso(promo.fixedAmountCentavos ?? 0)} off`;
  return "the discount";
}

export function promoProgress(items_: CartItemForPromo[], promo: PromoInput): PromoProgress {
  const result = calculatePromoDiscount(items_, promo);
  const applies = result.applicable && result.discountCentavos > 0;
  const progress: PromoProgress = {
    applies,
    discountCentavos: applies ? result.discountCentavos : 0,
    description: result.description,
    hint: null,
    gap: 1,
  };

  // Only promotions the cart already has something toward get a hint.
  const eligible = filterEligibleItems(items_, promo);
  if (eligible.length === 0) return progress;
  const quantity = eligible.reduce((sum, item) => sum + item.quantity, 0);
  const total = eligible.reduce((sum, item) => sum + item.unitPriceCentavos * item.quantity, 0);

  switch (promo.promoType) {
    case "percentage":
    case "fixedAmount": {
      const needed = promo.minQuantity ?? 0;
      if (!applies && needed > quantity) {
        progress.hint = `Add ${items(needed - quantity)} for ${offerLabel(promo)}`;
        progress.gap = (needed - quantity) / needed;
      }
      break;
    }
    case "buyXGetY": {
      const buy = promo.buyQuantity ?? 0;
      const get = promo.getQuantity ?? 0;
      const group = buy + get;
      if (buy <= 0 || get <= 0) break;
      if (quantity < group) {
        progress.hint = `Add ${items(group - quantity)} to get ${get === 1 ? "one" : get} free`;
        progress.gap = (group - quantity) / group;
      } else if (quantity % group >= buy) {
        const more = group - (quantity % group);
        progress.hint = `Add ${items(more)} to get ${get === 1 ? "another one" : `${get} more`} free`;
        progress.gap = more / group;
      }
      break;
    }
    case "tiered": {
      const minSpend = promo.minSpendCentavos ?? 0;
      if (minSpend > 0 && total < minSpend) {
        const reward =
          promo.tieredRewardType === "cheapestFree"
            ? "the cheapest item free"
            : `${peso(promo.tieredDiscountCentavos ?? 0)} off`;
        progress.hint = `Spend ${peso(minSpend - total)} more for ${reward}`;
        progress.gap = (minSpend - total) / minSpend;
      }
      break;
    }
    case "pwp": {
      const needed = promo.pwpTriggerMinQuantity ?? 1;
      const price = peso(promo.pwpRewardPriceCentavos ?? 0);
      if (quantity < needed) {
        progress.hint = `Add ${items(needed - quantity)} to unlock the reward at ${price}`;
        progress.gap = (needed - quantity) / needed;
      } else if (!applies) {
        progress.hint = `Add the reward item for ${price}`;
        progress.gap = 0.5;
      }
      break;
    }
    case "crossSell": {
      if (!applies) {
        const off =
          promo.crossSellRewardType === "fixedAmount"
            ? `${peso(promo.fixedAmountCentavos ?? 0)} off`
            : `${promo.percentageValue ?? 0}% off`;
        progress.hint = `Add a matching item for ${off} it`;
        progress.gap = 0.5;
      }
      break;
    }
  }
  return progress;
}

/**
 * Gift with purchase: spend enough and one item comes free, up to a cap.
 *
 * The gift is a line in the cart, not something the promotion conjures — the
 * cashier scans the cap and marks it as the gift, so it still leaves the
 * branch's stock and still prints on the invoice. What comes off is the gift's
 * price up to `giftMaxValueCentavos`; a gift dearer than the cap leaves the
 * customer paying the difference.
 *
 * The spend is measured on everything *except* the gift's own unit. Counting
 * the gift would let a ₱4,401 cart reach a ₱5,000 threshold by adding the
 * ₱599 freebie — the promotion paying for itself.
 *
 * `rewardScope` (the reward* fields) says what may be the gift. With nothing
 * set, anything in the cart may be. When the named gift is out of stock and
 * the promotion allows it, a cashier may nominate something else instead;
 * that substitution is recorded on the sale, and the cap still holds.
 */
function calcGWP(
  allItems: CartItemForPromo[],
  eligible: CartItemForPromo[],
  promo: PromoInput,
  context: PromoContext
): PromoResult {
  const minSpend = promo.minSpendCentavos ?? 0;
  const cap = promo.giftMaxValueCentavos ?? 0;
  if (minSpend <= 0 || cap <= 0) {
    return { applicable: false, discountCentavos: 0, description: "" };
  }

  const spendLabel = `₱${(minSpend / 100).toFixed(0)}`;
  const gift = context.giftVariantId
    ? allItems.find((item) => item.variantId === context.giftVariantId)
    : undefined;

  // The spend, with the gift's own unit taken out of it.
  const eligibleTotal = eligible.reduce(
    (sum, item) => sum + item.unitPriceCentavos * item.quantity,
    0
  );
  const giftInEligible = gift
    ? eligible.some((item) => item.variantId === gift.variantId)
    : false;
  const spend = eligibleTotal - (gift && giftInEligible ? gift.unitPriceCentavos : 0);

  if (spend < minSpend) {
    const short = minSpend - spend;
    return {
      applicable: false,
      discountCentavos: 0,
      description: `${promo.name} (₱${(short / 100).toFixed(0)} more to spend)`,
    };
  }

  if (!gift) {
    return {
      applicable: false,
      discountCentavos: 0,
      description: `${promo.name} (pick the free item)`,
    };
  }

  // What may be the gift. Nothing set: anything in the cart.
  const rewardScoped =
    (promo.rewardBrandIds?.length ?? 0) > 0 ||
    (promo.rewardCategoryIds?.length ?? 0) > 0 ||
    (promo.rewardStyleIds?.length ?? 0) > 0 ||
    (promo.rewardVariantIds?.length ?? 0) > 0;

  if (rewardScoped && !isGiftInScope(gift, promo)) {
    // Out of scope is only allowed as a recorded substitution.
    if (!(promo.giftAllowSubstitute && context.giftSubstituted)) {
      return {
        applicable: false,
        discountCentavos: 0,
        description: `${promo.name} (that item isn't part of this gift)`,
      };
    }
  }

  const discountCentavos = Math.min(gift.unitPriceCentavos, cap);
  const overCap = gift.unitPriceCentavos > cap;

  return {
    applicable: true,
    discountCentavos,
    description:
      `${promo.name} (Spend ${spendLabel}, ${gift.styleName ?? "one item"} free` +
      (overCap ? ` up to ₱${(cap / 100).toFixed(0)}` : "") +
      (context.giftSubstituted ? ", substituted" : "") +
      ")",
  };
}

/** Whether an item is one the promotion is willing to give away. */
export function isGiftInScope(item: CartItemForPromo, promo: PromoInput): boolean {
  const brands = promo.rewardBrandIds ?? [];
  const categories = promo.rewardCategoryIds ?? [];
  const styles = promo.rewardStyleIds ?? [];
  const variants = promo.rewardVariantIds ?? [];
  if (
    brands.length === 0 &&
    categories.length === 0 &&
    styles.length === 0 &&
    variants.length === 0
  ) {
    return true;
  }
  // Any one of the reward lists naming the item is enough — a gift is "a Cap,
  // or this particular SKU", not the intersection of every list.
  if (variants.includes(item.variantId)) return true;
  if (item.styleId && styles.includes(item.styleId)) return true;
  if (categories.includes(item.categoryId)) return true;
  if (brands.includes(item.brandId)) return true;
  return false;
}

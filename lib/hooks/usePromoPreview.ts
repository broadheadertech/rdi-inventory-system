"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CartItem } from "@/components/providers/POSCartProvider";
import {
  stackPromos,
  clampRules,
  DEFAULT_PROMO_RULES,
  type PromoRules,
  type PromoStack,
} from "@/convex/_helpers/promoStacking";
import {
  promoProgress,
  type PromoProgress,
  type PromoInput,
} from "@/convex/_helpers/promoCalculations";

/** A promotion this cart gets, and what it saves. */
export type PromoSuggestion = {
  promoId: string;
  name: string;
  discountCentavos: number;
};

export type PromoSuggestions = {
  /** The promotion that saves the most on this cart, if any applies. */
  best: PromoSuggestion | null;
  /** Every promotion that applies, most savings first. */
  applicable: PromoSuggestion[];
  /** What to add to reach a promotion (or more of one), closest first. */
  hints: { promoId: string; name: string; hint: string }[];
  byId: Record<string, PromoProgress>;
};

const NO_SUGGESTIONS: PromoSuggestions = { best: null, applicable: [], hints: [], byId: {} };

type ActivePromo = {
  _id: Id<"promotions">;
  name: string;
  description?: string;
  promoType: "percentage" | "fixedAmount" | "buyXGetY" | "tiered" | "crossSell" | "pwp" | "gwp";
  percentageValue?: number;
  maxDiscountCentavos?: number;
  fixedAmountCentavos?: number;
  buyQuantity?: number;
  getQuantity?: number;
  minSpendCentavos?: number;
  tieredDiscountCentavos?: number;
  tieredRewardType?: "amount" | "cheapestFree";
  minQuantity?: number;
  exclusive?: boolean;
  giftMaxValueCentavos?: number;
  giftAllowSubstitute?: boolean;
  discountApplication?: "wholePurchase" | "highestItem";
  brandIds: string[];
  categoryIds: string[];
  variantIds: string[];
  styleIds: string[];
  genders: string[];
  colors: string[];
  sizes: string[];
  priority: number;
  agingTiers: string[];
  // crossSell
  crossSellRewardType?: "percentage" | "fixedAmount";
  rewardBrandIds?: string[];
  rewardCategoryIds?: string[];
  rewardStyleIds?: string[];
  rewardVariantIds?: string[];
  // pwp
  pwpTriggerMinQuantity?: number;
  pwpRewardVariantIds?: string[];
  pwpRewardPriceCentavos?: number;
};

export function usePromoPreview(
  items: CartItem[],
  selectedPromoIds: string[],
  discountType: string,
  /** The sale before promotions — what the discount cap is measured against. */
  saleTotalCentavos: number,
  /** Gift with purchase: the line being given away, and whether it is a substitute. */
  gift: { variantId: string | null; substituted: boolean } = {
    variantId: null,
    substituted: false,
  }
) {
  // Only fetch promos when discount type is "none" (promos don't stack with Senior/PWD)
  const activePromos = useQuery(
    api.pos.promotions.getActivePromotions,
    discountType === "none" ? {} : "skip"
  );

  // How many promotions a sale may carry, and how much they may take off.
  const savedRules = useQuery(api.pos.promotions.getPromoRules, discountType === "none" ? {} : "skip");
  const rules: PromoRules = useMemo(
    () => clampRules(savedRules ?? DEFAULT_PROMO_RULES),
    [savedRules]
  );

  // Get variant IDs for hierarchy lookup
  const variantIds = useMemo(
    () => items.map((i) => i.variantId),
    [items]
  );

  const variantHierarchy = useQuery(
    api.pos.promotions.getVariantHierarchy,
    discountType === "none" && items.length > 0
      ? { variantIds }
      : "skip"
  );

  // Cart items with the brand, category and attributes promotions are scoped by.
  const enrichedItems = useMemo(() => {
    if (!variantHierarchy) return null;
    return items.map((item) => {
      const hierarchy = variantHierarchy[String(item.variantId)];
      return {
        variantId: String(item.variantId),
        brandId: hierarchy?.brandId ?? "",
        categoryId: hierarchy?.categoryId ?? "",
        styleId: hierarchy?.styleId ?? "",
        gender: hierarchy?.gender ?? "",
        color: hierarchy?.color ?? "",
        sizeGroup: hierarchy?.sizeGroup ?? "",
        size: hierarchy?.size ?? "",
        unitPriceCentavos: item.unitPriceCentavos,
        quantity: item.quantity,
        agingTier: hierarchy?.agingTier,
        styleName: item.styleName,
      };
    });
  }, [items, variantHierarchy]);

  // What the chosen promotions come to together, under the shop's rules —
  // the same stacking the server applies when the sale is rung.
  const promoStack = useMemo((): PromoStack | null => {
    if (
      discountType !== "none" ||
      selectedPromoIds.length === 0 ||
      !activePromos ||
      !enrichedItems ||
      items.length === 0
    ) {
      return null;
    }
    const chosen = (activePromos as ActivePromo[])
      .filter((p) => selectedPromoIds.includes(String(p._id)))
      .map((promo) => ({
        ...promo,
        id: String(promo._id),
        agingTiers: promo.agingTiers ?? [],
      })) as unknown as Parameters<typeof stackPromos>[1];
    if (chosen.length === 0) return null;
    return stackPromos(enrichedItems, chosen, saleTotalCentavos, rules, {
      giftVariantId: gift.variantId ?? undefined,
      giftSubstituted: gift.substituted,
    });
  }, [
    items,
    selectedPromoIds,
    discountType,
    activePromos,
    enrichedItems,
    saleTotalCentavos,
    rules,
    gift.variantId,
    gift.substituted,
  ]);

  // The promotions on this sale that want a gift picked, and what may be given.
  const giftPromos = useMemo(() => {
    if (!activePromos) return [];
    return (activePromos as ActivePromo[]).filter(
      (promo) => promo.promoType === "gwp" && selectedPromoIds.includes(String(promo._id))
    );
  }, [activePromos, selectedPromoIds]);

  // Every active promotion against this cart: which apply and save the most,
  // and what the cashier could suggest adding to reach the rest.
  const promoSuggestions = useMemo((): PromoSuggestions => {
    if (discountType !== "none" || !activePromos || !enrichedItems || items.length === 0) {
      return NO_SUGGESTIONS;
    }
    const byId: Record<string, PromoProgress> = {};
    const rows = (activePromos as ActivePromo[]).map((promo) => {
      const id = String(promo._id);
      byId[id] = promoProgress(enrichedItems, {
        ...promo,
        agingTiers: promo.agingTiers ?? [],
      } as PromoInput);
      return { promo, id, progress: byId[id] };
    });
    const applicable = rows
      .filter((r) => r.progress.applies)
      .sort(
        (a, b) =>
          b.progress.discountCentavos - a.progress.discountCentavos || b.promo.priority - a.promo.priority
      )
      .map((r) => ({ promoId: r.id, name: r.promo.name, discountCentavos: r.progress.discountCentavos }));
    const hints = rows
      .filter((r) => r.progress.hint)
      .sort((a, b) => a.progress.gap - b.progress.gap)
      .slice(0, 3)
      .map((r) => ({ promoId: r.id, name: r.promo.name, hint: r.progress.hint! }));
    return { best: applicable[0] ?? null, applicable, hints, byId };
  }, [items, discountType, activePromos, enrichedItems]);

  return {
    activePromos: (activePromos ?? []) as ActivePromo[],
    promoStack,
    promoSuggestions,
    giftPromos,
    enrichedItems,
    rules,
    isLoading: activePromos === undefined,
  };
}

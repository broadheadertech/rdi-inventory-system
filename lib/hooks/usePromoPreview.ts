"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CartItem } from "@/components/providers/POSCartProvider";
import {
  calculatePromoDiscount,
  type PromoResult,
  type PromoInput,
} from "@/convex/_helpers/promoCalculations";

type ActivePromo = {
  _id: Id<"promotions">;
  name: string;
  description?: string;
  promoType: "percentage" | "fixedAmount" | "buyXGetY" | "tiered";
  percentageValue?: number;
  maxDiscountCentavos?: number;
  fixedAmountCentavos?: number;
  buyQuantity?: number;
  getQuantity?: number;
  minSpendCentavos?: number;
  tieredDiscountCentavos?: number;
  brandIds: string[];
  categoryIds: string[];
  variantIds: string[];
  styleIds: string[];
  genders: string[];
  colors: string[];
  sizes: string[];
  priority: number;
  agingTiers: string[];
};

export function usePromoPreview(
  items: CartItem[],
  selectedPromoId: string | null,
  discountType: string
) {
  // Only fetch promos when discount type is "none" (promos don't stack with Senior/PWD)
  const activePromos = useQuery(
    api.pos.promotions.getActivePromotions,
    discountType === "none" ? {} : "skip"
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

  // Calculate promo preview
  const promoPreview = useMemo((): PromoResult | null => {
    if (
      discountType !== "none" ||
      !selectedPromoId ||
      !activePromos ||
      !variantHierarchy ||
      items.length === 0
    ) {
      return null;
    }

    const promo = activePromos.find(
      (p: ActivePromo) => String(p._id) === selectedPromoId
    );
    if (!promo) return null;

    const enrichedItems = items.map((item) => {
      const hierarchy = variantHierarchy[String(item.variantId)];
      return {
        variantId: String(item.variantId),
        brandId: hierarchy?.brandId ?? "",
        categoryId: hierarchy?.categoryId ?? "",
        styleId: hierarchy?.styleId ?? "",
        gender: hierarchy?.gender ?? "",
        color: hierarchy?.color ?? "",
        size: hierarchy?.size ?? "",
        unitPriceCentavos: item.unitPriceCentavos,
        quantity: item.quantity,
        agingTier: hierarchy?.agingTier,
      };
    });

    return calculatePromoDiscount(enrichedItems, {
      ...promo,
      agingTiers: promo.agingTiers ?? [],
    } as PromoInput);
  }, [items, selectedPromoId, discountType, activePromos, variantHierarchy]);

  return {
    activePromos: (activePromos ?? []) as ActivePromo[],
    promoPreview,
    isLoading: activePromos === undefined,
  };
}

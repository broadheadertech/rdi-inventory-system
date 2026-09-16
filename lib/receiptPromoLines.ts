// lib/receiptPromoLines.ts — the promotion lines a receipt prints.
//
// A sale may carry several promotions, each with its own line so the total
// reconciles: total sales, less each promotion, less SC/PWD, amount due.
// Sales rung before a sale could carry more than one promotion kept a single
// name and amount, so those are turned into one line here.

export type ReceiptPromoLine = { name: string; discountCentavos: number };

export function receiptPromoLines(txn: {
  appliedPromotions?: readonly { name: string; discountCentavos: number }[];
  promoName?: string | null;
  promoDiscountAmountCentavos?: number;
}): ReceiptPromoLine[] {
  const applied = txn.appliedPromotions ?? [];
  if (applied.length > 0) {
    return applied
      .filter((p) => p.discountCentavos > 0)
      .map((p) => ({ name: p.name, discountCentavos: p.discountCentavos }));
  }
  const legacy = txn.promoDiscountAmountCentavos ?? 0;
  if (legacy > 0) {
    return [{ name: txn.promoName ?? "Promo", discountCentavos: legacy }];
  }
  return [];
}

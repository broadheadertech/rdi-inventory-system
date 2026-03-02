// Pure tax calculation functions — NO Convex dependencies.
// Importable by both Convex mutations and React components.

const VAT_RATE = 0.12;
const SENIOR_PWD_DISCOUNT_RATE = 0.20;

export type TaxBreakdown = {
  subtotalCentavos: number;
  vatExemptSubtotalCentavos: number;
  vatAmountCentavos: number;
  discountAmountCentavos: number;
  totalCentavos: number;
  savingsCentavos: number;
};

export type LineItemTax = {
  unitPriceCentavos: number;
  vatExemptUnitCentavos: number;
  discountPerUnitCentavos: number;
  finalUnitCentavos: number;
};

/**
 * Remove VAT from a VAT-inclusive price.
 * Returns the VAT-exempt base price in centavos.
 */
export function removeVat(priceInclusiveCentavos: number): number {
  return Math.round(priceInclusiveCentavos / (1 + VAT_RATE));
}

/**
 * Calculate the VAT component of a VAT-inclusive price.
 * Returns the VAT amount in centavos.
 */
export function calculateVat(priceInclusiveCentavos: number): number {
  return priceInclusiveCentavos - removeVat(priceInclusiveCentavos);
}

/**
 * Calculate per-item discount breakdown for Senior/PWD.
 * Order: remove VAT first, then 20% discount on VAT-exempt base.
 */
export function calculateLineItemDiscount(
  unitPriceCentavos: number
): LineItemTax {
  const vatExemptUnitCentavos = removeVat(unitPriceCentavos);
  const discountPerUnitCentavos = Math.round(
    vatExemptUnitCentavos * SENIOR_PWD_DISCOUNT_RATE
  );
  const finalUnitCentavos = vatExemptUnitCentavos - discountPerUnitCentavos;

  return {
    unitPriceCentavos,
    vatExemptUnitCentavos,
    discountPerUnitCentavos,
    finalUnitCentavos,
  };
}

/**
 * Main entry point: compute full tax breakdown for a cart.
 *
 * - "none": VAT is informational (already included in prices). Total = subtotal.
 * - "senior"/"pwd": Remove VAT per item, apply 20% discount per item. Total = discounted sum.
 */
export function calculateTaxBreakdown(
  items: { unitPriceCentavos: number; quantity: number }[],
  discountType: "senior" | "pwd" | "none"
): TaxBreakdown {
  const subtotalCentavos = items.reduce(
    (sum, item) => sum + item.unitPriceCentavos * item.quantity,
    0
  );

  if (discountType === "none") {
    const vatAmount = items.reduce(
      (sum, item) => sum + calculateVat(item.unitPriceCentavos) * item.quantity,
      0
    );
    return {
      subtotalCentavos,
      vatExemptSubtotalCentavos: subtotalCentavos - vatAmount,
      vatAmountCentavos: vatAmount,
      discountAmountCentavos: 0,
      totalCentavos: subtotalCentavos,
      savingsCentavos: 0,
    };
  }

  // Senior/PWD: remove VAT per item, then apply 20% discount per item
  let vatExemptSubtotal = 0;
  let totalDiscount = 0;
  for (const item of items) {
    const lineItem = calculateLineItemDiscount(item.unitPriceCentavos);
    vatExemptSubtotal += lineItem.vatExemptUnitCentavos * item.quantity;
    totalDiscount += lineItem.discountPerUnitCentavos * item.quantity;
  }

  const total = vatExemptSubtotal - totalDiscount;
  return {
    subtotalCentavos,
    vatExemptSubtotalCentavos: vatExemptSubtotal,
    vatAmountCentavos: 0,
    discountAmountCentavos: totalDiscount,
    totalCentavos: total,
    savingsCentavos: subtotalCentavos - total,
  };
}

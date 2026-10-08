// Pure tax calculation functions — NO Convex dependencies.
// Importable by both Convex mutations and React components.
//
// Shelf prices in this system are VAT-INCLUSIVE, so VAT is never added to a
// sale and never deducted from it. It is extracted from inside the price. On
// an ordinary sale the subtotal and the total are the same figure and VAT is a
// breakdown line, not a movement.
//
// Two things do come off:
//
//   A promotion            comes off the gross. "10% off" means ten per cent
//                          of the shelf price, which is why promotions are
//                          worked out from the gross breakdown and applied
//                          afterwards, by applyPromoDiscount.
//
//   Senior / PWD           the VAT comes off first and the statutory 20% is
//                          taken off the VAT-exempt base, never off the gross.
//                          Either order gives the same total, since both are
//                          multiplications — but the DISCOUNT RECORDED differs
//                          (₱178.57 against ₱200.00 on a ₱1,000 sale) and that
//                          recorded figure is what gets audited.
//
// The one invariant everything here exists to protect: an invoice has to foot.
//
//   VATable + VAT + VAT-exempt sales  ===  total
//   subtotal − VAT adjustment − SC/PWD discount − promotions  ===  total
//
// VAT is struck on the NET TOTAL rather than summed per line, for two reasons.
// Summing per line lets rounding drift — three lines of ₱333.33 sum to ₱107.13
// of VAT while the ₱999.99 total holds ₱107.14 — and an invoice a centavo out
// is still an invoice that does not foot. And computing it before a promotion
// came off would report VAT on money nobody received.

const VAT_RATE = 0.12;
const SENIOR_PWD_DISCOUNT_RATE = 0.2;

export type TaxBreakdown = {
  /** Gross, VAT-inclusive: the sum of shelf prices. */
  subtotalCentavos: number;
  /** The statutory Senior/PWD 20%, off the VAT-exempt base. */
  discountAmountCentavos: number;
  /** Promotions, off the gross. */
  promoDiscountCentavos: number;
  /** The VAT lifted off an exempt sale. BIR reports it as an adjustment. */
  vatAdjustmentCentavos: number;
  /** What the customer pays. Always equal to totalCentavos. */
  netSalesCentavos: number;
  /** The VATable portion of net sales. Zero on a VAT-exempt sale. */
  vatableSalesCentavos: number;
  /** The VAT inside net sales. Zero on a VAT-exempt sale. */
  vatAmountCentavos: number;
  /** Net sales on a VAT-exempt sale. Zero on an ordinary one. */
  vatExemptSalesCentavos: number;
  totalCentavos: number;
  /** Everything the customer did not pay: gross less total. */
  savingsCentavos: number;
  /** True on a Senior/PWD sale, where no VAT is charged at all. */
  vatExempt: boolean;
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
 * The gross reading of a cart, before any promotion.
 *
 * This is what promotions are worked out from, so it cannot depend on them.
 * Once a promotion is known, pass this through applyPromoDiscount to get the
 * figures that belong on the invoice.
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
    const vatAmountCentavos = calculateVat(subtotalCentavos);
    return {
      subtotalCentavos,
      discountAmountCentavos: 0,
      promoDiscountCentavos: 0,
      vatAdjustmentCentavos: 0,
      netSalesCentavos: subtotalCentavos,
      vatableSalesCentavos: subtotalCentavos - vatAmountCentavos,
      vatAmountCentavos,
      vatExemptSalesCentavos: 0,
      totalCentavos: subtotalCentavos,
      savingsCentavos: 0,
      vatExempt: false,
    };
  }

  // Senior/PWD: the VAT comes off each unit first, then the statutory 20%.
  // Per unit rather than on the total, because the 20% is a per-item
  // entitlement and the receipt has to show it line by line.
  let vatExemptSales = 0;
  let totalDiscount = 0;
  for (const item of items) {
    const line = calculateLineItemDiscount(item.unitPriceCentavos);
    vatExemptSales += line.vatExemptUnitCentavos * item.quantity;
    totalDiscount += line.discountPerUnitCentavos * item.quantity;
  }

  const total = vatExemptSales - totalDiscount;
  return {
    subtotalCentavos,
    discountAmountCentavos: totalDiscount,
    promoDiscountCentavos: 0,
    // Whatever the gross held that is no longer being charged.
    vatAdjustmentCentavos: subtotalCentavos - vatExemptSales,
    netSalesCentavos: total,
    vatableSalesCentavos: 0,
    vatAmountCentavos: 0,
    vatExemptSalesCentavos: total,
    totalCentavos: total,
    savingsCentavos: subtotalCentavos - total,
    vatExempt: true,
  };
}

/**
 * The same sale once promotions come off it, with VAT re-struck on what is
 * actually received.
 *
 * A promotion granted at the point of sale and shown on the invoice reduces
 * gross selling price, so the output VAT owed on the sale falls with it.
 * Reporting VAT on the pre-promotion figure over-remits — and leaves an
 * invoice where VATable plus VAT comes to more than the customer handed over.
 *
 * Promotions never stack with Senior/PWD, so an exempt sale is returned
 * untouched: there is no VAT to re-strike and nothing should quietly discount
 * a statutory price.
 */
export function applyPromoDiscount(
  breakdown: TaxBreakdown,
  promoDiscountCentavos: number
): TaxBreakdown {
  if (breakdown.vatExempt || promoDiscountCentavos <= 0) return breakdown;

  // A promotion can take a sale to zero but never below it.
  const promo = Math.min(promoDiscountCentavos, breakdown.totalCentavos);
  const net = breakdown.totalCentavos - promo;
  const vatAmountCentavos = calculateVat(net);

  return {
    ...breakdown,
    promoDiscountCentavos: promo,
    netSalesCentavos: net,
    vatableSalesCentavos: net - vatAmountCentavos,
    vatAmountCentavos,
    totalCentavos: net,
    savingsCentavos: breakdown.subtotalCentavos - net,
  };
}

/**
 * Whether a breakdown's own figures add up, both ways round. Nothing should
 * reach a receipt or a Z-reading that fails this.
 */
export function breakdownFoots(b: TaxBreakdown): boolean {
  const sides =
    b.vatableSalesCentavos + b.vatAmountCentavos + b.vatExemptSalesCentavos ===
    b.totalCentavos;
  const fromGross =
    b.subtotalCentavos -
      b.vatAdjustmentCentavos -
      b.discountAmountCentavos -
      b.promoDiscountCentavos ===
    b.totalCentavos;
  return sides && fromGross && b.netSalesCentavos === b.totalCentavos;
}

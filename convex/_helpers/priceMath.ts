// convex/_helpers/priceMath.ts — how a price change turns one price into another.
//
// Pure functions shared by the server (admin/prices.ts applies a change) and
// the Prices page (previews it), so what the page shows is what gets saved.

export type PriceOp =
  | { type: "set"; priceCentavos: number }
  | { type: "percent"; percent: number } // +10 raises 10%, -15 lowers 15%
  | { type: "amount"; centavos: number } // +/- centavos
  | { type: "reset" }; // back to the base price (branch prices only)

export type Rounding = "none" | "peso" | "end9";

/** The highest price a change may set — ₱1,000,000 — to catch a slipped digit. */
export const MAX_PRICE_CENTAVOS = 100_000_000;

/** Rounds to a whole peso, or to the nearest peso price ending in 9 (₱1,234 → ₱1,239). */
export function roundPrice(centavos: number, rounding: Rounding): number {
  if (rounding === "none") return Math.round(centavos);
  const pesos = Math.round(centavos / 100);
  if (rounding === "peso") return pesos * 100;
  const below = Math.floor(pesos / 10) * 10 - 1;
  const above = below + 10;
  // Halfway between (₱1,234) rounds up, as retail prices do.
  const nearest = pesos - below < above - pesos ? below : above;
  return Math.max(9, nearest) * 100;
}

/**
 * The price a change leads to, from the price in effect now. Setting a price
 * is taken as typed; rounding applies to percentage and amount changes.
 */
export function applyPriceOp(
  currentCentavos: number,
  baseCentavos: number,
  op: PriceOp,
  rounding: Rounding
): number {
  switch (op.type) {
    case "set":
      return Math.round(op.priceCentavos);
    case "reset":
      return baseCentavos;
    case "percent":
      return roundPrice(currentCentavos * (1 + op.percent / 100), rounding);
    case "amount":
      return roundPrice(currentCentavos + op.centavos, rounding);
  }
}

/** Why a price can't be used, or null if it can. */
export function invalidPrice(centavos: number): string | null {
  if (!Number.isFinite(centavos) || !Number.isInteger(centavos)) return "Price must be in whole centavos.";
  if (centavos <= 0) return "Price would be ₱0 or less.";
  if (centavos > MAX_PRICE_CENTAVOS) return "Price would be over ₱1,000,000.";
  return null;
}

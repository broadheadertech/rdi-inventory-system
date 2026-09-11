// convex/_helpers/tenders.ts — how a POS sale was paid, split by tender.
//
// A sale is paid in one tender or split across two. Every report that splits
// takings by tender goes through tenderPortions, so a new tender lands in each
// of them instead of falling into whichever bucket an `else` happens to send it.

import { v } from "convex/values";

export const TENDERS = ["cash", "gcash", "maya", "bankTransfer"] as const;
export type Tender = (typeof TENDERS)[number];

export const tenderValidator = v.union(
  v.literal("cash"),
  v.literal("gcash"),
  v.literal("maya"),
  v.literal("bankTransfer")
);

type Paid = {
  paymentMethod: Tender;
  totalCentavos: number;
  splitPayment?: { method: Tender; amountCentavos: number };
};

/**
 * What each tender took on a sale. The primary tender gets the total less the
 * split portion. A return is stored with a negative total, so its portion is
 * negative and comes off the tender it was refunded in.
 */
export function tenderPortions(t: Paid): { method: Tender; amountCentavos: number }[] {
  const splitAmt = t.splitPayment?.amountCentavos ?? 0;
  const portions = [{ method: t.paymentMethod, amountCentavos: t.totalCentavos - splitAmt }];
  if (t.splitPayment && splitAmt > 0) {
    portions.push({ method: t.splitPayment.method, amountCentavos: splitAmt });
  }
  return portions;
}

/** The report field each tender's takings are filed under. */
export const TENDER_SALES_FIELD = {
  cash: "cashSalesCentavos",
  gcash: "gcashSalesCentavos",
  maya: "mayaSalesCentavos",
  bankTransfer: "bankTransferSalesCentavos",
} as const satisfies Record<Tender, string>;

export type TenderTotals = Record<Tender, number>;

export function emptyTenderTotals(): TenderTotals {
  return { cash: 0, gcash: 0, maya: 0, bankTransfer: 0 };
}

/** Adds a sale's portions to running per-tender totals. */
export function addTenders(totals: TenderTotals, t: Paid): void {
  for (const p of tenderPortions(t)) totals[p.method] += p.amountCentavos;
}

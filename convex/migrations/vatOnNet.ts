// convex/migrations/vatOnNet.ts — restate VAT on what was actually received.
//
// Until the subtotal/total restructure, a promotion was taken off the total
// AFTER the VAT had been struck on the gross. So every sale carrying a
// promotion stored VAT on money nobody received: a ₱1,000 sale with ₱100 off
// stored ₱107.14 of VAT against a ₱900 total, and the invoice did not foot —
// VATable ₱892.86 plus VAT ₱107.14 came to ₱1,000.
//
// New sales are right. This restates the old ones.
//
// ─── READ THIS BEFORE RUNNING IT ────────────────────────────────────────────
//
// Z-readings are filed. If a period has already been filed with the old
// figures, restating the transactions behind it makes the system disagree with
// the return that was filed, and that is an accounting decision rather than a
// technical one. Check with whoever files before touching a filed period.
//
// So it reports by default and changes nothing:
//
//   npx convex run migrations/vatOnNet:restateVatOnNet
//   npx convex run migrations/vatOnNet:restateVatOnNet '{"apply":true}'
//
// Only non-exempt sales carrying a promotion are touched. Senior/PWD sales
// never had a promotion stacked on them and already store zero VAT, so they
// are left exactly as they are. subtotalCentavos (the gross) and totalCentavos
// (what was paid) are never altered — only the VAT split inside the total,
// which is the figure that was wrong.

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { calculateVat } from "../_helpers/taxCalculations";

export const restateVatOnNet = internalMutation({
  args: { apply: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const apply = args.apply === true;
    const txns = await ctx.db.query("transactions").collect();

    let examined = 0;
    let changed = 0;
    let vatBefore = 0;
    let vatAfter = 0;
    const samples: {
      receiptNumber: string;
      totalCentavos: number;
      vatWas: number;
      vatNow: number;
    }[] = [];

    for (const txn of txns) {
      if (txn.status === "voided") continue;
      if (txn.discountType === "senior" || txn.discountType === "pwd") continue;
      // A refund is its own negative transaction and carries no VAT split.
      if (txn.totalCentavos < 0) continue;
      examined++;

      const correct = calculateVat(txn.totalCentavos);
      if (correct === txn.vatAmountCentavos) continue;

      vatBefore += txn.vatAmountCentavos;
      vatAfter += correct;
      changed++;
      if (samples.length < 10) {
        samples.push({
          receiptNumber: txn.receiptNumber,
          totalCentavos: txn.totalCentavos,
          vatWas: txn.vatAmountCentavos,
          vatNow: correct,
        });
      }

      if (apply) {
        await ctx.db.patch(txn._id, { vatAmountCentavos: correct });
      }
    }

    return {
      applied: apply,
      examined,
      changed,
      vatBeforeCentavos: vatBefore,
      vatAfterCentavos: vatAfter,
      // Positive means output VAT was over-stated by this much on those sales.
      overstatedByCentavos: vatBefore - vatAfter,
      samples,
    };
  },
});

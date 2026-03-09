import { v } from "convex/values";
import { query } from "../_generated/server";

const COD_FEE_CENTAVOS = 5000; // ₱50

export const calculatePartialCod = query({
  args: {
    totalCentavos: v.number(),
  },
  handler: async (_ctx, args) => {
    const { totalCentavos } = args;
    const halfAmount = Math.ceil(totalCentavos / 2);

    return [
      {
        method: "full_online" as const,
        label: "Pay Online",
        description: "Pay the full amount now",
        onlineAmount: totalCentavos,
        codAmount: 0,
        fee: 0,
        totalWithFee: totalCentavos,
      },
      {
        method: "partial_cod" as const,
        label: "Split Payment",
        description: "Pay 50% now, 50% on delivery",
        onlineAmount: halfAmount,
        codAmount: totalCentavos - halfAmount,
        fee: 0,
        totalWithFee: totalCentavos,
      },
      {
        method: "full_cod" as const,
        label: "Cash on Delivery",
        description: "Pay full amount on delivery",
        onlineAmount: 0,
        codAmount: totalCentavos,
        fee: COD_FEE_CENTAVOS,
        totalWithFee: totalCentavos + COD_FEE_CENTAVOS,
      },
    ];
  },
});

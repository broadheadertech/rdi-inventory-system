import { v } from "convex/values";
import { query } from "../_generated/server";

export const getFulfillmentOptions = query({
  args: { variantId: v.id("variants") },
  handler: async (ctx, args) => {
    // Get all inventory for this variant across branches
    const inventoryRecords = await ctx.db
      .query("inventory")
      .withIndex("by_variant", (q) => q.eq("variantId", args.variantId))
      .collect();

    const inStockRecords = inventoryRecords.filter((inv) => inv.quantity > 0);

    const options = [];

    for (const inv of inStockRecords) {
      const branch = await ctx.db.get(inv.branchId);
      if (!branch || !branch.isActive) continue;
      if (branch.channel === "warehouse") continue; // Skip warehouse branches

      options.push({
        type: "pickup" as const,
        branchId: inv.branchId,
        branchName: branch.name,
        branchAddress: branch.address,
        estimatedMinutes: 15, // Ready for pickup in ~15 min
        stock: inv.quantity,
        label: `Pick up at ${branch.name}`,
        description: "Ready in ~15 minutes",
      });
    }

    // Add delivery options (always available if any stock exists)
    if (inStockRecords.length > 0) {
      options.push({
        type: "express" as const,
        branchId: null,
        branchName: null,
        branchAddress: null,
        estimatedMinutes: 120, // 2 hours
        stock: null,
        label: "Express Delivery",
        description: "Get it in ~2 hours",
      });

      options.push({
        type: "standard" as const,
        branchId: null,
        branchName: null,
        branchAddress: null,
        estimatedMinutes: 1440, // 1 day
        stock: null,
        label: "Standard Delivery",
        description: "Arrives in 1-3 business days",
      });
    }

    // Sort by estimated time (fastest first)
    options.sort((a, b) => a.estimatedMinutes - b.estimatedMinutes);

    return options;
  },
});

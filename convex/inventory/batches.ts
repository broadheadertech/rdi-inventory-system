import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireRole, ADMIN_ROLES } from "../_helpers/permissions";

// ─── Get batches for a specific branch+variant (admin view) ─────────────────

export const getBatchesForInventory = query({
  args: {
    branchId: v.id("branches"),
    variantId: v.id("variants"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);

    const batches = await ctx.db
      .query("inventoryBatches")
      .withIndex("by_branch_variant_received", (q) =>
        q.eq("branchId", args.branchId).eq("variantId", args.variantId)
      )
      .collect();

    return batches.map((b) => ({
      _id: b._id,
      quantity: b.quantity,
      costPriceCentavos: b.costPriceCentavos,
      receivedAt: b.receivedAt,
      source: b.source,
      sourceId: b.sourceId,
      notes: b.notes,
      createdAt: b.createdAt,
    }));
  },
});

// ─── Get batch summary for a branch (total cost, batch count) ───────────────

export const getBranchBatchSummary = query({
  args: {
    branchId: v.id("branches"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);

    const batches = await ctx.db
      .query("inventoryBatches")
      .withIndex("by_branch_variant", (q) =>
        q.eq("branchId", args.branchId)
      )
      .collect();

    let totalBatches = 0;
    let totalUnits = 0;
    let totalCostCentavos = 0;

    for (const batch of batches) {
      totalBatches++;
      totalUnits += batch.quantity;
      totalCostCentavos += batch.quantity * batch.costPriceCentavos;
    }

    return {
      totalBatches,
      totalUnits,
      totalCostCentavos,
    };
  },
});

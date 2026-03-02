import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Release held stock back to available inventory.
 * Used when a transfer is rejected or cancelled — the goods never left,
 * so we restore reservedQuantity → quantity.
 */
export async function releaseHeldStock(
  ctx: MutationCtx,
  transferId: Id<"transfers">,
  fromBranchId: Id<"branches">
) {
  const transferItems = await ctx.db
    .query("transferItems")
    .withIndex("by_transfer", (q) => q.eq("transferId", transferId))
    .collect();

  for (const item of transferItems) {
    const inv = await ctx.db
      .query("inventory")
      .withIndex("by_branch_variant", (q) =>
        q.eq("branchId", fromBranchId).eq("variantId", item.variantId)
      )
      .unique();

    if (inv) {
      await ctx.db.patch(inv._id, {
        quantity: inv.quantity + item.requestedQuantity,
        reservedQuantity: Math.max(0, (inv.reservedQuantity ?? 0) - item.requestedQuantity),
        updatedAt: Date.now(),
      });
    }
  }
}

/**
 * Clear reserved stock at source after delivery.
 * Used when a transfer is delivered — the goods have physically left the source,
 * so we only reduce reservedQuantity (do NOT add back to quantity).
 */
export async function clearReservedOnDelivery(
  ctx: MutationCtx,
  transferId: Id<"transfers">,
  fromBranchId: Id<"branches">
) {
  const transferItems = await ctx.db
    .query("transferItems")
    .withIndex("by_transfer", (q) => q.eq("transferId", transferId))
    .collect();

  for (const item of transferItems) {
    const inv = await ctx.db
      .query("inventory")
      .withIndex("by_branch_variant", (q) =>
        q.eq("branchId", fromBranchId).eq("variantId", item.variantId)
      )
      .unique();

    if (inv) {
      await ctx.db.patch(inv._id, {
        reservedQuantity: Math.max(0, (inv.reservedQuantity ?? 0) - item.requestedQuantity),
        updatedAt: Date.now(),
      });
    }
  }
}

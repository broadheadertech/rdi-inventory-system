// convex/_helpers/transferStock.ts — the stock a transfer is holding.
//
// A transfer takes its stock at the moment it is requested: the units come off
// the source's sellable quantity, go into reservedQuantity, and the oldest
// batches at the source are eaten to pay for them. Everything after that has to
// mirror it exactly, and three things did not:
//
//   a partial pack   the source was charged the REQUESTED quantity, but only
//                    the packed quantity ever arrived anywhere. The difference
//                    was charged to nobody and simply vanished.
//   a release        rejecting or cancelling put the units back on the
//                    quantity but never restored the batches they came from,
//                    so the batch ledger drifted below the stock it describes.
//   a missing hold   a transfer created without holding anything still got its
//                    reservation cleared on delivery and its stock "returned"
//                    on cancel, inventing stock that never existed.
//
// So a hold is now written down. Every batch slice a transfer eats is recorded
// in transferStockHolds, and releasing gives back exactly those slices — same
// cost, same received date, so a two-year-old piece coming back from a
// cancelled transfer is still two years old.

import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type HoldItem = { variantId: Id<"variants">; quantity: number };

/**
 * Takes stock off the source for a transfer: quantity → reserved, oldest
 * batches consumed, and every slice consumed written down so it can be given
 * back exactly as it was.
 */
export async function holdStockForTransfer(
  ctx: MutationCtx,
  args: {
    transferId: Id<"transfers">;
    fromBranchId: Id<"branches">;
    items: HoldItem[];
  }
): Promise<void> {
  const now = Date.now();

  for (const item of args.items) {
    if (item.quantity <= 0) continue;

    const inv = await ctx.db
      .query("inventory")
      .withIndex("by_branch_variant", (q) =>
        q.eq("branchId", args.fromBranchId).eq("variantId", item.variantId)
      )
      .unique();

    const available = inv?.quantity ?? 0;
    if (!inv || item.quantity > available) {
      const variant = await ctx.db.get(item.variantId);
      throw new ConvexError({
        code: "INSUFFICIENT_STOCK",
        message: `Not enough stock for ${variant?.sku ?? "item"}: need ${item.quantity}, have ${available} at source.`,
      });
    }

    await ctx.db.patch(inv._id, {
      quantity: available - item.quantity,
      reservedQuantity: (inv.reservedQuantity ?? 0) + item.quantity,
      updatedAt: now,
    });

    // Oldest first, and each slice taken is recorded against the transfer.
    let remaining = item.quantity;
    const batches = await ctx.db
      .query("inventoryBatches")
      .withIndex("by_branch_variant_received", (q) =>
        q.eq("branchId", args.fromBranchId).eq("variantId", item.variantId)
      )
      .collect();

    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(batch.quantity, remaining);

      await ctx.db.insert("transferStockHolds", {
        transferId: args.transferId,
        branchId: args.fromBranchId,
        variantId: item.variantId,
        quantity: take,
        costPriceCentavos: batch.costPriceCentavos,
        receivedAt: batch.receivedAt,
        source: batch.source,
        ...(batch.sourceId ? { sourceId: batch.sourceId } : {}),
        ...(batch.notes ? { notes: batch.notes } : {}),
        createdAt: now,
      });

      if (take === batch.quantity) {
        await ctx.db.delete(batch._id);
      } else {
        await ctx.db.patch(batch._id, { quantity: batch.quantity - take });
      }
      remaining -= take;
    }

    // Stock with no batch behind it still has to be held, or the units would
    // be charged to the source twice over. It comes back as a batch dated now.
    if (remaining > 0) {
      const variant = await ctx.db.get(item.variantId);
      await ctx.db.insert("transferStockHolds", {
        transferId: args.transferId,
        branchId: args.fromBranchId,
        variantId: item.variantId,
        quantity: remaining,
        costPriceCentavos: variant?.costPriceCentavos ?? variant?.priceCentavos ?? 0,
        receivedAt: now,
        source: "adjustment",
        notes: "Held with no batch on record",
        createdAt: now,
      });
    }
  }
}

/** The slices a transfer is still holding, newest received first. */
async function holdsFor(
  ctx: MutationCtx,
  transferId: Id<"transfers">
): Promise<Doc<"transferStockHolds">[]> {
  const holds = await ctx.db
    .query("transferStockHolds")
    .withIndex("by_transfer", (q) => q.eq("transferId", transferId))
    .collect();
  // Newest back first: when only part is given back, the oldest stock is the
  // stock that genuinely left, which is what first-in-first-out means.
  return holds.sort((a, b) => b.receivedAt - a.receivedAt);
}

/**
 * Puts one slice back on the shelf as the batch it came from.
 *
 * When the batch it was taken from is still there — a transfer that took part
 * of it — the units go back into that row rather than beside it. Otherwise a
 * batch would split a little further every time a transfer was cancelled, and
 * the ledger would fill with fragments of the same delivery.
 */
async function restoreSlice(
  ctx: MutationCtx,
  hold: Doc<"transferStockHolds">,
  quantity: number,
  now: number
): Promise<void> {
  const siblings = await ctx.db
    .query("inventoryBatches")
    .withIndex("by_branch_variant_received", (q) =>
      q.eq("branchId", hold.branchId).eq("variantId", hold.variantId)
    )
    .collect();
  const sameBatch = siblings.find(
    (b) =>
      b.receivedAt === hold.receivedAt &&
      b.costPriceCentavos === hold.costPriceCentavos &&
      b.source === hold.source &&
      (b.sourceId ?? null) === (hold.sourceId ?? null)
  );
  if (sameBatch) {
    await ctx.db.patch(sameBatch._id, { quantity: sameBatch.quantity + quantity });
    return;
  }

  await ctx.db.insert("inventoryBatches", {
    branchId: hold.branchId,
    variantId: hold.variantId,
    quantity,
    costPriceCentavos: hold.costPriceCentavos,
    receivedAt: hold.receivedAt,
    source: hold.source,
    ...(hold.sourceId ? { sourceId: hold.sourceId } : {}),
    ...(hold.notes ? { notes: hold.notes } : {}),
    createdAt: now,
  });
}

async function addBackToInventory(
  ctx: MutationCtx,
  branchId: Id<"branches">,
  variantId: Id<"variants">,
  quantity: number,
  now: number
): Promise<void> {
  if (quantity <= 0) return;
  const inv = await ctx.db
    .query("inventory")
    .withIndex("by_branch_variant", (q) =>
      q.eq("branchId", branchId).eq("variantId", variantId)
    )
    .unique();
  if (!inv) return;
  await ctx.db.patch(inv._id, {
    quantity: inv.quantity + quantity,
    reservedQuantity: Math.max(0, (inv.reservedQuantity ?? 0) - quantity),
    updatedAt: now,
  });
}

/**
 * Gives back everything a transfer is still holding — the goods never left, so
 * the units return to the shelf and the batches they came from are rebuilt.
 *
 * Used when a transfer is rejected or cancelled.
 */
export async function releaseHeldStock(
  ctx: MutationCtx,
  transferId: Id<"transfers">,
  fromBranchId: Id<"branches">
): Promise<void> {
  const now = Date.now();
  const holds = await holdsFor(ctx, transferId);

  if (holds.length > 0) {
    for (const hold of holds) {
      await addBackToInventory(ctx, hold.branchId, hold.variantId, hold.quantity, now);
      await restoreSlice(ctx, hold, hold.quantity, now);
      await ctx.db.delete(hold._id);
    }
    return;
  }

  // Transfers created before holds were written down. Their units go back on
  // the quantity as they always did; there is no record of which batches they
  // came from, so none is invented.
  const items = await ctx.db
    .query("transferItems")
    .withIndex("by_transfer", (q) => q.eq("transferId", transferId))
    .collect();
  for (const item of items) {
    await addBackToInventory(ctx, fromBranchId, item.variantId, item.requestedQuantity, now);
  }
}

/**
 * Gives back what was requested but not packed. The source was charged for the
 * whole request; only the packed pieces are going anywhere, so the rest belongs
 * back on the shelf the moment packing closes.
 */
export async function releaseUnpackedStock(
  ctx: MutationCtx,
  transferId: Id<"transfers">
): Promise<void> {
  const now = Date.now();
  const transfer = await ctx.db.get(transferId);
  if (!transfer) return;

  const items = await ctx.db
    .query("transferItems")
    .withIndex("by_transfer", (q) => q.eq("transferId", transferId))
    .collect();
  const holds = await holdsFor(ctx, transferId);

  for (const item of items) {
    const packed = item.packedQuantity ?? item.requestedQuantity;
    let giveBack = item.requestedQuantity - packed;
    if (giveBack <= 0) continue;

    const mine = holds.filter(
      (h) => (h.variantId as string) === (item.variantId as string)
    );
    if (mine.length === 0) {
      // A transfer from before holds existed: the units still go back, with no
      // batch to rebuild because none was ever written down.
      await addBackToInventory(ctx, transfer.fromBranchId, item.variantId, giveBack, now);
      continue;
    }

    for (const hold of mine) {
      if (giveBack <= 0) break;
      const take = Math.min(hold.quantity, giveBack);
      await addBackToInventory(ctx, hold.branchId, hold.variantId, take, now);
      await restoreSlice(ctx, hold, take, now);
      if (take === hold.quantity) {
        await ctx.db.delete(hold._id);
      } else {
        await ctx.db.patch(hold._id, { quantity: hold.quantity - take });
      }
      giveBack -= take;
    }
  }
}

/**
 * Clears the reservation once the goods have physically gone. They are not
 * coming back to this shelf, so only reservedQuantity falls — the quantity was
 * already charged when the transfer was requested, and the batches went with
 * it.
 */
export async function clearReservedOnDelivery(
  ctx: MutationCtx,
  transferId: Id<"transfers">,
  fromBranchId: Id<"branches">
): Promise<void> {
  const now = Date.now();
  const holds = await holdsFor(ctx, transferId);

  if (holds.length > 0) {
    // What is still held after packing is exactly what was packed.
    const byVariant = new Map<string, number>();
    for (const hold of holds) {
      const key = hold.variantId as string;
      byVariant.set(key, (byVariant.get(key) ?? 0) + hold.quantity);
      await ctx.db.delete(hold._id);
    }
    for (const [variantKey, quantity] of byVariant) {
      const inv = await ctx.db
        .query("inventory")
        .withIndex("by_branch_variant", (q) =>
          q.eq("branchId", fromBranchId).eq("variantId", variantKey as Id<"variants">)
        )
        .unique();
      if (!inv) continue;
      await ctx.db.patch(inv._id, {
        reservedQuantity: Math.max(0, (inv.reservedQuantity ?? 0) - quantity),
        updatedAt: now,
      });
    }
    return;
  }

  // Transfers from before holds were written down.
  const items = await ctx.db
    .query("transferItems")
    .withIndex("by_transfer", (q) => q.eq("transferId", transferId))
    .collect();
  for (const item of items) {
    const inv = await ctx.db
      .query("inventory")
      .withIndex("by_branch_variant", (q) =>
        q.eq("branchId", fromBranchId).eq("variantId", item.variantId)
      )
      .unique();
    if (!inv) continue;
    await ctx.db.patch(inv._id, {
      reservedQuantity: Math.max(
        0,
        (inv.reservedQuantity ?? 0) - (item.packedQuantity ?? item.requestedQuantity)
      ),
      updatedAt: now,
    });
  }
}

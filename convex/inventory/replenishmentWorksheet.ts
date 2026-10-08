// convex/inventory/replenishmentWorksheet.ts — what merchandising should send,
// as a sheet to edit.
//
// Replenishment in RDI has only ever been a PULL: orderingCycles are per
// branch, the branch manager edits the quantities, HQ signs off. Merchandising
// works the other way — it decides the top-up and pushes it — and there was no
// path for that. restockSuggestions, demandLogs, branchScores and
// variantDailySnapshots were all being written and nothing turned any of them
// into stock movement.
//
// This closes that, without a second allocation pipeline. It PROPOSES
// quantities; the merchandiser edits them in a spreadsheet; the file goes back
// through transfers/allocations:uploadAllocation, which already holds the
// stock, raises one request per store and lands them in the logistics queue
// for approval. One pipeline, two ways in.
//
// The proposal, per store and product:
//
//   cover      = daily velocity over the window x cover days
//   shortfall  = cover - on hand - already on its way
//   suggested  = shortfall, capped by what the warehouse can actually give
//
// Velocity comes from transactions rather than from restockSuggestions,
// because a suggestion is a snapshot written at some past moment and a
// merchandiser is deciding now. Units already in transit are subtracted or
// every weekly run would re-send last week's order.

import { query } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { withBranchScope } from "../_helpers/withBranchScope";
import { HQ_ROLES } from "../_helpers/permissions";

const WORKSHEET_ROLES = Array.from(new Set([...HQ_ROLES, "merchandiser", "warehouseStaff"]));

/** Rows past this and nobody is reading the sheet anyway. */
const MAX_ROWS = 2000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A transfer that has left or is about to is stock the store will get. */
const INBOUND_STATUSES = ["requested", "approved", "packed", "inTransit"];

export const buildReplenishmentWorksheet = query({
  args: {
    /** Stores to replenish. Empty means every active retail store. */
    branchIds: v.optional(v.array(v.id("branches"))),
    brandId: v.optional(v.id("brands")),
    /** Days of stock each store should be holding. */
    coverDays: v.optional(v.number()),
    /** Days of history the velocity is read from. */
    lookbackDays: v.optional(v.number()),
    /** Leave out rows the warehouse cannot supply at all. */
    onlySuppliable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!WORKSHEET_ROLES.includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const coverDays = Math.min(120, Math.max(1, Math.floor(args.coverDays ?? 21)));
    const lookbackDays = Math.min(
      365,
      Math.max(7, Math.floor(args.lookbackDays ?? 30))
    );

    const branches = await ctx.db.query("branches").collect();
    const warehouse = branches.find((b) => b.isActive && b.channel === "warehouse");
    if (!warehouse) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "No active central warehouse to replenish from.",
      });
    }

    const wanted = new Set((args.branchIds ?? []).map((id) => id as string));
    const targets = branches.filter(
      (b) =>
        b.isActive &&
        b.channel !== "warehouse" &&
        (wanted.size === 0 || wanted.has(b._id as string))
    );

    // What the warehouse can give. A proposal above this is a promise the
    // warehouse cannot keep, and the upload would refuse the row anyway.
    const warehouseStock = new Map<string, number>();
    for (const row of await ctx.db
      .query("inventory")
      .withIndex("by_branch", (q) => q.eq("branchId", warehouse._id))
      .collect()) {
      warehouseStock.set(row.variantId as string, row.quantity);
    }

    const sinceMs = Date.now() - lookbackDays * DAY_MS;
    const styleCache = new Map<string, Doc<"styles"> | null>();
    const brandOfStyle = new Map<string, Id<"brands"> | null>();
    const variantCache = new Map<string, Doc<"variants"> | null>();

    async function variantOf(id: Id<"variants">) {
      const key = id as string;
      if (!variantCache.has(key)) variantCache.set(key, await ctx.db.get(id));
      return variantCache.get(key) ?? null;
    }

    /** Brand sits on the style, falling back to its category. */
    async function brandOf(variant: Doc<"variants">): Promise<Id<"brands"> | null> {
      const key = variant.styleId as string;
      if (brandOfStyle.has(key)) return brandOfStyle.get(key) ?? null;
      let style = styleCache.get(key);
      if (style === undefined) {
        style = await ctx.db.get(variant.styleId);
        styleCache.set(key, style);
      }
      let brandId = style?.brandId ?? null;
      if (!brandId && style?.categoryId) {
        brandId = (await ctx.db.get(style.categoryId))?.brandId ?? null;
      }
      brandOfStyle.set(key, brandId);
      return brandId;
    }

    type Row = {
      branchId: Id<"branches">;
      branchName: string;
      variantId: Id<"variants">;
      sku: string;
      productName: string;
      size: string;
      color: string;
      brandName: string | null;
      unitsSold: number;
      dailyVelocity: number;
      onHand: number;
      incoming: number;
      coverTarget: number;
      shortfall: number;
      /** What the sheet proposes: the shortfall, capped by warehouse stock. */
      suggestedQuantity: number;
      warehouseStock: number;
      /** Set when the warehouse cannot cover the shortfall. */
      capped: boolean;
    };

    const rows: Row[] = [];
    let truncated = false;
    const brandNameCache = new Map<string, string | null>();

    for (const branch of targets) {
      // ── What this store has sold, and holds ──────────────────────────────
      const sold = new Map<string, number>();
      const txns = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", branch._id).gte("createdAt", sinceMs)
        )
        .collect();
      for (const txn of txns) {
        if (txn.status === "voided") continue;
        for (const item of await ctx.db
          .query("transactionItems")
          .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
          .collect()) {
          // Returns carry a negative quantity and net off demand, which is
          // what they are: stock that came back and can be sold again.
          sold.set(
            item.variantId as string,
            (sold.get(item.variantId as string) ?? 0) + item.quantity
          );
        }
      }

      const onHand = new Map<string, number>();
      for (const row of await ctx.db
        .query("inventory")
        .withIndex("by_branch", (q) => q.eq("branchId", branch._id))
        .collect()) {
        onHand.set(row.variantId as string, row.quantity);
      }

      // ── What is already on its way, so a weekly run does not re-send it ──
      const incoming = new Map<string, number>();
      for (const transfer of await ctx.db
        .query("transfers")
        .withIndex("by_to_branch", (q) => q.eq("toBranchId", branch._id))
        .collect()) {
        if (!INBOUND_STATUSES.includes(transfer.status)) continue;
        for (const item of await ctx.db
          .query("transferItems")
          .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
          .collect()) {
          const units = item.packedQuantity ?? item.requestedQuantity;
          incoming.set(
            item.variantId as string,
            (incoming.get(item.variantId as string) ?? 0) + units
          );
        }
      }

      // Everything this store has sold or holds is a candidate. A product it
      // has never carried and does not hold is not replenishment — that is an
      // allocation decision, and the allocation upload is the tool for it.
      const candidates = new Set<string>([...sold.keys(), ...onHand.keys()]);

      for (const key of candidates) {
        if (rows.length >= MAX_ROWS) {
          truncated = true;
          break;
        }
        const variant = await variantOf(key as Id<"variants">);
        if (!variant || !variant.isActive) continue;

        const brandId = await brandOf(variant);
        if (args.brandId && brandId !== args.brandId) continue;

        const unitsSold = Math.max(0, sold.get(key) ?? 0);
        if (unitsSold === 0) continue; // nothing to replenish against

        const velocity = unitsSold / lookbackDays;
        const coverTarget = Math.ceil(velocity * coverDays);
        const have = onHand.get(key) ?? 0;
        const onItsWay = incoming.get(key) ?? 0;
        const shortfall = coverTarget - have - onItsWay;
        if (shortfall <= 0) continue;

        const available = warehouseStock.get(key) ?? 0;
        const suggested = Math.min(shortfall, available);
        if (args.onlySuppliable && suggested <= 0) continue;

        let brandName = brandId ? brandNameCache.get(brandId as string) : null;
        if (brandId && brandName === undefined) {
          brandName = (await ctx.db.get(brandId))?.name ?? null;
          brandNameCache.set(brandId as string, brandName);
        }

        let style = styleCache.get(variant.styleId as string);
        if (style === undefined) {
          style = await ctx.db.get(variant.styleId);
          styleCache.set(variant.styleId as string, style);
        }

        rows.push({
          branchId: branch._id,
          branchName: branch.name,
          variantId: variant._id,
          sku: variant.sku,
          productName: style?.name ?? "Unknown",
          size: variant.size ?? "",
          color: variant.color ?? "",
          brandName: brandName ?? null,
          unitsSold,
          dailyVelocity: Math.round(velocity * 100) / 100,
          onHand: have,
          incoming: onItsWay,
          coverTarget,
          shortfall,
          suggestedQuantity: suggested,
          warehouseStock: available,
          capped: suggested < shortfall,
        });
      }
      if (truncated) break;
    }

    // Biggest gap first: that is the order a merchandiser edits in.
    rows.sort(
      (a, b) =>
        b.shortfall - a.shortfall ||
        a.branchName.localeCompare(b.branchName) ||
        a.sku.localeCompare(b.sku)
    );

    const suggestedUnits = rows.reduce((sum, r) => sum + r.suggestedQuantity, 0);
    const shortfallUnits = rows.reduce((sum, r) => sum + r.shortfall, 0);

    return {
      warehouseName: warehouse._id === undefined ? null : warehouse.name,
      coverDays,
      lookbackDays,
      rows,
      truncated,
      totals: {
        rows: rows.length,
        branches: new Set(rows.map((r) => r.branchId as string)).size,
        suggestedUnits,
        shortfallUnits,
        // Rows the warehouse cannot fully cover. A big number here means the
        // warehouse needs a purchase order, not a transfer.
        cappedRows: rows.filter((r) => r.capped).length,
        unsuppliableRows: rows.filter((r) => r.suggestedQuantity === 0).length,
      },
      branches: branches
        .filter((b) => b.isActive && b.channel !== "warehouse")
        .map((b) => ({ _id: b._id, name: b.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});

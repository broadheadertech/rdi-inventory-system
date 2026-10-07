// convex/inventory/movementReport.ts — the stock card, from live data.
//
// The business already reads this report. It arrives as a file from the old
// system — one row per product per store per month, with BeginningInv, Sale,
// Container, Return, MovementOut, MovementIn, RPO and EndingBalance — and RDI
// could only ever import it (see ./legacyStock). This produces the same report
// from what RDI itself recorded.
//
// Where each column comes from:
//
//   Sale         transactionItems with a positive quantity
//   Return       transactionItems with a negative quantity — a refund or
//                exchange is its own transaction with negative lines
//   Container    delivered IN from the central warehouse
//   MovementIn   delivered IN from another store
//   MovementOut  delivered OUT to another store
//   RPO          delivered OUT to the warehouse
//
// Every transfer column is counted on deliveredAt, not on dispatch, so one
// transfer leaves the sender and reaches the receiver in the same month. Stock
// on a truck belongs to neither side's movements and is still the sender's
// balance — which is why the balance basis is sellable PLUS reserved, since
// RDI only releases a sender's reservation when the goods actually land.
//
// IN is counted as what was RECEIVED and OUT as what was PACKED. When those
// disagree the units went missing in transit, and the pair of figures is where
// that shows; the logistics report prices it.
//
// The balances are derived — nothing stores a month-end snapshot — so the
// latest month is exact and earlier months are only as good as the movement
// record. The report says so, and shows the variance against an uploaded month
// wherever one exists.

import { query } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { withBranchScope } from "../_helpers/withBranchScope";
import { HQ_ROLES } from "../_helpers/permissions";
import {
  addCounts,
  balances,
  closes,
  emptyCounts,
  hasMovement,
  isPeriod,
  netChange,
  periodBounds,
  periodOf,
  shiftPeriod,
  unitsIn,
  unitsOut,
  type MovementCounts,
} from "./movementMath";

// A manager reads their own store's card; HQ and the warehouse read any.
const REPORT_ROLES = ["admin", "hqStaff", "warehouseStaff", "manager"];

/** Rows past this and the page is unreadable anyway — narrow the filters. */
const MAX_ROWS = 1500;

/** How far back a period may be asked for. The walk-back costs more the older
 *  the month, since everything since has to be unwound. */
const MAX_PERIODS_BACK = 24;

type Bucket = { inMonth: MovementCounts; afterMonth: MovementCounts };

function newBucket(): Bucket {
  return { inMonth: emptyCounts(), afterMonth: emptyCounts() };
}

// ─── listMovementPeriods ─────────────────────────────────────────────────────
// Which months can be asked for, and which of them have an uploaded file
// behind them, so the picker never offers a month with nothing in it.

export const listMovementPeriods = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    if (!REPORT_ROLES.includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const uploaded = new Set(
      (await ctx.db.query("legacyStockMovements").collect()).map((row) => row.period)
    );

    const current = periodOf(Date.now());
    const periods: { period: string; hasUpload: boolean }[] = [];
    for (let back = 0; back < MAX_PERIODS_BACK; back++) {
      const period = shiftPeriod(current, -back);
      periods.push({ period, hasUpload: uploaded.has(period) });
    }

    const branches = await ctx.db.query("branches").collect();
    const isHq = (HQ_ROLES as readonly string[]).includes(scope.user.role) ||
      scope.user.role === "warehouseStaff";

    return {
      periods,
      current,
      // A manager gets their own store and no picker; everyone else chooses.
      branches: branches
        .filter((b) => b.isActive && (isHq || b._id === scope.branchId))
        .map((b) => ({ _id: b._id, name: b.name, channel: b.channel ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      canPickBranch: isHq,
    };
  },
});

// ─── getStockMovementReport ──────────────────────────────────────────────────

export const getStockMovementReport = query({
  args: {
    period: v.string(), // YYYY-MM
    branchId: v.id("branches"),
    brandId: v.optional(v.id("brands")),
    /** Matches a SKU or a product name. */
    search: v.optional(v.string()),
    /** Products that neither moved nor are held are left out unless asked for. */
    includeIdle: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!REPORT_ROLES.includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }
    // The branchId argument comes from the client, so a branch-scoped caller
    // must not be able to read another store's card through it.
    const isHq =
      (HQ_ROLES as readonly string[]).includes(scope.user.role) ||
      scope.user.role === "warehouseStaff";
    if (!isHq && scope.branchId !== args.branchId) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "You can only read your own store's movement report.",
      });
    }
    if (!isPeriod(args.period)) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "A period reads as YYYY-MM, for example 2026-10.",
      });
    }

    const branch = await ctx.db.get(args.branchId);
    if (!branch) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Branch not found." });
    }

    const { startMs, endMs } = periodBounds(args.period);
    const now = Date.now();
    if (startMs > now) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "That month has not started yet.",
      });
    }

    const buckets = new Map<string, Bucket>();
    const bucketFor = (variantId: Id<"variants">): Bucket => {
      const key = variantId as string;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = newBucket();
        buckets.set(key, bucket);
      }
      return bucket;
    };
    /** In the month being reported, or in the stretch since it closed. */
    const sideFor = (bucket: Bucket, at: number): MovementCounts =>
      at <= endMs ? bucket.inMonth : bucket.afterMonth;

    // ── Sales and customer returns ───────────────────────────────────────────
    // One scan from the start of the month to now: the stretch after the month
    // is what the balances are unwound through.
    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", args.branchId).gte("createdAt", startMs).lte("createdAt", now)
      )
      .collect();

    for (const txn of txns) {
      if (txn.status === "voided") continue;
      const items = await ctx.db
        .query("transactionItems")
        .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
        .collect();
      for (const item of items) {
        const side = sideFor(bucketFor(item.variantId), txn.createdAt);
        // A refund is its own transaction with negative lines, so the sign of
        // the line is what separates a sale from a return.
        if (item.quantity >= 0) side.sale += item.quantity;
        else side.customerReturn += -item.quantity;
      }
    }

    // ── Transfers, both directions ───────────────────────────────────────────
    const channelOf = new Map<string, string | null>();
    async function isWarehouse(branchId: Id<"branches">): Promise<boolean> {
      const key = branchId as string;
      if (!channelOf.has(key)) {
        const row = await ctx.db.get(branchId);
        channelOf.set(key, row?.channel ?? null);
      }
      return channelOf.get(key) === "warehouse";
    }

    const landedInWindow = (t: Doc<"transfers">) =>
      t.status === "delivered" &&
      t.deliveredAt !== undefined &&
      t.deliveredAt >= startMs &&
      t.deliveredAt <= now;

    const incoming = (
      await ctx.db
        .query("transfers")
        .withIndex("by_to_branch", (q) => q.eq("toBranchId", args.branchId))
        .collect()
    ).filter(landedInWindow);

    for (const transfer of incoming) {
      const fromWarehouse = await isWarehouse(transfer.fromBranchId);
      const items = await ctx.db
        .query("transferItems")
        .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
        .collect();
      for (const item of items) {
        // What arrived is what was counted in, not what was sent.
        const received = item.receivedQuantity ?? 0;
        if (received === 0) continue;
        const side = sideFor(bucketFor(item.variantId), transfer.deliveredAt as number);
        if (fromWarehouse) side.container += received;
        else side.movementIn += received;
      }
    }

    const outgoing = (
      await ctx.db
        .query("transfers")
        .withIndex("by_from_branch", (q) => q.eq("fromBranchId", args.branchId))
        .collect()
    ).filter(landedInWindow);

    for (const transfer of outgoing) {
      const toWarehouse = await isWarehouse(transfer.toBranchId);
      const items = await ctx.db
        .query("transferItems")
        .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
        .collect();
      for (const item of items) {
        // What left is what was packed; a transfer that never went through
        // packing is charged what was asked for.
        const sent = item.packedQuantity ?? item.requestedQuantity;
        if (sent === 0) continue;
        const side = sideFor(bucketFor(item.variantId), transfer.deliveredAt as number);
        if (toWarehouse) side.rpo += sent;
        else side.movementOut += sent;
      }
    }

    // ── What the branch holds now ────────────────────────────────────────────
    // Sellable plus reserved: stock held for a transfer is not sellable but it
    // is still this branch's, and the legacy EndingBalance was a physical
    // count that included it.
    const physicalNow = new Map<string, number>();
    const inventoryRows = await ctx.db
      .query("inventory")
      .withIndex("by_branch", (q) => q.eq("branchId", args.branchId))
      .collect();
    for (const row of inventoryRows) {
      physicalNow.set(
        row.variantId as string,
        row.quantity + (row.reservedQuantity ?? 0)
      );
    }

    // ── The uploaded month, where there is one ───────────────────────────────
    const legacyRows = await ctx.db
      .query("legacyStockMovements")
      .withIndex("by_branch_period", (q) =>
        q.eq("branchId", args.branchId).eq("period", args.period)
      )
      .collect();
    const legacyByVariant = new Map<string, Doc<"legacyStockMovements">>();
    for (const row of legacyRows) legacyByVariant.set(row.variantId as string, row);

    // ── Assemble the rows ────────────────────────────────────────────────────
    const variantIds = new Set<string>([
      ...buckets.keys(),
      ...physicalNow.keys(),
      ...legacyByVariant.keys(),
    ]);

    const search = args.search?.trim().toLowerCase() ?? "";
    const styleCache = new Map<string, Doc<"styles"> | null>();
    const brandOfStyle = new Map<string, Id<"brands"> | null>();

    type Row = {
      variantId: Id<"variants">;
      sku: string;
      productName: string;
      size: string;
      color: string;
      brandName: string | null;
      beginningInv: number;
      sale: number;
      customerReturn: number;
      container: number;
      movementIn: number;
      movementOut: number;
      rpo: number;
      endingBalance: number;
      /** What the shelf says today, for the latest month's cross-check. */
      physicalNow: number;
      /** The uploaded month's own ending balance, when there is one. */
      uploadedEndingBalance: number | null;
      /** uploaded − computed. Non-zero is real drift. */
      variance: number | null;
      /** Set when the uploaded row's own columns do not add up. */
      uploadDoesNotClose: boolean;
    };

    const rows: Row[] = [];
    let truncated = false;

    for (const key of variantIds) {
      if (rows.length >= MAX_ROWS) {
        truncated = true;
        break;
      }

      const variant = await ctx.db.get(key as Id<"variants">);
      if (!variant) continue;

      let style = styleCache.get(variant.styleId as string);
      if (style === undefined) {
        style = await ctx.db.get(variant.styleId);
        styleCache.set(variant.styleId as string, style);
      }

      // Brand sits on the style, falling back to its category — the same
      // reading the rest of the reports use.
      let brandId = brandOfStyle.get(variant.styleId as string);
      if (brandId === undefined) {
        brandId = style?.brandId ?? null;
        if (!brandId && style?.categoryId) {
          const category = await ctx.db.get(style.categoryId);
          brandId = category?.brandId ?? null;
        }
        brandOfStyle.set(variant.styleId as string, brandId);
      }
      if (args.brandId && brandId !== args.brandId) continue;

      const productName = style?.name ?? "Unknown";
      if (
        search &&
        !variant.sku.toLowerCase().includes(search) &&
        !productName.toLowerCase().includes(search)
      ) {
        continue;
      }

      const bucket = buckets.get(key) ?? newBucket();
      const physical = physicalNow.get(key) ?? 0;
      const { beginningInv, endingBalance } = balances({
        currentPhysical: physical,
        inMonth: bucket.inMonth,
        afterMonth: bucket.afterMonth,
      });

      const idle = !hasMovement(bucket.inMonth) && physical === 0 && endingBalance === 0;
      if (idle && !args.includeIdle && !legacyByVariant.has(key)) continue;

      const legacy = legacyByVariant.get(key) ?? null;
      const brandRow = brandId ? await ctx.db.get(brandId) : null;

      rows.push({
        variantId: variant._id,
        sku: variant.sku,
        productName,
        size: variant.size ?? "",
        color: variant.color ?? "",
        brandName: brandRow?.name ?? null,
        beginningInv,
        sale: bucket.inMonth.sale,
        customerReturn: bucket.inMonth.customerReturn,
        container: bucket.inMonth.container,
        movementIn: bucket.inMonth.movementIn,
        movementOut: bucket.inMonth.movementOut,
        rpo: bucket.inMonth.rpo,
        endingBalance,
        physicalNow: physical,
        uploadedEndingBalance: legacy?.endingBalance ?? null,
        variance: legacy ? legacy.endingBalance - endingBalance : null,
        uploadDoesNotClose: legacy
          ? !closes({
              beginningInv: legacy.beginningInv,
              endingBalance: legacy.endingBalance,
              counts: {
                sale: legacy.sale,
                customerReturn: legacy.returned,
                container: legacy.container,
                movementIn: legacy.movementIn,
                movementOut: legacy.movementOut,
                rpo: legacy.rpo,
              },
            })
          : false,
      });
    }

    rows.sort((a, b) => a.sku.localeCompare(b.sku));

    // ── Totals ───────────────────────────────────────────────────────────────
    const totals = emptyCounts();
    let beginningInv = 0;
    let endingBalance = 0;
    for (const row of rows) {
      addCounts(totals, {
        sale: row.sale,
        customerReturn: row.customerReturn,
        container: row.container,
        movementIn: row.movementIn,
        movementOut: row.movementOut,
        rpo: row.rpo,
      });
      beginningInv += row.beginningInv;
      endingBalance += row.endingBalance;
    }

    const isCurrentPeriod = args.period === periodOf(now);

    return {
      period: args.period,
      branchName: branch.name,
      isCurrentPeriod,
      // The latest month ends on today's figure; an earlier one is unwound
      // back to it, so the page can say which it is looking at.
      basis: isCurrentPeriod ? ("live" as const) : ("derived" as const),
      hasUpload: legacyRows.length > 0,
      uploadedRowCount: legacyRows.length,
      rows,
      truncated,
      totals: {
        beginningInv,
        ...totals,
        endingBalance,
        unitsIn: unitsIn(totals),
        unitsOut: unitsOut(totals),
        netChange: netChange(totals),
        products: rows.length,
        // Rows whose derived beginning balance is impossible. Stock cannot
        // have been negative, so each one is a movement the system never saw.
        negativeBeginning: rows.filter((r) => r.beginningInv < 0).length,
        variances: rows.filter((r) => r.variance !== null && r.variance !== 0).length,
      },
    };
  },
});

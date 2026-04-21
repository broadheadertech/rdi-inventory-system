// convex/snapshots/generate.ts
// Snapshot generation system — computes daily branch + variant metrics in chunks.
//
// Strategy: Split work across multiple mutations chained via ctx.scheduler.runAfter
// to avoid timeout at 400+ branches. Each chunk processes a batch of branches.
//
// Flow:
//   1. orchestrateSnapshots (internalAction) → kicks off branch chunks + variant chunk
//   2. _generateBranchChunk (internalMutation) → processes N branches → writes branchDailySnapshots
//   3. _generateVariantSnapshots (internalMutation) → aggregates variant sales → writes variantDailySnapshots

import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";

// ─── Constants ───────────────────────────────────────────────────────────────

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const BRANCH_CHUNK_SIZE = 20; // branches per mutation call
const VARIANT_CHUNK_SIZE = 500; // variants per mutation call

/** Returns today's date string "YYYY-MM-DD" in PHT. */
function todayPHT(): string {
  const nowPht = Date.now() + PHT_OFFSET_MS;
  const d = new Date(nowPht);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Returns UTC ms for the start of today in PHT. */
function todayStartMs(): number {
  const nowPht = Date.now() + PHT_OFFSET_MS;
  const floored = nowPht - (nowPht % DAY_MS);
  return floored - PHT_OFFSET_MS;
}

// ─── Helper: get all active branch IDs ───────────────────────────────────────

export const _getActiveBranchIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const branches = await ctx.db.query("branches").collect();
    return branches
      .filter((b) => b.isActive)
      .map((b) => ({ _id: b._id, name: b.name, channel: b.channel }));
  },
});

// ─── Helper: get all active variant IDs (chunked) ───────────────────────────

export const _getVariantIds = internalQuery({
  args: { cursor: v.optional(v.string()), limit: v.number() },
  handler: async (ctx, args) => {
    // Use simple pagination by _id comparison
    let query = ctx.db.query("variants");
    const all = await query.collect();
    const active = all.filter((v) => v.isActive);

    // Sort by _id for stable pagination
    active.sort((a, b) => (a._id < b._id ? -1 : 1));

    let startIdx = 0;
    if (args.cursor) {
      startIdx = active.findIndex((v) => v._id > (args.cursor as Id<"variants">));
      if (startIdx < 0) startIdx = active.length;
    }

    const chunk = active.slice(startIdx, startIdx + args.limit);
    const nextCursor = chunk.length === args.limit ? chunk[chunk.length - 1]._id : null;

    return {
      variants: chunk.map((v) => v._id),
      nextCursor,
    };
  },
});

// ─── Branch Snapshot Chunk ───────────────────────────────────────────────────
// Processes a chunk of branches and writes branchDailySnapshots rows.

export const _generateBranchChunk = internalMutation({
  args: {
    branchIds: v.array(v.id("branches")),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const dayStart = todayStartMs();
    const dayEnd = dayStart + DAY_MS;
    const thirtyDaysAgo = now - 30 * DAY_MS;

    for (const branchId of args.branchIds) {
      // Skip if already generated today for this branch
      const existing = await ctx.db
        .query("branchDailySnapshots")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", branchId).eq("date", args.date)
        )
        .first();
      if (existing) continue;

      // ── Sales metrics ──
      const txns = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", branchId).gte("createdAt", dayStart).lt("createdAt", dayEnd)
        )
        .collect();

      // Filter out voided
      const validTxns = txns.filter((t) => t.status !== "voided");

      let salesTotalCentavos = 0;
      let salesItemsSold = 0;
      let salesCash = 0;
      let salesGcash = 0;
      let salesMaya = 0;

      for (const txn of validTxns) {
        salesTotalCentavos += txn.totalCentavos;
        switch (txn.paymentMethod) {
          case "cash": salesCash += txn.totalCentavos; break;
          case "gcash": salesGcash += txn.totalCentavos; break;
          case "maya": salesMaya += txn.totalCentavos; break;
        }
        // Count items sold
        const items = await ctx.db
          .query("transactionItems")
          .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
          .collect();
        for (const item of items) {
          salesItemsSold += item.quantity;
        }
      }

      // ── Inventory health ──
      const inventory = await ctx.db
        .query("inventory")
        .withIndex("by_branch", (q) => q.eq("branchId", branchId))
        .collect();

      const totalSkus = inventory.length;
      let inStockCount = 0;
      let lowStockCount = 0;
      let outOfStockCount = 0;

      for (const inv of inventory) {
        if (inv.quantity <= 0) outOfStockCount++;
        else if (inv.quantity <= (inv.lowStockThreshold ?? 5)) lowStockCount++;
        else inStockCount++;
      }

      // ── Active alerts ──
      const alerts = await ctx.db
        .query("lowStockAlerts")
        .withIndex("by_branch_status", (q) =>
          q.eq("branchId", branchId).eq("status", "active")
        )
        .collect();

      // ── Transfers ──
      const pendingStatuses = ["requested", "approved", "packed", "inTransit"];

      const incomingTransfers = await ctx.db
        .query("transfers")
        .withIndex("by_to_branch", (q) => q.eq("toBranchId", branchId))
        .order("desc")
        .take(200);
      const incomingPending = incomingTransfers.filter((t) =>
        pendingStatuses.includes(t.status)
      );

      const outgoingTransfers = await ctx.db
        .query("transfers")
        .withIndex("by_from_branch", (q) => q.eq("fromBranchId", branchId))
        .order("desc")
        .take(200);
      const outgoingPending = outgoingTransfers.filter((t) =>
        pendingStatuses.includes(t.status)
      );

      // Avg fulfillment hours (delivered TO this branch, last 30d)
      const deliveredIncoming = incomingTransfers.filter(
        (t) => t.status === "delivered" && t.deliveredAt && t.deliveredAt >= thirtyDaysAgo
      );
      let avgFulfillmentHours = 0;
      if (deliveredIncoming.length > 0) {
        const totalHours = deliveredIncoming.reduce((sum, t) => {
          const h = ((t.deliveredAt ?? t.createdAt) - t.createdAt) / (1000 * 60 * 60);
          return sum + h;
        }, 0);
        avgFulfillmentHours = Math.round((totalHours / deliveredIncoming.length) * 10) / 10;
      }

      // ── Warehouse invoices (for warehouse-type branches) ──
      const invoices = await ctx.db
        .query("internalInvoices")
        .withIndex("by_createdAt", (q) =>
          q.gte("createdAt", dayStart).lt("createdAt", dayEnd)
        )
        .collect();
      const branchInvoices = invoices.filter(
        (inv) => (inv.fromBranchId as string) === (branchId as string)
      );
      const invoiceTotalCentavos = branchInvoices.reduce((s, i) => s + i.totalCentavos, 0);

      // ── Write snapshot ──
      await ctx.db.insert("branchDailySnapshots", {
        branchId,
        date: args.date,
        salesTotalCentavos,
        salesTransactionCount: validTxns.length,
        salesItemsSold,
        salesCash,
        salesGcash,
        salesMaya,
        totalSkus,
        inStockCount,
        lowStockCount,
        outOfStockCount,
        activeAlertCount: alerts.length,
        incomingPendingCount: incomingPending.length,
        outgoingPendingCount: outgoingPending.length,
        avgFulfillmentHours,
        invoiceTotalCentavos,
        invoiceCount: branchInvoices.length,
        generatedAt: now,
      });
    }
  },
});

// ─── Variant Snapshot Chunk ──────────────────────────────────────────────────
// Processes a chunk of variants and writes variantDailySnapshots rows.

export const _generateVariantChunk = internalMutation({
  args: {
    variantIds: v.array(v.id("variants")),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const dayStart = todayStartMs();
    const dayEnd = dayStart + DAY_MS;
    const sevenDaysAgo = dayStart - 7 * DAY_MS;

    // Cache for hierarchy lookups
    const styleCache = new Map<string, Doc<"styles"> | null>();
    const categoryCache = new Map<string, Doc<"categories"> | null>();
    const brandCache = new Map<string, Doc<"brands"> | null>();

    for (const variantId of args.variantIds) {
      // Skip if already generated
      const existing = await ctx.db
        .query("variantDailySnapshots")
        .withIndex("by_variant_date", (q) =>
          q.eq("variantId", variantId).eq("date", args.date)
        )
        .first();
      if (existing) continue;

      const variant = await ctx.db.get(variantId);
      if (!variant || !variant.isActive) continue;

      // ── Hierarchy resolution (cached) ──
      let style = styleCache.get(variant.styleId as string);
      if (style === undefined) {
        style = await ctx.db.get(variant.styleId);
        styleCache.set(variant.styleId as string, style);
      }
      if (!style) continue;

      let category = style.categoryId ? categoryCache.get(style.categoryId as string) : undefined;
      if (category === undefined && style.categoryId) {
        category = await ctx.db.get(style.categoryId);
        categoryCache.set(style.categoryId as string, category);
      }
      if (!category && !style.brandId) continue;

      const resolvedBrandId = (style.brandId ?? category?.brandId) as Id<"brands"> | undefined;
      if (!resolvedBrandId) continue;
      let brand = brandCache.get(resolvedBrandId as string);
      if (brand === undefined) {
        brand = await ctx.db.get(resolvedBrandId);
        brandCache.set(resolvedBrandId as string, brand);
      }
      if (!brand) continue;

      // ── Today's sales for this variant (via transactionItems index) ──
      const txnItems = await ctx.db
        .query("transactionItems")
        .withIndex("by_variant", (q) => q.eq("variantId", variantId))
        .collect();

      // Filter to today's transactions only
      const branchSalesMap = new Map<string, { qtySold: number; revenueCentavos: number }>();
      let totalQtySold = 0;
      let totalRevenueCentavos = 0;

      // We need to check transaction dates — batch load transactions
      const txnCache = new Map<string, Doc<"transactions"> | null>();

      for (const ti of txnItems) {
        let txn = txnCache.get(ti.transactionId as string);
        if (txn === undefined) {
          txn = await ctx.db.get(ti.transactionId);
          txnCache.set(ti.transactionId as string, txn);
        }
        if (!txn || txn.status === "voided") continue;
        if (txn.createdAt < dayStart || txn.createdAt >= dayEnd) continue;

        totalQtySold += ti.quantity;
        totalRevenueCentavos += ti.lineTotalCentavos;

        const key = txn.branchId as string;
        const existing = branchSalesMap.get(key) ?? { qtySold: 0, revenueCentavos: 0 };
        existing.qtySold += ti.quantity;
        existing.revenueCentavos += ti.lineTotalCentavos;
        branchSalesMap.set(key, existing);
      }

      // Top 10 branches by qty
      const branchSales = [...branchSalesMap.entries()]
        .map(([branchId, data]) => ({
          branchId: branchId as Id<"branches">,
          qtySold: data.qtySold,
          revenueCentavos: data.revenueCentavos,
        }))
        .sort((a, b) => b.qtySold - a.qtySold)
        .slice(0, 10);

      // ── Inventory across all branches ──
      const inventoryRecords = await ctx.db
        .query("inventory")
        .withIndex("by_variant", (q) => q.eq("variantId", variantId))
        .collect();

      const totalStock = inventoryRecords.reduce((s, i) => s + i.quantity, 0);
      const totalReserved = inventoryRecords.reduce((s, i) => s + (i.reservedQuantity ?? 0), 0);
      const branchStockCount = inventoryRecords.filter((i) => i.quantity > 0).length;

      // ── 7-day velocity ──
      // Count sales in last 7 days from transactionItems (already loaded)
      let sevenDaySold = 0;
      for (const ti of txnItems) {
        let txn = txnCache.get(ti.transactionId as string);
        if (txn === undefined) {
          txn = await ctx.db.get(ti.transactionId);
          txnCache.set(ti.transactionId as string, txn);
        }
        if (!txn || txn.status === "voided") continue;
        if (txn.createdAt >= sevenDaysAgo && txn.createdAt < dayEnd) {
          sevenDaySold += ti.quantity;
        }
      }

      const avgDailyVelocity7d = Math.round((sevenDaySold / 7) * 100) / 100;
      const daysOfSupply = avgDailyVelocity7d > 0
        ? Math.round(totalStock / avgDailyVelocity7d)
        : totalStock > 0 ? 999 : 0;

      // Movement Index: sold_7d / stock
      const movementIndex = totalStock > 0
        ? Math.round((sevenDaySold / totalStock) * 100) / 100
        : sevenDaySold > 0 ? 99 : 0;

      let classification: "fast" | "normal" | "slow" | "dead";
      if (movementIndex >= 1.0) classification = "fast";
      else if (movementIndex >= 0.3) classification = "normal";
      else if (movementIndex > 0 || sevenDaySold > 0) classification = "slow";
      else classification = "dead";

      await ctx.db.insert("variantDailySnapshots", {
        variantId,
        date: args.date,
        sku: variant.sku,
        styleName: style.name,
        styleId: style._id,
        categoryId: category?._id as any,
        categoryName: category?.name ?? "",
        brandId: brand._id,
        brandName: brand.name,
        size: variant.size,
        color: variant.color,
        priceCentavos: variant.priceCentavos,
        totalQtySold,
        totalRevenueCentavos,
        branchSales,
        totalStock,
        totalReserved,
        branchStockCount,
        avgDailyVelocity7d,
        daysOfSupply,
        movementIndex,
        classification,
        generatedAt: now,
      });
    }
  },
});

// ─── Orchestrator ────────────────────────────────────────────────────────────
// Called by cron. Reads branch/variant lists and schedules chunks.

export const orchestrate = internalMutation({
  args: {},
  handler: async (ctx) => {
    const date = todayPHT();

    // ── Schedule branch chunks ──
    const allBranches = await ctx.db.query("branches").collect();
    const activeBranches = allBranches.filter((b) => b.isActive);
    const branchIds = activeBranches.map((b) => b._id);

    for (let i = 0; i < branchIds.length; i += BRANCH_CHUNK_SIZE) {
      const chunk = branchIds.slice(i, i + BRANCH_CHUNK_SIZE);
      await ctx.scheduler.runAfter(0, generateBranchChunkRef, {
        branchIds: chunk,
        date,
      });
    }

    // ── Schedule variant chunks ──
    const allVariants = await ctx.db.query("variants").collect();
    const activeVariants = allVariants.filter((v) => v.isActive);
    const variantIds = activeVariants.map((v) => v._id);

    for (let i = 0; i < variantIds.length; i += VARIANT_CHUNK_SIZE) {
      const chunk = variantIds.slice(i, i + VARIANT_CHUNK_SIZE);
      // Stagger variant chunks slightly to spread load
      await ctx.scheduler.runAfter(i / VARIANT_CHUNK_SIZE * 1000, generateVariantChunkRef, {
        variantIds: chunk,
        date,
      });
    }

    console.log(
      `[snapshots] Scheduled ${Math.ceil(branchIds.length / BRANCH_CHUNK_SIZE)} branch chunks ` +
      `(${branchIds.length} branches) and ${Math.ceil(variantIds.length / VARIANT_CHUNK_SIZE)} ` +
      `variant chunks (${variantIds.length} variants) for ${date}`
    );
  },
});

// Self-references for scheduler (must match exported names)
import { internal } from "../_generated/api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _internal = internal as any;
const generateBranchChunkRef = _internal.snapshots.generate._generateBranchChunk;
const generateVariantChunkRef = _internal.snapshots.generate._generateVariantChunk;

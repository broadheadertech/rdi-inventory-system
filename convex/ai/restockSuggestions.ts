// convex/ai/restockSuggestions.ts
//
// NOW READS FROM variantDailySnapshots + branchDailySnapshots instead of scanning
// transactions → transactionItems per branch. Reduces from ~881K queries to ~3.
//
// Note: branchSales array in variantDailySnapshots gives per-branch breakdown.

import { internalMutation, query, mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";
import { getAllVariantSnapshots, getPHTDate } from "../snapshots/readers";

const SUGGESTION_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours
const STOCKOUT_THRESHOLD_DAYS = 7;

// ─── generateRestockSuggestions ──────────────────────────────────────────────
// Called by cron daily at 5 AM PHT (21:00 UTC previous day).
// Reads variant snapshots for velocity + stock data, generates suggestions.

export const generateRestockSuggestions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expiresAt = now + SUGGESTION_EXPIRY_MS;

    // 1. Expire old active suggestions
    const stale = await ctx.db
      .query("restockSuggestions")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    for (const s of stale) {
      if (s.expiresAt < now) {
        await ctx.db.patch(s._id, { status: "dismissed" as const });
      }
    }

    // 2. Read today's variant snapshots (contains velocity + stock + per-branch sales)
    const todayDate = getPHTDate(0);
    const snapshots = await getAllVariantSnapshots(ctx, todayDate);

    if (snapshots.length === 0) return;

    // 3. Get all active branches
    const branches = (await ctx.db.query("branches").collect()).filter(
      (b) => b.isActive
    );
    const branchIds = new Set(branches.map((b) => b._id as string));

    // 4. Count incoming stock per variant per branch (transfers approved/packed/inTransit)
    // Read all active transfers at once (bounded by status index)
    const pendingStatuses = ["approved", "packed", "inTransit"] as const;
    const allPendingTransfers = [];
    for (const status of pendingStatuses) {
      const transfers = await ctx.db
        .query("transfers")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      allPendingTransfers.push(...transfers);
    }

    // Build incoming map: branchId+variantId → incoming qty
    const incomingMap = new Map<string, number>();
    for (const transfer of allPendingTransfers) {
      const items = await ctx.db
        .query("transferItems")
        .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
        .collect();
      for (const ti of items) {
        const key = `${transfer.toBranchId}:${ti.variantId}`;
        const qty = ti.packedQuantity ?? ti.requestedQuantity;
        incomingMap.set(key, (incomingMap.get(key) ?? 0) + qty);
      }
    }

    // 5. Get per-branch inventory for all variants
    const allInventory = await ctx.db.query("inventory").collect();
    const invMap = new Map<string, number>(); // branchId:variantId → qty
    for (const inv of allInventory) {
      invMap.set(`${inv.branchId}:${inv.variantId}`, inv.quantity);
    }

    // 6. Generate suggestions using snapshot velocity data
    for (const snap of snapshots) {
      if (snap.avgDailyVelocity7d < 0.1) continue; // Skip very slow movers

      // Check each branch that sells this variant
      for (const branchSale of snap.branchSales) {
        if (!branchIds.has(branchSale.branchId as string)) continue;

        const branchDailyVelocity = branchSale.qtySold / 7; // approximate from snapshot's 7d window
        if (branchDailyVelocity < 0.1) continue;

        const currentStock = invMap.get(`${branchSale.branchId}:${snap.variantId}`) ?? 0;
        const incoming = incomingMap.get(`${branchSale.branchId}:${snap.variantId}`) ?? 0;
        const effectiveStock = currentStock + incoming;
        const daysLeft = branchDailyVelocity > 0
          ? Math.round(effectiveStock / branchDailyVelocity)
          : 999;

        if (daysLeft >= STOCKOUT_THRESHOLD_DAYS) continue;

        // Check for existing active suggestion
        const existingSuggestion = await ctx.db
          .query("restockSuggestions")
          .withIndex("by_branch_variant", (q) =>
            q.eq("branchId", branchSale.branchId).eq("variantId", snap.variantId)
          )
          .collect();
        const hasActive = existingSuggestion.some((s) => s.status === "active");
        if (hasActive) continue;

        const suggestedQty = Math.max(
          1,
          Math.ceil(branchDailyVelocity * 7) - effectiveStock
        );

        let confidence: "high" | "medium" | "low";
        if (branchDailyVelocity >= 2 && daysLeft <= 3) confidence = "high";
        else if (branchDailyVelocity >= 1 || daysLeft <= 5) confidence = "medium";
        else confidence = "low";

        const rationale =
          `Selling ${branchDailyVelocity.toFixed(1)}/day, ` +
          `${currentStock} in stock` +
          (incoming > 0 ? ` (+${incoming} incoming)` : "") +
          `, ~${daysLeft} days left`;

        await ctx.db.insert("restockSuggestions", {
          branchId: branchSale.branchId,
          variantId: snap.variantId,
          suggestedQuantity: suggestedQty,
          currentStock,
          avgDailyVelocity: Math.round(branchDailyVelocity * 10) / 10,
          daysUntilStockout: daysLeft,
          incomingStock: incoming,
          confidence,
          rationale,
          status: "active",
          generatedAt: now,
          expiresAt,
        });
      }
    }
  },
});

// ─── listActiveSuggestions ───────────────────────────────────────────────────

export const listActiveSuggestions = query({
  args: { branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    let suggestions;
    if (args.branchId) {
      suggestions = await ctx.db
        .query("restockSuggestions")
        .withIndex("by_branch_status", (q) =>
          q.eq("branchId", args.branchId!).eq("status", "active")
        )
        .collect();
    } else {
      suggestions = await ctx.db
        .query("restockSuggestions")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect();
    }

    const branchCache = new Map<string, string>();
    const variantCache = new Map<
      string,
      { sku: string; styleName: string; size: string; color: string }
    >();

    const enriched = await Promise.all(
      suggestions.map(async (s) => {
        let branchName = branchCache.get(s.branchId as string);
        if (!branchName) {
          const branch = await ctx.db.get(s.branchId);
          branchName = branch?.isActive ? branch.name : "(inactive)";
          branchCache.set(s.branchId as string, branchName);
        }

        let variantInfo = variantCache.get(s.variantId as string);
        if (!variantInfo) {
          const variant = await ctx.db.get(s.variantId);
          const style = variant ? await ctx.db.get(variant.styleId) : null;
          variantInfo = {
            sku: variant?.sku ?? "",
            styleName: style?.name ?? "Unknown",
            size: variant?.size ?? "",
            color: variant?.color ?? "",
          };
          variantCache.set(s.variantId as string, variantInfo);
        }

        return {
          _id: s._id,
          branchId: s.branchId,
          branchName,
          variantId: s.variantId,
          ...variantInfo,
          suggestedQuantity: s.suggestedQuantity,
          currentStock: s.currentStock,
          avgDailyVelocity: s.avgDailyVelocity,
          daysUntilStockout: s.daysUntilStockout,
          incomingStock: s.incomingStock,
          confidence: s.confidence,
          rationale: s.rationale,
          generatedAt: s.generatedAt,
        };
      })
    );

    return enriched.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
  },
});

// ─── acceptSuggestion ────────────────────────────────────────────────────────

export const acceptSuggestion = mutation({
  args: {
    suggestionId: v.id("restockSuggestions"),
    fromBranchId: v.id("branches"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion) throw new ConvexError({ code: "NOT_FOUND", message: "Suggestion not found." });
    if (suggestion.status !== "active") throw new ConvexError({ code: "INVALID_STATE", message: "Suggestion is no longer active." });

    const fromBranch = await ctx.db.get(args.fromBranchId);
    if (!fromBranch || !fromBranch.isActive) throw new ConvexError({ code: "INVALID_ARGUMENT", message: "Invalid source branch." });
    if ((args.fromBranchId as string) === (suggestion.branchId as string)) throw new ConvexError({ code: "INVALID_ARGUMENT", message: "Source and target branch cannot be the same." });

    const variant = await ctx.db.get(suggestion.variantId);
    if (!variant) throw new ConvexError({ code: "NOT_FOUND", message: "Variant no longer exists." });

    const sourceInventory = await ctx.db
      .query("inventory")
      .withIndex("by_branch_variant", (q) =>
        q.eq("branchId", args.fromBranchId).eq("variantId", suggestion.variantId)
      )
      .unique();
    if (!sourceInventory || sourceInventory.quantity <= 0) throw new ConvexError({ code: "INVALID_ARGUMENT", message: "Source branch has no stock of this variant." });

    const now = Date.now();
    const transferId = await ctx.db.insert("transfers", {
      fromBranchId: args.fromBranchId,
      toBranchId: suggestion.branchId,
      requestedById: user._id,
      status: "requested",
      notes: `AI Restock: ${suggestion.rationale}`,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("transferItems", {
      transferId,
      variantId: suggestion.variantId,
      requestedQuantity: suggestion.suggestedQuantity,
    });

    await ctx.db.patch(args.suggestionId, {
      status: "accepted" as const,
      acceptedById: user._id,
      transferId,
    });

    await _logAuditEntry(ctx, {
      action: "transfer.create",
      userId: user._id,
      entityType: "transfers",
      entityId: transferId,
      after: {
        fromBranchId: args.fromBranchId,
        toBranchId: suggestion.branchId,
        status: "requested",
        source: "ai-restock",
        variantId: suggestion.variantId,
        quantity: suggestion.suggestedQuantity,
      },
    });

    await _logAuditEntry(ctx, {
      action: "restock.accept",
      userId: user._id,
      entityType: "restockSuggestions",
      entityId: args.suggestionId,
      after: {
        status: "accepted",
        transferId,
        fromBranchId: args.fromBranchId,
        toBranchId: suggestion.branchId,
      },
    });
  },
});

// ─── dismissSuggestion ───────────────────────────────────────────────────────

export const dismissSuggestion = mutation({
  args: { suggestionId: v.id("restockSuggestions") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion) throw new ConvexError({ code: "NOT_FOUND", message: "Suggestion not found." });
    if (suggestion.status !== "active") throw new ConvexError({ code: "INVALID_STATE", message: "Suggestion is no longer active." });

    await ctx.db.patch(args.suggestionId, { status: "dismissed" as const });

    await _logAuditEntry(ctx, {
      action: "restock.dismiss",
      userId: user._id,
      entityType: "restockSuggestions",
      entityId: args.suggestionId,
      after: { status: "dismissed" },
    });
  },
});

// ─── getBranchesWithStock ────────────────────────────────────────────────────

export const getBranchesWithStock = query({
  args: { variantId: v.id("variants") },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const inventoryRecords = await ctx.db
      .query("inventory")
      .withIndex("by_variant", (q) => q.eq("variantId", args.variantId))
      .collect();

    const withStock = inventoryRecords.filter((inv) => inv.quantity > 0);

    const enriched = await Promise.all(
      withStock.map(async (inv) => {
        const branch = await ctx.db.get(inv.branchId);
        return {
          branchId: inv.branchId,
          branchName: branch?.isActive ? branch.name : "(inactive)",
          availableQuantity: inv.quantity,
        };
      })
    );

    return enriched.sort((a, b) => b.availableQuantity - a.availableQuantity);
  },
});

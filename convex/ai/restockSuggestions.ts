import { internalMutation, query, mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

const DAY_MS = 24 * 60 * 60 * 1000;
const ANALYSIS_WINDOW_DAYS = 7;
const SUGGESTION_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours
const STOCKOUT_THRESHOLD_DAYS = 7; // Suggest restock if <7 days of stock

// ─── generateRestockSuggestions ──────────────────────────────────────────────
// Called by cron daily at 5 AM PHT (21:00 UTC previous day).
// Analyzes 7-day sales velocity per variant per branch, generates suggestions
// for variants projected to stock out within 7 days.

export const generateRestockSuggestions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const windowStart = now - ANALYSIS_WINDOW_DAYS * DAY_MS;
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

    // 2. Get all active branches
    const branches = (await ctx.db.query("branches").collect()).filter(
      (b) => b.isActive
    );

    // 3. Get all inventory records
    const allInventory = await ctx.db.query("inventory").collect();

    // 4. Per-branch analysis
    for (const branch of branches) {
      // Bound to 2000 most recent transactions to cap N+1 reads on transactionItems
      const txns = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", branch._id).gte("createdAt", windowStart)
        )
        .order("desc")
        .take(2000);

      if (txns.length === 0) continue;

      // 5. Aggregate sales velocity: variant → total units sold
      const variantSales = new Map<string, number>();
      for (const txn of txns) {
        const items = await ctx.db
          .query("transactionItems")
          .withIndex("by_transaction", (q) =>
            q.eq("transactionId", txn._id)
          )
          .collect();
        for (const item of items) {
          const key = item.variantId as string;
          variantSales.set(key, (variantSales.get(key) ?? 0) + item.quantity);
        }
      }

      // 6. Build inventory map for this branch
      const branchInventory = allInventory.filter(
        (inv) => (inv.branchId as string) === (branch._id as string)
      );
      const invMap = new Map(
        branchInventory.map((inv) => [inv.variantId as string, inv])
      );

      // 7. Count incoming stock (transfers approved/packed/inTransit TO this branch)
      // Bound to 200 most recent to avoid loading full transfer history
      const incomingTransfers = await ctx.db
        .query("transfers")
        .withIndex("by_to_branch", (q) => q.eq("toBranchId", branch._id))
        .order("desc")
        .take(200);
      const activeIncoming = incomingTransfers.filter((t) =>
        ["approved", "packed", "inTransit"].includes(t.status)
      );
      const incomingByVariant = new Map<string, number>();
      for (const transfer of activeIncoming) {
        const tItems = await ctx.db
          .query("transferItems")
          .withIndex("by_transfer", (q) =>
            q.eq("transferId", transfer._id)
          )
          .collect();
        for (const ti of tItems) {
          const key = ti.variantId as string;
          const qty = ti.packedQuantity ?? ti.requestedQuantity;
          incomingByVariant.set(key, (incomingByVariant.get(key) ?? 0) + qty);
        }
      }

      // 8. Generate suggestions
      for (const [variantIdStr, totalSold] of variantSales) {
        const avgDaily = totalSold / ANALYSIS_WINDOW_DAYS;
        if (avgDaily < 0.1) continue; // Skip very slow movers

        const inv = invMap.get(variantIdStr);
        const currentStock = inv?.quantity ?? 0;
        const incoming = incomingByVariant.get(variantIdStr) ?? 0;
        const effectiveStock = currentStock + incoming;
        const daysLeft =
          avgDaily > 0 ? Math.round(effectiveStock / avgDaily) : 999;

        if (daysLeft >= STOCKOUT_THRESHOLD_DAYS) continue;

        // Check for existing active suggestion for this branch+variant
        const existingSuggestion = await ctx.db
          .query("restockSuggestions")
          .withIndex("by_branch_variant", (q) =>
            q
              .eq("branchId", branch._id)
              .eq("variantId", variantIdStr as Id<"variants">)
          )
          .collect();
        const hasActive = existingSuggestion.some(
          (s) => s.status === "active"
        );
        if (hasActive) continue;

        // Suggested quantity: cover 14 days of sales minus effective stock
        const suggestedQty = Math.max(
          1,
          Math.ceil(avgDaily * ANALYSIS_WINDOW_DAYS) - effectiveStock
        );

        // Confidence scoring
        let confidence: "high" | "medium" | "low";
        if (avgDaily >= 2 && daysLeft <= 3) confidence = "high";
        else if (avgDaily >= 1 || daysLeft <= 5) confidence = "medium";
        else confidence = "low";

        const rationale =
          `Selling ${avgDaily.toFixed(1)}/day, ` +
          `${currentStock} in stock` +
          (incoming > 0 ? ` (+${incoming} incoming)` : "") +
          `, ~${daysLeft} days left`;

        await ctx.db.insert("restockSuggestions", {
          branchId: branch._id,
          variantId: variantIdStr as Id<"variants">,
          suggestedQuantity: suggestedQty,
          currentStock,
          avgDailyVelocity: Math.round(avgDaily * 10) / 10,
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
// Returns active suggestions enriched with branch name + variant info,
// sorted by urgency (lowest daysUntilStockout first).

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

    // Enrich with branch name + variant info using caches
    const branchCache = new Map<string, string>();
    const variantCache = new Map<
      string,
      { sku: string; styleName: string; size: string; color: string }
    >();

    const enriched = await Promise.all(
      suggestions.map(async (s) => {
        // Branch name
        let branchName = branchCache.get(s.branchId as string);
        if (!branchName) {
          const branch = await ctx.db.get(s.branchId);
          branchName = branch?.isActive ? branch.name : "(inactive)";
          branchCache.set(s.branchId as string, branchName);
        }

        // Variant info
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
// Creates a transfer request inline (not calling createTransferRequest which
// uses withBranchScope — HQ staff have no branch assignment).

export const acceptSuggestion = mutation({
  args: {
    suggestionId: v.id("restockSuggestions"),
    fromBranchId: v.id("branches"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Suggestion not found.",
      });
    }
    if (suggestion.status !== "active") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Suggestion is no longer active.",
      });
    }

    const fromBranch = await ctx.db.get(args.fromBranchId);
    if (!fromBranch || !fromBranch.isActive) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Invalid source branch.",
      });
    }
    if ((args.fromBranchId as string) === (suggestion.branchId as string)) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Source and target branch cannot be the same.",
      });
    }

    const variant = await ctx.db.get(suggestion.variantId);
    if (!variant) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Variant no longer exists.",
      });
    }

    // Validate source branch has stock of this variant
    const sourceInventory = await ctx.db
      .query("inventory")
      .withIndex("by_branch_variant", (q) =>
        q.eq("branchId", args.fromBranchId).eq("variantId", suggestion.variantId)
      )
      .unique();
    if (!sourceInventory || sourceInventory.quantity <= 0) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Source branch has no stock of this variant.",
      });
    }

    // Create transfer request inline
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

    // Audit the transfer creation
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

    // Audit the suggestion acceptance
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
    if (!suggestion) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Suggestion not found.",
      });
    }
    if (suggestion.status !== "active") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Suggestion is no longer active.",
      });
    }

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
// Returns branches that have stock of a given variant, for the accept dialog.

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

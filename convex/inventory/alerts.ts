// convex/inventory/alerts.ts — Low-stock alert management

import { query, mutation, internalMutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { withBranchScope } from "../_helpers/withBranchScope";
import { BRANCH_MANAGEMENT_ROLES, HQ_ROLES } from "../_helpers/permissions";

// ─── getLowStockAlerts ───────────────────────────────────────────────────────
// Returns active alerts for caller's branch (branch roles) or all branches (HQ/admin).

export const getLowStockAlerts = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);

    let alerts: Doc<"lowStockAlerts">[];
    if (scope.branchId === null) {
      // HQ/admin: all branches — full table scan filtered to active
      alerts = await ctx.db
        .query("lowStockAlerts")
        .filter((q) => q.eq(q.field("status"), "active"))
        .collect();
    } else {
      // Branch role: own branch only — indexed query
      alerts = await ctx.db
        .query("lowStockAlerts")
        .withIndex("by_branch_status", (q) =>
          q.eq("branchId", scope.branchId!).eq("status", "active")
        )
        .collect();
    }

    // L1 fix: branch-scoped queries all share the same branchId — fetch once, not per row.
    // HQ queries span multiple branches so we cache by branchId to avoid duplicate lookups.
    const branchCache = new Map<Id<"branches">, { name: string } | null>();
    async function getBranchName(branchId: Id<"branches">): Promise<string | null> {
      if (branchCache.has(branchId)) {
        return branchCache.get(branchId)?.name ?? null;
      }
      const branch = await ctx.db.get(branchId);
      const result = branch && branch.isActive ? { name: branch.name } : null;
      branchCache.set(branchId, result);
      return result?.name ?? null;
    }

    // Resolve variant → style for enriched display data
    const results = await Promise.all(
      alerts.map(async (alertRow) => {
        const branchName = await getBranchName(alertRow.branchId);
        if (branchName === null) return null;

        const variant = await ctx.db.get(alertRow.variantId);
        const style = variant ? await ctx.db.get(variant.styleId) : null;

        return {
          alertId: alertRow._id,
          branchId: alertRow.branchId,
          branchName,
          variantId: alertRow.variantId,
          styleName: style?.name ?? "Unknown",
          size: variant?.size ?? "",
          color: variant?.color ?? "",
          sku: variant?.sku ?? "",
          quantity: alertRow.quantity,
          threshold: alertRow.threshold,
          createdAt: alertRow.createdAt,
        };
      })
    );

    return results
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.createdAt - a.createdAt); // newest first
  },
});

// ─── setInventoryThreshold ───────────────────────────────────────────────────
// Managers and HQ staff can update the low-stock threshold for an inventory row.

export const setInventoryThreshold = mutation({
  args: {
    inventoryId: v.id("inventory"),
    threshold: v.number(),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    const isHQ = (HQ_ROLES as readonly string[]).includes(scope.user.role);
    const isBranchManager = (BRANCH_MANAGEMENT_ROLES as readonly string[]).includes(scope.user.role);

    if (!isHQ && !isBranchManager) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    if (!Number.isInteger(args.threshold) || args.threshold < 0) {
      throw new ConvexError("Threshold must be a non-negative whole number");
    }

    const inv = await ctx.db.get(args.inventoryId);
    if (!inv) throw new ConvexError({ code: "NOT_FOUND" });
    if (!isHQ && scope.branchId !== inv.branchId) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    await ctx.db.patch(args.inventoryId, {
      lowStockThreshold: args.threshold,
      updatedAt: Date.now(),
    });

    // Inline alert check after threshold change
    const threshold = args.threshold;
    const existing = await ctx.db
      .query("lowStockAlerts")
      .withIndex("by_branch_variant", (q) =>
        q.eq("branchId", inv.branchId).eq("variantId", inv.variantId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (inv.quantity <= threshold) {
      if (!existing) {
        await ctx.db.insert("lowStockAlerts", {
          branchId: inv.branchId,
          variantId: inv.variantId,
          quantity: inv.quantity,
          threshold,
          status: "active",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      } else {
        // M2 fix: keep threshold field on existing alert in sync with the new threshold value
        await ctx.db.patch(existing._id, { threshold, updatedAt: Date.now() });
      }
    } else if (existing) {
      await ctx.db.patch(existing._id, { status: "resolved", updatedAt: Date.now() });
    }
  },
});

// ─── dismissLowStockAlert ────────────────────────────────────────────────────
// Managers and HQ staff can dismiss an active alert (manual acknowledgement).

export const dismissLowStockAlert = mutation({
  args: {
    alertId: v.id("lowStockAlerts"),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    const isHQ = (HQ_ROLES as readonly string[]).includes(scope.user.role);
    const isBranchManager = (BRANCH_MANAGEMENT_ROLES as readonly string[]).includes(scope.user.role);

    if (!isHQ && !isBranchManager) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const alertDoc = await ctx.db.get(args.alertId);
    if (!alertDoc) throw new ConvexError({ code: "NOT_FOUND" });
    if (!isHQ && scope.branchId !== alertDoc.branchId) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }
    // M1 fix: only active alerts can be dismissed; silently no-op for already-resolved alerts
    if (alertDoc.status !== "active") return;

    await ctx.db.patch(args.alertId, {
      status: "dismissed",
      updatedAt: Date.now(),
      dismissedBy: scope.userId,
    });
  },
});

// ─── checkInventoryAlert ─────────────────────────────────────────────────────
// Server-internal only. Called after each inventory decrement via ctx.scheduler.runAfter.
// Creates, updates, or resolves a low-stock alert for the given inventory row.

export const checkInventoryAlert = internalMutation({
  args: { inventoryId: v.id("inventory") },
  handler: async (ctx, args) => {
    const invRow = await ctx.db.get(args.inventoryId);
    if (!invRow) return;

    const threshold = invRow.lowStockThreshold ?? 5;
    const existing = await ctx.db
      .query("lowStockAlerts")
      .withIndex("by_branch_variant", (q) =>
        q.eq("branchId", invRow.branchId).eq("variantId", invRow.variantId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (invRow.quantity <= threshold) {
      if (!existing) {
        await ctx.db.insert("lowStockAlerts", {
          branchId: invRow.branchId,
          variantId: invRow.variantId,
          quantity: invRow.quantity,
          threshold,
          status: "active",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      } else if (existing.quantity !== invRow.quantity) {
        // Update quantity on existing alert if it changed
        await ctx.db.patch(existing._id, {
          quantity: invRow.quantity,
          updatedAt: Date.now(),
        });
      }
    } else if (existing) {
      // Stock recovered above threshold — auto-resolve
      await ctx.db.patch(existing._id, {
        status: "resolved",
        updatedAt: Date.now(),
      });
    }
  },
});

// ─── sweepLowStock ───────────────────────────────────────────────────────────
// Server-internal only. Hourly cron fallback for stock changes not triggered by POS.
// Inline logic — does NOT use ctx.scheduler to avoid N separate DB transactions.

export const sweepLowStock = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allInventory = await ctx.db.query("inventory").collect();

    for (const invRow of allInventory) {
      const threshold = invRow.lowStockThreshold ?? 5;
      const existing = await ctx.db
        .query("lowStockAlerts")
        .withIndex("by_branch_variant", (q) =>
          q.eq("branchId", invRow.branchId).eq("variantId", invRow.variantId)
        )
        .filter((q) => q.eq(q.field("status"), "active"))
        .first();

      if (invRow.quantity <= threshold) {
        if (!existing) {
          await ctx.db.insert("lowStockAlerts", {
            branchId: invRow.branchId,
            variantId: invRow.variantId,
            quantity: invRow.quantity,
            threshold,
            status: "active",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        } else if (existing.quantity !== invRow.quantity) {
          await ctx.db.patch(existing._id, {
            quantity: invRow.quantity,
            updatedAt: Date.now(),
          });
        }
      } else if (existing) {
        await ctx.db.patch(existing._id, {
          status: "resolved",
          updatedAt: Date.now(),
        });
      }
    }
  },
});

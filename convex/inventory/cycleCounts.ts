import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { requireRole } from "../_helpers/permissions";
import { withBranchScope } from "../_helpers/withBranchScope";
import { _logAuditEntry } from "../_helpers/auditLog";

const CYCLE_COUNT_ROLES = [
  "warehouse_manager",
  "warehouse_staff",
  "branch_manager",
  "branch_staff",
] as const;

export const startCycleCount = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, [...CYCLE_COUNT_ROLES]);
    const scope = await withBranchScope(ctx);

    const branchId = scope.branchId;
    if (!branchId) throw new Error("Branch context required");

    // Check for existing active count
    const existing = await ctx.db
      .query("cycleCounts")
      .withIndex("by_branch", (q) =>
        q.eq("branchId", branchId).eq("status", "in_progress")
      )
      .first();

    if (existing) {
      throw new Error("A cycle count is already in progress for this branch");
    }

    // Get all inventory for this branch
    const inventory = await ctx.db
      .query("inventory")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();

    const items = inventory
      .filter((inv) => inv.quantity > 0)
      .map((inv) => ({
        variantId: inv.variantId,
        expectedQuantity: inv.quantity,
        countedQuantity: undefined as number | undefined,
      }));

    const id = await ctx.db.insert("cycleCounts", {
      branchId,
      initiatedBy: scope.userId,
      status: "in_progress",
      items,
      createdAt: Date.now(),
    });

    return { cycleCountId: id, itemCount: items.length };
  },
});

export const getActiveCycleCount = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, [...CYCLE_COUNT_ROLES]);
    const scope = await withBranchScope(ctx);

    const branchId = scope.branchId;
    if (!branchId) return null;

    const active = await ctx.db
      .query("cycleCounts")
      .withIndex("by_branch", (q) =>
        q.eq("branchId", branchId).eq("status", "in_progress")
      )
      .first();

    if (!active) return null;

    // Enrich items with variant info
    const enrichedItems = [];
    for (const item of active.items) {
      const variant = await ctx.db.get(item.variantId);
      if (!variant) continue;
      enrichedItems.push({
        variantId: item.variantId,
        sku: variant.sku,
        size: variant.size,
        color: variant.color,
        expectedQuantity: item.expectedQuantity,
        countedQuantity: item.countedQuantity,
      });
    }

    return {
      _id: active._id,
      status: active.status,
      items: enrichedItems,
      createdAt: active.createdAt,
    };
  },
});

export const updateCountedQuantity = mutation({
  args: {
    cycleCountId: v.id("cycleCounts"),
    variantId: v.id("variants"),
    countedQuantity: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [...CYCLE_COUNT_ROLES]);

    const cycleCount = await ctx.db.get(args.cycleCountId);
    if (!cycleCount || cycleCount.status !== "in_progress") {
      throw new Error("Cycle count not found or not active");
    }

    const updatedItems = cycleCount.items.map((item) => {
      if (item.variantId === args.variantId) {
        return { ...item, countedQuantity: args.countedQuantity };
      }
      return item;
    });

    await ctx.db.patch(args.cycleCountId, { items: updatedItems });
  },
});

export const completeCycleCount = mutation({
  args: {
    cycleCountId: v.id("cycleCounts"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [...CYCLE_COUNT_ROLES]);
    const scope = await withBranchScope(ctx);

    const cycleCount = await ctx.db.get(args.cycleCountId);
    if (!cycleCount || cycleCount.status !== "in_progress") {
      throw new Error("Cycle count not found or not active");
    }

    // Update inventory where counts differ
    let adjustments = 0;
    for (const item of cycleCount.items) {
      if (item.countedQuantity != null && item.countedQuantity !== item.expectedQuantity) {
        const inv = await ctx.db
          .query("inventory")
          .withIndex("by_branch", (q) => q.eq("branchId", cycleCount.branchId))
          .filter((q) => q.eq(q.field("variantId"), item.variantId))
          .first();

        if (inv) {
          await ctx.db.patch(inv._id, {
            quantity: item.countedQuantity,
            updatedAt: Date.now(),
          });
          adjustments++;
        }
      }
    }

    await ctx.db.patch(args.cycleCountId, {
      status: "completed",
      completedAt: Date.now(),
      notes: args.notes,
    });

    await _logAuditEntry(ctx, {
      action: "cycle_count_completed",
      userId: scope.userId,
      branchId: cycleCount.branchId,
      entityType: "cycleCounts",
      entityId: args.cycleCountId,
      after: { adjustments },
    });

    return { adjustments };
  },
});

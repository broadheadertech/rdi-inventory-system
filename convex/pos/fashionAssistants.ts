import { v, ConvexError } from "convex/values";
import { query, mutation } from "../_generated/server";
import { withBranchScope } from "../_helpers/withBranchScope";
import { requireRole } from "../_helpers/permissions";
import type { Id } from "../_generated/dataModel";

const MANAGER_ROLES = ["admin", "manager"] as const;

// ─── listActive ──────────────────────────────────────────────────────────────
// Returns active fashion assistants for the current branch.
// Used by the POS cashier to select who assisted the customer.

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    if (!scope.branchId) return [];

    return ctx.db
      .query("fashionAssistants")
      .withIndex("by_branch", (q) =>
        q.eq("branchId", scope.branchId!).eq("isActive", true)
      )
      .collect();
  },
});

// ─── listAll ─────────────────────────────────────────────────────────────────
// Returns all FAs (active + inactive) for management view.

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    if (!scope.branchId) return [];

    const all = await ctx.db
      .query("fashionAssistants")
      .withIndex("by_branch", (q) =>
        q.eq("branchId", scope.branchId!)
      )
      .collect();

    // Active first, then inactive; alphabetical within groups
    return all.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  },
});

// ─── create ──────────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    name: v.string(),
    employeeCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, MANAGER_ROLES);
    const scope = await withBranchScope(ctx);
    if (!scope.branchId) {
      throw new ConvexError({ code: "NO_BRANCH", message: "No branch assigned." });
    }

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({ code: "INVALID", message: "Name is required." });
    }

    // Check for duplicate name in this branch
    const existing = await ctx.db
      .query("fashionAssistants")
      .withIndex("by_branch", (q) =>
        q.eq("branchId", scope.branchId!).eq("isActive", true)
      )
      .collect();

    if (existing.some((fa) => fa.name.toLowerCase() === name.toLowerCase())) {
      throw new ConvexError({ code: "DUPLICATE", message: "A fashion assistant with this name already exists." });
    }

    return ctx.db.insert("fashionAssistants", {
      name,
      branchId: scope.branchId,
      employeeCode: args.employeeCode?.trim() || undefined,
      isActive: true,
      createdAt: Date.now(),
      createdById: user._id,
    });
  },
});

// ─── update ──────────────────────────────────────────────────────────────────

export const update = mutation({
  args: {
    id: v.id("fashionAssistants"),
    name: v.string(),
    employeeCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, MANAGER_ROLES);
    const scope = await withBranchScope(ctx);

    const fa = await ctx.db.get(args.id);
    if (!fa) throw new ConvexError({ code: "NOT_FOUND", message: "Fashion assistant not found." });
    if (fa.branchId !== scope.branchId) throw new ConvexError({ code: "UNAUTHORIZED" });

    const name = args.name.trim();
    if (!name) throw new ConvexError({ code: "INVALID", message: "Name is required." });

    await ctx.db.patch(args.id, {
      name,
      employeeCode: args.employeeCode?.trim() || undefined,
    });
  },
});

// ─── setActive ────────────────────────────────────────────────────────────────

export const setActive = mutation({
  args: {
    id: v.id("fashionAssistants"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, MANAGER_ROLES);
    const scope = await withBranchScope(ctx);

    const fa = await ctx.db.get(args.id);
    if (!fa) throw new ConvexError({ code: "NOT_FOUND", message: "Fashion assistant not found." });
    if (fa.branchId !== scope.branchId) throw new ConvexError({ code: "UNAUTHORIZED" });

    await ctx.db.patch(args.id, { isActive: args.isActive });
  },
});

// ─── getPerformance ──────────────────────────────────────────────────────────
// Aggregates sales data per fashion assistant for the caller's branch.
// Returns: per-FA transaction count, items sold, revenue for the given date range.

export const getPerformance = query({
  args: {
    startMs: v.number(),
    endMs: v.number(),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!scope.branchId) return [];

    // Get all FAs for this branch
    const allFAs = await ctx.db
      .query("fashionAssistants")
      .withIndex("by_branch", (q) => q.eq("branchId", scope.branchId!))
      .collect();

    if (allFAs.length === 0) return [];

    // Get transactions in date range for this branch
    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q
          .eq("branchId", scope.branchId!)
          .gte("createdAt", args.startMs)
          .lte("createdAt", args.endMs)
      )
      .collect();

    // Filter to non-voided transactions with a fashionAssistantId
    const faTxns = txns.filter(
      (t) => t.fashionAssistantId && t.status !== "voided"
    );

    // Aggregate per FA
    const faMap = new Map<
      string,
      { transactionCount: number; itemsSold: number; revenueCentavos: number }
    >();

    for (const txn of faTxns) {
      const faId = txn.fashionAssistantId as string;
      const entry = faMap.get(faId) ?? {
        transactionCount: 0,
        itemsSold: 0,
        revenueCentavos: 0,
      };
      entry.transactionCount++;
      entry.revenueCentavos += txn.totalCentavos;

      // Count items sold
      const items = await ctx.db
        .query("transactionItems")
        .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
        .collect();
      for (const item of items) {
        entry.itemsSold += item.quantity;
      }

      faMap.set(faId, entry);
    }

    // Build results — include all FAs (even those with 0 sales)
    const results = allFAs.map((fa) => {
      const stats = faMap.get(fa._id as string) ?? {
        transactionCount: 0,
        itemsSold: 0,
        revenueCentavos: 0,
      };
      return {
        _id: fa._id,
        name: fa.name,
        employeeCode: fa.employeeCode,
        isActive: fa.isActive,
        ...stats,
      };
    });

    // Sort by revenue descending
    return results.sort((a, b) => b.revenueCentavos - a.revenueCentavos);
  },
});

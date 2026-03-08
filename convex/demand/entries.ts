import { mutation, query } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { withBranchScope } from "../_helpers/withBranchScope";
import { requireRole, POS_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

// ─── listBrandsForSelector ────────────────────────────────────────────────────
// Returns active brands alphabetically for the demand log quick-tap UI.
// Accessible by any authenticated branch user (cashiers, managers, admins).
// NOTE: catalog/brands.listBrands uses HQ_ROLES — cannot be reused from POS.

export const listBrandsForSelector = query({
  args: {},
  handler: async (ctx) => {
    await withBranchScope(ctx); // ensures user is authenticated with branch scope
    const brands = await ctx.db.query("brands").collect();
    return brands
      .filter((b) => b.isActive)
      .map((b) => ({ id: b._id as string, name: b.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ─── createDemandLog ──────────────────────────────────────────────────────────
// Logs a customer demand entry. Restricted to cashier / manager / admin.
// Stores: brand (string name), design, size, notes, branchId, loggedById,
// createdAt — then generates an audit trail entry.

export const createDemandLog = mutation({
  args: {
    brand: v.string(),
    design: v.optional(v.string()),
    size: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, POS_ROLES); // ["admin", "manager", "cashier"]
    const { userId, branchId } = await withBranchScope(ctx);

    // Guard: branch-scoped users must have a branchId
    if (!branchId) {
      throw new ConvexError({
        code: "NO_BRANCH",
        message: "No branch assigned — cannot log demand without a branch",
      });
    }

    // Guard: brand must be non-empty (defense-in-depth — UI already prevents this)
    if (!args.brand.trim()) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "Brand is required" });
    }

    const newId = await ctx.db.insert("demandLogs", {
      branchId,
      loggedById: userId,
      brand: args.brand,
      design: args.design,
      size: args.size,
      notes: args.notes,
      createdAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "demand.log.create",
      userId,
      branchId,
      entityType: "demandLogs",
      entityId: newId as string,
      after: {
        brand: args.brand,
        design: args.design,
        size: args.size,
        notes: args.notes,
      },
    });

    return newId;
  },
});

// ─── listBranchDemandLogs ─────────────────────────────────────────────────────
// Returns recent demand log entries for the current user's branch.
// Accessible by any authenticated branch user (including viewers).
// Includes the name of the staff who logged each entry (joined from users table).

export const listBranchDemandLogs = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { branchId } = await withBranchScope(ctx);

    if (!branchId) return [];

    const logs = await ctx.db
      .query("demandLogs")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .order("desc")
      .take(args.limit ?? 20);

    // Batch-fetch user names to avoid N+1 sequential lookups
    const uniqueUserIds = [...new Set(logs.map((log) => log.loggedById))];
    const userDocs = await Promise.all(uniqueUserIds.map((id) => ctx.db.get(id)));
    const userNameMap = new Map<string, string>();
    uniqueUserIds.forEach((id, i) => {
      const doc = userDocs[i];
      if (doc) userNameMap.set(id as string, doc.name);
    });

    return logs.map((log) => ({
      ...log,
      loggedByName: userNameMap.get(log.loggedById as string) ?? "Unknown",
    }));
  },
});

// ─── searchDemandLogs ────────────────────────────────────────────────────────
// Paginated, filterable demand log query for branch managers.
// Branch-scoped: non-HQ users see only their branch, HQ sees all.
// Supports filtering by brand name, design substring, and date range.
// Uses cursor-based pagination (timestamp cursor with over-fetch limit+1).

export const searchDemandLogs = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
    brand: v.optional(v.string()),
    designSearch: v.optional(v.string()),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 200);

    // Over-fetch factor: when using in-memory filters we need more rows
    const hasMemoryFilter = !!args.brand || !!args.designSearch;
    const fetchCount = hasMemoryFilter ? (limit + 1) * 4 : limit + 1;

    let results;
    if (scope.canAccessAllBranches) {
      // HQ path: use by_date index with optional range bounds
      const baseQuery = ctx.db.query("demandLogs");
      const upper = args.cursor ?? args.dateTo;
      const lower = args.dateFrom;

      if (upper !== undefined && lower !== undefined) {
        results = await baseQuery
          .withIndex("by_date", (q) => q.gte("createdAt", lower).lt("createdAt", upper))
          .order("desc")
          .take(fetchCount);
      } else if (upper !== undefined) {
        results = await baseQuery
          .withIndex("by_date", (q) => q.lt("createdAt", upper))
          .order("desc")
          .take(fetchCount);
      } else if (lower !== undefined) {
        results = await baseQuery
          .withIndex("by_date", (q) => q.gte("createdAt", lower))
          .order("desc")
          .take(fetchCount);
      } else {
        results = await baseQuery
          .withIndex("by_date")
          .order("desc")
          .take(fetchCount);
      }

      // Apply dateTo as secondary filter when cursor is also present
      if (args.cursor !== undefined && args.dateTo !== undefined) {
        results = results.filter((r) => r.createdAt <= args.dateTo!);
      }
    } else {
      // Branch-scoped: use by_branch_date compound index
      const branchId = scope.branchId!;
      const baseQuery = ctx.db.query("demandLogs");
      const upper = args.cursor ?? args.dateTo;
      const lower = args.dateFrom;

      if (upper !== undefined && lower !== undefined) {
        results = await baseQuery
          .withIndex("by_branch_date", (q) =>
            q.eq("branchId", branchId).gte("createdAt", lower).lt("createdAt", upper)
          )
          .order("desc")
          .take(fetchCount);
      } else if (upper !== undefined) {
        results = await baseQuery
          .withIndex("by_branch_date", (q) =>
            q.eq("branchId", branchId).lt("createdAt", upper)
          )
          .order("desc")
          .take(fetchCount);
      } else if (lower !== undefined) {
        results = await baseQuery
          .withIndex("by_branch_date", (q) =>
            q.eq("branchId", branchId).gte("createdAt", lower)
          )
          .order("desc")
          .take(fetchCount);
      } else {
        results = await baseQuery
          .withIndex("by_branch_date", (q) => q.eq("branchId", branchId))
          .order("desc")
          .take(fetchCount);
      }

      // Apply dateTo as secondary filter when cursor is also present
      if (args.cursor !== undefined && args.dateTo !== undefined) {
        results = results.filter((r) => r.createdAt <= args.dateTo!);
      }
    }

    // In-memory filters for brand and design substring
    if (args.brand) {
      const brandLower = args.brand.toLowerCase();
      results = results.filter((r) => r.brand.toLowerCase() === brandLower);
    }
    if (args.designSearch) {
      const needle = args.designSearch.toLowerCase();
      results = results.filter(
        (r) => r.design && r.design.toLowerCase().includes(needle)
      );
    }

    const hasMore = results.length > limit;
    const logs = hasMore ? results.slice(0, limit) : results;

    // Batch-fetch user names
    const uniqueUserIds = [...new Set(logs.map((log) => log.loggedById))];
    const userDocs = await Promise.all(uniqueUserIds.map((id) => ctx.db.get(id)));
    const userNameMap = new Map<string, string>();
    uniqueUserIds.forEach((id, i) => {
      const doc = userDocs[i];
      if (doc) userNameMap.set(id as string, doc.name);
    });

    const nextCursor = logs.length > 0 ? logs[logs.length - 1].createdAt : undefined;

    return {
      logs: logs.map((log) => ({
        ...log,
        loggedByName: userNameMap.get(log.loggedById as string) ?? "Unknown",
      })),
      hasMore,
      nextCursor,
    };
  },
});

// ─── getDemandBrandSummary ──────────────────────────────────────────────────
// Returns demand counts grouped by brand for the user's branch scope.
// Optional date range filtering. Used for the summary cards on the branch
// demand page.

export const getDemandBrandSummary = query({
  args: {
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);

    let results;
    if (scope.canAccessAllBranches) {
      if (args.dateFrom !== undefined && args.dateTo !== undefined) {
        results = await ctx.db
          .query("demandLogs")
          .withIndex("by_date", (q) =>
            q.gte("createdAt", args.dateFrom!).lte("createdAt", args.dateTo!)
          )
          .collect();
      } else if (args.dateFrom !== undefined) {
        results = await ctx.db
          .query("demandLogs")
          .withIndex("by_date", (q) => q.gte("createdAt", args.dateFrom!))
          .collect();
      } else if (args.dateTo !== undefined) {
        results = await ctx.db
          .query("demandLogs")
          .withIndex("by_date", (q) => q.lte("createdAt", args.dateTo!))
          .collect();
      } else {
        results = await ctx.db.query("demandLogs").withIndex("by_date").collect();
      }
    } else {
      const branchId = scope.branchId!;
      if (args.dateFrom !== undefined && args.dateTo !== undefined) {
        results = await ctx.db
          .query("demandLogs")
          .withIndex("by_branch_date", (q) =>
            q.eq("branchId", branchId).gte("createdAt", args.dateFrom!).lte("createdAt", args.dateTo!)
          )
          .collect();
      } else if (args.dateFrom !== undefined) {
        results = await ctx.db
          .query("demandLogs")
          .withIndex("by_branch_date", (q) =>
            q.eq("branchId", branchId).gte("createdAt", args.dateFrom!)
          )
          .collect();
      } else if (args.dateTo !== undefined) {
        results = await ctx.db
          .query("demandLogs")
          .withIndex("by_branch_date", (q) =>
            q.eq("branchId", branchId).lte("createdAt", args.dateTo!)
          )
          .collect();
      } else {
        results = await ctx.db
          .query("demandLogs")
          .withIndex("by_branch_date", (q) => q.eq("branchId", branchId))
          .collect();
      }
    }

    // Aggregate by brand
    const brandCounts = new Map<string, number>();
    for (const log of results) {
      brandCounts.set(log.brand, (brandCounts.get(log.brand) ?? 0) + 1);
    }

    return [...brandCounts.entries()]
      .map(([brand, count]) => ({ brand, count }))
      .sort((a, b) => b.count - a.count);
  },
});

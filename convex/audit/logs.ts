import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { Id } from "../_generated/dataModel";
import { withBranchScope } from "../_helpers/withBranchScope";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";

/**
 * Paginated audit log query — returns latest entries in descending order.
 *
 * Branch-scoped: HQ users see all logs, branch users see only their branch logs.
 * Uses cursor-based pagination with timestamp of last item.
 */
export const getAuditLogs = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ logs: Doc<"auditLogs">[]; hasMore: boolean }> => {
    const scope = await withBranchScope(ctx);
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

    if (scope.canAccessAllBranches) {
      // HQ path: use index range bounds for efficient cursor seeking
      const baseQuery = ctx.db.query("auditLogs");
      const indexedQuery = args.cursor !== undefined
        ? baseQuery.withIndex("by_timestamp", (q) => q.lt("timestamp", args.cursor!))
        : baseQuery.withIndex("by_timestamp");

      const results = await indexedQuery.order("desc").take(limit + 1);
      const hasMore = results.length > limit;
      const logs = hasMore ? results.slice(0, limit) : results;
      return { logs, hasMore };
    }

    // Branch-scoped: use by_branch index with streaming cursor filter
    let q = ctx.db
      .query("auditLogs")
      .withIndex("by_branch", (b) => b.eq("branchId", scope.branchId!));

    if (args.cursor !== undefined) {
      q = q.filter((f) => f.lt(f.field("timestamp"), args.cursor!));
    }

    const results = await q.order("desc").take(limit + 1);
    const hasMore = results.length > limit;
    const logs = hasMore ? results.slice(0, limit) : results;
    return { logs, hasMore };
  },
});

/**
 * Audit logs filtered by entity type and ID.
 *
 * Branch-scoped: HQ users see all, branch users see only their branch's logs.
 */
export const getAuditLogsByEntity = query({
  args: {
    entityType: v.string(),
    entityId: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ logs: Doc<"auditLogs">[]; hasMore: boolean }> => {
    const scope = await withBranchScope(ctx);
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

    let q = ctx.db
      .query("auditLogs")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId)
      );

    // Apply streaming filters for branch scope and cursor
    if (!scope.canAccessAllBranches) {
      q = q.filter((f) => f.eq(f.field("branchId"), scope.branchId!));
    }
    if (args.cursor !== undefined) {
      q = q.filter((f) => f.lt(f.field("timestamp"), args.cursor!));
    }

    const results = await q.order("desc").take(limit + 1);
    const hasMore = results.length > limit;
    const logs = hasMore ? results.slice(0, limit) : results;
    return { logs, hasMore };
  },
});

/**
 * Audit logs filtered by target user ID.
 *
 * Branch-scoped: HQ can query any user, branch users can only query
 * users whose logs belong to their branch.
 */
export const getAuditLogsByUser = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ logs: Doc<"auditLogs">[]; hasMore: boolean }> => {
    const scope = await withBranchScope(ctx);
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

    let q = ctx.db
      .query("auditLogs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId));

    // Apply streaming filters for branch scope and cursor
    if (!scope.canAccessAllBranches) {
      q = q.filter((f) => f.eq(f.field("branchId"), scope.branchId!));
    }
    if (args.cursor !== undefined) {
      q = q.filter((f) => f.lt(f.field("timestamp"), args.cursor!));
    }

    const results = await q.order("desc").take(limit + 1);
    const hasMore = results.length > limit;
    const logs = hasMore ? results.slice(0, limit) : results;
    return { logs, hasMore };
  },
});

/**
 * Enriched audit logs for the admin audit page.
 * Resolves user names and supports filtering by action prefix.
 * HQ-only (admin + hqStaff).
 */
export const getEnrichedAuditLogs = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
    actionPrefix: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

    const baseQuery = ctx.db.query("auditLogs");
    const indexedQuery = args.cursor !== undefined
      ? baseQuery.withIndex("by_timestamp", (q) => q.lt("timestamp", args.cursor!))
      : baseQuery.withIndex("by_timestamp");

    // Over-fetch when filtering by prefix since we filter in memory
    const fetchCount = args.actionPrefix ? (limit + 1) * 4 : limit + 1;
    let results = await indexedQuery.order("desc").take(fetchCount);

    if (args.actionPrefix) {
      results = results.filter((r) => r.action.startsWith(args.actionPrefix!));
    }

    const hasMore = results.length > limit;
    const logs = hasMore ? results.slice(0, limit) : results;

    // Resolve user names with cache
    const userCache = new Map<string, string>();
    const enriched = await Promise.all(
      logs.map(async (log) => {
        const uid = log.userId as string;
        if (!userCache.has(uid)) {
          const user = await ctx.db.get(log.userId as Id<"users">);
          userCache.set(uid, user?.name ?? "Unknown");
        }
        return {
          _id: log._id,
          action: log.action,
          userName: userCache.get(uid)!,
          userId: log.userId,
          entityType: log.entityType,
          entityId: log.entityId,
          before: log.before,
          after: log.after,
          timestamp: log.timestamp,
        };
      })
    );

    const nextCursor = logs.length > 0 ? logs[logs.length - 1].timestamp : undefined;
    return { logs: enriched, hasMore, nextCursor };
  },
});

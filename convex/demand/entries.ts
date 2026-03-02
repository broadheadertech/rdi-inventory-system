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

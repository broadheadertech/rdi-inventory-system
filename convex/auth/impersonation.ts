// convex/auth/impersonation.ts — Admin "View as Branch".
//
// An admin can scope themselves to a branch to see exactly what that branch
// sees (and act on its behalf). Entering/exiting is audit-logged for
// transparency. Scoping itself is enforced in withBranchScope.

import { query, mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { requireRole, ADMIN_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

/** Returns the branch the admin is currently viewing as, or null. */
export const getViewingAsBranch = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user || user.role !== "admin" || !user.viewingAsBranchId) return null;
    const branch = await ctx.db.get(user.viewingAsBranchId);
    return branch
      ? { branchId: branch._id, branchName: branch.name }
      : null;
  },
});

/** Admin starts viewing as a branch. */
export const startViewingAsBranch = mutation({
  args: { branchId: v.id("branches") },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, ADMIN_ROLES);

    const branch = await ctx.db.get(args.branchId);
    if (!branch || !branch.isActive) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Branch not found or inactive." });
    }

    await ctx.db.patch(admin._id, {
      viewingAsBranchId: args.branchId,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "admin.viewAsBranch.start",
      userId: admin._id,
      branchId: args.branchId,
      entityType: "branches",
      entityId: args.branchId,
      after: { viewingAsBranchId: args.branchId, branchName: branch.name },
    });
  },
});

/** Admin stops viewing as a branch (returns to full admin scope). */
export const stopViewingAsBranch = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireRole(ctx, ADMIN_ROLES);

    const previous = admin.viewingAsBranchId;
    if (!previous) return;

    await ctx.db.patch(admin._id, {
      viewingAsBranchId: undefined,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "admin.viewAsBranch.stop",
      userId: admin._id,
      branchId: previous,
      entityType: "branches",
      entityId: previous,
      before: { viewingAsBranchId: previous },
    });
  },
});

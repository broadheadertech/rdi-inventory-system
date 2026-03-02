import { v, ConvexError } from "convex/values";
import {
  query,
  mutation,
  action,
  internalQuery,
  internalMutation,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { requireRole, ADMIN_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

// Shared role validator — matches schema union type
const roleValidator = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("cashier"),
  v.literal("warehouseStaff"),
  v.literal("hqStaff"),
  v.literal("viewer"),
  v.literal("driver"),
  v.literal("supplier")
);

// ─── Internal Functions (webhook-only, not publicly accessible) ──────────────

export const getByClerkId = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();
  },
});

export const getById = internalQuery({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const createFromWebhook = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    role: roleValidator,
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      name: args.name,
      role: args.role,
      isActive: args.isActive,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    });
  },
});

export const updateFromWebhook = internalMutation({
  args: {
    id: v.id("users"),
    email: v.string(),
    name: v.string(),
    role: roleValidator,
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      email: args.email,
      name: args.name,
      role: args.role,
      updatedAt: args.updatedAt,
    });
  },
});

export const deactivateByClerkId = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    if (user) {
      await ctx.db.patch(user._id, {
        isActive: false,
        updatedAt: Date.now(),
      });
    }
  },
});

export const updateRole = internalMutation({
  args: {
    id: v.id("users"),
    role: roleValidator,
    actingUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.id);
    const oldRole = user?.role;

    await ctx.db.patch(args.id, {
      role: args.role,
      updatedAt: Date.now(),
    });

    if (args.actingUserId) {
      await _logAuditEntry(ctx, {
        action: "user.roleChange",
        userId: args.actingUserId,
        branchId: user?.branchId,
        entityType: "users",
        entityId: args.id,
        before: { role: oldRole },
        after: { role: args.role },
      });
    }
  },
});

export const updateBranch = internalMutation({
  args: {
    id: v.id("users"),
    branchId: v.optional(v.id("branches")),
    actingUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.id);
    const oldBranchId = user?.branchId;

    await ctx.db.patch(args.id, {
      branchId: args.branchId,
      updatedAt: Date.now(),
    });

    if (args.actingUserId) {
      await _logAuditEntry(ctx, {
        action: "user.branchAssign",
        userId: args.actingUserId,
        branchId: args.branchId,
        entityType: "users",
        entityId: args.id,
        before: { branchId: oldBranchId },
        after: { branchId: args.branchId },
      });
    }
  },
});

// ─── Public Queries ──────────────────────────────────────────────────────────

export const getUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ADMIN_ROLES);
    return await ctx.db.query("users").collect();
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
  },
});

export const getUserById = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);
    return await ctx.db.get(args.id);
  },
});

// ─── Public Mutations ────────────────────────────────────────────────────────

export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireRole(ctx, ADMIN_ROLES);
    const existing = await ctx.db.get(args.userId);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "User not found" });
    }
    const { userId, ...updates } = args;

    // Capture only changed fields for before/after
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        before[key] = existing?.[key as keyof typeof existing];
        after[key] = value;
      }
    }

    await ctx.db.patch(userId, {
      ...updates,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "user.update",
      userId: caller._id,
      branchId: existing?.branchId,
      entityType: "users",
      entityId: userId,
      before,
      after,
    });
  },
});

export const deactivateUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const caller = await requireRole(ctx, ADMIN_ROLES);
    if (args.userId === caller._id) {
      throw new Error("Cannot deactivate your own account");
    }

    const user = await ctx.db.get(args.userId);

    await ctx.db.patch(args.userId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "user.deactivate",
      userId: caller._id,
      branchId: user?.branchId,
      entityType: "users",
      entityId: args.userId,
      before: { isActive: true },
      after: { isActive: false },
    });
  },
});

export const reactivateUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const caller = await requireRole(ctx, ADMIN_ROLES);

    const user = await ctx.db.get(args.userId);

    await ctx.db.patch(args.userId, {
      isActive: true,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "user.reactivate",
      userId: caller._id,
      branchId: user?.branchId,
      entityType: "users",
      entityId: args.userId,
      before: { isActive: false },
      after: { isActive: true },
    });
  },
});

// ─── Actions (external API calls) ───────────────────────────────────────────

/**
 * Sets a user's role in both Convex and Clerk.
 *
 * NOTE: Audit trail trade-off — the audit entry is created inside the
 * `updateRole` internal mutation (step 1). If the Clerk API call (step 2)
 * fails, the data is rolled back but the audit entry persists as a phantom
 * record. This is accepted because Convex actions cannot atomically span
 * mutation + external API call. The audit trail captures the attempted change.
 */
export const setUserRole = action({
  args: {
    userId: v.id("users"),
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    // Authorize caller as admin (actions lack ctx.db, so verify via internal query)
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const caller = await ctx.runQuery(internal.auth.users.getByClerkId, {
      clerkId: identity.subject,
    });
    if (!caller || !caller.isActive || caller.role !== "admin") {
      throw new Error("Unauthorized: Admin role required");
    }

    // Prevent self-demotion
    if (args.userId === caller._id) {
      throw new Error("Cannot change your own role");
    }

    // Get target user
    const user = await ctx.runQuery(internal.auth.users.getById, {
      id: args.userId,
    });
    if (!user) throw new Error("User not found");

    // 1. Update Convex first (more reliable, rollback-friendly)
    await ctx.runMutation(internal.auth.users.updateRole, {
      id: args.userId,
      role: args.role,
      actingUserId: caller._id,
    });

    // 2. Update Clerk publicMetadata — rollback Convex on failure
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      await ctx.runMutation(internal.auth.users.updateRole, {
        id: args.userId,
        role: user.role,
      });
      throw new Error(
        "CLERK_SECRET_KEY is not set in Convex environment variables"
      );
    }

    try {
      const response = await fetch(
        `https://api.clerk.com/v1/users/${user.clerkId}/metadata`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${clerkSecretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            public_metadata: { role: args.role },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to update Clerk metadata: ${response.status} ${errorText}`
        );
      }
    } catch (err) {
      // Rollback Convex change on Clerk failure
      await ctx.runMutation(internal.auth.users.updateRole, {
        id: args.userId,
        role: user.role,
      });
      throw err;
    }
  },
});

/**
 * Assigns a user to a branch in both Convex and Clerk.
 *
 * NOTE: Same audit trail trade-off as setUserRole — see its JSDoc.
 */
export const assignBranch = action({
  args: {
    userId: v.id("users"),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    // Authorize caller as admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const caller = await ctx.runQuery(internal.auth.users.getByClerkId, {
      clerkId: identity.subject,
    });
    if (!caller || !caller.isActive || caller.role !== "admin") {
      throw new Error("Unauthorized: Admin role required");
    }

    // Get target user
    const user = await ctx.runQuery(internal.auth.users.getById, {
      id: args.userId,
    });
    if (!user) throw new Error("User not found");

    // 1. Update Convex first
    await ctx.runMutation(internal.auth.users.updateBranch, {
      id: args.userId,
      branchId: args.branchId,
      actingUserId: caller._id,
    });

    // 2. Update Clerk publicMetadata — rollback Convex on failure
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      await ctx.runMutation(internal.auth.users.updateBranch, {
        id: args.userId,
        branchId: user.branchId,
      });
      throw new Error(
        "CLERK_SECRET_KEY is not set in Convex environment variables"
      );
    }

    try {
      const response = await fetch(
        `https://api.clerk.com/v1/users/${user.clerkId}/metadata`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${clerkSecretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            public_metadata: { branchId: args.branchId ?? null },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to update Clerk metadata: ${response.status} ${errorText}`
        );
      }
    } catch (err) {
      // Rollback Convex change on Clerk failure
      await ctx.runMutation(internal.auth.users.updateBranch, {
        id: args.userId,
        branchId: user.branchId,
      });
      throw err;
    }
  },
});

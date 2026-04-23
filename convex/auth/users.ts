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

// ─── Sync All Clerk Users ──────────────────────────────────────────────────

type ValidRole =
  | "admin"
  | "manager"
  | "cashier"
  | "warehouseStaff"
  | "hqStaff"
  | "viewer"
  | "driver"
  | "supplier";

const VALID_ROLES = new Set<ValidRole>([
  "admin", "manager", "cashier", "warehouseStaff",
  "hqStaff", "viewer", "driver", "supplier",
]);

// Internal query to check if users table is empty (for bootstrap)
export const countUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.length;
  },
});

/** Counts real (non-seed) users — excludes demo cashiers with clerkId starting with "seed-". */
export const countNonSeedUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.filter((u) => !u.clerkId.startsWith("seed-")).length;
  },
});

/**
 * DEV-ONLY: wipes every row from the `users` table. Use when switching Clerk
 * instances so stale clerkIds don't linger. Run via:
 *   npx convex run auth/users:_wipeAllUsers
 */
export const _wipeAllUsers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    for (const u of users) {
      await ctx.db.delete(u._id);
    }
    return { deleted: users.length };
  },
});

/**
 * DEV-ONLY: sets public_metadata.role on a Clerk user so the JWT carries the
 * correct role claim. Middleware reads from the JWT, so this is required for
 * role-gated routes to work. Run via:
 *   npx convex run auth/users:_devSetClerkRole '{"email":"you@x.com","role":"admin"}'
 */
export const _devSetClerkRole = action({
  args: {
    email: v.string(),
    role: roleValidator,
  },
  handler: async (_ctx, args): Promise<{ clerkId: string; email: string; role: string }> => {
    const clerkSecret = process.env.CLERK_SECRET_KEY;
    if (!clerkSecret) throw new ConvexError({ code: "CONFIG_ERROR", message: "CLERK_SECRET_KEY not set" });

    // Find user by email
    const listRes = await fetch(
      `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(args.email)}`,
      { headers: { Authorization: `Bearer ${clerkSecret}` } }
    );
    if (!listRes.ok) {
      throw new ConvexError({ code: "CLERK_API_ERROR", message: `List users: ${listRes.status}` });
    }
    const users = await listRes.json();
    if (!Array.isArray(users) || users.length === 0) {
      throw new ConvexError({ code: "NOT_FOUND", message: `No Clerk user with email ${args.email}` });
    }
    const clerkUser = users[0];

    // Patch public_metadata.role
    const patchRes = await fetch(`https://api.clerk.com/v1/users/${clerkUser.id}/metadata`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${clerkSecret}`,
      },
      body: JSON.stringify({ public_metadata: { role: args.role } }),
    });
    if (!patchRes.ok) {
      const body = await patchRes.json();
      throw new ConvexError({
        code: "CLERK_API_ERROR",
        message: `Patch metadata failed: ${patchRes.status} — ${JSON.stringify(body)}`,
      });
    }

    return { clerkId: clerkUser.id, email: args.email, role: args.role };
  },
});

/**
 * DEV-ONLY: syncs Clerk users into Convex without any auth check. Intended for
 * CLI use when bootstrap mode has been exited and no admin session exists.
 * Run via:
 *   npx convex run auth/users:_devSyncClerkUsers
 */
export const _devSyncClerkUsers = action({
  args: {},
  handler: async (ctx): Promise<{
    synced: number;
    updated: number;
    skipped: number;
    total: number;
  }> => {
    const clerkSecret = process.env.CLERK_SECRET_KEY;
    if (!clerkSecret) throw new ConvexError({ code: "CONFIG_ERROR", message: "CLERK_SECRET_KEY not set" });

    let synced = 0;
    let skipped = 0;
    let updated = 0;
    let offset = 0;
    const limit = 100;

    while (true) {
      const res = await fetch(
        `https://api.clerk.com/v1/users?limit=${limit}&offset=${offset}&order_by=-created_at`,
        { headers: { Authorization: `Bearer ${clerkSecret}` } }
      );
      if (!res.ok) {
        throw new ConvexError({ code: "CLERK_API_ERROR", message: `Clerk API error: ${res.status}` });
      }
      const users = await res.json();
      if (!Array.isArray(users) || users.length === 0) break;

      for (const clerkUser of users) {
        const clerkId = clerkUser.id;
        const email =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          clerkUser.email_addresses?.find((e: any) => e.id === clerkUser.primary_email_address_id)?.email_address ??
          clerkUser.email_addresses?.[0]?.email_address ?? "";
        const name = [clerkUser.first_name, clerkUser.last_name].filter(Boolean).join(" ") || email;
        const metaRole = clerkUser.public_metadata?.role;
        const role = (typeof metaRole === "string" && VALID_ROLES.has(metaRole as ValidRole))
          ? (metaRole as ValidRole)
          : "viewer";

        const existing = await ctx.runQuery(internal.auth.users.getByClerkId, { clerkId });
        if (existing) {
          // Always update — picks up role/name/email changes from Clerk
          await ctx.runMutation(internal.auth.users.updateFromWebhook, {
            id: existing._id,
            email,
            name,
            role,
            updatedAt: Date.now(),
          });
          updated++;
        } else {
          await ctx.runMutation(internal.auth.users.createFromWebhook, {
            clerkId,
            email,
            name,
            role,
            isActive: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          synced++;
        }
      }

      if (users.length < limit) break;
      offset += limit;
    }

    return { synced, updated, skipped, total: synced + updated + skipped };
  },
});

/**
 * DEV-ONLY: invites a new user to the current Clerk instance with optional role.
 * Sends them a Clerk invitation email. When they accept, the webhook syncs them
 * into Convex automatically. Run via:
 *   npx convex run auth/users:inviteUser '{"email":"foo@bar.com","role":"viewer"}'
 */
export const inviteUser = action({
  args: {
    email: v.string(),
    role: v.optional(roleValidator),
  },
  handler: async (_ctx, args) => {
    const clerkSecret = process.env.CLERK_SECRET_KEY;
    if (!clerkSecret) {
      throw new ConvexError({ code: "CONFIG_ERROR", message: "CLERK_SECRET_KEY not set" });
    }
    const res = await fetch("https://api.clerk.com/v1/invitations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${clerkSecret}`,
      },
      body: JSON.stringify({
        email_address: args.email,
        public_metadata: args.role ? { role: args.role } : undefined,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      throw new ConvexError({
        code: "CLERK_API_ERROR",
        message: `Clerk invite failed: ${res.status} — ${JSON.stringify(body)}`,
      });
    }
    return {
      invitationId: body.id,
      email: body.email_address,
      status: body.status,
      url: body.url,
    };
  },
});

export const syncClerkUsers = action({
  args: {},
  handler: async (ctx) => {
    // Allow unauthenticated access in bootstrap mode: either no users yet, or only
    // seed/demo users exist (clerkId prefixed with "seed-"). Real signups include
    // the admin's authenticated sessions, which must go through the browser.
    const userCount = await ctx.runQuery(internal.auth.users.countUsers);
    const nonSeedCount = await ctx.runQuery(internal.auth.users.countNonSeedUsers);
    const isBootstrap = userCount === 0 || nonSeedCount === 0;

    if (!isBootstrap) {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new ConvexError({ code: "UNAUTHORIZED", message: "Not authenticated" });

      const caller = await ctx.runQuery(internal.auth.users.getByClerkId, {
        clerkId: identity.subject,
      });
      if (!caller || caller.role !== "admin") {
        throw new ConvexError({ code: "FORBIDDEN", message: "Admin access required" });
      }
    }

    const clerkSecret = process.env.CLERK_SECRET_KEY;
    if (!clerkSecret) throw new ConvexError({ code: "CONFIG_ERROR", message: "CLERK_SECRET_KEY not set" });

    let synced = 0;
    let skipped = 0;
    let updated = 0;
    let offset = 0;
    const limit = 100;

    // Paginate through all Clerk users
    while (true) {
      const res = await fetch(
        `https://api.clerk.com/v1/users?limit=${limit}&offset=${offset}&order_by=-created_at`,
        { headers: { Authorization: `Bearer ${clerkSecret}` } }
      );
      if (!res.ok) {
        throw new ConvexError({ code: "CLERK_API_ERROR", message: `Clerk API error: ${res.status}` });
      }

      const users = await res.json();
      if (!Array.isArray(users) || users.length === 0) break;

      for (const clerkUser of users) {
        const clerkId = clerkUser.id;
        const email =
          clerkUser.email_addresses?.find(
            (e: any) => e.id === clerkUser.primary_email_address_id
          )?.email_address ?? clerkUser.email_addresses?.[0]?.email_address ?? "";
        const name = [clerkUser.first_name, clerkUser.last_name]
          .filter(Boolean)
          .join(" ") || email;
        const metaRole = clerkUser.public_metadata?.role;
        const role = (typeof metaRole === "string" && VALID_ROLES.has(metaRole as ValidRole))
          ? (metaRole as ValidRole)
          : "viewer";

        // Check if already exists
        const existing = await ctx.runQuery(internal.auth.users.getByClerkId, { clerkId });

        if (existing) {
          // Update if name or email changed
          if (existing.email !== email || existing.name !== name) {
            await ctx.runMutation(internal.auth.users.updateFromWebhook, {
              id: existing._id,
              email,
              name,
              role: role as any,
              updatedAt: Date.now(),
            });
            updated++;
          } else {
            skipped++;
          }
        } else {
          await ctx.runMutation(internal.auth.users.createFromWebhook, {
            clerkId,
            email,
            name,
            role: role as any,
            isActive: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          synced++;
        }
      }

      if (users.length < limit) break;
      offset += limit;
    }

    return { synced, updated, skipped, total: synced + updated + skipped };
  },
});

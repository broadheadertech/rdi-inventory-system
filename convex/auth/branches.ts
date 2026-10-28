import { v, ConvexError } from "convex/values";
import { query, mutation } from "../_generated/server";
import { requireRole, ADMIN_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

const channelValidator = v.optional(
  v.union(
    v.literal("inline"),
    v.literal("online"),
    v.literal("outlet"),
    v.literal("popup"),
    v.literal("dtc"),
    v.literal("warehouse"),
    v.literal("outright")
  )
);

const branchTypeValidator = v.optional(
  v.union(v.literal("store"), v.literal("headOffice"))
);

// ─── Queries ────────────────────────────────────────────────────────────────

export const listBranches = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ADMIN_ROLES);
    return await ctx.db.query("branches").collect();
  },
});

export const getWarehouseBranch = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ADMIN_ROLES);
    const all = await ctx.db.query("branches").collect();
    return all.find((b) => b.channel === "warehouse" && b.isActive) ?? null;
  },
});

export const getBranchById = query({
  args: { branchId: v.id("branches") },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);
    return await ctx.db.get(args.branchId);
  },
});

// ─── Mutations ──────────────────────────────────────────────────────────────

export const createBranch = mutation({
  args: {
    name: v.string(),
    address: v.string(),
    code: v.optional(v.string()),
    branchType: branchTypeValidator,
    // Empty or absent means all brands.
    brandIds: v.optional(v.array(v.id("brands"))),
    phone: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    channel: channelValidator,
    classification: v.optional(
      v.union(v.literal("premium"), v.literal("aclass"), v.literal("bnc"), v.literal("outlet"))
    ),
    region: v.optional(
      v.union(v.literal("luzon"), v.literal("visayas"), v.literal("mindanao"))
    ),
    configuration: v.optional(
      v.object({
        timezone: v.optional(v.string()),
        businessHours: v.optional(
          v.object({
            openTime: v.string(),
            closeTime: v.string(),
          })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);
    const branchId = await ctx.db.insert("branches", {
      ...args,
      brandIds: args.brandIds?.length ? args.brandIds : undefined,
      channel: args.channel ?? "inline",
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "branch.create",
      userId: user._id,
      entityType: "branches",
      entityId: branchId,
      after: {
        name: args.name,
        address: args.address,
        code: args.code,
        branchType: args.branchType,
        brandIds: args.brandIds,
        isActive: true,
        phone: args.phone,
        latitude: args.latitude,
        longitude: args.longitude,
        channel: args.channel,
        classification: args.classification,
        region: args.region,
        configuration: args.configuration,
      },
    });

    return branchId;
  },
});

export const updateBranch = mutation({
  args: {
    branchId: v.id("branches"),
    name: v.optional(v.string()),
    address: v.optional(v.string()),
    code: v.optional(v.string()),
    branchType: branchTypeValidator,
    // Empty or absent means all brands.
    brandIds: v.optional(v.array(v.id("brands"))),
    phone: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    channel: channelValidator,
    classification: v.optional(
      v.union(v.literal("premium"), v.literal("aclass"), v.literal("bnc"), v.literal("outlet"))
    ),
    region: v.optional(
      v.union(v.literal("luzon"), v.literal("visayas"), v.literal("mindanao"))
    ),
    configuration: v.optional(
      v.object({
        timezone: v.optional(v.string()),
        businessHours: v.optional(
          v.object({
            openTime: v.string(),
            closeTime: v.string(),
          })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);
    const existing = await ctx.db.get(args.branchId);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Branch not found" });
    }

    const { branchId, ...updates } = args;

    // Capture only changed fields for before/after
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        before[key] = existing[key as keyof typeof existing];
        after[key] = value;
      }
    }

    await ctx.db.patch(branchId, {
      ...updates,
      // An empty list is "all brands", which is stored as no list at all.
      ...(updates.brandIds !== undefined && updates.brandIds.length === 0
        ? { brandIds: undefined }
        : {}),
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "branch.update",
      userId: user._id,
      branchId,
      entityType: "branches",
      entityId: branchId,
      before,
      after,
    });
  },
});

export const deactivateBranch = mutation({
  args: { branchId: v.id("branches") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);

    const branch = await ctx.db.get(args.branchId);
    if (!branch) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Branch not found" });
    }
    if (!branch.isActive) {
      throw new ConvexError({ code: "ALREADY_INACTIVE", message: "Branch is already inactive" });
    }

    // Check no active users are assigned to this branch
    const assignedUsers = await ctx.db
      .query("users")
      .withIndex("by_branch", (q) => q.eq("branchId", args.branchId))
      .collect();

    const activeUsers = assignedUsers.filter((u) => u.isActive);
    if (activeUsers.length > 0) {
      throw new ConvexError({
        code: "BRANCH_HAS_USERS",
        message: `Cannot deactivate: ${activeUsers.length} active user${activeUsers.length !== 1 ? "s" : ""} assigned to this branch`,
      });
    }

    await ctx.db.patch(args.branchId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "branch.deactivate",
      userId: user._id,
      entityType: "branches",
      entityId: args.branchId,
      before: { isActive: true },
      after: { isActive: false },
    });
  },
});

export const reactivateBranch = mutation({
  args: { branchId: v.id("branches") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);
    const branch = await ctx.db.get(args.branchId);
    if (!branch) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Branch not found" });
    }
    await ctx.db.patch(args.branchId, {
      isActive: true,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "branch.reactivate",
      userId: user._id,
      entityType: "branches",
      entityId: args.branchId,
      before: { isActive: false },
      after: { isActive: true },
    });
  },
});

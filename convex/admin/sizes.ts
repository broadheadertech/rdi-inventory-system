import { v, ConvexError } from "convex/values";
import { query, mutation } from "../_generated/server";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

// ─── Queries ────────────────────────────────────────────────────────────────

export const listSizes = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);
    return ctx.db.query("sizes").withIndex("by_sortOrder").collect();
  },
});

// ─── Mutations ──────────────────────────────────────────────────────────────

export const createSize = mutation({
  args: {
    name: v.string(),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const all = await ctx.db.query("sizes").collect();
    const duplicate = all.find(
      (s) => s.name.toLowerCase() === args.name.toLowerCase()
    );
    if (duplicate) {
      throw new ConvexError({
        code: "DUPLICATE_NAME",
        message: `A size named "${duplicate.name}" already exists`,
      });
    }

    const sizeId = await ctx.db.insert("sizes", {
      name: args.name,
      sortOrder: args.sortOrder,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "size.create",
      userId: user._id,
      entityType: "sizes",
      entityId: sizeId,
      after: { name: args.name, sortOrder: args.sortOrder, isActive: true },
    });

    return sizeId;
  },
});

export const updateSize = mutation({
  args: {
    sizeId: v.id("sizes"),
    name: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const existing = await ctx.db.get(args.sizeId);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Size not found" });
    }

    if (args.name !== undefined && args.name.toLowerCase() !== existing.name.toLowerCase()) {
      const all = await ctx.db.query("sizes").collect();
      const duplicate = all.find(
        (s) => s._id !== args.sizeId && s.name.toLowerCase() === args.name!.toLowerCase()
      );
      if (duplicate) {
        throw new ConvexError({
          code: "DUPLICATE_NAME",
          message: `A size named "${duplicate.name}" already exists`,
        });
      }
    }

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const patch: Record<string, unknown> = {};

    if (args.name !== undefined && args.name !== existing.name) {
      before.name = existing.name;
      after.name = args.name;
      patch.name = args.name;
    }
    if (args.sortOrder !== undefined && args.sortOrder !== existing.sortOrder) {
      before.sortOrder = existing.sortOrder;
      after.sortOrder = args.sortOrder;
      patch.sortOrder = args.sortOrder;
    }

    if (Object.keys(patch).length === 0) return;

    await ctx.db.patch(args.sizeId, { ...patch, updatedAt: Date.now() });

    await _logAuditEntry(ctx, {
      action: "size.update",
      userId: user._id,
      entityType: "sizes",
      entityId: args.sizeId,
      before,
      after,
    });
  },
});

export const toggleSizeStatus = mutation({
  args: {
    sizeId: v.id("sizes"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const size = await ctx.db.get(args.sizeId);
    if (!size) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Size not found" });
    }

    await ctx.db.patch(args.sizeId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: args.isActive ? "size.activate" : "size.deactivate",
      userId: user._id,
      entityType: "sizes",
      entityId: args.sizeId,
      before: { isActive: size.isActive },
      after: { isActive: args.isActive },
    });
  },
});

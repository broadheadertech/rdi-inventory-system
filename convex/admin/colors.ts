import { v, ConvexError } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

// ─── Queries ────────────────────────────────────────────────────────────────

export const listColors = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);
    const colors = await ctx.db.query("colors").collect();
    return colors.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listActiveColors = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);
    const colors = await ctx.db.query("colors").collect();
    return colors
      .filter((c) => c.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ─── Mutations ──────────────────────────────────────────────────────────────

export const createColor = mutation({
  args: {
    name: v.string(),
    hexCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const all = await ctx.db.query("colors").collect();
    const duplicate = all.find(
      (c) => c.name.toLowerCase() === args.name.toLowerCase()
    );
    if (duplicate) {
      throw new ConvexError({
        code: "DUPLICATE_NAME",
        message: `A color named "${duplicate.name}" already exists`,
      });
    }

    const colorId = await ctx.db.insert("colors", {
      name: args.name,
      hexCode: args.hexCode,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "color.create",
      userId: user._id,
      entityType: "colors",
      entityId: colorId,
      after: { name: args.name, hexCode: args.hexCode, isActive: true },
    });

    return colorId;
  },
});

export const updateColor = mutation({
  args: {
    colorId: v.id("colors"),
    name: v.optional(v.string()),
    hexCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const existing = await ctx.db.get(args.colorId);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Color not found" });
    }

    if (args.name !== undefined && args.name.toLowerCase() !== existing.name.toLowerCase()) {
      const all = await ctx.db.query("colors").collect();
      const duplicate = all.find(
        (c) => c._id !== args.colorId && c.name.toLowerCase() === args.name!.toLowerCase()
      );
      if (duplicate) {
        throw new ConvexError({
          code: "DUPLICATE_NAME",
          message: `A color named "${duplicate.name}" already exists`,
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
    if (args.hexCode !== undefined && args.hexCode !== existing.hexCode) {
      before.hexCode = existing.hexCode;
      after.hexCode = args.hexCode;
      patch.hexCode = args.hexCode;
    }

    if (Object.keys(patch).length === 0) return;

    await ctx.db.patch(args.colorId, { ...patch, updatedAt: Date.now() });

    await _logAuditEntry(ctx, {
      action: "color.update",
      userId: user._id,
      entityType: "colors",
      entityId: args.colorId,
      before,
      after,
    });
  },
});

export const _seedColors = internalMutation({
  args: {
    items: v.array(v.object({ name: v.string(), hexCode: v.optional(v.string()) })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("colors").collect();
    const existingNames = new Set(existing.map((c) => c.name.toUpperCase()));
    let created = 0;
    for (const item of args.items) {
      const upper = item.name.toUpperCase();
      if (existingNames.has(upper)) continue;
      await ctx.db.insert("colors", {
        name: upper,
        hexCode: item.hexCode,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      existingNames.add(upper);
      created++;
    }
    return { created, skipped: args.items.length - created };
  },
});

export const toggleColorStatus = mutation({
  args: {
    colorId: v.id("colors"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const color = await ctx.db.get(args.colorId);
    if (!color) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Color not found" });
    }

    await ctx.db.patch(args.colorId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: args.isActive ? "color.activate" : "color.deactivate",
      userId: user._id,
      entityType: "colors",
      entityId: args.colorId,
      before: { isActive: color.isActive },
      after: { isActive: args.isActive },
    });
  },
});

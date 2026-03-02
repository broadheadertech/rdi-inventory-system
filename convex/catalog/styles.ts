import { v, ConvexError } from "convex/values";
import { query, mutation } from "../_generated/server";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

// ─── Queries ────────────────────────────────────────────────────────────────

export const listStyles = query({
  args: {
    categoryId: v.id("categories"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    return await ctx.db
      .query("styles")
      .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId))
      .collect();
  },
});

export const getStyleById = query({
  args: { styleId: v.id("styles") },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    return await ctx.db.get(args.styleId);
  },
});

// ─── Mutations ──────────────────────────────────────────────────────────────

export const createStyle = mutation({
  args: {
    categoryId: v.id("categories"),
    name: v.string(),
    description: v.optional(v.string()),
    basePriceCentavos: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    // Validate required fields
    if (args.name.trim() === "") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Name cannot be empty" });
    }
    if (!Number.isInteger(args.basePriceCentavos) || args.basePriceCentavos <= 0) {
      throw new ConvexError({
        code: "INVALID_PRICE",
        message: "Base price must be a positive integer in centavos",
      });
    }

    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Category not found" });
    }
    if (!category.isActive) {
      throw new ConvexError({
        code: "CATEGORY_INACTIVE",
        message: "Cannot add styles to an inactive category",
      });
    }

    // Check for duplicate name within this category (case-insensitive)
    const siblings = await ctx.db
      .query("styles")
      .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId))
      .collect();
    const duplicate = siblings.find(
      (s) => s.name.toLowerCase() === args.name.toLowerCase()
    );
    if (duplicate) {
      throw new ConvexError({
        code: "DUPLICATE_NAME",
        message: `A style named "${duplicate.name}" already exists in this category`,
      });
    }

    const styleId = await ctx.db.insert("styles", {
      categoryId: args.categoryId,
      name: args.name,
      description: args.description,
      basePriceCentavos: args.basePriceCentavos,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "style.create",
      userId: user._id,
      entityType: "styles",
      entityId: styleId,
      after: {
        categoryId: args.categoryId,
        name: args.name,
        basePriceCentavos: args.basePriceCentavos,
        isActive: true,
      },
    });

    return styleId;
  },
});

export const updateStyle = mutation({
  args: {
    styleId: v.id("styles"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    basePriceCentavos: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const existing = await ctx.db.get(args.styleId);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Style not found" });
    }

    // Validate non-empty name
    if (args.name !== undefined && args.name.trim() === "") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Name cannot be empty" });
    }

    // Validate price if provided
    if (args.basePriceCentavos !== undefined) {
      if (!Number.isInteger(args.basePriceCentavos) || args.basePriceCentavos <= 0) {
        throw new ConvexError({
          code: "INVALID_PRICE",
          message: "Base price must be a positive integer in centavos",
        });
      }
    }

    // Check for duplicate name if renaming (case-insensitive, within same category)
    if (args.name !== undefined && args.name.toLowerCase() !== existing.name.toLowerCase()) {
      const siblings = await ctx.db
        .query("styles")
        .withIndex("by_category", (q) => q.eq("categoryId", existing.categoryId))
        .collect();
      const duplicate = siblings.find(
        (s) => s._id !== args.styleId && s.name.toLowerCase() === args.name!.toLowerCase()
      );
      if (duplicate) {
        throw new ConvexError({
          code: "DUPLICATE_NAME",
          message: `A style named "${duplicate.name}" already exists in this category`,
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

    // Empty string means "clear description", undefined means "no change"
    if (args.description !== undefined) {
      const newDesc = args.description === "" ? undefined : args.description;
      if (newDesc !== existing.description) {
        before.description = existing.description;
        after.description = newDesc;
        patch.description = newDesc;
      }
    }

    if (args.basePriceCentavos !== undefined && args.basePriceCentavos !== existing.basePriceCentavos) {
      before.basePriceCentavos = existing.basePriceCentavos;
      after.basePriceCentavos = args.basePriceCentavos;
      patch.basePriceCentavos = args.basePriceCentavos;
    }

    if (Object.keys(patch).length === 0) {
      return; // Nothing changed
    }

    await ctx.db.patch(args.styleId, {
      ...patch,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "style.update",
      userId: user._id,
      entityType: "styles",
      entityId: args.styleId,
      before,
      after,
    });
  },
});

export const deactivateStyle = mutation({
  args: { styleId: v.id("styles") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const style = await ctx.db.get(args.styleId);
    if (!style) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Style not found" });
    }
    if (!style.isActive) {
      throw new ConvexError({
        code: "ALREADY_INACTIVE",
        message: "Style is already inactive",
      });
    }

    await ctx.db.patch(args.styleId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "style.deactivate",
      userId: user._id,
      entityType: "styles",
      entityId: args.styleId,
      before: { isActive: true },
      after: { isActive: false },
    });
  },
});

export const reactivateStyle = mutation({
  args: { styleId: v.id("styles") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const style = await ctx.db.get(args.styleId);
    if (!style) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Style not found" });
    }
    if (style.isActive) {
      throw new ConvexError({
        code: "ALREADY_ACTIVE",
        message: "Style is already active",
      });
    }

    await ctx.db.patch(args.styleId, {
      isActive: true,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "style.reactivate",
      userId: user._id,
      entityType: "styles",
      entityId: args.styleId,
      before: { isActive: false },
      after: { isActive: true },
    });
  },
});

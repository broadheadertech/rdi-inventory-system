import { v, ConvexError } from "convex/values";
import { query, mutation } from "../_generated/server";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

// ─── Queries ────────────────────────────────────────────────────────────────

export const listCategories = query({
  args: {
    brandId: v.optional(v.id("brands")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    if (args.brandId) {
      return await ctx.db
        .query("categories")
        .withIndex("by_brand", (q) => q.eq("brandId", args.brandId!))
        .collect();
    }

    return await ctx.db.query("categories").collect();
  },
});

export const getCategoryById = query({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    return await ctx.db.get(args.categoryId);
  },
});

// ─── Mutations ──────────────────────────────────────────────────────────────

export const createCategory = mutation({
  args: {
    brandId: v.id("brands"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const brand = await ctx.db.get(args.brandId);
    if (!brand) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Brand not found" });
    }
    if (!brand.isActive) {
      throw new ConvexError({
        code: "BRAND_INACTIVE",
        message: "Cannot add categories to an inactive brand",
      });
    }

    // Check for duplicate name within this brand (case-insensitive)
    const brandCategories = await ctx.db
      .query("categories")
      .withIndex("by_brand", (q) => q.eq("brandId", args.brandId))
      .collect();
    const duplicate = brandCategories.find(
      (c) => c.name.toLowerCase() === args.name.toLowerCase()
    );
    if (duplicate) {
      throw new ConvexError({
        code: "DUPLICATE_NAME",
        message: `A category named "${duplicate.name}" already exists for this brand`,
      });
    }

    const categoryId = await ctx.db.insert("categories", {
      brandId: args.brandId,
      name: args.name,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "category.create",
      userId: user._id,
      entityType: "categories",
      entityId: categoryId,
      after: { brandId: args.brandId, name: args.name, isActive: true },
    });

    return categoryId;
  },
});

export const updateCategory = mutation({
  args: {
    categoryId: v.id("categories"),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const existing = await ctx.db.get(args.categoryId);
    if (!existing) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Category not found",
      });
    }

    // Check for duplicate name if renaming (case-insensitive, within same brand)
    if (args.name !== undefined && args.name.toLowerCase() !== existing.name.toLowerCase()) {
      const brandCategories = await ctx.db
        .query("categories")
        .withIndex("by_brand", (q) => q.eq("brandId", existing.brandId))
        .collect();
      const duplicate = brandCategories.find(
        (c) => c._id !== args.categoryId && c.name.toLowerCase() === args.name!.toLowerCase()
      );
      if (duplicate) {
        throw new ConvexError({
          code: "DUPLICATE_NAME",
          message: `A category named "${duplicate.name}" already exists for this brand`,
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

    if (Object.keys(patch).length === 0) {
      return; // Nothing changed
    }

    await ctx.db.patch(args.categoryId, {
      ...patch,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "category.update",
      userId: user._id,
      entityType: "categories",
      entityId: args.categoryId,
      before,
      after,
    });
  },
});

export const deactivateCategory = mutation({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Category not found",
      });
    }
    if (!category.isActive) {
      throw new ConvexError({
        code: "ALREADY_INACTIVE",
        message: "Category is already inactive",
      });
    }

    await ctx.db.patch(args.categoryId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "category.deactivate",
      userId: user._id,
      entityType: "categories",
      entityId: args.categoryId,
      before: { isActive: true },
      after: { isActive: false },
    });
  },
});

export const reactivateCategory = mutation({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Category not found",
      });
    }

    await ctx.db.patch(args.categoryId, {
      isActive: true,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "category.reactivate",
      userId: user._id,
      entityType: "categories",
      entityId: args.categoryId,
      before: { isActive: false },
      after: { isActive: true },
    });
  },
});

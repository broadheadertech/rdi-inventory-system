import { v, ConvexError } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "../_generated/server";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

const productCodeType = v.union(
  v.literal("department"),
  v.literal("division"),
  v.literal("category"),
  v.literal("subCategory"),
  v.literal("season"),
  v.literal("year"),
  v.literal("production"),
  v.literal("outlier"),
  v.literal("fit")
);

// ─── Queries ────────────────────────────────────────────────────────────────

export const listByType = query({
  args: { type: productCodeType },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    return await ctx.db
      .query("productCodes")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .collect();
  },
});

export const listAllActive = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);
    const all = await ctx.db.query("productCodes").collect();
    return all.filter((pc) => pc.isActive);
  },
});

export const listChildren = query({
  args: { parentId: v.id("productCodes") },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    const all = await ctx.db.query("productCodes").collect();
    return all.filter((pc) => pc.parentId === args.parentId);
  },
});

export const getById = query({
  args: { id: v.id("productCodes") },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    return await ctx.db.get(args.id);
  },
});

// ─── Mutations ──────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    type: productCodeType,
    description: v.string(),
    code: v.optional(v.string()),
    parentId: v.optional(v.id("productCodes")),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);
    const upperCode = args.code?.toUpperCase();
    const upperDesc = args.description.toUpperCase();
    const isDivision = args.type === "division";

    // Division has no code; all others require it
    if (!isDivision && !upperCode) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Code is required" });
    }

    const existing = await ctx.db
      .query("productCodes")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .collect();

    // Check for duplicate code within same type (skip for division)
    // Allow duplicate codes — uniqueness is at the full style code level
    if (upperCode) {
      const duplicateExact = existing.find(
        (pc) => pc.code === upperCode && pc.description.toLowerCase() === args.description.toLowerCase()
      );
      if (duplicateExact) {
        throw new ConvexError({
          code: "DUPLICATE_ENTRY",
          message: `"${args.description}" with code "${upperCode}" already exists for ${args.type}`,
        });
      }
    }

    const duplicateDesc = existing.find(
      (pc) => pc.description.toLowerCase() === args.description.toLowerCase()
    );
    if (duplicateDesc) {
      throw new ConvexError({
        code: "DUPLICATE_DESCRIPTION",
        message: `"${args.description}" already exists for ${args.type}`,
      });
    }

    const id = await ctx.db.insert("productCodes", {
      type: args.type,
      description: upperDesc,
      code: upperCode,
      parentId: args.parentId,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "productCode.create",
      userId: user._id,
      entityType: "productCodes",
      entityId: id,
      after: { type: args.type, description: upperDesc, code: upperCode },
    });

    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("productCodes"),
    description: v.optional(v.string()),
    code: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Product code not found" });
    }

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const patch: Record<string, unknown> = {};

    if (args.code !== undefined) {
      const upperCode = args.code.toUpperCase();
      if (upperCode !== existing.code) {
        // Check for duplicate code within same type
        const sameType = await ctx.db
          .query("productCodes")
          .withIndex("by_type", (q) => q.eq("type", existing.type))
          .collect();
        const dup = sameType.find((pc) => pc._id !== args.id && pc.code === upperCode);
        if (dup) {
          throw new ConvexError({
            code: "DUPLICATE_CODE",
            message: `Code "${upperCode}" already exists for ${existing.type}`,
          });
        }
        before.code = existing.code;
        after.code = upperCode;
        patch.code = upperCode;
      }
    }

    if (args.description !== undefined) {
      const upperDesc = args.description.toUpperCase();
      if (upperDesc !== existing.description) {
        const sameType = await ctx.db
          .query("productCodes")
          .withIndex("by_type", (q) => q.eq("type", existing.type))
          .collect();
        const dup = sameType.find(
          (pc) => pc._id !== args.id && pc.description.toLowerCase() === upperDesc.toLowerCase()
        );
        if (dup) {
          throw new ConvexError({
            code: "DUPLICATE_DESCRIPTION",
            message: `"${upperDesc}" already exists for ${existing.type}`,
          });
        }
        before.description = existing.description;
        after.description = upperDesc;
        patch.description = upperDesc;
      }
    }

    if (Object.keys(patch).length === 0) return;

    await ctx.db.patch(args.id, { ...patch, updatedAt: Date.now() });

    await _logAuditEntry(ctx, {
      action: "productCode.update",
      userId: user._id,
      entityType: "productCodes",
      entityId: args.id,
      before,
      after,
    });
  },
});

export const deactivate = mutation({
  args: { id: v.id("productCodes") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);
    const pc = await ctx.db.get(args.id);
    if (!pc) throw new ConvexError({ code: "NOT_FOUND", message: "Product code not found" });

    await ctx.db.patch(args.id, { isActive: false, updatedAt: Date.now() });

    await _logAuditEntry(ctx, {
      action: "productCode.deactivate",
      userId: user._id,
      entityType: "productCodes",
      entityId: args.id,
      before: { isActive: true },
      after: { isActive: false },
    });
  },
});

export const bulkCreate = mutation({
  args: {
    items: v.array(v.object({
      type: productCodeType,
      description: v.string(),
      code: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    let created = 0;
    let skipped = 0;

    for (const item of args.items) {
      const upperCode = item.code?.toUpperCase();
      const existing = await ctx.db
        .query("productCodes")
        .withIndex("by_type", (q) => q.eq("type", item.type))
        .collect();

      // Skip if exact same description+code already exists
      const dup = existing.find(
        (pc) =>
          pc.description.toLowerCase() === item.description.toLowerCase() &&
          (pc.code ?? "") === (upperCode ?? "")
      );
      if (dup) { skipped++; continue; }

      await ctx.db.insert("productCodes", {
        type: item.type,
        description: item.description,
        code: upperCode,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      created++;
    }

    return { created, skipped };
  },
});

// Internal query for CLI inspection
export const _listAll = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("productCodes").collect();
  },
});

// Internal mutation to wipe all product codes (for re-seeding)
export const _deleteAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("productCodes").collect();
    for (const pc of all) {
      await ctx.db.delete(pc._id);
    }
    return { deleted: all.length };
  },
});

// Internal seed mutation (no auth required — for CLI seeding)
export const _seedBulkCreate = internalMutation({
  args: {
    items: v.array(v.object({
      type: productCodeType,
      description: v.string(),
      code: v.optional(v.string()),
      parentDescription: v.optional(v.string()),
      parentType: v.optional(productCodeType),
    })),
  },
  handler: async (ctx, args) => {
    let created = 0;
    let skipped = 0;
    for (const item of args.items) {
      const upperCode = item.code?.toUpperCase();

      // Resolve parent if specified
      let parentId: any = undefined;
      if (item.parentDescription && item.parentType) {
        const parents = await ctx.db
          .query("productCodes")
          .withIndex("by_type", (q) => q.eq("type", item.parentType!))
          .collect();
        const parent = parents.find(
          (p) => p.description.toLowerCase() === item.parentDescription!.toLowerCase()
        );
        if (parent) parentId = parent._id;
      }

      const existing = await ctx.db
        .query("productCodes")
        .withIndex("by_type", (q) => q.eq("type", item.type))
        .collect();
      const dup = existing.find(
        (pc) => pc.description.toLowerCase() === item.description.toLowerCase() && (pc.code ?? "") === (upperCode ?? "")
      );
      if (dup) {
        // Update parentId if not set yet
        if (parentId && !dup.parentId) {
          await ctx.db.patch(dup._id, { parentId });
        }
        skipped++;
        continue;
      }
      await ctx.db.insert("productCodes", {
        type: item.type,
        description: item.description,
        code: upperCode,
        parentId,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      created++;
    }
    return { created, skipped };
  },
});

export const reactivate = mutation({
  args: { id: v.id("productCodes") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);
    const pc = await ctx.db.get(args.id);
    if (!pc) throw new ConvexError({ code: "NOT_FOUND", message: "Product code not found" });

    await ctx.db.patch(args.id, { isActive: true, updatedAt: Date.now() });

    await _logAuditEntry(ctx, {
      action: "productCode.reactivate",
      userId: user._id,
      entityType: "productCodes",
      entityId: args.id,
      before: { isActive: false },
      after: { isActive: true },
    });
  },
});

import { v, ConvexError } from "convex/values";
import { query, mutation } from "../_generated/server";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

// ─── Queries ────────────────────────────────────────────────────────────────

export const listBrands = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);
    const brands = await ctx.db.query("brands").collect();

    return await Promise.all(
      brands.map(async (brand) => ({
        ...brand,
        imageUrl: brand.storageId
          ? await ctx.storage.getUrl(brand.storageId)
          : null,
        bannerUrl: brand.bannerStorageId
          ? await ctx.storage.getUrl(brand.bannerStorageId)
          : null,
      }))
    );
  },
});

export const getBrandById = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    return await ctx.db.get(args.brandId);
  },
});

// ─── Mutations ──────────────────────────────────────────────────────────────

export const createBrand = mutation({
  args: {
    name: v.string(),
    code: v.optional(v.string()),
    logo: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    parLevel: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    // Check for duplicate name (case-insensitive)
    const allBrands = await ctx.db.query("brands").collect();
    const duplicate = allBrands.find(
      (b) => b.name.toLowerCase() === args.name.toLowerCase()
    );
    if (duplicate) {
      throw new ConvexError({
        code: "DUPLICATE_NAME",
        message: `A brand named "${duplicate.name}" already exists`,
      });
    }

    // Check for duplicate code if provided
    if (args.code) {
      const codeConflict = allBrands.find(
        (b) => b.code?.toUpperCase() === args.code!.toUpperCase()
      );
      if (codeConflict) {
        throw new ConvexError({
          code: "DUPLICATE_CODE",
          message: `Brand code "${args.code}" is already used by "${codeConflict.name}"`,
        });
      }
    }

    const brandId = await ctx.db.insert("brands", {
      name: args.name,
      code: args.code?.toUpperCase(),
      logo: args.logo,
      tags: args.tags,
      parLevel: args.parLevel,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "brand.create",
      userId: user._id,
      entityType: "brands",
      entityId: brandId,
      after: { name: args.name, isActive: true },
    });

    return brandId;
  },
});

export const updateBrand = mutation({
  args: {
    brandId: v.id("brands"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    logo: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    parLevel: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const existing = await ctx.db.get(args.brandId);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Brand not found" });
    }

    // Check for duplicate name if renaming (case-insensitive)
    if (args.name !== undefined && args.name.toLowerCase() !== existing.name.toLowerCase()) {
      const allBrands = await ctx.db.query("brands").collect();
      const duplicate = allBrands.find(
        (b) => b._id !== args.brandId && b.name.toLowerCase() === args.name!.toLowerCase()
      );
      if (duplicate) {
        throw new ConvexError({
          code: "DUPLICATE_NAME",
          message: `A brand named "${duplicate.name}" already exists`,
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

    if (args.code !== undefined) {
      const newCode = args.code ? args.code.toUpperCase() : undefined;
      if (newCode !== existing.code) {
        // Check for duplicate code
        if (newCode) {
          const allBrands = await ctx.db.query("brands").collect();
          const codeConflict = allBrands.find(
            (b) => b._id !== args.brandId && b.code?.toUpperCase() === newCode
          );
          if (codeConflict) {
            throw new ConvexError({
              code: "DUPLICATE_CODE",
              message: `Brand code "${newCode}" is already used by "${codeConflict.name}"`,
            });
          }
        }
        before.code = existing.code;
        after.code = newCode;
        patch.code = newCode;
      }
    }

    if (args.tags !== undefined) {
      before.tags = existing.tags;
      after.tags = args.tags;
      patch.tags = args.tags;
    }

    if (args.parLevel !== undefined && args.parLevel !== existing.parLevel) {
      before.parLevel = existing.parLevel;
      after.parLevel = args.parLevel;
      patch.parLevel = args.parLevel;
    }

    // Empty string means "clear logo", undefined means "no change"
    if (args.logo !== undefined) {
      const newLogo = args.logo === "" ? undefined : args.logo;
      if (newLogo !== existing.logo) {
        before.logo = existing.logo;
        after.logo = newLogo;
        patch.logo = newLogo;
      }
    }

    if (Object.keys(patch).length === 0) {
      return; // Nothing changed
    }

    await ctx.db.patch(args.brandId, {
      ...patch,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "brand.update",
      userId: user._id,
      entityType: "brands",
      entityId: args.brandId,
      before,
      after,
    });
  },
});

export const deactivateBrand = mutation({
  args: { brandId: v.id("brands") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const brand = await ctx.db.get(args.brandId);
    if (!brand) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Brand not found" });
    }
    if (!brand.isActive) {
      throw new ConvexError({
        code: "ALREADY_INACTIVE",
        message: "Brand is already inactive",
      });
    }

    await ctx.db.patch(args.brandId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "brand.deactivate",
      userId: user._id,
      entityType: "brands",
      entityId: args.brandId,
      before: { isActive: true },
      after: { isActive: false },
    });
  },
});

export const reactivateBrand = mutation({
  args: { brandId: v.id("brands") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const brand = await ctx.db.get(args.brandId);
    if (!brand) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Brand not found" });
    }

    await ctx.db.patch(args.brandId, {
      isActive: true,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "brand.reactivate",
      userId: user._id,
      entityType: "brands",
      entityId: args.brandId,
      before: { isActive: false },
      after: { isActive: true },
    });
  },
});

// ─── Brand Image ─────────────────────────────────────────────────────────────

export const saveBrandImage = mutation({
  args: {
    brandId: v.id("brands"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const brand = await ctx.db.get(args.brandId);
    if (!brand) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Brand not found" });
    }

    // Delete old image from storage if replacing
    if (brand.storageId) {
      await ctx.storage.delete(brand.storageId);
    }

    await ctx.db.patch(args.brandId, {
      storageId: args.storageId,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "brand.imageUpdate",
      userId: user._id,
      entityType: "brands",
      entityId: args.brandId,
      before: { storageId: brand.storageId },
      after: { storageId: args.storageId },
    });
  },
});

export const deleteBrandImage = mutation({
  args: {
    brandId: v.id("brands"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const brand = await ctx.db.get(args.brandId);
    if (!brand) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Brand not found" });
    }

    if (!brand.storageId) {
      throw new ConvexError({
        code: "NO_IMAGE",
        message: "Brand has no image to delete",
      });
    }

    await ctx.storage.delete(brand.storageId);

    await ctx.db.patch(args.brandId, {
      storageId: undefined,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "brand.imageDelete",
      userId: user._id,
      entityType: "brands",
      entityId: args.brandId,
      before: { storageId: brand.storageId },
      after: { storageId: undefined },
    });
  },
});

// ─── Brand Banner ───────────────────────────────────────────────────────────

export const saveBrandBanner = mutation({
  args: {
    brandId: v.id("brands"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const brand = await ctx.db.get(args.brandId);
    if (!brand) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Brand not found" });
    }

    if (brand.bannerStorageId) {
      await ctx.storage.delete(brand.bannerStorageId);
    }

    await ctx.db.patch(args.brandId, {
      bannerStorageId: args.storageId,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "brand.bannerUpdate",
      userId: user._id,
      entityType: "brands",
      entityId: args.brandId,
      before: { bannerStorageId: brand.bannerStorageId },
      after: { bannerStorageId: args.storageId },
    });
  },
});

export const deleteBrandBanner = mutation({
  args: {
    brandId: v.id("brands"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const brand = await ctx.db.get(args.brandId);
    if (!brand) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Brand not found" });
    }

    if (!brand.bannerStorageId) {
      throw new ConvexError({
        code: "NO_BANNER",
        message: "Brand has no banner to delete",
      });
    }

    await ctx.storage.delete(brand.bannerStorageId);

    await ctx.db.patch(args.brandId, {
      bannerStorageId: undefined,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "brand.bannerDelete",
      userId: user._id,
      entityType: "brands",
      entityId: args.brandId,
      before: { bannerStorageId: brand.bannerStorageId },
      after: { bannerStorageId: undefined },
    });
  },
});

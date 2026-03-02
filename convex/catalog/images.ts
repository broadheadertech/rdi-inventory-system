import { v, ConvexError } from "convex/values";
import { query, mutation } from "../_generated/server";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

const MAX_IMAGES_PER_STYLE = 5;

// ─── Queries ────────────────────────────────────────────────────────────────

export const listStyleImages = query({
  args: {
    styleId: v.id("styles"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    const images = await ctx.db
      .query("productImages")
      .withIndex("by_style", (q) => q.eq("styleId", args.styleId))
      .collect();
    // Sort by sortOrder ascending
    images.sort((a, b) => a.sortOrder - b.sortOrder);
    return images;
  },
});

export const getImageUrl = query({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const getStylePrimaryImageUrl = query({
  args: {
    styleId: v.id("styles"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    const images = await ctx.db
      .query("productImages")
      .withIndex("by_style", (q) => q.eq("styleId", args.styleId))
      .collect();
    const primary = images.find((img) => img.isPrimary);
    if (!primary) return null;
    return await ctx.storage.getUrl(primary.storageId);
  },
});

// ─── Mutations ──────────────────────────────────────────────────────────────

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);
    return await ctx.storage.generateUploadUrl();
  },
});

export const deleteStorageFile = mutation({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    await ctx.storage.delete(args.storageId);
  },
});

export const saveStyleImage = mutation({
  args: {
    styleId: v.id("styles"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    // Validate style exists
    const style = await ctx.db.get(args.styleId);
    if (!style) {
      throw new ConvexError({
        code: "STYLE_NOT_FOUND",
        message: "Style not found",
      });
    }

    // Check max images per style
    const existing = await ctx.db
      .query("productImages")
      .withIndex("by_style", (q) => q.eq("styleId", args.styleId))
      .collect();

    if (existing.length >= MAX_IMAGES_PER_STYLE) {
      throw new ConvexError({
        code: "MAX_IMAGES_REACHED",
        message: `Maximum of ${MAX_IMAGES_PER_STYLE} images per style`,
      });
    }

    // Auto-set primary if first image, determine sortOrder
    const isPrimary = existing.length === 0;
    const sortOrder =
      existing.length === 0
        ? 0
        : Math.max(...existing.map((img) => img.sortOrder)) + 1;

    const imageId = await ctx.db.insert("productImages", {
      styleId: args.styleId,
      storageId: args.storageId,
      isPrimary,
      sortOrder,
      createdAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "image.create",
      userId: user._id,
      entityType: "productImages",
      entityId: imageId,
      after: {
        styleId: args.styleId,
        storageId: args.storageId,
        isPrimary,
        sortOrder,
      },
    });

    return imageId;
  },
});

export const deleteStyleImage = mutation({
  args: {
    imageId: v.id("productImages"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const image = await ctx.db.get(args.imageId);
    if (!image) {
      throw new ConvexError({
        code: "IMAGE_NOT_FOUND",
        message: "Image not found",
      });
    }

    // Delete from storage
    await ctx.storage.delete(image.storageId);

    // Delete the record
    await ctx.db.delete(args.imageId);

    // If deleted image was primary, auto-promote next image
    if (image.isPrimary) {
      const remaining = await ctx.db
        .query("productImages")
        .withIndex("by_style", (q) => q.eq("styleId", image.styleId))
        .collect();
      remaining.sort((a, b) => a.sortOrder - b.sortOrder);
      if (remaining.length > 0) {
        await ctx.db.patch(remaining[0]._id, { isPrimary: true });
      }
    }

    await _logAuditEntry(ctx, {
      action: "image.delete",
      userId: user._id,
      entityType: "productImages",
      entityId: args.imageId,
      before: {
        styleId: image.styleId,
        storageId: image.storageId,
        isPrimary: image.isPrimary,
        sortOrder: image.sortOrder,
      },
    });
  },
});

export const setPrimaryImage = mutation({
  args: {
    imageId: v.id("productImages"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const image = await ctx.db.get(args.imageId);
    if (!image) {
      throw new ConvexError({
        code: "IMAGE_NOT_FOUND",
        message: "Image not found",
      });
    }

    if (image.isPrimary) {
      return; // Already primary, no-op
    }

    // Unset primary on all other images for this style
    const siblings = await ctx.db
      .query("productImages")
      .withIndex("by_style", (q) => q.eq("styleId", image.styleId))
      .collect();

    for (const sibling of siblings) {
      if (sibling.isPrimary) {
        await ctx.db.patch(sibling._id, { isPrimary: false });
      }
    }

    // Set this image as primary
    await ctx.db.patch(args.imageId, { isPrimary: true });

    await _logAuditEntry(ctx, {
      action: "image.setPrimary",
      userId: user._id,
      entityType: "productImages",
      entityId: args.imageId,
      after: {
        styleId: image.styleId,
        isPrimary: true,
      },
    });
  },
});

export const saveVariantImage = mutation({
  args: {
    variantId: v.id("variants"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const variant = await ctx.db.get(args.variantId);
    if (!variant) {
      throw new ConvexError({
        code: "VARIANT_NOT_FOUND",
        message: "Variant not found",
      });
    }

    // If variant already has an image, delete the old one from storage
    if (variant.storageId) {
      await ctx.storage.delete(variant.storageId);
    }

    await ctx.db.patch(args.variantId, {
      storageId: args.storageId,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "image.variantUpdate",
      userId: user._id,
      entityType: "variants",
      entityId: args.variantId,
      before: { storageId: variant.storageId },
      after: { storageId: args.storageId },
    });
  },
});

export const deleteVariantImage = mutation({
  args: {
    variantId: v.id("variants"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const variant = await ctx.db.get(args.variantId);
    if (!variant) {
      throw new ConvexError({
        code: "VARIANT_NOT_FOUND",
        message: "Variant not found",
      });
    }

    if (!variant.storageId) {
      throw new ConvexError({
        code: "IMAGE_NOT_FOUND",
        message: "Variant has no image to delete",
      });
    }

    // Delete from storage
    await ctx.storage.delete(variant.storageId);

    // Clear the storageId field
    await ctx.db.patch(args.variantId, {
      storageId: undefined,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "image.variantDelete",
      userId: user._id,
      entityType: "variants",
      entityId: args.variantId,
      before: { storageId: variant.storageId },
      after: { storageId: undefined },
    });
  },
});

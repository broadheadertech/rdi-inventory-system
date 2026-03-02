import { v, ConvexError } from "convex/values";
import { action, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { _logAuditEntry } from "../_helpers/auditLog";
import type { Id } from "../_generated/dataModel";

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_BATCH_SIZE = 500;
const VALID_GENDERS = ["mens", "womens", "unisex", "kids"];

// ─── Internal Query: Admin Role Verification ────────────────────────────────

export const _verifyAdminRole = internalQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Not authenticated" });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "User record not found",
      });
    }

    if (!user.isActive) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Account has been deactivated",
      });
    }

    if (user.role !== "admin") {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Only admins can perform bulk imports",
      });
    }

    return user;
  },
});

// ─── Internal Mutations: Find-or-Create Helpers ─────────────────────────────

export const _findOrCreateBrand = internalMutation({
  args: {
    name: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const allBrands = await ctx.db.query("brands").collect();
    const existing = allBrands.find(
      (b) => b.name.toLowerCase() === args.name.toLowerCase()
    );

    if (existing) {
      return { id: existing._id, created: false };
    }

    const brandId = await ctx.db.insert("brands", {
      name: args.name,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "brand.bulkCreate",
      userId: args.userId,
      entityType: "brands",
      entityId: brandId,
      after: { name: args.name, isActive: true },
    });

    return { id: brandId, created: true };
  },
});

export const _findOrCreateCategory = internalMutation({
  args: {
    brandId: v.id("brands"),
    name: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const brandCategories = await ctx.db
      .query("categories")
      .withIndex("by_brand", (q) => q.eq("brandId", args.brandId))
      .collect();
    const existing = brandCategories.find(
      (c) => c.name.toLowerCase() === args.name.toLowerCase()
    );

    if (existing) {
      return { id: existing._id, created: false };
    }

    const categoryId = await ctx.db.insert("categories", {
      brandId: args.brandId,
      name: args.name,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "category.bulkCreate",
      userId: args.userId,
      entityType: "categories",
      entityId: categoryId,
      after: { brandId: args.brandId, name: args.name, isActive: true },
    });

    return { id: categoryId, created: true };
  },
});

export const _findOrCreateStyle = internalMutation({
  args: {
    categoryId: v.id("categories"),
    name: v.string(),
    description: v.optional(v.string()),
    basePriceCentavos: v.number(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const siblings = await ctx.db
      .query("styles")
      .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId))
      .collect();
    const existing = siblings.find(
      (s) => s.name.toLowerCase() === args.name.toLowerCase()
    );

    if (existing) {
      return { id: existing._id, created: false };
    }

    // Validate price for new style
    if (!Number.isInteger(args.basePriceCentavos) || args.basePriceCentavos <= 0) {
      throw new ConvexError({
        code: "INVALID_PRICE",
        message: "Base price must be a positive integer in centavos",
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
      action: "style.bulkCreate",
      userId: args.userId,
      entityType: "styles",
      entityId: styleId,
      after: {
        categoryId: args.categoryId,
        name: args.name,
        basePriceCentavos: args.basePriceCentavos,
        isActive: true,
      },
    });

    return { id: styleId, created: true };
  },
});

export const _createImportedVariant = internalMutation({
  args: {
    styleId: v.id("styles"),
    sku: v.string(),
    barcode: v.optional(v.string()),
    size: v.string(),
    color: v.string(),
    gender: v.optional(v.string()),
    priceCentavos: v.number(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Validate required fields
    if (args.sku.trim() === "") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "SKU cannot be empty" });
    }
    if (args.size.trim() === "") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Size cannot be empty" });
    }
    if (args.color.trim() === "") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Color cannot be empty" });
    }
    if (!Number.isInteger(args.priceCentavos) || args.priceCentavos <= 0) {
      throw new ConvexError({
        code: "INVALID_PRICE",
        message: "Price must be a positive integer in centavos",
      });
    }

    // Validate gender if provided
    if (args.gender && !VALID_GENDERS.includes(args.gender)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Invalid gender: "${args.gender}". Must be one of: ${VALID_GENDERS.join(", ")}`,
      });
    }

    // Check SKU uniqueness
    const existingSku = await ctx.db
      .query("variants")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .first();
    if (existingSku) {
      throw new ConvexError({
        code: "DUPLICATE_SKU",
        message: `SKU "${args.sku}" is already in use`,
      });
    }

    // Check barcode uniqueness if provided
    if (args.barcode && args.barcode.trim() !== "") {
      const existingBarcode = await ctx.db
        .query("variants")
        .withIndex("by_barcode", (q) => q.eq("barcode", args.barcode!))
        .first();
      if (existingBarcode) {
        throw new ConvexError({
          code: "DUPLICATE_BARCODE",
          message: `Barcode "${args.barcode}" is already in use`,
        });
      }
    }

    const variantId = await ctx.db.insert("variants", {
      styleId: args.styleId,
      sku: args.sku,
      barcode: args.barcode && args.barcode.trim() !== "" ? args.barcode : undefined,
      size: args.size,
      color: args.color,
      gender: args.gender as "mens" | "womens" | "unisex" | "kids" | undefined,
      priceCentavos: args.priceCentavos,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "variant.bulkCreate",
      userId: args.userId,
      entityType: "variants",
      entityId: variantId,
      after: {
        styleId: args.styleId,
        sku: args.sku,
        size: args.size,
        color: args.color,
        priceCentavos: args.priceCentavos,
        isActive: true,
      },
    });

    return variantId;
  },
});

// ─── Action: Bulk Import Products ───────────────────────────────────────────

export const bulkImportProducts = action({
  args: {
    items: v.array(
      v.object({
        brand: v.string(),
        category: v.string(),
        styleName: v.string(),
        styleDescription: v.optional(v.string()),
        basePriceCentavos: v.number(),
        sku: v.string(),
        barcode: v.optional(v.string()),
        size: v.string(),
        color: v.string(),
        gender: v.optional(v.string()),
        priceCentavos: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Enforce batch limit
    if (args.items.length > MAX_BATCH_SIZE) {
      throw new ConvexError({
        code: "BATCH_TOO_LARGE",
        message: `Batch size ${args.items.length} exceeds maximum of ${MAX_BATCH_SIZE}`,
      });
    }

    // Verify admin role
    const user = await ctx.runQuery(internal.catalog.bulkImport._verifyAdminRole);

    // Caches to avoid redundant find-or-create calls
    const brandCache = new Map<string, Id<"brands">>();
    const categoryCache = new Map<string, Id<"categories">>();
    const styleCache = new Map<string, Id<"styles">>();

    let successCount = 0;
    let failureCount = 0;
    let brandsCreated = 0;
    let categoriesCreated = 0;
    let stylesCreated = 0;
    const errors: Array<{ rowIndex: number; sku: string; error: string }> = [];

    for (let i = 0; i < args.items.length; i++) {
      const row = args.items[i];
      try {
        // 1. Find or create brand
        const brandKey = row.brand.toLowerCase();
        let brandId = brandCache.get(brandKey);
        if (!brandId) {
          const brandResult = await ctx.runMutation(
            internal.catalog.bulkImport._findOrCreateBrand,
            { name: row.brand, userId: user._id }
          );
          brandId = brandResult.id;
          brandCache.set(brandKey, brandId!);
          if (brandResult.created) brandsCreated++;
        }

        // 2. Find or create category
        const categoryKey = `${brandKey}::${row.category.toLowerCase()}`;
        let categoryId = categoryCache.get(categoryKey);
        if (!categoryId) {
          const categoryResult = await ctx.runMutation(
            internal.catalog.bulkImport._findOrCreateCategory,
            { brandId, name: row.category, userId: user._id }
          );
          categoryId = categoryResult.id;
          categoryCache.set(categoryKey, categoryId!);
          if (categoryResult.created) categoriesCreated++;
        }

        // 3. Find or create style
        const styleKey = `${categoryKey}::${row.styleName.toLowerCase()}`;
        let styleId = styleCache.get(styleKey);
        if (!styleId) {
          const styleResult = await ctx.runMutation(
            internal.catalog.bulkImport._findOrCreateStyle,
            {
              categoryId,
              name: row.styleName,
              description: row.styleDescription,
              basePriceCentavos: row.basePriceCentavos,
              userId: user._id,
            }
          );
          styleId = styleResult.id;
          styleCache.set(styleKey, styleId!);
          if (styleResult.created) stylesCreated++;
        }

        // 4. Create variant (always new)
        await ctx.runMutation(
          internal.catalog.bulkImport._createImportedVariant,
          {
            styleId,
            sku: row.sku,
            barcode: row.barcode,
            size: row.size,
            color: row.color,
            gender: row.gender,
            priceCentavos: row.priceCentavos,
            userId: user._id,
          }
        );

        successCount++;
      } catch (error: unknown) {
        failureCount++;
        const message =
          error instanceof ConvexError
            ? (error.data as { message?: string })?.message ?? String(error.data)
            : error instanceof Error
              ? error.message
              : "Unknown error";
        errors.push({ rowIndex: i, sku: row.sku, error: message });
      }
    }

    return {
      successCount,
      failureCount,
      errors,
      brandsCreated,
      categoriesCreated,
      stylesCreated,
    };
  },
});

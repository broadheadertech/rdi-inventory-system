import { v, ConvexError } from "convex/values";
import { action, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { _logAuditEntry } from "../_helpers/auditLog";
import type { Id } from "../_generated/dataModel";

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_BATCH_SIZE = 500;
const VALID_GENDERS = ["mens", "womens", "unisex", "kids", "boys", "girls"];

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
    tags: v.optional(v.array(v.string())),
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
      tags: args.tags,
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
    tag: v.optional(v.string()),
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
      tag: args.tag,
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
    // Optional Product Code Configuration links — used by the seeder + POS-format
    // import to attach the configured productCodes alongside the legacy categoryId.
    brandId: v.optional(v.id("brands")),
    departmentId: v.optional(v.id("productCodes")),
    divisionId: v.optional(v.id("productCodes")),
    productCategoryId: v.optional(v.id("productCodes")),
    subCategoryId: v.optional(v.id("productCodes")),
    styleCode: v.optional(v.string()),
    srp: v.optional(v.number()),
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
      // Backfill missing productCode links + brand/styleCode/srp on existing rows.
      const patch: Record<string, unknown> = {};
      if (args.brandId && !existing.brandId) patch.brandId = args.brandId;
      if (args.departmentId && !existing.departmentId) patch.departmentId = args.departmentId;
      if (args.divisionId && !existing.divisionId) patch.divisionId = args.divisionId;
      if (args.productCategoryId && !existing.productCategoryId) {
        patch.productCategoryId = args.productCategoryId;
      }
      if (args.subCategoryId && !existing.subCategoryId) patch.subCategoryId = args.subCategoryId;
      if (args.styleCode && !existing.styleCode) patch.styleCode = args.styleCode;
      if (args.srp !== undefined && existing.srp === undefined) patch.srp = args.srp;
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = Date.now();
        await ctx.db.patch(existing._id, patch);
      }
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
      brandId: args.brandId,
      departmentId: args.departmentId,
      divisionId: args.divisionId,
      productCategoryId: args.productCategoryId,
      subCategoryId: args.subCategoryId,
      styleCode: args.styleCode,
      srp: args.srp,
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
        productCategoryId: args.productCategoryId,
        divisionId: args.divisionId,
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
    sizeGroup: v.optional(v.string()),
    size: v.string(),
    color: v.string(),
    gender: v.optional(v.string()),
    priceCentavos: v.number(),
    costPriceCentavos: v.optional(v.number()),
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

    // SKU lookup — if it already exists, decide between price-update vs skip.
    const existingSku = await ctx.db
      .query("variants")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .first();
    if (existingSku) {
      const oldPrice = existingSku.priceCentavos;
      const oldCost = existingSku.costPriceCentavos;
      const priceChanged = args.priceCentavos !== oldPrice;
      const costChanged =
        args.costPriceCentavos !== undefined && args.costPriceCentavos !== oldCost;
      if (priceChanged || costChanged) {
        const patch: Record<string, unknown> = { updatedAt: Date.now() };
        if (priceChanged) patch.priceCentavos = args.priceCentavos;
        if (costChanged) patch.costPriceCentavos = args.costPriceCentavos;
        await ctx.db.patch(existingSku._id, patch);
        await _logAuditEntry(ctx, {
          action: "variant.priceUpdate",
          userId: args.userId,
          entityType: "variants",
          entityId: existingSku._id,
          before: { priceCentavos: oldPrice, costPriceCentavos: oldCost },
          after: {
            priceCentavos: priceChanged ? args.priceCentavos : oldPrice,
            costPriceCentavos: costChanged ? args.costPriceCentavos : oldCost,
          },
        });
        return {
          status: "priceUpdated" as const,
          variantId: existingSku._id,
          oldPriceCentavos: oldPrice,
          newPriceCentavos: args.priceCentavos,
        };
      }
      return { status: "skipped" as const, reason: `SKU "${args.sku}" already exists` };
    }

    // Barcode lookup — same logic when SKU was new but barcode collides
    if (args.barcode && args.barcode.trim() !== "") {
      const existingBarcode = await ctx.db
        .query("variants")
        .withIndex("by_barcode", (q) => q.eq("barcode", args.barcode!))
        .first();
      if (existingBarcode) {
        const oldPrice = existingBarcode.priceCentavos;
        const oldCost = existingBarcode.costPriceCentavos;
        const priceChanged = args.priceCentavos !== oldPrice;
        const costChanged =
          args.costPriceCentavos !== undefined && args.costPriceCentavos !== oldCost;
        if (priceChanged || costChanged) {
          const patch: Record<string, unknown> = { updatedAt: Date.now() };
          if (priceChanged) patch.priceCentavos = args.priceCentavos;
          if (costChanged) patch.costPriceCentavos = args.costPriceCentavos;
          await ctx.db.patch(existingBarcode._id, patch);
          await _logAuditEntry(ctx, {
            action: "variant.priceUpdate",
            userId: args.userId,
            entityType: "variants",
            entityId: existingBarcode._id,
            before: { priceCentavos: oldPrice, costPriceCentavos: oldCost },
            after: {
              priceCentavos: priceChanged ? args.priceCentavos : oldPrice,
              costPriceCentavos: costChanged ? args.costPriceCentavos : oldCost,
            },
          });
          return {
            status: "priceUpdated" as const,
            variantId: existingBarcode._id,
            oldPriceCentavos: oldPrice,
            newPriceCentavos: args.priceCentavos,
          };
        }
        return { status: "skipped" as const, reason: `Barcode "${args.barcode}" already exists` };
      }
    }

    // Auto-assign color code letter per unique color within this style
    const siblings = await ctx.db
      .query("variants")
      .withIndex("by_style", (q) => q.eq("styleId", args.styleId))
      .collect();
    const colorNorm = args.color.trim().toLowerCase();
    const colorMap = new Map<string, string>();
    for (const v of siblings) {
      const cn = v.color.trim().toLowerCase();
      if (!colorMap.has(cn) && v.colorCode) colorMap.set(cn, v.colorCode);
    }
    let colorCode = colorMap.get(colorNorm);
    if (!colorCode) {
      const usedLetters = new Set(colorMap.values());
      for (let i = 0; i < 26; i++) {
        const letter = String.fromCharCode(65 + i);
        if (!usedLetters.has(letter)) { colorCode = letter; break; }
      }
    }

    const variantId = await ctx.db.insert("variants", {
      styleId: args.styleId,
      sku: args.sku,
      barcode: args.barcode && args.barcode.trim() !== "" ? args.barcode : undefined,
      sizeGroup: args.sizeGroup,
      size: args.size,
      color: args.color,
      gender: args.gender as "mens" | "womens" | "unisex" | "kids" | undefined,
      priceCentavos: args.priceCentavos,
      costPriceCentavos: args.costPriceCentavos,
      colorCode,
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

    return { status: "created" as const, variantId };
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
    let skippedCount = 0;
    let priceUpdatedCount = 0;
    let failureCount = 0;
    let brandsCreated = 0;
    let categoriesCreated = 0;
    let stylesCreated = 0;
    const priceUpdates: Array<{
      rowIndex: number;
      sku: string;
      barcode: string;
      oldPriceCentavos: number;
      newPriceCentavos: number;
    }> = [];
    const errors: Array<{ rowIndex: number; sku: string; error: string }> = [];
    const skipped: Array<{ rowIndex: number; sku: string; reason: string }> = [];

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

        // 4. Create variant (skip if duplicate)
        const variantResult = await ctx.runMutation(
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

        if (variantResult.status === "skipped") {
          skippedCount++;
          skipped.push({ rowIndex: i, sku: row.sku, reason: variantResult.reason });
        } else if (variantResult.status === "priceUpdated") {
          priceUpdatedCount++;
          priceUpdates.push({
            rowIndex: i,
            sku: row.sku,
            barcode: row.barcode ?? "",
            oldPriceCentavos: variantResult.oldPriceCentavos,
            newPriceCentavos: variantResult.newPriceCentavos,
          });
        } else {
          successCount++;
        }
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
      skippedCount,
      priceUpdatedCount,
      failureCount,
      errors,
      skipped,
      priceUpdates,
      brandsCreated,
      categoriesCreated,
      stylesCreated,
    };
  },
});

// ─── Internal Query: List ProductCodes (for POS-format import resolution) ───

export const _listProductCodes = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("productCodes").collect();
  },
});

// ─── Internal Mutation: Create initial inventoryBatch (ACTUAL COUNT) ────────

export const _seedInitialInventoryBatch = internalMutation({
  args: {
    branchId: v.id("branches"),
    variantId: v.id("variants"),
    quantity: v.number(),
    costPriceCentavos: v.number(),
    receivedAt: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.quantity <= 0) return null;
    const batchId = await ctx.db.insert("inventoryBatches", {
      branchId: args.branchId,
      variantId: args.variantId,
      quantity: args.quantity,
      costPriceCentavos: args.costPriceCentavos,
      receivedAt: args.receivedAt,
      source: "legacy",
      createdAt: Date.now(),
    });
    // Roll forward into the inventory aggregate
    const existing = await ctx.db
      .query("inventory")
      .withIndex("by_branch_variant", (q) =>
        q.eq("branchId", args.branchId).eq("variantId", args.variantId),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        quantity: existing.quantity + args.quantity,
        arrivedAt: args.receivedAt,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("inventory", {
        branchId: args.branchId,
        variantId: args.variantId,
        quantity: args.quantity,
        arrivedAt: args.receivedAt,
        updatedAt: Date.now(),
      });
    }
    return batchId;
  },
});

// ─── Action: POS-format Bulk Import ─────────────────────────────────────────
// Accepts the wide column set commonly produced by retail POS exports:
//   Barcode / Product Code, Product ID, Product No, Short PCH Description,
//   Long Description, UOM, SRP, Price Mode, Senior Item?, SCD Value, Is VAT?,
//   Markup %, Min. Level, STYLE CODE, CALENDAR CODE, PRICING, Category 4,
//   With Exp. Date?, BRAND, DEPARTMENT, DIVISION, CATEGORY, SUBCATEGORY,
//   ACTUAL COUNT, ACTIVE
//
// DEPARTMENT / DIVISION / CATEGORY / SUBCATEGORY are looked up against
// productCodes by description (case-insensitive) and linked on the style.
// ACTUAL COUNT (when > 0 and a default branch is supplied) creates an
// inventoryBatch + inventory row so the variant has on-hand stock.

export const bulkImportProductsPos = action({
  args: {
    items: v.array(
      v.object({
        barcode: v.optional(v.string()),
        productId: v.optional(v.string()),
        productNo: v.optional(v.string()),
        shortDescription: v.optional(v.string()),
        longDescription: v.optional(v.string()),
        uom: v.optional(v.string()),
        srpPesos: v.optional(v.number()),
        priceMode: v.optional(v.string()),
        seniorItem: v.optional(v.boolean()),
        scdValue: v.optional(v.number()),
        isVat: v.optional(v.boolean()),
        markupPercent: v.optional(v.number()),
        minLevel: v.optional(v.number()),
        styleCode: v.optional(v.string()),
        calendarCode: v.optional(v.string()),
        pricing: v.optional(v.string()),
        category4: v.optional(v.string()),
        withExpDate: v.optional(v.boolean()),
        brand: v.string(),
        department: v.optional(v.string()),
        division: v.optional(v.string()),
        category: v.string(),
        subCategory: v.optional(v.string()),
        actualCount: v.optional(v.number()),
        active: v.optional(v.boolean()),
        // Variant attributes — POS exports rarely include these, but allow
        // overrides; default to "OS" / "Default" so the variant is creatable.
        size: v.optional(v.string()),
        color: v.optional(v.string()),
        gender: v.optional(v.string()),
      }),
    ),
    initialStockBranchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    if (args.items.length > MAX_BATCH_SIZE) {
      throw new ConvexError({
        code: "BATCH_TOO_LARGE",
        message: `Batch size ${args.items.length} exceeds maximum of ${MAX_BATCH_SIZE}`,
      });
    }

    const user = await ctx.runQuery(internal.catalog.bulkImport._verifyAdminRole);

    // Resolve productCodes lookup once
    const allPCs: Array<{
      _id: Id<"productCodes">;
      type: string;
      description: string;
    }> = await ctx.runQuery(internal.catalog.bulkImport._listProductCodes);
    const findPC = (
      type: string,
      desc: string | undefined,
    ): Id<"productCodes"> | undefined => {
      if (!desc || !desc.trim()) return undefined;
      const target = desc.trim().toUpperCase();
      const hit = allPCs.find(
        (p) => p.type === type && p.description.toUpperCase() === target,
      );
      return hit?._id;
    };

    // Department label → variant.gender heuristic
    const genderFromDepartment = (
      dept: string | undefined,
    ): "mens" | "womens" | "unisex" | "kids" | "boys" | "girls" | undefined => {
      if (!dept) return undefined;
      const d = dept.trim().toUpperCase();
      if (d === "MENS" || d === "MEN" || d === "MALE") return "mens";
      if (d === "LADIES" || d === "WOMENS" || d === "WOMEN" || d === "FEMALE") return "womens";
      if (d === "UNISEX") return "unisex";
      if (d === "KIDS") return "kids";
      if (d === "BOYS") return "boys";
      if (d === "GIRLS") return "girls";
      return undefined;
    };

    const brandCache = new Map<string, Id<"brands">>();
    const categoryCache = new Map<string, Id<"categories">>();
    const styleCache = new Map<string, Id<"styles">>();

    let successCount = 0;
    let skippedCount = 0;
    let priceUpdatedCount = 0;
    let failureCount = 0;
    let stockSeededCount = 0;
    const errors: Array<{ rowIndex: number; barcode: string; error: string }> = [];
    const skipped: Array<{ rowIndex: number; barcode: string; reason: string }> = [];
    const priceUpdates: Array<{
      rowIndex: number;
      sku: string;
      barcode: string;
      oldPriceCentavos: number;
      newPriceCentavos: number;
    }> = [];

    for (let i = 0; i < args.items.length; i++) {
      const row = args.items[i];
      const rowKey = row.barcode ?? row.productId ?? `row-${i}`;
      try {
        // Brand
        const brandKey = row.brand.toLowerCase();
        let brandId = brandCache.get(brandKey);
        if (!brandId) {
          const r = await ctx.runMutation(
            internal.catalog.bulkImport._findOrCreateBrand,
            { name: row.brand, userId: user._id },
          );
          brandId = r.id;
          brandCache.set(brandKey, brandId!);
        }

        // Legacy category bucket (per-brand). Keeps backward-compat with the
        // existing styles index. POS rows use CATEGORY for the productCode link.
        const legacyCatKey = `${brandKey}::${row.category.toLowerCase()}`;
        let legacyCatId = categoryCache.get(legacyCatKey);
        if (!legacyCatId) {
          const r = await ctx.runMutation(
            internal.catalog.bulkImport._findOrCreateCategory,
            { brandId, name: row.category, userId: user._id },
          );
          legacyCatId = r.id;
          categoryCache.set(legacyCatKey, legacyCatId!);
        }

        // Resolve productCode IDs from POS column values
        const departmentId = findPC("department", row.department);
        const divisionId = findPC("division", row.division);
        const productCategoryId = findPC("category", row.category);
        const subCategoryId = findPC("subCategory", row.subCategory);

        // Style
        const styleName = row.shortDescription?.trim() || row.longDescription?.trim() || row.productNo || rowKey;
        const styleKey = `${legacyCatKey}::${styleName.toLowerCase()}`;
        let styleId = styleCache.get(styleKey);
        if (!styleId) {
          const basePriceCentavos = Math.round((row.srpPesos ?? 0) * 100);
          const r = await ctx.runMutation(
            internal.catalog.bulkImport._findOrCreateStyle,
            {
              categoryId: legacyCatId,
              brandId,
              departmentId,
              divisionId,
              productCategoryId,
              subCategoryId,
              styleCode: row.styleCode,
              srp: row.srpPesos,
              name: styleName,
              description: row.longDescription,
              basePriceCentavos: basePriceCentavos > 0 ? basePriceCentavos : 1,
              userId: user._id,
            },
          );
          styleId = r.id;
          styleCache.set(styleKey, styleId!);
        }

        // Variant — POS exports give one barcode per row, so each row = one variant.
        const variantBarcode =
          row.barcode && row.barcode.trim() !== "" ? row.barcode.trim() : undefined;
        const variantSku =
          row.productId && row.productId.trim() !== ""
            ? row.productId.trim()
            : variantBarcode ?? `AUTO-${i}-${Date.now()}`;
        const priceCentavos = Math.max(1, Math.round((row.srpPesos ?? 0) * 100));
        const gender = (row.gender as string | undefined) ?? genderFromDepartment(row.department);

        const variantResult = await ctx.runMutation(
          internal.catalog.bulkImport._createImportedVariant,
          {
            styleId: styleId!,
            sku: variantSku,
            barcode: variantBarcode,
            size: row.size?.trim() || "OS",
            color: row.color?.trim() || "Default",
            gender,
            priceCentavos,
            costPriceCentavos:
              row.markupPercent !== undefined && row.srpPesos !== undefined && row.markupPercent > 0
                ? Math.round((row.srpPesos * 100) / (1 + row.markupPercent / 100))
                : undefined,
            userId: user._id,
          },
        );

        if (variantResult.status === "skipped") {
          skippedCount++;
          skipped.push({
            rowIndex: i,
            barcode: rowKey,
            reason: variantResult.reason,
          });
          continue;
        }

        if (variantResult.status === "priceUpdated") {
          priceUpdatedCount++;
          priceUpdates.push({
            rowIndex: i,
            sku: variantSku,
            barcode: rowKey,
            oldPriceCentavos: variantResult.oldPriceCentavos,
            newPriceCentavos: variantResult.newPriceCentavos,
          });
          continue;
        }

        successCount++;

        // Optional: seed initial stock if ACTUAL COUNT + branch were supplied
        if (
          args.initialStockBranchId &&
          row.actualCount !== undefined &&
          row.actualCount > 0
        ) {
          await ctx.runMutation(
            internal.catalog.bulkImport._seedInitialInventoryBatch,
            {
              branchId: args.initialStockBranchId,
              variantId: variantResult.variantId,
              quantity: row.actualCount,
              costPriceCentavos:
                row.markupPercent !== undefined &&
                row.srpPesos !== undefined &&
                row.markupPercent > 0
                  ? Math.round((row.srpPesos * 100) / (1 + row.markupPercent / 100))
                  : Math.round((row.srpPesos ?? 0) * 50),
              receivedAt: Date.now(),
            },
          );
          stockSeededCount++;
        }
      } catch (error: unknown) {
        failureCount++;
        const message =
          error instanceof ConvexError
            ? (error.data as { message?: string })?.message ?? String(error.data)
            : error instanceof Error
              ? error.message
              : "Unknown error";
        errors.push({ rowIndex: i, barcode: rowKey, error: message });
      }
    }

    return {
      successCount,
      skippedCount,
      priceUpdatedCount,
      failureCount,
      stockSeededCount,
      errors,
      skipped,
      priceUpdates,
    };
  },
});

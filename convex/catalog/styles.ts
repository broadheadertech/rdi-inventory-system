import { v, ConvexError } from "convex/values";
import { query, mutation } from "../_generated/server";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

// ─── Queries ────────────────────────────────────────────────────────────────

export const listStyles = query({
  args: {
    brandId: v.optional(v.id("brands")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    if (args.brandId) {
      return await ctx.db
        .query("styles")
        .withIndex("by_brand", (q) => q.eq("brandId", args.brandId))
        .collect();
    }

    return await ctx.db.query("styles").collect();
  },
});

export const listStylesByLegacyCategory = query({
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

export const listAllStyles = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);
    return await ctx.db.query("styles").collect();
  },
});

export const getStyleById = query({
  args: { styleId: v.id("styles") },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    return await ctx.db.get(args.styleId);
  },
});

// ─── Legacy Create (backward compat for old category→style flow) ────────────

export const createStyleLegacy = mutation({
  args: {
    categoryId: v.id("categories"),
    name: v.string(),
    description: v.optional(v.string()),
    basePriceCentavos: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    if (args.name.trim() === "") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Name cannot be empty" });
    }
    if (!Number.isInteger(args.basePriceCentavos) || args.basePriceCentavos <= 0) {
      throw new ConvexError({ code: "INVALID_PRICE", message: "Base price must be a positive integer in centavos" });
    }

    const category = await ctx.db.get(args.categoryId);
    if (!category || !category.isActive) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Category not found or inactive" });
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
      after: { categoryId: args.categoryId, name: args.name, basePriceCentavos: args.basePriceCentavos },
    });

    return styleId;
  },
});

// ─── Style Code Generation ──────────────────────────────────────────────────

async function generateStyleCode(
  ctx: any,
  brandId: string,
  codeIds: {
    departmentId: string;
    productCategoryId: string;
    subCategoryId: string;
    seasonId: string;
    yearId: string;
    productionId: string;
    outlierId: string;
  },
  isExclusive: boolean = false
): Promise<{ styleCode: string; sequenceNumber: number; codePrefix: string }> {
  // Get brand code
  const brand = await ctx.db.get(brandId);
  const brandCode = brand?.code ?? "";

  // Get product codes (Division excluded — it has no code)
  const codes = await Promise.all([
    ctx.db.get(codeIds.departmentId),
    ctx.db.get(codeIds.productCategoryId),
    ctx.db.get(codeIds.subCategoryId),
    ctx.db.get(codeIds.seasonId),
    ctx.db.get(codeIds.yearId),
    ctx.db.get(codeIds.productionId),
    ctx.db.get(codeIds.outlierId),
  ]);

  const codePrefix = [
    brandCode,
    ...codes.map((c) => c?.code ?? ""),
  ].join("");

  // Find next sequence number for this prefix
  const existingStyles = await ctx.db.query("styles").collect();
  const samePrefix = existingStyles.filter(
    (s: any) => s.styleCode && s.styleCode.startsWith(codePrefix + "-")
  );
  const maxSeq = samePrefix.reduce((max: number, s: any) => {
    const seq = s.sequenceNumber ?? 0;
    return seq > max ? seq : max;
  }, 0);

  const sequenceNumber = maxSeq + 1;
  // Non-exclusive: AMTT0126-0001
  // Exclusive (has outlier): AMTT0126-0001-S
  const baseCode = `${codePrefix}-${String(sequenceNumber).padStart(4, "0")}`;
  const styleCode = isExclusive ? `${baseCode}-S` : baseCode;

  return { styleCode, sequenceNumber, codePrefix };
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export const createStyle = mutation({
  args: {
    brandId: v.id("brands"),
    departmentId: v.id("productCodes"),
    divisionId: v.id("productCodes"),
    productCategoryId: v.id("productCodes"),
    subCategoryId: v.id("productCodes"),
    seasonId: v.id("productCodes"),
    yearId: v.id("productCodes"),
    productionId: v.id("productCodes"),
    outlierId: v.optional(v.id("productCodes")),
    name: v.string(),
    description: v.optional(v.string()),
    sku: v.optional(v.string()),
    barcode: v.optional(v.string()),
    color: v.optional(v.string()),
    srp: v.number(),
    costPrice: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    if (args.name.trim() === "") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Name cannot be empty" });
    }
    if (args.srp <= 0) {
      throw new ConvexError({ code: "INVALID_PRICE", message: "SRP must be greater than 0" });
    }

    // Validate brand exists and is active
    const brand = await ctx.db.get(args.brandId);
    if (!brand || !brand.isActive) {
      throw new ConvexError({ code: "INVALID_BRAND", message: "Brand not found or inactive" });
    }
    if (!brand.code) {
      throw new ConvexError({ code: "MISSING_CODE", message: "Brand must have a code configured before creating styles" });
    }

    // Determine if exclusive (has outlier assigned)
    const isExclusive = !!args.outlierId;

    // Generate style code
    const { styleCode, sequenceNumber } = await generateStyleCode(ctx, args.brandId, {
      departmentId: args.departmentId,
      productCategoryId: args.productCategoryId,
      subCategoryId: args.subCategoryId,
      seasonId: args.seasonId,
      yearId: args.yearId,
      productionId: args.productionId,
      outlierId: args.outlierId ?? args.productionId, // fallback for prefix generation
    }, isExclusive);

    const styleId = await ctx.db.insert("styles", {
      brandId: args.brandId,
      departmentId: args.departmentId,
      divisionId: args.divisionId,
      productCategoryId: args.productCategoryId,
      subCategoryId: args.subCategoryId,
      seasonId: args.seasonId,
      yearId: args.yearId,
      productionId: args.productionId,
      outlierId: args.outlierId,
      isExclusive,
      styleCode,
      sequenceNumber,
      name: args.name.toUpperCase(),
      description: args.description,
      sku: args.sku?.toUpperCase(),
      barcode: args.barcode,
      color: args.color?.toUpperCase(),
      srp: args.srp,
      costPrice: args.costPrice,
      basePriceCentavos: Math.round(args.srp * 100),
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
        brandId: args.brandId,
        styleCode,
        name: args.name,
        srp: args.srp,
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
    sku: v.optional(v.string()),
    barcode: v.optional(v.string()),
    color: v.optional(v.string()),
    srp: v.optional(v.number()),
    costPrice: v.optional(v.number()),
    divisionId: v.optional(v.id("productCodes")),
    productCategoryId: v.optional(v.id("productCodes")),
    subCategoryId: v.optional(v.id("productCodes")),
    departmentId: v.optional(v.id("productCodes")),
    seasonId: v.optional(v.id("productCodes")),
    yearId: v.optional(v.id("productCodes")),
    productionId: v.optional(v.id("productCodes")),
    outlierId: v.optional(v.id("productCodes")),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const existing = await ctx.db.get(args.styleId);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Style not found" });
    }

    if (args.name !== undefined && args.name.trim() === "") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Name cannot be empty" });
    }

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const patch: Record<string, unknown> = {};

    // Helper to track field changes
    const track = (key: string, newVal: unknown, existingVal: unknown) => {
      if (newVal !== undefined && newVal !== existingVal) {
        before[key] = existingVal;
        after[key] = newVal;
        patch[key] = newVal;
      }
    };

    if (args.name !== undefined) {
      const upper = args.name.toUpperCase();
      track("name", upper, existing.name);
    }
    if (args.description !== undefined) {
      const val = args.description === "" ? undefined : args.description;
      track("description", val, existing.description);
    }
    if (args.sku !== undefined) track("sku", args.sku.toUpperCase() || undefined, existing.sku);
    if (args.barcode !== undefined) track("barcode", args.barcode || undefined, existing.barcode);
    if (args.color !== undefined) track("color", args.color.toUpperCase() || undefined, existing.color);
    if (args.srp !== undefined) {
      track("srp", args.srp, existing.srp);
      // Keep basePriceCentavos in sync
      patch.basePriceCentavos = Math.round(args.srp * 100);
    }
    if (args.costPrice !== undefined) track("costPrice", args.costPrice || undefined, existing.costPrice);
    if (args.divisionId !== undefined) track("divisionId", args.divisionId, existing.divisionId);
    if (args.productCategoryId !== undefined) track("productCategoryId", args.productCategoryId, existing.productCategoryId);
    if (args.subCategoryId !== undefined) track("subCategoryId", args.subCategoryId, existing.subCategoryId);
    if (args.departmentId !== undefined) track("departmentId", args.departmentId, existing.departmentId);
    if (args.seasonId !== undefined) track("seasonId", args.seasonId, existing.seasonId);
    if (args.yearId !== undefined) track("yearId", args.yearId, existing.yearId);
    if (args.productionId !== undefined) track("productionId", args.productionId, existing.productionId);
    if (args.outlierId !== undefined) track("outlierId", args.outlierId || undefined, existing.outlierId);

    if (Object.keys(patch).length === 0) return;

    await ctx.db.patch(args.styleId, { ...patch, updatedAt: Date.now() });

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
    if (!style) throw new ConvexError({ code: "NOT_FOUND", message: "Style not found" });
    if (!style.isActive) throw new ConvexError({ code: "ALREADY_INACTIVE", message: "Style is already inactive" });

    await ctx.db.patch(args.styleId, { isActive: false, updatedAt: Date.now() });

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
    if (!style) throw new ConvexError({ code: "NOT_FOUND", message: "Style not found" });
    if (style.isActive) throw new ConvexError({ code: "ALREADY_ACTIVE", message: "Style is already active" });

    await ctx.db.patch(args.styleId, { isActive: true, updatedAt: Date.now() });

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

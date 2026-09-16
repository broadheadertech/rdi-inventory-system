import { v, ConvexError } from "convex/values";
import { query, mutation } from "../_generated/server";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";
import { duplicateVariantMessage, variantWithColorSize } from "../_helpers/variantIdentity";
import { assignColorCodes, buildVariantSku, colorKey } from "../_helpers/variantSku";

/** The most variants one generate can create — a guard against a runaway grid. */
const MAX_MATRIX_VARIANTS = 200;

// ─── Queries ────────────────────────────────────────────────────────────────

export const listVariants = query({
  args: {
    styleId: v.id("styles"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    return await ctx.db
      .query("variants")
      .withIndex("by_style", (q) => q.eq("styleId", args.styleId))
      .collect();
  },
});

export const getVariantById = query({
  args: { variantId: v.id("variants") },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    return await ctx.db.get(args.variantId);
  },
});

export const getVariantBySku = query({
  args: { sku: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    return await ctx.db
      .query("variants")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .first();
  },
});

// ─── Mutations ──────────────────────────────────────────────────────────────

export const createVariant = mutation({
  args: {
    styleId: v.id("styles"),
    sku: v.string(),
    barcode: v.optional(v.string()),
    sizeGroup: v.optional(v.string()),
    size: v.string(),
    color: v.string(),
    gender: v.optional(
      v.union(
        v.literal("mens"),
        v.literal("womens"),
        v.literal("unisex"),
        v.literal("kids"),
        v.literal("boys"),
        v.literal("girls")
      )
    ),
    priceCentavos: v.number(),
    costPriceCentavos: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

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
    if (args.costPriceCentavos !== undefined) {
      if (!Number.isInteger(args.costPriceCentavos) || args.costPriceCentavos <= 0) {
        throw new ConvexError({
          code: "INVALID_PRICE",
          message: "Cost price must be a positive integer in centavos",
        });
      }
    }

    const style = await ctx.db.get(args.styleId);
    if (!style) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Style not found" });
    }
    if (!style.isActive) {
      throw new ConvexError({
        code: "STYLE_INACTIVE",
        message: "Cannot add variants to an inactive style",
      });
    }

    // One SKU per color and size within a style.
    const sameColorSize = await variantWithColorSize(ctx, args.styleId, args.color, args.size);
    if (sameColorSize) {
      throw new ConvexError({
        code: "DUPLICATE_VARIANT",
        message: duplicateVariantMessage(sameColorSize),
      });
    }

    // Validate SKU uniqueness globally
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

    // Validate barcode uniqueness if provided
    if (args.barcode) {
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

    // Auto-assign color code letter (A, B, C...) per unique color within this style
    const siblings = await ctx.db
      .query("variants")
      .withIndex("by_style", (q) => q.eq("styleId", args.styleId))
      .collect();

    const colorNorm = args.color.trim().toLowerCase();
    const colorMap = new Map<string, string>(); // normalized color → letter
    for (const v of siblings) {
      const cn = v.color.trim().toLowerCase();
      if (!colorMap.has(cn) && v.colorCode) {
        colorMap.set(cn, v.colorCode);
      }
    }

    let colorCode = colorMap.get(colorNorm);
    if (!colorCode) {
      // Assign next letter
      const usedLetters = new Set(colorMap.values());
      for (let i = 0; i < 26; i++) {
        const letter = String.fromCharCode(65 + i); // A, B, C...
        if (!usedLetters.has(letter)) {
          colorCode = letter;
          break;
        }
      }
    }

    const variantId = await ctx.db.insert("variants", {
      styleId: args.styleId,
      sku: args.sku,
      barcode: args.barcode,
      sizeGroup: args.sizeGroup,
      size: args.size,
      color: args.color,
      gender: args.gender,
      priceCentavos: args.priceCentavos,
      costPriceCentavos: args.costPriceCentavos,
      colorCode,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "variant.create",
      userId: user._id,
      entityType: "variants",
      entityId: variantId,
      after: {
        styleId: args.styleId,
        sku: args.sku,
        size: args.size,
        color: args.color,
        priceCentavos: args.priceCentavos,
        ...(args.costPriceCentavos ? { costPriceCentavos: args.costPriceCentavos } : {}),
        isActive: true,
      },
    });

    return variantId;
  },
});

export const updateVariant = mutation({
  args: {
    variantId: v.id("variants"),
    barcode: v.optional(v.string()),
    sizeGroup: v.optional(v.string()),
    size: v.optional(v.string()),
    color: v.optional(v.string()),
    gender: v.optional(
      v.union(
        v.literal("mens"),
        v.literal("womens"),
        v.literal("unisex"),
        v.literal("kids"),
        v.literal("boys"),
        v.literal("girls")
      )
    ),
    clearGender: v.optional(v.boolean()),
    priceCentavos: v.optional(v.number()),
    costPriceCentavos: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const existing = await ctx.db.get(args.variantId);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Variant not found" });
    }

    // Validate price if provided
    if (args.priceCentavos !== undefined) {
      if (!Number.isInteger(args.priceCentavos) || args.priceCentavos <= 0) {
        throw new ConvexError({
          code: "INVALID_PRICE",
          message: "Price must be a positive integer in centavos",
        });
      }
    }
    if (args.costPriceCentavos !== undefined) {
      if (!Number.isInteger(args.costPriceCentavos) || args.costPriceCentavos <= 0) {
        throw new ConvexError({
          code: "INVALID_PRICE",
          message: "Cost price must be a positive integer in centavos",
        });
      }
    }

    // Validate non-empty strings for required fields
    if (args.size !== undefined && args.size.trim() === "") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Size cannot be empty" });
    }
    if (args.color !== undefined && args.color.trim() === "") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Color cannot be empty" });
    }

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const patch: Record<string, unknown> = {};

    // Barcode: empty string means "clear", undefined means "no change"
    if (args.barcode !== undefined) {
      const newBarcode = args.barcode === "" ? undefined : args.barcode;
      if (newBarcode !== existing.barcode) {
        // Validate barcode uniqueness if setting a new one
        if (newBarcode) {
          const existingBarcode = await ctx.db
            .query("variants")
            .withIndex("by_barcode", (q) => q.eq("barcode", newBarcode))
            .first();
          if (existingBarcode && existingBarcode._id !== args.variantId) {
            throw new ConvexError({
              code: "DUPLICATE_BARCODE",
              message: `Barcode "${newBarcode}" is already in use`,
            });
          }
        }
        before.barcode = existing.barcode;
        after.barcode = newBarcode;
        patch.barcode = newBarcode;
      }
    }

    // A new color or size must not repeat another of this style's variants.
    const colorChanged = args.color !== undefined && args.color !== existing.color;
    const sizeChanged = args.size !== undefined && args.size !== existing.size;
    if (colorChanged || sizeChanged) {
      const clash = await variantWithColorSize(
        ctx,
        existing.styleId,
        args.color ?? existing.color,
        args.size ?? existing.size,
        existing._id
      );
      if (clash) {
        throw new ConvexError({
          code: "DUPLICATE_VARIANT",
          message: duplicateVariantMessage(clash),
        });
      }
    }

    if (args.sizeGroup !== undefined && args.sizeGroup !== existing.sizeGroup) {
      before.sizeGroup = existing.sizeGroup;
      after.sizeGroup = args.sizeGroup;
      patch.sizeGroup = args.sizeGroup;
    }

    if (args.size !== undefined && args.size !== existing.size) {
      before.size = existing.size;
      after.size = args.size;
      patch.size = args.size;
    }

    if (args.color !== undefined && args.color !== existing.color) {
      before.color = existing.color;
      after.color = args.color;
      patch.color = args.color;
    }

    // Gender: clearGender=true means "unset", gender arg means "set new value"
    if (args.clearGender && existing.gender !== undefined) {
      before.gender = existing.gender;
      after.gender = undefined;
      patch.gender = undefined;
    } else if (args.gender !== undefined && args.gender !== existing.gender) {
      before.gender = existing.gender;
      after.gender = args.gender;
      patch.gender = args.gender;
    }

    if (args.priceCentavos !== undefined && args.priceCentavos !== existing.priceCentavos) {
      before.priceCentavos = existing.priceCentavos;
      after.priceCentavos = args.priceCentavos;
      patch.priceCentavos = args.priceCentavos;
    }

    if (args.costPriceCentavos !== undefined && args.costPriceCentavos !== existing.costPriceCentavos) {
      before.costPriceCentavos = existing.costPriceCentavos;
      after.costPriceCentavos = args.costPriceCentavos;
      patch.costPriceCentavos = args.costPriceCentavos;
    }

    if (Object.keys(patch).length === 0) {
      return; // Nothing changed
    }

    await ctx.db.patch(args.variantId, {
      ...patch,
      updatedAt: Date.now(),
    });

    // Base price edits belong in the price history with the Prices page's.
    if (args.priceCentavos !== undefined && args.priceCentavos !== existing.priceCentavos) {
      await ctx.db.insert("priceChanges", {
        variantId: args.variantId,
        action: "set",
        oldPriceCentavos: existing.priceCentavos,
        newPriceCentavos: args.priceCentavos,
        changedById: user._id,
        changedAt: Date.now(),
      });
    }

    await _logAuditEntry(ctx, {
      action: "variant.update",
      userId: user._id,
      entityType: "variants",
      entityId: args.variantId,
      before,
      after,
    });
  },
});

export const deactivateVariant = mutation({
  args: { variantId: v.id("variants") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const variant = await ctx.db.get(args.variantId);
    if (!variant) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Variant not found" });
    }
    if (!variant.isActive) {
      throw new ConvexError({
        code: "ALREADY_INACTIVE",
        message: "Variant is already inactive",
      });
    }

    await ctx.db.patch(args.variantId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "variant.deactivate",
      userId: user._id,
      entityType: "variants",
      entityId: args.variantId,
      before: { isActive: true },
      after: { isActive: false },
    });
  },
});

export const reactivateVariant = mutation({
  args: { variantId: v.id("variants") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const variant = await ctx.db.get(args.variantId);
    if (!variant) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Variant not found" });
    }
    if (variant.isActive) {
      throw new ConvexError({
        code: "ALREADY_ACTIVE",
        message: "Variant is already active",
      });
    }

    await ctx.db.patch(args.variantId, {
      isActive: true,
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "variant.reactivate",
      userId: user._id,
      entityType: "variants",
      entityId: args.variantId,
      before: { isActive: false },
      after: { isActive: true },
    });
  },
});

// ─── Variant summaries ──────────────────────────────────────────────────────

/**
 * How many variants and colours each of a brand's styles carries.
 *
 * The catalog lists styles, one row per product, but a product's SKUs live on
 * its variants — so the list shows the count and links into them rather than
 * printing a style-level SKU that can only ever be blank.
 */
export const listStyleVariantSummary = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const styles = await ctx.db
      .query("styles")
      .withIndex("by_brand", (q) => q.eq("brandId", args.brandId))
      .collect();

    return await Promise.all(
      styles.map(async (style) => {
        const variants = await ctx.db
          .query("variants")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .collect();
        const active = variants.filter((variant) => variant.isActive);
        return {
          styleId: style._id,
          variantCount: active.length,
          inactiveCount: variants.length - active.length,
          colorCount: new Set(active.map((variant) => colorKey(variant.color))).size,
        };
      })
    );
  },
});

/**
 * The sizes already in use, grouped by size group — what the generator offers
 * as ready-made chips, so a shop's own sizes come back without being retyped.
 */
export const listSizeSuggestions = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    const variants = await ctx.db.query("variants").collect();
    const byGroup = new Map<string, Map<string, number>>();
    for (const variant of variants) {
      const group = variant.sizeGroup ?? "";
      const sizes = byGroup.get(group) ?? new Map<string, number>();
      const size = variant.size.trim();
      if (size !== "") sizes.set(size, (sizes.get(size) ?? 0) + 1);
      byGroup.set(group, sizes);
    }

    return Array.from(byGroup.entries()).map(([group, sizes]) => ({
      group,
      // Commonest first — the sizes a shop actually stocks lead.
      sizes: Array.from(sizes.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([size]) => size),
    }));
  },
});

// ─── Generate a style's variants ────────────────────────────────────────────

/**
 * Creates a style's colours × sizes in one go.
 *
 * Adding fifteen variants by hand meant fifteen dialogs and fifteen SKUs typed
 * out. This takes the colours and the sizes and mints every combination, with
 * SKUs spelled by buildVariantSku — the same function the dialog previews with.
 *
 * Combinations the style already has are skipped, not failed, so the mutation
 * can be run again after adding a colour and only the new squares are filled.
 * Anything it cannot create (a SKU already used by another style, a barcode
 * clash) is reported back rather than silently dropped.
 */
export const createVariantMatrix = mutation({
  args: {
    styleId: v.id("styles"),
    colors: v.array(v.string()),
    sizes: v.array(v.string()),
    sizeGroup: v.optional(v.string()),
    gender: v.optional(
      v.union(
        v.literal("mens"),
        v.literal("womens"),
        v.literal("unisex"),
        v.literal("kids"),
        v.literal("boys"),
        v.literal("girls")
      )
    ),
    priceCentavos: v.number(),
    costPriceCentavos: v.optional(v.number()),
    /** Give each new variant its SKU as its barcode, for shops that print their own. */
    barcodeFromSku: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const colors = args.colors.map((c) => c.trim()).filter((c) => c !== "");
    const sizes = args.sizes.map((s) => s.trim()).filter((s) => s !== "");
    if (colors.length === 0 || sizes.length === 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Pick at least one colour and one size",
      });
    }
    if (!Number.isInteger(args.priceCentavos) || args.priceCentavos <= 0) {
      throw new ConvexError({
        code: "INVALID_PRICE",
        message: "Price must be a positive integer in centavos",
      });
    }
    if (
      args.costPriceCentavos !== undefined &&
      (!Number.isInteger(args.costPriceCentavos) || args.costPriceCentavos <= 0)
    ) {
      throw new ConvexError({
        code: "INVALID_PRICE",
        message: "Cost price must be a positive integer in centavos",
      });
    }
    if (colors.length * sizes.length > MAX_MATRIX_VARIANTS) {
      throw new ConvexError({
        code: "TOO_MANY_VARIANTS",
        message: `That is ${colors.length * sizes.length} variants — ${MAX_MATRIX_VARIANTS} at a time is the most this can create`,
      });
    }

    const style = await ctx.db.get(args.styleId);
    if (!style) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Style not found" });
    }
    if (!style.isActive) {
      throw new ConvexError({
        code: "STYLE_INACTIVE",
        message: "Cannot add variants to an inactive style",
      });
    }
    const styleCode = style.styleCode?.trim();
    if (!styleCode) {
      throw new ConvexError({
        code: "NO_STYLE_CODE",
        message: "This style has no style code, so SKUs cannot be built from it",
      });
    }

    // The colours already on the style keep their letters; new ones take the
    // next free ones, exactly as createVariant assigns them one at a time.
    const siblings = await ctx.db
      .query("variants")
      .withIndex("by_style", (q) => q.eq("styleId", args.styleId))
      .collect();
    const existingCodes = new Map<string, string>();
    for (const variant of siblings) {
      const key = colorKey(variant.color);
      if (variant.colorCode && !existingCodes.has(key)) {
        existingCodes.set(key, variant.colorCode);
      }
    }
    const colorCodes = assignColorCodes(existingCodes, colors);

    const taken = new Set(
      siblings.map((variant) => `${colorKey(variant.color)}|${colorKey(variant.size)}`)
    );

    const created: string[] = [];
    const skipped: { label: string; reason: string }[] = [];

    for (const color of colors) {
      for (const size of sizes) {
        const label = `${color} / ${size}`;
        if (taken.has(`${colorKey(color)}|${colorKey(size)}`)) {
          skipped.push({ label, reason: "This style already has it" });
          continue;
        }

        const sku = buildVariantSku({
          styleCode,
          colorCode: colorCodes.get(colorKey(color)) ?? "",
          color,
          size,
        });

        const skuClash = await ctx.db
          .query("variants")
          .withIndex("by_sku", (q) => q.eq("sku", sku))
          .first();
        if (skuClash) {
          skipped.push({ label, reason: `SKU ${sku} is already in use` });
          continue;
        }

        let barcode: string | undefined;
        if (args.barcodeFromSku) {
          const barcodeClash = await ctx.db
            .query("variants")
            .withIndex("by_barcode", (q) => q.eq("barcode", sku))
            .first();
          if (barcodeClash) {
            skipped.push({ label, reason: `Barcode ${sku} is already in use` });
            continue;
          }
          barcode = sku;
        }

        const variantId = await ctx.db.insert("variants", {
          styleId: args.styleId,
          sku,
          barcode,
          sizeGroup: args.sizeGroup?.trim() || undefined,
          size,
          color,
          gender: args.gender,
          priceCentavos: args.priceCentavos,
          costPriceCentavos: args.costPriceCentavos,
          colorCode: colorCodes.get(colorKey(color)),
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        taken.add(`${colorKey(color)}|${colorKey(size)}`);
        created.push(sku);

        await _logAuditEntry(ctx, {
          action: "variant.create",
          userId: user._id,
          entityType: "variants",
          entityId: variantId,
          after: {
            styleId: args.styleId,
            sku,
            size,
            color,
            priceCentavos: args.priceCentavos,
            ...(args.costPriceCentavos ? { costPriceCentavos: args.costPriceCentavos } : {}),
            isActive: true,
            source: "matrix",
          },
        });
      }
    }

    return { created, skipped };
  },
});

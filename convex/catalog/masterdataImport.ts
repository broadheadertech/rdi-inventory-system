import { v, ConvexError } from "convex/values";
import { mutation, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireRole, ADMIN_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";
import { createImportedVariant } from "./bulkImport";
import {
  brandCodeFromStyleCode,
  brandDisplayName,
  cleanLabel,
  genderFromDepartment,
  isReservedRow,
  MASTERDATA_BATCH_SIZE,
  normalizeStyleCode,
  outlierDescription,
  parseCalendarCode,
  productCodeDescription,
  productionDescription,
  styleSequenceNumber,
  type ProductCodeType,
} from "../_helpers/masterdata";

const masterdataRow = v.object({
  brand: v.string(),
  itemCode: v.string(),
  calendarCode: v.optional(v.string()),
  department: v.optional(v.string()),
  division: v.optional(v.string()), // CLASS
  category: v.string(),
  subCategory: v.optional(v.string()),
  styleCode: v.string(),
  description: v.string(),
  color: v.string(),
  size: v.string(),
  srpPesos: v.optional(v.number()),
  currentPricePesos: v.number(),
  landedCostPesos: v.optional(v.number()),
  classification: v.optional(v.string()),
  designs: v.optional(v.string()),
  specs: v.optional(v.string()),
  trading: v.optional(v.string()),
  aging: v.optional(v.string()),
});

type MasterdataRow = typeof masterdataRow.type;

const toCentavos = (pesos: number) => Math.round(pesos * 100);

/**
 * Imports a batch of masterdata rows: brand → style (by STYLE CODE) → SKU (by
 * ITEM CODE). The selling price is CURRENT PRICE, the style's SRP is SRP1 and
 * the cost is LANDED COST. Re-running a file is safe: SKUs on file get their
 * price brought up to date, and styles get any product code links they were
 * missing, so codes added in Settings after a first run are picked up.
 */
export const importMasterdataBatch = mutation({
  args: { rows: v.array(masterdataRow) },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);
    if (args.rows.length > MASTERDATA_BATCH_SIZE) {
      throw new ConvexError({
        code: "BATCH_TOO_LARGE",
        message: `Batch size ${args.rows.length} exceeds maximum of ${MASTERDATA_BATCH_SIZE}`,
      });
    }

    const brands = await ctx.db.query("brands").collect();
    const productCodes = await ctx.db.query("productCodes").collect();
    const findCode = (type: Doc<"productCodes">["type"], description: string | undefined) => {
      if (!description) return undefined;
      return productCodes.find((pc) => pc.type === type && pc.description.toUpperCase() === description)
        ?._id;
    };
    const findMasterdataCode = (type: ProductCodeType, raw: string | undefined) =>
      findCode(type, productCodeDescription(type, raw) || undefined);
    const categoryCache = new Map<string, Id<"categories">>();

    let createdCount = 0;
    let priceUpdatedCount = 0;
    let skippedCount = 0;
    let failureCount = 0;
    const errors: Array<{ rowIndex: number; itemCode: string; error: string }> = [];
    const skipped: Array<{ rowIndex: number; itemCode: string; reason: string }> = [];

    for (let i = 0; i < args.rows.length; i++) {
      const row = args.rows[i];
      const itemCode = row.itemCode.trim();
      try {
        if (isReservedRow(row)) {
          skippedCount++;
          skipped.push({ rowIndex: i, itemCode, reason: "Reserved placeholder row" });
          continue;
        }
        const styleCode = normalizeStyleCode(row.styleCode);
        if (!styleCode) {
          skippedCount++;
          skipped.push({ rowIndex: i, itemCode, reason: "No style code" });
          continue;
        }

        const brand = await findOrCreateBrand(ctx, brands, row.brand, styleCode, user._id);
        const categoryId = await findOrCreateLegacyCategory(ctx, categoryCache, brand._id, row.category);

        const calendar = parseCalendarCode(row.calendarCode);
        const links = {
          departmentId: findMasterdataCode("department", row.department),
          divisionId: findMasterdataCode("division", row.division),
          productCategoryId: findMasterdataCode("category", row.category),
          subCategoryId: findMasterdataCode("subCategory", row.subCategory),
          monthId: calendar
            ? productCodes.find((pc) => pc.type === "month" && pc.code === calendar.month)?._id
            : undefined,
          yearId: calendar ? await findOrCreateYear(ctx, productCodes, calendar.year) : undefined,
          productionId: findCode("production", productionDescription(row.classification)),
          outlierId: findCode("outlier", outlierDescription(row.classification)),
        };

        const styleId = await upsertStyle(ctx, {
          row,
          styleCode,
          brandId: brand._id,
          categoryId,
          links,
          userId: user._id,
        });

        const result = await createImportedVariant(ctx, {
          styleId,
          sku: itemCode,
          barcode: itemCode,
          size: cleanLabel(row.size),
          color: cleanLabel(row.color),
          gender: genderFromDepartment(row.department),
          priceCentavos: toCentavos(row.currentPricePesos),
          costPriceCentavos:
            row.landedCostPesos !== undefined ? toCentavos(row.landedCostPesos) : undefined,
          userId: user._id,
        });

        if (result.status === "created") createdCount++;
        else if (result.status === "priceUpdated") priceUpdatedCount++;
        else {
          skippedCount++;
          skipped.push({ rowIndex: i, itemCode, reason: result.reason });
        }
      } catch (error: unknown) {
        failureCount++;
        const message =
          error instanceof ConvexError
            ? (error.data as { message?: string })?.message ?? String(error.data)
            : error instanceof Error
              ? error.message
              : "Unknown error";
        errors.push({ rowIndex: i, itemCode, error: message });
      }
    }

    return { createdCount, priceUpdatedCount, skippedCount, failureCount, errors, skipped };
  },
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * The brand by name, ignoring case. A brand without a code takes the letter its
 * style codes start with — the code is what new style codes are built from.
 */
async function findOrCreateBrand(
  ctx: MutationCtx,
  brands: Doc<"brands">[],
  rawName: string,
  styleCode: string,
  userId: Id<"users">,
): Promise<Doc<"brands">> {
  const name = brandDisplayName(rawName);
  const code = brandCodeFromStyleCode(styleCode);
  const existing = brands.find((b) => b.name.toLowerCase() === name.toLowerCase());

  if (existing) {
    if (!existing.code && code) {
      await ctx.db.patch(existing._id, { code, updatedAt: Date.now() });
      existing.code = code;
    }
    return existing;
  }

  const now = Date.now();
  const brandId = await ctx.db.insert("brands", {
    name,
    code,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  await _logAuditEntry(ctx, {
    action: "brand.bulkCreate",
    userId,
    entityType: "brands",
    entityId: brandId,
    after: { name, code, isActive: true },
  });
  const created = (await ctx.db.get(brandId))!;
  brands.push(created);
  return created;
}

/** The brand's category bucket the admin catalog browses by. */
async function findOrCreateLegacyCategory(
  ctx: MutationCtx,
  cache: Map<string, Id<"categories">>,
  brandId: Id<"brands">,
  rawCategory: string,
): Promise<Id<"categories">> {
  const name = cleanLabel(rawCategory);
  const key = `${brandId}::${name}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const siblings = await ctx.db
    .query("categories")
    .withIndex("by_brand", (q) => q.eq("brandId", brandId))
    .collect();
  const existing = siblings.find((c) => c.name.toUpperCase() === name);
  const now = Date.now();
  const id =
    existing?._id ??
    (await ctx.db.insert("categories", {
      brandId,
      name,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }));
  cache.set(key, id);
  return id;
}

/** Years are just their two digits, so a year the codes don't have yet is added. */
async function findOrCreateYear(
  ctx: MutationCtx,
  productCodes: Doc<"productCodes">[],
  yy: string,
): Promise<Id<"productCodes">> {
  const existing = productCodes.find((pc) => pc.type === "year" && pc.code === yy);
  if (existing) return existing._id;
  const now = Date.now();
  const id = await ctx.db.insert("productCodes", {
    type: "year",
    description: `20${yy}`,
    code: yy,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  productCodes.push((await ctx.db.get(id))!);
  return id;
}

type StyleLinks = {
  departmentId?: Id<"productCodes">;
  divisionId?: Id<"productCodes">;
  productCategoryId?: Id<"productCodes">;
  subCategoryId?: Id<"productCodes">;
  monthId?: Id<"productCodes">;
  yearId?: Id<"productCodes">;
  productionId?: Id<"productCodes">;
  outlierId?: Id<"productCodes">;
};

/**
 * The brand's style with this style code, created on first sight. On a later
 * row it fills product code links it was missing and takes the latest
 * merchandising labels — trading and aging move as the style sells through.
 */
async function upsertStyle(
  ctx: MutationCtx,
  args: {
    row: MasterdataRow;
    styleCode: string;
    brandId: Id<"brands">;
    categoryId: Id<"categories">;
    links: StyleLinks;
    userId: Id<"users">;
  },
): Promise<Id<"styles">> {
  const { row, styleCode, brandId, categoryId, links } = args;
  const labels = {
    classification: cleanLabel(row.classification) || undefined,
    designs: cleanLabel(row.designs) || undefined,
    specs: cleanLabel(row.specs) || undefined,
    trading: cleanLabel(row.trading) || undefined,
    aging: cleanLabel(row.aging) || undefined,
  };

  const sameCode = await ctx.db
    .query("styles")
    .withIndex("by_styleCode", (q) => q.eq("styleCode", styleCode))
    .collect();
  const existing = sameCode.find((s) => s.brandId === brandId);

  if (existing) {
    const patch: Partial<Doc<"styles">> = {};
    for (const [key, id] of Object.entries(links) as [keyof StyleLinks, Id<"productCodes"> | undefined][]) {
      if (id && !existing[key]) patch[key] = id;
    }
    for (const [key, value] of Object.entries(labels) as [keyof typeof labels, string | undefined][]) {
      if (value && value !== existing[key]) patch[key] = value;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(existing._id, { ...patch, updatedAt: Date.now() });
    }
    return existing._id;
  }

  const name = cleanLabel(row.description) || styleCode;
  const srpPesos = row.srpPesos ?? row.currentPricePesos;
  const now = Date.now();
  const styleId = await ctx.db.insert("styles", {
    categoryId,
    brandId,
    ...links,
    styleCode,
    sequenceNumber: styleSequenceNumber(styleCode),
    name,
    srp: srpPesos,
    basePriceCentavos: Math.max(1, toCentavos(srpPesos)),
    ...labels,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  await _logAuditEntry(ctx, {
    action: "style.bulkCreate",
    userId: args.userId,
    entityType: "styles",
    entityId: styleId,
    after: { brandId, styleCode, name, srp: srpPesos, isActive: true },
  });

  return styleId;
}

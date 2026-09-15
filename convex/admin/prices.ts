// convex/admin/prices.ts — the Prices page: base and branch prices, one or in bulk.
//
// A variant's base price is variants.priceCentavos. A branch sells at its own
// price when it has a branchPrices row, and at the base price otherwise —
// following the base when it changes. Resetting a branch price removes its
// row. Every change is written to priceChanges, and each call to the audit log.

import { v, ConvexError } from "convex/values";
import { query, mutation, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireRole, ADMIN_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";
import { branchPriceRow } from "../_helpers/branchPricing";
import { applyPriceOp, invalidPrice, type PriceOp, type Rounding } from "../_helpers/priceMath";

const MAX_BRANCH_COLUMNS = 20;
const MAX_PAGE_SIZE = 100;
const MAX_CHANGE_VARIANTS = 100;
const MAX_MATCHING_IDS = 5000;

// ─── Filtering ────────────────────────────────────────────────────────────────

const filterArgs = {
  search: v.optional(v.string()),
  brandId: v.optional(v.id("brands")),
  // Only products with their own price in at least one of these branches.
  ownPricesIn: v.optional(v.array(v.id("branches"))),
};

type FilterArgs = {
  search?: string;
  brandId?: Id<"brands">;
  ownPricesIn?: Id<"branches">[];
};

type Match = {
  variant: Doc<"variants">;
  style: Doc<"styles">;
  brandName: string;
};

/** Active variants matching the filters, sorted by style, color and size. */
async function matchingVariants(ctx: QueryCtx, args: FilterArgs): Promise<Match[]> {
  const [styles, categories, brands, variants] = await Promise.all([
    ctx.db.query("styles").collect(),
    ctx.db.query("categories").collect(),
    ctx.db.query("brands").collect(),
    ctx.db.query("variants").collect(),
  ]);
  const styleById = new Map(styles.map((s) => [s._id as string, s]));
  const categoryById = new Map(categories.map((c) => [c._id as string, c]));
  const brandById = new Map(brands.map((b) => [b._id as string, b]));

  let ownPriced: Set<string> | null = null;
  if (args.ownPricesIn && args.ownPricesIn.length > 0) {
    ownPriced = new Set();
    for (const branchId of args.ownPricesIn.slice(0, MAX_BRANCH_COLUMNS)) {
      const rows = await ctx.db
        .query("branchPrices")
        .withIndex("by_branch", (q) => q.eq("branchId", branchId))
        .collect();
      for (const r of rows) ownPriced.add(r.variantId);
    }
  }

  const search = args.search?.trim().toLowerCase() ?? "";
  const out: Match[] = [];
  for (const variant of variants) {
    if (!variant.isActive) continue;
    if (ownPriced && !ownPriced.has(variant._id)) continue;
    const style = styleById.get(variant.styleId);
    if (!style) continue;
    const brandId =
      style.brandId ?? (style.categoryId ? categoryById.get(style.categoryId)?.brandId : undefined);
    if (args.brandId && brandId !== args.brandId) continue;
    if (search) {
      const haystack = [style.name, style.styleCode, variant.sku, variant.barcode, variant.color, variant.size]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) continue;
    }
    out.push({ variant, style, brandName: brandId ? brandById.get(brandId)?.name ?? "" : "" });
  }

  out.sort(
    (a, b) =>
      a.style.name.localeCompare(b.style.name) ||
      a.variant.color.localeCompare(b.variant.color) ||
      a.variant.size.localeCompare(b.variant.size, undefined, { numeric: true })
  );
  return out;
}

// ─── getPriceOptions ──────────────────────────────────────────────────────────

export const getPriceOptions = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ADMIN_ROLES);
    const [branches, brands] = await Promise.all([
      ctx.db.query("branches").collect(),
      ctx.db.query("brands").collect(),
    ]);
    return {
      // The warehouse sells nothing, so it has no selling price.
      branches: branches
        .filter((b) => b.isActive && b.channel !== "warehouse")
        .map((b) => ({ id: b._id, name: b.name, channel: b.channel ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      brands: brands
        .filter((b) => b.isActive)
        .map((b) => ({ id: b._id, name: b.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});

// ─── listPriceRows ────────────────────────────────────────────────────────────

export const listPriceRows = query({
  args: {
    ...filterArgs,
    branchIds: v.array(v.id("branches")),
    page: v.number(), // 0-based
    pageSize: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);
    const branchIds = args.branchIds.slice(0, MAX_BRANCH_COLUMNS);
    const pageSize = Math.min(Math.max(1, Math.floor(args.pageSize)), MAX_PAGE_SIZE);
    const page = Math.max(0, Math.floor(args.page));

    const matches = await matchingVariants(ctx, args);
    const slice = matches.slice(page * pageSize, (page + 1) * pageSize);

    const rows = [];
    for (const { variant, style, brandName } of slice) {
      const prices: { branchId: Id<"branches">; priceCentavos: number; own: boolean }[] = [];
      for (const branchId of branchIds) {
        const row = await branchPriceRow(ctx, branchId, variant._id);
        prices.push({
          branchId,
          priceCentavos: row?.priceCentavos ?? variant.priceCentavos,
          own: row !== null,
        });
      }
      rows.push({
        variantId: variant._id,
        styleName: style.name,
        brandName,
        sku: variant.sku,
        barcode: variant.barcode ?? null,
        color: variant.color,
        size: variant.size,
        basePriceCentavos: variant.priceCentavos,
        costPriceCentavos: variant.costPriceCentavos ?? null,
        prices,
      });
    }
    return { rows, total: matches.length };
  },
});

// ─── listMatchingVariantIds ───────────────────────────────────────────────────
// For "select all matching": every variant the filters match, up to a limit.

export const listMatchingVariantIds = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);
    const matches = await matchingVariants(ctx, args);
    return {
      variantIds: matches.slice(0, MAX_MATCHING_IDS).map((m) => m.variant._id),
      total: matches.length,
      capped: matches.length > MAX_MATCHING_IDS,
    };
  },
});

// ─── changePrices ─────────────────────────────────────────────────────────────

const priceOpValidator = v.union(
  v.object({ type: v.literal("set"), priceCentavos: v.number() }),
  v.object({ type: v.literal("percent"), percent: v.number() }),
  v.object({ type: v.literal("amount"), centavos: v.number() }),
  v.object({ type: v.literal("reset") })
);

export const changePrices = mutation({
  args: {
    variantIds: v.array(v.id("variants")),
    target: v.union(
      v.object({ kind: v.literal("base") }),
      v.object({ kind: v.literal("branches"), branchIds: v.array(v.id("branches")) })
    ),
    op: priceOpValidator,
    rounding: v.optional(v.union(v.literal("none"), v.literal("peso"), v.literal("end9"))),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);
    if (args.variantIds.length > MAX_CHANGE_VARIANTS) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: `Change at most ${MAX_CHANGE_VARIANTS} products at a time.`,
      });
    }
    const op = args.op as PriceOp;
    const rounding: Rounding = args.rounding ?? "none";
    if (op.type === "reset" && args.target.kind === "base") {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Only a branch price can be reset to the base price.",
      });
    }
    if (op.type === "set") {
      const problem = invalidPrice(op.priceCentavos);
      if (problem) throw new ConvexError({ code: "INVALID_INPUT", message: problem });
    }

    const branches: Doc<"branches">[] = [];
    if (args.target.kind === "branches") {
      if (args.target.branchIds.length === 0) {
        throw new ConvexError({ code: "INVALID_INPUT", message: "Choose at least one branch." });
      }
      for (const id of args.target.branchIds.slice(0, MAX_BRANCH_COLUMNS)) {
        const branch = await ctx.db.get(id);
        if (!branch || !branch.isActive || branch.channel === "warehouse") {
          throw new ConvexError({
            code: "INVALID_INPUT",
            message: "A chosen branch is inactive or is the warehouse.",
          });
        }
        branches.push(branch);
      }
    }

    const now = Date.now();
    let changed = 0;
    let unchanged = 0;
    const skipped: { variantId: Id<"variants">; sku: string; branchName: string | null; reason: string }[] = [];

    const log = (
      variantId: Id<"variants">,
      branchId: Id<"branches"> | undefined,
      action: "set" | "reset",
      oldPriceCentavos: number,
      newPriceCentavos: number
    ) =>
      ctx.db.insert("priceChanges", {
        variantId,
        branchId,
        action,
        oldPriceCentavos,
        newPriceCentavos,
        changedById: user._id,
        changedAt: now,
      });

    for (const variantId of args.variantIds) {
      const variant = await ctx.db.get(variantId);
      if (!variant || !variant.isActive) {
        skipped.push({ variantId, sku: variant?.sku ?? "", branchName: null, reason: "Product not found or inactive." });
        continue;
      }
      const base = variant.priceCentavos;

      if (args.target.kind === "base") {
        const next = applyPriceOp(base, base, op, rounding);
        const problem = invalidPrice(next);
        if (problem) {
          skipped.push({ variantId, sku: variant.sku, branchName: null, reason: problem });
          continue;
        }
        if (next === base) {
          unchanged++;
          continue;
        }
        await ctx.db.patch(variantId, { priceCentavos: next, updatedAt: now });
        await log(variantId, undefined, "set", base, next);
        changed++;
        continue;
      }

      for (const branch of branches) {
        const own = await branchPriceRow(ctx, branch._id, variantId);
        const current = own?.priceCentavos ?? base;

        if (op.type === "reset") {
          if (!own) {
            unchanged++;
            continue;
          }
          await ctx.db.delete(own._id);
          await log(variantId, branch._id, "reset", current, base);
          changed++;
          continue;
        }

        const next = applyPriceOp(current, base, op, rounding);
        const problem = invalidPrice(next);
        if (problem) {
          skipped.push({ variantId, sku: variant.sku, branchName: branch.name, reason: problem });
          continue;
        }
        // Already selling at that price. A branch on the base price stays on
        // it, so it keeps following the base.
        if (next === current) {
          unchanged++;
          continue;
        }
        if (own) {
          await ctx.db.patch(own._id, { priceCentavos: next, updatedById: user._id, updatedAt: now });
        } else {
          await ctx.db.insert("branchPrices", {
            branchId: branch._id,
            variantId,
            styleId: variant.styleId,
            priceCentavos: next,
            updatedById: user._id,
            updatedAt: now,
          });
        }
        await log(variantId, branch._id, "set", current, next);
        changed++;
      }
    }

    await _logAuditEntry(ctx, {
      action: "prices.change",
      userId: user._id,
      entityType: "priceChanges",
      entityId: args.variantIds.length === 1 ? args.variantIds[0] : `${args.variantIds.length} products`,
      after: {
        target: args.target.kind === "base" ? "base" : branches.map((b) => b.name),
        op,
        rounding,
        products: args.variantIds.length,
        changed,
        unchanged,
        skipped: skipped.length,
      },
    });

    return { changed, unchanged, skipped };
  },
});

// ─── getPriceHistory ──────────────────────────────────────────────────────────

export const getPriceHistory = query({
  args: { variantId: v.id("variants") },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);
    const changes = await ctx.db
      .query("priceChanges")
      .withIndex("by_variant", (q) => q.eq("variantId", args.variantId))
      .order("desc")
      .take(50);
    const names = new Map<string, string>();
    const nameOf = async (id: Id<"users"> | Id<"branches">) => {
      if (!names.has(id)) names.set(id, (await ctx.db.get(id))?.name ?? "Unknown");
      return names.get(id)!;
    };
    const out = [];
    for (const c of changes) {
      out.push({
        _id: c._id,
        branchName: c.branchId ? await nameOf(c.branchId) : null,
        action: c.action,
        oldPriceCentavos: c.oldPriceCentavos,
        newPriceCentavos: c.newPriceCentavos,
        changedByName: await nameOf(c.changedById),
        changedAt: c.changedAt,
      });
    }
    return out;
  },
});

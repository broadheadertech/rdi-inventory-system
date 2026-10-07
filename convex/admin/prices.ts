// convex/admin/prices.ts — the Prices page: base and branch prices, one or in bulk.
//
// A variant's base price is variants.priceCentavos. A branch sells at its own
// price when it has a branchPrices row, and at the base price otherwise —
// following the base when it changes. Resetting a branch price removes its
// row. A branch price under the Base SRP is saved only once confirmed. Every
// change is written to priceChanges, and each call to the audit log.

import { v, ConvexError } from "convex/values";
import { query, mutation, type QueryCtx, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireRole, ADMIN_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";
import { branchPriceRow } from "../_helpers/branchPricing";
import { applyPriceOp, invalidPrice, type PriceOp, type Rounding } from "../_helpers/priceMath";

const MAX_BRANCH_COLUMNS = 20;
const MAX_PAGE_SIZE = 100;
const MAX_CHANGE_VARIANTS = 100;
const MAX_MATCHING_IDS = 5000;
const MAX_CSV_ROWS = 5000;

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

// ─── exportPriceRows ──────────────────────────────────────────────────────────
// Every matching product, for the spreadsheet. A branch cell is left empty when
// the branch has no price of its own, so the file says plainly which prices are
// set and which simply follow the Base SRP — and a cell emptied by hand reads
// back as "put this branch back on the base price".

export const exportPriceRows = query({
  args: {
    ...filterArgs,
    branchIds: v.array(v.id("branches")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);
    const branchIds = args.branchIds.slice(0, MAX_BRANCH_COLUMNS);

    const branches = [];
    for (const id of branchIds) {
      const branch = await ctx.db.get(id);
      if (branch) branches.push({ _id: branch._id, name: branch.name });
    }

    const matches = (await matchingVariants(ctx, args)).slice(0, MAX_CSV_ROWS);

    const rows = [];
    for (const { variant, style, brandName } of matches) {
      const prices: (number | null)[] = [];
      for (const branch of branches) {
        const own = await branchPriceRow(ctx, branch._id, variant._id);
        prices.push(own ? own.priceCentavos : null);
      }
      rows.push({
        sku: variant.sku,
        brandName,
        styleName: style.name,
        size: variant.size,
        color: variant.color,
        basePriceCentavos: variant.priceCentavos,
        costPriceCentavos: variant.costPriceCentavos ?? null,
        prices,
      });
    }

    return {
      branches: branches.map((b) => b.name),
      rows,
      truncated: rows.length < (await matchingVariants(ctx, args)).length,
    };
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

// ─── Planning a change ────────────────────────────────────────────────────────
// What a change does to each product and branch, worked out without writing
// anything — so the page's check before applying and the save itself agree.

const priceOpValidator = v.union(
  v.object({ type: v.literal("set"), priceCentavos: v.number() }),
  v.object({ type: v.literal("percent"), percent: v.number() }),
  v.object({ type: v.literal("amount"), centavos: v.number() }),
  v.object({ type: v.literal("reset") })
);

const changeArgs = {
  variantIds: v.array(v.id("variants")),
  target: v.union(
    v.object({ kind: v.literal("base") }),
    v.object({ kind: v.literal("branches"), branchIds: v.array(v.id("branches")) })
  ),
  op: priceOpValidator,
  rounding: v.optional(v.union(v.literal("none"), v.literal("peso"), v.literal("end9"))),
};

type ChangeArgs = {
  variantIds: Id<"variants">[];
  target: { kind: "base" } | { kind: "branches"; branchIds: Id<"branches">[] };
  op: PriceOp;
  rounding?: Rounding;
};

type Skipped = {
  variantId: Id<"variants">;
  sku: string;
  branchName: string | null;
  reason: string;
};

/** One price that the change moves. `branch` is null for the Base SRP. */
type PlannedCell = {
  variant: Doc<"variants">;
  branch: Doc<"branches"> | null;
  own: Doc<"branchPrices"> | null;
  current: number;
  next: number;
  /** A branch price that would sell under the product's Base SRP. */
  belowBase: boolean;
};

async function planChange(
  ctx: QueryCtx | MutationCtx,
  args: ChangeArgs
): Promise<{ cells: PlannedCell[]; unchanged: number; skipped: Skipped[] }> {
  if (args.variantIds.length > MAX_CHANGE_VARIANTS) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: `Change at most ${MAX_CHANGE_VARIANTS} products at a time.`,
    });
  }
  const op = args.op;
  const rounding: Rounding = args.rounding ?? "none";
  if (op.type === "reset" && args.target.kind === "base") {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Only a branch price can be reset to the Base SRP.",
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

  const cells: PlannedCell[] = [];
  const skipped: Skipped[] = [];
  let unchanged = 0;

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
      if (problem) skipped.push({ variantId, sku: variant.sku, branchName: null, reason: problem });
      else if (next === base) unchanged++;
      else cells.push({ variant, branch: null, own: null, current: base, next, belowBase: false });
      continue;
    }

    for (const branch of branches) {
      const own = await branchPriceRow(ctx, branch._id, variantId);
      const current = own?.priceCentavos ?? base;

      if (op.type === "reset") {
        if (!own) unchanged++;
        else cells.push({ variant, branch, own, current, next: base, belowBase: false });
        continue;
      }

      const next = applyPriceOp(current, base, op, rounding);
      const problem = invalidPrice(next);
      if (problem) {
        skipped.push({ variantId, sku: variant.sku, branchName: branch.name, reason: problem });
      } else if (next === current) {
        // Already selling at that price. A branch on the Base SRP stays on it,
        // so it keeps following the Base SRP.
        unchanged++;
      } else {
        cells.push({ variant, branch, own, current, next, belowBase: next < base });
      }
    }
  }

  return { cells, unchanged, skipped };
}

// ─── previewPriceChange ───────────────────────────────────────────────────────
// What applying a change would do, without saving: how many prices move, and
// which branch prices would drop under the Base SRP and need confirming.

export const previewPriceChange = query({
  args: changeArgs,
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);
    const plan = await planChange(ctx, args);
    const below = plan.cells.filter((c) => c.belowBase);
    const examples: {
      sku: string;
      name: string;
      branchName: string;
      baseCentavos: number;
      newCentavos: number;
    }[] = [];
    for (const c of below.slice(0, 10)) {
      const style = await ctx.db.get(c.variant.styleId);
      examples.push({
        sku: c.variant.sku,
        name: style ? `${style.name} · ${c.variant.color} · ${c.variant.size}` : c.variant.sku,
        branchName: c.branch?.name ?? "",
        baseCentavos: c.variant.priceCentavos,
        newCentavos: c.next,
      });
    }
    return {
      changes: plan.cells.length,
      unchanged: plan.unchanged,
      skipped: plan.skipped.length,
      belowBase: below.length,
      belowBaseExamples: examples,
    };
  },
});

// ─── changePrices ─────────────────────────────────────────────────────────────

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

// ─── Price changes go through approval ──────────────────────────────────────
// A price used to change the moment somebody pressed save. A bulk edit, or a
// spreadsheet with a stray column, could reprice the chain before anyone saw
// what it did. Now a change is proposed, the exact before-and-after is stored,
// and nothing moves until an admin has looked at the difference.
//
// Approving is a review step rather than a second signature: the person who
// submitted may approve it. The risk being caught here is a bad file, and
// seeing the diff catches that.

/** Writes the planned cells, and returns the proposal they belong to. */
async function createProposal(
  ctx: MutationCtx,
  args: {
    source: "editor" | "csv";
    fileName?: string;
    summary: string;
    userId: Id<"users">;
    unchanged: number;
    skipped: number;
    cells: {
      variantId: Id<"variants">;
      branchId?: Id<"branches">;
      sku: string;
      label: string;
      branchName?: string;
      action: "set" | "reset";
      oldPriceCentavos: number;
      newPriceCentavos: number;
      belowBase: boolean;
    }[];
  }
): Promise<Id<"priceProposals">> {
  const proposalId = await ctx.db.insert("priceProposals", {
    source: args.source,
    ...(args.fileName ? { fileName: args.fileName } : {}),
    summary: args.summary,
    status: "pending" as const,
    changedCount: args.cells.length,
    unchangedCount: args.unchanged,
    skippedCount: args.skipped,
    belowBaseCount: args.cells.filter((c) => c.belowBase).length,
    submittedById: args.userId,
    submittedAt: Date.now(),
  });

  for (const cell of args.cells) {
    await ctx.db.insert("priceProposalCells", { proposalId, ...cell });
  }
  return proposalId;
}

/**
 * The on-screen editor: same arguments as before, but the change is queued
 * rather than written.
 */
export const proposePriceChange = mutation({
  args: {
    ...changeArgs,
    // A branch price under the Base SRP still has to be confirmed before it
    // can even be proposed, so it is never queued by accident.
    belowBase: v.optional(v.union(v.literal("allow"), v.literal("skip"))),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);
    const plan = await planChange(ctx, args);
    const allowBelowBase = args.belowBase === "allow";

    const cells = [];
    let skipped = plan.skipped.length;
    for (const cell of plan.cells) {
      if (cell.belowBase && !allowBelowBase) {
        skipped++;
        continue;
      }
      cells.push({
        variantId: cell.variant._id,
        ...(cell.branch ? { branchId: cell.branch._id } : {}),
        sku: cell.variant.sku,
        label: `${cell.variant.size} / ${cell.variant.color}`,
        ...(cell.branch ? { branchName: cell.branch.name } : {}),
        action: (args.op.type === "reset" ? "reset" : "set") as "set" | "reset",
        oldPriceCentavos: cell.current,
        newPriceCentavos: cell.next,
        belowBase: cell.belowBase,
      });
    }

    if (cells.length === 0) {
      return { proposalId: null, changed: 0, unchanged: plan.unchanged, skipped };
    }

    const where =
      args.target.kind === "base"
        ? "Base SRP"
        : `${args.target.branchIds.length} branch${args.target.branchIds.length === 1 ? "" : "es"}`;
    const summary =
      args.note?.trim() ||
      `${where}: ${cells.length} price${cells.length === 1 ? "" : "s"} across ${args.variantIds.length} product${args.variantIds.length === 1 ? "" : "s"}`;

    const proposalId = await createProposal(ctx, {
      source: "editor",
      summary,
      userId: user._id,
      unchanged: plan.unchanged,
      skipped,
      cells,
    });

    await _logAuditEntry(ctx, {
      action: "prices.propose",
      userId: user._id,
      entityType: "priceProposals",
      entityId: proposalId,
      after: { source: "editor", summary, changed: cells.length },
    });

    return { proposalId, changed: cells.length, unchanged: plan.unchanged, skipped };
  },
});

/**
 * A spreadsheet of prices, read back in.
 *
 * Every row is compared against what is in force now: a row that matches is
 * counted as untouched and creates nothing, so a file where two lines were
 * edited proposes two changes rather than ten thousand. A blank branch cell
 * means "follow the Base SRP", which is how a branch price is taken away.
 */
export const proposePricesFromCsv = mutation({
  args: {
    fileName: v.string(),
    note: v.optional(v.string()),
    rows: v.array(
      v.object({
        sku: v.string(),
        // Absent: this row is not setting the base price.
        basePriceCentavos: v.optional(v.number()),
        // One entry per branch column that carried a value, plus the branches
        // whose cell was left blank, which asks for the branch price to go.
        branchPrices: v.array(
          v.object({
            branchName: v.string(),
            priceCentavos: v.optional(v.number()), // absent: follow the base
          })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);

    if (args.rows.length === 0) {
      throw new ConvexError({
        code: "EMPTY_FILE",
        message: "That file had no rows to read.",
      });
    }
    if (args.rows.length > MAX_CSV_ROWS) {
      throw new ConvexError({
        code: "TOO_MANY_ROWS",
        message: `That file has ${args.rows.length} rows. ${MAX_CSV_ROWS} at a time is the most this can read.`,
      });
    }

    const branches = await ctx.db.query("branches").collect();
    const branchByName = new Map(
      branches.map((b) => [b.name.trim().toLowerCase(), b])
    );

    const cells = [];
    const problems: { sku: string; reason: string }[] = [];
    let unchanged = 0;

    for (const row of args.rows) {
      const sku = row.sku.trim();
      if (!sku) continue;

      const variant = await ctx.db
        .query("variants")
        .withIndex("by_sku", (q) => q.eq("sku", sku))
        .first();
      if (!variant) {
        problems.push({ sku, reason: "No product with that SKU." });
        continue;
      }

      const label = `${variant.size} / ${variant.color}`;

      // The base price.
      if (row.basePriceCentavos !== undefined) {
        const next = Math.round(row.basePriceCentavos);
        if (invalidPrice(next)) {
          problems.push({ sku, reason: "Base SRP is not a usable price." });
        } else if (next === variant.priceCentavos) {
          unchanged++;
        } else {
          cells.push({
            variantId: variant._id,
            sku,
            label,
            action: "set" as const,
            oldPriceCentavos: variant.priceCentavos,
            newPriceCentavos: next,
            belowBase: false,
          });
        }
      }

      // The branch prices. A blank cell asks for the branch's own price to go.
      for (const entry of row.branchPrices) {
        const branch = branchByName.get(entry.branchName.trim().toLowerCase());
        if (!branch) {
          problems.push({ sku, reason: `No branch named "${entry.branchName}".` });
          continue;
        }
        const own = await branchPriceRow(ctx, branch._id, variant._id);
        const current = own?.priceCentavos ?? variant.priceCentavos;

        if (entry.priceCentavos === undefined) {
          if (!own) {
            unchanged++; // already following the base
            continue;
          }
          cells.push({
            variantId: variant._id,
            branchId: branch._id,
            sku,
            label,
            branchName: branch.name,
            action: "reset" as const,
            oldPriceCentavos: current,
            newPriceCentavos: variant.priceCentavos,
            belowBase: false,
          });
          continue;
        }

        const next = Math.round(entry.priceCentavos);
        if (invalidPrice(next)) {
          problems.push({ sku, reason: `${branch.name}: not a usable price.` });
          continue;
        }
        if (own && next === own.priceCentavos) {
          unchanged++;
          continue;
        }
        if (!own && next === variant.priceCentavos) {
          unchanged++; // writing the base price where none was set changes nothing
          continue;
        }
        cells.push({
          variantId: variant._id,
          branchId: branch._id,
          sku,
          label,
          branchName: branch.name,
          action: "set" as const,
          oldPriceCentavos: current,
          newPriceCentavos: next,
          belowBase: next < variant.priceCentavos,
        });
      }
    }

    if (cells.length === 0) {
      return {
        proposalId: null,
        changed: 0,
        unchanged,
        problems,
      };
    }

    const proposalId = await createProposal(ctx, {
      source: "csv",
      fileName: args.fileName,
      summary:
        args.note?.trim() ||
        `${args.fileName}: ${cells.length} price${cells.length === 1 ? "" : "s"} changed`,
      userId: user._id,
      unchanged,
      skipped: problems.length,
      cells,
    });

    await _logAuditEntry(ctx, {
      action: "prices.proposeCsv",
      userId: user._id,
      entityType: "priceProposals",
      entityId: proposalId,
      after: {
        fileName: args.fileName,
        rows: args.rows.length,
        changed: cells.length,
        unchanged,
        problems: problems.length,
      },
    });

    return { proposalId, changed: cells.length, unchanged, problems };
  },
});

// ─── The queue ──────────────────────────────────────────────────────────────

export const listPriceProposals = query({
  args: {
    status: v.optional(
      v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"))
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);

    const all = await ctx.db
      .query("priceProposals")
      .withIndex("by_submittedAt")
      .order("desc")
      .take(200);

    const rows = await Promise.all(
      all
        .filter((p) => (args.status ? p.status === args.status : true))
        .map(async (p) => {
          const cells = await ctx.db
            .query("priceProposalCells")
            .withIndex("by_proposal", (q) => q.eq("proposalId", p._id))
            .collect();
          const stillWaiting = cells.filter(
            (c) => (c.status ?? "pending") === "pending"
          ).length;
          const [submitted, reviewed] = await Promise.all([
            ctx.db.get(p.submittedById),
            p.reviewedById ? ctx.db.get(p.reviewedById) : Promise.resolve(null),
          ]);
          return {
            _id: p._id,
            source: p.source,
            fileName: p.fileName ?? null,
            summary: p.summary,
            status: p.status,
            changedCount: p.changedCount,
            pendingCount: stillWaiting,
            unchangedCount: p.unchangedCount,
            skippedCount: p.skippedCount,
            belowBaseCount: p.belowBaseCount,
            submittedAt: p.submittedAt,
            submittedByName: submitted?.name ?? "Unknown",
            reviewedAt: p.reviewedAt ?? null,
            reviewedByName: reviewed?.name ?? null,
            rejectionReason: p.rejectionReason ?? null,
            appliedCount: p.appliedCount ?? null,
          };
        })
    );
    // Waiting first: the queue is the point of the page.
    const order = { pending: 0, rejected: 1, approved: 2 } as const;
    return rows.sort(
      (a, b) => order[a.status] - order[b.status] || b.submittedAt - a.submittedAt
    );
  },
});

/** Every price in one proposal, as it would be after approval. */
export const getPriceProposal = query({
  args: { proposalId: v.id("priceProposals") },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);

    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Proposal not found." });
    }
    const cells = await ctx.db
      .query("priceProposalCells")
      .withIndex("by_proposal", (q) => q.eq("proposalId", args.proposalId))
      .collect();

    return {
      _id: proposal._id,
      status: proposal.status,
      source: proposal.source,
      fileName: proposal.fileName ?? null,
      summary: proposal.summary,
      submittedAt: proposal.submittedAt,
      belowBaseCount: proposal.belowBaseCount,
      unchangedCount: proposal.unchangedCount,
      skippedCount: proposal.skippedCount,
      rejectionReason: proposal.rejectionReason ?? null,
      appliedCells: cells.filter((c) => (c.status ?? "pending") === "applied").length,
      rejectedCells: cells.filter((c) => (c.status ?? "pending") === "rejected").length,
      pendingCells: cells.filter((c) => (c.status ?? "pending") === "pending").length,
      cells: cells
        .map((c) => ({
          _id: c._id,
          sku: c.sku,
          label: c.label,
          scope: c.branchName ?? "Base SRP",
          action: c.action,
          oldPriceCentavos: c.oldPriceCentavos,
          newPriceCentavos: c.newPriceCentavos,
          belowBase: c.belowBase,
          status: c.status ?? "pending",
        }))
        // Lines still waiting come first: on a part-reviewed file, what is
        // left to decide is the only thing the reviewer is there for.
        .sort(
          (a, b) =>
            Number(a.status !== "pending") - Number(b.status !== "pending") ||
            a.sku.localeCompare(b.sku) ||
            a.scope.localeCompare(b.scope)
        ),
    };
  },
});

// ─── Approving, all at once or line by line ─────────────────────────────────
// A spreadsheet of three hundred prices is rarely all right or all wrong. Two
// bad rows used to mean rejecting the file and asking for it again; now the
// good lines can be taken and the rest refused, and the proposal closes when
// nothing is left waiting.

type Cell = Doc<"priceProposalCells">;

const cellStatus = (cell: Cell) => cell.status ?? "pending";

/** Writes one price, and the history row that records it. */
async function applyCell(
  ctx: MutationCtx,
  cell: Cell,
  userId: Id<"users">,
  now: number
): Promise<boolean> {
  const variant = await ctx.db.get(cell.variantId);
  if (!variant) return false; // deleted since it was proposed

  if (!cell.branchId) {
    await ctx.db.patch(variant._id, {
      priceCentavos: cell.newPriceCentavos,
      updatedAt: now,
    });
  } else {
    const own = await branchPriceRow(ctx, cell.branchId, cell.variantId);
    if (cell.action === "reset") {
      if (own) await ctx.db.delete(own._id);
    } else if (own) {
      await ctx.db.patch(own._id, {
        priceCentavos: cell.newPriceCentavos,
        updatedById: userId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("branchPrices", {
        branchId: cell.branchId,
        variantId: cell.variantId,
        styleId: variant.styleId,
        priceCentavos: cell.newPriceCentavos,
        updatedById: userId,
        updatedAt: now,
      });
    }
  }

  await ctx.db.insert("priceChanges", {
    variantId: cell.variantId,
    ...(cell.branchId ? { branchId: cell.branchId } : {}),
    action: cell.action,
    oldPriceCentavos: cell.oldPriceCentavos,
    newPriceCentavos: cell.newPriceCentavos,
    changedById: userId,
    changedAt: now,
  });
  return true;
}

/**
 * Closes the proposal once no line is still waiting: approved if anything was
 * taken, rejected if nothing was. A proposal with lines left open stays open,
 * so a part-reviewed file is never mistaken for a finished one.
 */
async function settleProposal(
  ctx: MutationCtx,
  proposalId: Id<"priceProposals">,
  userId: Id<"users">
): Promise<{ applied: number; rejected: number; waiting: number }> {
  const cells = await ctx.db
    .query("priceProposalCells")
    .withIndex("by_proposal", (q) => q.eq("proposalId", proposalId))
    .collect();

  const applied = cells.filter((c) => cellStatus(c) === "applied").length;
  const rejected = cells.filter((c) => cellStatus(c) === "rejected").length;
  const waiting = cells.length - applied - rejected;

  if (waiting === 0) {
    await ctx.db.patch(proposalId, {
      status: (applied > 0 ? "approved" : "rejected") as "approved" | "rejected",
      reviewedAt: Date.now(),
      reviewedById: userId,
      appliedCount: applied,
    });
  } else {
    // Still open, but record what has been taken so far.
    await ctx.db.patch(proposalId, { appliedCount: applied });
  }

  return { applied, rejected, waiting };
}

/** The lines named, or every line still waiting when none are named. */
async function pendingCells(
  ctx: MutationCtx,
  proposalId: Id<"priceProposals">,
  cellIds?: Id<"priceProposalCells">[]
): Promise<Cell[]> {
  const all = await ctx.db
    .query("priceProposalCells")
    .withIndex("by_proposal", (q) => q.eq("proposalId", proposalId))
    .collect();
  const waiting = all.filter((c) => cellStatus(c) === "pending");
  if (!cellIds || cellIds.length === 0) return waiting;

  const wanted = new Set(cellIds.map((id) => id as string));
  const chosen = waiting.filter((c) => wanted.has(c._id as string));
  if (chosen.length === 0) {
    throw new ConvexError({
      code: "NOTHING_TO_DO",
      message: "Those lines have already been decided.",
    });
  }
  return chosen;
}

/**
 * Approve the whole proposal, or just the lines named.
 *
 * Called with no cellIds it takes everything still waiting, which is the
 * "approve all" on the page.
 */
export const approvePriceProposal = mutation({
  args: {
    proposalId: v.id("priceProposals"),
    cellIds: v.optional(v.array(v.id("priceProposalCells"))),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);

    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Proposal not found." });
    }
    if (proposal.status !== "pending") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: `This proposal was already ${proposal.status}.`,
      });
    }

    const cells = await pendingCells(ctx, args.proposalId, args.cellIds);
    const now = Date.now();
    let applied = 0;

    for (const cell of cells) {
      const ok = await applyCell(ctx, cell, user._id, now);
      await ctx.db.patch(cell._id, {
        status: (ok ? "applied" : "rejected") as "applied" | "rejected",
      });
      if (ok) applied++;
    }

    const totals = await settleProposal(ctx, args.proposalId, user._id);

    await _logAuditEntry(ctx, {
      action: "prices.approve",
      userId: user._id,
      entityType: "priceProposals",
      entityId: args.proposalId,
      after: {
        summary: proposal.summary,
        appliedNow: applied,
        partial: args.cellIds !== undefined && args.cellIds.length > 0,
        stillWaiting: totals.waiting,
      },
    });

    return { appliedNow: applied, ...totals };
  },
});

/** Refuse the whole proposal, or just the lines named. */
export const rejectPriceProposal = mutation({
  args: {
    proposalId: v.id("priceProposals"),
    reason: v.string(),
    cellIds: v.optional(v.array(v.id("priceProposalCells"))),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);

    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Proposal not found." });
    }
    if (proposal.status !== "pending") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: `This proposal was already ${proposal.status}.`,
      });
    }
    const reason = args.reason.trim();
    if (reason === "") {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Give a reason, so it is clear why these prices were not taken.",
      });
    }

    const cells = await pendingCells(ctx, args.proposalId, args.cellIds);
    for (const cell of cells) {
      await ctx.db.patch(cell._id, { status: "rejected" as const });
    }

    // The reason belongs to the proposal; a part-refusal adds to what is there.
    const existing = proposal.rejectionReason;
    await ctx.db.patch(args.proposalId, {
      rejectionReason: existing ? `${existing}; ${reason}` : reason,
    });

    const totals = await settleProposal(ctx, args.proposalId, user._id);

    await _logAuditEntry(ctx, {
      action: "prices.reject",
      userId: user._id,
      entityType: "priceProposals",
      entityId: args.proposalId,
      after: {
        summary: proposal.summary,
        rejectedNow: cells.length,
        reason,
        partial: args.cellIds !== undefined && args.cellIds.length > 0,
        stillWaiting: totals.waiting,
      },
    });

    return { rejectedNow: cells.length, ...totals };
  },
});

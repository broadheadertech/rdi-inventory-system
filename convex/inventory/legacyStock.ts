// convex/inventory/legacyStock.ts — upload a stock movement report from the old system.
//
// The file has one row per product per store for one month:
//   ProductCode ProductDesc BeginningInv Sale Container Return MovementOut
//   MovementIn RPO EndingBalance STORE Brand
// The page parses it and maps each STORE to a branch; this module does the rest.
//
//   previewLegacyRows  finds each product and what its branch holds now
//   startLegacyUpload  opens an upload for a month
//   applyLegacyRows    sets each branch's stock to the row's EndingBalance and
//                      keeps the row as that month's movement history
//   finishLegacyUpload closes the upload
//
// EndingBalance is a physical count. Units held for a transfer or quarantined
// are part of it but not sellable, so available stock becomes EndingBalance
// less those. A row whose held units exceed its EndingBalance is skipped.

import { v, ConvexError } from "convex/values";
import { query, mutation, type QueryCtx, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { requireRole, ADMIN_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const MAX_PREVIEW_ROWS = 250;
const MAX_APPLY_ROWS = 100;

type Ctx = QueryCtx | MutationCtx;

function assertPeriod(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new ConvexError({ code: "INVALID_INPUT", message: "Period must be a month, YYYY-MM." });
  }
}

/** The last moment of a YYYY-MM month in PHT, but never later than now. */
function periodEndMs(period: string): number {
  const [y, m] = period.split("-").map(Number);
  // Date.UTC months are 0-based, so `m` is already the following month.
  const end = Date.UTC(y, m, 1) - PHT_OFFSET_MS - 1;
  return Math.min(end, Date.now());
}

/** A product code is the variant's barcode, or failing that its SKU. */
async function findVariant(ctx: Ctx, productCode: string): Promise<Doc<"variants"> | null> {
  const code = productCode.trim();
  if (!code) return null;
  const byBarcode = await ctx.db
    .query("variants")
    .withIndex("by_barcode", (q) => q.eq("barcode", code))
    .first();
  if (byBarcode) return byBarcode;
  return await ctx.db
    .query("variants")
    .withIndex("by_sku", (q) => q.eq("sku", code))
    .first();
}

function heldUnits(inv: Doc<"inventory"> | null): number {
  if (!inv) return 0;
  return (inv.reservedQuantity ?? 0) + (inv.quarantinedQuantity ?? 0);
}

async function inventoryRow(ctx: Ctx, branchId: Id<"branches">, variantId: Id<"variants">) {
  return await ctx.db
    .query("inventory")
    .withIndex("by_branch_variant", (q) => q.eq("branchId", branchId).eq("variantId", variantId))
    .unique();
}

// ─── previewLegacyRows ────────────────────────────────────────────────────────

export const previewLegacyRows = query({
  args: {
    rows: v.array(v.object({ branchId: v.id("branches"), productCode: v.string() })),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);
    if (args.rows.length > MAX_PREVIEW_ROWS) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: `Preview at most ${MAX_PREVIEW_ROWS} rows at a time.`,
      });
    }

    const variants = new Map<string, Doc<"variants"> | null>();
    const styleNames = new Map<string, string>();
    const out: (
      | { found: false }
      | { found: true; sku: string; name: string; onHand: number; held: number }
    )[] = [];
    for (const row of args.rows) {
      const code = row.productCode.trim();
      if (!variants.has(code)) variants.set(code, await findVariant(ctx, code));
      const variant = variants.get(code)!;
      if (!variant) {
        out.push({ found: false });
        continue;
      }
      let styleName = styleNames.get(variant.styleId);
      if (styleName === undefined) {
        styleName = (await ctx.db.get(variant.styleId))?.name ?? "";
        styleNames.set(variant.styleId, styleName);
      }
      const inv = await inventoryRow(ctx, row.branchId, variant._id);
      const held = heldUnits(inv);
      out.push({
        found: true,
        sku: variant.sku,
        name: `${styleName} · ${variant.color} · ${variant.size}`,
        onHand: (inv?.quantity ?? 0) + held,
        held,
      });
    }
    return out;
  },
});

// ─── branchSalesSince ─────────────────────────────────────────────────────────
// How many RDI sales a branch has rung after the month being uploaded. Setting
// its stock from the old report would overwrite what those sales took out.

export const branchSalesSince = query({
  args: { branchIds: v.array(v.id("branches")), period: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);
    assertPeriod(args.period);
    const since = periodEndMs(args.period);
    const out: { branchId: Id<"branches">; transactions: number }[] = [];
    for (const branchId of args.branchIds.slice(0, 100)) {
      const txns = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) => q.eq("branchId", branchId).gt("createdAt", since))
        .take(101);
      out.push({ branchId, transactions: txns.filter((t) => t.status !== "voided").length });
    }
    return out;
  },
});

// ─── startLegacyUpload ────────────────────────────────────────────────────────

export const startLegacyUpload = mutation({
  args: { fileName: v.string(), period: v.string() },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);
    assertPeriod(args.period);
    return await ctx.db.insert("legacyStockUploads", {
      fileName: args.fileName.slice(0, 200),
      period: args.period,
      uploadedById: user._id,
      rowCount: 0,
      appliedCount: 0,
      unchangedCount: 0,
      skippedCount: 0,
      unitsBefore: 0,
      unitsAfter: 0,
      status: "applying",
      createdAt: Date.now(),
    });
  },
});

// ─── applyLegacyRows ──────────────────────────────────────────────────────────

const legacyRow = v.object({
  branchId: v.id("branches"),
  productCode: v.string(),
  productDesc: v.optional(v.string()),
  brand: v.optional(v.string()),
  store: v.string(),
  beginningInv: v.number(),
  sale: v.number(),
  container: v.number(),
  returned: v.number(),
  movementOut: v.number(),
  movementIn: v.number(),
  rpo: v.number(),
  endingBalance: v.number(),
});

export const applyLegacyRows = mutation({
  args: { uploadId: v.id("legacyStockUploads"), rows: v.array(legacyRow) },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);
    if (args.rows.length > MAX_APPLY_ROWS) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: `Apply at most ${MAX_APPLY_ROWS} rows at a time.`,
      });
    }
    const upload = await ctx.db.get(args.uploadId);
    if (!upload) throw new ConvexError({ code: "NOT_FOUND", message: "Upload not found." });
    if (upload.status !== "applying") {
      throw new ConvexError({ code: "INVALID_STATE", message: "This upload is already finished." });
    }

    const now = Date.now();
    const receivedAt = periodEndMs(upload.period);
    const branches = new Map<string, Doc<"branches"> | null>();
    let applied = 0;
    let unchanged = 0;
    let unitsBefore = 0;
    let unitsAfter = 0;
    const skipped: { productCode: string; store: string; reason: string }[] = [];
    const skip = (row: { productCode: string; store: string }, reason: string) =>
      skipped.push({ productCode: row.productCode, store: row.store, reason });

    for (const row of args.rows) {
      const ending = row.endingBalance;
      if (!Number.isInteger(ending) || ending < 0) {
        skip(row, "EndingBalance must be a whole number, 0 or more.");
        continue;
      }

      if (!branches.has(row.branchId)) branches.set(row.branchId, await ctx.db.get(row.branchId));
      const branch = branches.get(row.branchId);
      if (!branch || !branch.isActive) {
        skip(row, "Branch not found or inactive.");
        continue;
      }

      const variant = await findVariant(ctx, row.productCode);
      if (!variant) {
        skip(row, "Product code not found as a barcode or SKU.");
        continue;
      }

      const inv = await inventoryRow(ctx, row.branchId, variant._id);
      const held = heldUnits(inv);
      const available = ending - held;
      if (available < 0) {
        skip(
          row,
          `${held} unit${held === 1 ? " is" : "s are"} held for a transfer or quarantined — more than the EndingBalance.`
        );
        continue;
      }

      unitsBefore += (inv?.quantity ?? 0) + held;
      unitsAfter += ending;

      const change = available - (inv?.quantity ?? 0);
      if (change === 0) {
        unchanged++;
      } else {
        let inventoryId: Id<"inventory">;
        if (inv) {
          await ctx.db.patch(inv._id, { quantity: available, updatedAt: now });
          inventoryId = inv._id;
        } else {
          inventoryId = await ctx.db.insert("inventory", {
            branchId: row.branchId,
            variantId: variant._id,
            quantity: available,
            lowStockThreshold: 5,
            arrivedAt: receivedAt,
            updatedAt: now,
          });
        }

        // Added stock gets a FIFO batch, dated to the month it was counted.
        if (change > 0) {
          await ctx.db.insert("inventoryBatches", {
            branchId: row.branchId,
            variantId: variant._id,
            quantity: change,
            costPriceCentavos: variant.costPriceCentavos ?? variant.priceCentavos ?? 0,
            receivedAt,
            source: "legacy",
            sourceId: args.uploadId,
            notes: `Legacy stock upload ${upload.period}`,
            createdAt: now,
          });
        }

        await _logAuditEntry(ctx, {
          action: "inventory.legacyUpload",
          userId: user._id,
          branchId: row.branchId,
          entityType: "inventory",
          entityId: inventoryId,
          before: { quantity: inv?.quantity ?? 0 },
          after: {
            quantity: available,
            endingBalance: ending,
            period: upload.period,
            uploadId: args.uploadId,
          },
        });

        await ctx.scheduler.runAfter(0, internal.inventory.alerts.checkInventoryAlert, {
          inventoryId,
        });
        applied++;
      }

      // The month's movement history: one row per product, branch and month,
      // replaced if the same month is uploaded again.
      const history = {
        uploadId: args.uploadId,
        branchId: row.branchId,
        variantId: variant._id,
        period: upload.period,
        productCode: row.productCode.trim(),
        productDesc: row.productDesc?.trim() || undefined,
        brand: row.brand?.trim() || undefined,
        store: row.store.trim(),
        beginningInv: row.beginningInv,
        sale: row.sale,
        container: row.container,
        returned: row.returned,
        movementOut: row.movementOut,
        movementIn: row.movementIn,
        rpo: row.rpo,
        endingBalance: ending,
        createdAt: now,
      };
      const existing = await ctx.db
        .query("legacyStockMovements")
        .withIndex("by_branch_variant_period", (q) =>
          q.eq("branchId", row.branchId).eq("variantId", variant._id).eq("period", upload.period)
        )
        .first();
      if (existing) await ctx.db.patch(existing._id, history);
      else await ctx.db.insert("legacyStockMovements", history);
    }

    await ctx.db.patch(args.uploadId, {
      rowCount: upload.rowCount + args.rows.length,
      appliedCount: upload.appliedCount + applied,
      unchangedCount: upload.unchangedCount + unchanged,
      skippedCount: upload.skippedCount + skipped.length,
      unitsBefore: upload.unitsBefore + unitsBefore,
      unitsAfter: upload.unitsAfter + unitsAfter,
    });

    return { applied, unchanged, skipped };
  },
});

// ─── finishLegacyUpload ───────────────────────────────────────────────────────

export const finishLegacyUpload = mutation({
  args: { uploadId: v.id("legacyStockUploads") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);
    const upload = await ctx.db.get(args.uploadId);
    if (!upload) throw new ConvexError({ code: "NOT_FOUND", message: "Upload not found." });
    if (upload.status === "completed") return;
    await ctx.db.patch(args.uploadId, { status: "completed", completedAt: Date.now() });
    await _logAuditEntry(ctx, {
      action: "inventory.legacyUploadCompleted",
      userId: user._id,
      entityType: "legacyStockUploads",
      entityId: args.uploadId,
      after: {
        period: upload.period,
        fileName: upload.fileName,
        rows: upload.rowCount,
        applied: upload.appliedCount,
        unchanged: upload.unchangedCount,
        skipped: upload.skippedCount,
        unitsBefore: upload.unitsBefore,
        unitsAfter: upload.unitsAfter,
      },
    });
  },
});

// ─── listLegacyUploads ────────────────────────────────────────────────────────

export const listLegacyUploads = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ADMIN_ROLES);
    const uploads = await ctx.db
      .query("legacyStockUploads")
      .withIndex("by_createdAt")
      .order("desc")
      .take(20);
    const names = new Map<string, string>();
    const out: (Doc<"legacyStockUploads"> & { uploadedByName: string })[] = [];
    for (const u of uploads) {
      if (!names.has(u.uploadedById)) {
        names.set(u.uploadedById, (await ctx.db.get(u.uploadedById))?.name ?? "Unknown");
      }
      out.push({ ...u, uploadedByName: names.get(u.uploadedById)! });
    }
    return out;
  },
});

// convex/suppliers/receiving.ts — Receiving supplies from suppliers.
//
// Flow:
//   1. createReceipt — supplier + PO number + delivery window + photo + declared
//      allocation (SKU lines).
//   2. scanItem — scan a SKU; counts as +1 received. SKUs not in the declared
//      allocation are added as "unexpected" lines (declared = 0).
//   3. completeReceipt — adds received stock to the warehouse, then flags a
//      discrepancy (and notifies admins) if received != declared on any line.

import { query, mutation } from "../_generated/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { requireRole, WAREHOUSE_ROLES } from "../_helpers/permissions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve the warehouse branch stock is received into (creator's branch, else warehouse channel). */
async function resolveWarehouseBranch(
  ctx: MutationCtx,
  user: Doc<"users">
): Promise<Id<"branches">> {
  if (user.branchId) return user.branchId;
  const branches = await ctx.db.query("branches").collect();
  const warehouse = branches.find(
    (b) => b.channel === "warehouse" && b.isActive
  );
  if (!warehouse) {
    throw new ConvexError({
      code: "NO_WAREHOUSE",
      message: "No warehouse branch found. Assign one or contact an admin.",
    });
  }
  return warehouse._id;
}

async function findVariantByCode(
  ctx: QueryCtx | MutationCtx,
  code: string
): Promise<Doc<"variants"> | null> {
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

async function variantLabel(ctx: QueryCtx | MutationCtx, variantId: Id<"variants">) {
  const variant = await ctx.db.get(variantId);
  if (!variant) {
    return { sku: String(variantId), styleName: "Unknown", size: "", color: "" };
  }
  const style = await ctx.db.get(variant.styleId);
  return {
    sku: variant.sku,
    styleName: style?.name ?? "Unknown",
    size: variant.size,
    color: variant.color,
  };
}

// ─── Upload URL (for the PO receipt photo) ─────────────────────────────────────

export const generateReceiptUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, WAREHOUSE_ROLES);
    return await ctx.storage.generateUploadUrl();
  },
});

// ─── Variant search (declared allocation builder) ──────────────────────────────

export const searchVariants = query({
  args: { search: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, WAREHOUSE_ROLES);
    const term = args.search.trim().toLowerCase();
    if (term.length < 2) return [];

    const variants = await ctx.db.query("variants").take(2000);
    const matches: Array<{
      variantId: Id<"variants">;
      sku: string;
      styleName: string;
      size: string;
      color: string;
    }> = [];

    for (const variant of variants) {
      if (!variant.isActive) continue;
      const skuMatch = variant.sku.toLowerCase().includes(term);
      const barcodeMatch = variant.barcode?.toLowerCase().includes(term);
      if (!skuMatch && !barcodeMatch) continue;
      const label = await variantLabel(ctx, variant._id);
      matches.push({ variantId: variant._id, ...label });
      if (matches.length >= 15) break;
    }
    return matches;
  },
});

// ─── Create receipt ────────────────────────────────────────────────────────────

export const createReceipt = mutation({
  args: {
    supplierId: v.id("suppliers"),
    poNumber: v.string(),
    deliveryWindowStart: v.number(),
    deliveryWindowEnd: v.number(),
    receiptPhotoStorageId: v.optional(v.id("_storage")),
    notes: v.optional(v.string()),
    items: v.array(
      v.object({
        variantId: v.id("variants"),
        declaredQuantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, WAREHOUSE_ROLES);

    const poNumber = args.poNumber.trim();
    if (!poNumber) {
      throw new ConvexError({ code: "INVALID_ARGUMENT", message: "PO number is required." });
    }
    if (args.deliveryWindowEnd < args.deliveryWindowStart) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Delivery end date must be on or after the start date.",
      });
    }
    if (args.items.length === 0) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Add at least one declared allocation line.",
      });
    }

    const supplier = await ctx.db.get(args.supplierId);
    if (!supplier) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Supplier not found." });
    }

    const branchId = await resolveWarehouseBranch(ctx, user);
    const now = Date.now();

    const receiptId = await ctx.db.insert("supplierReceipts", {
      supplierId: args.supplierId,
      branchId,
      poNumber,
      receiptPhotoStorageId: args.receiptPhotoStorageId,
      deliveryWindowStart: args.deliveryWindowStart,
      deliveryWindowEnd: args.deliveryWindowEnd,
      status: "pending",
      notes: args.notes?.trim() || undefined,
      createdById: user._id,
      createdAt: now,
      updatedAt: now,
    });

    // Merge duplicate SKUs in the declared allocation
    const declaredByVariant = new Map<string, number>();
    for (const item of args.items) {
      if (!Number.isInteger(item.declaredQuantity) || item.declaredQuantity < 0) {
        throw new ConvexError({
          code: "INVALID_ARGUMENT",
          message: "Declared quantities must be non-negative whole numbers.",
        });
      }
      const key = item.variantId as string;
      declaredByVariant.set(key, (declaredByVariant.get(key) ?? 0) + item.declaredQuantity);
    }

    for (const [variantId, declaredQuantity] of declaredByVariant) {
      await ctx.db.insert("supplierReceiptItems", {
        receiptId,
        variantId: variantId as Id<"variants">,
        declaredQuantity,
        receivedQuantity: 0,
      });
    }

    return receiptId;
  },
});

// ─── List receipts ───────────────────────────────────────────────────────────

export const listReceipts = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, WAREHOUSE_ROLES);

    const receipts = await ctx.db
      .query("supplierReceipts")
      .withIndex("by_createdAt")
      .order("desc")
      .take(200);

    return await Promise.all(
      receipts.map(async (r) => {
        const supplier = await ctx.db.get(r.supplierId);
        const items = await ctx.db
          .query("supplierReceiptItems")
          .withIndex("by_receipt", (q) => q.eq("receiptId", r._id))
          .collect();
        const declaredTotal = items.reduce((s, i) => s + i.declaredQuantity, 0);
        const receivedTotal = items.reduce((s, i) => s + i.receivedQuantity, 0);
        return {
          _id: r._id,
          poNumber: r.poNumber,
          supplierName: supplier?.name ?? "Unknown",
          deliveryWindowStart: r.deliveryWindowStart,
          deliveryWindowEnd: r.deliveryWindowEnd,
          status: r.status,
          lineCount: items.length,
          declaredTotal,
          receivedTotal,
          createdAt: r.createdAt,
        };
      })
    );
  },
});

// ─── Get one receipt (detail view) ─────────────────────────────────────────────

export const getReceipt = query({
  args: { receiptId: v.id("supplierReceipts") },
  handler: async (ctx, args) => {
    await requireRole(ctx, WAREHOUSE_ROLES);

    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt) return null;

    const supplier = await ctx.db.get(receipt.supplierId);
    const items = await ctx.db
      .query("supplierReceiptItems")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
      .collect();

    const enriched = await Promise.all(
      items.map(async (i) => {
        const label = await variantLabel(ctx, i.variantId);
        return {
          _id: i._id,
          variantId: i.variantId,
          ...label,
          declaredQuantity: i.declaredQuantity,
          receivedQuantity: i.receivedQuantity,
          isUnexpected: i.isUnexpected ?? false,
          discrepancy: i.receivedQuantity - i.declaredQuantity,
        };
      })
    );

    return {
      _id: receipt._id,
      poNumber: receipt.poNumber,
      supplierName: supplier?.name ?? "Unknown",
      supplierAddress: supplier?.address ?? "",
      deliveryWindowStart: receipt.deliveryWindowStart,
      deliveryWindowEnd: receipt.deliveryWindowEnd,
      status: receipt.status,
      notes: receipt.notes ?? null,
      photoUrl: receipt.receiptPhotoStorageId
        ? await ctx.storage.getUrl(receipt.receiptPhotoStorageId)
        : null,
      completedAt: receipt.completedAt ?? null,
      createdAt: receipt.createdAt,
      items: enriched,
    };
  },
});

// ─── Scan an item (each scan = +1 received) ────────────────────────────────────

export const scanItem = mutation({
  args: {
    receiptId: v.id("supplierReceipts"),
    barcode: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, WAREHOUSE_ROLES);

    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Receipt not found." });
    }
    if (receipt.status === "completed" || receipt.status === "discrepancy") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "This receipt is already completed.",
      });
    }

    const variant = await findVariantByCode(ctx, args.barcode.trim());
    if (!variant) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: `No product found for barcode/SKU "${args.barcode}".`,
      });
    }

    const items = await ctx.db
      .query("supplierReceiptItems")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
      .collect();

    const now = Date.now();
    const existingLine = items.find((i) => i.variantId === variant._id);
    let unexpected = false;
    let receivedQuantity: number;
    let declaredQuantity: number;

    if (existingLine) {
      receivedQuantity = existingLine.receivedQuantity + 1;
      declaredQuantity = existingLine.declaredQuantity;
      await ctx.db.patch(existingLine._id, { receivedQuantity });
    } else {
      // Not in the declared allocation — add as an unexpected line (declared = 0)
      unexpected = true;
      receivedQuantity = 1;
      declaredQuantity = 0;
      await ctx.db.insert("supplierReceiptItems", {
        receiptId: args.receiptId,
        variantId: variant._id,
        declaredQuantity: 0,
        receivedQuantity: 1,
        isUnexpected: true,
      });
    }

    if (receipt.status === "pending") {
      await ctx.db.patch(args.receiptId, { status: "receiving", updatedAt: now });
    }

    const style = await ctx.db.get(variant.styleId);
    return {
      sku: variant.sku,
      styleName: style?.name ?? "Unknown",
      size: variant.size,
      color: variant.color,
      receivedQuantity,
      declaredQuantity,
      unexpected,
    };
  },
});

// ─── Manual quantity adjustment ────────────────────────────────────────────────

export const setReceivedQuantity = mutation({
  args: {
    itemId: v.id("supplierReceiptItems"),
    receivedQuantity: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, WAREHOUSE_ROLES);

    if (!Number.isInteger(args.receivedQuantity) || args.receivedQuantity < 0) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Received quantity must be a non-negative whole number.",
      });
    }

    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Line not found." });
    }
    const receipt = await ctx.db.get(item.receiptId);
    if (!receipt || receipt.status === "completed" || receipt.status === "discrepancy") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "This receipt is already completed.",
      });
    }

    await ctx.db.patch(args.itemId, { receivedQuantity: args.receivedQuantity });
  },
});

// ─── Complete receipt (add stock, flag + report discrepancy) ───────────────────

export const completeReceipt = mutation({
  args: { receiptId: v.id("supplierReceipts") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, WAREHOUSE_ROLES);

    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Receipt not found." });
    }
    if (receipt.status === "completed" || receipt.status === "discrepancy") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "This receipt is already completed.",
      });
    }

    const items = await ctx.db
      .query("supplierReceiptItems")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
      .collect();

    const now = Date.now();
    const discrepancies: Array<{ sku: string; declared: number; received: number }> = [];

    for (const item of items) {
      // Add actual received to warehouse inventory + a supplier batch
      if (item.receivedQuantity > 0) {
        const existing = await ctx.db
          .query("inventory")
          .withIndex("by_branch_variant", (q) =>
            q.eq("branchId", receipt.branchId).eq("variantId", item.variantId)
          )
          .unique();

        if (existing) {
          await ctx.db.patch(existing._id, {
            quantity: existing.quantity + item.receivedQuantity,
            arrivedAt: now,
            updatedAt: now,
          });
        } else {
          await ctx.db.insert("inventory", {
            branchId: receipt.branchId,
            variantId: item.variantId,
            quantity: item.receivedQuantity,
            arrivedAt: now,
            updatedAt: now,
          });
        }

        const variant = await ctx.db.get(item.variantId);
        await ctx.db.insert("inventoryBatches", {
          branchId: receipt.branchId,
          variantId: item.variantId,
          quantity: item.receivedQuantity,
          costPriceCentavos:
            variant?.costPriceCentavos ?? variant?.priceCentavos ?? 0,
          receivedAt: now,
          source: "supplier",
          sourceId: args.receiptId as string,
          createdAt: now,
        });
      }

      if (item.receivedQuantity !== item.declaredQuantity) {
        const label = await variantLabel(ctx, item.variantId);
        discrepancies.push({
          sku: label.sku,
          declared: item.declaredQuantity,
          received: item.receivedQuantity,
        });
      }
    }

    const hasDiscrepancy = discrepancies.length > 0;

    await ctx.db.patch(args.receiptId, {
      status: hasDiscrepancy ? "discrepancy" : "completed",
      completedAt: now,
      completedById: user._id,
      updatedAt: now,
    });

    // Report discrepancy to warehouse admins (admin + hqStaff)
    if (hasDiscrepancy) {
      const supplier = await ctx.db.get(receipt.supplierId);
      const admins = [
        ...(await ctx.db
          .query("users")
          .withIndex("by_role", (q) => q.eq("role", "admin"))
          .collect()),
        ...(await ctx.db
          .query("users")
          .withIndex("by_role", (q) => q.eq("role", "hqStaff"))
          .collect()),
      ].filter((u) => u.isActive);

      const summary = discrepancies
        .slice(0, 5)
        .map((d) => `${d.sku}: declared ${d.declared}, got ${d.received}`)
        .join("; ");
      const more =
        discrepancies.length > 5 ? ` (+${discrepancies.length - 5} more)` : "";

      for (const admin of admins) {
        await ctx.db.insert("staffNotifications", {
          userId: admin._id,
          type: "supply_discrepancy",
          title: `Receiving discrepancy — PO ${receipt.poNumber}`,
          body: `${supplier?.name ?? "Supplier"}: ${summary}${more}`,
          supplierReceiptId: args.receiptId,
          isRead: false,
          createdAt: now,
        });
      }
    }

    return { hasDiscrepancy, discrepancyCount: discrepancies.length };
  },
});

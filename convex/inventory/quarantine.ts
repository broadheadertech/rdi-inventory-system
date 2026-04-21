import { v, ConvexError } from "convex/values";
import { query, mutation } from "../_generated/server";
import { withBranchScope } from "../_helpers/withBranchScope";
import { requireRole, WAREHOUSE_ROLES, BRANCH_MANAGEMENT_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

const QUARANTINE_ROLES = [...WAREHOUSE_ROLES, ...BRANCH_MANAGEMENT_ROLES] as const;
const QUARANTINE_ALLOWED_ROLES = ["admin", "manager", "warehouseStaff"] as const;

// ─── Get Quarantined Items ────────────────────────────────────────────────

export const getQuarantinedItems = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(QUARANTINE_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const limit = args.limit ?? 100;

    // Get all inventory items, filter to those with quarantined stock
    const allItems = scope.canAccessAllBranches
      ? await ctx.db.query("inventory").collect()
      : await ctx.db
          .query("inventory")
          .withIndex("by_branch", (q) => q.eq("branchId", scope.branchId!))
          .collect();
    const quarantined = allItems.filter(
      (item) => (item.quarantinedQuantity ?? 0) > 0
    );

    // Sort by quarantinedQuantity descending
    quarantined.sort(
      (a, b) => (b.quarantinedQuantity ?? 0) - (a.quarantinedQuantity ?? 0)
    );

    // Cursor-based pagination
    let filtered = quarantined;
    if (args.cursor) {
      filtered = quarantined.filter((i) => i.updatedAt < args.cursor!);
    }

    const page = filtered.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const items = page.slice(0, limit);

    // Enrich with variant/style/branch/brand details
    const enriched = await Promise.all(
      items.map(async (item) => {
        const variant = await ctx.db.get(item.variantId);
        const style = variant ? await ctx.db.get(variant.styleId) : null;
        const category = style && style.categoryId ? await ctx.db.get(style.categoryId) : null;
        const brand = style?.brandId
          ? await ctx.db.get(style.brandId)
          : category ? await ctx.db.get(category.brandId) : null;
        const branch = await ctx.db.get(item.branchId);

        return {
          _id: item._id,
          inventoryId: item._id,
          branchId: item.branchId,
          branchName: branch?.name ?? "Unknown",
          variantId: item.variantId,
          styleName: style?.name ?? "Unknown",
          brandName: brand?.name ?? "Unknown",
          sku: variant?.sku ?? "",
          size: variant?.size ?? "",
          color: variant?.color ?? "",
          availableQuantity: item.quantity,
          quarantinedQuantity: item.quarantinedQuantity ?? 0,
          updatedAt: item.updatedAt,
        };
      })
    );

    return {
      items: enriched,
      hasMore,
      nextCursor: hasMore
        ? items[items.length - 1]?.updatedAt
        : undefined,
    };
  },
});

// ─── Quarantine Stock ─────────────────────────────────────────────────────

export const quarantineStock = mutation({
  args: {
    inventoryId: v.id("inventory"),
    quantity: v.number(),
    reason: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(QUARANTINE_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const item = await ctx.db.get(args.inventoryId);
    if (!item) throw new ConvexError({ code: "NOT_FOUND", message: "Inventory item not found" });

    if (!scope.canAccessAllBranches && item.branchId !== scope.branchId) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    if (args.quantity <= 0 || !Number.isInteger(args.quantity)) {
      throw new ConvexError({ code: "INVALID", message: "Quantity must be a positive integer" });
    }

    if (args.quantity > item.quantity) {
      throw new ConvexError({ code: "INVALID", message: "Cannot quarantine more than available stock" });
    }

    const now = Date.now();
    const before = { quantity: item.quantity, quarantinedQuantity: item.quarantinedQuantity ?? 0 };

    await ctx.db.patch(args.inventoryId, {
      quantity: item.quantity - args.quantity,
      quarantinedQuantity: (item.quarantinedQuantity ?? 0) + args.quantity,
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "quarantine_stock",
      userId: scope.user._id,
      branchId: item.branchId,
      entityType: "inventory",
      entityId: args.inventoryId,
      before,
      after: {
        quantity: item.quantity - args.quantity,
        quarantinedQuantity: (item.quarantinedQuantity ?? 0) + args.quantity,
        reason: args.reason,
        notes: args.notes,
      },
    });

    return { success: true };
  },
});

// ─── Release from Quarantine ──────────────────────────────────────────────

export const releaseFromQuarantine = mutation({
  args: {
    variantId: v.id("variants"),
    branchId: v.id("branches"),
    quantity: v.number(),
    action: v.union(v.literal("returnToStock"), v.literal("writeOff")),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["admin", "manager"] as const);

    const inventoryRecord = await ctx.db
      .query("inventory")
      .withIndex("by_branch_variant", (q) =>
        q.eq("branchId", args.branchId).eq("variantId", args.variantId)
      )
      .unique();

    if (!inventoryRecord) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Inventory record not found" });
    }

    const quarantined = inventoryRecord.quarantinedQuantity ?? 0;
    if (args.quantity <= 0 || args.quantity > quarantined) {
      throw new ConvexError({ code: "INVALID", message: "Invalid release quantity" });
    }

    const now = Date.now();

    if (args.action === "returnToStock") {
      await ctx.db.patch(inventoryRecord._id, {
        quantity: inventoryRecord.quantity + args.quantity,
        quarantinedQuantity: quarantined - args.quantity,
        updatedAt: now,
      });
    } else {
      // writeOff — item is gone, just decrease quarantined
      await ctx.db.patch(inventoryRecord._id, {
        quarantinedQuantity: quarantined - args.quantity,
        updatedAt: now,
      });
    }

    await _logAuditEntry(ctx, {
      action: args.action === "returnToStock" ? "release_quarantine" : "write_off_quarantine",
      userId: user._id,
      branchId: args.branchId,
      entityType: "inventory",
      entityId: inventoryRecord._id.toString(),
      before: { quarantinedQuantity: quarantined },
      after: { quarantinedQuantity: quarantined - args.quantity, action: args.action },
    });

    return { success: true };
  },
});

// ─── Write Off Quarantined Stock ──────────────────────────────────────────

export const writeOffQuarantine = mutation({
  args: {
    inventoryId: v.id("inventory"),
    quantity: v.number(),
    reason: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(QUARANTINE_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const item = await ctx.db.get(args.inventoryId);
    if (!item) throw new ConvexError({ code: "NOT_FOUND", message: "Inventory item not found" });

    if (!scope.canAccessAllBranches && item.branchId !== scope.branchId) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const quarantined = item.quarantinedQuantity ?? 0;
    if (args.quantity <= 0 || args.quantity > quarantined) {
      throw new ConvexError({ code: "INVALID", message: "Invalid write-off quantity" });
    }

    const now = Date.now();
    await ctx.db.patch(args.inventoryId, {
      quarantinedQuantity: quarantined - args.quantity,
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "write_off_quarantine",
      userId: scope.user._id,
      branchId: item.branchId,
      entityType: "inventory",
      entityId: args.inventoryId,
      before: { quarantinedQuantity: quarantined },
      after: { quarantinedQuantity: quarantined - args.quantity, reason: args.reason, notes: args.notes },
    });

    return { success: true };
  },
});

// ─── Get Branch Inventory for Quarantine Selection ────────────────────────

export const getBranchInventoryForQuarantine = query({
  args: {
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(QUARANTINE_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const allItems = scope.canAccessAllBranches
      ? await ctx.db.query("inventory").collect()
      : await ctx.db
          .query("inventory")
          .withIndex("by_branch", (q) => q.eq("branchId", scope.branchId!))
          .collect();
    const withStock = allItems.filter((item) => item.quantity > 0);

    const enriched = await Promise.all(
      withStock.map(async (item) => {
        const variant = await ctx.db.get(item.variantId);
        const style = variant ? await ctx.db.get(variant.styleId) : null;
        return {
          _id: item._id,
          styleName: style?.name ?? "Unknown",
          sku: variant?.sku ?? "",
          size: variant?.size ?? "",
          color: variant?.color ?? "",
          availableQuantity: item.quantity,
        };
      })
    );

    // Client-side search filter
    if (args.search) {
      const s = args.search.toLowerCase();
      return enriched.filter(
        (i) =>
          i.styleName.toLowerCase().includes(s) ||
          i.sku.toLowerCase().includes(s) ||
          i.color.toLowerCase().includes(s)
      );
    }

    return enriched.slice(0, 50);
  },
});

// ─── Quarantine Item (spec) ───────────────────────────────────────────────

export const quarantineItem = mutation({
  args: {
    variantId: v.id("variants"),
    branchId: v.id("branches"),
    quantity: v.number(),
    reason: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, QUARANTINE_ALLOWED_ROLES);

    const inventoryRecord = await ctx.db
      .query("inventory")
      .withIndex("by_branch_variant", (q) =>
        q.eq("branchId", args.branchId).eq("variantId", args.variantId)
      )
      .unique();

    if (!inventoryRecord) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Inventory record not found" });
    }

    if (args.quantity <= 0) {
      throw new ConvexError({ code: "INVALID", message: "Quantity must be positive" });
    }

    if (args.quantity > inventoryRecord.quantity) {
      throw new ConvexError({
        code: "INVALID",
        message: "Cannot quarantine more than available stock",
      });
    }

    const now = Date.now();
    await ctx.db.patch(inventoryRecord._id, {
      quantity: inventoryRecord.quantity - args.quantity,
      quarantinedQuantity: (inventoryRecord.quarantinedQuantity ?? 0) + args.quantity,
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "quarantine_item",
      userId: user._id,
      branchId: args.branchId,
      entityType: "inventory",
      entityId: inventoryRecord._id.toString(),
      after: {
        variantId: args.variantId,
        quantity: args.quantity,
        reason: args.reason,
        ...(args.notes ? { notes: args.notes } : {}),
      },
    });

    return { success: true };
  },
});

// ─── Unquarantine Item (spec) ─────────────────────────────────────────────

export const unquarantineItem = mutation({
  args: {
    variantId: v.id("variants"),
    branchId: v.id("branches"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, QUARANTINE_ALLOWED_ROLES);

    const inventoryRecord = await ctx.db
      .query("inventory")
      .withIndex("by_branch_variant", (q) =>
        q.eq("branchId", args.branchId).eq("variantId", args.variantId)
      )
      .unique();

    if (!inventoryRecord) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Inventory record not found" });
    }

    const quarantined = inventoryRecord.quarantinedQuantity ?? 0;

    if (args.quantity <= 0) {
      throw new ConvexError({ code: "INVALID", message: "Quantity must be positive" });
    }

    if (args.quantity > quarantined) {
      throw new ConvexError({
        code: "INVALID",
        message: "Cannot unquarantine more than quarantined stock",
      });
    }

    const now = Date.now();
    await ctx.db.patch(inventoryRecord._id, {
      quantity: inventoryRecord.quantity + args.quantity,
      quarantinedQuantity: quarantined - args.quantity,
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "unquarantine_item",
      userId: user._id,
      branchId: args.branchId,
      entityType: "inventory",
      entityId: inventoryRecord._id.toString(),
      after: {
        variantId: args.variantId,
        quantity: args.quantity,
      },
    });

    return { success: true };
  },
});

// ─── Lookup Variant by SKU ────────────────────────────────────────────────

export const lookupBySku = query({
  args: { sku: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["admin", "manager", "warehouseStaff", "cashier"]);
    const variant = await ctx.db
      .query("variants")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .first();
    if (!variant) return null;
    const style = await ctx.db.get(variant.styleId);
    return {
      variantId: variant._id,
      styleName: style?.name ?? "",
      size: variant.size,
      color: variant.color,
    };
  },
});

// convex/inventory/stockLevels.ts — Real-time branch stock query

import { query, mutation, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { withBranchScope } from "../_helpers/withBranchScope";
import { requireRole, ADMIN_ROLES, BRANCH_VIEW_ROLES } from "../_helpers/permissions";
import { GARMENT_SIZE_ORDER } from "../_helpers/constants";
import { _logAuditEntry } from "../_helpers/auditLog";

export const getBranchStock = query({
  args: {
    searchText: v.optional(v.string()),
    brandId: v.optional(v.id("brands")),
    categoryId: v.optional(v.id("categories")),
  },
  handler: async (ctx, args) => {
    // 1. Enforce branch isolation — throws UNAUTHORIZED if not authenticated
    const scope = await withBranchScope(ctx);

    // 2. Verify role — only branch view roles may access stock levels
    if (!(BRANCH_VIEW_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const branchId = scope.branchId;

    // 3. Guard — HQ multi-branch view is Story 5.2+
    if (branchId === null) {
      return [];
    }

    // 4. Load all inventory for this branch using the by_branch index
    const inventoryItems = await ctx.db
      .query("inventory")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();

    // 5. Resolve variants → styles → categories → brands — server-side join
    // Schema chain: inventory.variantId → variants.styleId → styles.categoryId → categories.brandId → brands
    const results = await Promise.all(
      inventoryItems.map(async (inv) => {
        // Load variant; skip if missing or inactive
        const variant = await ctx.db.get(inv.variantId);
        if (!variant || !variant.isActive) return null;

        // Load style; skip if missing or inactive
        const style = await ctx.db.get(variant.styleId);
        if (!style || !style.isActive) return null;

        // Load category (has brandId); skip if missing or inactive
        const category = style.categoryId ? await ctx.db.get(style.categoryId) : null;
        if ((!category || !category.isActive) && !style.brandId) return null;

        // M1: Apply brandId filter BEFORE loading brand — avoids wasted db read on filtered-out items
        const resolvedBrandId = style.brandId ?? category?.brandId;
        if (args.brandId && resolvedBrandId !== args.brandId) return null;

        // Apply categoryId filter if provided
        if (args.categoryId && style.categoryId !== args.categoryId) return null;

        // M3: Apply searchText filter — truncate to 200 chars to prevent oversized processing
        if (args.searchText) {
          const needle = args.searchText.slice(0, 200).toLowerCase();
          const matchesName = style.name.toLowerCase().includes(needle);
          const matchesSku = variant.sku.toLowerCase().includes(needle);
          if (!matchesName && !matchesSku) return null;
        }

        // Load brand only for items that pass all filters
        const brand = resolvedBrandId ? await ctx.db.get(resolvedBrandId) : null;

        return {
          inventoryId: inv._id,
          variantId: variant._id,
          styleId: style._id,
          styleName: style.name,
          brandId: resolvedBrandId,
          brandName: brand?.name ?? "Unknown",
          categoryId: style.categoryId,
          categoryName: category?.name ?? "",
          size: variant.size,
          color: variant.color,
          gender: variant.gender ?? null,
          sku: variant.sku,
          priceCentavos: variant.priceCentavos,
          quantity: inv.quantity,
          lowStockThreshold: inv.lowStockThreshold ?? 5,
          updatedAt: inv.updatedAt,
        };
      })
    );

    // Filter out nulls (inactive/filtered items) and sort by style name ascending
    return results
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.styleName.localeCompare(b.styleName));
  },
});

// Cross-branch stock lookup — returns all branches' stock for a given style
// Used by POS cashiers to check other branches when local stock is unavailable
export const getAllBranchStockForStyle = query({
  args: {
    styleId: v.id("styles"),
  },
  handler: async (ctx, args) => {
    // Auth: any authenticated user may view cross-branch stock (cashier, manager, viewer, hqStaff, admin)
    // withBranchScope throws UNAUTHORIZED for unauthenticated users — no role restriction needed
    await withBranchScope(ctx);

    // 1. Get all active variants for this style using by_style index
    const allVariants = await ctx.db
      .query("variants")
      .withIndex("by_style", (q) => q.eq("styleId", args.styleId))
      .collect();

    const activeVariants = allVariants.filter((variant) => variant.isActive);

    if (activeVariants.length === 0) return [];

    // 2. For each active variant, get all inventory records across all branches
    // Group by branchId using a Map — JavaScript Map is safe with Convex IDs (branded strings)
    const inventoryByBranch = new Map<
      Id<"branches">,
      {
        variants: Array<{
          variantId: Id<"variants">;
          size: string;
          color: string;
          quantity: number;
          lowStockThreshold: number;
        }>;
      }
    >();

    // Promise.all is safe here: Map operations are synchronous, no race conditions in JS single-thread model
    await Promise.all(
      activeVariants.map(async (variant) => {
        const inventoryRows = await ctx.db
          .query("inventory")
          .withIndex("by_variant", (q) => q.eq("variantId", variant._id))
          .collect();

        for (const inv of inventoryRows) {
          if (!inventoryByBranch.has(inv.branchId)) {
            inventoryByBranch.set(inv.branchId, { variants: [] });
          }
          inventoryByBranch.get(inv.branchId)!.variants.push({
            variantId: variant._id,
            size: variant.size,
            color: variant.color,
            quantity: inv.quantity,
            lowStockThreshold: inv.lowStockThreshold ?? 5,
          });
        }
      })
    );

    // 3. Resolve branch names and return sorted by branchName
    // M1: Filter inactive/closed branches — don't show closed branches in POS lookup
    // M2: Sort variants by garment size order (XS, S, M, L, XL, XXL) not alphabetical
    const rawResults = await Promise.all(
      Array.from(inventoryByBranch.entries()).map(
        async ([branchId, { variants }]) => {
          const branch = await ctx.db.get(branchId);
          if (!branch?.isActive) return null; // M1: skip inactive/closed branches
          return {
            branchId,
            branchName: branch.name,
            variants: variants.sort((a, b) => {
              const ai = GARMENT_SIZE_ORDER[a.size.toUpperCase()] ?? 99;
              const bi = GARMENT_SIZE_ORDER[b.size.toUpperCase()] ?? 99;
              return ai !== bi ? ai - bi : a.size.localeCompare(b.size);
            }),
          };
        }
      )
    );

    return rawResults
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.branchName.localeCompare(b.branchName));
  },
});

// ─── Admin: All-Branch Inventory View ────────────────────────────────────────

export const getAllInventory = query({
  args: {
    searchText: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);

    // Load inventory — optionally filtered by branch
    let inventoryItems;
    if (args.branchId) {
      inventoryItems = await ctx.db
        .query("inventory")
        .withIndex("by_branch", (q) => q.eq("branchId", args.branchId!))
        .collect();
    } else {
      inventoryItems = await ctx.db.query("inventory").collect();
    }

    const results = await Promise.all(
      inventoryItems.map(async (inv) => {
        const variant = await ctx.db.get(inv.variantId);
        if (!variant || !variant.isActive) return null;

        const style = await ctx.db.get(variant.styleId);
        if (!style || !style.isActive) return null;

        const category = style.categoryId ? await ctx.db.get(style.categoryId) : null;
        if ((!category || !category.isActive) && !style.brandId) return null;

        if (args.searchText) {
          const needle = args.searchText.slice(0, 200).toLowerCase();
          const matchesName = style.name.toLowerCase().includes(needle);
          const matchesSku = variant.sku.toLowerCase().includes(needle);
          if (!matchesName && !matchesSku) return null;
        }

        const brand = style.brandId
          ? await ctx.db.get(style.brandId)
          : category ? await ctx.db.get(category.brandId) : null;
        const branch = await ctx.db.get(inv.branchId);

        return {
          inventoryId: inv._id,
          branchId: inv.branchId,
          branchName: branch?.name ?? "Unknown",
          variantId: variant._id,
          styleId: style._id,
          styleName: style.name,
          brandName: brand?.name ?? "Unknown",
          categoryName: category?.name ?? "",
          size: variant.size,
          color: variant.color,
          sku: variant.sku,
          priceCentavos: variant.priceCentavos,
          quantity: inv.quantity,
          lowStockThreshold: inv.lowStockThreshold ?? 5,
          updatedAt: inv.updatedAt,
        };
      })
    );

    return results
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.branchName.localeCompare(b.branchName) || a.styleName.localeCompare(b.styleName));
  },
});

// ─── Admin: Variant Search (for restock) ─────────────────────────────────────

export const searchVariants = query({
  args: { searchText: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);

    const needle = args.searchText.slice(0, 200).toLowerCase();
    if (!needle) return [];

    const allVariants = await ctx.db.query("variants").collect();

    const results = await Promise.all(
      allVariants
        .filter((v) => v.isActive)
        .map(async (variant) => {
          const matchesSku = variant.sku.toLowerCase().includes(needle);

          const style = await ctx.db.get(variant.styleId);
          const matchesName = style?.name.toLowerCase().includes(needle) ?? false;

          if (!matchesSku && !matchesName) return null;
          if (!style || !style.isActive) return null;

          return {
            variantId: variant._id,
            sku: variant.sku,
            size: variant.size,
            color: variant.color,
            styleName: style.name,
            priceCentavos: variant.priceCentavos,
            costPriceCentavos: variant.costPriceCentavos ?? 0,
          };
        })
    );

    return results
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .slice(0, 20);
  },
});

// ─── Branch: Search variants with stock (for transfers) ─────────────────────

export const searchBranchInventory = query({
  args: {
    searchText: v.string(),
    branchId: v.id("branches"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [...ADMIN_ROLES, ...BRANCH_VIEW_ROLES]);

    const needle = args.searchText.slice(0, 200).toLowerCase();
    if (!needle) return [];

    // Get all inventory for this branch
    const branchInventory = await ctx.db
      .query("inventory")
      .withIndex("by_branch", (q) => q.eq("branchId", args.branchId))
      .collect();

    // Build a map of variantId → stock quantity
    const stockMap = new Map<string, number>();
    for (const inv of branchInventory) {
      if (inv.quantity > 0) {
        stockMap.set(inv.variantId, inv.quantity);
      }
    }

    // Search variants that have stock at this branch
    const results = await Promise.all(
      Array.from(stockMap.entries()).map(async ([variantId, quantity]) => {
        const variant = await ctx.db.get(variantId as Id<"variants">);
        if (!variant || !variant.isActive) return null;

        const style = await ctx.db.get(variant.styleId);
        if (!style || !style.isActive) return null;

        const matchesSku = variant.sku.toLowerCase().includes(needle);
        const matchesName = style.name.toLowerCase().includes(needle);
        if (!matchesSku && !matchesName) return null;

        return {
          variantId: variant._id,
          sku: variant.sku,
          size: variant.size,
          color: variant.color,
          styleName: style.name,
          availableQty: quantity,
        };
      })
    );

    return results
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .slice(0, 20);
  },
});

// ─── Admin: Bulk Restock ─────────────────────────────────────────────────────

export const bulkRestock = mutation({
  args: {
    branchId: v.id("branches"),
    items: v.array(
      v.object({
        variantId: v.id("variants"),
        quantity: v.number(),
        costPriceCentavos: v.optional(v.number()),
      })
    ),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);

    if (args.items.length === 0) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "No items provided" });
    }

    const branch = await ctx.db.get(args.branchId);
    if (!branch) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Branch not found" });
    }

    let created = 0;
    let updated = 0;

    const now = Date.now();

    for (const item of args.items) {
      if (item.quantity <= 0) continue;

      // Look up variant for cost price (per-item override takes precedence)
      const variant = await ctx.db.get(item.variantId);
      const costPrice = item.costPriceCentavos ?? variant?.costPriceCentavos ?? variant?.priceCentavos ?? 0;

      const existing = await ctx.db
        .query("inventory")
        .withIndex("by_branch_variant", (q) =>
          q.eq("branchId", args.branchId).eq("variantId", item.variantId)
        )
        .unique();

      if (existing) {
        const oldQty = existing.quantity;
        const newQty = oldQty + item.quantity;
        await ctx.db.patch(existing._id, {
          quantity: newQty,
          updatedAt: now,
        });

        await ctx.scheduler.runAfter(0, internal.inventory.alerts.checkInventoryAlert, {
          inventoryId: existing._id,
        });

        await _logAuditEntry(ctx, {
          action: "inventory.restock",
          userId: user._id,
          branchId: args.branchId,
          entityType: "inventory",
          entityId: existing._id,
          before: { quantity: oldQty },
          after: { quantity: newQty, reason: args.reason },
        });
        updated++;
      } else {
        const newId = await ctx.db.insert("inventory", {
          branchId: args.branchId,
          variantId: item.variantId,
          quantity: item.quantity,
          lowStockThreshold: 5,
          updatedAt: now,
        });

        await _logAuditEntry(ctx, {
          action: "inventory.restock",
          userId: user._id,
          branchId: args.branchId,
          entityType: "inventory",
          entityId: newId,
          before: { quantity: 0 },
          after: { quantity: item.quantity, reason: args.reason },
        });
        created++;
      }

      // Create FIFO batch record
      await ctx.db.insert("inventoryBatches", {
        branchId: args.branchId,
        variantId: item.variantId,
        quantity: item.quantity,
        costPriceCentavos: costPrice,
        receivedAt: now,
        source: "supplier",
        notes: args.reason,
        createdAt: now,
      });
    }

    return { created, updated, total: created + updated };
  },
});

// ─── Admin: Stock Adjustment ─────────────────────────────────────────────────

export const adjustStock = mutation({
  args: {
    inventoryId: v.id("inventory"),
    newQuantity: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);

    if (args.newQuantity < 0) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "Quantity cannot be negative" });
    }

    const inv = await ctx.db.get(args.inventoryId);
    if (!inv) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Inventory record not found" });
    }

    const oldQuantity = inv.quantity;
    const now = Date.now();

    await ctx.db.patch(args.inventoryId, {
      quantity: args.newQuantity,
      updatedAt: now,
    });

    // Trigger low-stock alert check
    await ctx.scheduler.runAfter(0, internal.inventory.alerts.checkInventoryAlert, {
      inventoryId: args.inventoryId,
    });

    // FIFO: create adjustment batch if quantity increased
    const diff = args.newQuantity - oldQuantity;
    if (diff > 0) {
      const variant = await ctx.db.get(inv.variantId);
      const costPrice = variant?.costPriceCentavos ?? variant?.priceCentavos ?? 0;

      await ctx.db.insert("inventoryBatches", {
        branchId: inv.branchId,
        variantId: inv.variantId,
        quantity: diff,
        costPriceCentavos: costPrice,
        receivedAt: now,
        source: "adjustment",
        notes: args.reason,
        createdAt: now,
      });
    }

    await _logAuditEntry(ctx, {
      action: "inventory.adjust",
      userId: user._id,
      branchId: inv.branchId,
      entityType: "inventory",
      entityId: args.inventoryId,
      before: { quantity: oldQuantity },
      after: { quantity: args.newQuantity, reason: args.reason },
    });

    return { oldQuantity, newQuantity: args.newQuantity };
  },
});

// ─── Seed Helper ─────────────────────────────────────────────────────────────

export const _seedInventoryBatch = internalMutation({
  args: {
    items: v.array(
      v.object({
        branchId: v.id("branches"),
        variantId: v.id("variants"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let created = 0;
    let skipped = 0;
    for (const item of args.items) {
      const existing = await ctx.db
        .query("inventory")
        .withIndex("by_branch_variant", (q) =>
          q.eq("branchId", item.branchId).eq("variantId", item.variantId)
        )
        .unique();

      if (existing) {
        skipped++;
        continue;
      }

      await ctx.db.insert("inventory", {
        branchId: item.branchId,
        variantId: item.variantId,
        quantity: item.quantity,
        lowStockThreshold: 5,
        updatedAt: Date.now(),
      });
      created++;
    }
    return { created, skipped };
  },
});

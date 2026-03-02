// convex/suppliers/portal.ts — Supplier Portal: demand visibility + stock proposals
//
// Supplier-facing queries (filtered to supplier's assigned brands):
//   - getSupplierDemandSummary: weekly demand summaries
//   - getSupplierBrandStockLevels: current inventory across branches
//   - getSupplierDemandLogs: recent demand log entries
//   - submitProposal: create a stock proposal
//   - getMyProposals: supplier's own proposals
//
// HQ-facing functions (proposal review):
//   - getPendingProposals: all pending proposals
//   - reviewProposal: accept or reject a proposal

import { query, mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { requireRole, SUPPLIER_ROLES, HQ_ROLES } from "../_helpers/permissions";

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Supplier Queries ────────────────────────────────────────────────────────

/** Returns weekly demand summaries for the supplier's assigned brands (last 4 weeks). */
export const getSupplierDemandSummary = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, SUPPLIER_ROLES);
    const supplierBrands = user.assignedBrands ?? [];
    if (supplierBrands.length === 0) return [];

    const fourWeeksAgo = Date.now() - 28 * DAY_MS;

    // Weekly summaries are small — collect recent weeks, filter by brand client-side
    const allSummaries = await ctx.db
      .query("demandWeeklySummaries")
      .withIndex("by_week", (q) => q.gte("weekStart", fourWeeksAgo))
      .collect();

    const brandSummaries = allSummaries.filter((s) =>
      supplierBrands.includes(s.brand)
    );

    // Enrich branch breakdown with branch names
    const branchCache = new Map<string, string>();
    for (const summary of brandSummaries) {
      for (const entry of summary.branchBreakdown) {
        const key = entry.branchId as string;
        if (!branchCache.has(key)) {
          const branch = await ctx.db.get(entry.branchId);
          branchCache.set(key, branch?.name ?? "Unknown");
        }
      }
    }

    return brandSummaries.map((s) => ({
      _id: s._id,
      weekStart: s.weekStart,
      weekLabel: new Date(s.weekStart).toISOString().slice(0, 10),
      brand: s.brand,
      requestCount: s.requestCount,
      topDesigns: s.topDesigns,
      topSizes: s.topSizes,
      branchBreakdown: s.branchBreakdown.map((entry) => ({
        branchId: entry.branchId,
        branchName: branchCache.get(entry.branchId as string) ?? "Unknown",
        count: entry.count,
      })),
    }));
  },
});

/** Returns current inventory levels for the supplier's brand(s) across all branches. */
export const getSupplierBrandStockLevels = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, SUPPLIER_ROLES);
    const supplierBrands = user.assignedBrands ?? [];
    if (supplierBrands.length === 0) return [];

    // Resolve brand IDs
    const allBrands = await ctx.db.query("brands").collect();
    const brandIds = allBrands
      .filter((b) => supplierBrands.includes(b.name) && b.isActive)
      .map((b) => b._id);

    if (brandIds.length === 0) return [];

    // Chain: brands → categories → styles → variants
    const variantMap = new Map<
      string,
      { sku: string; size: string; color: string; styleName: string; brandName: string }
    >();

    for (const brandId of brandIds) {
      const brand = allBrands.find((b) => b._id === brandId);
      const categories = await ctx.db
        .query("categories")
        .withIndex("by_brand", (q) => q.eq("brandId", brandId))
        .collect();

      for (const category of categories) {
        const styles = await ctx.db
          .query("styles")
          .withIndex("by_category", (q) => q.eq("categoryId", category._id))
          .collect();

        for (const style of styles) {
          if (!style.isActive) continue;
          const variants = await ctx.db
            .query("variants")
            .withIndex("by_style", (q) => q.eq("styleId", style._id))
            .take(200);

          for (const variant of variants) {
            if (!variant.isActive) continue;
            variantMap.set(variant._id as string, {
              sku: variant.sku,
              size: variant.size,
              color: variant.color,
              styleName: style.name,
              brandName: brand?.name ?? "Unknown",
            });
          }
        }
      }
    }

    if (variantMap.size === 0) return [];

    // Get inventory for all variants across branches
    const branches = (await ctx.db.query("branches").collect()).filter(
      (b) => b.isActive
    );

    const results: Array<{
      branchId: string;
      branchName: string;
      variantId: string;
      sku: string;
      styleName: string;
      brandName: string;
      size: string;
      color: string;
      quantity: number;
    }> = [];

    for (const branch of branches) {
      const branchInventory = await ctx.db
        .query("inventory")
        .withIndex("by_branch", (q) => q.eq("branchId", branch._id))
        .take(2000);

      for (const inv of branchInventory) {
        const variantInfo = variantMap.get(inv.variantId as string);
        if (variantInfo) {
          results.push({
            branchId: branch._id as string,
            branchName: branch.name,
            variantId: inv.variantId as string,
            sku: variantInfo.sku,
            styleName: variantInfo.styleName,
            brandName: variantInfo.brandName,
            size: variantInfo.size,
            color: variantInfo.color,
            quantity: inv.quantity,
          });
        }
        if (results.length >= 500) break;
      }
      if (results.length >= 500) break;
    }

    return results;
  },
});

/** Returns recent demand log entries for supplier's brand(s). */
export const getSupplierDemandLogs = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, SUPPLIER_ROLES);
    const supplierBrands = user.assignedBrands ?? [];
    if (supplierBrands.length === 0) return [];

    // Get recent demand logs — bounded, then filter by brand
    const recentLogs = await ctx.db
      .query("demandLogs")
      .withIndex("by_date")
      .order("desc")
      .take(500);

    const filtered = recentLogs
      .filter((log) => supplierBrands.includes(log.brand))
      .slice(0, 100);

    // Enrich with branch names
    const branchCache = new Map<string, string>();
    for (const log of filtered) {
      const key = log.branchId as string;
      if (!branchCache.has(key)) {
        const branch = await ctx.db.get(log.branchId);
        branchCache.set(key, branch?.name ?? "Unknown");
      }
    }

    return filtered.map((log) => ({
      _id: log._id,
      brand: log.brand,
      design: log.design ?? null,
      size: log.size ?? null,
      notes: log.notes ?? null,
      branchName: branchCache.get(log.branchId as string) ?? "Unknown",
      createdAt: log.createdAt,
    }));
  },
});

// ─── Proposal Mutation ───────────────────────────────────────────────────────

/** Submit a stock proposal for a specific brand. */
export const submitProposal = mutation({
  args: {
    brand: v.string(),
    items: v.array(
      v.object({
        description: v.string(),
        sku: v.optional(v.string()),
        quantity: v.number(),
        unitPriceCentavos: v.number(),
      })
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, SUPPLIER_ROLES);

    // Validate supplier has access to this brand
    const supplierBrands = user.assignedBrands ?? [];
    if (!supplierBrands.includes(args.brand)) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Not authorized for this brand",
      });
    }

    if (args.items.length === 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Proposal must include at least one item",
      });
    }

    for (const item of args.items) {
      if (item.quantity < 1) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Item quantity must be at least 1",
        });
      }
      if (item.unitPriceCentavos < 0) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Unit price cannot be negative",
        });
      }
    }

    const totalCentavos = args.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCentavos,
      0
    );

    const proposalId = await ctx.db.insert("supplierProposals", {
      supplierId: user._id,
      brand: args.brand,
      items: args.items,
      totalCentavos,
      notes: args.notes,
      status: "pending",
      createdAt: Date.now(),
    });

    return proposalId;
  },
});

/** Returns the supplier's own proposals, sorted by createdAt desc. */
export const getMyProposals = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, SUPPLIER_ROLES);

    const proposals = await ctx.db
      .query("supplierProposals")
      .withIndex("by_supplier", (q) => q.eq("supplierId", user._id))
      .order("desc")
      .take(50);

    return proposals.map((p) => ({
      _id: p._id,
      brand: p.brand,
      items: p.items,
      totalCentavos: p.totalCentavos,
      notes: p.notes ?? null,
      status: p.status,
      reviewNotes: p.reviewNotes ?? null,
      reviewedAt: p.reviewedAt ?? null,
      createdAt: p.createdAt,
    }));
  },
});

// ─── HQ Proposal Review ─────────────────────────────────────────────────────

/** Returns all pending proposals with supplier info. HQ-only. */
export const getPendingProposals = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    const pending = await ctx.db
      .query("supplierProposals")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(100);

    // Enrich with supplier names
    const supplierCache = new Map<string, string>();
    for (const proposal of pending) {
      const key = proposal.supplierId as string;
      if (!supplierCache.has(key)) {
        const supplier = await ctx.db.get(proposal.supplierId);
        supplierCache.set(key, supplier?.name ?? "Unknown");
      }
    }

    return pending.map((p) => ({
      _id: p._id,
      supplierName: supplierCache.get(p.supplierId as string) ?? "Unknown",
      brand: p.brand,
      items: p.items,
      totalCentavos: p.totalCentavos,
      notes: p.notes ?? null,
      createdAt: p.createdAt,
    }));
  },
});

/** Accept or reject a pending proposal. HQ-only. */
export const reviewProposal = mutation({
  args: {
    proposalId: v.id("supplierProposals"),
    decision: v.union(v.literal("accepted"), v.literal("rejected")),
    reviewNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Proposal not found",
      });
    }
    if (proposal.status !== "pending") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Proposal has already been reviewed",
      });
    }

    await ctx.db.patch(args.proposalId, {
      status: args.decision,
      reviewedBy: user._id,
      reviewedAt: Date.now(),
      reviewNotes: args.reviewNotes,
    });
  },
});

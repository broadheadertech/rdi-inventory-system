import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { withBranchScope } from "../_helpers/withBranchScope";

// ── List internal invoices ──────────────────────────────────────────────────

export const listInternalInvoices = query({
  args: {
    branchId: v.optional(v.id("branches")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 200);

    let baseQuery;
    if (args.branchId) {
      baseQuery = ctx.db
        .query("internalInvoices")
        .withIndex("by_toBranch", (q) => q.eq("toBranchId", args.branchId!));
      if (args.cursor !== undefined) {
        baseQuery = baseQuery.filter((f) => f.lt(f.field("createdAt"), args.cursor!));
      }
    } else {
      baseQuery = args.cursor !== undefined
        ? ctx.db.query("internalInvoices").withIndex("by_createdAt", (q) => q.lt("createdAt", args.cursor!))
        : ctx.db.query("internalInvoices").withIndex("by_createdAt");
    }

    const results = await baseQuery.order("desc").take(limit + 1);
    const hasMore = results.length > limit;
    const invoices = hasMore ? results.slice(0, limit) : results;

    // Enrich with branch names
    const branchCache = new Map<string, string>();
    async function getBranchName(branchId: Id<"branches">) {
      const key = branchId as string;
      if (branchCache.has(key)) return branchCache.get(key)!;
      const branch = await ctx.db.get(branchId);
      const name = branch?.isActive ? branch.name : "(inactive)";
      branchCache.set(key, name);
      return name;
    }

    const enriched = await Promise.all(
      invoices.map(async (inv) => ({
        _id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        transferId: inv.transferId,
        fromBranchName: await getBranchName(inv.fromBranchId),
        toBranchName: await getBranchName(inv.toBranchId),
        subtotalCentavos: inv.subtotalCentavos,
        vatAmountCentavos: inv.vatAmountCentavos,
        totalCentavos: inv.totalCentavos,
        status: inv.status,
        createdAt: inv.createdAt,
      }))
    );

    const nextCursor = invoices.length > 0 ? invoices[invoices.length - 1].createdAt : undefined;
    return { invoices: enriched, hasMore, nextCursor };
  },
});

// ── Get invoice detail ──────────────────────────────────────────────────────

export const getInternalInvoiceDetail = query({
  args: { invoiceId: v.id("internalInvoices") },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;

    const fromBranch = await ctx.db.get(invoice.fromBranchId);
    const toBranch = await ctx.db.get(invoice.toBranchId);
    const generatedBy = await ctx.db.get(invoice.generatedById);

    // Fetch line items
    const items = await ctx.db
      .query("internalInvoiceItems")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
      .collect();

    // Enrich with variant/style info
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const variant = await ctx.db.get(item.variantId);
        const style = variant ? await ctx.db.get(variant.styleId) : null;
        return {
          _id: item._id,
          sku: variant?.sku ?? "",
          styleName: style?.name ?? "Unknown",
          size: variant?.size ?? "",
          color: variant?.color ?? "",
          quantity: item.quantity,
          unitCostCentavos: item.unitCostCentavos,
          lineTotalCentavos: item.lineTotalCentavos,
        };
      })
    );

    // Load business settings for print header
    const businessNameSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "businessName"))
      .unique();
    const tinSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "tin"))
      .unique();

    return {
      invoice: {
        _id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        transferId: invoice.transferId,
        subtotalCentavos: invoice.subtotalCentavos,
        vatAmountCentavos: invoice.vatAmountCentavos,
        totalCentavos: invoice.totalCentavos,
        status: invoice.status,
        createdAt: invoice.createdAt,
      },
      fromBranch: {
        name: fromBranch?.name ?? "(unknown)",
        address: fromBranch?.address ?? "",
      },
      toBranch: {
        name: toBranch?.name ?? "(unknown)",
        address: toBranch?.address ?? "",
      },
      generatedByName: generatedBy?.name ?? "Unknown",
      items: enrichedItems,
      business: {
        name: (businessNameSetting?.value as string) ?? "RedBox Apparel",
        tin: (tinSetting?.value as string) ?? "",
      },
    };
  },
});

// ── Branch-scoped: list invoices for the user's branch ───────────────────────
// Warehouse users see invoices FROM their branch; retail users see invoices TO their branch.

export const listBranchInvoices = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const branch = await ctx.db.get(branchId);
    const isWarehouse = branch?.type === "warehouse";
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 200);

    // Warehouse → filter by fromBranchId; retail → filter by toBranchId
    let baseQuery;
    if (isWarehouse) {
      // No index on fromBranchId — use by_createdAt + in-memory filter (same as dashboard)
      baseQuery = args.cursor !== undefined
        ? ctx.db.query("internalInvoices").withIndex("by_createdAt", (q) => q.lt("createdAt", args.cursor!))
        : ctx.db.query("internalInvoices").withIndex("by_createdAt");
    } else {
      baseQuery = ctx.db
        .query("internalInvoices")
        .withIndex("by_toBranch", (q) => q.eq("toBranchId", branchId));
      if (args.cursor !== undefined) {
        baseQuery = baseQuery.filter((f) => f.lt(f.field("createdAt"), args.cursor!));
      }
    }

    const allResults = await baseQuery.order("desc").collect();

    // In-memory filter for warehouse (fromBranchId match)
    const filtered = isWarehouse
      ? allResults.filter((inv) => (inv.fromBranchId as string) === (branchId as string))
      : allResults;

    const paged = filtered.slice(0, limit + 1);
    const hasMore = paged.length > limit;
    const invoices = hasMore ? paged.slice(0, limit) : paged;

    // Enrich with branch names
    const branchCache = new Map<string, string>();
    async function getBranchName(id: Id<"branches">) {
      const key = id as string;
      if (branchCache.has(key)) return branchCache.get(key)!;
      const b = await ctx.db.get(id);
      const name = b?.name ?? "(unknown)";
      branchCache.set(key, name);
      return name;
    }

    const enriched = await Promise.all(
      invoices.map(async (inv) => ({
        _id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        transferId: inv.transferId,
        fromBranchName: await getBranchName(inv.fromBranchId),
        toBranchName: await getBranchName(inv.toBranchId),
        totalCentavos: inv.totalCentavos,
        status: inv.status,
        createdAt: inv.createdAt,
      }))
    );

    const nextCursor = invoices.length > 0 ? invoices[invoices.length - 1].createdAt : undefined;
    return { invoices: enriched, hasMore, nextCursor };
  },
});

// ── Branch-scoped: get invoice detail ────────────────────────────────────────

export const getBranchInvoiceDetail = query({
  args: { invoiceId: v.id("internalInvoices") },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;

    // Verify the invoice belongs to this branch (either as sender or receiver)
    if (
      (invoice.fromBranchId as string) !== (branchId as string) &&
      (invoice.toBranchId as string) !== (branchId as string)
    ) {
      return null;
    }

    const fromBranch = await ctx.db.get(invoice.fromBranchId);
    const toBranch = await ctx.db.get(invoice.toBranchId);
    const generatedBy = await ctx.db.get(invoice.generatedById);

    const items = await ctx.db
      .query("internalInvoiceItems")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
      .collect();

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const variant = await ctx.db.get(item.variantId);
        const style = variant ? await ctx.db.get(variant.styleId) : null;
        return {
          _id: item._id,
          sku: variant?.sku ?? "",
          styleName: style?.name ?? "Unknown",
          size: variant?.size ?? "",
          color: variant?.color ?? "",
          quantity: item.quantity,
          unitCostCentavos: item.unitCostCentavos,
          lineTotalCentavos: item.lineTotalCentavos,
        };
      })
    );

    return {
      invoice: {
        _id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        transferId: invoice.transferId,
        subtotalCentavos: invoice.subtotalCentavos,
        vatAmountCentavos: invoice.vatAmountCentavos,
        totalCentavos: invoice.totalCentavos,
        status: invoice.status,
        createdAt: invoice.createdAt,
      },
      fromBranch: {
        name: fromBranch?.name ?? "(unknown)",
        address: fromBranch?.address ?? "",
      },
      toBranch: {
        name: toBranch?.name ?? "(unknown)",
        address: toBranch?.address ?? "",
      },
      generatedByName: generatedBy?.name ?? "Unknown",
      items: enrichedItems,
    };
  },
});

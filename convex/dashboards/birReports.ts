import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";

// NOTE: All queries use requireRole(ctx, HQ_ROLES) — NOT withBranchScope.
// HQ staff and admin see all-branch data. Branch roles cannot access these endpoints.

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

// ─── Philippine Time date-range helper ───────────────────────────────────────
// Converts YYYYMMDD string → UTC ms boundaries for that calendar day in PHT.
// Pattern sourced from convex/pos/reconciliation.ts — duplicated to avoid
// coupling between unrelated modules.
function getPhilippineDateRange(dateStr: string): { startMs: number; endMs: number } {
  const year = parseInt(dateStr.slice(0, 4));
  const month = parseInt(dateStr.slice(4, 6)) - 1; // 0-indexed month
  const day = parseInt(dateStr.slice(6, 8));
  const startMs = Date.UTC(year, month, day) - PHT_OFFSET_MS;
  const endMs = startMs + 86_400_000 - 1; // 23:59:59.999 PHT
  return { startMs, endMs };
}

// ─── listActiveBranches ───────────────────────────────────────────────────────
// Lightweight branch list for UI dropdowns — always reflects current active set
// regardless of the current date filter (M3 fix: branch dropdown independent of
// filtered salesData).

export const listActiveBranches = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);
    const branches = await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    return branches.map((b) => ({ id: b._id as string, name: b.name }));
  },
});

// ─── getSalesReport ───────────────────────────────────────────────────────────
// Per-branch sales summary for a date range. Optional branchId filter for
// single-branch view. Returns array sorted by revenue descending.

export const getSalesReport = query({
  args: {
    dateStart: v.string(), // YYYYMMDD — PHT calendar date (inclusive)
    dateEnd: v.string(), // YYYYMMDD — PHT calendar date (inclusive)
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const { startMs } = getPhilippineDateRange(args.dateStart);
    const { endMs } = getPhilippineDateRange(args.dateEnd);

    // M2 fix: guard inactive branch when explicit branchId provided
    const branches = args.branchId
      ? await ctx.db.get(args.branchId).then((b) => (b && b.isActive ? [b] : []))
      : await ctx.db.query("branches").filter((q) => q.eq(q.field("isActive"), true)).collect();

    // Parallel by_branch_date queries — one per branch, bounded by branch count (~≤20)
    const branchResults = await Promise.all(
      branches.map(async (branch) => {
        // POS transaction revenue
        const txns = await ctx.db
          .query("transactions")
          .withIndex("by_branch_date", (q) =>
            q.eq("branchId", branch._id).gte("createdAt", startMs).lte("createdAt", endMs)
          )
          .collect();

        let revenueCentavos = txns.reduce((s, t) => s + t.totalCentavos, 0);
        let txnCount = txns.length;

        // Warehouse branches: also credit internal invoice revenue from transfers
        if (branch.channel === "warehouse") {
          const invoices = await ctx.db
            .query("internalInvoices")
            .withIndex("by_createdAt", (q) => q.gte("createdAt", startMs))
            .collect();
          const filtered = invoices.filter(
            (inv) => inv.fromBranchId === branch._id && inv.createdAt <= endMs
          );
          revenueCentavos += filtered.reduce((s, inv) => s + inv.totalCentavos, 0);
          txnCount += filtered.length;
        }

        const avgTxnValueCentavos = txnCount > 0 ? Math.round(revenueCentavos / txnCount) : 0;

        return {
          branchId: branch._id as string,
          branchName: branch.name + (branch.channel === "warehouse" ? " (Warehouse)" : ""),
          revenueCentavos,
          txnCount,
          avgTxnValueCentavos,
        };
      })
    );

    // Sort by revenue descending — highest-performing branch first
    return branchResults.sort((a, b) => b.revenueCentavos - a.revenueCentavos);
  },
});

// ─── getBrandBreakdown ────────────────────────────────────────────────────────
// Brand-level revenue aggregation for a date range. Optional branchId filter.
// Join chain: transactionItems → variants → styles → categories → brands.
// H1 fix: 4-wave parallel batch fetching replaces the prior sequential-await
// for-loop. All DB reads complete before the aggregation pass, which is then
// fully synchronous Map lookups.

export const getBrandBreakdown = query({
  args: {
    dateStart: v.string(), // YYYYMMDD
    dateEnd: v.string(), // YYYYMMDD
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const { startMs } = getPhilippineDateRange(args.dateStart);
    const { endMs } = getPhilippineDateRange(args.dateEnd);

    // M2 fix: guard inactive branch when explicit branchId provided
    const branches = args.branchId
      ? await ctx.db.get(args.branchId).then((b) => (b && b.isActive ? [b] : []))
      : await ctx.db.query("branches").filter((q) => q.eq(q.field("isActive"), true)).collect();

    const allTxns = (
      await Promise.all(
        branches.map((branch) =>
          ctx.db
            .query("transactions")
            .withIndex("by_branch_date", (q) =>
              q.eq("branchId", branch._id).gte("createdAt", startMs).lte("createdAt", endMs)
            )
            .collect()
        )
      )
    ).flat();

    if (allTxns.length === 0) return [];

    // Fetch transactionItems in parallel — bounded by daily/weekly txn count
    const allItemArrays = await Promise.all(
      allTxns.map((txn) =>
        ctx.db
          .query("transactionItems")
          .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
          .collect()
      )
    );
    const allItems = allItemArrays.flat();

    if (allItems.length === 0) return [];

    // ── H1 fix: 4-wave parallel batch fetching ────────────────────────────────

    // Wave 1: unique variantIds → batch fetch variants
    const uniqueVariantIds = [...new Set(allItems.map((item) => item.variantId))];
    const variantDocs = await Promise.all(uniqueVariantIds.map((id) => ctx.db.get(id)));
    const variantMap = new Map<string, { styleId: Id<"styles"> }>();
    uniqueVariantIds.forEach((id, i) => {
      const doc = variantDocs[i];
      if (doc) variantMap.set(id as string, { styleId: doc.styleId });
    });

    // Wave 2: unique styleIds from variantMap → batch fetch styles
    const uniqueStyleIds = [
      ...new Set(Array.from(variantMap.values()).map((entry) => entry.styleId)),
    ];
    const styleDocs = await Promise.all(uniqueStyleIds.map((id) => ctx.db.get(id)));
    const styleMap = new Map<string, { categoryId: Id<"categories"> | undefined; brandId: Id<"brands"> | undefined }>();
    uniqueStyleIds.forEach((id, i) => {
      const doc = styleDocs[i];
      if (doc) styleMap.set(id as string, { categoryId: doc.categoryId, brandId: doc.brandId });
    });

    // Wave 3: unique categoryIds from styleMap → batch fetch categories
    const uniqueCategoryIds = [
      ...new Set(Array.from(styleMap.values()).map((entry) => entry.categoryId).filter(Boolean)),
    ] as Id<"categories">[];
    const categoryDocs = await Promise.all(uniqueCategoryIds.map((id) => ctx.db.get(id)));
    const categoryMap = new Map<string, { brandId: Id<"brands"> }>();
    uniqueCategoryIds.forEach((id, i) => {
      const doc = categoryDocs[i];
      if (doc) categoryMap.set(id as string, { brandId: doc.brandId });
    });

    // Wave 4: unique brandIds from categoryMap + styleMap → batch fetch brands
    const uniqueBrandIds = [
      ...new Set([
        ...Array.from(categoryMap.values()).map((entry) => entry.brandId),
        ...Array.from(styleMap.values()).map((entry) => entry.brandId).filter(Boolean) as Id<"brands">[],
      ]),
    ];
    const brandDocs = await Promise.all(uniqueBrandIds.map((id) => ctx.db.get(id)));
    const brandNameMap = new Map<string, string>();
    uniqueBrandIds.forEach((id, i) => {
      const doc = brandDocs[i];
      if (doc) brandNameMap.set(id as string, doc.name);
    });

    // ── Single aggregation pass — all lookups are synchronous Map.get calls ───
    // M1 fix: brandTxnSets built in this same pass — no second allItemArrays iteration.

    const brandAgg = new Map<string, { brandName: string; revenueCentavos: number }>();
    const brandTxnSets = new Map<string, Set<string>>();

    for (let arrayIdx = 0; arrayIdx < allItemArrays.length; arrayIdx++) {
      const itemArray = allItemArrays[arrayIdx];
      if (itemArray.length === 0) continue;
      const txnId = itemArray[0].transactionId as string;

      for (const item of itemArray) {
        const variantData = variantMap.get(item.variantId as string);
        if (!variantData) continue;
        const styleData = styleMap.get(variantData.styleId as string);
        if (!styleData) continue;
        const categoryData = styleData.categoryId ? categoryMap.get(styleData.categoryId as string) : null;
        const brandKey = (styleData.brandId ?? categoryData?.brandId) as string;
        if (!brandKey) continue;
        const brandName = brandNameMap.get(brandKey);
        if (!brandName) continue;

        // Aggregate revenue
        const existing = brandAgg.get(brandKey);
        if (existing) {
          existing.revenueCentavos += item.lineTotalCentavos;
        } else {
          brandAgg.set(brandKey, { brandName, revenueCentavos: item.lineTotalCentavos });
        }

        // Track unique transactions per brand (M1 fix: merged into single pass)
        if (!brandTxnSets.has(brandKey)) brandTxnSets.set(brandKey, new Set());
        brandTxnSets.get(brandKey)!.add(txnId);
      }
    }

    // Return sorted by revenue descending
    return Array.from(brandAgg.entries())
      .map(([brandId, data]) => ({
        brandId,
        brandName: data.brandName,
        revenueCentavos: data.revenueCentavos,
        txnCount: brandTxnSets.get(brandId)?.size ?? 0,
      }))
      .sort((a, b) => b.revenueCentavos - a.revenueCentavos);
  },
});

// ─── getBirVatSummary ─────────────────────────────────────────────────────────
// BIR VAT summary across all branches for a date range.
// Aggregates: total sales, VAT collected, Senior/PWD discount totals.

export const getBirVatSummary = query({
  args: {
    dateStart: v.string(), // YYYYMMDD
    dateEnd: v.string(), // YYYYMMDD
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const { startMs } = getPhilippineDateRange(args.dateStart);
    const { endMs } = getPhilippineDateRange(args.dateEnd);

    const branches = await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Parallel by_branch_date queries across all branches
    const allTxns = (
      await Promise.all(
        branches.map((branch) =>
          ctx.db
            .query("transactions")
            .withIndex("by_branch_date", (q) =>
              q.eq("branchId", branch._id).gte("createdAt", startMs).lte("createdAt", endMs)
            )
            .collect()
        )
      )
    ).flat();

    let totalSalesCentavos = 0;
    let totalVatCentavos = 0;
    let totalSeniorPwdDiscountCentavos = 0;

    for (const txn of allTxns) {
      totalSalesCentavos += txn.totalCentavos;
      totalVatCentavos += txn.vatAmountCentavos;
      if (txn.discountType === "senior" || txn.discountType === "pwd") {
        totalSeniorPwdDiscountCentavos += txn.discountAmountCentavos;
      }
    }

    const txnCount = allTxns.length;
    // Net taxable sales = gross sales − senior/PWD discounts
    const netTaxableSalesCentavos = totalSalesCentavos - totalSeniorPwdDiscountCentavos;

    return {
      totalSalesCentavos,
      totalVatCentavos,
      totalSeniorPwdDiscountCentavos,
      netTaxableSalesCentavos,
      txnCount,
    };
  },
});

// ─── getWarehouseInvoiceSummary ──────────────────────────────────────────────
// Internal invoice (transfer) revenue summary for a date range.
// Aggregates per destination branch — how much each branch was charged.

export const getWarehouseInvoiceSummary = query({
  args: {
    dateStart: v.string(), // YYYYMMDD
    dateEnd: v.string(), // YYYYMMDD
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const { startMs } = getPhilippineDateRange(args.dateStart);
    const { endMs } = getPhilippineDateRange(args.dateEnd);

    let invoices;
    if (args.branchId) {
      invoices = await ctx.db
        .query("internalInvoices")
        .withIndex("by_toBranch", (q) => q.eq("toBranchId", args.branchId!))
        .collect();
      invoices = invoices.filter(
        (inv) => inv.createdAt >= startMs && inv.createdAt <= endMs
      );
    } else {
      invoices = await ctx.db
        .query("internalInvoices")
        .withIndex("by_createdAt", (q) => q.gte("createdAt", startMs))
        .collect();
      invoices = invoices.filter((inv) => inv.createdAt <= endMs);
    }

    // Aggregate per destination branch
    const branchAgg = new Map<
      string,
      { branchId: string; revenueCentavos: number; invoiceCount: number }
    >();
    for (const inv of invoices) {
      const key = inv.toBranchId as string;
      const existing = branchAgg.get(key);
      if (existing) {
        existing.revenueCentavos += inv.totalCentavos;
        existing.invoiceCount += 1;
      } else {
        branchAgg.set(key, {
          branchId: key,
          revenueCentavos: inv.totalCentavos,
          invoiceCount: 1,
        });
      }
    }

    // Enrich with branch names
    const results = await Promise.all(
      Array.from(branchAgg.values()).map(async (row) => {
        const branch = await ctx.db.get(row.branchId as Id<"branches">);
        return {
          branchId: row.branchId,
          branchName: branch?.name ?? "(unknown)",
          revenueCentavos: row.revenueCentavos,
          invoiceCount: row.invoiceCount,
        };
      })
    );

    // Grand totals
    const totalRevenueCentavos = invoices.reduce((s, inv) => s + inv.totalCentavos, 0);
    const totalInvoiceCount = invoices.length;

    return {
      byBranch: results.sort((a, b) => b.revenueCentavos - a.revenueCentavos),
      totalRevenueCentavos,
      totalInvoiceCount,
    };
  },
});

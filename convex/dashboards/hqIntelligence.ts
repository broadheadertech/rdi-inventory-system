import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function getPHTDayStartMs(): number {
  const nowUtcMs = Date.now();
  const nowPhtMs = nowUtcMs + PHT_OFFSET_MS;
  const todayPhtStartMs = nowPhtMs - (nowPhtMs % DAY_MS);
  return todayPhtStartMs - PHT_OFFSET_MS;
}

function resolvePeriod(args: { startMs?: number; endMs?: number }) {
  const nowMs = Date.now();
  const endMs = args.endMs ?? nowMs;
  const startMs = args.startMs ?? getPHTDayStartMs() - 7 * DAY_MS;
  const durationMs = Math.max(endMs - startMs, 1);
  return { startMs, endMs, durationMs, durationDays: Math.max(1, durationMs / DAY_MS) };
}

function formatCentavos(c: number): string {
  return `₱${(c / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART ALERTS — Rule-based anomaly detection
// ═══════════════════════════════════════════════════════════════════════════════

type AlertSeverity = "critical" | "warning" | "info";
type AlertCategory = "revenue" | "stock" | "velocity" | "transfer" | "stockout";

interface SmartAlert {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  description: string;
  affectedBranches: string[];
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

export const getSmartAlerts = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    const { startMs, endMs, durationMs } = resolvePeriod(args);
    const prevStartMs = startMs - durationMs;
    const prevEndMs = startMs;

    const allBranches = await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    const retailBranches = allBranches.filter((b) => b.channel !== "warehouse");
    const branchNameMap = new Map(allBranches.map((b) => [b._id as string, b.name]));

    const alerts: SmartAlert[] = [];

    // ── Rule 1: Revenue Anomalies ─────────────────────────────────────────
    for (const branch of retailBranches) {
      const txns = await ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q) =>
          q.eq("branchId", branch._id).gte("createdAt", prevStartMs)
        )
        .collect();

      const curRev = txns
        .filter((t) => t.createdAt >= startMs && t.createdAt <= endMs)
        .reduce((s, t) => s + t.totalCentavos, 0);
      const prevRev = txns
        .filter((t) => t.createdAt >= prevStartMs && t.createdAt < prevEndMs)
        .reduce((s, t) => s + t.totalCentavos, 0);

      if (prevRev > 0) {
        const change = ((curRev - prevRev) / prevRev) * 100;
        if (change <= -30) {
          alerts.push({
            id: `rev-drop-${branch._id}`,
            severity: "critical",
            category: "revenue",
            title: `Revenue dropped ${Math.abs(Math.round(change))}% at ${branch.name}`,
            description: `${formatCentavos(curRev)} this period vs ${formatCentavos(prevRev)} last period`,
            affectedBranches: [branch.name],
          });
        } else if (change <= -20) {
          alerts.push({
            id: `rev-drop-${branch._id}`,
            severity: "warning",
            category: "revenue",
            title: `Revenue dropped ${Math.abs(Math.round(change))}% at ${branch.name}`,
            description: `${formatCentavos(curRev)} this period vs ${formatCentavos(prevRev)} last period`,
            affectedBranches: [branch.name],
          });
        } else if (change >= 20) {
          alerts.push({
            id: `rev-spike-${branch._id}`,
            severity: "info",
            category: "revenue",
            title: `Revenue up ${Math.round(change)}% at ${branch.name}`,
            description: `${formatCentavos(curRev)} this period vs ${formatCentavos(prevRev)} last period`,
            affectedBranches: [branch.name],
          });
        }
      }
    }

    // ── Rule 2: Stock Imbalances ──────────────────────────────────────────
    const branchInventories = await Promise.all(
      retailBranches.map(async (branch) => ({
        branchId: branch._id as string,
        items: await ctx.db
          .query("inventory")
          .withIndex("by_branch", (q) => q.eq("branchId", branch._id))
          .collect(),
      }))
    );

    // Build variant → branch → qty map
    const variantBranchQty = new Map<string, Map<string, number>>();
    for (const { branchId, items } of branchInventories) {
      for (const inv of items) {
        const vid = inv.variantId as string;
        if (!variantBranchQty.has(vid)) variantBranchQty.set(vid, new Map());
        variantBranchQty.get(vid)!.set(branchId, inv.quantity);
      }
    }

    // Find imbalances: qty=0 at one branch, ≥10 at another
    const imbalances: { variantId: string; zeroBranch: string; surplusBranch: string; surplusQty: number }[] = [];
    for (const [vid, branchMap] of variantBranchQty) {
      const zeroBranches = Array.from(branchMap.entries()).filter(([, q]) => q <= 0);
      const surplusBranches = Array.from(branchMap.entries())
        .filter(([, q]) => q >= 10)
        .sort((a, b) => b[1] - a[1]);

      if (zeroBranches.length > 0 && surplusBranches.length > 0) {
        imbalances.push({
          variantId: vid,
          zeroBranch: zeroBranches[0][0],
          surplusBranch: surplusBranches[0][0],
          surplusQty: surplusBranches[0][1],
        });
      }
    }

    // Top 10 imbalances, enriched
    const topImbalances = imbalances.sort((a, b) => b.surplusQty - a.surplusQty).slice(0, 10);
    const imbalanceVariantIds = [...new Set(topImbalances.map((i) => i.variantId))];
    const imbalanceVariants = await Promise.all(
      imbalanceVariantIds.map((vid) => ctx.db.get(vid as Id<"variants">))
    );
    const variantMap = new Map(imbalanceVariants.map((v) => [v?._id as string, v]));
    const styleIds = [...new Set(imbalanceVariants.filter(Boolean).map((v) => v!.styleId as string))];
    const styles = await Promise.all(styleIds.map((sid) => ctx.db.get(sid as Id<"styles">)));
    const styleMap = new Map(styles.map((s) => [s?._id as string, s]));

    for (const imb of topImbalances) {
      const variant = variantMap.get(imb.variantId);
      const style = variant ? styleMap.get(variant.styleId as string) : null;
      const productName = style?.name ?? "Unknown";
      const detail = variant ? `${variant.size}/${variant.color}` : "";
      const zeroBranchName = branchNameMap.get(imb.zeroBranch) ?? "Unknown";
      const surplusBranchName = branchNameMap.get(imb.surplusBranch) ?? "Unknown";

      alerts.push({
        id: `stock-imb-${imb.variantId}-${imb.zeroBranch}`,
        severity: "warning",
        category: "stock",
        title: `Stock imbalance: ${productName} (${detail})`,
        description: `Out of stock at ${zeroBranchName}, ${imb.surplusQty} units at ${surplusBranchName}`,
        affectedBranches: [zeroBranchName, surplusBranchName],
      });
    }

    // ── Rule 3: Velocity Anomalies ────────────────────────────────────────
    // Get current period transaction items
    const curTxns = (
      await Promise.all(
        retailBranches.map((branch) =>
          ctx.db
            .query("transactions")
            .withIndex("by_branch_date", (q) =>
              q.eq("branchId", branch._id).gte("createdAt", startMs)
            )
            .collect()
        )
      )
    ).flat().filter((t) => t.createdAt <= endMs);

    const prevTxns = (
      await Promise.all(
        retailBranches.map((branch) =>
          ctx.db
            .query("transactions")
            .withIndex("by_branch_date", (q) =>
              q.eq("branchId", branch._id).gte("createdAt", prevStartMs)
            )
            .collect()
        )
      )
    ).flat().filter((t) => t.createdAt >= prevStartMs && t.createdAt < prevEndMs);

    const [curItemArrays, prevItemArrays] = await Promise.all([
      Promise.all(curTxns.map((t) =>
        ctx.db.query("transactionItems").withIndex("by_transaction", (q) => q.eq("transactionId", t._id)).collect()
      )),
      Promise.all(prevTxns.map((t) =>
        ctx.db.query("transactionItems").withIndex("by_transaction", (q) => q.eq("transactionId", t._id)).collect()
      )),
    ]);

    const curItems = curItemArrays.flat();
    const prevItems = prevItemArrays.flat();
    const { durationDays } = resolvePeriod(args);
    const prevDurationDays = durationDays;

    // Per-variant daily velocity
    const curVelocity = new Map<string, number>();
    for (const item of curItems) {
      const vid = item.variantId as string;
      curVelocity.set(vid, (curVelocity.get(vid) ?? 0) + item.quantity);
    }
    const prevVelocity = new Map<string, number>();
    for (const item of prevItems) {
      const vid = item.variantId as string;
      prevVelocity.set(vid, (prevVelocity.get(vid) ?? 0) + item.quantity);
    }

    const velocityAnomalies: { variantId: string; curDaily: number; prevDaily: number; ratio: number }[] = [];
    for (const [vid, curQty] of curVelocity) {
      const prevQty = prevVelocity.get(vid) ?? 0;
      const curDaily = curQty / durationDays;
      const prevDaily = prevQty / prevDurationDays;
      if (prevDaily >= 0.5) {
        const ratio = curDaily / prevDaily;
        if (ratio >= 2 || ratio <= 0.5) {
          velocityAnomalies.push({ variantId: vid, curDaily, prevDaily, ratio });
        }
      }
    }

    // Enrich top 5 velocity anomalies
    const topVelocity = velocityAnomalies
      .sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1))
      .slice(0, 5);

    for (const va of topVelocity) {
      let variant = variantMap.get(va.variantId);
      if (!variant) {
        variant = await ctx.db.get(va.variantId as Id<"variants">) ?? undefined;
        if (variant) variantMap.set(va.variantId, variant);
      }
      let style = variant ? styleMap.get(variant.styleId as string) : null;
      if (!style && variant) {
        const s = await ctx.db.get(variant.styleId);
        if (s) { styleMap.set(s._id as string, s); style = s; }
      }
      const name = style?.name ?? "Unknown";

      if (va.ratio >= 2) {
        alerts.push({
          id: `vel-spike-${va.variantId}`,
          severity: "warning",
          category: "velocity",
          title: `Velocity spike: ${name} selling ${Math.round(va.ratio)}x faster`,
          description: `Current: ${Math.round(va.curDaily)}/day vs baseline: ${Math.round(va.prevDaily)}/day`,
          affectedBranches: [],
        });
      } else {
        alerts.push({
          id: `vel-drop-${va.variantId}`,
          severity: "warning",
          category: "velocity",
          title: `Velocity drop: ${name} selling ${Math.round(1 / va.ratio)}x slower`,
          description: `Current: ${Math.round(va.curDaily)}/day vs baseline: ${Math.round(va.prevDaily)}/day`,
          affectedBranches: [],
        });
      }
    }

    // ── Rule 4: Transfer Bottlenecks ──────────────────────────────────────
    const pendingStatuses = ["requested", "approved", "packed", "inTransit"];
    const allTransfers = await ctx.db.query("transfers").order("desc").collect();
    const pendingTransfers = allTransfers.filter(
      (t) => pendingStatuses.includes(t.status)
    );
    const nowMs = Date.now();

    for (const transfer of pendingTransfers) {
      const ageHours = (nowMs - transfer.createdAt) / 3_600_000;
      if (ageHours > 48) {
        const fromName = branchNameMap.get(transfer.fromBranchId as string) ?? "Unknown";
        const toName = branchNameMap.get(transfer.toBranchId as string) ?? "Unknown";
        alerts.push({
          id: `xfer-stuck-${transfer._id}`,
          severity: ageHours > 72 ? "critical" : "warning",
          category: "transfer",
          title: `Transfer stuck for ${Math.round(ageHours)}h`,
          description: `${fromName} → ${toName}, status: ${transfer.status}`,
          affectedBranches: [fromName, toName],
        });
      }
    }

    if (pendingTransfers.length > 10) {
      alerts.push({
        id: "xfer-pileup",
        severity: "info",
        category: "transfer",
        title: `${pendingTransfers.length} transfers pending`,
        description: "Transfer queue is building up across the system",
        affectedBranches: [],
      });
    }

    // ── Rule 5: Critical Stockouts ────────────────────────────────────────
    const restockSuggestions = await ctx.db
      .query("restockSuggestions")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const criticalRestocks = restockSuggestions.filter(
      (s) => s.daysUntilStockout <= 2 && s.avgDailyVelocity >= 1.0
    );

    for (const rs of criticalRestocks.slice(0, 5)) {
      let variant = variantMap.get(rs.variantId as string);
      if (!variant) {
        variant = await ctx.db.get(rs.variantId) ?? undefined;
        if (variant) variantMap.set(rs.variantId as string, variant);
      }
      let style = variant ? styleMap.get(variant.styleId as string) : null;
      if (!style && variant) {
        const s = await ctx.db.get(variant.styleId);
        if (s) { styleMap.set(s._id as string, s); style = s; }
      }
      const name = style?.name ?? "Unknown";
      const branchName = branchNameMap.get(rs.branchId as string) ?? "Unknown";

      alerts.push({
        id: `stockout-${rs._id}`,
        severity: "critical",
        category: "stockout",
        title: `Critical: ${name} has <${Math.ceil(rs.daysUntilStockout)} days stock`,
        description: `${Math.round(rs.daysUntilStockout)} days left at ${branchName}, velocity ${Math.round(rs.avgDailyVelocity)}/day`,
        affectedBranches: [branchName],
      });
    }

    // Sort by severity
    alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

    return alerts;
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-BRANCH INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════

export const getBranchPerformanceRanking = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    const { startMs, endMs, durationMs } = resolvePeriod(args);
    const prevStartMs = startMs - durationMs;
    const prevEndMs = startMs;

    const branches = await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    const retailBranches = branches.filter((b) => b.channel !== "warehouse");

    const results = await Promise.all(
      retailBranches.map(async (branch) => {
        const txns = await ctx.db
          .query("transactions")
          .withIndex("by_branch_date", (q) =>
            q.eq("branchId", branch._id).gte("createdAt", prevStartMs)
          )
          .collect();

        const curTxns = txns.filter((t) => t.createdAt >= startMs && t.createdAt <= endMs);
        const prevTxnsList = txns.filter((t) => t.createdAt >= prevStartMs && t.createdAt < prevEndMs);

        const revenue = curTxns.reduce((s, t) => s + t.totalCentavos, 0);
        const prevRevenue = prevTxnsList.reduce((s, t) => s + t.totalCentavos, 0);

        return {
          branchId: branch._id as string,
          branchName: branch.name,
          revenueCentavos: revenue,
          transactionCount: curTxns.length,
          avgTicketCentavos: curTxns.length > 0 ? Math.round(revenue / curTxns.length) : 0,
          previousRevenueCentavos: prevRevenue,
          revenueTrend: (revenue > prevRevenue ? "up" : revenue < prevRevenue ? "down" : "flat") as "up" | "down" | "flat",
          rank: 0,
        };
      })
    );

    results.sort((a, b) => b.revenueCentavos - a.revenueCentavos);
    results.forEach((r, i) => { r.rank = i + 1; });

    return results;
  },
});

export const getStockDistributionMatrix = query({
  args: {
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);
    const { startMs, endMs } = resolvePeriod(args);

    const allBranches = await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    const retailBranches = allBranches.filter((b) => b.channel !== "warehouse");

    // Top 10 selling products in period
    const allTxns = (
      await Promise.all(
        retailBranches.map((branch) =>
          ctx.db
            .query("transactions")
            .withIndex("by_branch_date", (q) =>
              q.eq("branchId", branch._id).gte("createdAt", startMs)
            )
            .collect()
        )
      )
    ).flat().filter((t) => t.createdAt <= endMs);

    const allItemArrays = await Promise.all(
      allTxns.map((txn) =>
        ctx.db
          .query("transactionItems")
          .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
          .collect()
      )
    );
    const allItems = allItemArrays.flat();

    const variantSales = new Map<string, number>();
    for (const item of allItems) {
      const vid = item.variantId as string;
      variantSales.set(vid, (variantSales.get(vid) ?? 0) + item.quantity);
    }

    const topVariantIds = Array.from(variantSales.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([vid]) => vid);

    if (topVariantIds.length === 0) {
      return {
        branches: retailBranches.map((b) => ({ branchId: b._id as string, branchName: b.name })),
        products: [],
      };
    }

    // Enrich variants
    const variants = await Promise.all(topVariantIds.map((vid) => ctx.db.get(vid as Id<"variants">)));
    const styleIds = [...new Set(variants.filter(Boolean).map((v) => v!.styleId as string))];
    const styles = await Promise.all(styleIds.map((sid) => ctx.db.get(sid as Id<"styles">)));
    const styleMap = new Map(styles.map((s) => [s?._id as string, s]));

    // Get stock for each variant at each branch
    const products = await Promise.all(
      topVariantIds.map(async (vid, idx) => {
        const variant = variants[idx];
        const style = variant ? styleMap.get(variant.styleId as string) : null;

        const stockByBranch = await Promise.all(
          retailBranches.map(async (branch) => {
            const inv = await ctx.db
              .query("inventory")
              .withIndex("by_branch_variant", (q) =>
                q.eq("branchId", branch._id).eq("variantId", vid as Id<"variants">)
              )
              .unique();
            return {
              branchId: branch._id as string,
              quantity: inv?.quantity ?? 0,
            };
          })
        );

        // Detect imbalances
        const hasZero = stockByBranch.some((s) => s.quantity <= 0);
        const hasSurplus = stockByBranch.some((s) => s.quantity >= 10);

        return {
          variantId: vid,
          styleName: style?.name ?? "Unknown",
          sku: variant?.sku ?? "",
          size: variant?.size ?? "",
          color: variant?.color ?? "",
          totalSold: variantSales.get(vid) ?? 0,
          stockByBranch: stockByBranch.map((s) => ({
            ...s,
            isImbalanced: hasZero && hasSurplus && s.quantity <= 0,
          })),
        };
      })
    );

    return {
      branches: retailBranches.map((b) => ({ branchId: b._id as string, branchName: b.name })),
      products,
    };
  },
});

export const getTransferOpportunities = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    const allBranches = await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    const retailBranches = allBranches.filter((b) => b.channel !== "warehouse");
    const branchNameMap = new Map(allBranches.map((b) => [b._id as string, b.name]));

    // Active restock suggestions = branches that NEED stock
    const suggestions = await ctx.db
      .query("restockSuggestions")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    if (suggestions.length === 0) return [];

    // Build inventory map: variant → branch → qty
    const branchInventories = await Promise.all(
      retailBranches.map(async (branch) => ({
        branchId: branch._id as string,
        items: await ctx.db
          .query("inventory")
          .withIndex("by_branch", (q) => q.eq("branchId", branch._id))
          .collect(),
      }))
    );

    const variantBranchQty = new Map<string, Map<string, number>>();
    for (const { branchId, items } of branchInventories) {
      for (const inv of items) {
        const vid = inv.variantId as string;
        if (!variantBranchQty.has(vid)) variantBranchQty.set(vid, new Map());
        variantBranchQty.get(vid)!.set(branchId, inv.quantity);
      }
    }

    // Match suggestions (need) with surplus at other branches
    const opportunities: {
      variantId: string;
      fromBranchId: string;
      toBranchId: string;
      suggestedQty: number;
      excessQty: number;
      daysUntilStockout: number;
      rationale: string;
    }[] = [];

    for (const sug of suggestions) {
      const vid = sug.variantId as string;
      const toBranchId = sug.branchId as string;
      const branchMap = variantBranchQty.get(vid);
      if (!branchMap) continue;

      // Find branches with excess (qty > 20 or qty > threshold + 10)
      const threshold = 5; // default lowStockThreshold
      for (const [fromBranchId, qty] of branchMap) {
        if (fromBranchId === toBranchId) continue;
        if (qty > Math.max(20, threshold + 10)) {
          const transferQty = Math.min(sug.suggestedQuantity, Math.floor(qty / 2));
          if (transferQty > 0) {
            opportunities.push({
              variantId: vid,
              fromBranchId,
              toBranchId,
              suggestedQty: transferQty,
              excessQty: qty,
              daysUntilStockout: sug.daysUntilStockout,
              rationale: `${branchNameMap.get(toBranchId) ?? "?"} needs stock (${Math.round(sug.daysUntilStockout)} days left), ${branchNameMap.get(fromBranchId) ?? "?"} has ${qty} units`,
            });
          }
        }
      }
    }

    // Top 10 by urgency
    const topOpps = opportunities
      .sort((a, b) => a.daysUntilStockout - b.daysUntilStockout)
      .slice(0, 10);

    // Enrich with variant/style names
    const uniqueVids = [...new Set(topOpps.map((o) => o.variantId))];
    const variants = await Promise.all(uniqueVids.map((vid) => ctx.db.get(vid as Id<"variants">)));
    const variantMap = new Map(variants.map((v) => [v?._id as string, v]));
    const styleIds = [...new Set(variants.filter(Boolean).map((v) => v!.styleId as string))];
    const styles = await Promise.all(styleIds.map((sid) => ctx.db.get(sid as Id<"styles">)));
    const styleMap = new Map(styles.map((s) => [s?._id as string, s]));

    return topOpps.map((opp) => {
      const variant = variantMap.get(opp.variantId);
      const style = variant ? styleMap.get(variant.styleId as string) : null;
      return {
        styleName: style?.name ?? "Unknown",
        sku: variant?.sku ?? "",
        size: variant?.size ?? "",
        color: variant?.color ?? "",
        fromBranch: {
          branchId: opp.fromBranchId,
          branchName: branchNameMap.get(opp.fromBranchId) ?? "Unknown",
          excessQuantity: opp.excessQty,
        },
        toBranch: {
          branchId: opp.toBranchId,
          branchName: branchNameMap.get(opp.toBranchId) ?? "Unknown",
          daysUntilStockout: opp.daysUntilStockout,
        },
        suggestedTransferQty: opp.suggestedQty,
        rationale: opp.rationale,
      };
    });
  },
});

export const getFulfillmentSpeedComparison = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    const allBranches = await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    const retailBranches = allBranches.filter((b) => b.channel !== "warehouse");
    const branchNameMap = new Map(allBranches.map((b) => [b._id as string, b.name]));

    const thirtyDaysAgo = Date.now() - 30 * DAY_MS;
    const allTransfers = await ctx.db.query("transfers").order("desc").collect();

    const delivered = allTransfers.filter(
      (t) => t.status === "delivered" && t.deliveredAt && t.deliveredAt >= thirtyDaysAgo
    );
    const pending = allTransfers.filter(
      (t) => t.status !== "delivered" && t.status !== "rejected" && t.status !== "cancelled"
    );

    // Per-branch (receiving branch) stats
    const branchStats = new Map<string, { totalHours: number; count: number; pendingCount: number }>();
    for (const branch of retailBranches) {
      branchStats.set(branch._id as string, { totalHours: 0, count: 0, pendingCount: 0 });
    }

    for (const t of delivered) {
      const bid = t.toBranchId as string;
      const stats = branchStats.get(bid);
      if (stats) {
        stats.totalHours += (t.deliveredAt! - t.createdAt) / 3_600_000;
        stats.count += 1;
      }
    }

    for (const t of pending) {
      const bid = t.toBranchId as string;
      const stats = branchStats.get(bid);
      if (stats) {
        stats.pendingCount += 1;
      }
    }

    // Overall average
    const totalHoursAll = delivered.reduce((s, t) => s + (t.deliveredAt! - t.createdAt) / 3_600_000, 0);
    const overallAvgHours = delivered.length > 0
      ? Math.round((totalHoursAll / delivered.length) * 10) / 10
      : 0;

    const branches = retailBranches.map((branch) => {
      const stats = branchStats.get(branch._id as string)!;
      const avgHours = stats.count > 0
        ? Math.round((stats.totalHours / stats.count) * 10) / 10
        : 0;
      return {
        branchId: branch._id as string,
        branchName: branchNameMap.get(branch._id as string) ?? branch.name,
        avgFulfillmentHours: avgHours,
        completedCount: stats.count,
        pendingCount: stats.pendingCount,
        isOutlier: overallAvgHours > 0 && avgHours > overallAvgHours * 1.5,
      };
    });

    return { branches, overallAvgHours };
  },
});

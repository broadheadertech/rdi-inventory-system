// convex/inventory/orderingCycles.ts — recurring branch ordering windows.
//
// A cycle says how often a store orders and how long stock takes to arrive.
// When an occurrence comes due, `prepareOrder` builds a DRAFT sized from real
// demand. Nothing is ordered until a person calls `submitOrder`, which hands the
// result to the existing transfer-request approval flow.
//
// The draft is a judgement aid, not a decision: every line carries how much sold
// in the last 30 days, how long since the last sale, and how long the stock has
// been sitting. Lines that stopped selling are included in the draft but
// switched OFF, so reordering something stale takes a deliberate action.

import { query, mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import { QueryCtx, MutationCtx } from "../_generated/server";
import { withBranchScope } from "../_helpers/withBranchScope";
import { createTransferForRequester } from "../transfers/requests";

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Managers run their own store's cycle; admin/HQ can act for a branch in view.
const CYCLE_ROLES = ["admin", "hqStaff", "manager"] as const;

const FREQUENCY_DAYS: Record<string, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

// ─── date helpers (PHT) ───────────────────────────────────────────────────────

function ymdToMs(ymd: string): number {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(4, 6)) - 1;
  const d = Number(ymd.slice(6, 8));
  return Date.UTC(y, m, d) - PHT_OFFSET_MS;
}

function msToYmd(ms: number): string {
  const d = new Date(ms + PHT_OFFSET_MS);
  return (
    `${d.getUTCFullYear()}` +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0")
  );
}

/**
 * The occurrence a store is currently ordering for: the latest one that is due
 * today or earlier, or the first upcoming one if the cycle has not started yet.
 *
 * Monthly walks calendar months (clamped for short months) rather than adding
 * 30 days, so "the 15th" stays the 15th.
 */
function currentOccurrence(
  cycle: { frequency: string; anchorDate: string },
  nowMs: number
): { dueAt: number; periodKey: string; nextDueAt: number } {
  const anchorMs = ymdToMs(cycle.anchorDate);

  if (cycle.frequency === "monthly") {
    const anchor = new Date(anchorMs + PHT_OFFSET_MS);
    const anchorDay = anchor.getUTCDate();
    const now = new Date(nowMs + PHT_OFFSET_MS);

    const occurrenceFor = (year: number, monthIndex: number): number => {
      const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
      return Date.UTC(year, monthIndex, Math.min(anchorDay, daysInMonth)) - PHT_OFFSET_MS;
    };

    let due = occurrenceFor(now.getUTCFullYear(), now.getUTCMonth());
    if (due > nowMs) {
      due = occurrenceFor(now.getUTCFullYear(), now.getUTCMonth() - 1);
    }
    if (due < anchorMs) due = anchorMs;

    const dueDate = new Date(due + PHT_OFFSET_MS);
    const next = occurrenceFor(dueDate.getUTCFullYear(), dueDate.getUTCMonth() + 1);
    return { dueAt: due, periodKey: msToYmd(due), nextDueAt: next };
  }

  const intervalMs = (FREQUENCY_DAYS[cycle.frequency] ?? 7) * DAY_MS;
  if (nowMs < anchorMs) {
    return { dueAt: anchorMs, periodKey: msToYmd(anchorMs), nextDueAt: anchorMs + intervalMs };
  }
  const elapsed = Math.floor((nowMs - anchorMs) / intervalMs);
  const due = anchorMs + elapsed * intervalMs;
  return { dueAt: due, periodKey: msToYmd(due), nextDueAt: due + intervalMs };
}

// ─── scope ────────────────────────────────────────────────────────────────────

async function requireCycleScope(ctx: QueryCtx | MutationCtx) {
  const scope = await withBranchScope(ctx);
  if (!(CYCLE_ROLES as readonly string[]).includes(scope.user.role)) {
    throw new ConvexError({ code: "UNAUTHORIZED" });
  }
  return scope;
}

// ─── getMyCycle ───────────────────────────────────────────────────────────────
// The store's cycle, where it sits in the current occurrence, and the draft (if
// one has been prepared).

export const getMyCycle = query({
  args: {},
  handler: async (ctx) => {
    const scope = await requireCycleScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const cycle = await ctx.db
      .query("orderingCycles")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .first();

    if (!cycle || !cycle.isActive) {
      return { cycle: null, occurrence: null, run: null, lines: [] };
    }

    const now = Date.now();
    const occurrence = currentOccurrence(cycle, now);

    const run = await ctx.db
      .query("orderingCycleRuns")
      .withIndex("by_cycle_period", (q) =>
        q.eq("cycleId", cycle._id).eq("periodKey", occurrence.periodKey)
      )
      .unique();

    const lines = run
      ? await ctx.db
          .query("orderingCycleLines")
          .withIndex("by_run", (q) => q.eq("runId", run._id))
          .collect()
      : [];

    return {
      cycle: {
        _id: cycle._id,
        name: cycle.name,
        frequency: cycle.frequency,
        anchorDate: cycle.anchorDate,
        leadTimeDays: cycle.leadTimeDays,
        staleAfterDays: cycle.staleAfterDays,
      },
      occurrence: {
        periodKey: occurrence.periodKey,
        dueAt: occurrence.dueAt,
        nextDueAt: occurrence.nextDueAt,
        daysUntilNext: Math.ceil((occurrence.nextDueAt - now) / DAY_MS),
        isOverdue: run === null && occurrence.dueAt <= now,
      },
      run: run
        ? {
            _id: run._id,
            status: run.status,
            preparedAt: run.preparedAt,
            submittedAt: run.submittedAt ?? null,
            transferId: run.transferId ?? null,
            skippedReason: run.skippedReason ?? null,
            notes: run.notes ?? null,
            coverDays: run.coverDays,
          }
        : null,
      lines: lines
        .sort((a, b) => b.suggestedQuantity - a.suggestedQuantity)
        .map((l) => ({
          _id: l._id,
          variantId: l.variantId,
          sku: l.sku,
          label: l.label,
          suggestedQuantity: l.suggestedQuantity,
          orderedQuantity: l.orderedQuantity,
          included: l.included,
          onHandQuantity: l.onHandQuantity,
          incomingQuantity: l.incomingQuantity,
          unitsSold30d: l.unitsSold30d,
          daysSinceLastSale: l.daysSinceLastSale ?? null,
          stockAgeDays: l.stockAgeDays ?? null,
          flags: l.flags,
          reviewNote: l.reviewNote ?? null,
        })),
    };
  },
});

// ─── upsertCycle ──────────────────────────────────────────────────────────────

export const upsertCycle = mutation({
  args: {
    name: v.string(),
    frequency: v.union(v.literal("weekly"), v.literal("biweekly"), v.literal("monthly")),
    anchorDate: v.string(),
    leadTimeDays: v.number(),
    staleAfterDays: v.number(),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const scope = await requireCycleScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) throw new ConvexError("No branch in scope");

    if (!args.name.trim()) throw new ConvexError("Give the cycle a name");
    if (!/^\d{8}$/.test(args.anchorDate)) throw new ConvexError("Start date must be YYYYMMDD");
    if (!Number.isInteger(args.leadTimeDays) || args.leadTimeDays < 0 || args.leadTimeDays > 90) {
      throw new ConvexError("Lead time must be between 0 and 90 days");
    }
    if (!Number.isInteger(args.staleAfterDays) || args.staleAfterDays < 1 || args.staleAfterDays > 365) {
      throw new ConvexError("Stale threshold must be between 1 and 365 days");
    }

    const existing = await ctx.db
      .query("orderingCycles")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name.trim(),
        frequency: args.frequency,
        anchorDate: args.anchorDate,
        leadTimeDays: args.leadTimeDays,
        staleAfterDays: args.staleAfterDays,
        isActive: args.isActive ?? existing.isActive,
        updatedAt: now,
      });
      return { cycleId: existing._id };
    }

    const cycleId = await ctx.db.insert("orderingCycles", {
      branchId,
      name: args.name.trim(),
      frequency: args.frequency,
      anchorDate: args.anchorDate,
      leadTimeDays: args.leadTimeDays,
      staleAfterDays: args.staleAfterDays,
      isActive: args.isActive ?? true,
      createdById: scope.userId,
      createdAt: now,
      updatedAt: now,
    });

    return { cycleId };
  },
});

// ─── prepareOrder ─────────────────────────────────────────────────────────────
// Builds (or rebuilds) the draft for the current occurrence.
//
// Sizing: cover = cycle length + lead time. An item's target is its average
// daily sales over the last 30 days across that cover, less what is on hand and
// already on its way. Items with no sales history but stock below their
// low-stock threshold fall back to topping up to the threshold, so a new line
// is not ignored forever just because it has no history yet.

export const prepareOrder = mutation({
  args: {},
  handler: async (ctx) => {
    const scope = await requireCycleScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) throw new ConvexError("No branch in scope");

    const cycle = await ctx.db
      .query("orderingCycles")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .first();
    if (!cycle || !cycle.isActive) {
      throw new ConvexError("This store has no active ordering cycle yet");
    }

    const now = Date.now();
    const occurrence = currentOccurrence(cycle, now);

    const existingRun = await ctx.db
      .query("orderingCycleRuns")
      .withIndex("by_cycle_period", (q) =>
        q.eq("cycleId", cycle._id).eq("periodKey", occurrence.periodKey)
      )
      .unique();

    if (existingRun && existingRun.status === "submitted") {
      throw new ConvexError(
        "This cycle's order has already been submitted. Wait for the next cycle, or ask a warehouse admin to amend the transfer."
      );
    }

    const coverDays = (FREQUENCY_DAYS[cycle.frequency] ?? 7) + cycle.leadTimeDays;

    // ── Sales history: one pass over the branch's recent transactions ────────
    const since30 = now - 30 * DAY_MS;
    const historyStart = now - Math.max(90, cycle.staleAfterDays) * DAY_MS;

    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", historyStart)
      )
      .collect();

    const units30d = new Map<string, number>();
    const lastSoldAt = new Map<string, number>();

    for (const t of txns) {
      if (t.status === "voided") continue;
      const items = await ctx.db
        .query("transactionItems")
        .withIndex("by_transaction", (q) => q.eq("transactionId", t._id))
        .collect();
      for (const it of items) {
        const key = it.variantId as string;
        if (t.createdAt >= since30) {
          units30d.set(key, (units30d.get(key) ?? 0) + it.quantity);
        }
        const prev = lastSoldAt.get(key) ?? 0;
        if (t.createdAt > prev) lastSoldAt.set(key, t.createdAt);
      }
    }

    // ── Incoming stock already on its way ───────────────────────────────────
    const incoming = new Map<string, number>();
    for (const status of ["requested", "approved", "packed", "inTransit"] as const) {
      const transfers = await ctx.db
        .query("transfers")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      for (const transfer of transfers) {
        if (transfer.toBranchId !== branchId) continue;
        const items = await ctx.db
          .query("transferItems")
          .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
          .collect();
        for (const ti of items) {
          const key = ti.variantId as string;
          incoming.set(key, (incoming.get(key) ?? 0) + ti.requestedQuantity);
        }
      }
    }

    // ── Build the lines ─────────────────────────────────────────────────────
    const inventoryRows = await ctx.db
      .query("inventory")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();

    type Draft = {
      variantId: Id<"variants">;
      sku: string;
      label: string;
      suggestedQuantity: number;
      onHandQuantity: number;
      incomingQuantity: number;
      unitsSold30d: number;
      daysSinceLastSale?: number;
      stockAgeDays?: number;
      flags: string[];
    };

    const drafts: Draft[] = [];
    const styleCache = new Map<string, Doc<"styles"> | null>();

    for (const inv of inventoryRows) {
      const key = inv.variantId as string;
      const sold30 = units30d.get(key) ?? 0;
      const onHand = inv.quantity;
      const inbound = incoming.get(key) ?? 0;

      const avgDaily = sold30 / 30;
      const demandTarget = Math.ceil(avgDaily * coverDays);

      const threshold = inv.lowStockThreshold ?? 5;
      // No sales history yet — top up to the threshold rather than ordering zero
      // forever. With history, demand decides.
      const target = sold30 > 0 ? demandTarget : onHand < threshold ? threshold : 0;
      const suggested = Math.max(0, target - onHand - inbound);

      const lastSold = lastSoldAt.get(key);
      const daysSinceLastSale =
        lastSold !== undefined ? Math.floor((now - lastSold) / DAY_MS) : undefined;
      const stockAgeDays =
        inv.arrivedAt !== undefined ? Math.floor((now - inv.arrivedAt) / DAY_MS) : undefined;

      const flags: string[] = [];
      if (sold30 === 0) flags.push("noRecentSales");
      if (daysSinceLastSale !== undefined && daysSinceLastSale >= cycle.staleAfterDays) {
        flags.push("slowMoving");
      }
      if (stockAgeDays !== undefined && stockAgeDays >= 90 && onHand > 0) {
        flags.push("agedStock");
      }

      // A line earns its place either because there is a shortfall to order, or
      // because it is stock sitting here that has stopped moving and the manager
      // should decide what to do about it.
      //
      // "noRecentSales" alone is not enough to show a zero-shortfall line: on a
      // full catalogue most items sell nothing in any given 30 days, and listing
      // them all would bury the handful that actually need a decision. Only a
      // line that once sold and has since gone quiet (slowMoving), or one whose
      // stock has been sitting 90+ days (agedStock), is worth surfacing.
      const needsAssessment =
        onHand > 0 && (flags.includes("slowMoving") || flags.includes("agedStock"));
      if (suggested <= 0 && !needsAssessment) continue;

      const variant = await ctx.db.get(inv.variantId);
      if (!variant || !variant.isActive) continue;

      let style = styleCache.get(variant.styleId as string);
      if (style === undefined) {
        style = await ctx.db.get(variant.styleId);
        styleCache.set(variant.styleId as string, style);
      }

      const label = [style?.name ?? "Unknown", variant.size, variant.color]
        .filter(Boolean)
        .join(" · ");

      drafts.push({
        variantId: inv.variantId,
        sku: variant.sku,
        label,
        suggestedQuantity: suggested,
        onHandQuantity: onHand,
        incomingQuantity: inbound,
        unitsSold30d: sold30,
        daysSinceLastSale,
        stockAgeDays,
        flags,
      });
    }

    // ── Persist: replace any previous draft for this occurrence ─────────────
    let runId: Id<"orderingCycleRuns">;

    if (existingRun) {
      // Preserve the manager's notes across a re-prepare; the lines are rebuilt.
      const oldLines = await ctx.db
        .query("orderingCycleLines")
        .withIndex("by_run", (q) => q.eq("runId", existingRun._id))
        .collect();
      for (const line of oldLines) await ctx.db.delete(line._id);

      await ctx.db.patch(existingRun._id, {
        status: "draft",
        coverDays,
        preparedAt: now,
        preparedById: scope.userId,
        skippedReason: undefined,
      });
      runId = existingRun._id;
    } else {
      runId = await ctx.db.insert("orderingCycleRuns", {
        cycleId: cycle._id,
        branchId,
        periodKey: occurrence.periodKey,
        status: "draft",
        dueAt: occurrence.dueAt,
        coverDays,
        preparedAt: now,
        preparedById: scope.userId,
      });
    }

    for (const d of drafts) {
      // A line that stopped selling starts switched OFF. Reordering it is then a
      // deliberate act, which is the whole point of a human-reviewed cycle.
      const included = d.suggestedQuantity > 0 && !d.flags.includes("noRecentSales");
      await ctx.db.insert("orderingCycleLines", {
        runId,
        branchId,
        variantId: d.variantId,
        sku: d.sku,
        label: d.label,
        suggestedQuantity: d.suggestedQuantity,
        orderedQuantity: d.suggestedQuantity,
        included,
        onHandQuantity: d.onHandQuantity,
        incomingQuantity: d.incomingQuantity,
        unitsSold30d: d.unitsSold30d,
        daysSinceLastSale: d.daysSinceLastSale,
        stockAgeDays: d.stockAgeDays,
        flags: d.flags,
      });
    }

    return { runId, lineCount: drafts.length, coverDays };
  },
});

// ─── updateLine ───────────────────────────────────────────────────────────────

export const updateLine = mutation({
  args: {
    lineId: v.id("orderingCycleLines"),
    orderedQuantity: v.optional(v.number()),
    included: v.optional(v.boolean()),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await requireCycleScope(ctx);

    const line = await ctx.db.get(args.lineId);
    if (!line) throw new ConvexError("Line not found");
    if (line.branchId !== scope.branchId) {
      throw new ConvexError({ code: "BRANCH_MISMATCH", message: "Not your store's order" });
    }

    const run = await ctx.db.get(line.runId);
    if (!run || run.status !== "draft") {
      throw new ConvexError("This order is no longer a draft");
    }

    if (args.orderedQuantity !== undefined) {
      if (!Number.isInteger(args.orderedQuantity) || args.orderedQuantity < 0) {
        throw new ConvexError("Quantity must be a whole number of 0 or more");
      }
    }

    await ctx.db.patch(args.lineId, {
      ...(args.orderedQuantity !== undefined ? { orderedQuantity: args.orderedQuantity } : {}),
      ...(args.included !== undefined ? { included: args.included } : {}),
      ...(args.reviewNote !== undefined
        ? { reviewNote: args.reviewNote.trim() || undefined }
        : {}),
    });
  },
});

// ─── setRunNotes ──────────────────────────────────────────────────────────────

export const setRunNotes = mutation({
  args: { runId: v.id("orderingCycleRuns"), notes: v.string() },
  handler: async (ctx, args) => {
    const scope = await requireCycleScope(ctx);
    const run = await ctx.db.get(args.runId);
    if (!run) throw new ConvexError("Order not found");
    if (run.branchId !== scope.branchId) {
      throw new ConvexError({ code: "BRANCH_MISMATCH", message: "Not your store's order" });
    }
    if (run.status !== "draft") throw new ConvexError("This order is no longer a draft");

    await ctx.db.patch(args.runId, { notes: args.notes.trim() || undefined });
  },
});

// ─── skipCycle ────────────────────────────────────────────────────────────────
// Recording a decision not to order is as much a part of the cycle as ordering.

export const skipCycle = mutation({
  args: { runId: v.id("orderingCycleRuns"), reason: v.string() },
  handler: async (ctx, args) => {
    const scope = await requireCycleScope(ctx);

    const run = await ctx.db.get(args.runId);
    if (!run) throw new ConvexError("Order not found");
    if (run.branchId !== scope.branchId) {
      throw new ConvexError({ code: "BRANCH_MISMATCH", message: "Not your store's order" });
    }
    if (run.status !== "draft") throw new ConvexError("This order is no longer a draft");
    if (!args.reason.trim()) throw new ConvexError("Give a reason for skipping this cycle");

    await ctx.db.patch(args.runId, {
      status: "skipped",
      skippedReason: args.reason.trim(),
      submittedAt: Date.now(),
      submittedById: scope.userId,
    });
  },
});

// ─── submitOrder ──────────────────────────────────────────────────────────────
// The one place a cycle turns into a real order, and only ever by hand.
//
// Goes through createTransferForRequester so the order holds stock at the
// warehouse and enters the normal approval queue exactly like a manually raised
// stock request. The run keeps the resulting transferId, so an order can always
// be traced back to the cycle and the figures it was judged on.

export const submitOrder = mutation({
  args: { runId: v.id("orderingCycleRuns") },
  handler: async (ctx, args) => {
    const scope = await requireCycleScope(ctx);

    const run = await ctx.db.get(args.runId);
    if (!run) throw new ConvexError("Order not found");
    if (run.branchId !== scope.branchId) {
      throw new ConvexError({ code: "BRANCH_MISMATCH", message: "Not your store's order" });
    }
    if (run.status !== "draft") {
      throw new ConvexError("This order has already been submitted or skipped");
    }

    const lines = await ctx.db
      .query("orderingCycleLines")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();

    const toOrder = lines.filter((l) => l.included && l.orderedQuantity > 0);
    if (toOrder.length === 0) {
      throw new ConvexError(
        "Nothing is switched on to order. Include at least one line, or skip this cycle instead."
      );
    }

    // Stock requests come from the central warehouse.
    const branches = await ctx.db.query("branches").collect();
    const warehouse = branches.find((b) => b.channel === "warehouse" && b.isActive);
    if (!warehouse) {
      throw new ConvexError("No active central warehouse is configured to order from");
    }

    const transferId = await createTransferForRequester(ctx, scope, {
      fromBranchId: warehouse._id,
      toBranchId: run.branchId,
      type: "stockRequest",
      notes: run.notes
        ? `Ordering cycle ${run.periodKey} — ${run.notes}`
        : `Ordering cycle ${run.periodKey}`,
      items: toOrder.map((l) => ({ sku: l.sku, requestedQuantity: l.orderedQuantity })),
    });

    await ctx.db.patch(args.runId, {
      status: "submitted",
      submittedAt: Date.now(),
      submittedById: scope.userId,
      transferId,
    });

    return {
      transferId,
      lineCount: toOrder.length,
      unitCount: toOrder.reduce((sum, l) => sum + l.orderedQuantity, 0),
    };
  },
});

// ─── listRuns ─────────────────────────────────────────────────────────────────

export const listRuns = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const scope = await requireCycleScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return [];

    const runs = await ctx.db
      .query("orderingCycleRuns")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .order("desc")
      .take(args.limit ?? 12);

    const out = [];
    for (const run of runs) {
      const lines = await ctx.db
        .query("orderingCycleLines")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect();
      const included = lines.filter((l) => l.included);
      out.push({
        _id: run._id,
        periodKey: run.periodKey,
        status: run.status,
        dueAt: run.dueAt,
        preparedAt: run.preparedAt,
        submittedAt: run.submittedAt ?? null,
        transferId: run.transferId ?? null,
        skippedReason: run.skippedReason ?? null,
        lineCount: included.length,
        unitCount: included.reduce((sum, l) => sum + l.orderedQuantity, 0),
      });
    }
    return out;
  },
});

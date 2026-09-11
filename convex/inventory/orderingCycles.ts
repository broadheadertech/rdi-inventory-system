// convex/inventory/orderingCycles.ts — recurring branch ordering windows.
//
// A cycle says how often a store orders and how long stock takes to arrive.
// When an occurrence comes due, `prepareOrder` builds a DRAFT from real demand
// and gives each line a verdict — Order, Review or Don't order — on three
// grounds: whether the threshold trigger fired, how fast the item moves at this
// store, and how old the stock here is. The reasons are stored with the line,
// so whoever approves it judges on the same basis the manager saw.
//
// Nothing is ordered until the manager submits. Then the lines the verdict
// supports go straight to the warehouse as an approved stock request, and
// anything else the manager chose to include waits for HQ sign-off; only what
// HQ approves becomes a second, approved stock request.

import { query, mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import { QueryCtx, MutationCtx } from "../_generated/server";
import { withBranchScope, type BranchScope } from "../_helpers/withBranchScope";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { approveTransferRecord, createTransferForRequester } from "../transfers/requests";

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Managers run their own store's cycle; admin/HQ can act for a branch in view.
const CYCLE_ROLES = ["admin", "hqStaff", "manager"] as const;

const FREQUENCY_DAYS: Record<string, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

// Days-of-cover buckets for movement — the ones Product Movers uses.
const FAST_UNDER_DAYS_OF_COVER = 14;
const SLOW_OVER_DAYS_OF_COVER = 60;

// Aging tiers — the cut-offs the POS applies to aging promotions.
const AGING_YELLOW_AFTER_DAYS = 90;
const AGING_RED_AFTER_DAYS = 180;

// An item's low-stock threshold where none is set on its inventory row.
const DEFAULT_LOW_STOCK_THRESHOLD = 5;

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

// ─── the ordering basis ───────────────────────────────────────────────────────

type Movement = "fast" | "medium" | "slow" | "none";
type AgingTier = "green" | "yellow" | "red";
type Verdict = "order" | "review" | "dontOrder";

/**
 * How fast an item moves at this store, and the days of cover that decided it:
 * stock on hand ÷ average daily sales over the last 30 days. Under 14 days is
 * fast, over 60 slow, and between them normal ("medium").
 *
 * Not HQ's Movement Index: that squares daily sales, so at one store's per-SKU
 * volumes it rates nearly everything slow — 6 a month with 5 on hand scores
 * 0.008 against a 0.10 cut-off. Days of cover weighs the pace of sales against
 * the stock that pace has to clear, at any volume.
 */
function classifyMovement(
  sold30: number,
  onHand: number
): { movement: Movement; movementScore: number; describe: string } {
  if (sold30 <= 0) return { movement: "none", movementScore: 0, describe: "No sales in 30 days" };
  const daysOfCover = Math.round(Math.max(0, onHand) / (sold30 / 30));
  const movement: Movement =
    daysOfCover < FAST_UNDER_DAYS_OF_COVER
      ? "fast"
      : daysOfCover > SLOW_OVER_DAYS_OF_COVER
        ? "slow"
        : "medium";
  const word = movement === "fast" ? "Fast" : movement === "medium" ? "Normal" : "Slow";
  return {
    movement,
    movementScore: daysOfCover,
    describe: `${word} moving: ${daysOfCover} days of stock at the current pace`,
  };
}

function agingTierFor(ageDays: number): AgingTier {
  if (ageDays > AGING_RED_AFTER_DAYS) return "red";
  if (ageDays > AGING_YELLOW_AFTER_DAYS) return "yellow";
  return "green";
}

/**
 * Age in days of the oldest units on hand here, from the oldest batch still
 * holding stock — how the POS reckons aging. Batches are deleted once used up,
 * so the first by receivedAt is the oldest with stock. Falls back to the
 * inventory row's arrival date where no batch is recorded.
 */
async function oldestStockAgeDays(
  ctx: MutationCtx,
  inv: Doc<"inventory">,
  now: number
): Promise<number | null> {
  const oldest = await ctx.db
    .query("inventoryBatches")
    .withIndex("by_branch_variant_received", (q) =>
      q.eq("branchId", inv.branchId).eq("variantId", inv.variantId)
    )
    .first();
  const receivedAt = oldest && oldest.quantity > 0 ? oldest.receivedAt : inv.arrivedAt;
  return receivedAt === undefined ? null : Math.floor((now - receivedAt) / DAY_MS);
}

/**
 * The verdict for one line, with its reasons in the order they decided it.
 *
 * Don't order: the trigger did not fire, the stock here is red-aged, or it has
 * not sold in 30 days while there is stock on hand. Review: the trigger fired
 * but the item is slow, yellow-aged, or has no recent sales and no stock to
 * judge by. Order: the trigger fired for a fast or medium mover whose stock is
 * fresh.
 */
function decideVerdict(b: {
  triggered: boolean;
  projectedStock: number;
  threshold: number;
  onHand: number;
  movement: Movement;
  movementDescription: string;
  agingTier: AgingTier | null;
  stockAgeDays: number | null;
  daysSinceLastSale: number | null;
  lookbackDays: number;
}): { verdict: Verdict; reasons: string[] } {
  const trigger = b.triggered
    ? `Trigger: projected to fall to ${b.projectedStock} before the next restock (threshold ${b.threshold})`
    : `No trigger: projected to hold ${b.projectedStock} until the next restock (threshold ${b.threshold})`;

  if (!b.triggered) return { verdict: "dontOrder", reasons: [trigger] };
  if (b.agingTier === "red") {
    return {
      verdict: "dontOrder",
      reasons: [
        trigger,
        `Aged stock: oldest units here are ${b.stockAgeDays} days old (over ${AGING_RED_AFTER_DAYS})`,
      ],
    };
  }
  if (b.movement === "none" && b.onHand > 0) {
    return {
      verdict: "dontOrder",
      reasons: [trigger, `No sales in 30 days with ${b.onHand} on hand`],
    };
  }

  const concerns: string[] = [];
  if (b.movement === "slow") concerns.push(b.movementDescription);
  if (b.agingTier === "yellow") {
    concerns.push(
      `Aging: oldest units here are ${b.stockAgeDays} days old (over ${AGING_YELLOW_AFTER_DAYS})`
    );
  }
  if (b.movement === "none") {
    concerns.push(
      b.daysSinceLastSale === null
        ? `No sale here in the last ${b.lookbackDays} days — a new line, or not selling`
        : "No sales in 30 days and none on hand — it may have been out of stock"
    );
  }
  if (concerns.length > 0) return { verdict: "review", reasons: [trigger, ...concerns] };

  return {
    verdict: "order",
    reasons: [
      trigger,
      b.movementDescription,
      b.stockAgeDays === null
        ? "No stock on hand to age"
        : `Fresh stock: oldest units here are ${b.stockAgeDays} days old`,
    ],
  };
}

/**
 * Whether an included line needs HQ sign-off: the verdict alone approves only
 * an Order line at or under its suggested quantity. Mirrored by
 * lineNeedsSignOff in components/ordering/OrderingBasis.tsx.
 */
function needsSignOff(line: Doc<"orderingCycleLines">): boolean {
  return line.verdict !== "order" || line.orderedQuantity > line.suggestedQuantity;
}

async function findWarehouse(ctx: MutationCtx): Promise<Doc<"branches">> {
  // Stock requests come from the central warehouse.
  const branches = await ctx.db.query("branches").collect();
  const warehouse = branches.find((b) => b.channel === "warehouse" && b.isActive);
  if (!warehouse) {
    throw new ConvexError("No active central warehouse is configured to order from");
  }
  return warehouse;
}

const VERDICT_RANK: Record<string, number> = { order: 0, review: 1, dontOrder: 2 };

function sortLines(lines: Doc<"orderingCycleLines">[]): Doc<"orderingCycleLines">[] {
  return [...lines].sort(
    (a, b) =>
      (VERDICT_RANK[a.verdict ?? ""] ?? 3) - (VERDICT_RANK[b.verdict ?? ""] ?? 3) ||
      b.suggestedQuantity - a.suggestedQuantity
  );
}

function lineView(l: Doc<"orderingCycleLines">) {
  return {
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
    movement: l.movement ?? null,
    movementScore: l.movementScore ?? null,
    agingTier: l.agingTier ?? null,
    lowStockThreshold: l.lowStockThreshold ?? null,
    projectedStock: l.projectedStock ?? null,
    triggered: l.triggered ?? null,
    verdict: l.verdict ?? null,
    verdictReasons: l.verdictReasons ?? [],
    signOff: l.signOff ?? null,
    signOffNote: l.signOffNote ?? null,
  };
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
            signOff: {
              pending: lines.filter((l) => l.signOff === "pending").length,
              approved: lines.filter((l) => l.signOff === "approved").length,
              rejected: lines.filter((l) => l.signOff === "rejected").length,
            },
          }
        : null,
      lines: sortLines(lines).map(lineView),
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
// Cover = cycle length + lead time: this order must last until the one after it
// arrives. The threshold trigger fires when the stock projected to be left at
// the end of that window — on hand + incoming − expected sales — falls to or
// below the item's low-stock threshold. The suggestion is what brings the end
// of the window back to the threshold, so the threshold is the safety stock.

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
    const lookbackDays = Math.max(90, cycle.staleAfterDays);
    const historyStart = now - lookbackDays * DAY_MS;

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
      daysSinceLastSale: number | null;
      stockAgeDays: number | null;
      flags: string[];
      movement: Movement;
      movementScore: number;
      agingTier: AgingTier | null;
      lowStockThreshold: number;
      projectedStock: number;
      triggered: boolean;
      verdict: Verdict;
      verdictReasons: string[];
    };

    const drafts: Draft[] = [];
    const styleCache = new Map<string, Doc<"styles"> | null>();

    for (const inv of inventoryRows) {
      const key = inv.variantId as string;
      const sold30 = units30d.get(key) ?? 0;
      const onHand = inv.quantity;
      const inbound = incoming.get(key) ?? 0;

      // Threshold trigger. Projected stock is rounded down, to err toward not
      // running out.
      const threshold = inv.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
      const expectedSales = (Math.max(0, sold30) / 30) * coverDays;
      const projectedStock = Math.floor(onHand + inbound - expectedSales);
      const triggered = projectedStock <= threshold;
      const suggested = triggered ? Math.max(1, threshold - projectedStock) : 0;

      const lastSold = lastSoldAt.get(key);
      const daysSinceLastSale =
        lastSold !== undefined ? Math.floor((now - lastSold) / DAY_MS) : null;
      const stockAgeDays = onHand > 0 ? await oldestStockAgeDays(ctx, inv, now) : null;
      const agingTier = stockAgeDays === null ? null : agingTierFor(stockAgeDays);
      const goneQuiet =
        daysSinceLastSale !== null && daysSinceLastSale >= cycle.staleAfterDays;

      // A line earns its place when the trigger fired, or when stock sitting here
      // has gone quiet or aged and the manager should decide what to do with it.
      // Not every unsold item: on a full catalogue most sell nothing in a given
      // month, and listing them all would bury the lines that need a decision.
      const needsAssessment =
        onHand > 0 && (goneQuiet || agingTier === "yellow" || agingTier === "red");
      if (!triggered && !needsAssessment) continue;

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

      const { movement, movementScore, describe } = classifyMovement(sold30, onHand);
      const { verdict, reasons } = decideVerdict({
        triggered,
        projectedStock,
        threshold,
        onHand,
        movement,
        movementDescription: describe,
        agingTier,
        stockAgeDays,
        daysSinceLastSale,
        lookbackDays,
      });

      const flags: string[] = [];
      if (sold30 <= 0) flags.push("noRecentSales");
      if (goneQuiet) flags.push("slowMoving");
      if (agingTier === "yellow" || agingTier === "red") flags.push("agedStock");

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
        movement,
        movementScore,
        agingTier,
        lowStockThreshold: threshold,
        projectedStock,
        triggered,
        verdict,
        verdictReasons: reasons,
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
      // Only an Order verdict starts switched on. Including anything else is a
      // deliberate act, and one that goes to HQ for sign-off.
      await ctx.db.insert("orderingCycleLines", {
        runId,
        branchId,
        variantId: d.variantId,
        sku: d.sku,
        label: d.label,
        suggestedQuantity: d.suggestedQuantity,
        orderedQuantity: d.suggestedQuantity,
        included: d.verdict === "order",
        onHandQuantity: d.onHandQuantity,
        incomingQuantity: d.incomingQuantity,
        unitsSold30d: d.unitsSold30d,
        daysSinceLastSale: d.daysSinceLastSale ?? undefined,
        stockAgeDays: d.stockAgeDays ?? undefined,
        flags: d.flags,
        movement: d.movement,
        movementScore: d.movementScore,
        agingTier: d.agingTier ?? undefined,
        lowStockThreshold: d.lowStockThreshold,
        projectedStock: d.projectedStock,
        triggered: d.triggered,
        verdict: d.verdict,
        verdictReasons: d.verdictReasons,
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
// Lines the verdict supports become a stock request through
// createTransferForRequester — holding stock at the warehouse exactly like a
// manually raised request — and are approved on that basis at once, so they go
// straight to packing. Everything else included is marked for HQ sign-off. The
// run keeps the resulting transferId, so an order can always be traced back to
// the cycle and the figures it was judged on.

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

    if (lines.some((l) => l.verdict === undefined)) {
      throw new ConvexError(
        "This draft was prepared before order verdicts existed. Rebuild it, then submit."
      );
    }

    const toOrder = lines.filter((l) => l.included && l.orderedQuantity > 0);
    if (toOrder.length === 0) {
      throw new ConvexError(
        "Nothing is switched on to order. Include at least one line, or skip this cycle instead."
      );
    }

    const approvedOnVerdict = toOrder.filter((l) => !needsSignOff(l));
    const forSignOff = toOrder.filter(needsSignOff);

    let transferId: Id<"transfers"> | undefined;
    if (approvedOnVerdict.length > 0) {
      const warehouse = await findWarehouse(ctx);
      transferId = await createTransferForRequester(ctx, scope, {
        fromBranchId: warehouse._id,
        toBranchId: run.branchId,
        type: "stockRequest",
        notes: run.notes
          ? `Ordering cycle ${run.periodKey} — ${run.notes}`
          : `Ordering cycle ${run.periodKey}`,
        items: approvedOnVerdict.map((l) => ({ sku: l.sku, requestedQuantity: l.orderedQuantity })),
      });
      await approveTransferRecord(ctx, transferId, {
        actorId: scope.userId,
        basis: `Ordering cycle ${run.periodKey}: every line has an Order verdict`,
      });
    }

    for (const line of forSignOff) {
      await ctx.db.patch(line._id, { signOff: "pending" });
    }

    await ctx.db.patch(args.runId, {
      status: "submitted",
      submittedAt: Date.now(),
      submittedById: scope.userId,
      transferId,
    });

    const units = (ls: Doc<"orderingCycleLines">[]) =>
      ls.reduce((sum, l) => sum + l.orderedQuantity, 0);
    return {
      transferId: transferId ?? null,
      approvedLineCount: approvedOnVerdict.length,
      approvedUnitCount: units(approvedOnVerdict),
      signOffLineCount: forSignOff.length,
      signOffUnitCount: units(forSignOff),
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
        pendingSignOffCount: lines.filter((l) => l.signOff === "pending").length,
      });
    }
    return out;
  },
});

// ─── HQ sign-off ──────────────────────────────────────────────────────────────
// Included lines the verdict does not approve wait here for HQ, every store at
// once, with the basis the manager saw.

export const listPendingSignOffs = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);

    const pending = await ctx.db
      .query("orderingCycleLines")
      .withIndex("by_signOff", (q) => q.eq("signOff", "pending"))
      .collect();

    const byRun = new Map<string, Doc<"orderingCycleLines">[]>();
    for (const line of pending) {
      const arr = byRun.get(line.runId as string) ?? [];
      arr.push(line);
      byRun.set(line.runId as string, arr);
    }

    const out = [];
    for (const [runId, lines] of byRun) {
      const run = await ctx.db.get(runId as Id<"orderingCycleRuns">);
      if (!run) continue;
      const branch = await ctx.db.get(run.branchId);
      const submitter = run.submittedById ? await ctx.db.get(run.submittedById) : null;
      out.push({
        runId: run._id,
        branchName: branch?.name ?? "Unknown store",
        periodKey: run.periodKey,
        dueAt: run.dueAt,
        coverDays: run.coverDays,
        submittedAt: run.submittedAt ?? null,
        submittedByName: submitter?.name ?? "Unknown",
        notes: run.notes ?? null,
        // The part of the order already sent on its verdict, if any.
        approvedOnVerdictTransferId: run.transferId ?? null,
        lines: sortLines(lines).map(lineView),
      });
    }

    // Oldest first — they have waited longest.
    return out.sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0));
  },
});

export const signOffLines = mutation({
  args: {
    runId: v.id("orderingCycleRuns"),
    decisions: v.array(
      v.object({
        lineId: v.id("orderingCycleLines"),
        approve: v.boolean(),
        quantity: v.optional(v.number()),
      })
    ),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const hqUser = await requireRole(ctx, HQ_ROLES);

    const run = await ctx.db.get(args.runId);
    if (!run) throw new ConvexError("Order not found");
    if (run.status !== "submitted" || !run.submittedById) {
      throw new ConvexError("This order has not been submitted");
    }
    if (args.decisions.length === 0) throw new ConvexError("Nothing to sign off");

    const approved: { line: Doc<"orderingCycleLines">; quantity: number }[] = [];
    const rejected: Doc<"orderingCycleLines">[] = [];
    for (const d of args.decisions) {
      const line = await ctx.db.get(d.lineId);
      if (!line || line.runId !== run._id) throw new ConvexError("Line not found on this order");
      if (line.signOff !== "pending") {
        throw new ConvexError(`${line.sku} is no longer awaiting sign-off`);
      }
      if (!d.approve) {
        rejected.push(line);
        continue;
      }
      const quantity = d.quantity ?? line.orderedQuantity;
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new ConvexError(`The approved quantity for ${line.sku} must be a whole number above 0`);
      }
      approved.push({ line, quantity });
    }

    const note = args.note?.trim() || undefined;
    const now = Date.now();

    // What HQ approves becomes its own stock request, raised in the name of the
    // manager who asked for it and approved by the HQ user who signed it off.
    let transferId: Id<"transfers"> | undefined;
    if (approved.length > 0) {
      const requester = await ctx.db.get(run.submittedById);
      if (!requester) {
        throw new ConvexError("The manager who submitted this order no longer exists");
      }
      const requesterScope: BranchScope = {
        user: requester,
        userId: requester._id,
        branchId: run.branchId,
        canAccessAllBranches: false,
      };
      const warehouse = await findWarehouse(ctx);
      transferId = await createTransferForRequester(ctx, requesterScope, {
        fromBranchId: warehouse._id,
        toBranchId: run.branchId,
        type: "stockRequest",
        notes: `Ordering cycle ${run.periodKey} — signed off by ${hqUser.name}${note ? ` — ${note}` : ""}`,
        items: approved.map(({ line, quantity }) => ({ sku: line.sku, requestedQuantity: quantity })),
      });
      await approveTransferRecord(ctx, transferId, {
        actorId: hqUser._id,
        approvedById: hqUser._id,
        basis: `HQ sign-off of ordering cycle ${run.periodKey}`,
      });
    }

    for (const { line, quantity } of approved) {
      await ctx.db.patch(line._id, {
        signOff: "approved",
        orderedQuantity: quantity,
        signOffById: hqUser._id,
        signOffAt: now,
        signOffNote: note,
        signOffTransferId: transferId,
      });
    }
    for (const line of rejected) {
      await ctx.db.patch(line._id, {
        signOff: "rejected",
        signOffById: hqUser._id,
        signOffAt: now,
        signOffNote: note,
      });
    }

    return {
      transferId: transferId ?? null,
      approvedCount: approved.length,
      rejectedCount: rejected.length,
    };
  },
});

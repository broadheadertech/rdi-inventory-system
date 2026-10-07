// convex/analytics/logisticsReport.ts — what the logistics chain actually did.
//
// Nearly everything here was already being written down and never read. Every
// transfer records its handshake timestamps, every receipt is a count of
// scans, every wrong scan is kept, every difference raises a dispute with a
// cause on it. Four questions fall straight out of that and none of them had
// an answer anywhere in the system:
//
//   accuracy    did what was packed arrive, and what did the gap cost
//   cycle time  where do the days go between the request and the shelf
//   disputes    are the differences counting errors or real loss
//   throughput  how much moved, how much of a push landed, what is in transit
//
// One query rather than four, because all four read the same transfers: doing
// it in one pass reads each transfer's items, boxes and scans once instead of
// four times. The cost is in the transfer table scan, so the window is capped.
//
// Everything is measured on DELIVERED transfers except throughput, which has
// to count the requests that were refused as well as the ones that landed.

import { query } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import {
  STAGES,
  lineDifference,
  stageGaps,
  statOf,
  type StageKey,
} from "./logisticsStats";

// Warehouse staff run the chain, so they can read the report on it.
const LOGISTICS_REPORT_ROLES = Array.from(new Set([...HQ_ROLES, "warehouseStaff"]));

/** Past this the table scan stops being worth it. */
const MAX_WINDOW_DAYS = 400;

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** YYYYMMDD → the PHT midnight that starts it, or that ends it. */
function ymdToMs(ymd: string, endOfDay = false): number {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(4, 6)) - 1;
  const day = Number(ymd.slice(6, 8));
  const base = Date.UTC(year, month, day) - PHT_OFFSET_MS;
  return endOfDay ? base + DAY_MS - 1 : base;
}

// ─── What one delivered transfer is worth to the report ──────────────────────

type Measured = {
  transfer: Doc<"transfers">;
  laneKey: string;
  packedUnits: number;
  receivedUnits: number;
  shortUnits: number;
  overUnits: number;
  damagedLines: number;
  scannedUnits: number;
  flaggedBoxes: number;
  boxCount: number;
  wrongItemScans: number;
  unknownCodeScans: number;
  shortValueCentavos: number;
  /** Short units that carried no cost price, so the value above is partial. */
  unvaluedShortUnits: number;
};

const OPEN_STATUSES = ["requested", "approved", "packed", "inTransit"];

// ─── getLogisticsReport ──────────────────────────────────────────────────────

export const getLogisticsReport = query({
  args: {
    dateStart: v.string(), // YYYYMMDD
    dateEnd: v.string(), // YYYYMMDD, inclusive
    fromBranchId: v.optional(v.id("branches")),
    toBranchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, LOGISTICS_REPORT_ROLES);

    const startMs = ymdToMs(args.dateStart);
    const endMs = ymdToMs(args.dateEnd, true);
    if (endMs < startMs) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "The end date falls before the start date.",
      });
    }
    if (endMs - startMs > MAX_WINDOW_DAYS * DAY_MS) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: `That range is longer than ${MAX_WINDOW_DAYS} days.`,
      });
    }

    const branches = await ctx.db.query("branches").collect();
    const branchName = new Map<string, string>(
      branches.map((b) => [b._id as string, b.name])
    );
    const nameOf = (id: Id<"branches">) => branchName.get(id as string) ?? "(unknown)";

    // One scan, then partitioned. Every section below reads from it, which is
    // the whole reason this is a single query.
    const allTransfers = await ctx.db.query("transfers").collect();
    const inLane = (t: Doc<"transfers">) =>
      (!args.fromBranchId || t.fromBranchId === args.fromBranchId) &&
      (!args.toBranchId || t.toBranchId === args.toBranchId);

    const lanePool = allTransfers.filter(inLane);
    const delivered = lanePool.filter(
      (t) =>
        t.status === "delivered" &&
        t.deliveredAt !== undefined &&
        t.deliveredAt >= startMs &&
        t.deliveredAt <= endMs
    );
    const raised = lanePool.filter(
      (t) => t.createdAt >= startMs && t.createdAt <= endMs
    );
    const openNow = lanePool.filter((t) => OPEN_STATUSES.includes(t.status));

    // ── Measure every delivered transfer once ────────────────────────────────
    const costCache = new Map<string, number | null>();
    async function unitCost(variantId: Id<"variants">): Promise<number | null> {
      const key = variantId as string;
      const cached = costCache.get(key);
      if (cached !== undefined) return cached;
      const variant = await ctx.db.get(variantId);
      const cost = variant?.costPriceCentavos ?? null;
      costCache.set(key, cost && cost > 0 ? cost : null);
      return costCache.get(key) ?? null;
    }

    const measured: Measured[] = [];
    for (const transfer of delivered) {
      const items = await ctx.db
        .query("transferItems")
        .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
        .collect();
      const boxes = await ctx.db
        .query("transferBoxes")
        .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
        .collect();
      const scans = await ctx.db
        .query("receivingScans")
        .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
        .collect();

      let packedUnits = 0;
      let receivedUnits = 0;
      let shortUnits = 0;
      let overUnits = 0;
      let damagedLines = 0;
      let shortValueCentavos = 0;
      let unvaluedShortUnits = 0;

      for (const item of items) {
        const line = lineDifference(
          item.packedQuantity,
          item.requestedQuantity,
          item.receivedQuantity
        );
        packedUnits += line.packed;
        receivedUnits += line.received;
        shortUnits += line.short;
        overUnits += line.over;
        if (item.damageNotes) damagedLines++;

        if (line.short > 0) {
          const cost = await unitCost(item.variantId);
          if (cost === null) unvaluedShortUnits += line.short;
          else shortValueCentavos += cost * line.short;
        }
      }

      let wrongItemScans = 0;
      let unknownCodeScans = 0;
      for (const box of boxes) {
        const refused = await ctx.db
          .query("receivingRejectedScans")
          .withIndex("by_box", (q) => q.eq("boxId", box._id))
          .collect();
        for (const scan of refused) {
          if (scan.reason === "notInBox") wrongItemScans++;
          else unknownCodeScans++;
        }
      }

      measured.push({
        transfer,
        laneKey: `${transfer.fromBranchId as string}>${transfer.toBranchId as string}`,
        packedUnits,
        receivedUnits,
        shortUnits,
        overUnits,
        damagedLines,
        // Undone scans are mis-scans taken back and are not a count.
        scannedUnits: scans.filter((s) => s.undoneAt === undefined).length,
        flaggedBoxes: boxes.filter((b) => b.status === "discrepancy").length,
        boxCount: boxes.length,
        wrongItemScans,
        unknownCodeScans,
        shortValueCentavos,
        unvaluedShortUnits,
      });
    }

    // ── Disputes ─────────────────────────────────────────────────────────────
    // Every receiving dispute, not only this window's: the open ones are
    // counted wherever they were raised, because an unanswered difference from
    // two months ago is still unanswered. The settled figures are the ones
    // bounded by the window.
    const allDisputes = (await ctx.db.query("disputes").collect()).filter(
      (d) => d.kind === "transferReceiving"
    );
    const laneTransferIds = new Set(lanePool.map((t) => t._id as string));
    const laneDisputes = allDisputes.filter(
      (d) => !d.transferId || laneTransferIds.has(d.transferId as string)
    );
    const disputedTransferIds = new Set(
      laneDisputes.map((d) => d.transferId as string | undefined).filter(Boolean) as string[]
    );

    // ── Section 1: accuracy, by lane ─────────────────────────────────────────
    type LaneRow = {
      laneKey: string;
      fromBranchName: string;
      toBranchName: string;
      transfers: number;
      packedUnits: number;
      receivedUnits: number;
      shortUnits: number;
      overUnits: number;
      damagedLines: number;
      scannedUnits: number;
      boxCount: number;
      flaggedBoxes: number;
      wrongItemScans: number;
      unknownCodeScans: number;
      shortValueCentavos: number;
      unvaluedShortUnits: number;
      disputedTransfers: number;
      accuracyPercent: number | null;
      medianTotalHours: number;
    };

    const laneRows = new Map<string, LaneRow>();
    const laneTotals = new Map<string, number[]>();

    for (const m of measured) {
      let row = laneRows.get(m.laneKey);
      if (!row) {
        row = {
          laneKey: m.laneKey,
          fromBranchName: nameOf(m.transfer.fromBranchId),
          toBranchName: nameOf(m.transfer.toBranchId),
          transfers: 0,
          packedUnits: 0,
          receivedUnits: 0,
          shortUnits: 0,
          overUnits: 0,
          damagedLines: 0,
          scannedUnits: 0,
          boxCount: 0,
          flaggedBoxes: 0,
          wrongItemScans: 0,
          unknownCodeScans: 0,
          shortValueCentavos: 0,
          unvaluedShortUnits: 0,
          disputedTransfers: 0,
          accuracyPercent: null,
          medianTotalHours: 0,
        };
        laneRows.set(m.laneKey, row);
        laneTotals.set(m.laneKey, []);
      }
      row.transfers++;
      row.packedUnits += m.packedUnits;
      row.receivedUnits += m.receivedUnits;
      row.shortUnits += m.shortUnits;
      row.overUnits += m.overUnits;
      row.damagedLines += m.damagedLines;
      row.scannedUnits += m.scannedUnits;
      row.boxCount += m.boxCount;
      row.flaggedBoxes += m.flaggedBoxes;
      row.wrongItemScans += m.wrongItemScans;
      row.unknownCodeScans += m.unknownCodeScans;
      row.shortValueCentavos += m.shortValueCentavos;
      row.unvaluedShortUnits += m.unvaluedShortUnits;
      if (disputedTransferIds.has(m.transfer._id as string)) row.disputedTransfers++;

      const total = stageGaps(m.transfer).total;
      if (total !== null) laneTotals.get(m.laneKey)!.push(total);
    }

    for (const [laneKey, row] of laneRows) {
      row.accuracyPercent =
        row.packedUnits > 0 ? (row.receivedUnits / row.packedUnits) * 100 : null;
      row.medianTotalHours = statOf(laneTotals.get(laneKey) ?? []).medianHours;
    }

    const sum = <K extends keyof Measured>(key: K): number =>
      measured.reduce((acc, m) => acc + (m[key] as number), 0);

    const packedUnits = sum("packedUnits");
    const receivedUnits = sum("receivedUnits");
    const shortUnits = sum("shortUnits");

    const accuracy = {
      transfers: measured.length,
      packedUnits,
      receivedUnits,
      shortUnits,
      overUnits: sum("overUnits"),
      damagedLines: sum("damagedLines"),
      scannedUnits: sum("scannedUnits"),
      boxCount: sum("boxCount"),
      flaggedBoxes: sum("flaggedBoxes"),
      wrongItemScans: sum("wrongItemScans"),
      unknownCodeScans: sum("unknownCodeScans"),
      shortValueCentavos: sum("shortValueCentavos"),
      unvaluedShortUnits: sum("unvaluedShortUnits"),
      accuracyPercent: packedUnits > 0 ? (receivedUnits / packedUnits) * 100 : null,
      // Transfers that arrived exactly as packed, with nothing damaged.
      cleanTransfers: measured.filter(
        (m) => m.shortUnits === 0 && m.overUnits === 0 && m.damagedLines === 0
      ).length,
      disputedTransfers: measured.filter((m) =>
        disputedTransferIds.has(m.transfer._id as string)
      ).length,
      lanes: [...laneRows.values()].sort((a, b) => b.shortUnits - a.shortUnits),
    };

    // ── Section 2: cycle time ────────────────────────────────────────────────
    const byStage = new Map<StageKey, number[]>(STAGES.map((s) => [s.key, []]));
    for (const m of measured) {
      const gaps = stageGaps(m.transfer);
      for (const stage of STAGES) {
        const value = gaps[stage.key];
        if (value !== null) byStage.get(stage.key)!.push(value);
      }
    }

    const cycleTime = {
      stages: STAGES.map((stage) => ({
        key: stage.key,
        label: stage.label,
        handshake: stage.handshake,
        // A stage missing on most transfers is a recording gap, not a fast
        // stage, and saying how many it was measured on is what shows that.
        measuredOn: byStage.get(stage.key)!.length,
        ofTransfers: measured.length,
        ...statOf(byStage.get(stage.key)!),
      })),
      // The slowest lanes end to end, which is where to look first.
      slowestLanes: [...laneRows.values()]
        .filter((row) => row.medianTotalHours > 0)
        .sort((a, b) => b.medianTotalHours - a.medianTotalHours)
        .slice(0, 10)
        .map((row) => ({
          fromBranchName: row.fromBranchName,
          toBranchName: row.toBranchName,
          transfers: row.transfers,
          medianTotalHours: row.medianTotalHours,
        })),
    };

    // ── Section 3: dispute ledger ────────────────────────────────────────────
    const now = Date.now();
    const open = laneDisputes.filter((d) => d.status === "open");
    const settledInWindow = laneDisputes.filter(
      (d) =>
        d.status === "settled" &&
        d.settledAt !== undefined &&
        d.settledAt >= startMs &&
        d.settledAt <= endMs
    );

    const ageBuckets = [
      { label: "Under 2 days", maxDays: 2 },
      { label: "2 to 7 days", maxDays: 7 },
      { label: "7 to 30 days", maxDays: 30 },
      { label: "Over 30 days", maxDays: Infinity },
    ];
    const ageing = ageBuckets.map((bucket, index) => {
      const lower = index === 0 ? 0 : ageBuckets[index - 1].maxDays;
      const rows = open.filter((d) => {
        const days = (now - d.raisedAt) / DAY_MS;
        return days >= lower && days < bucket.maxDays;
      });
      return {
        label: bucket.label,
        count: rows.length,
        unitsDifference: rows.reduce((acc, d) => acc + (d.unitsDifference ?? 0), 0),
      };
    });

    const CAUSES = [
      ["countingError", "Counting error"],
      ["found", "Found later"],
      ["chargedToStaff", "Charged to staff"],
      ["writtenOff", "Written off"],
      ["other", "Other"],
    ] as const;

    const settleTimes = settledInWindow
      .map((d) => (d.settledAt as number) - d.raisedAt)
      .filter((span) => span >= 0);

    const disputes = {
      openNow: open.length,
      oldestOpenDays: open.length
        ? Math.floor((now - Math.min(...open.map((d) => d.raisedAt))) / DAY_MS)
        : 0,
      raisedInWindow: laneDisputes.filter(
        (d) => d.raisedAt >= startMs && d.raisedAt <= endMs
      ).length,
      settledInWindow: settledInWindow.length,
      medianDaysToSettle:
        settleTimes.length > 0
          ? Math.round((statOf(settleTimes).medianHours / 24) * 10) / 10
          : null,
      ageing,
      // What the differences turned out to be. countingError against
      // writtenOff is the difference between a training problem and real loss.
      byCause: CAUSES.map(([key, label]) => {
        const rows = settledInWindow.filter((d) => (d.cause ?? "other") === key);
        return {
          key,
          label,
          count: rows.length,
          unitsDifference: rows.reduce((acc, d) => acc + (d.unitsDifference ?? 0), 0),
        };
      }).filter((row) => row.count > 0),
      byStage: (["pieceReceiving", "boxReceiving"] as const).map((stage) => ({
        stage,
        label: stage === "pieceReceiving" ? "By piece" : "By box",
        count: laneDisputes.filter(
          (d) => d.stage === stage && d.raisedAt >= startMs && d.raisedAt <= endMs
        ).length,
      })),
    };

    // ── Section 4: throughput and fill ───────────────────────────────────────
    const rejectedInWindow = lanePool.filter(
      (t) =>
        t.rejectedAt !== undefined && t.rejectedAt >= startMs && t.rejectedAt <= endMs
    );
    const cancelledInWindow = lanePool.filter(
      (t) =>
        t.cancelledAt !== undefined && t.cancelledAt >= startMs && t.cancelledAt <= endMs
    );

    // Stock the chain is holding right now: units taken off a source and not
    // yet put on a shelf anywhere. It sits in the ledger and nothing read it.
    let inTransitUnits = 0;
    let inTransitValueCentavos = 0;
    for (const transfer of openNow) {
      const holds = await ctx.db
        .query("transferStockHolds")
        .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
        .collect();
      for (const hold of holds) {
        inTransitUnits += hold.quantity;
        inTransitValueCentavos += hold.quantity * hold.costPriceCentavos;
      }
    }

    // Allocation pushes: how much of each uploaded sheet reached a shelf.
    type PushRow = {
      fileName: string;
      transfers: number;
      branches: number;
      requestedUnits: number;
      deliveredUnits: number;
      stillOpen: number;
      rejected: number;
      fillPercent: number | null;
    };
    const pushes = new Map<string, PushRow & { branchKeys: Set<string> }>();
    for (const transfer of lanePool) {
      const fileName = transfer.allocationFileName;
      if (!fileName) continue;
      // A push is counted by when it was raised, which is when it was decided.
      if (transfer.createdAt < startMs || transfer.createdAt > endMs) continue;

      let row = pushes.get(fileName);
      if (!row) {
        row = {
          fileName,
          transfers: 0,
          branches: 0,
          requestedUnits: 0,
          deliveredUnits: 0,
          stillOpen: 0,
          rejected: 0,
          fillPercent: null,
          branchKeys: new Set<string>(),
        };
        pushes.set(fileName, row);
      }
      row.transfers++;
      row.branchKeys.add(transfer.toBranchId as string);
      if (OPEN_STATUSES.includes(transfer.status)) row.stillOpen++;
      if (transfer.status === "rejected") row.rejected++;

      const items = await ctx.db
        .query("transferItems")
        .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
        .collect();
      for (const item of items) {
        row.requestedUnits += item.requestedQuantity;
        if (transfer.status === "delivered") {
          row.deliveredUnits += item.receivedQuantity ?? 0;
        }
      }
    }

    const throughput = {
      raised: raised.length,
      raisedByType: (["stockRequest", "return", "interBranch"] as const).map((type) => ({
        type,
        label:
          type === "stockRequest" ? "Stock request" : type === "return" ? "Return" : "Inter-branch",
        count: raised.filter((t) => (t.type ?? "stockRequest") === type).length,
      })),
      approvedInWindow: lanePool.filter(
        (t) => t.approvedAt !== undefined && t.approvedAt >= startMs && t.approvedAt <= endMs
      ).length,
      rejectedInWindow: rejectedInWindow.length,
      cancelledInWindow: cancelledInWindow.length,
      // Of the requests raised in this window, the share that was refused.
      // Measured on the same cohort, so it cannot read above 100%.
      rejectionPercent:
        raised.length > 0
          ? (raised.filter((t) => t.status === "rejected").length / raised.length) * 100
          : null,
      deliveredTransfers: measured.length,
      deliveredUnits: receivedUnits,
      openNow: openNow.length,
      inTransitUnits,
      inTransitValueCentavos,
      pushes: [...pushes.values()]
        .map(({ branchKeys, ...row }) => ({
          ...row,
          branches: branchKeys.size,
          fillPercent:
            row.requestedUnits > 0 ? (row.deliveredUnits / row.requestedUnits) * 100 : null,
        }))
        .sort((a, b) => b.requestedUnits - a.requestedUnits),
    };

    return {
      window: { dateStart: args.dateStart, dateEnd: args.dateEnd },
      // Which stores can be picked, so the page needs no second query.
      branches: branches
        .filter((b) => b.isActive)
        .map((b) => ({ _id: b._id, name: b.name, channel: b.channel ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      accuracy,
      cycleTime,
      disputes,
      throughput,
    };
  },
});

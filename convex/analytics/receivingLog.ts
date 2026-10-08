// convex/analytics/receivingLog.ts — what each store received, and when.
//
// The third thing logistics asked for, and the one that needed no new data at
// all. Every inbound event in RDI already carries its date, its products and
// its counts:
//
//   from a supplier     supplierReceipts.completedAt + supplierReceiptItems
//   from the warehouse  transfers.deliveredAt + transferItems (a "container")
//   from another store  the same, with a retail branch at the far end
//
// What was missing was the view. The Inventory Movement report gives monthly
// totals per SKU and the Logistics Report gives accuracy by lane; neither
// answers "what did Cebu take in on the 3rd, and off whom". This is that
// question: one row per delivery, grouped by store and by day, opening onto
// the products inside it.
//
// Expected sits beside received on every line, because the two disagreeing IS
// the finding. A line short is stock that left somewhere and arrived nowhere,
// and the date and the receiver's name are what make it answerable.

import { query } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { withBranchScope } from "../_helpers/withBranchScope";
import { HQ_ROLES } from "../_helpers/permissions";

const LOG_ROLES = ["admin", "hqStaff", "warehouseStaff", "manager"];

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_WINDOW_DAYS = 180;
/** Past this the page is a data dump; narrow the window or the store. */
const MAX_EVENTS = 600;

/** YYYYMMDD → the PHT instant it starts, or the instant it ends. */
function ymdToMs(ymd: string, endOfDay = false): number {
  const base =
    Date.UTC(
      Number(ymd.slice(0, 4)),
      Number(ymd.slice(4, 6)) - 1,
      Number(ymd.slice(6, 8))
    ) - PHT_OFFSET_MS;
  return endOfDay ? base + DAY_MS - 1 : base;
}

/** A timestamp as the PHT calendar date it falls on. */
function ymdPht(ms: number): string {
  const pht = new Date(ms + PHT_OFFSET_MS);
  return (
    `${pht.getUTCFullYear()}` +
    `${String(pht.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(pht.getUTCDate()).padStart(2, "0")}`
  );
}

/** Where a delivery came from. */
const KINDS = ["supplier", "container", "movementIn"] as const;
type Kind = (typeof KINDS)[number];

const KIND_LABEL: Record<Kind, string> = {
  supplier: "Supplier",
  container: "Warehouse",
  movementIn: "Another store",
};

export const getReceivingLog = query({
  args: {
    dateStart: v.string(), // YYYYMMDD
    dateEnd: v.string(), // YYYYMMDD, inclusive
    branchId: v.optional(v.id("branches")),
    kind: v.optional(
      v.union(v.literal("supplier"), v.literal("container"), v.literal("movementIn"))
    ),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!LOG_ROLES.includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }
    const isHq =
      (HQ_ROLES as readonly string[]).includes(scope.user.role) ||
      scope.user.role === "warehouseStaff";

    // The branchId argument comes from the client, so a branch-scoped caller
    // must not be able to read another store's intake with it.
    const branchFilter = isHq ? args.branchId : (scope.branchId ?? undefined);
    if (args.branchId && !isHq && args.branchId !== scope.branchId) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "You can only read your own store's receiving.",
      });
    }

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
    const branchById = new Map<string, Doc<"branches">>(
      branches.map((b) => [b._id as string, b])
    );
    const nameOf = (id: Id<"branches">) =>
      branchById.get(id as string)?.name ?? "(unknown)";

    const userName = new Map<string, string>();
    async function who(id: Id<"users"> | undefined): Promise<string | null> {
      if (!id) return null;
      const key = id as string;
      if (!userName.has(key)) {
        userName.set(key, (await ctx.db.get(id))?.name ?? "Unknown");
      }
      return userName.get(key) ?? null;
    }

    const variantCache = new Map<string, { sku: string; label: string }>();
    async function describe(variantId: Id<"variants">) {
      const key = variantId as string;
      if (!variantCache.has(key)) {
        const variant = await ctx.db.get(variantId);
        const style = variant ? await ctx.db.get(variant.styleId) : null;
        variantCache.set(key, {
          sku: variant?.sku ?? "(deleted)",
          label: [style?.name, variant?.size, variant?.color]
            .filter(Boolean)
            .join(" · "),
        });
      }
      return variantCache.get(key)!;
    }

    type Line = {
      sku: string;
      label: string;
      expected: number;
      received: number;
      variance: number;
    };
    type Event = {
      id: string;
      kind: Kind;
      kindLabel: string;
      branchId: Id<"branches">;
      branchName: string;
      /** PHT calendar date, which is the trading day everywhere in RDI. */
      date: string;
      receivedAt: number;
      reference: string;
      sourceName: string;
      receiverName: string | null;
      lineCount: number;
      unitsExpected: number;
      unitsReceived: number;
      hasVariance: boolean;
      lines: Line[];
    };

    const events: Event[] = [];
    let truncated = false;

    // ── Transfers delivered in the window ────────────────────────────────────
    const transfers = (
      branchFilter
        ? await ctx.db
            .query("transfers")
            .withIndex("by_to_branch", (q) => q.eq("toBranchId", branchFilter))
            .collect()
        : await ctx.db.query("transfers").collect()
    ).filter(
      (t) =>
        t.status === "delivered" &&
        t.deliveredAt !== undefined &&
        t.deliveredAt >= startMs &&
        t.deliveredAt <= endMs
    );

    for (const transfer of transfers) {
      const from = branchById.get(transfer.fromBranchId as string);
      const kind: Kind = from?.channel === "warehouse" ? "container" : "movementIn";
      if (args.kind && args.kind !== kind) continue;
      if (events.length >= MAX_EVENTS) {
        truncated = true;
        break;
      }

      const items = await ctx.db
        .query("transferItems")
        .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
        .collect();

      const lines: Line[] = [];
      let unitsExpected = 0;
      let unitsReceived = 0;
      for (const item of items) {
        // Expected is what was packed; a transfer that never went through
        // packing is measured against what was asked for.
        const expected = item.packedQuantity ?? item.requestedQuantity;
        const received = item.receivedQuantity ?? 0;
        unitsExpected += expected;
        unitsReceived += received;
        const d = await describe(item.variantId);
        lines.push({ ...d, expected, received, variance: received - expected });
      }
      lines.sort((a, b) => a.sku.localeCompare(b.sku));

      events.push({
        id: transfer._id as string,
        kind,
        kindLabel: KIND_LABEL[kind],
        branchId: transfer.toBranchId,
        branchName: nameOf(transfer.toBranchId),
        date: ymdPht(transfer.deliveredAt as number),
        receivedAt: transfer.deliveredAt as number,
        reference: `TRF-${(transfer._id as string).slice(-6).toUpperCase()}`,
        sourceName: nameOf(transfer.fromBranchId),
        // Who the branch says it took the goods from, else who closed it.
        receiverName:
          transfer.receivedFromName ?? (await who(transfer.deliveredById)),
        lineCount: lines.length,
        unitsExpected,
        unitsReceived,
        hasVariance: unitsReceived !== unitsExpected,
        lines,
      });
    }

    // ── Supplier deliveries completed in the window ─────────────────────────
    if (!args.kind || args.kind === "supplier") {
      const receipts = (await ctx.db.query("supplierReceipts").collect()).filter(
        (r) =>
          (r.status === "completed" || r.status === "discrepancy") &&
          r.completedAt !== undefined &&
          r.completedAt >= startMs &&
          r.completedAt <= endMs &&
          (!branchFilter || r.branchId === branchFilter)
      );

      for (const receipt of receipts) {
        if (events.length >= MAX_EVENTS) {
          truncated = true;
          break;
        }
        const items = await ctx.db
          .query("supplierReceiptItems")
          .withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
          .collect();

        const lines: Line[] = [];
        let unitsExpected = 0;
        let unitsReceived = 0;
        for (const item of items) {
          unitsExpected += item.declaredQuantity;
          unitsReceived += item.receivedQuantity;
          const d = await describe(item.variantId);
          lines.push({
            ...d,
            expected: item.declaredQuantity,
            received: item.receivedQuantity,
            variance: item.receivedQuantity - item.declaredQuantity,
          });
        }
        lines.sort((a, b) => a.sku.localeCompare(b.sku));

        const supplier = await ctx.db.get(receipt.supplierId);
        events.push({
          id: receipt._id as string,
          kind: "supplier",
          kindLabel: KIND_LABEL.supplier,
          branchId: receipt.branchId,
          branchName: nameOf(receipt.branchId),
          date: ymdPht(receipt.completedAt as number),
          receivedAt: receipt.completedAt as number,
          reference: `PO ${receipt.poNumber}`,
          sourceName: supplier?.name ?? "Unknown supplier",
          receiverName: await who(receipt.completedById),
          lineCount: lines.length,
          unitsExpected,
          unitsReceived,
          hasVariance: unitsReceived !== unitsExpected,
          lines,
        });
      }
    }

    // Newest first: what someone looks for in a receiving log is usually the
    // delivery that just landed.
    events.sort((a, b) => b.receivedAt - a.receivedAt);

    // ── Grouped the way it gets read: store, then day ───────────────────────
    const byStore = new Map<
      string,
      {
        branchId: Id<"branches">;
        branchName: string;
        deliveries: number;
        unitsReceived: number;
        unitsExpected: number;
        withVariance: number;
        days: Map<string, Event[]>;
      }
    >();

    for (const event of events) {
      const key = event.branchId as string;
      let store = byStore.get(key);
      if (!store) {
        store = {
          branchId: event.branchId,
          branchName: event.branchName,
          deliveries: 0,
          unitsReceived: 0,
          unitsExpected: 0,
          withVariance: 0,
          days: new Map(),
        };
        byStore.set(key, store);
      }
      store.deliveries++;
      store.unitsReceived += event.unitsReceived;
      store.unitsExpected += event.unitsExpected;
      if (event.hasVariance) store.withVariance++;
      const day = store.days.get(event.date) ?? [];
      day.push(event);
      store.days.set(event.date, day);
    }

    return {
      window: { dateStart: args.dateStart, dateEnd: args.dateEnd },
      truncated,
      totals: {
        deliveries: events.length,
        stores: byStore.size,
        unitsExpected: events.reduce((sum, e) => sum + e.unitsExpected, 0),
        unitsReceived: events.reduce((sum, e) => sum + e.unitsReceived, 0),
        withVariance: events.filter((e) => e.hasVariance).length,
        byKind: KINDS.map((kind) => ({
          kind,
          label: KIND_LABEL[kind],
          deliveries: events.filter((e) => e.kind === kind).length,
          unitsReceived: events
            .filter((e) => e.kind === kind)
            .reduce((sum, e) => sum + e.unitsReceived, 0),
        })).filter((row) => row.deliveries > 0),
      },
      stores: [...byStore.values()]
        .sort((a, b) => a.branchName.localeCompare(b.branchName))
        .map((store) => ({
          branchId: store.branchId,
          branchName: store.branchName,
          deliveries: store.deliveries,
          unitsExpected: store.unitsExpected,
          unitsReceived: store.unitsReceived,
          withVariance: store.withVariance,
          days: [...store.days.entries()]
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([date, dayEvents]) => ({
              date,
              deliveries: dayEvents.length,
              unitsReceived: dayEvents.reduce((sum, e) => sum + e.unitsReceived, 0),
              unitsExpected: dayEvents.reduce((sum, e) => sum + e.unitsExpected, 0),
              events: dayEvents,
            })),
        })),
      branches: branches
        .filter((b) => b.isActive && (isHq || b._id === scope.branchId))
        .map((b) => ({ _id: b._id, name: b.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      canPickBranch: isHq,
    };
  },
});

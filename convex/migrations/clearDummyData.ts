import { v } from "convex/values";
import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * One-time cleanup before the merchandising masterdata becomes the catalog:
 * removes the seeded products, their stock and everything that points at them
 * — sales, shifts, transfers, receiving, snapshots, alerts and the test
 * promotions. Users, branches, brands, product codes, terminals, cashier
 * accounts, suppliers, couriers, settings and the audit log stay.
 *
 * Run from Convex dashboard → Functions → migrations/clearDummyData:run
 */

const DUMMY_TABLES = [
  // Catalog
  "styles",
  "variants",
  "categories",
  "productImages",
  "promotions",
  // Stock
  "inventory",
  "inventoryBatches",
  "variantDailySnapshots",
  "branchDailySnapshots",
  "lowStockAlerts",
  "restockSuggestions",
  "reconciliations",
  // Movement
  "transfers",
  "transferItems",
  "receivingScans",
  "internalInvoices",
  "internalInvoiceItems",
  "supplierReceipts",
  "supplierReceiptItems",
  // Sales
  "transactions",
  "transactionItems",
  "zReadings",
  "receiptReprints",
  "cashierShifts",
  "drawerOperations",
  "cashTurnoverApprovals",
  "disputes",
  "branchScores",
  "staffNotifications",
] as const;

const dummyTable = v.union(...DUMMY_TABLES.map((t) => v.literal(t)));

export const _clearChunk = internalMutation({
  args: { table: dummyTable },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query(args.table).take(1000);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const deleted: Record<string, number> = {};
    for (const table of DUMMY_TABLES) {
      let total = 0;
      for (;;) {
        const n: number = await ctx.runMutation(internal.migrations.clearDummyData._clearChunk, { table });
        total += n;
        if (n === 0) break;
      }
      deleted[table] = total;
    }
    return deleted;
  },
});

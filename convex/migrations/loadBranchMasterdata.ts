import { v } from "convex/values";
import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * One-time swap of the seeded demo branches for the real branch list from
 * finance (Status / Branch / Dept). Removes every seeded branch and the rows
 * that only make sense for them — terminals, cashier accounts, invoice
 * counters, scores and snapshots — removes every user except the admin that
 * runs the system, then loads the real list. Address is the branch name until
 * real addresses are collected; phone and hours stay blank; every branch
 * starts as an inline store.
 *
 * Run: npx convex run migrations/loadBranchMasterdata:run
 */

const KEEP_EMAIL = "tech@broadheader.com";

const BRANCHES: { affiliateType: string; name: string; code: string }[] = [
  { affiliateType: "Aero Store", name: "AEROPOSTALE ONE AYALA", code: "100-2008" },
  { affiliateType: "Aero Store", name: "AEROPOSTALE SM BACOLOD", code: "100-5002" },
  { affiliateType: "Aero Store", name: "AEROPOSTALE SM BACOOR", code: "100-5003" },
  { affiliateType: "Aero Store", name: "AEROPOSTALE SM CEBU", code: "100-5008" },
  { affiliateType: "Aero Store", name: "AEROPOSTALE SM DAVAO", code: "100-5012" },
  { affiliateType: "Aero Store", name: "AEROPOSTALE SM ILOILO", code: "100-5015" },
  { affiliateType: "Aero Store", name: "AEROPOSTALE SM LIPA", code: "100-5016" },
  { affiliateType: "Aero Store", name: "AEROPOSTALE SM MALL OF ASIA", code: "100-5018" },
  { affiliateType: "Aero Store", name: "AEROPOSTALE SM MEGAMALL", code: "100-5021" },
  { affiliateType: "Aero Store", name: "AEROPOSTALE SM NORTH EDSA", code: "100-5022" },
  { affiliateType: "Aero Store", name: "AEROPOSTALE SM STA ROSA", code: "100-5027" },
  { affiliateType: "Aero Store", name: "AEROPOSTALE SM TUGGUEGARAO", code: "100-5032" },
  { affiliateType: "Aero Store", name: "AEROPOSTALE SM LEGAZPI", code: "100-5033" },
  { affiliateType: "Aero Store", name: "AEROPOSTALE SM TANZA", code: "100-5034" },
  { affiliateType: "Aero Store", name: "AEROPOSTALE SM STO. TOMAS", code: "100-5037" },
  { affiliateType: "Aero Store", name: "AEROPOSTALE SM SORSOGON", code: "100-5025" },
  { affiliateType: "Hurley Store", name: "HURLEY SM BACOLOD", code: "101-5002" },
  { affiliateType: "Hurley Store", name: "HURLEY SM MEGAMALL", code: "101-5021" },
  { affiliateType: "Hurley Store", name: "HURLEY SM NORTH EDSA", code: "101-5022" },
  { affiliateType: "Hurley Store", name: "HURLEY SM STO. TOMAS", code: "101-5037" },
  { affiliateType: "Hurley Store", name: "HURLEY SM LIPA", code: "101-5016" },
  { affiliateType: "Hurley Store", name: "HURLEY SM MAKATI DEPT STORE", code: "101-5017" },
  { affiliateType: "Hurley Store", name: "HURLEY SM STA ROSA", code: "101-5027" },
  { affiliateType: "Head Office", name: "DHI ACCOUNTING", code: "600-9005" },
  { affiliateType: "Head Office", name: "DHI TREASURY", code: "600-9006" },
  { affiliateType: "Aero Store", name: "REDBOX ACIENDA", code: "900-1001" },
  { affiliateType: "Head Office", name: "RDI CREATIVES", code: "900-9003" },
  { affiliateType: "Head Office", name: "RDI MERCHANDISING", code: "900-9010" },
  { affiliateType: "Head Office", name: "RDI E-COMMERCE", code: "900-9004" },
  { affiliateType: "Head Office", name: "RDI ACCOUNTING", code: "900-9005" },
  { affiliateType: "Head Office", name: "RDI TREASURY", code: "900-9006" },
  { affiliateType: "Head Office", name: "RDI HUMAN RESOURCES", code: "900-9007" },
  { affiliateType: "Head Office", name: "RDI INFORMATION TECHNOLOGY", code: "900-9008" },
  { affiliateType: "Head Office", name: "RDI OPERATIONS", code: "900-9011" },
  { affiliateType: "Head Office", name: "RDI PROJECT MANAGEMENT", code: "900-9012" },
  { affiliateType: "Head Office", name: "RDI QUALITY CONTROL", code: "900-9013" },
  { affiliateType: "Head Office", name: "RDI VISUAL MERCHANDISING", code: "900-9014" },
  { affiliateType: "Head Office", name: "RDI WAREHOUSE", code: "900-9015" },
  { affiliateType: "Head Office", name: "RDI PURCHASING", code: "900-9020" },
  { affiliateType: "Head Office", name: "RDI PAYROLL", code: "900-9021" },
  { affiliateType: "Head Office", name: "RDI EXECUTIVE", code: "900-9001" },
  { affiliateType: "Head Office", name: "DHI EXECUTIVE", code: "600-9001" },
];

// Rows keyed to a seeded branch; none of them outlive it.
const BRANCH_TABLES = [
  "posTerminalSessions",
  "posTerminals",
  "terminalEnrollmentCodes",
  "cashierAccounts",
  "invoiceCounters",
  "branchTargets",
  "branchScores",
  "branchDailySnapshots",
  "variantDailySnapshots",
  "branches",
] as const;

const branchTable = v.union(...BRANCH_TABLES.map((t) => v.literal(t)));

export const _clearChunk = internalMutation({
  args: { table: branchTable },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query(args.table).take(1000);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});

// Styles can be pinned to seeded branches; unpin them so no id dangles.
export const _unpinStyles = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("styles").paginate({ cursor: args.cursor, numItems: 500 });
    let unpinned = 0;
    for (const style of page.page) {
      if (style.exclusiveBranchIds !== undefined) {
        await ctx.db.patch(style._id, { exclusiveBranchIds: undefined });
        unpinned++;
      }
    }
    return { unpinned, cursor: page.isDone ? null : page.continueCursor };
  },
});

export const _removeUsers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const keep = users.find((u) => u.email.toLowerCase() === KEEP_EMAIL);
    if (!keep) throw new Error(`${KEEP_EMAIL} not found — refusing to remove every user`);

    // Suppliers and couriers stay, so they move to the admin that remains.
    for (const table of ["suppliers", "couriers"] as const) {
      for (const row of await ctx.db.query(table).collect()) {
        if (row.createdById !== keep._id) await ctx.db.patch(row._id, { createdById: keep._id });
      }
    }

    // The admin may be viewing as a seeded branch that is about to go.
    await ctx.db.patch(keep._id, { branchId: undefined, viewingAsBranchId: undefined, updatedAt: Date.now() });

    const removed: string[] = [];
    for (const u of users) {
      if (u._id === keep._id) continue;
      await ctx.db.delete(u._id);
      removed.push(u.email);
    }
    return removed;
  },
});

export const _insertBranches = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (const b of BRANCHES) {
      await ctx.db.insert("branches", {
        name: b.name,
        address: b.name,
        code: b.code,
        affiliateType: b.affiliateType,
        channel: "inline",
        isActive: true,
        configuration: { timezone: "Asia/Manila" },
        createdAt: now,
        updatedAt: now,
      });
    }
    return BRANCHES.length;
  },
});

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const removedUsers: string[] = await ctx.runMutation(internal.migrations.loadBranchMasterdata._removeUsers, {});

    let unpinnedStyles = 0;
    let cursor: string | null = null;
    do {
      const r: { unpinned: number; cursor: string | null } = await ctx.runMutation(
        internal.migrations.loadBranchMasterdata._unpinStyles,
        { cursor }
      );
      unpinnedStyles += r.unpinned;
      cursor = r.cursor;
    } while (cursor !== null);

    const deleted: Record<string, number> = {};
    for (const table of BRANCH_TABLES) {
      let total = 0;
      for (;;) {
        const n: number = await ctx.runMutation(internal.migrations.loadBranchMasterdata._clearChunk, { table });
        total += n;
        if (n === 0) break;
      }
      deleted[table] = total;
    }

    const inserted: number = await ctx.runMutation(internal.migrations.loadBranchMasterdata._insertBranches, {});
    return { removedUsers, unpinnedStyles, deleted, inserted };
  },
});

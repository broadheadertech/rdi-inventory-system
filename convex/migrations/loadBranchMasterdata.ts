import { v } from "convex/values";
import { internalAction, internalMutation, type QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

/**
 * One-time swap of the seeded demo branches for the real branch list from
 * finance (Status / Branch / Dept). Removes every seeded branch and the rows
 * that only make sense for them — terminals, cashier accounts, invoice
 * counters, scores and snapshots — removes every user except the admin that
 * runs the system, then loads the real list. Address is the branch name until
 * real addresses are collected; phone and hours stay blank; every branch
 * starts as an inline store except RDI WAREHOUSE, the central warehouse that
 * replenishment, pre-allocation and ordering draw from.
 *
 * Run: npx convex run migrations/loadBranchMasterdata:run
 */

const KEEP_EMAIL = "tech@broadheader.com";

// "Status" as the finance list writes it.
type Status = "Aero Store" | "Hurley Store" | "Head Office";

const BRANCHES: { status: Status; name: string; code: string }[] = [
  { status: "Aero Store", name: "AEROPOSTALE ONE AYALA", code: "100-2008" },
  { status: "Aero Store", name: "AEROPOSTALE SM BACOLOD", code: "100-5002" },
  { status: "Aero Store", name: "AEROPOSTALE SM BACOOR", code: "100-5003" },
  { status: "Aero Store", name: "AEROPOSTALE SM CEBU", code: "100-5008" },
  { status: "Aero Store", name: "AEROPOSTALE SM DAVAO", code: "100-5012" },
  { status: "Aero Store", name: "AEROPOSTALE SM ILOILO", code: "100-5015" },
  { status: "Aero Store", name: "AEROPOSTALE SM LIPA", code: "100-5016" },
  { status: "Aero Store", name: "AEROPOSTALE SM MALL OF ASIA", code: "100-5018" },
  { status: "Aero Store", name: "AEROPOSTALE SM MEGAMALL", code: "100-5021" },
  { status: "Aero Store", name: "AEROPOSTALE SM NORTH EDSA", code: "100-5022" },
  { status: "Aero Store", name: "AEROPOSTALE SM STA ROSA", code: "100-5027" },
  { status: "Aero Store", name: "AEROPOSTALE SM TUGGUEGARAO", code: "100-5032" },
  { status: "Aero Store", name: "AEROPOSTALE SM LEGAZPI", code: "100-5033" },
  { status: "Aero Store", name: "AEROPOSTALE SM TANZA", code: "100-5034" },
  { status: "Aero Store", name: "AEROPOSTALE SM STO. TOMAS", code: "100-5037" },
  { status: "Aero Store", name: "AEROPOSTALE SM SORSOGON", code: "100-5025" },
  { status: "Hurley Store", name: "HURLEY SM BACOLOD", code: "101-5002" },
  { status: "Hurley Store", name: "HURLEY SM MEGAMALL", code: "101-5021" },
  { status: "Hurley Store", name: "HURLEY SM NORTH EDSA", code: "101-5022" },
  { status: "Hurley Store", name: "HURLEY SM STO. TOMAS", code: "101-5037" },
  { status: "Hurley Store", name: "HURLEY SM LIPA", code: "101-5016" },
  { status: "Hurley Store", name: "HURLEY SM MAKATI DEPT STORE", code: "101-5017" },
  { status: "Hurley Store", name: "HURLEY SM STA ROSA", code: "101-5027" },
  { status: "Head Office", name: "DHI ACCOUNTING", code: "600-9005" },
  { status: "Head Office", name: "DHI TREASURY", code: "600-9006" },
  { status: "Aero Store", name: "REDBOX ACIENDA", code: "900-1001" },
  { status: "Head Office", name: "RDI CREATIVES", code: "900-9003" },
  { status: "Head Office", name: "RDI MERCHANDISING", code: "900-9010" },
  { status: "Head Office", name: "RDI E-COMMERCE", code: "900-9004" },
  { status: "Head Office", name: "RDI ACCOUNTING", code: "900-9005" },
  { status: "Head Office", name: "RDI TREASURY", code: "900-9006" },
  { status: "Head Office", name: "RDI HUMAN RESOURCES", code: "900-9007" },
  { status: "Head Office", name: "RDI INFORMATION TECHNOLOGY", code: "900-9008" },
  { status: "Head Office", name: "RDI OPERATIONS", code: "900-9011" },
  { status: "Head Office", name: "RDI PROJECT MANAGEMENT", code: "900-9012" },
  { status: "Head Office", name: "RDI QUALITY CONTROL", code: "900-9013" },
  { status: "Head Office", name: "RDI VISUAL MERCHANDISING", code: "900-9014" },
  { status: "Head Office", name: "RDI WAREHOUSE", code: "900-9015" },
  { status: "Head Office", name: "RDI PURCHASING", code: "900-9020" },
  { status: "Head Office", name: "RDI PAYROLL", code: "900-9021" },
  { status: "Head Office", name: "RDI EXECUTIVE", code: "900-9001" },
  { status: "Head Office", name: "DHI EXECUTIVE", code: "600-9001" },
];

const WAREHOUSE_CODE = "900-9015";

// A store carries its one brand; a head-office department takes any (no list).
const STATUS_BRAND: Record<Status, string | null> = {
  "Aero Store": "Aeropostale",
  "Hurley Store": "Hurley",
  "Head Office": null,
};

async function brandIdsByName(ctx: QueryCtx): Promise<Map<string, Id<"brands">>> {
  const brands = await ctx.db.query("brands").collect();
  return new Map(brands.map((b) => [b.name.toLowerCase(), b._id]));
}

function placement(status: string, brands: Map<string, Id<"brands">>) {
  const brandName = STATUS_BRAND[status as Status];
  if (brandName === undefined) throw new Error(`Unknown branch status "${status}"`);
  const brandId = brandName ? brands.get(brandName.toLowerCase()) : undefined;
  if (brandName && !brandId) throw new Error(`Brand "${brandName}" not found`);
  return {
    branchType: status === "Head Office" ? ("headOffice" as const) : ("store" as const),
    brandIds: brandId ? [brandId] : undefined,
  };
}

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
    const brands = await brandIdsByName(ctx);
    for (const b of BRANCHES) {
      await ctx.db.insert("branches", {
        name: b.name,
        address: b.name,
        code: b.code,
        ...placement(b.status, brands),
        channel: b.code === WAREHOUSE_CODE ? "warehouse" : "inline",
        isActive: true,
        configuration: { timezone: "Asia/Manila" },
        createdAt: now,
        updatedAt: now,
      });
    }
    return BRANCHES.length;
  },
});

// For a deployment that ran this before the warehouse was marked.
// Run: npx convex run migrations/loadBranchMasterdata:_markWarehouse
export const _markWarehouse = internalMutation({
  args: {},
  handler: async (ctx) => {
    const branch = await ctx.db
      .query("branches")
      .withIndex("by_code", (q) => q.eq("code", WAREHOUSE_CODE))
      .unique();
    if (!branch) throw new Error(`No branch with code ${WAREHOUSE_CODE}`);
    await ctx.db.patch(branch._id, { channel: "warehouse", updatedAt: Date.now() });
    return branch.name;
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

// convex/snapshots/readers.ts
// Shared helpers for reading snapshot data. Used by dashboards, scoring, digests.
// All functions are plain async helpers (not Convex functions) — call from query handlers.

import type { GenericQueryCtx } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";

type Ctx = GenericQueryCtx<DataModel>;

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Returns "YYYY-MM-DD" in PHT for a given offset (0 = today, 1 = yesterday). */
export function getPHTDate(offsetDays: number = 0): string {
  const pht = Date.now() + PHT_OFFSET_MS - offsetDays * DAY_MS;
  const d = new Date(pht);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// ─── Branch snapshot readers ─────────────────────────────────────────────────

/** Get a single branch's snapshot for a given date. */
export async function getBranchSnapshot(
  ctx: Ctx,
  branchId: Id<"branches">,
  date: string
): Promise<Doc<"branchDailySnapshots"> | null> {
  return ctx.db
    .query("branchDailySnapshots")
    .withIndex("by_branch_date", (q) => q.eq("branchId", branchId).eq("date", date))
    .first();
}

/** Get all branch snapshots for a given date. */
export async function getAllBranchSnapshots(
  ctx: Ctx,
  date: string
): Promise<Doc<"branchDailySnapshots">[]> {
  return ctx.db
    .query("branchDailySnapshots")
    .withIndex("by_date", (q) => q.eq("date", date))
    .collect();
}

/** Get multiple days of snapshots for a branch (for trends). */
export async function getBranchSnapshotRange(
  ctx: Ctx,
  branchId: Id<"branches">,
  dates: string[]
): Promise<Map<string, Doc<"branchDailySnapshots">>> {
  const map = new Map<string, Doc<"branchDailySnapshots">>();
  for (const date of dates) {
    const snap = await getBranchSnapshot(ctx, branchId, date);
    if (snap) map.set(date, snap);
  }
  return map;
}

// ─── Variant snapshot readers ────────────────────────────────────────────────

/** Get all variant snapshots for a given date. */
export async function getAllVariantSnapshots(
  ctx: Ctx,
  date: string
): Promise<Doc<"variantDailySnapshots">[]> {
  return ctx.db
    .query("variantDailySnapshots")
    .withIndex("by_date", (q) => q.eq("date", date))
    .collect();
}

/** Get variant snapshots filtered by classification for a date. */
export async function getVariantSnapshotsByClassification(
  ctx: Ctx,
  date: string,
  classification: "fast" | "normal" | "slow" | "dead"
): Promise<Doc<"variantDailySnapshots">[]> {
  return ctx.db
    .query("variantDailySnapshots")
    .withIndex("by_date_classification", (q) =>
      q.eq("date", date).eq("classification", classification)
    )
    .collect();
}

/** Aggregate branch totals from all branch snapshots for a date. */
export async function getSystemTotals(
  ctx: Ctx,
  date: string
): Promise<{
  totalRevenue: number;
  totalTransactions: number;
  totalItemsSold: number;
  totalAlerts: number;
  branchCount: number;
  invoiceRevenue: number;
}> {
  const snaps = await getAllBranchSnapshots(ctx, date);
  return {
    totalRevenue: snaps.reduce((s, r) => s + r.salesTotalCentavos, 0),
    totalTransactions: snaps.reduce((s, r) => s + r.salesTransactionCount, 0),
    totalItemsSold: snaps.reduce((s, r) => s + r.salesItemsSold, 0),
    totalAlerts: snaps.reduce((s, r) => s + r.activeAlertCount, 0),
    branchCount: snaps.length,
    invoiceRevenue: snaps.reduce((s, r) => s + r.invoiceTotalCentavos, 0),
  };
}

// ─── Date helpers ────────────────────────────────────────────────────────────

/** Returns an array of "YYYY-MM-DD" strings for the last N days (including today). */
export function getLastNDates(n: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    dates.push(getPHTDate(i));
  }
  return dates;
}

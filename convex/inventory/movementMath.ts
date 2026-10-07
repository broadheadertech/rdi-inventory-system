// convex/inventory/movementMath.ts — the stock card's arithmetic.
//
// The report the business already reads has one row per product per store per
// month and seven movement columns that must close:
//
//   Ending = Beginning + Container + Return + MovementIn
//                      − Sale − MovementOut − RPO
//
// RDI records every one of those as an event, so the movements are exact. The
// BALANCES are not stored anywhere: there is no month-end snapshot of a
// branch's stock. What there is, is what the branch holds right now — so the
// balances are derived by taking today's figure and unwinding every movement
// since the month ended. That makes the latest month exact and each earlier
// month only as good as the movement record behind it, which is why the report
// says so on its face and shows the variance against an uploaded month
// wherever one exists.
//
// Kept apart from the database because a sign error here is invisible: every
// column still looks like a plausible number and only the balance gives it
// away, one row at a time.

/** The seven movement columns, as the business names them. */
export type MovementCounts = {
  /** Units sold to customers. */
  sale: number;
  /** Units customers brought back. */
  customerReturn: number;
  /** Delivered in from the central warehouse. */
  container: number;
  /** Delivered in from another store. */
  movementIn: number;
  /** Sent out to another store. */
  movementOut: number;
  /** Pulled back out to the warehouse. */
  rpo: number;
};

export function emptyCounts(): MovementCounts {
  return { sale: 0, customerReturn: 0, container: 0, movementIn: 0, movementOut: 0, rpo: 0 };
}

export function addCounts(into: MovementCounts, from: MovementCounts): void {
  into.sale += from.sale;
  into.customerReturn += from.customerReturn;
  into.container += from.container;
  into.movementIn += from.movementIn;
  into.movementOut += from.movementOut;
  into.rpo += from.rpo;
}

/** Everything that raised the balance. */
export function unitsIn(counts: MovementCounts): number {
  return counts.container + counts.customerReturn + counts.movementIn;
}

/** Everything that lowered it. */
export function unitsOut(counts: MovementCounts): number {
  return counts.sale + counts.movementOut + counts.rpo;
}

export function netChange(counts: MovementCounts): number {
  return unitsIn(counts) - unitsOut(counts);
}

export function hasMovement(counts: MovementCounts): boolean {
  return unitsIn(counts) !== 0 || unitsOut(counts) !== 0;
}

/**
 * The two balances, worked back from what the branch holds today.
 *
 *   Ending(month)    = today − everything that moved after the month closed
 *   Beginning(month) = Ending(month) − everything that moved during it
 *
 * Both can come out negative, and they are left that way on purpose. A
 * negative beginning balance is not a stock level — it is proof that the
 * movement record and the shelf disagree, usually a count correction nobody
 * recorded as a movement. Clamping it at zero would hide exactly the problem
 * this report exists to find.
 */
export function balances(args: {
  /** Units the branch is accountable for now: sellable plus reserved. */
  currentPhysical: number;
  /** What moved during the month being reported. */
  inMonth: MovementCounts;
  /** What moved between the end of that month and now. */
  afterMonth: MovementCounts;
}): { beginningInv: number; endingBalance: number } {
  const endingBalance = args.currentPhysical - netChange(args.afterMonth);
  return {
    beginningInv: endingBalance - netChange(args.inMonth),
    endingBalance,
  };
}

/**
 * Whether a row's columns actually close. Always true for a computed row by
 * construction — it is the uploaded rows this catches, where the old system's
 * own figures did not add up.
 */
export function closes(row: {
  beginningInv: number;
  endingBalance: number;
  counts: MovementCounts;
}): boolean {
  return row.beginningInv + netChange(row.counts) === row.endingBalance;
}

// ─── Periods ─────────────────────────────────────────────────────────────────

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;

export function isPeriod(period: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
}

/**
 * A "YYYY-MM" as the PHT instant it starts and the instant it ends.
 *
 * The trading day is the PHT calendar date everywhere in this system, so a
 * month has to begin at PHT midnight. Taking UTC month boundaries would move
 * eight hours of the first and last day into the neighbouring month.
 */
export function periodBounds(period: string): { startMs: number; endMs: number } {
  const [year, month] = period.split("-").map(Number);
  const startMs = Date.UTC(year, month - 1, 1) - PHT_OFFSET_MS;
  // Month 12 rolls to January of the next year; Date.UTC handles the overflow.
  const endMs = Date.UTC(year, month, 1) - PHT_OFFSET_MS - 1;
  return { startMs, endMs };
}

/** The "YYYY-MM" a timestamp falls in, in PHT. */
export function periodOf(ms: number): string {
  const pht = new Date(ms + PHT_OFFSET_MS);
  return `${pht.getUTCFullYear()}-${String(pht.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** `months` steps back from a period, e.g. ("2026-01", 1) → "2025-12". */
export function shiftPeriod(period: string, months: number): string {
  const [year, month] = period.split("-").map(Number);
  const zero = year * 12 + (month - 1) + months;
  return `${Math.floor(zero / 12)}-${String((zero % 12) + 1).padStart(2, "0")}`;
}

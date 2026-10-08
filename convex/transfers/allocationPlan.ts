// convex/transfers/allocationPlan.ts — reading an allocation sheet.
//
// The decisions a row needs — is the branch real, is the SKU real, is there
// stock left for it, which branch does it join — kept apart from the database
// so they can be tested directly. A misread here sends a season to the wrong
// store or over-commits a SKU, and neither is noticed until a packer is
// standing in front of a shelf that is empty.
//
// The one rule worth stating twice: availability is spent AS THE SHEET IS
// READ. Holding 10 for Manila leaves 5 of 15 for Cebu, so a sheet that
// over-commits is flagged on its later lines, in the order it was written,
// rather than on whichever branch happened to be created first.

export type AllocationRow = {
  sku: string;
  branchName: string;
  quantity: number;
  notes?: string;
};

export type AllocationProblem = {
  /** 1-based line in the file as uploaded, header excluded. */
  row: number;
  sku: string;
  branchName: string;
  reason: string;
};

/** A destination and everything the sheet gives it. */
export type PlannedBranch = {
  branchKey: string;
  branchName: string;
  /** Merged by SKU, in the order each SKU first appeared for this branch. */
  lines: { sku: string; quantity: number }[];
  notes: string[];
};

export type AllocationPlan = {
  /** In the order each branch first appears in the sheet. */
  branches: PlannedBranch[];
  problems: AllocationProblem[];
};

export type BranchMatch = { key: string; name: string };

export type AllocationLookup = {
  sourceKey: string;
  sourceName: string;
  /**
   * Normalised branch name → every active branch answering to it. More than
   * one is refused rather than guessed: an allocation sent to the wrong store
   * is not recoverable by the time anyone notices.
   */
  branchesByName: Map<string, BranchMatch[]>;
  /** SKU as written → the variant, or null when there is no active one. */
  variantBySku: Map<string, { key: string; sku: string } | null>;
  /** Variant key → units the source holds before this sheet is applied. */
  availableByVariant: Map<string, number>;
};

/** A branch name as the sheet might write it, flattened for matching. */
export function normaliseBranchName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function planAllocation(
  rows: AllocationRow[],
  lookup: AllocationLookup
): AllocationPlan {
  const problems: AllocationProblem[] = [];
  const buckets = new Map<string, PlannedBranch>();
  const order: string[] = [];

  // What the source has left as the sheet is read.
  const remaining = new Map<string, number>(lookup.availableByVariant);

  let rowNumber = 0;
  for (const raw of rows) {
    rowNumber++;
    const sku = raw.sku.trim();
    const branchName = raw.branchName.trim();
    const note = raw.notes?.trim() ?? "";

    // A blank line in the sheet is not a problem to report.
    if (!sku && !branchName) continue;

    const fail = (reason: string) =>
      problems.push({ row: rowNumber, sku, branchName, reason });

    if (!sku) {
      fail("No SKU on this row.");
      continue;
    }
    if (!branchName) {
      fail("No branch on this row.");
      continue;
    }
    if (!Number.isInteger(raw.quantity) || raw.quantity <= 0) {
      fail(
        Number.isNaN(raw.quantity)
          ? "Quantity is not a number."
          : `Quantity must be a whole number above zero, not ${raw.quantity}.`
      );
      continue;
    }

    const matches = lookup.branchesByName.get(normaliseBranchName(branchName)) ?? [];
    if (matches.length === 0) {
      fail(`No active branch named "${branchName}".`);
      continue;
    }
    if (matches.length > 1) {
      fail(`More than one active branch is named "${branchName}".`);
      continue;
    }
    const destination = matches[0];
    if (destination.key === lookup.sourceKey) {
      fail("That is the source branch — it cannot allocate to itself.");
      continue;
    }

    const variant = lookup.variantBySku.get(sku);
    if (!variant) {
      fail(`No active SKU "${sku}".`);
      continue;
    }

    const left = remaining.get(variant.key) ?? 0;
    if (raw.quantity > left) {
      fail(
        `${lookup.sourceName} has ${left} left of ${variant.sku}, and this row asks for ${raw.quantity}.`
      );
      continue;
    }
    remaining.set(variant.key, left - raw.quantity);

    let bucket = buckets.get(destination.key);
    if (!bucket) {
      bucket = {
        branchKey: destination.key,
        branchName: destination.name,
        lines: [],
        notes: [],
      };
      buckets.set(destination.key, bucket);
      order.push(destination.key);
    }

    // The same SKU listed twice for one branch is one line of the sum, not two
    // lines for a packer to reconcile.
    const existing = bucket.lines.find((line) => line.sku === variant.sku);
    if (existing) existing.quantity += raw.quantity;
    else bucket.lines.push({ sku: variant.sku, quantity: raw.quantity });

    if (note && !bucket.notes.includes(note)) bucket.notes.push(note);
  }

  return {
    branches: order.map((key) => buckets.get(key) as PlannedBranch),
    problems,
  };
}

// ─── Scaling a plan to what actually turned up ───────────────────────────────

/**
 * Shares `received` units across lines that together asked for more.
 *
 * Used when a supplier short-ships a pre-allocated delivery. Every store's
 * share comes down together rather than the first stores in the file taking
 * their full allocation and the last ones getting nothing — which is what a
 * simple walk down the list would do.
 *
 * Largest remainder, so the units handed out add up to the units received
 * EXACTLY. Flooring each share and stopping would quietly strand a unit or two
 * in the warehouse with no record of why.
 *
 * Lines are passed for one product at a time, since the shortfall is per
 * product: a delivery can be complete on one SKU and short on the next.
 *
 * Largest remainder is NOT house-monotone — the Alabama paradox. With a plan
 * of 13/7/5/3/2, going from 14 units received to 15 moves the fourth store
 * from 2 units down to 1 while the first two gain. That is a property of the
 * method, not a fault here: the split is worked out once per delivery, from a
 * received count that is already final, so two different counts are never
 * compared and nobody ever sees a share fall. Highest-averages would be
 * monotone but systematically favours the larger stores, which is a real cost
 * in exchange for a guarantee this code cannot use.
 */
export function scaleToReceived(
  lines: { id: string; quantity: number }[],
  received: number
): Map<string, number> {
  const out = new Map<string, number>();
  const planned = lines.reduce((sum, line) => sum + line.quantity, 0);

  if (planned <= 0 || received <= 0) {
    for (const line of lines) out.set(line.id, 0);
    return out;
  }
  // Nothing to scale: everything planned arrived, or more did.
  if (received >= planned) {
    for (const line of lines) out.set(line.id, line.quantity);
    return out;
  }

  const shares = lines.map((line) => {
    const exact = (line.quantity * received) / planned;
    const base = Math.floor(exact);
    return { id: line.id, base, remainder: exact - base };
  });

  let handed = shares.reduce((sum, s) => sum + s.base, 0);
  // The leftovers go to the largest remainders first. A tie falls to whichever
  // came first in the file, which is stable rather than arbitrary.
  const queue = [...shares].sort((a, b) => b.remainder - a.remainder);
  for (const share of queue) {
    if (handed >= received) break;
    share.base += 1;
    handed++;
  }

  for (const share of shares) out.set(share.id, share.base);
  return out;
}

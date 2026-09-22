// convex/_helpers/packingScans.ts — packing counts what was scanned.
//
// Receiving stopped taking typed counts a while ago. Packing was the last place
// in the chain where a number was still entered by hand, and it is the one that
// decides what the branch is told to expect: a mistyped pack becomes a
// discrepancy at the other end, raised against a branch that received exactly
// what was in the box.
//
// So the bench scans too. Each scan is its own server call and its own row, and
// what a transfer packed is the number of rows standing against it.
//
// These are kept apart from receivingScans on purpose. Both would be keyed by
// the same transferId, and folding them together would have a transfer's
// packing scans counted as pieces received at the far end.

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

/** What has been scanned onto the bench, per variant. */
export async function packingScanCounts(
  ctx: Ctx,
  transferId: Id<"transfers">
): Promise<Map<string, number>> {
  const scans = await ctx.db
    .query("packingScans")
    .withIndex("by_transfer", (q) => q.eq("transferId", transferId))
    .collect();

  const counts = new Map<string, number>();
  for (const scan of scans) {
    if (scan.undoneAt !== undefined) continue;
    const key = scan.variantId as string;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** The newest packing scan on a transfer that has not been undone. */
export async function latestStandingPackScan(
  ctx: Ctx,
  transferId: Id<"transfers">
): Promise<Doc<"packingScans"> | null> {
  const newestFirst = ctx.db
    .query("packingScans")
    .withIndex("by_transfer", (q) => q.eq("transferId", transferId))
    .order("desc");

  for await (const scan of newestFirst) {
    if (scan.undoneAt === undefined) return scan;
  }
  return null;
}

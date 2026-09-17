// convex/_helpers/receivingScans.ts — receiving counts what was scanned, nothing else.
//
// Stock is received by scanning each piece. There is no typed quantity anywhere
// in receiving: a number box lets a count be entered for goods nobody looked
// at, and a count made in the browser can be sent to the server as any number
// at all. So every scan is its own server call, written to receivingScans, and
// what a receipt, a transfer or a box received is the number of scans on it.
//
// A scan matches a variant's barcode first and its SKU second, so a printed SKU
// label works today and the manufacturer's barcode works once it is loaded.
//
// A mis-scan is taken back with "undo last scan", which marks the scan undone
// rather than deleting it — the log keeps what happened, and undoing can only
// lower a count, never raise one.

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

export type ScanMatch = {
  variant: Doc<"variants">;
  matchedBy: "barcode" | "sku";
};

/** The variant a scanned code names: its barcode, else its SKU. */
export async function resolveScanCode(ctx: Ctx, raw: string): Promise<ScanMatch | null> {
  const code = raw.trim();
  if (code === "") return null;

  const byBarcode = await ctx.db
    .query("variants")
    .withIndex("by_barcode", (q) => q.eq("barcode", code))
    .first();
  if (byBarcode) return { variant: byBarcode, matchedBy: "barcode" };

  const bySku = await ctx.db
    .query("variants")
    .withIndex("by_sku", (q) => q.eq("sku", code))
    .first();
  if (bySku) return { variant: bySku, matchedBy: "sku" };

  return null;
}

/** Scans still standing, counted per variant. */
function tally(scans: Doc<"receivingScans">[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const scan of scans) {
    if (scan.undoneAt !== undefined) continue;
    const key = scan.variantId as string;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** What a transfer received piece by piece — scans made against a box are not part of it. */
export async function transferScanCounts(
  ctx: Ctx,
  transferId: Id<"transfers">
): Promise<Map<string, number>> {
  const scans = await ctx.db
    .query("receivingScans")
    .withIndex("by_transfer", (q) => q.eq("transferId", transferId))
    .collect();
  return tally(scans);
}

/** What one box received. */
export async function boxScanCounts(
  ctx: Ctx,
  boxId: Id<"transferBoxes">
): Promise<Map<string, number>> {
  const scans = await ctx.db
    .query("receivingScans")
    .withIndex("by_box", (q) => q.eq("boxId", boxId))
    .collect();
  return tally(scans);
}

/** The newest scan on a receipt, transfer or box that has not been undone. */
export async function latestStandingScan(
  ctx: Ctx,
  target:
    | { supplierReceiptId: Id<"supplierReceipts"> }
    | { transferId: Id<"transfers"> }
    | { boxId: Id<"transferBoxes"> }
): Promise<Doc<"receivingScans"> | null> {
  const newestFirst =
    "supplierReceiptId" in target
      ? ctx.db
          .query("receivingScans")
          .withIndex("by_supplierReceipt", (q) =>
            q.eq("supplierReceiptId", target.supplierReceiptId)
          )
          .order("desc")
      : "transferId" in target
        ? ctx.db
            .query("receivingScans")
            .withIndex("by_transfer", (q) => q.eq("transferId", target.transferId))
            .order("desc")
        : ctx.db
            .query("receivingScans")
            .withIndex("by_box", (q) => q.eq("boxId", target.boxId))
            .order("desc");

  for await (const scan of newestFirst) {
    if (scan.undoneAt === undefined) return scan;
  }
  return null;
}

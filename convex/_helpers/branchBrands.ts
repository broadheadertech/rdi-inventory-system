// Which brands a branch may receive. A branch with no brand list takes every
// brand — head-office departments, and anything not yet set up — so a brand
// added to the catalog later is covered without editing every branch.

import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

export async function brandNameMap(ctx: QueryCtx): Promise<Map<string, string>> {
  const brands = await ctx.db.query("brands").collect();
  return new Map(brands.map((b) => [b._id as string, b.name]));
}

export function carriesAllBrands(branch: Doc<"branches">): boolean {
  return !branch.brandIds || branch.brandIds.length === 0;
}

export function branchCarries(
  branch: Doc<"branches">,
  brandId: Id<"brands"> | undefined | null
): boolean {
  // A product with no brand cannot be held against one.
  if (carriesAllBrands(branch) || !brandId) return true;
  return branch.brandIds!.includes(brandId);
}

/** "Aeropostale", "Aeropostale + Hurley" or "All brands". */
export function brandLabel(branch: Doc<"branches">, names: Map<string, string>): string {
  if (carriesAllBrands(branch)) return "All brands";
  return branch.brandIds!.map((id) => names.get(id as string) ?? "Unknown").join(" + ");
}

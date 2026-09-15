// convex/_helpers/variantIdentity.ts — one SKU per style, color and size.
//
// A style's variants are its colors × sizes, and each combination is exactly
// one SKU: five pieces of Black / M are a quantity of one SKU, never two SKUs
// splitting the stock between them. Colors and sizes are compared ignoring case
// and extra spaces, so "Black " and "black" are the same color. Deactivated
// variants count too — bringing one back is a reactivation, not a new SKU.
// Style codes, by contrast, may repeat.

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The style's variant with this color and size, other than `exceptId`, if there is one. */
export async function variantWithColorSize(
  ctx: Ctx,
  styleId: Id<"styles">,
  color: string,
  size: string,
  exceptId?: Id<"variants">
): Promise<Doc<"variants"> | null> {
  const colorKey = normalizeLabel(color);
  const sizeKey = normalizeLabel(size);
  const siblings = await ctx.db
    .query("variants")
    .withIndex("by_style", (q) => q.eq("styleId", styleId))
    .collect();
  return (
    siblings.find(
      (v) =>
        v._id !== exceptId &&
        normalizeLabel(v.color) === colorKey &&
        normalizeLabel(v.size) === sizeKey
    ) ?? null
  );
}

export function duplicateVariantMessage(existing: Doc<"variants">): string {
  return (
    `This style already has ${existing.color} / ${existing.size} as SKU ${existing.sku}` +
    (existing.isActive ? "." : " (deactivated — reactivate it instead).")
  );
}

// convex/_helpers/variantSku.ts — how a variant's SKU is spelled.
//
// A SKU reads: style code, the colour's letter within the style, the colour,
// then the size — ALTT0425-1307-C-SKYBLUE-XL. The style code repeats across a
// style's variants; the rest is what makes each one unique.
//
// Pure on purpose: the generator previews SKUs in the browser with this, and
// createVariantMatrix mints them on the server with the same function, so what
// the preview shows is what gets saved.

/** Upper-case, with anything that isn't a letter or digit removed. */
export function skuToken(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function buildVariantSku(args: {
  styleCode: string;
  colorCode: string;
  color: string;
  size: string;
}): string {
  return [
    args.styleCode.trim().toUpperCase(),
    args.colorCode.trim().toUpperCase(),
    skuToken(args.color),
    skuToken(args.size),
  ]
    .filter((part) => part !== "")
    .join("-");
}

/** Colours are compared ignoring case and extra spaces, as they are everywhere else. */
export function colorKey(color: string): string {
  return color.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The letter each colour carries within a style — A, B, C… in the order the
 * colours were first added. Colours already on the style keep the letter they
 * have; new ones take the next free letters.
 *
 * `existing` maps a colour key to the letter it already holds.
 */
export function assignColorCodes(
  existing: Map<string, string>,
  colors: string[]
): Map<string, string> {
  const assigned = new Map(existing);
  const used = new Set(existing.values());
  for (const color of colors) {
    const key = colorKey(color);
    if (assigned.has(key)) continue;
    let letter = "";
    for (let i = 0; i < 26; i++) {
      const candidate = String.fromCharCode(65 + i);
      if (!used.has(candidate)) {
        letter = candidate;
        break;
      }
    }
    // Past Z a style's colours simply stop carrying a letter, as before.
    if (letter === "") continue;
    assigned.set(key, letter);
    used.add(letter);
  }
  return assigned;
}

// convex/_helpers/masterdata.ts — reading the merchandising masterdata export.
//
// The masterdata is one row per SKU: brand, department, class, category, sub
// category, style code, color, size and item code, with the SRP, today's price
// and the landed cost. A style is its STYLE CODE within a brand — descriptions
// like "GRAPHIC TEES" repeat across hundreds of styles and never identify one.
//
// Pure functions only, so the admin page can check a file against the same
// rules the import applies.

// One transaction per batch: every row reads its style and that style's SKUs,
// so a batch stays well inside a mutation's read limit at this size.
export const MASTERDATA_BATCH_SIZE = 100;

export type Gender ="mens" | "womens" | "unisex" | "kids" | "boys" | "girls";

export type ProductCodeType = "department" | "division" | "category" | "subCategory";

/** Uppercase, trimmed, single-spaced — how labels are compared. */
export function cleanLabel(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

// The export spells a few values differently from Settings → Product Codes.
const CODE_ALIASES: Partial<Record<ProductCodeType, Record<string, string>>> = {
  division: { "NON APPAREL": "NON-APPAREL" },
  subCategory: {
    "BOARD SHORTS": "BOARDSHORTS",
    "EAU DE PARFUM": "EAU DE PERFUM",
    GIFTCARD: "GIFT CARD",
    "DUFFLE BAG": "DUFFLE",
    BELTS: "BELT",
  },
};

/** The product code description a masterdata value should match. */
export function productCodeDescription(type: ProductCodeType, raw: string | undefined): string {
  const label = cleanLabel(raw);
  return CODE_ALIASES[type]?.[label] ?? label;
}

/** Placeholder rows the export carries for codes it has not assigned yet. */
export function isReservedRow(row: { department?: string; category?: string }): boolean {
  return cleanLabel(row.department) === "RESERVED" || cleanLabel(row.category) === "RESERVED";
}

/** CALENDAR CODE is YYMM: "2603" is March 2026. */
export function parseCalendarCode(raw: string | undefined): { year: string; month: string } | undefined {
  const code = (raw ?? "").trim();
  if (!/^\d{4}$/.test(code)) return undefined;
  const month = code.slice(2);
  const m = Number(month);
  if (m < 1 || m > 12) return undefined;
  return { year: code.slice(0, 2), month };
}

/** CLASSIFICATON → the production line it names in Product Codes. */
export function productionDescription(classification: string | undefined): string | undefined {
  switch (cleanLabel(classification)) {
    case "BASELINE":
    case "ONLINE EXCLUSIVE":
      return "REGULAR";
    case "MFO":
      return "MADE FOR OUTLET (MFO)";
    case "FAST BUY":
    case "FASTBUY":
      return "FAST BUY";
    case "PREMIUM":
      return "PREMIUM LINE";
    default:
      return undefined;
  }
}

/** CLASSIFICATON → the outlier it names in Product Codes, when it is one. */
export function outlierDescription(classification: string | undefined): string | undefined {
  return cleanLabel(classification) === "ONLINE EXCLUSIVE" ? "ONLINE EXCLUSIVE" : undefined;
}

/**
 * Style codes are written "HMTT0123-0005-B" and "HMTT0123-0005 B" for the same
 * thing; the hyphen form is the one the app generates.
 */
export function normalizeStyleCode(raw: string | undefined): string {
  return cleanLabel(raw).replace(/ ([A-Z])$/, "-$1");
}

// Generated style codes: brand letter, department, category, sub category,
// MMYY, then the running number — AMTT0126-0001, with an optional -S/-A/-B.
const GENERATED_STYLE_CODE = /^([A-Z])[A-Z]{3}\d{4}-(\d{4})(?:-[A-Z])?$/;

/** The running number of a generated style code, so new styles continue after it. */
export function styleSequenceNumber(styleCode: string): number | undefined {
  const match = GENERATED_STYLE_CODE.exec(styleCode);
  return match ? Number(match[2]) : undefined;
}

/** The brand letter a generated style code starts with. */
export function brandCodeFromStyleCode(styleCode: string): string | undefined {
  return GENERATED_STYLE_CODE.exec(styleCode)?.[1];
}

/** DEPARTMENT → the variant's gender. */
export function genderFromDepartment(dept: string | undefined): Gender | undefined {
  switch (cleanLabel(dept)) {
    case "MENS":
    case "MEN":
    case "MALE":
      return "mens";
    case "LADIES":
    case "WOMENS":
    case "WOMEN":
    case "FEMALE":
      return "womens";
    case "UNISEX":
      return "unisex";
    case "KIDS":
      return "kids";
    case "BOYS":
      return "boys";
    case "GIRLS":
      return "girls";
    default:
      return undefined;
  }
}

/** "PLAYBOY" → "Playboy", matching how brands are named in the catalog. */
export function brandDisplayName(raw: string): string {
  return cleanLabel(raw)
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

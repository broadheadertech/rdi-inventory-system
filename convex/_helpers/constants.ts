// Garment size order for cross-branch stock display (XS → S → M → L → XL → XXL → ...)
// Numeric sizes and unknowns fall back to localeCompare (value 99)
export const GARMENT_SIZE_ORDER: Record<string, number> = {
  XS: 0,
  S: 1,
  M: 2,
  L: 3,
  XL: 4,
  XXL: 5,
  XXXL: 6,
};

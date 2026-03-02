import type { Doc } from "../convex/_generated/dataModel";

// Re-export Convex document types for convenience
export type User = Doc<"users">;
export type Branch = Doc<"branches">;
export type Brand = Doc<"brands">;
export type Category = Doc<"categories">;
export type Style = Doc<"styles">;
export type Variant = Doc<"variants">;
export type Transaction = Doc<"transactions">;
export type Transfer = Doc<"transfers">;
export type ProductImage = Doc<"productImages">;

// Product hierarchy path
export type ProductHierarchy = {
  brand: Doc<"brands">;
  category: Doc<"categories">;
  style: Doc<"styles">;
  variant: Doc<"variants">;
};

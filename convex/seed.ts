import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// ─── Branch Seed Data ────────────────────────────────────────────────────────

const SEED_BRANCHES = [
  {
    name: "Central Warehouse",
    address: "Lot 5 Block 3, LISP Industrial Zone, Cabuyao, Laguna 4025",
    phone: "+63 49 888 0001",
    latitude: 14.2714,
    longitude: 121.1254,
    type: "warehouse" as const,
    configuration: {
      timezone: "Asia/Manila",
      businessHours: { openTime: "08:00", closeTime: "17:00" },
    },
  },
  {
    name: "Manila Flagship",
    address: "123 Rizal Avenue, Sta. Cruz, Manila, Metro Manila 1003",
    phone: "+63 2 8888 1001",
    latitude: 14.6042,
    longitude: 120.9822,
    type: "retail" as const,
    configuration: {
      timezone: "Asia/Manila",
      businessHours: { openTime: "10:00", closeTime: "21:00" },
    },
  },
  {
    name: "Cebu Branch",
    address: "456 Osmeña Blvd, Cebu City, Cebu 6000",
    phone: "+63 32 888 2002",
    latitude: 10.3157,
    longitude: 123.8854,
    type: "retail" as const,
    configuration: {
      timezone: "Asia/Manila",
      businessHours: { openTime: "10:00", closeTime: "20:00" },
    },
  },
  {
    name: "Davao Branch",
    address: "789 JP Laurel Ave, Bajada, Davao City, Davao del Sur 8000",
    phone: "+63 82 888 3003",
    latitude: 7.0731,
    longitude: 125.6128,
    type: "retail" as const,
    configuration: {
      timezone: "Asia/Manila",
      businessHours: { openTime: "10:00", closeTime: "20:00" },
    },
  },
];

// ─── Catalog Seed Data ───────────────────────────────────────────────────────

const CATALOG = [
  {
    brand: "URBAN CORE",
    categories: [
      {
        name: "T-Shirts",
        styles: [
          { name: "Metro Basic Tee", price: 49900, desc: "Essential cotton crew neck tee" },
          { name: "Graffiti Tag Tee", price: 59900, desc: "Oversized tee with graffiti print" },
          { name: "Concrete Jungle Tee", price: 54900, desc: "Urban landscape graphic tee" },
          { name: "Midnight Drift Tee", price: 64900, desc: "Reflective logo night tee" },
        ],
      },
      {
        name: "Hoodies",
        styles: [
          { name: "Skyline Pullover", price: 149900, desc: "Heavyweight French terry hoodie" },
          { name: "Blackout Zip-Up", price: 169900, desc: "Full-zip hoodie with hidden pockets" },
          { name: "Foggy Morning Hoodie", price: 159900, desc: "Acid-wash oversized hoodie" },
        ],
      },
      {
        name: "Joggers",
        styles: [
          { name: "Pavement Runner", price: 119900, desc: "Slim-fit tech joggers" },
          { name: "Night Shift Jogger", price: 129900, desc: "Reflective stripe joggers" },
          { name: "Cargo District Jogger", price: 139900, desc: "Multi-pocket cargo joggers" },
          { name: "Chill Mode Sweatpant", price: 109900, desc: "Relaxed fit French terry jogger" },
        ],
      },
    ],
  },
  {
    brand: "STREET PULSE",
    categories: [
      {
        name: "Caps",
        styles: [
          { name: "Classic Snapback", price: 59900, desc: "Flat brim snapback with embroidered logo" },
          { name: "Dad Cap Washed", price: 49900, desc: "Unstructured washed cotton dad cap" },
          { name: "Trucker Mesh Cap", price: 54900, desc: "Foam front mesh back trucker" },
          { name: "5-Panel Camp Cap", price: 64900, desc: "Nylon 5-panel camp cap" },
        ],
      },
      {
        name: "Shorts",
        styles: [
          { name: "Boulevard Board Short", price: 89900, desc: "Quick-dry mesh-lined shorts" },
          { name: "Alley Sweat Short", price: 79900, desc: "French terry cutoff shorts" },
          { name: "Ripstop Cargo Short", price: 99900, desc: "Military-inspired cargo shorts" },
          { name: "Court Side Short", price: 84900, desc: "Basketball-inspired mesh shorts" },
        ],
      },
      {
        name: "Tank Tops",
        styles: [
          { name: "Raw Edge Tank", price: 44900, desc: "Cut-off raw edge tank" },
          { name: "Stringer Vest", price: 39900, desc: "Deep-cut stringer tank" },
          { name: "Box Logo Tank", price: 49900, desc: "Relaxed fit box logo tank top" },
        ],
      },
    ],
  },
  {
    brand: "PRIME THREADS",
    categories: [
      {
        name: "Polo Shirts",
        styles: [
          { name: "Executive Piqué Polo", price: 129900, desc: "Premium piqué cotton polo" },
          { name: "Tech Stretch Polo", price: 149900, desc: "4-way stretch performance polo" },
          { name: "Mandarin Collar Polo", price: 139900, desc: "Modern mandarin collar polo" },
          { name: "Knit Resort Polo", price: 159900, desc: "Open-knit textured polo" },
        ],
      },
      {
        name: "Jackets",
        styles: [
          { name: "Metro Bomber", price: 249900, desc: "Satin bomber with ribbed cuffs" },
          { name: "Coach Windbreaker", price: 199900, desc: "Snap-front coach jacket" },
          { name: "Denim Trucker Jacket", price: 229900, desc: "Classic trucker silhouette" },
          { name: "Tech Shell Jacket", price: 219900, desc: "Water-resistant tech shell" },
        ],
      },
      {
        name: "Dress Shirts",
        styles: [
          { name: "Barong Modern Slim", price: 179900, desc: "Contemporary slim-fit barong tagalog" },
          { name: "Oxford Button-Down", price: 159900, desc: "Classic oxford cloth shirt" },
          { name: "Linen Blend Shirt", price: 169900, desc: "Breathable linen-cotton blend" },
          { name: "Stretch Poplin Shirt", price: 149900, desc: "Easy-care stretch poplin" },
        ],
      },
    ],
  },
];

// ─── Variant Matrices ────────────────────────────────────────────────────────

const VARIANT_MATRICES: Record<string, { colors: string[]; sizes: string[] }> = {
  "T-Shirts":     { colors: ["Black", "White", "Navy", "Red", "Olive"], sizes: ["S", "M", "L", "XL", "XXL"] },
  "Hoodies":      { colors: ["Black", "Navy", "Olive"],                 sizes: ["S", "M", "L", "XL", "XXL"] },
  "Joggers":      { colors: ["Black", "Navy", "Olive", "White"],        sizes: ["S", "M", "L", "XL"] },
  "Caps":         { colors: ["Black", "White", "Navy", "Red"],          sizes: ["One Size"] },
  "Shorts":       { colors: ["Black", "Navy", "Olive", "White"],        sizes: ["S", "M", "L", "XL"] },
  "Tank Tops":    { colors: ["Black", "White", "Red"],                  sizes: ["S", "M", "L", "XL"] },
  "Polo Shirts":  { colors: ["Black", "White", "Navy"],                 sizes: ["S", "M", "L", "XL", "XXL"] },
  "Jackets":      { colors: ["Black", "Navy", "Olive"],                 sizes: ["S", "M", "L", "XL"] },
  "Dress Shirts": { colors: ["White", "Navy", "Black"],                 sizes: ["S", "M", "L", "XL"] },
};

// ─── SKU Generator ───────────────────────────────────────────────────────────

const BRAND_CODES: Record<string, string> = {
  "URBAN CORE": "UC",
  "STREET PULSE": "SP",
  "PRIME THREADS": "PT",
};

const CAT_CODES: Record<string, string> = {
  "T-Shirts": "TS", "Hoodies": "HD", "Joggers": "JG",
  "Caps": "CP", "Shorts": "SH", "Tank Tops": "TK",
  "Polo Shirts": "PL", "Jackets": "JK", "Dress Shirts": "DS",
};

const COLOR_CODES: Record<string, string> = {
  "Black": "BLK", "White": "WHT", "Navy": "NVY",
  "Red": "RED", "Olive": "OLV",
};

function generateSku(
  brand: string,
  category: string,
  styleIndex: number,
  color: string,
  size: string,
): string {
  const sizeCode = size === "One Size" ? "OS" : size;
  return `${BRAND_CODES[brand]}-${CAT_CODES[category]}-${String(styleIndex + 1).padStart(2, "0")}-${COLOR_CODES[color]}-${sizeCode}`;
}

// ─── Internal Mutations ──────────────────────────────────────────────────────

export const _seedBranches = internalMutation({
  args: {
    branches: v.array(
      v.object({
        name: v.string(),
        address: v.string(),
        phone: v.optional(v.string()),
        latitude: v.optional(v.number()),
        longitude: v.optional(v.number()),
        type: v.optional(v.union(v.literal("retail"), v.literal("warehouse"))),
        configuration: v.optional(
          v.object({
            timezone: v.optional(v.string()),
            businessHours: v.optional(
              v.object({
                openTime: v.string(),
                closeTime: v.string(),
              })
            ),
          })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const results: { name: string; id: Id<"branches">; created: boolean }[] = [];
    for (const branch of args.branches) {
      const allBranches = await ctx.db.query("branches").collect();
      const existing = allBranches.find(
        (b) => b.name.toLowerCase() === branch.name.toLowerCase()
      );
      if (existing) {
        results.push({ name: branch.name, id: existing._id, created: false });
      } else {
        const id = await ctx.db.insert("branches", {
          ...branch,
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        results.push({ name: branch.name, id, created: true });
      }
    }
    return results;
  },
});

// ─── Main Seed Action ────────────────────────────────────────────────────────

export const seedDatabase = action({
  args: {},
  handler: async (ctx): Promise<{
    branches: { created: number; total: number };
    products: { created: number; skipped: number; total: number };
    inventory: { variants: number; branches: number; estimatedRows: number };
  }> => {
    // 1. Verify admin
    const user = await ctx.runQuery(
      internal.catalog.bulkImport._verifyAdminRole
    );

    console.log("=== RedBox Apparel Seed: Starting ===");

    // 2. Seed branches
    console.log("Seeding branches...");
    const branchResults: Array<{ name: string; id: Id<"branches">; created: boolean }> =
      await ctx.runMutation(internal.seed._seedBranches, {
        branches: SEED_BRANCHES,
      });
    const branchesCreated = branchResults.filter((b: { created: boolean }) => b.created).length;
    console.log(
      `Branches: ${branchesCreated} created, ${branchResults.length - branchesCreated} existing`
    );

    // 3. Generate flat items array
    console.log("Generating product catalog...");
    const items: Array<{
      brand: string;
      category: string;
      styleName: string;
      desc: string;
      price: number;
      sku: string;
      size: string;
      color: string;
    }> = [];

    for (const brandDef of CATALOG) {
      for (const catDef of brandDef.categories) {
        const matrix = VARIANT_MATRICES[catDef.name];
        for (let si = 0; si < catDef.styles.length; si++) {
          const style = catDef.styles[si];
          for (const color of matrix.colors) {
            for (const size of matrix.sizes) {
              items.push({
                brand: brandDef.brand,
                category: catDef.name,
                styleName: style.name,
                desc: style.desc,
                price: style.price,
                sku: generateSku(brandDef.brand, catDef.name, si, color, size),
                size,
                color,
              });
            }
          }
        }
      }
    }

    console.log(`Generated ${items.length} variant items`);

    // 4. Create catalog using existing bulkImport internal mutations
    const brandCache = new Map<string, Id<"brands">>();
    const categoryCache = new Map<string, Id<"categories">>();
    const styleCache = new Map<string, Id<"styles">>();
    const variantIds: Id<"variants">[] = [];
    let successCount = 0;
    let skipCount = 0;

    for (const row of items) {
      try {
        // Brand
        const brandKey = row.brand.toLowerCase();
        let brandId = brandCache.get(brandKey);
        if (!brandId) {
          const result = await ctx.runMutation(
            internal.catalog.bulkImport._findOrCreateBrand,
            { name: row.brand, userId: user._id }
          );
          brandId = result.id;
          brandCache.set(brandKey, brandId!);
        }

        // Category
        const catKey = `${brandKey}::${row.category.toLowerCase()}`;
        let categoryId = categoryCache.get(catKey);
        if (!categoryId) {
          const result = await ctx.runMutation(
            internal.catalog.bulkImport._findOrCreateCategory,
            { brandId, name: row.category, userId: user._id }
          );
          categoryId = result.id;
          categoryCache.set(catKey, categoryId!);
        }

        // Style
        const styleKey = `${catKey}::${row.styleName.toLowerCase()}`;
        let styleId = styleCache.get(styleKey);
        if (!styleId) {
          const result = await ctx.runMutation(
            internal.catalog.bulkImport._findOrCreateStyle,
            {
              categoryId,
              name: row.styleName,
              description: row.desc,
              basePriceCentavos: row.price,
              userId: user._id,
            }
          );
          styleId = result.id;
          styleCache.set(styleKey, styleId!);
        }

        // Variant
        const variantId = await ctx.runMutation(
          internal.catalog.bulkImport._createImportedVariant,
          {
            styleId,
            sku: row.sku,
            size: row.size,
            color: row.color,
            gender: "unisex",
            priceCentavos: row.price,
            userId: user._id,
          }
        );
        variantIds.push(variantId);
        successCount++;
      } catch {
        skipCount++;
      }
    }

    console.log(
      `Products: ${successCount} created, ${skipCount} skipped`
    );

    // 5. Seed inventory across branches
    if (variantIds.length > 0) {
      console.log("Seeding inventory...");
      const branchIds = branchResults.map((b: { id: Id<"branches"> }) => b.id);
      const quantityMultipliers = [1.0, 0.7, 0.5]; // Manila full, Cebu 70%, Davao 50%
      const baseQuantities = [15, 20, 25, 30, 35, 40, 45, 50];

      const BATCH_SIZE = 50;
      let inventoryCreated = 0;
      const inventoryItems: Array<{
        branchId: Id<"branches">;
        variantId: Id<"variants">;
        quantity: number;
      }> = [];

      for (let bi = 0; bi < branchIds.length; bi++) {
        for (let vi = 0; vi < variantIds.length; vi++) {
          const baseQty = baseQuantities[vi % baseQuantities.length];
          const quantity = Math.round(baseQty * quantityMultipliers[bi]);
          inventoryItems.push({
            branchId: branchIds[bi],
            variantId: variantIds[vi],
            quantity,
          });
        }
      }

      for (let i = 0; i < inventoryItems.length; i += BATCH_SIZE) {
        const batch = inventoryItems.slice(i, i + BATCH_SIZE);
        const result = await ctx.runMutation(
          internal.inventory.stockLevels._seedInventoryBatch,
          { items: batch }
        );
        inventoryCreated += result.created;
      }

      console.log(
        `Inventory: ${inventoryCreated} rows across ${branchIds.length} branches`
      );
    }

    // 6. Summary
    const summary = {
      branches: { created: branchesCreated, total: branchResults.length },
      products: { created: successCount, skipped: skipCount, total: items.length },
      inventory: {
        variants: variantIds.length,
        branches: branchResults.length,
        estimatedRows: variantIds.length * branchResults.length,
      },
    };

    console.log("=== RedBox Apparel Seed: Complete ===");
    return summary;
  },
});

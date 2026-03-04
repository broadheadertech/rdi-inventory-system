import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
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
        if (variantId.status === "created") {
          variantIds.push(variantId.variantId);
          successCount++;
        } else {
          skipCount++;
        }
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

// ═══════════════════════════════════════════════════════════════════════════════
// Velocity / Movement Index Seeder
// Creates controlled transaction data to demonstrate MI formula tiers.
//
//   MI = ADS² / CurrentStock   (where ADS = TotalSold / Days)
//
//   FAST_MOVING:   MI >= 0.30
//   MEDIUM_MOVING: MI 0.10–0.29
//   SLOW_MOVING:   MI < 0.10
//   NO_MOVEMENT:   0 sales
// ═══════════════════════════════════════════════════════════════════════════════

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Get PHT midnight start for today */
function phtDayStart(): number {
  const nowPht = Date.now() + PHT_OFFSET_MS;
  return nowPht - (nowPht % DAY_MS) - PHT_OFFSET_MS;
}

/**
 * Velocity scenarios — each picks a different variant and creates transactions
 * over the past 7 days to land in a specific MI tier.
 *
 * The "Expected" comments assume a 7-day window with the listed stock level.
 */
const VELOCITY_SCENARIOS = [
  {
    label: "Hot Seller (FAST)",
    // Sell 10/day × 7 days = 70 total, keep stock at 30
    // ADS = 10, DSI = 3, MI = 10²/30 = 3.33  → FAST_MOVING ✓
    dailySales: [10, 10, 10, 10, 10, 10, 10],
    stockAfter: 30,
  },
  {
    label: "Consistent Seller (FAST)",
    // Sell 5/day × 7 days = 35 total, stock 60
    // ADS = 5, DSI = 12, MI = 25/60 = 0.42  → FAST_MOVING ✓
    dailySales: [5, 5, 5, 5, 5, 5, 5],
    stockAfter: 60,
  },
  {
    label: "Moderate Seller (MEDIUM)",
    // Sell 3/day × 5 days = 15 total, stock 100
    // ADS = 15/7 = 2.14, MI = 4.59/100 = 0.046... wait
    // Let me recalc: ADS=2.14, MI=2.14²/100 = 0.046 → SLOW
    // Adjust: Sell 4/day × 7 days = 28, stock 80 → ADS=4, MI=16/80 = 0.20 → MEDIUM ✓
    dailySales: [4, 4, 4, 4, 4, 4, 4],
    stockAfter: 80,
  },
  {
    label: "Bulk Spike (MEDIUM)",
    // 1 big purchase of 30 on day 3, nothing else, stock 200
    // ADS = 30/7 = 4.29, MI = 18.37/200 = 0.092 → SLOW (barely)
    // Adjust: 50 on day 3, stock 150 → ADS=7.14, MI=51/150 = 0.34 → FAST
    // Adjust: 25 on day 3 + 10 on day 5, stock 120 → ADS=35/7=5, MI=25/120=0.21 → MEDIUM ✓
    dailySales: [0, 0, 25, 0, 10, 0, 0],
    stockAfter: 120,
  },
  {
    label: "Slow Trickle (SLOW)",
    // Sell 1 unit on day 2 and day 5, stock 200
    // ADS = 2/7 = 0.286, MI = 0.082/200 = 0.0004 → SLOW ✓
    dailySales: [0, 1, 0, 0, 1, 0, 0],
    stockAfter: 200,
  },
  {
    label: "Dead Stock (NO_MOVEMENT)",
    // 0 sales, stock 150 → ADS=0, MI=0 → NO_MOVEMENT ✓
    dailySales: [0, 0, 0, 0, 0, 0, 0],
    stockAfter: 150,
  },
];

export const _seedVelocityBatch = internalMutation({
  args: {
    transactions: v.array(
      v.object({
        branchId: v.id("branches"),
        cashierId: v.id("users"),
        variantId: v.id("variants"),
        quantity: v.number(),
        unitPriceCentavos: v.number(),
        createdAt: v.number(),
      })
    ),
    inventoryUpdates: v.array(
      v.object({
        branchId: v.id("branches"),
        variantId: v.id("variants"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let txnCount = 0;
    for (const txn of args.transactions) {
      if (txn.quantity <= 0) continue;
      const lineTotal = txn.quantity * txn.unitPriceCentavos;
      const txnId = await ctx.db.insert("transactions", {
        branchId: txn.branchId,
        cashierId: txn.cashierId,
        receiptNumber: `SEED-VEL-${Date.now()}-${txnCount}`,
        subtotalCentavos: lineTotal,
        vatAmountCentavos: 0,
        discountAmountCentavos: 0,
        totalCentavos: lineTotal,
        paymentMethod: "cash",
        isOffline: false,
        createdAt: txn.createdAt,
      });
      await ctx.db.insert("transactionItems", {
        transactionId: txnId,
        variantId: txn.variantId,
        quantity: txn.quantity,
        unitPriceCentavos: txn.unitPriceCentavos,
        lineTotalCentavos: lineTotal,
      });
      txnCount++;
    }

    // Set inventory to target stock levels
    for (const inv of args.inventoryUpdates) {
      const existing = await ctx.db
        .query("inventory")
        .withIndex("by_branch_variant", (q) =>
          q.eq("branchId", inv.branchId).eq("variantId", inv.variantId)
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { quantity: inv.quantity, updatedAt: Date.now() });
      } else {
        await ctx.db.insert("inventory", {
          branchId: inv.branchId,
          variantId: inv.variantId,
          quantity: inv.quantity,
          updatedAt: Date.now(),
        });
      }
    }

    return { transactionsCreated: txnCount, inventoryUpdated: args.inventoryUpdates.length };
  },
});

export const seedVelocityData = action({
  args: {},
  handler: async (ctx): Promise<{
    transactionsCreated: number;
    inventoryUpdated: number;
    branch: string;
    scenarios: Array<{ label: string; sku: string; totalSold: number; stock: number }>;
  }> => {
    // 1. Find an admin user directly (no auth needed for CLI seeding)
    const user = await ctx.runQuery(internal.seed._getAdminUser);
    if (!user) throw new Error("No admin user found in DB. Run seedDatabase first.");

    console.log("=== Velocity Seed: Starting ===");

    // 2. Find a retail branch
    const branches = await ctx.runQuery(internal.seed._getRetailBranches);
    if (branches.length === 0) throw new Error("No retail branches found. Run seedDatabase first.");
    const branch = branches[0];
    console.log(`Using branch: ${branch.name} (${branch._id})`);

    // 3. Pick variants (one per scenario)
    const variants = await ctx.runQuery(internal.seed._getVariantsForVelocity, {
      count: VELOCITY_SCENARIOS.length,
    });
    if (variants.length < VELOCITY_SCENARIOS.length) {
      throw new Error(`Need ${VELOCITY_SCENARIOS.length} variants, found ${variants.length}. Run seedDatabase first.`);
    }

    // 4. Build transactions for each scenario
    const todayStart = phtDayStart();
    const transactions: Array<{
      branchId: Id<"branches">;
      cashierId: Id<"users">;
      variantId: Id<"variants">;
      quantity: number;
      unitPriceCentavos: number;
      createdAt: number;
    }> = [];
    const inventoryUpdates: Array<{
      branchId: Id<"branches">;
      variantId: Id<"variants">;
      quantity: number;
    }> = [];

    for (let si = 0; si < VELOCITY_SCENARIOS.length; si++) {
      const scenario = VELOCITY_SCENARIOS[si];
      const variant = variants[si];
      console.log(`Scenario ${si + 1}: ${scenario.label} → ${variant.sku}`);

      // Create transactions for each day (day 0 = 6 days ago, day 6 = today)
      for (let day = 0; day < scenario.dailySales.length; day++) {
        const qty = scenario.dailySales[day];
        if (qty <= 0) continue;
        const txnTime = todayStart - (6 - day) * DAY_MS + 10 * 60 * 60 * 1000; // 10am PHT each day
        transactions.push({
          branchId: branch._id,
          cashierId: user._id,
          variantId: variant._id,
          quantity: qty,
          unitPriceCentavos: variant.priceCentavos,
          createdAt: txnTime,
        });
      }

      // Set stock level for target branch, zero out other branches
      inventoryUpdates.push({
        branchId: branch._id,
        variantId: variant._id,
        quantity: scenario.stockAfter,
      });
      for (const otherBranch of branches) {
        if (otherBranch._id !== branch._id) {
          inventoryUpdates.push({
            branchId: otherBranch._id,
            variantId: variant._id,
            quantity: 0,
          });
        }
      }
    }

    // 5. Execute
    const result = await ctx.runMutation(internal.seed._seedVelocityBatch, {
      transactions,
      inventoryUpdates,
    });

    // 6. Print expected results
    console.log("\n=== Expected MI Results (7D window) ===");
    for (let si = 0; si < VELOCITY_SCENARIOS.length; si++) {
      const s = VELOCITY_SCENARIOS[si];
      const v = variants[si];
      const totalSold = s.dailySales.reduce((a, b) => a + b, 0);
      const ads = totalSold / 7;
      const dsi = ads > 0 ? s.stockAfter / ads : 0;
      const mi = ads > 0 && s.stockAfter > 0 ? (ads * ads) / s.stockAfter : (ads > 0 ? 999 : 0);
      const tier = totalSold === 0 ? "NO_MOVEMENT" : mi >= 0.30 ? "FAST" : mi >= 0.10 ? "MEDIUM" : "SLOW";
      console.log(
        `${s.label.padEnd(30)} | SKU: ${v.sku.padEnd(20)} | Sold: ${String(totalSold).padStart(3)} | Stock: ${String(s.stockAfter).padStart(3)} | ADS: ${ads.toFixed(1)} | DSI: ${dsi.toFixed(0)}d | MI: ${mi.toFixed(2)} → ${tier}`
      );
    }

    console.log("\n=== Velocity Seed: Complete ===");
    return {
      ...result,
      branch: branch.name,
      scenarios: VELOCITY_SCENARIOS.map((s, i) => ({
        label: s.label,
        sku: variants[i].sku,
        totalSold: s.dailySales.reduce((a, b) => a + b, 0),
        stock: s.stockAfter,
      })),
    };
  },
});

/** Helper queries for velocity seeder */
export const _getAdminUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.find((u) => u.role === "admin" && u.isActive) ?? null;
  },
});

export const _getRetailBranches = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("branches").collect();
    return all.filter((b) => b.type === "retail" && b.isActive);
  },
});

export const _getVariantsForVelocity = internalQuery({
  args: { count: v.number() },
  handler: async (ctx, args) => {
    const variants = await ctx.db.query("variants").take(args.count * 3);
    // Pick every 3rd variant to spread across different styles
    const picked: typeof variants = [];
    for (let i = 0; i < variants.length && picked.length < args.count; i += 3) {
      picked.push(variants[i]);
    }
    // If not enough with stride, just fill from remaining
    if (picked.length < args.count) {
      for (const v of variants) {
        if (picked.length >= args.count) break;
        if (!picked.includes(v)) picked.push(v);
      }
    }
    return picked;
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// MIGRATE: Populate colors & sizes lookup tables from existing variants
// ═══════════════════════════════════════════════════════════════════════════════

export const migrateColorsAndSizes = action({
  args: {},
  handler: async (ctx): Promise<{
    colorsCreated: number;
    colorsSkipped: number;
    sizesCreated: number;
    sizesSkipped: number;
  }> => {
    const result = await ctx.runMutation(internal.seed._migrateColorsAndSizesBatch);
    console.log("=== Migration Complete ===");
    console.log(`Colors created: ${result.colorsCreated} (skipped ${result.colorsSkipped} duplicates)`);
    console.log(`Sizes created: ${result.sizesCreated} (skipped ${result.sizesSkipped} duplicates)`);
    return result;
  },
});

export const _migrateColorsAndSizesBatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const variants = await ctx.db.query("variants").collect();

    // Collect distinct colors and sizes from variants
    const colorSet = new Set<string>();
    const sizeSet = new Set<string>();
    for (const v of variants) {
      if (v.color && v.color.trim()) colorSet.add(v.color.trim());
      if (v.size && v.size.trim()) sizeSet.add(v.size.trim());
    }

    // Get existing colors/sizes to avoid duplicates
    const existingColors = await ctx.db.query("colors").collect();
    const existingColorNames = new Set(existingColors.map((c) => c.name.toLowerCase()));

    const existingSizes = await ctx.db.query("sizes").collect();
    const existingSizeNames = new Set(existingSizes.map((s) => s.name.toLowerCase()));

    // Insert new colors
    let colorsCreated = 0;
    let colorsSkipped = 0;
    for (const colorName of colorSet) {
      if (existingColorNames.has(colorName.toLowerCase())) {
        colorsSkipped++;
        continue;
      }
      await ctx.db.insert("colors", {
        name: colorName,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      existingColorNames.add(colorName.toLowerCase());
      colorsCreated++;
    }

    // Insert new sizes (sortOrder based on common apparel sizing)
    const APPAREL_ORDER: Record<string, number> = {
      "xxs": 10, "xs": 20, "s": 30, "sm": 30, "small": 30,
      "m": 40, "md": 40, "medium": 40,
      "l": 50, "lg": 50, "large": 50,
      "xl": 60, "xxl": 70, "2xl": 70, "xxxl": 80, "3xl": 80,
      "4xl": 90, "5xl": 100,
    };

    function inferSizeType(name: string): "apparel" | "shoe_eu" | "shoe_us" | "numeric" | undefined {
      const lower = name.toLowerCase().trim();
      if (APPAREL_ORDER[lower] !== undefined) return "apparel";
      // Pure number → try to classify as shoe or numeric
      const num = parseFloat(lower);
      if (!isNaN(num)) {
        if (num >= 35 && num <= 48) return "shoe_eu";
        if (num >= 4 && num <= 15 && (Number.isInteger(num) || lower.includes(".5"))) return "shoe_us";
        return "numeric";
      }
      return undefined;
    }

    let nextOrder = 200; // for unknown sizes
    let sizesCreated = 0;
    let sizesSkipped = 0;
    for (const sizeName of sizeSet) {
      if (existingSizeNames.has(sizeName.toLowerCase())) {
        sizesSkipped++;
        continue;
      }
      const order = APPAREL_ORDER[sizeName.toLowerCase()] ?? nextOrder++;
      const sizeType = inferSizeType(sizeName);
      await ctx.db.insert("sizes", {
        name: sizeName,
        sizeType,
        sortOrder: order,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      existingSizeNames.add(sizeName.toLowerCase());
      sizesCreated++;
    }

    return { colorsCreated, colorsSkipped, sizesCreated, sizesSkipped };
  },
});

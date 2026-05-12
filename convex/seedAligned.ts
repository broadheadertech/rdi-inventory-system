/**
 * Aligned Catalog Seeder
 * ----------------------
 * Reseeds the catalog so every style has the full Product Code hierarchy:
 *   Brand → Department (MENS/LADIES/PACKAGING)
 *         → Division (APPAREL/NON-APPAREL)
 *         → Category (TOPS, BOTTOMS, OUTERWEAR, UNDERWEAR, SWIMWEAR, BAG, CAPS, FRAGRANCE, FOOTWEAR, PACKAGING, NOVELTY)
 *         → Subcategory (TEES, POLO, BOARDSHORTS, BACKPACK, TOTE, etc.)
 *
 * Resolves productCode IDs by description against your existing
 * Settings → Product Codes configuration. Wipes existing catalog +
 * inventory + transactions + promotions + transfers first, then walks
 * the structure below and creates everything with proper links. Branches
 * are NOT touched (run `seed:seedDatabase` first if you don't have them).
 *
 * Run it via:
 *   npx convex run seedAligned:run
 */

import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// ─── Catalog Definition ─────────────────────────────────────────────────────

type Gender = "mens" | "womens" | "unisex" | "kids" | "boys" | "girls";

interface AlignedStyle {
  brand: string;
  department: string; // productCodes.description (type=department)
  division: string; // productCodes.description (type=division)
  category: string; // productCodes.description (type=category)
  subCategory: string; // productCodes.description (type=subCategory)
  name: string;
  description: string;
  styleCode: string;
  basePricePesos: number;
  costPesos: number;
  gender: Gender;
  sizes: string[];
  sizeGroup: string;
  colors: string[];
}

const SIZE_APPAREL = ["S", "M", "L", "XL"];
const SIZE_APPAREL_PLUS = ["S", "M", "L", "XL", "XXL"];
const SIZE_NUMERIC = ["28", "30", "32", "34"];
const SIZE_BIKINI = ["XS", "S", "M", "L"];
const SIZE_FREE = ["OS"];
const SIZE_LADIES = ["XS", "S", "M", "L", "XL"];

const ALIGNED_CATALOG: AlignedStyle[] = [
  // ── AEROPOSTALE · MENS · APPAREL · TOPS ──
  { brand: "Aeropostale", department: "MENS", division: "APPAREL", category: "TOPS", subCategory: "TEES", name: "Aero Original Brand Tee", description: "Classic logo crew-neck cotton tee", styleCode: "AMTT0425-0163", basePricePesos: 999, costPesos: 499, gender: "mens", sizes: SIZE_APPAREL_PLUS, sizeGroup: "Apparel", colors: ["Black", "Star Sapphire", "White"] },
  { brand: "Aeropostale", department: "MENS", division: "APPAREL", category: "TOPS", subCategory: "POLO", name: "Aero Pique Polo", description: "Premium pique cotton polo", styleCode: "AMTP0425-0207", basePricePesos: 1299, costPesos: 649, gender: "mens", sizes: SIZE_APPAREL_PLUS, sizeGroup: "Apparel", colors: ["Navy", "White", "Burgundy"] },
  { brand: "Aeropostale", department: "MENS", division: "APPAREL", category: "TOPS", subCategory: "TANK TOP", name: "Aero Athletic Tank", description: "Performance athletic tank top", styleCode: "AMTN0425-0301", basePricePesos: 699, costPesos: 349, gender: "mens", sizes: SIZE_APPAREL, sizeGroup: "Apparel", colors: ["Black", "Gray", "Navy"] },
  { brand: "Aeropostale", department: "MENS", division: "APPAREL", category: "TOPS", subCategory: "LS KNIT", name: "Aero Long Sleeve Henley", description: "Long sleeve cotton henley", styleCode: "AMLS0425-0411", basePricePesos: 1199, costPesos: 599, gender: "mens", sizes: SIZE_APPAREL, sizeGroup: "Apparel", colors: ["Charcoal", "Cream"] },

  // ── AEROPOSTALE · MENS · APPAREL · BOTTOMS ──
  { brand: "Aeropostale", department: "MENS", division: "APPAREL", category: "BOTTOMS", subCategory: "JEANS", name: "Aero Slim Fit Jeans", description: "5-pocket slim fit denim", styleCode: "AMBJ0425-0512", basePricePesos: 1899, costPesos: 949, gender: "mens", sizes: SIZE_NUMERIC, sizeGroup: "Numeric", colors: ["Indigo", "Black"] },
  { brand: "Aeropostale", department: "MENS", division: "APPAREL", category: "BOTTOMS", subCategory: "SHORTS (NON-GARTERIZED)", name: "Aero Walking Short", description: "Tailored walking shorts", styleCode: "AMBS0425-0618", basePricePesos: 999, costPesos: 499, gender: "mens", sizes: SIZE_NUMERIC, sizeGroup: "Numeric", colors: ["Khaki", "Navy"] },
  { brand: "Aeropostale", department: "MENS", division: "APPAREL", category: "BOTTOMS", subCategory: "PANTS (NON-GARTERIZED)", name: "Aero Chino Pants", description: "Slim-tapered chino pants", styleCode: "AMBP0425-0720", basePricePesos: 1499, costPesos: 749, gender: "mens", sizes: SIZE_NUMERIC, sizeGroup: "Numeric", colors: ["Khaki", "Olive"] },

  // ── AEROPOSTALE · MENS · APPAREL · OUTERWEAR ──
  { brand: "Aeropostale", department: "MENS", division: "APPAREL", category: "OUTERWEAR", subCategory: "HOODIES", name: "Aero Pullover Hoodie", description: "Heavyweight fleece pullover hoodie", styleCode: "AMOH0425-0815", basePricePesos: 1999, costPesos: 999, gender: "mens", sizes: SIZE_APPAREL, sizeGroup: "Apparel", colors: ["Black", "Gray", "Navy"] },
  { brand: "Aeropostale", department: "MENS", division: "APPAREL", category: "OUTERWEAR", subCategory: "JACKET", name: "Aero Bomber Jacket", description: "Lightweight nylon bomber jacket", styleCode: "AMOJ0425-0902", basePricePesos: 2499, costPesos: 1249, gender: "mens", sizes: SIZE_APPAREL, sizeGroup: "Apparel", colors: ["Black", "Olive"] },

  // ── AEROPOSTALE · MENS · APPAREL · UNDERWEAR ──
  { brand: "Aeropostale", department: "MENS", division: "APPAREL", category: "UNDERWEAR", subCategory: "BRIEF", name: "Aero Cotton Brief 3-Pack", description: "Soft cotton brief, 3-piece pack", styleCode: "AMUB0425-1011", basePricePesos: 599, costPesos: 299, gender: "mens", sizes: SIZE_APPAREL, sizeGroup: "Apparel", colors: ["White", "Black"] },
  { brand: "Aeropostale", department: "MENS", division: "APPAREL", category: "UNDERWEAR", subCategory: "UNDERSHIRT", name: "Aero Crew Undershirt", description: "Tagless cotton crew undershirt", styleCode: "AMUU0425-1108", basePricePesos: 399, costPesos: 199, gender: "mens", sizes: SIZE_APPAREL, sizeGroup: "Apparel", colors: ["White", "Gray"] },

  // ── AEROPOSTALE · LADIES · APPAREL · TOPS ──
  { brand: "Aeropostale", department: "LADIES", division: "APPAREL", category: "TOPS", subCategory: "BLOUSE", name: "Aero Crop Blouse", description: "Lightweight cropped chiffon blouse", styleCode: "ALTB0425-1203", basePricePesos: 1199, costPesos: 599, gender: "womens", sizes: SIZE_LADIES, sizeGroup: "Apparel", colors: ["Pink", "White", "Coral"] },
  { brand: "Aeropostale", department: "LADIES", division: "APPAREL", category: "TOPS", subCategory: "TEES", name: "Aero Ladies Logo Tee", description: "Slim fit ladies cotton tee", styleCode: "ALTT0425-1307", basePricePesos: 899, costPesos: 449, gender: "womens", sizes: SIZE_LADIES, sizeGroup: "Apparel", colors: ["White", "Pink", "Sky Blue"] },

  // ── AEROPOSTALE · LADIES · APPAREL · BOTTOMS ──
  { brand: "Aeropostale", department: "LADIES", division: "APPAREL", category: "BOTTOMS", subCategory: "LEGGINGS", name: "Aero Active Legging", description: "High-rise stretch active legging", styleCode: "ALBL0425-1421", basePricePesos: 1299, costPesos: 649, gender: "womens", sizes: SIZE_LADIES, sizeGroup: "Apparel", colors: ["Black", "Navy"] },
  { brand: "Aeropostale", department: "LADIES", division: "APPAREL", category: "BOTTOMS", subCategory: "SKIRT", name: "Aero Mini Skirt", description: "A-line denim mini skirt", styleCode: "ALBS0425-1505", basePricePesos: 1399, costPesos: 699, gender: "womens", sizes: SIZE_LADIES, sizeGroup: "Apparel", colors: ["Indigo", "Black"] },

  // ── AEROPOSTALE · LADIES · APPAREL · UNDERWEAR ──
  { brand: "Aeropostale", department: "LADIES", division: "APPAREL", category: "UNDERWEAR", subCategory: "BRA", name: "Aero Comfort Bra", description: "Wirefree everyday comfort bra", styleCode: "ALUB0425-1612", basePricePesos: 799, costPesos: 399, gender: "womens", sizes: ["32A", "32B", "34A", "34B", "36A"], sizeGroup: "Bra", colors: ["Nude", "Black"] },
  { brand: "Aeropostale", department: "LADIES", division: "APPAREL", category: "UNDERWEAR", subCategory: "PANTY", name: "Aero Bikini Panty 3-Pack", description: "Soft cotton bikini panty, 3-piece pack", styleCode: "ALUP0425-1719", basePricePesos: 599, costPesos: 299, gender: "womens", sizes: SIZE_BIKINI, sizeGroup: "Apparel", colors: ["Multi"] },

  // ── AEROPOSTALE · LADIES · NON-APPAREL · NOVELTY ──
  { brand: "Aeropostale", department: "LADIES", division: "NON-APPAREL", category: "NOVELTY", subCategory: "TOTE", name: "Aero Canvas Ice Cream Tote", description: "Canvas ice cream graphic pouch with pouch bundle", styleCode: "ALNP0226-0001", basePricePesos: 799, costPesos: 399, gender: "womens", sizes: SIZE_FREE, sizeGroup: "OneSize", colors: ["Cannoli Cream/Red", "Blue Tint/White", "Pink-A-Boo/Pink"] },

  // ── HURLEY · MENS · APPAREL · TOPS ──
  { brand: "Hurley", department: "MENS", division: "APPAREL", category: "TOPS", subCategory: "TEES", name: "Hurley Wave Rider Tee", description: "Surf-inspired cotton crew tee", styleCode: "HMTT0425-2011", basePricePesos: 899, costPesos: 449, gender: "mens", sizes: SIZE_APPAREL_PLUS, sizeGroup: "Apparel", colors: ["Black", "Royal Blue", "White"] },
  { brand: "Hurley", department: "MENS", division: "APPAREL", category: "TOPS", subCategory: "TEES", name: "Hurley Sunset Logo Tee", description: "Premium tee with sunset logo print", styleCode: "HMTT0425-2104", basePricePesos: 999, costPesos: 499, gender: "mens", sizes: SIZE_APPAREL, sizeGroup: "Apparel", colors: ["Black", "Coral"] },

  // ── HURLEY · MENS · APPAREL · BOTTOMS ──
  { brand: "Hurley", department: "MENS", division: "APPAREL", category: "BOTTOMS", subCategory: "SHORTS (NON-GARTERIZED)", name: "Hurley Walking Short", description: "Tailored walking shorts", styleCode: "HMBS0425-2207", basePricePesos: 1199, costPesos: 599, gender: "mens", sizes: SIZE_NUMERIC, sizeGroup: "Numeric", colors: ["Khaki", "Navy", "Black"] },

  // ── HURLEY · MENS · APPAREL · OUTERWEAR ──
  { brand: "Hurley", department: "MENS", division: "APPAREL", category: "OUTERWEAR", subCategory: "HOODIES", name: "Hurley Coastline Hoodie", description: "Heavyweight fleece pullover hoodie", styleCode: "HMOH0425-2308", basePricePesos: 2199, costPesos: 1099, gender: "mens", sizes: SIZE_APPAREL, sizeGroup: "Apparel", colors: ["Black", "Navy"] },

  // ── HURLEY · MENS · APPAREL · SWIMWEAR ──
  { brand: "Hurley", department: "MENS", division: "APPAREL", category: "SWIMWEAR", subCategory: "BOARDSHORTS", name: "Hurley Phantom 18 Boardshort", description: "Quick-dry 18-inch boardshorts", styleCode: "HMSW0425-2415", basePricePesos: 1699, costPesos: 849, gender: "mens", sizes: SIZE_NUMERIC, sizeGroup: "Numeric", colors: ["Black", "Royal Blue", "Coral"] },
  { brand: "Hurley", department: "MENS", division: "APPAREL", category: "SWIMWEAR", subCategory: "RASHGUARD", name: "Hurley LS Rashguard", description: "Long sleeve UPF 50+ rashguard", styleCode: "HMSR0425-2506", basePricePesos: 1499, costPesos: 749, gender: "mens", sizes: SIZE_APPAREL, sizeGroup: "Apparel", colors: ["Black", "Navy"] },

  // ── HURLEY · MENS · NON-APPAREL · CAPS ──
  { brand: "Hurley", department: "MENS", division: "NON-APPAREL", category: "CAPS", subCategory: "TRUCKER CAP", name: "Hurley Coastal Trucker", description: "Mesh-back trucker cap", styleCode: "HMNC0425-2613", basePricePesos: 799, costPesos: 399, gender: "unisex", sizes: SIZE_FREE, sizeGroup: "OneSize", colors: ["Black", "Navy", "Cream"] },
  { brand: "Hurley", department: "MENS", division: "NON-APPAREL", category: "CAPS", subCategory: "SNAP", name: "Hurley Wavebreak Snapback", description: "Curved-brim snapback with embroidered logo", styleCode: "HMNS0425-2720", basePricePesos: 899, costPesos: 449, gender: "unisex", sizes: SIZE_FREE, sizeGroup: "OneSize", colors: ["Black", "Royal Blue"] },

  // ── HURLEY · MENS · NON-APPAREL · BAG ──
  { brand: "Hurley", department: "MENS", division: "NON-APPAREL", category: "BAG", subCategory: "BACKPACK", name: "Hurley Day Trip Backpack", description: "Water-resistant 25L backpack", styleCode: "HMNB0425-2814", basePricePesos: 2199, costPesos: 1099, gender: "unisex", sizes: SIZE_FREE, sizeGroup: "OneSize", colors: ["Black", "Olive"] },
  { brand: "Hurley", department: "MENS", division: "NON-APPAREL", category: "BAG", subCategory: "TOTE", name: "Hurley Beach Tote", description: "Canvas beach tote with rope handles", styleCode: "HMNT0425-2907", basePricePesos: 1299, costPesos: 649, gender: "unisex", sizes: SIZE_FREE, sizeGroup: "OneSize", colors: ["Cream", "Navy"] },

  // ── HURLEY · LADIES · APPAREL · SWIMWEAR ──
  { brand: "Hurley", department: "LADIES", division: "APPAREL", category: "SWIMWEAR", subCategory: "SWIM TOP", name: "Hurley Reef Bikini Top", description: "Tropical print bikini top", styleCode: "HLST0425-3011", basePricePesos: 1299, costPesos: 649, gender: "womens", sizes: SIZE_BIKINI, sizeGroup: "Apparel", colors: ["Coral", "Teal"] },
  { brand: "Hurley", department: "LADIES", division: "APPAREL", category: "SWIMWEAR", subCategory: "SWIM BOT", name: "Hurley Reef Bikini Bottom", description: "Tropical print bikini bottom", styleCode: "HLSB0425-3108", basePricePesos: 1199, costPesos: 599, gender: "womens", sizes: SIZE_BIKINI, sizeGroup: "Apparel", colors: ["Coral", "Teal"] },

  // ── HURLEY · LADIES · NON-APPAREL · CAPS ──
  { brand: "Hurley", department: "LADIES", division: "NON-APPAREL", category: "CAPS", subCategory: "BUCKET HAT", name: "Hurley Tropical Bucket Hat", description: "Wide-brim cotton bucket hat", styleCode: "HLNC0425-3219", basePricePesos: 799, costPesos: 399, gender: "womens", sizes: SIZE_FREE, sizeGroup: "OneSize", colors: ["Cream", "Pink"] },
];

// ─── Internal Helpers ───────────────────────────────────────────────────────

export const _listActiveBranches = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("branches").collect();
    return all.filter((b) => b.isActive);
  },
});

export const _bulkSeedInventory = internalMutation({
  args: {
    items: v.array(
      v.object({
        branchId: v.id("branches"),
        variantId: v.id("variants"),
        quantity: v.number(),
        costPriceCentavos: v.number(),
        receivedAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let batches = 0;
    let inventoryRows = 0;
    for (const it of args.items) {
      // Append the batch
      await ctx.db.insert("inventoryBatches", {
        branchId: it.branchId,
        variantId: it.variantId,
        quantity: it.quantity,
        costPriceCentavos: it.costPriceCentavos,
        receivedAt: it.receivedAt,
        source: "legacy",
        createdAt: Date.now(),
      });
      batches++;
      // Roll forward the inventory aggregate
      const existing = await ctx.db
        .query("inventory")
        .withIndex("by_branch_variant", (q) =>
          q.eq("branchId", it.branchId).eq("variantId", it.variantId),
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          quantity: existing.quantity + it.quantity,
          arrivedAt: it.receivedAt,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("inventory", {
          branchId: it.branchId,
          variantId: it.variantId,
          quantity: it.quantity,
          arrivedAt: it.receivedAt,
          updatedAt: Date.now(),
        });
        inventoryRows++;
      }
    }
    return { batches, inventoryRows };
  },
});

// ─── Action ─────────────────────────────────────────────────────────────────

export const run = action({
  args: {},
  handler: async (ctx) => {
    const log = (msg: string) => console.log(`[seedAligned] ${msg}`);
    const user = await ctx.runQuery(internal.seed._getAdminUser);
    if (!user) {
      throw new Error(
        "No admin user found. Create one in Clerk + sync to Convex first.",
      );
    }

    // 1. Wipe existing catalog + inventory + transactions + promos + transfers
    log("Wiping existing data…");
    const wipeFns = [
      internal.seed._wipeTransactions,
      internal.seed._wipeTransfers,
      internal.seed._wipeInventory,
      internal.seed._wipeMisc,
      internal.seed._wipeCatalog,
    ];
    let totalWiped = 0;
    let passes = 0;
    let keepWiping = true;
    while (keepWiping) {
      keepWiping = false;
      passes++;
      for (const fn of wipeFns) {
        const n: number = await ctx.runMutation(fn);
        totalWiped += n;
        if (n > 0) keepWiping = true;
      }
    }
    log(`Wiped ${totalWiped} records in ${passes} passes`);

    // 2. Load productCodes for ID resolution
    log("Loading productCodes…");
    const pcs = (await ctx.runQuery(
      internal.catalog.bulkImport._listProductCodes,
    )) as Array<{
      _id: Id<"productCodes">;
      type: string;
      description: string;
    }>;
    const lookup = (type: string, desc: string): Id<"productCodes"> | undefined => {
      const hit = pcs.find(
        (p) =>
          p.type === type &&
          p.description.toUpperCase() === desc.toUpperCase(),
      );
      return hit?._id;
    };

    // Sanity check — warn if any productCodes referenced by the catalog are missing
    const missing: string[] = [];
    const seen = new Set<string>();
    for (const s of ALIGNED_CATALOG) {
      const keys = [
        `department:${s.department}`,
        `division:${s.division}`,
        `category:${s.category}`,
        `subCategory:${s.subCategory}`,
      ];
      for (const k of keys) {
        if (seen.has(k)) continue;
        seen.add(k);
        const [t, d] = k.split(":", 2);
        if (!lookup(t, d)) missing.push(k);
      }
    }
    if (missing.length > 0) {
      log(
        `⚠ Missing productCodes (these styles will have empty links): ${missing.join(", ")}`,
      );
    }

    // 3. Walk the catalog: brand → style → variants
    log("Building catalog…");
    const brandCache = new Map<string, Id<"brands">>();
    const legacyCategoryCache = new Map<string, Id<"categories">>();
    let stylesCreated = 0;
    let variantsCreated = 0;
    const variantIds: Array<{ id: Id<"variants">; costCentavos: number }> = [];

    for (const style of ALIGNED_CATALOG) {
      // Brand
      const brandKey = style.brand.toLowerCase();
      let brandId = brandCache.get(brandKey);
      if (!brandId) {
        const r = await ctx.runMutation(
          internal.catalog.bulkImport._findOrCreateBrand,
          { name: style.brand, userId: user._id },
        );
        brandId = r.id;
        brandCache.set(brandKey, brandId!);
      }

      // Legacy per-brand category (still indexed via styles.by_category)
      const legacyKey = `${brandKey}::${style.category.toLowerCase()}`;
      let legacyCatId = legacyCategoryCache.get(legacyKey);
      if (!legacyCatId) {
        const r = await ctx.runMutation(
          internal.catalog.bulkImport._findOrCreateCategory,
          { brandId, name: style.category, userId: user._id },
        );
        legacyCatId = r.id;
        legacyCategoryCache.set(legacyKey, legacyCatId!);
      }

      // Style with full productCode hierarchy
      const sResult = await ctx.runMutation(
        internal.catalog.bulkImport._findOrCreateStyle,
        {
          categoryId: legacyCatId,
          brandId,
          departmentId: lookup("department", style.department),
          divisionId: lookup("division", style.division),
          productCategoryId: lookup("category", style.category),
          subCategoryId: lookup("subCategory", style.subCategory),
          styleCode: style.styleCode,
          srp: style.basePricePesos,
          name: style.name,
          description: style.description,
          basePriceCentavos: style.basePricePesos * 100,
          userId: user._id,
        },
      );
      const styleId = sResult.id;
      if (sResult.created) stylesCreated++;

      // Variants — one per (color × size)
      let colorIdx = 0;
      for (const color of style.colors) {
        for (const size of style.sizes) {
          const safeColor = color.replace(/[^A-Za-z0-9]/g, "");
          const safeSize = size.replace(/[^A-Za-z0-9]/g, "");
          const sku = `${style.styleCode.replace(/\s+/g, "")}-${String.fromCharCode(
            65 + colorIdx,
          )}-${safeColor}-${safeSize}`.toUpperCase();
          const vResult = await ctx.runMutation(
            internal.catalog.bulkImport._createImportedVariant,
            {
              styleId,
              sku,
              size,
              color,
              sizeGroup: style.sizeGroup,
              gender: style.gender,
              priceCentavos: style.basePricePesos * 100,
              costPriceCentavos: style.costPesos * 100,
              userId: user._id,
            },
          );
          if (vResult.status === "created") {
            variantIds.push({
              id: vResult.variantId,
              costCentavos: style.costPesos * 100,
            });
            variantsCreated++;
          } else if (vResult.status === "priceUpdated") {
            variantIds.push({
              id: vResult.variantId,
              costCentavos: style.costPesos * 100,
            });
          }
        }
        colorIdx++;
      }
    }
    log(`Styles created: ${stylesCreated}`);
    log(`Variants created: ${variantsCreated}`);

    // 4. Seed inventory across all active branches with varied receive dates
    //    so Calendar Code shows multiple YYMM values.
    log("Seeding inventory…");
    const branches: Array<{ _id: Id<"branches">; isActive: boolean }> =
      await ctx.runQuery(internal.seedAligned._listActiveBranches);
    if (branches.length === 0) {
      log("⚠ No active branches found — run `seed:seedDatabase` first.");
      return {
        stylesCreated,
        variantsCreated,
        branches: 0,
        inventoryBatches: 0,
      };
    }

    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    // Deterministic pseudo-random
    let s = 42;
    const rng = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };

    const items: Array<{
      branchId: Id<"branches">;
      variantId: Id<"variants">;
      quantity: number;
      costPriceCentavos: number;
      receivedAt: number;
    }> = [];

    for (const variant of variantIds) {
      for (const branch of branches) {
        if (rng() < 0.4) continue; // sparse fill, not every branch carries every SKU
        const monthOffset = Math.floor(rng() * 9); // 0..8 months back
        const dayJitter = Math.floor(rng() * 25);
        items.push({
          branchId: branch._id,
          variantId: variant.id,
          quantity: 10 + Math.floor(rng() * 30),
          costPriceCentavos: variant.costCentavos,
          receivedAt: now - monthOffset * 30 * DAY_MS - dayJitter * DAY_MS,
        });
      }
    }

    let totalBatches = 0;
    const CHUNK = 150;
    for (let i = 0; i < items.length; i += CHUNK) {
      const slice = items.slice(i, i + CHUNK);
      const r = await ctx.runMutation(internal.seedAligned._bulkSeedInventory, {
        items: slice,
      });
      totalBatches += r.batches;
    }
    log(`Inventory batches: ${totalBatches}`);

    return {
      stylesCreated,
      variantsCreated,
      branches: branches.length,
      inventoryBatches: totalBatches,
    };
  },
});

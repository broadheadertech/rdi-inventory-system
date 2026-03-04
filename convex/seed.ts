import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// ═══════════════════════════════════════════════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════════════════════════════════════════════

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

// ─── Colors Seed Data ────────────────────────────────────────────────────────

const SEED_COLORS: Array<{ name: string; hexCode: string }> = [
  { name: "Black", hexCode: "#000000" },
  { name: "White", hexCode: "#FFFFFF" },
  { name: "Navy", hexCode: "#1B2A4A" },
  { name: "Red", hexCode: "#DC2626" },
  { name: "Olive", hexCode: "#4B5320" },
  { name: "Charcoal", hexCode: "#36454F" },
  { name: "Gray", hexCode: "#808080" },
  { name: "Light Gray", hexCode: "#D1D5DB" },
  { name: "Burgundy", hexCode: "#800020" },
  { name: "Forest Green", hexCode: "#228B22" },
  { name: "Royal Blue", hexCode: "#4169E1" },
  { name: "Sky Blue", hexCode: "#87CEEB" },
  { name: "Cream", hexCode: "#FFFDD0" },
  { name: "Tan", hexCode: "#D2B48C" },
  { name: "Sand", hexCode: "#C2B280" },
  { name: "Coral", hexCode: "#FF6F61" },
  { name: "Pink", hexCode: "#FFC0CB" },
  { name: "Yellow", hexCode: "#FBBF24" },
  { name: "Teal", hexCode: "#008080" },
  { name: "Maroon", hexCode: "#800000" },
  { name: "Brown", hexCode: "#8B4513" },
  { name: "Khaki", hexCode: "#C3B091" },
];

// ─── Size Groups Seed Data ───────────────────────────────────────────────────

const SEED_SIZE_GROUPS: Array<{ name: string; sortOrder: number }> = [
  { name: "Apparel", sortOrder: 10 },
  { name: "EU", sortOrder: 20 },
  { name: "US", sortOrder: 30 },
  { name: "Numeric", sortOrder: 40 },
  { name: "One Size", sortOrder: 50 },
];

// ─── Catalog Seed Data ───────────────────────────────────────────────────────

type StyleDef = {
  name: string;
  price: number;
  cost: number;
  desc: string;
  gender?: "mens" | "womens" | "unisex" | "kids";
};

type CategoryDef = {
  name: string;
  styles: StyleDef[];
};

type BrandDef = {
  brand: string;
  categories: CategoryDef[];
};

const CATALOG: BrandDef[] = [
  {
    brand: "URBAN CORE",
    categories: [
      // ── Headwear ──
      {
        name: "Caps",
        styles: [
          { name: "Metro Snapback", price: 59900, cost: 29900, desc: "Flat brim snapback with embroidered logo" },
          { name: "Washed Dad Cap", price: 49900, cost: 24900, desc: "Unstructured washed cotton dad cap" },
          { name: "Trucker Mesh Cap", price: 54900, cost: 27400, desc: "Foam front mesh back trucker cap" },
        ],
      },
      {
        name: "Beanies",
        styles: [
          { name: "Ribbed Cuff Beanie", price: 39900, cost: 19900, desc: "Classic ribbed knit cuff beanie" },
          { name: "Slouch Beanie", price: 44900, cost: 22400, desc: "Oversized slouchy beanie" },
        ],
      },
      // ── Tops ──
      {
        name: "T-Shirts",
        styles: [
          { name: "Metro Basic Tee", price: 49900, cost: 24900, desc: "Essential cotton crew neck tee" },
          { name: "Graffiti Tag Tee", price: 59900, cost: 29900, desc: "Oversized tee with graffiti print" },
          { name: "Concrete Jungle Tee", price: 54900, cost: 27400, desc: "Urban landscape graphic tee" },
          { name: "Midnight Drift Tee", price: 64900, cost: 32400, desc: "Reflective logo night tee" },
        ],
      },
      {
        name: "Hoodies",
        styles: [
          { name: "Skyline Pullover", price: 149900, cost: 74900, desc: "Heavyweight French terry hoodie" },
          { name: "Blackout Zip-Up", price: 169900, cost: 84900, desc: "Full-zip hoodie with hidden pockets" },
          { name: "Foggy Morning Hoodie", price: 159900, cost: 79900, desc: "Acid-wash oversized hoodie" },
        ],
      },
      {
        name: "Long Sleeves",
        styles: [
          { name: "Layer Up Longsleeve", price: 69900, cost: 34900, desc: "Relaxed fit cotton long sleeve" },
          { name: "Thermal Henley", price: 79900, cost: 39900, desc: "Waffle-knit thermal henley" },
        ],
      },
      // ── Bottoms ──
      {
        name: "Joggers",
        styles: [
          { name: "Pavement Runner", price: 119900, cost: 59900, desc: "Slim-fit tech joggers" },
          { name: "Night Shift Jogger", price: 129900, cost: 64900, desc: "Reflective stripe joggers" },
          { name: "Cargo District Jogger", price: 139900, cost: 69900, desc: "Multi-pocket cargo joggers" },
          { name: "Chill Mode Sweatpant", price: 109900, cost: 54900, desc: "Relaxed fit French terry jogger" },
        ],
      },
      {
        name: "Shorts",
        styles: [
          { name: "City Runner Short", price: 79900, cost: 39900, desc: "Lightweight running shorts" },
          { name: "Urban Cargo Short", price: 89900, cost: 44900, desc: "Relaxed cargo shorts" },
        ],
      },
    ],
  },
  {
    brand: "STREET PULSE",
    categories: [
      // ── Headwear ──
      {
        name: "Bucket Hats",
        styles: [
          { name: "Reversible Bucket", price: 54900, cost: 27400, desc: "Two-tone reversible bucket hat" },
          { name: "Washed Canvas Bucket", price: 49900, cost: 24900, desc: "Garment-dyed canvas bucket hat" },
        ],
      },
      {
        name: "Visors",
        styles: [
          { name: "Sport Visor", price: 39900, cost: 19900, desc: "Adjustable sport visor" },
          { name: "Mesh Back Visor", price: 34900, cost: 17400, desc: "Breathable mesh visor" },
        ],
      },
      // ── Tops ──
      {
        name: "Tank Tops",
        styles: [
          { name: "Raw Edge Tank", price: 44900, cost: 22400, desc: "Cut-off raw edge tank" },
          { name: "Stringer Vest", price: 39900, cost: 19900, desc: "Deep-cut stringer tank" },
          { name: "Box Logo Tank", price: 49900, cost: 24900, desc: "Relaxed fit box logo tank top" },
        ],
      },
      {
        name: "Sweaters",
        styles: [
          { name: "Cable Knit Crew", price: 139900, cost: 69900, desc: "Classic cable knit crew neck" },
          { name: "Oversized Sweatshirt", price: 119900, cost: 59900, desc: "Drop-shoulder oversized sweatshirt" },
        ],
      },
      // ── Bottoms ──
      {
        name: "Chinos",
        styles: [
          { name: "Slim Stretch Chino", price: 119900, cost: 59900, desc: "Slim fit stretch cotton chinos" },
          { name: "Relaxed Chino", price: 109900, cost: 54900, desc: "Relaxed straight leg chinos" },
        ],
      },
      {
        name: "Jeans",
        styles: [
          { name: "Selvedge Slim", price: 179900, cost: 89900, desc: "Japanese selvedge slim fit denim" },
          { name: "Relaxed Wash Jean", price: 149900, cost: 74900, desc: "Relaxed fit washed denim" },
          { name: "Skinny Black Jean", price: 139900, cost: 69900, desc: "Skinny fit black stretch denim" },
        ],
      },
      {
        name: "Cargo Pants",
        styles: [
          { name: "Tactical Cargo", price: 149900, cost: 74900, desc: "Multi-pocket tactical cargo pants" },
          { name: "Ripstop Cargo Pant", price: 139900, cost: 69900, desc: "Lightweight ripstop cargo pants" },
        ],
      },
      // ── Footwear ──
      {
        name: "Sneakers",
        styles: [
          { name: "Street Classic Low", price: 249900, cost: 124900, desc: "Low-top canvas street sneaker" },
          { name: "High Voltage High-Top", price: 299900, cost: 149900, desc: "Leather high-top sneaker" },
          { name: "Runner V2", price: 279900, cost: 139900, desc: "Lightweight mesh running shoe" },
        ],
      },
      {
        name: "Slides",
        styles: [
          { name: "Comfort Slide", price: 69900, cost: 34900, desc: "Molded footbed slide sandal" },
          { name: "Logo Pool Slide", price: 59900, cost: 29900, desc: "Embossed logo pool slide" },
        ],
      },
    ],
  },
  {
    brand: "PRIME THREADS",
    categories: [
      // ── Tops ──
      {
        name: "Polo Shirts",
        styles: [
          { name: "Executive Pique Polo", price: 129900, cost: 64900, desc: "Premium pique cotton polo" },
          { name: "Tech Stretch Polo", price: 149900, cost: 74900, desc: "4-way stretch performance polo" },
          { name: "Mandarin Collar Polo", price: 139900, cost: 69900, desc: "Modern mandarin collar polo" },
          { name: "Knit Resort Polo", price: 159900, cost: 79900, desc: "Open-knit textured polo" },
        ],
      },
      {
        name: "Dress Shirts",
        styles: [
          { name: "Barong Modern Slim", price: 179900, cost: 89900, desc: "Contemporary slim-fit barong tagalog" },
          { name: "Oxford Button-Down", price: 159900, cost: 79900, desc: "Classic oxford cloth shirt" },
          { name: "Linen Blend Shirt", price: 169900, cost: 84900, desc: "Breathable linen-cotton blend" },
          { name: "Stretch Poplin Shirt", price: 149900, cost: 74900, desc: "Easy-care stretch poplin" },
        ],
      },
      {
        name: "Jackets",
        styles: [
          { name: "Metro Bomber", price: 249900, cost: 124900, desc: "Satin bomber with ribbed cuffs" },
          { name: "Coach Windbreaker", price: 199900, cost: 99900, desc: "Snap-front coach jacket" },
          { name: "Denim Trucker Jacket", price: 229900, cost: 114900, desc: "Classic trucker silhouette" },
          { name: "Tech Shell Jacket", price: 219900, cost: 109900, desc: "Water-resistant tech shell" },
        ],
      },
      // ── Bottoms ──
      {
        name: "Chinos",
        styles: [
          { name: "Tailored Chino", price: 139900, cost: 69900, desc: "Tailored fit premium chinos" },
          { name: "Pleated Wide Chino", price: 149900, cost: 74900, desc: "Pleated wide-leg chinos" },
        ],
      },
      // ── Footwear ──
      {
        name: "Boots",
        styles: [
          { name: "Chelsea Boot", price: 349900, cost: 174900, desc: "Suede Chelsea boot with elastic gore" },
          { name: "Desert Boot", price: 299900, cost: 149900, desc: "Classic crepe-sole desert boot" },
        ],
      },
      // ── Accessories ──
      {
        name: "Bags",
        styles: [
          { name: "Leather Messenger", price: 299900, cost: 149900, desc: "Full-grain leather messenger bag" },
          { name: "Canvas Tote", price: 119900, cost: 59900, desc: "Heavy-duty canvas tote bag" },
          { name: "Nylon Backpack", price: 179900, cost: 89900, desc: "Water-resistant nylon backpack" },
        ],
      },
      {
        name: "Belts",
        styles: [
          { name: "Classic Leather Belt", price: 89900, cost: 44900, desc: "Full-grain leather dress belt" },
          { name: "Reversible Belt", price: 99900, cost: 49900, desc: "Black/brown reversible belt" },
        ],
      },
      {
        name: "Wallets",
        styles: [
          { name: "Bifold Wallet", price: 79900, cost: 39900, desc: "Slim leather bifold wallet" },
          { name: "Card Holder", price: 49900, cost: 24900, desc: "Minimalist card holder" },
        ],
      },
    ],
  },
  {
    brand: "IRONSIDE",
    categories: [
      // ── Tops ──
      {
        name: "T-Shirts",
        styles: [
          { name: "Heavy Duty Tee", price: 54900, cost: 27400, desc: "220gsm heavyweight cotton tee" },
          { name: "Washed Vintage Tee", price: 64900, cost: 32400, desc: "Garment-dyed vintage wash tee" },
          { name: "Graphic Logo Tee", price: 59900, cost: 29900, desc: "Bold front graphic logo tee" },
        ],
      },
      {
        name: "Hoodies",
        styles: [
          { name: "Workwear Hoodie", price: 169900, cost: 84900, desc: "Reinforced heavyweight hoodie" },
          { name: "Quarter-Zip Pullover", price: 159900, cost: 79900, desc: "Quarter-zip fleece pullover" },
        ],
      },
      {
        name: "Long Sleeves",
        styles: [
          { name: "Flannel Shirt", price: 119900, cost: 59900, desc: "Brushed cotton flannel shirt" },
          { name: "Heavyweight Henley", price: 89900, cost: 44900, desc: "Thick ribbed henley long sleeve" },
        ],
      },
      // ── Bottoms ──
      {
        name: "Jeans",
        styles: [
          { name: "Straight Fit Work Jean", price: 159900, cost: 79900, desc: "Durable straight fit work denim" },
          { name: "Loose Carpenter Jean", price: 169900, cost: 84900, desc: "Carpenter loop loose fit jean" },
        ],
      },
      {
        name: "Cargo Pants",
        styles: [
          { name: "Heavy Canvas Cargo", price: 159900, cost: 79900, desc: "12oz canvas cargo work pants" },
          { name: "Stretch Work Pant", price: 139900, cost: 69900, desc: "Stretch canvas utility pants" },
        ],
      },
      {
        name: "Shorts",
        styles: [
          { name: "Utility Short", price: 89900, cost: 44900, desc: "Reinforced utility work shorts" },
          { name: "Board Short", price: 79900, cost: 39900, desc: "Quick-dry board shorts" },
        ],
      },
      // ── Footwear ──
      {
        name: "Boots",
        styles: [
          { name: "Work Boot", price: 399900, cost: 199900, desc: "Steel-toe leather work boot" },
          { name: "Hiking Boot", price: 349900, cost: 174900, desc: "Waterproof hiking boot" },
        ],
      },
      // ── Underwear ──
      {
        name: "Boxers",
        styles: [
          { name: "Cotton Boxer Brief", price: 34900, cost: 17400, desc: "Stretch cotton boxer brief" },
          { name: "Performance Boxer", price: 44900, cost: 22400, desc: "Moisture-wicking sport boxer" },
        ],
      },
      {
        name: "Undershirts",
        styles: [
          { name: "Crew Undershirt", price: 29900, cost: 14900, desc: "Cotton crew neck undershirt" },
          { name: "V-Neck Undershirt", price: 29900, cost: 14900, desc: "Cotton v-neck undershirt" },
        ],
      },
      {
        name: "Socks",
        styles: [
          { name: "Crew Athletic Sock", price: 19900, cost: 9900, desc: "Cushioned crew athletic socks" },
          { name: "No-Show Liner", price: 14900, cost: 7400, desc: "Invisible no-show liner socks" },
          { name: "Work Boot Sock", price: 24900, cost: 12400, desc: "Reinforced heel/toe boot socks" },
        ],
      },
      // ── Accessories ──
      {
        name: "Sunglasses",
        styles: [
          { name: "Classic Wayfarer", price: 99900, cost: 49900, desc: "UV400 polarized wayfarer" },
          { name: "Aviator Shade", price: 109900, cost: 54900, desc: "Metal frame aviator sunglasses" },
        ],
      },
    ],
  },
];

// ─── Variant Matrices per Category ──────────────────────────────────────────

type MatrixDef = {
  colors: string[];
  sizes: string[];
  sizeGroup: string;
  gender?: "mens" | "womens" | "unisex" | "kids";
};

const VARIANT_MATRICES: Record<string, MatrixDef> = {
  // Headwear
  "Caps":          { colors: ["Black", "White", "Navy", "Red", "Olive"], sizes: ["One Size"], sizeGroup: "One Size" },
  "Beanies":       { colors: ["Black", "Charcoal", "Navy", "Burgundy"], sizes: ["One Size"], sizeGroup: "One Size" },
  "Bucket Hats":   { colors: ["Black", "Olive", "Khaki", "Navy"], sizes: ["One Size"], sizeGroup: "One Size" },
  "Visors":        { colors: ["Black", "White", "Navy"], sizes: ["One Size"], sizeGroup: "One Size" },
  // Tops
  "T-Shirts":      { colors: ["Black", "White", "Navy", "Red", "Olive"], sizes: ["S", "M", "L", "XL", "XXL"], sizeGroup: "Apparel" },
  "Hoodies":       { colors: ["Black", "Navy", "Charcoal", "Olive"], sizes: ["S", "M", "L", "XL", "XXL"], sizeGroup: "Apparel" },
  "Long Sleeves":  { colors: ["Black", "White", "Navy", "Charcoal"], sizes: ["S", "M", "L", "XL"], sizeGroup: "Apparel" },
  "Sweaters":      { colors: ["Cream", "Navy", "Charcoal", "Burgundy"], sizes: ["S", "M", "L", "XL"], sizeGroup: "Apparel" },
  "Tank Tops":     { colors: ["Black", "White", "Red", "Navy"], sizes: ["S", "M", "L", "XL"], sizeGroup: "Apparel" },
  "Polo Shirts":   { colors: ["Black", "White", "Navy", "Royal Blue"], sizes: ["S", "M", "L", "XL", "XXL"], sizeGroup: "Apparel" },
  "Dress Shirts":  { colors: ["White", "Navy", "Light Gray", "Sky Blue"], sizes: ["S", "M", "L", "XL"], sizeGroup: "Apparel" },
  "Jackets":       { colors: ["Black", "Navy", "Olive", "Charcoal"], sizes: ["S", "M", "L", "XL"], sizeGroup: "Apparel" },
  // Bottoms
  "Joggers":       { colors: ["Black", "Navy", "Charcoal", "Olive"], sizes: ["S", "M", "L", "XL"], sizeGroup: "Apparel" },
  "Shorts":        { colors: ["Black", "Navy", "Olive", "Khaki"], sizes: ["S", "M", "L", "XL"], sizeGroup: "Apparel" },
  "Chinos":        { colors: ["Khaki", "Navy", "Black", "Tan"], sizes: ["28", "30", "32", "34", "36"], sizeGroup: "Numeric" },
  "Jeans":         { colors: ["Black", "Navy", "Charcoal"], sizes: ["28", "30", "32", "34", "36"], sizeGroup: "Numeric" },
  "Cargo Pants":   { colors: ["Black", "Olive", "Khaki", "Charcoal"], sizes: ["S", "M", "L", "XL"], sizeGroup: "Apparel" },
  // Footwear
  "Sneakers":      { colors: ["Black", "White", "Navy"], sizes: ["39", "40", "41", "42", "43", "44", "45"], sizeGroup: "EU" },
  "Slides":        { colors: ["Black", "White", "Navy"], sizes: ["39", "40", "41", "42", "43", "44"], sizeGroup: "EU" },
  "Boots":         { colors: ["Black", "Brown", "Tan"], sizes: ["39", "40", "41", "42", "43", "44", "45"], sizeGroup: "EU" },
  // Underwear
  "Boxers":        { colors: ["Black", "Navy", "Gray"], sizes: ["S", "M", "L", "XL"], sizeGroup: "Apparel", gender: "mens" },
  "Undershirts":   { colors: ["White", "Black", "Gray"], sizes: ["S", "M", "L", "XL"], sizeGroup: "Apparel", gender: "mens" },
  "Socks":         { colors: ["Black", "White", "Gray"], sizes: ["One Size"], sizeGroup: "One Size" },
  // Accessories
  "Bags":          { colors: ["Black", "Brown", "Navy"], sizes: ["One Size"], sizeGroup: "One Size" },
  "Sunglasses":    { colors: ["Black", "Brown"], sizes: ["One Size"], sizeGroup: "One Size" },
  "Belts":         { colors: ["Black", "Brown"], sizes: ["S", "M", "L", "XL"], sizeGroup: "Apparel" },
  "Wallets":       { colors: ["Black", "Brown", "Tan"], sizes: ["One Size"], sizeGroup: "One Size" },
};

// ─── SKU Generator ───────────────────────────────────────────────────────────

const BRAND_CODES: Record<string, string> = {
  "URBAN CORE": "UC",
  "STREET PULSE": "SP",
  "PRIME THREADS": "PT",
  "IRONSIDE": "IS",
};

const CAT_CODES: Record<string, string> = {
  "Caps": "CP", "Beanies": "BN", "Bucket Hats": "BH", "Visors": "VR",
  "T-Shirts": "TS", "Hoodies": "HD", "Long Sleeves": "LS", "Sweaters": "SW",
  "Tank Tops": "TK", "Polo Shirts": "PL", "Dress Shirts": "DS", "Jackets": "JK",
  "Joggers": "JG", "Shorts": "SH", "Chinos": "CH", "Jeans": "JN", "Cargo Pants": "CG",
  "Sneakers": "SN", "Slides": "SL", "Boots": "BT",
  "Boxers": "BX", "Undershirts": "US", "Socks": "SK",
  "Bags": "BG", "Sunglasses": "SG", "Belts": "BL", "Wallets": "WL",
};

const COLOR_CODES: Record<string, string> = {
  "Black": "BLK", "White": "WHT", "Navy": "NVY", "Red": "RED", "Olive": "OLV",
  "Charcoal": "CHR", "Gray": "GRY", "Light Gray": "LGR", "Burgundy": "BRG",
  "Forest Green": "FGR", "Royal Blue": "RBL", "Sky Blue": "SKB",
  "Cream": "CRM", "Tan": "TAN", "Sand": "SND", "Coral": "CRL",
  "Pink": "PNK", "Yellow": "YLW", "Teal": "TEL", "Maroon": "MRN",
  "Brown": "BRN", "Khaki": "KHK",
};

function generateSku(
  brand: string,
  category: string,
  styleIndex: number,
  color: string,
  size: string,
): string {
  const bc = BRAND_CODES[brand] ?? "XX";
  const cc = CAT_CODES[category] ?? "XX";
  const colCode = COLOR_CODES[color] ?? color.slice(0, 3).toUpperCase();
  const sizeCode = size === "One Size" ? "OS" : size;
  return `${bc}-${cc}-${String(styleIndex + 1).padStart(2, "0")}-${colCode}-${sizeCode}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WIPE MUTATIONS — Each clears a group of tables, up to 500 rows per table
// ═══════════════════════════════════════════════════════════════════════════════

export const _wipeCatalog = internalMutation({
  args: {},
  handler: async (ctx) => {
    let total = 0;
    for (const row of await ctx.db.query("variants").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("productImages").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("styles").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("categories").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("brands").take(500)) { await ctx.db.delete(row._id); total++; }
    return total;
  },
});

export const _wipeInventory = internalMutation({
  args: {},
  handler: async (ctx) => {
    let total = 0;
    for (const row of await ctx.db.query("inventory").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("inventoryBatches").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("lowStockAlerts").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("restockSuggestions").take(500)) { await ctx.db.delete(row._id); total++; }
    return total;
  },
});

export const _wipeTransactions = internalMutation({
  args: {},
  handler: async (ctx) => {
    let total = 0;
    for (const row of await ctx.db.query("transactionItems").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("transactions").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("reconciliations").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("cashierShifts").take(500)) { await ctx.db.delete(row._id); total++; }
    return total;
  },
});

export const _wipeTransfers = internalMutation({
  args: {},
  handler: async (ctx) => {
    let total = 0;
    for (const row of await ctx.db.query("internalInvoiceItems").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("internalInvoices").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("transferItems").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("transfers").take(500)) { await ctx.db.delete(row._id); total++; }
    return total;
  },
});

export const _wipeMisc = internalMutation({
  args: {},
  handler: async (ctx) => {
    let total = 0;
    for (const row of await ctx.db.query("auditLogs").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("demandLogs").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("demandWeeklySummaries").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("promotions").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("supplierProposals").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("branchScores").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("reservations").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("colors").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("sizes").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("settings").take(500)) { await ctx.db.delete(row._id); total++; }
    return total;
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SEED MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════════

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

export const _seedColors = internalMutation({
  args: {},
  handler: async (ctx) => {
    let count = 0;
    for (const color of SEED_COLORS) {
      await ctx.db.insert("colors", {
        name: color.name,
        hexCode: color.hexCode,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      count++;
    }
    return count;
  },
});

export const _seedSizeGroups = internalMutation({
  args: {},
  handler: async (ctx) => {
    let count = 0;
    for (const sg of SEED_SIZE_GROUPS) {
      await ctx.db.insert("sizes", {
        name: sg.name,
        sortOrder: sg.sortOrder,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      count++;
    }
    return count;
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SEED ACTION
// ═══════════════════════════════════════════════════════════════════════════════

export const seedDatabase = action({
  args: {},
  handler: async (ctx): Promise<{
    branches: { created: number; total: number };
    colors: number;
    sizeGroups: number;
    products: { created: number; skipped: number; total: number };
    inventory: { variants: number; branches: number; estimatedRows: number };
  }> => {
    // 1. Verify admin
    const user = await ctx.runQuery(
      internal.catalog.bulkImport._verifyAdminRole
    );

    console.log("=== RedBox Apparel Seed: Starting ===");

    // 2. Wipe all data (except users)
    console.log("Wiping existing data...");
    const wipeFns = [
      internal.seed._wipeTransactions,
      internal.seed._wipeTransfers,
      internal.seed._wipeInventory,
      internal.seed._wipeMisc,
      internal.seed._wipeCatalog,
    ];
    // Loop until all tables are empty
    let totalWiped = 0;
    let wipePasses = 0;
    let keepWiping = true;
    while (keepWiping) {
      keepWiping = false;
      wipePasses++;
      for (const fn of wipeFns) {
        const count: number = await ctx.runMutation(fn);
        totalWiped += count;
        if (count > 0) keepWiping = true;
      }
    }
    console.log(`Wiped ${totalWiped} records in ${wipePasses} passes`);

    // 3. Seed branches
    console.log("Seeding branches...");
    const branchResults: Array<{ name: string; id: Id<"branches">; created: boolean }> =
      await ctx.runMutation(internal.seed._seedBranches, {
        branches: SEED_BRANCHES,
      });
    const branchesCreated = branchResults.filter((b: { created: boolean }) => b.created).length;
    console.log(
      `Branches: ${branchesCreated} created, ${branchResults.length - branchesCreated} existing`
    );

    // 4. Seed colors
    console.log("Seeding colors...");
    const colorsCreated: number = await ctx.runMutation(internal.seed._seedColors);
    console.log(`Colors: ${colorsCreated} created`);

    // 5. Seed size groups
    console.log("Seeding size groups...");
    const sizeGroupsCreated: number = await ctx.runMutation(internal.seed._seedSizeGroups);
    console.log(`Size Groups: ${sizeGroupsCreated} created`);

    // 6. Generate flat items array
    console.log("Generating product catalog...");
    const items: Array<{
      brand: string;
      category: string;
      styleName: string;
      desc: string;
      price: number;
      cost: number;
      sku: string;
      size: string;
      sizeGroup: string;
      color: string;
      gender?: "mens" | "womens" | "unisex" | "kids";
    }> = [];

    for (const brandDef of CATALOG) {
      for (const catDef of brandDef.categories) {
        const matrix = VARIANT_MATRICES[catDef.name];
        if (!matrix) {
          console.warn(`No matrix for category "${catDef.name}", skipping`);
          continue;
        }
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
                cost: style.cost,
                sku: generateSku(brandDef.brand, catDef.name, si, color, size),
                size,
                sizeGroup: matrix.sizeGroup,
                color,
                gender: style.gender ?? matrix.gender ?? "unisex",
              });
            }
          }
        }
      }
    }

    console.log(`Generated ${items.length} variant items`);

    // 7. Create catalog using existing bulkImport internal mutations
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
        const variantResult = await ctx.runMutation(
          internal.catalog.bulkImport._createImportedVariant,
          {
            styleId,
            sku: row.sku,
            sizeGroup: row.sizeGroup,
            size: row.size,
            color: row.color,
            gender: row.gender ?? "unisex",
            priceCentavos: row.price,
            costPriceCentavos: row.cost,
            userId: user._id,
          }
        );
        if (variantResult.status === "created") {
          variantIds.push(variantResult.variantId);
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

    // 8. Seed inventory across branches
    if (variantIds.length > 0) {
      console.log("Seeding inventory...");
      const branchIds = branchResults.map((b: { id: Id<"branches"> }) => b.id);
      // Warehouse gets 2x, Manila 1x, Cebu 0.7x, Davao 0.5x
      const quantityMultipliers = [2.0, 1.0, 0.7, 0.5];
      const baseQuantities = [15, 20, 25, 30, 35, 40, 45, 50];

      const BATCH_SIZE = 50;
      let inventoryCreated = 0;
      const inventoryItems: Array<{
        branchId: Id<"branches">;
        variantId: Id<"variants">;
        quantity: number;
      }> = [];

      for (let bi = 0; bi < branchIds.length; bi++) {
        const multiplier = quantityMultipliers[bi] ?? 0.5;
        for (let vi = 0; vi < variantIds.length; vi++) {
          const baseQty = baseQuantities[vi % baseQuantities.length];
          const quantity = Math.max(1, Math.round(baseQty * multiplier));
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

    // 9. Summary
    const summary = {
      branches: { created: branchesCreated, total: branchResults.length },
      colors: colorsCreated,
      sizeGroups: sizeGroupsCreated,
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
    // Sell 4/day × 7 days = 28, stock 80 → ADS=4, MI=16/80 = 0.20 → MEDIUM ✓
    dailySales: [4, 4, 4, 4, 4, 4, 4],
    stockAfter: 80,
  },
  {
    label: "Bulk Spike (MEDIUM)",
    // 25 on day 3 + 10 on day 5, stock 120 → ADS=35/7=5, MI=25/120=0.21 → MEDIUM ✓
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

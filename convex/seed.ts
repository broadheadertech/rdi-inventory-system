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
  gender?: "mens" | "womens" | "unisex" | "kids" | "boys" | "girls";
};

type CategoryDef = {
  name: string;
  tag?: string;
  styles: StyleDef[];
};

type BrandDef = {
  brand: string;
  tags?: string[];
  defaultGender?: "mens" | "womens" | "unisex" | "kids" | "boys" | "girls";
  categories: CategoryDef[];
};

const CATALOG: BrandDef[] = [
  {
    brand: "Aeropostale",
    tags: ["Casual", "Essentials"],
    defaultGender: "unisex",
    categories: [
      // ── Tops ──
      {
        name: "T-Shirts",
        tag: "Clothing",
        styles: [
          { name: "Metro Basic Tee", price: 49900, cost: 24900, desc: "Essential cotton crew neck tee" },
          { name: "Graffiti Tag Tee", price: 59900, cost: 29900, desc: "Oversized tee with graffiti print" },
          { name: "Concrete Jungle Tee", price: 54900, cost: 27400, desc: "Urban landscape graphic tee" },
          { name: "Midnight Drift Tee", price: 64900, cost: 32400, desc: "Reflective logo night tee" },
        ],
      },
      {
        name: "Polo Shirts",
        tag: "Clothing",
        styles: [
          { name: "Executive Pique Polo", price: 129900, cost: 64900, desc: "Premium pique cotton polo" },
          { name: "Tech Stretch Polo", price: 149900, cost: 74900, desc: "4-way stretch performance polo" },
          { name: "Mandarin Collar Polo", price: 139900, cost: 69900, desc: "Modern mandarin collar polo" },
          { name: "Knit Resort Polo", price: 159900, cost: 79900, desc: "Open-knit textured polo" },
        ],
      },
      // ── Bottoms ──
      {
        name: "Shorts",
        tag: "Clothing",
        styles: [
          { name: "City Runner Short", price: 79900, cost: 39900, desc: "Lightweight running shorts" },
          { name: "Urban Cargo Short", price: 89900, cost: 44900, desc: "Relaxed cargo shorts" },
        ],
      },
    ],
  },
  {
    brand: "Playboy",
    tags: ["Streetwear", "Luxury"],
    defaultGender: "mens",
    categories: [
      // ── Tops ──
      {
        name: "Hoodies",
        tag: "Clothing",
        styles: [
          { name: "Skyline Pullover", price: 149900, cost: 74900, desc: "Heavyweight French terry hoodie" },
          { name: "Blackout Zip-Up", price: 169900, cost: 84900, desc: "Full-zip hoodie with hidden pockets" },
          { name: "Foggy Morning Hoodie", price: 159900, cost: 79900, desc: "Acid-wash oversized hoodie" },
        ],
      },
      {
        name: "Jackets",
        tag: "Clothing",
        styles: [
          { name: "Metro Bomber", price: 249900, cost: 124900, desc: "Satin bomber with ribbed cuffs" },
          { name: "Coach Windbreaker", price: 199900, cost: 99900, desc: "Snap-front coach jacket" },
          { name: "Denim Trucker Jacket", price: 229900, cost: 114900, desc: "Classic trucker silhouette" },
          { name: "Tech Shell Jacket", price: 219900, cost: 109900, desc: "Water-resistant tech shell" },
        ],
      },
      // ── Bottoms ──
      {
        name: "Jeans",
        tag: "Clothing",
        styles: [
          { name: "Selvedge Slim", price: 179900, cost: 89900, desc: "Japanese selvedge slim fit denim" },
          { name: "Relaxed Wash Jean", price: 149900, cost: 74900, desc: "Relaxed fit washed denim" },
          { name: "Skinny Black Jean", price: 139900, cost: 69900, desc: "Skinny fit black stretch denim" },
        ],
      },
      // ── Accessories ──
      {
        name: "Sunglasses",
        tag: "Accessories",
        styles: [
          { name: "Classic Wayfarer", price: 99900, cost: 49900, desc: "UV400 polarized wayfarer" },
          { name: "Aviator Shade", price: 109900, cost: 54900, desc: "Metal frame aviator sunglasses" },
        ],
      },
    ],
  },
  {
    brand: "Illest",
    tags: ["Streetwear"],
    defaultGender: "mens",
    categories: [
      // ── Headwear ──
      {
        name: "Caps",
        tag: "Accessories",
        styles: [
          { name: "Metro Snapback", price: 59900, cost: 29900, desc: "Flat brim snapback with embroidered logo" },
          { name: "Washed Dad Cap", price: 49900, cost: 24900, desc: "Unstructured washed cotton dad cap" },
          { name: "Trucker Mesh Cap", price: 54900, cost: 27400, desc: "Foam front mesh back trucker cap" },
        ],
      },
      {
        name: "Beanies",
        tag: "Accessories",
        styles: [
          { name: "Ribbed Cuff Beanie", price: 39900, cost: 19900, desc: "Classic ribbed knit cuff beanie" },
          { name: "Slouch Beanie", price: 44900, cost: 22400, desc: "Oversized slouchy beanie" },
        ],
      },
      // ── Footwear ──
      {
        name: "Sneakers",
        tag: "Shoes",
        styles: [
          { name: "Street Classic Low", price: 249900, cost: 124900, desc: "Low-top canvas street sneaker" },
          { name: "High Voltage High-Top", price: 299900, cost: 149900, desc: "Leather high-top sneaker" },
          { name: "Runner V2", price: 279900, cost: 139900, desc: "Lightweight mesh running shoe" },
        ],
      },
      {
        name: "Slides",
        tag: "Shoes",
        styles: [
          { name: "Comfort Slide", price: 69900, cost: 34900, desc: "Molded footbed slide sandal" },
          { name: "Logo Pool Slide", price: 59900, cost: 29900, desc: "Embossed logo pool slide" },
        ],
      },
    ],
  },
  {
    brand: "Rilla",
    tags: ["Streetwear"],
    defaultGender: "mens",
    categories: [
      // ── Tops ──
      {
        name: "Tank Tops",
        tag: "Clothing",
        styles: [
          { name: "Raw Edge Tank", price: 44900, cost: 22400, desc: "Cut-off raw edge tank" },
          { name: "Stringer Vest", price: 39900, cost: 19900, desc: "Deep-cut stringer tank" },
          { name: "Box Logo Tank", price: 49900, cost: 24900, desc: "Relaxed fit box logo tank top" },
        ],
      },
      {
        name: "Long Sleeves",
        tag: "Clothing",
        styles: [
          { name: "Layer Up Longsleeve", price: 69900, cost: 34900, desc: "Relaxed fit cotton long sleeve" },
          { name: "Thermal Henley", price: 79900, cost: 39900, desc: "Waffle-knit thermal henley" },
        ],
      },
      // ── Bottoms ──
      {
        name: "Cargo Pants",
        tag: "Clothing",
        styles: [
          { name: "Tactical Cargo", price: 149900, cost: 74900, desc: "Multi-pocket tactical cargo pants" },
          { name: "Ripstop Cargo Pant", price: 139900, cost: 69900, desc: "Lightweight ripstop cargo pants" },
        ],
      },
      {
        name: "T-Shirts",
        tag: "Clothing",
        styles: [
          { name: "Heavy Duty Tee", price: 54900, cost: 27400, desc: "220gsm heavyweight cotton tee" },
          { name: "Washed Vintage Tee", price: 64900, cost: 32400, desc: "Garment-dyed vintage wash tee" },
          { name: "Graphic Logo Tee", price: 59900, cost: 29900, desc: "Bold front graphic logo tee" },
        ],
      },
      {
        name: "Jeans",
        tag: "Clothing",
        styles: [
          { name: "Straight Fit Work Jean", price: 159900, cost: 79900, desc: "Durable straight fit work denim" },
          { name: "Loose Carpenter Jean", price: 169900, cost: 84900, desc: "Carpenter loop loose fit jean" },
        ],
      },
    ],
  },
  {
    brand: "Starter",
    tags: ["Sports", "Streetwear"],
    defaultGender: "mens",
    categories: [
      // ── Bottoms ──
      {
        name: "Joggers",
        tag: "Clothing",
        styles: [
          { name: "Pavement Runner", price: 119900, cost: 59900, desc: "Slim-fit tech joggers" },
          { name: "Night Shift Jogger", price: 129900, cost: 64900, desc: "Reflective stripe joggers" },
          { name: "Cargo District Jogger", price: 139900, cost: 69900, desc: "Multi-pocket cargo joggers" },
          { name: "Chill Mode Sweatpant", price: 109900, cost: 54900, desc: "Relaxed fit French terry jogger" },
        ],
      },
      {
        name: "Shorts",
        tag: "Clothing",
        styles: [
          { name: "Utility Short", price: 89900, cost: 44900, desc: "Reinforced utility work shorts" },
          { name: "Board Short", price: 79900, cost: 39900, desc: "Quick-dry board shorts" },
        ],
      },
      // ── Tops ──
      {
        name: "Sweaters",
        tag: "Clothing",
        styles: [
          { name: "Cable Knit Crew", price: 139900, cost: 69900, desc: "Classic cable knit crew neck" },
          { name: "Oversized Sweatshirt", price: 119900, cost: 59900, desc: "Drop-shoulder oversized sweatshirt" },
        ],
      },
      // ── Headwear ──
      {
        name: "Visors",
        tag: "Accessories",
        styles: [
          { name: "Sport Visor", price: 39900, cost: 19900, desc: "Adjustable sport visor" },
          { name: "Mesh Back Visor", price: 34900, cost: 17400, desc: "Breathable mesh visor" },
        ],
      },
      // ── Footwear ──
      {
        name: "Boots",
        tag: "Shoes",
        styles: [
          { name: "Work Boot", price: 399900, cost: 199900, desc: "Steel-toe leather work boot" },
          { name: "Hiking Boot", price: 349900, cost: 174900, desc: "Waterproof hiking boot" },
        ],
      },
    ],
  },
  {
    brand: "KendallKylie",
    tags: ["Casual", "Luxury"],
    defaultGender: "womens",
    categories: [
      // ── Tops ──
      {
        name: "Dress Shirts",
        tag: "Clothing",
        styles: [
          { name: "Barong Modern Slim", price: 179900, cost: 89900, desc: "Contemporary slim-fit barong tagalog" },
          { name: "Oxford Button-Down", price: 159900, cost: 79900, desc: "Classic oxford cloth shirt" },
          { name: "Linen Blend Shirt", price: 169900, cost: 84900, desc: "Breathable linen-cotton blend" },
          { name: "Stretch Poplin Shirt", price: 149900, cost: 74900, desc: "Easy-care stretch poplin" },
        ],
      },
      // ── Accessories ──
      {
        name: "Bags",
        tag: "Bags",
        styles: [
          { name: "Leather Messenger", price: 299900, cost: 149900, desc: "Full-grain leather messenger bag" },
          { name: "Canvas Tote", price: 119900, cost: 59900, desc: "Heavy-duty canvas tote bag" },
          { name: "Nylon Backpack", price: 179900, cost: 89900, desc: "Water-resistant nylon backpack" },
        ],
      },
      {
        name: "Belts",
        tag: "Accessories",
        styles: [
          { name: "Classic Leather Belt", price: 89900, cost: 44900, desc: "Full-grain leather dress belt" },
          { name: "Reversible Belt", price: 99900, cost: 49900, desc: "Black/brown reversible belt" },
        ],
      },
      {
        name: "Wallets",
        tag: "Accessories",
        styles: [
          { name: "Bifold Wallet", price: 79900, cost: 39900, desc: "Slim leather bifold wallet" },
          { name: "Card Holder", price: 49900, cost: 24900, desc: "Minimalist card holder" },
        ],
      },
    ],
  },
  {
    brand: "Case Study",
    tags: ["Casual", "Luxury"],
    defaultGender: "mens",
    categories: [
      // ── Bottoms ──
      {
        name: "Chinos",
        tag: "Clothing",
        styles: [
          { name: "Tailored Chino", price: 139900, cost: 69900, desc: "Tailored fit premium chinos" },
          { name: "Pleated Wide Chino", price: 149900, cost: 74900, desc: "Pleated wide-leg chinos" },
          { name: "Slim Stretch Chino", price: 119900, cost: 59900, desc: "Slim fit stretch cotton chinos" },
          { name: "Relaxed Chino", price: 109900, cost: 54900, desc: "Relaxed straight leg chinos" },
        ],
      },
      // ── Footwear ──
      {
        name: "Boots",
        tag: "Shoes",
        styles: [
          { name: "Chelsea Boot", price: 349900, cost: 174900, desc: "Suede Chelsea boot with elastic gore" },
          { name: "Desert Boot", price: 299900, cost: 149900, desc: "Classic crepe-sole desert boot" },
        ],
      },
      // ── Headwear ──
      {
        name: "Bucket Hats",
        tag: "Accessories",
        styles: [
          { name: "Reversible Bucket", price: 54900, cost: 27400, desc: "Two-tone reversible bucket hat" },
          { name: "Washed Canvas Bucket", price: 49900, cost: 24900, desc: "Garment-dyed canvas bucket hat" },
        ],
      },
      // ── Tops ──
      {
        name: "Hoodies",
        tag: "Clothing",
        styles: [
          { name: "Workwear Hoodie", price: 169900, cost: 84900, desc: "Reinforced heavyweight hoodie" },
          { name: "Quarter-Zip Pullover", price: 159900, cost: 79900, desc: "Quarter-zip fleece pullover" },
        ],
      },
    ],
  },
  {
    brand: "ScentSmith",
    tags: ["Luxury", "Essentials"],
    defaultGender: "mens",
    categories: [
      // ── Underwear ──
      {
        name: "Boxers",
        tag: "Underwear",
        styles: [
          { name: "Cotton Boxer Brief", price: 34900, cost: 17400, desc: "Stretch cotton boxer brief" },
          { name: "Performance Boxer", price: 44900, cost: 22400, desc: "Moisture-wicking sport boxer" },
        ],
      },
      {
        name: "Undershirts",
        tag: "Underwear",
        styles: [
          { name: "Crew Undershirt", price: 29900, cost: 14900, desc: "Cotton crew neck undershirt" },
          { name: "V-Neck Undershirt", price: 29900, cost: 14900, desc: "Cotton v-neck undershirt" },
        ],
      },
      {
        name: "Socks",
        tag: "Underwear",
        styles: [
          { name: "Crew Athletic Sock", price: 19900, cost: 9900, desc: "Cushioned crew athletic socks" },
          { name: "No-Show Liner", price: 14900, cost: 7400, desc: "Invisible no-show liner socks" },
          { name: "Work Boot Sock", price: 24900, cost: 12400, desc: "Reinforced heel/toe boot socks" },
        ],
      },
      // ── Tops ──
      {
        name: "Long Sleeves",
        tag: "Clothing",
        styles: [
          { name: "Flannel Shirt", price: 119900, cost: 59900, desc: "Brushed cotton flannel shirt" },
          { name: "Heavyweight Henley", price: 89900, cost: 44900, desc: "Thick ribbed henley long sleeve" },
        ],
      },
    ],
  },
  {
    brand: "Little Rebels",
    tags: ["Casual", "Essentials"],
    defaultGender: "kids",
    categories: [
      // ── Boys ──
      {
        name: "T-Shirts",
        tag: "Clothing",
        styles: [
          { name: "Dino Explorer Tee", price: 29900, cost: 14900, desc: "Fun dinosaur graphic tee for boys", gender: "boys" },
          { name: "Race Car Tee", price: 29900, cost: 14900, desc: "Race car print crew neck tee", gender: "boys" },
          { name: "Cosmic Space Tee", price: 34900, cost: 17400, desc: "Galaxy print tee for young explorers", gender: "boys" },
          { name: "Safari Adventure Tee", price: 29900, cost: 14900, desc: "Animal print adventure tee", gender: "boys" },
        ],
      },
      {
        name: "Shorts",
        tag: "Clothing",
        styles: [
          { name: "Cargo Play Shorts", price: 39900, cost: 19900, desc: "Durable cargo shorts for active boys", gender: "boys" },
          { name: "Athletic Sport Shorts", price: 34900, cost: 17400, desc: "Quick-dry sport shorts for boys", gender: "boys" },
        ],
      },
      {
        name: "Hoodies",
        tag: "Clothing",
        styles: [
          { name: "Super Hero Hoodie", price: 49900, cost: 24900, desc: "Warm fleece hoodie with hero print", gender: "boys" },
          { name: "Skater Zip Hoodie", price: 54900, cost: 27400, desc: "Zip-up hoodie with skateboard graphics", gender: "boys" },
        ],
      },
      // ── Girls ──
      {
        name: "Dress Shirts",
        tag: "Clothing",
        styles: [
          { name: "Floral Garden Blouse", price: 34900, cost: 17400, desc: "Cute floral print blouse for girls", gender: "girls" },
          { name: "Butterfly Dream Top", price: 29900, cost: 14900, desc: "Butterfly print girls top", gender: "girls" },
          { name: "Rainbow Stripe Top", price: 29900, cost: 14900, desc: "Colorful striped girls top", gender: "girls" },
          { name: "Sparkle Star Blouse", price: 34900, cost: 17400, desc: "Glitter star print blouse", gender: "girls" },
        ],
      },
      {
        name: "Joggers",
        tag: "Clothing",
        styles: [
          { name: "Fairy Dance Jogger", price: 39900, cost: 19900, desc: "Soft joggers with fairy print", gender: "girls" },
          { name: "Glitter Stripe Jogger", price: 44900, cost: 22400, desc: "Comfy joggers with metallic stripe", gender: "girls" },
        ],
      },
      // ── Unisex kids ──
      {
        name: "Sneakers",
        tag: "Shoes",
        styles: [
          { name: "Playground Runner", price: 69900, cost: 34900, desc: "Lightweight kids sneaker for everyday play", gender: "kids" },
          { name: "Velcro School Shoe", price: 59900, cost: 29900, desc: "Easy-on velcro sneaker for kids", gender: "kids" },
        ],
      },
      {
        name: "Caps",
        tag: "Accessories",
        styles: [
          { name: "Fun Animal Cap", price: 24900, cost: 12400, desc: "Cute animal ear kids cap", gender: "kids" },
          { name: "Colorblock Kids Cap", price: 19900, cost: 9900, desc: "Bright colorblock snapback for kids", gender: "kids" },
        ],
      },
      {
        name: "Bags",
        tag: "Bags",
        styles: [
          { name: "School Buddy Backpack", price: 49900, cost: 24900, desc: "Lightweight kids school backpack", gender: "kids" },
          { name: "Adventure Mini Pack", price: 39900, cost: 19900, desc: "Mini backpack for young adventurers", gender: "kids" },
        ],
      },
      {
        name: "Socks",
        tag: "Underwear",
        styles: [
          { name: "Fun Print Kids Socks", price: 14900, cost: 7400, desc: "Colorful patterned socks for kids", gender: "kids" },
          { name: "Sport Ankle Socks", price: 12900, cost: 6400, desc: "Cushioned ankle socks for active kids", gender: "kids" },
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
  gender?: "mens" | "womens" | "unisex" | "kids" | "boys" | "girls";
};

const VARIANT_MATRICES: Record<string, MatrixDef> = {
  // Headwear (unisex by default)
  "Caps":          { colors: ["Black", "White", "Navy", "Red", "Olive"], sizes: ["One Size"], sizeGroup: "One Size" },
  "Beanies":       { colors: ["Black", "Charcoal", "Navy", "Burgundy"], sizes: ["One Size"], sizeGroup: "One Size" },
  "Bucket Hats":   { colors: ["Black", "Olive", "Khaki", "Navy"], sizes: ["One Size"], sizeGroup: "One Size" },
  "Visors":        { colors: ["Black", "White", "Navy"], sizes: ["One Size"], sizeGroup: "One Size" },
  // Tops
  "T-Shirts":      { colors: ["Black", "White", "Navy", "Red", "Olive"], sizes: ["S", "M", "L", "XL", "XXL"], sizeGroup: "Apparel" },
  "Hoodies":       { colors: ["Black", "Navy", "Charcoal", "Olive"], sizes: ["S", "M", "L", "XL", "XXL"], sizeGroup: "Apparel" },
  "Long Sleeves":  { colors: ["Black", "White", "Navy", "Charcoal"], sizes: ["S", "M", "L", "XL"], sizeGroup: "Apparel" },
  "Sweaters":      { colors: ["Cream", "Navy", "Charcoal", "Burgundy"], sizes: ["S", "M", "L", "XL"], sizeGroup: "Apparel" },
  "Tank Tops":     { colors: ["Black", "White", "Red", "Navy"], sizes: ["S", "M", "L", "XL"], sizeGroup: "Apparel", gender: "mens" },
  "Polo Shirts":   { colors: ["Black", "White", "Navy", "Royal Blue"], sizes: ["S", "M", "L", "XL", "XXL"], sizeGroup: "Apparel" },
  "Dress Shirts":  { colors: ["White", "Navy", "Light Gray", "Sky Blue"], sizes: ["S", "M", "L", "XL"], sizeGroup: "Apparel" },
  "Jackets":       { colors: ["Black", "Navy", "Olive", "Charcoal"], sizes: ["S", "M", "L", "XL"], sizeGroup: "Apparel" },
  // Bottoms
  "Joggers":       { colors: ["Black", "Navy", "Charcoal", "Olive"], sizes: ["S", "M", "L", "XL"], sizeGroup: "Apparel" },
  "Shorts":        { colors: ["Black", "Navy", "Olive", "Khaki"], sizes: ["S", "M", "L", "XL"], sizeGroup: "Apparel" },
  "Chinos":        { colors: ["Khaki", "Navy", "Black", "Tan"], sizes: ["28", "30", "32", "34", "36"], sizeGroup: "Numeric", gender: "mens" },
  "Jeans":         { colors: ["Black", "Navy", "Charcoal"], sizes: ["28", "30", "32", "34", "36"], sizeGroup: "Numeric" },
  "Cargo Pants":   { colors: ["Black", "Olive", "Khaki", "Charcoal"], sizes: ["S", "M", "L", "XL"], sizeGroup: "Apparel", gender: "mens" },
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
  "Aeropostale": "AE",
  "Playboy": "PB",
  "Illest": "IL",
  "Rilla": "RL",
  "Starter": "ST",
  "KendallKylie": "KK",
  "Case Study": "CS",
  "ScentSmith": "SM",
  "Little Rebels": "LR",
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
// IMAGE PRESERVATION — Save/restore storageId mappings across reseeds
// ═══════════════════════════════════════════════════════════════════════════════

/** Collect brand name → storageId and category (brand+name) → storageId before wipe */
export const _saveImageMappings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const brands = await ctx.db.query("brands").collect();
    const categories = await ctx.db.query("categories").collect();

    const brandImages: Array<{ name: string; storageId: string }> = [];
    const brandBanners: Array<{ name: string; storageId: string }> = [];
    for (const b of brands) {
      if (b.storageId) {
        brandImages.push({ name: b.name.toLowerCase(), storageId: b.storageId });
      }
      if (b.bannerStorageId) {
        brandBanners.push({ name: b.name.toLowerCase(), storageId: b.bannerStorageId });
      }
    }

    const categoryImages: Array<{ brandName: string; catName: string; storageId: string }> = [];
    for (const c of categories) {
      if (c.storageId) {
        const brand = brands.find((b) => b._id === c.brandId);
        if (brand) {
          categoryImages.push({
            brandName: brand.name.toLowerCase(),
            catName: c.name.toLowerCase(),
            storageId: c.storageId,
          });
        }
      }
    }

    return { brandImages, brandBanners, categoryImages };
  },
});

/** Restore storageId on brands/categories by matching names */
export const _restoreImageMappings = internalMutation({
  args: {
    brandImages: v.array(v.object({ name: v.string(), storageId: v.string() })),
    brandBanners: v.array(v.object({ name: v.string(), storageId: v.string() })),
    categoryImages: v.array(v.object({ brandName: v.string(), catName: v.string(), storageId: v.string() })),
  },
  handler: async (ctx, args) => {
    let restored = 0;

    // Restore brand images
    const brands = await ctx.db.query("brands").collect();
    for (const mapping of args.brandImages) {
      const brand = brands.find((b) => b.name.toLowerCase() === mapping.name);
      if (brand && !brand.storageId) {
        await ctx.db.patch(brand._id, { storageId: mapping.storageId as Id<"_storage"> });
        restored++;
      }
    }

    // Restore brand banners
    for (const mapping of args.brandBanners) {
      const brand = brands.find((b) => b.name.toLowerCase() === mapping.name);
      if (brand && !brand.bannerStorageId) {
        await ctx.db.patch(brand._id, { bannerStorageId: mapping.storageId as Id<"_storage"> });
        restored++;
      }
    }

    // Restore category images
    const categories = await ctx.db.query("categories").collect();
    for (const mapping of args.categoryImages) {
      const brand = brands.find((b) => b.name.toLowerCase() === mapping.brandName);
      if (!brand) continue;
      const cat = categories.find(
        (c) => c.brandId === brand._id && c.name.toLowerCase() === mapping.catName
      );
      if (cat && !cat.storageId) {
        await ctx.db.patch(cat._id, { storageId: mapping.storageId as Id<"_storage"> });
        restored++;
      }
    }

    return restored;
  },
});

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

export const _wipePromosAndTxns = internalMutation({
  args: {},
  handler: async (ctx) => {
    let total = 0;
    for (const row of await ctx.db.query("promotions").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("transactionItems").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("transactions").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("inventoryBatches").take(500)) { await ctx.db.delete(row._id); total++; }
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
    // 1. Find admin user (no auth needed — this runs from CLI/dashboard)
    const user = await ctx.runQuery(internal.seed._getAdminUser);
    if (!user) throw new Error("No admin user found in DB. Create one first via Clerk.");

    console.log("=== RedBox Apparel Seed: Starting ===");

    // 2a. Save uploaded images before wipe
    console.log("Saving image mappings...");
    const imageMappings = await ctx.runQuery(internal.seed._saveImageMappings);
    console.log(
      `Saved ${imageMappings.brandImages.length} brand images, ${imageMappings.categoryImages.length} category images`
    );

    // 2b. Wipe all data (except users)
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
    // Build brand→tags lookup
    const brandTagsMap = new Map<string, string[]>();
    for (const brandDef of CATALOG) {
      brandTagsMap.set(brandDef.brand.toLowerCase(), brandDef.tags ?? []);
    }

    const items: Array<{
      brand: string;
      category: string;
      categoryTag?: string;
      styleName: string;
      desc: string;
      price: number;
      cost: number;
      sku: string;
      size: string;
      sizeGroup: string;
      color: string;
      gender?: "mens" | "womens" | "unisex" | "kids" | "boys" | "girls";
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
                categoryTag: catDef.tag,
                styleName: style.name,
                desc: style.desc,
                price: style.price,
                cost: style.cost,
                sku: generateSku(brandDef.brand, catDef.name, si, color, size),
                size,
                sizeGroup: matrix.sizeGroup,
                color,
                gender: style.gender ?? matrix.gender ?? brandDef.defaultGender ?? "unisex",
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
            { name: row.brand, tags: brandTagsMap.get(brandKey), userId: user._id }
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
            { brandId, name: row.category, tag: row.categoryTag, userId: user._id }
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

    // 7b. Restore uploaded images
    if (imageMappings.brandImages.length > 0 || imageMappings.brandBanners.length > 0 || imageMappings.categoryImages.length > 0) {
      console.log("Restoring uploaded images...");
      const restored: number = await ctx.runMutation(
        internal.seed._restoreImageMappings,
        {
          brandImages: imageMappings.brandImages,
          brandBanners: imageMappings.brandBanners,
          categoryImages: imageMappings.categoryImages,
        }
      );
      console.log(`Restored ${restored} images`);
    }

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

// ═══════════════════════════════════════════════════════════════════════════════
// Transactions & Promotions Seeder
// Seeds 6 promotions (all types) + ~150 transactions across 30 days
// demonstrating regular sales, promo discounts, senior/pwd, payment methods.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Tax Helpers ─────────────────────────────────────────────────────────────

function removeVat(priceCentavos: number): number {
  return Math.round(priceCentavos / 1.12);
}

function vatAmount(priceCentavos: number): number {
  return priceCentavos - removeVat(priceCentavos);
}

// Deterministic pseudo-random (no Math.random in Convex actions is fine,
// but we use a simple seeded LCG so results are reproducible)
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ─── Helper Query: Variants with Hierarchy ──────────────────────────────────

export const _getVariantsWithHierarchy = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const variants = await ctx.db.query("variants").take(args.limit);
    const styleCache = new Map<string, { categoryId: string; brandId: string }>();
    const results: Array<{
      _id: string;
      sku: string;
      priceCentavos: number;
      color: string;
      sizeGroup: string;
      gender: string;
      brandId: string;
      categoryId: string;
      styleId: string;
    }> = [];

    for (const v of variants) {
      const sKey = String(v.styleId);
      let hierarchy = styleCache.get(sKey);
      if (!hierarchy) {
        const style = await ctx.db.get(v.styleId);
        if (!style) continue;
        const category = await ctx.db.get(style.categoryId);
        if (!category) continue;
        hierarchy = {
          categoryId: String(style.categoryId),
          brandId: String(category.brandId),
        };
        styleCache.set(sKey, hierarchy);
      }
      results.push({
        _id: String(v._id),
        sku: v.sku,
        priceCentavos: v.priceCentavos,
        color: v.color,
        sizeGroup: v.sizeGroup ?? "",
        gender: v.gender ?? "unisex",
        brandId: hierarchy.brandId,
        categoryId: hierarchy.categoryId,
        styleId: sKey,
      });
    }
    return results;
  },
});

// ─── Helper Query: Get Brand/Category IDs by Name ──────────────────────────

export const _getCatalogIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const brands = await ctx.db.query("brands").collect();
    const categories = await ctx.db.query("categories").collect();
    const styles = await ctx.db.query("styles").collect();
    return {
      brands: brands.map((b) => ({ _id: String(b._id), name: b.name })),
      categories: categories.map((c) => ({
        _id: String(c._id),
        name: c.name,
        brandId: String(c.brandId),
      })),
      styles: styles.map((s) => ({
        _id: String(s._id),
        name: s.name,
        categoryId: String(s.categoryId),
      })),
    };
  },
});

// ─── Seed Promotions ────────────────────────────────────────────────────────

export const _seedPromotions = internalMutation({
  args: {
    userId: v.id("users"),
    promos: v.array(v.object({
      name: v.string(),
      description: v.string(),
      promoType: v.union(
        v.literal("percentage"),
        v.literal("fixedAmount"),
        v.literal("buyXGetY"),
        v.literal("tiered")
      ),
      percentageValue: v.optional(v.number()),
      maxDiscountCentavos: v.optional(v.number()),
      fixedAmountCentavos: v.optional(v.number()),
      buyQuantity: v.optional(v.number()),
      getQuantity: v.optional(v.number()),
      minSpendCentavos: v.optional(v.number()),
      tieredDiscountCentavos: v.optional(v.number()),
      branchIds: v.optional(v.array(v.id("branches"))),
      brandIds: v.array(v.id("brands")),
      categoryIds: v.array(v.id("categories")),
      styleIds: v.optional(v.array(v.id("styles"))),
      variantIds: v.optional(v.array(v.id("variants"))),
      colors: v.optional(v.array(v.string())),
      sizes: v.optional(v.array(v.string())),
      genders: v.optional(v.array(v.union(
        v.literal("mens"), v.literal("womens"), v.literal("unisex"), v.literal("kids"), v.literal("boys"), v.literal("girls")
      ))),
      agingTiers: v.optional(v.array(v.union(
        v.literal("green"), v.literal("yellow"), v.literal("red")
      ))),
      priority: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const results: Array<{ promoId: string; name: string; promoType: string }> = [];

    for (const p of args.promos) {
      const promoId = await ctx.db.insert("promotions", {
        name: p.name,
        description: p.description,
        promoType: p.promoType,
        percentageValue: p.percentageValue,
        maxDiscountCentavos: p.maxDiscountCentavos,
        fixedAmountCentavos: p.fixedAmountCentavos,
        buyQuantity: p.buyQuantity,
        getQuantity: p.getQuantity,
        minSpendCentavos: p.minSpendCentavos,
        tieredDiscountCentavos: p.tieredDiscountCentavos,
        branchIds: p.branchIds ?? [],
        brandIds: p.brandIds,
        categoryIds: p.categoryIds,
        styleIds: p.styleIds,
        variantIds: p.variantIds ?? [],
        colors: p.colors,
        sizes: p.sizes,
        genders: p.genders,
        agingTiers: p.agingTiers,
        startDate: thirtyDaysAgo,
        isActive: true,
        priority: p.priority,
        createdById: args.userId,
        createdAt: now,
        updatedAt: now,
      });
      results.push({ promoId: String(promoId), name: p.name, promoType: p.promoType });
    }
    return results;
  },
});

// ─── Seed Transaction Batch ─────────────────────────────────────────────────

export const _seedTransactionsBatch = internalMutation({
  args: {
    transactions: v.array(v.object({
      branchId: v.id("branches"),
      cashierId: v.id("users"),
      receiptNumber: v.string(),
      subtotalCentavos: v.number(),
      vatAmountCentavos: v.number(),
      discountAmountCentavos: v.number(),
      totalCentavos: v.number(),
      paymentMethod: v.union(v.literal("cash"), v.literal("gcash"), v.literal("maya")),
      discountType: v.union(v.literal("senior"), v.literal("pwd"), v.literal("none")),
      amountTenderedCentavos: v.optional(v.number()),
      changeCentavos: v.optional(v.number()),
      promotionId: v.optional(v.id("promotions")),
      promoDiscountAmountCentavos: v.optional(v.number()),
      createdAt: v.number(),
      items: v.array(v.object({
        variantId: v.id("variants"),
        quantity: v.number(),
        unitPriceCentavos: v.number(),
        lineTotalCentavos: v.number(),
      })),
    })),
  },
  handler: async (ctx, args) => {
    let txnCount = 0;
    let itemCount = 0;
    for (const txn of args.transactions) {
      const txnId = await ctx.db.insert("transactions", {
        branchId: txn.branchId,
        cashierId: txn.cashierId,
        receiptNumber: txn.receiptNumber,
        subtotalCentavos: txn.subtotalCentavos,
        vatAmountCentavos: txn.vatAmountCentavos,
        discountAmountCentavos: txn.discountAmountCentavos,
        totalCentavos: txn.totalCentavos,
        paymentMethod: txn.paymentMethod,
        discountType: txn.discountType,
        amountTenderedCentavos: txn.amountTenderedCentavos,
        changeCentavos: txn.changeCentavos,
        promotionId: txn.promotionId,
        promoDiscountAmountCentavos: txn.promoDiscountAmountCentavos,
        isOffline: false,
        createdAt: txn.createdAt,
      });
      for (const item of txn.items) {
        await ctx.db.insert("transactionItems", {
          transactionId: txnId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPriceCentavos: item.unitPriceCentavos,
          lineTotalCentavos: item.lineTotalCentavos,
        });
        itemCount++;
      }
      txnCount++;
    }
    return { txnCount, itemCount };
  },
});

// ─── Seed Inventory Batches (for aging tiers) ───────────────────────────────

export const _seedInventoryBatches = internalMutation({
  args: {
    batches: v.array(v.object({
      branchId: v.id("branches"),
      variantId: v.id("variants"),
      quantity: v.number(),
      costPriceCentavos: v.number(),
      receivedAt: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    let count = 0;
    for (const b of args.batches) {
      await ctx.db.insert("inventoryBatches", {
        branchId: b.branchId,
        variantId: b.variantId,
        quantity: b.quantity,
        costPriceCentavos: b.costPriceCentavos,
        receivedAt: b.receivedAt,
        source: "legacy",
        createdAt: Date.now(),
      });
      count++;
    }
    return count;
  },
});

// ─── Orchestrator Action ────────────────────────────────────────────────────

export const seedTransactionsAndPromos = action({
  args: {},
  handler: async (ctx): Promise<{
    promotions: number;
    transactions: number;
    transactionItems: number;
    inventoryBatches: number;
  }> => {
    const user = await ctx.runQuery(internal.seed._getAdminUser);
    if (!user) throw new Error("No admin user found. Run seedDatabase first.");

    console.log("=== Transactions & Promos Seed: Starting ===");

    // 0. Wipe existing promos, transactions, and inventory batches
    console.log("Wiping existing promos & transactions...");
    let wipedTotal = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const wiped = await ctx.runMutation(internal.seed._wipePromosAndTxns);
      wipedTotal += wiped;
      if (wiped === 0) break;
    }
    if (wipedTotal > 0) console.log(`Wiped ${wipedTotal} rows`);

    // 1. Get branches
    const branches = await ctx.runQuery(internal.seed._getRetailBranches);
    if (branches.length === 0) throw new Error("No retail branches. Run seedDatabase first.");

    // 2. Get catalog IDs
    const catalog = await ctx.runQuery(internal.seed._getCatalogIds);
    const findBrand = (name: string) =>
      catalog.brands.find((b) => b.name === name)?._id;
    const findCatsByName = (names: string[]) =>
      catalog.categories.filter((c) => names.includes(c.name)).map((c) => c._id);
    const findStylesByName = (names: string[]) =>
      catalog.styles.filter((s) => names.includes(s.name)).map((s) => s._id);
    const findCatsForBrand = (brandId: string, names: string[]) =>
      catalog.categories
        .filter((c) => c.brandId === brandId && names.includes(c.name))
        .map((c) => c._id);

    // 3. Get variants with hierarchy
    const allVariants = await ctx.runQuery(internal.seed._getVariantsWithHierarchy, { limit: 200 });
    if (allVariants.length < 20) throw new Error("Need at least 20 variants. Run seedDatabase first.");

    // 4. Build and seed promotions
    console.log("Seeding promotions...");

    const aeropostaleId = findBrand("Aeropostale");
    const playboyId = findBrand("Playboy");
    const illestId = findBrand("Illest");
    const rillaId = findBrand("Rilla");
    const starterId = findBrand("Starter");
    const kendallKylieId = findBrand("KendallKylie");
    const caseStudyId = findBrand("Case Study");
    const scentSmithId = findBrand("ScentSmith");

    const tShirtCatIds = findCatsByName(["T-Shirts"]);
    const poloCatIds = findCatsByName(["Polo Shirts"]);
    const socksCatIds = findCatsByName(["Socks"]);
    const footwearCatIds = findCatsByName(["Sneakers", "Slides", "Boots"]);

    // Find Manila branch for branch-scoped promos
    const manilaBranch = branches.find((b) => b.name === "Manila Flagship");
    const cebuBranch = branches.find((b) => b.name === "Cebu Branch");

    type PromoArg = {
      name: string;
      description: string;
      promoType: "percentage" | "fixedAmount" | "buyXGetY" | "tiered";
      percentageValue?: number;
      maxDiscountCentavos?: number;
      fixedAmountCentavos?: number;
      buyQuantity?: number;
      getQuantity?: number;
      minSpendCentavos?: number;
      tieredDiscountCentavos?: number;
      branchIds?: Id<"branches">[];
      brandIds: Id<"brands">[];
      categoryIds: Id<"categories">[];
      styleIds?: Id<"styles">[];
      variantIds?: Id<"variants">[];
      colors?: string[];
      sizes?: string[];
      genders?: ("mens" | "womens" | "unisex" | "kids" | "boys" | "girls")[];
      agingTiers?: ("green" | "yellow" | "red")[];
      priority: number;
    };

    // ── Default percentage-off promos (10% – 80%) ─────────────────────────
    const defaultPercentagePromos: PromoArg[] = [10, 20, 30, 40, 50, 60, 70, 80].map(
      (pct, i) => ({
        name: `${pct}% Off`,
        description: `${pct}% discount on any item`,
        promoType: "percentage" as const,
        percentageValue: pct,
        brandIds: [],
        categoryIds: [],
        priority: 100 + i, // high priority so they appear first
      })
    );

    // ── Scoped promos ─────────────────────────────────────────────────────
    const promoArgs: PromoArg[] = [
      ...defaultPercentagePromos,
      {
        name: "Summer Tee Sale",
        description: "15% off all Aeropostale T-Shirts (max P200 discount)",
        promoType: "percentage",
        percentageValue: 15,
        maxDiscountCentavos: 20000,
        brandIds: aeropostaleId ? [aeropostaleId as Id<"brands">] : [],
        categoryIds: tShirtCatIds as Id<"categories">[],
        priority: 1,
      },
      {
        name: "Flat P100 Off Polos",
        description: "P100 off any Aeropostale Polo Shirt",
        promoType: "fixedAmount",
        fixedAmountCentavos: 10000,
        brandIds: aeropostaleId ? [aeropostaleId as Id<"brands">] : [],
        categoryIds: poloCatIds as Id<"categories">[],
        priority: 2,
      },
      {
        name: "Buy 2 Get 1 Free Socks",
        description: "Buy 2 pairs of ScentSmith socks, get the cheapest one free",
        promoType: "buyXGetY",
        buyQuantity: 2,
        getQuantity: 1,
        brandIds: scentSmithId ? [scentSmithId as Id<"brands">] : [],
        categoryIds: socksCatIds as Id<"categories">[],
        priority: 3,
      },
      {
        name: "Spend P3000 Save P500",
        description: "Spend at least P3,000 and save P500 instantly",
        promoType: "tiered",
        minSpendCentavos: 300000,
        tieredDiscountCentavos: 50000,
        brandIds: [],
        categoryIds: [],
        priority: 4,
      },
      {
        name: "Red Items 10% Off",
        description: "10% off all red-colored items",
        promoType: "percentage",
        percentageValue: 10,
        brandIds: [],
        categoryIds: [],
        colors: ["Red"],
        priority: 5,
      },
      {
        name: "Footwear Flash Sale",
        description: "20% off all mens footwear",
        promoType: "percentage",
        percentageValue: 20,
        brandIds: [],
        categoryIds: footwearCatIds as Id<"categories">[],
        genders: ["mens"] as ("mens" | "womens" | "unisex" | "kids" | "boys" | "girls")[],
        priority: 6,
      },

      // ── Complex multi-filter promos ─────────────────────────────────────

      // #7: Branch + Brand + Category + Color + Gender
      // Manila-only, Urban Core Hoodies, Black only, Mens
      {
        name: "Manila Black Hoodie Deal",
        description: "P200 off black mens Playboy hoodies — Manila Flagship only",
        promoType: "fixedAmount",
        fixedAmountCentavos: 20000,
        branchIds: manilaBranch ? [manilaBranch._id] : [],
        brandIds: playboyId ? [playboyId as Id<"brands">] : [],
        categoryIds: findCatsForBrand(playboyId ?? "", ["Hoodies"]) as Id<"categories">[],
        colors: ["Black"],
        genders: ["mens"],
        priority: 7,
      },

      // #8: Branch + Category + Style + Size Group
      // Cebu-only, Street Pulse Jeans, Selvedge Slim style, EU sizing only
      {
        name: "Cebu Selvedge Jean Promo",
        description: "10% off Selvedge Slim jeans in EU sizes — Cebu Branch only",
        promoType: "percentage",
        percentageValue: 10,
        branchIds: cebuBranch ? [cebuBranch._id] : [],
        brandIds: playboyId ? [playboyId as Id<"brands">] : [],
        categoryIds: findCatsForBrand(playboyId ?? "", ["Jeans"]) as Id<"categories">[],
        styleIds: findStylesByName(["Selvedge Slim"]) as Id<"styles">[],
        sizes: ["EU"],
        priority: 8,
      },

      // #9: Brand + Category + Color + Size Group + Gender
      // Ironside T-Shirts, White & Navy, Apparel sizes, Mens only
      {
        name: "Rilla White & Navy Tees",
        description: "Buy 2 get 1 free on white/navy Rilla tees — mens Apparel sizes",
        promoType: "buyXGetY",
        buyQuantity: 2,
        getQuantity: 1,
        brandIds: rillaId ? [rillaId as Id<"brands">] : [],
        categoryIds: findCatsForBrand(rillaId ?? "", ["T-Shirts"]) as Id<"categories">[],
        colors: ["White", "Navy"],
        sizes: ["Apparel"],
        genders: ["mens"],
        priority: 9,
      },

      // #10: Branch + Brand + Style + Color + Aging tier
      // Manila, Prime Threads Chelsea Boot, Brown/Tan, old stock (red tier)
      {
        name: "Clearance: Chelsea Boots Manila",
        description: "25% off brown/tan Chelsea Boots at Manila — aging red-tier stock",
        promoType: "percentage",
        percentageValue: 25,
        branchIds: manilaBranch ? [manilaBranch._id] : [],
        brandIds: caseStudyId ? [caseStudyId as Id<"brands">] : [],
        categoryIds: findCatsForBrand(caseStudyId ?? "", ["Boots"]) as Id<"categories">[],
        styleIds: findStylesByName(["Chelsea Boot"]) as Id<"styles">[],
        colors: ["Brown", "Tan"],
        agingTiers: ["red"],
        priority: 10,
      },

      // #11: Brand + Category + Gender + Size Group + Color + tiered spend
      // Prime Threads Polo Shirts, womens, US sizes, pastel colors, min P2000
      {
        name: "Womens Polo Bundle Deal",
        description: "Spend P2,000+ on womens Aeropostale polos (pink/lavender, US sizing) → save P300",
        promoType: "tiered",
        minSpendCentavos: 200000,
        tieredDiscountCentavos: 30000,
        brandIds: aeropostaleId ? [aeropostaleId as Id<"brands">] : [],
        categoryIds: poloCatIds as Id<"categories">[],
        genders: ["womens"],
        sizes: ["US"],
        colors: ["Pink", "Lavender"],
        priority: 11,
      },

      // #12: Branch + Brand + Multiple categories + Color + Gender + aging tier
      // All branches, Street Pulse Sneakers+Slides, White/Black, unisex, yellow+red aging
      {
        name: "Slow-Moving Footwear Blowout",
        description: "30% off white/black unisex Illest sneakers & slides — aging yellow/red stock",
        promoType: "percentage",
        percentageValue: 30,
        maxDiscountCentavos: 100000,
        brandIds: illestId ? [illestId as Id<"brands">] : [],
        categoryIds: findCatsForBrand(illestId ?? "", ["Sneakers", "Slides"]) as Id<"categories">[],
        colors: ["White", "Black"],
        genders: ["unisex"],
        agingTiers: ["yellow", "red"],
        priority: 12,
      },
    ];

    const promoResults = await ctx.runMutation(internal.seed._seedPromotions, {
      userId: user._id,
      promos: promoArgs,
    });
    console.log(`Promotions: ${promoResults.length} created`);

    // 5. Build transactions
    console.log("Generating transactions...");
    const rng = seededRng(42);
    const now = Date.now();

    type TxnItem = {
      variantId: Id<"variants">;
      quantity: number;
      unitPriceCentavos: number;
      lineTotalCentavos: number;
    };
    type TxnRecord = {
      branchId: Id<"branches">;
      cashierId: Id<"users">;
      receiptNumber: string;
      subtotalCentavos: number;
      vatAmountCentavos: number;
      discountAmountCentavos: number;
      totalCentavos: number;
      paymentMethod: "cash" | "gcash" | "maya";
      discountType: "senior" | "pwd" | "none";
      amountTenderedCentavos?: number;
      changeCentavos?: number;
      promotionId?: Id<"promotions">;
      promoDiscountAmountCentavos?: number;
      createdAt: number;
      items: TxnItem[];
    };

    const allTxns: TxnRecord[] = [];
    const branchWeights = [0.5, 0.3, 0.2]; // Manila, Cebu, Davao
    let globalCounter = 0;

    // Pick a random variant from the pool
    const pickVariant = () => allVariants[Math.floor(rng() * allVariants.length)];

    // Pick payment method by distribution
    const pickPayment = (): "cash" | "gcash" | "maya" => {
      const r = rng();
      if (r < 0.6) return "cash";
      if (r < 0.85) return "gcash";
      return "maya";
    };

    // Round up to nearest P100 for cash tender
    const roundUpTender = (amountCentavos: number): number => {
      return Math.ceil(amountCentavos / 10000) * 10000;
    };

    // Pick branch by weight
    const pickBranch = () => {
      const r = rng();
      let cumulative = 0;
      for (let i = 0; i < branches.length; i++) {
        cumulative += branchWeights[i] ?? 0.2;
        if (r < cumulative) return branches[i];
      }
      return branches[0];
    };

    // Generate ~150 transactions over 30 days
    for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
      const dayBase = now - dayOffset * DAY_MS;
      const txnsPerDay = 4 + Math.floor(rng() * 3); // 4-6 per day

      for (let t = 0; t < txnsPerDay; t++) {
        const branch = pickBranch();
        const hourOffset = (10 + Math.floor(rng() * 10)) * 60 * 60 * 1000; // 10am-8pm
        const txnTime = dayBase + hourOffset;
        const payment = pickPayment();
        globalCounter++;

        // Decide transaction type
        const typeRoll = rng();
        const isSeniorPwd = typeRoll > 0.85;
        const isPromo = !isSeniorPwd && typeRoll > 0.70;

        // Number of items
        const itemCount = isSeniorPwd
          ? 1 + Math.floor(rng() * 2)        // 1-2
          : isPromo
            ? 1 + Math.floor(rng() * 3)      // 1-3
            : 1 + Math.floor(rng() * 4);     // 1-4

        const items: TxnItem[] = [];
        for (let i = 0; i < itemCount; i++) {
          const variant = pickVariant();
          const qty = 1 + Math.floor(rng() * 3); // 1-3
          items.push({
            variantId: variant._id as Id<"variants">,
            quantity: qty,
            unitPriceCentavos: variant.priceCentavos,
            lineTotalCentavos: variant.priceCentavos * qty,
          });
        }

        const subtotal = items.reduce((sum, it) => sum + it.lineTotalCentavos, 0);

        if (isSeniorPwd) {
          // Senior/PWD: remove VAT, then 20% discount
          const discType = rng() < 0.5 ? "senior" : "pwd";
          let vatExemptBase = 0;
          for (const it of items) {
            vatExemptBase += removeVat(it.unitPriceCentavos) * it.quantity;
          }
          const discountAmount = Math.round(vatExemptBase * 0.20);
          const total = vatExemptBase - discountAmount;

          const txn: TxnRecord = {
            branchId: branch._id,
            cashierId: user._id,
            receiptNumber: `SEED-TXN-${dayOffset}-${globalCounter}`,
            subtotalCentavos: subtotal,
            vatAmountCentavos: 0,
            discountAmountCentavos: discountAmount,
            totalCentavos: total,
            paymentMethod: payment,
            discountType: discType as "senior" | "pwd",
            createdAt: txnTime,
            items,
          };
          if (payment === "cash") {
            txn.amountTenderedCentavos = roundUpTender(total);
            txn.changeCentavos = txn.amountTenderedCentavos - total;
          }
          allTxns.push(txn);
        } else if (isPromo) {
          // Promo transaction — pick a random promo and apply simple discount
          const promoIdx = Math.floor(rng() * promoResults.length);
          const promo = promoResults[promoIdx];
          const promoArg = promoArgs[promoIdx];

          let promoDiscount = 0;
          if (promoArg.promoType === "percentage") {
            promoDiscount = Math.round(subtotal * (promoArg.percentageValue ?? 0) / 100);
            if (promoArg.maxDiscountCentavos && promoDiscount > promoArg.maxDiscountCentavos) {
              promoDiscount = promoArg.maxDiscountCentavos;
            }
          } else if (promoArg.promoType === "fixedAmount") {
            promoDiscount = Math.min(promoArg.fixedAmountCentavos ?? 0, subtotal);
          } else if (promoArg.promoType === "buyXGetY") {
            // Simplified: give 1 free item (cheapest)
            const cheapest = Math.min(...items.map((it) => it.unitPriceCentavos));
            promoDiscount = cheapest;
          } else if (promoArg.promoType === "tiered") {
            if (subtotal >= (promoArg.minSpendCentavos ?? 0)) {
              promoDiscount = Math.min(promoArg.tieredDiscountCentavos ?? 0, subtotal);
            }
          }

          const vat = items.reduce((sum, it) => sum + vatAmount(it.unitPriceCentavos) * it.quantity, 0);
          const total = subtotal - promoDiscount;

          const txn: TxnRecord = {
            branchId: branch._id,
            cashierId: user._id,
            receiptNumber: `SEED-TXN-${dayOffset}-${globalCounter}`,
            subtotalCentavos: subtotal,
            vatAmountCentavos: vat,
            discountAmountCentavos: 0,
            totalCentavos: total,
            paymentMethod: payment,
            discountType: "none",
            promotionId: promo.promoId as Id<"promotions">,
            promoDiscountAmountCentavos: promoDiscount > 0 ? promoDiscount : undefined,
            createdAt: txnTime,
            items,
          };
          if (payment === "cash") {
            txn.amountTenderedCentavos = roundUpTender(total);
            txn.changeCentavos = txn.amountTenderedCentavos - total;
          }
          allTxns.push(txn);
        } else {
          // Regular sale — no promo, no senior/pwd
          const vat = items.reduce((sum, it) => sum + vatAmount(it.unitPriceCentavos) * it.quantity, 0);
          const txn: TxnRecord = {
            branchId: branch._id,
            cashierId: user._id,
            receiptNumber: `SEED-TXN-${dayOffset}-${globalCounter}`,
            subtotalCentavos: subtotal,
            vatAmountCentavos: vat,
            discountAmountCentavos: 0,
            totalCentavos: subtotal,
            paymentMethod: payment,
            discountType: "none",
            createdAt: txnTime,
            items,
          };
          if (payment === "cash") {
            txn.amountTenderedCentavos = roundUpTender(subtotal);
            txn.changeCentavos = txn.amountTenderedCentavos - subtotal;
          }
          allTxns.push(txn);
        }
      }
    }

    console.log(`Built ${allTxns.length} transactions`);

    // 6. Insert transactions in batches
    let totalTxns = 0;
    let totalItems = 0;
    const TXN_BATCH = 20;
    for (let i = 0; i < allTxns.length; i += TXN_BATCH) {
      const batch = allTxns.slice(i, i + TXN_BATCH);
      const result = await ctx.runMutation(internal.seed._seedTransactionsBatch, {
        transactions: batch,
      });
      totalTxns += result.txnCount;
      totalItems += result.itemCount;
    }
    console.log(`Inserted ${totalTxns} transactions, ${totalItems} items`);

    // 7. Seed inventory batches for aging tiers
    console.log("Seeding inventory batches for aging tiers...");
    const batchVariants = allVariants.slice(0, 30); // first 30 variants
    const inventoryBatches: Array<{
      branchId: Id<"branches">;
      variantId: Id<"variants">;
      quantity: number;
      costPriceCentavos: number;
      receivedAt: number;
    }> = [];

    for (let i = 0; i < batchVariants.length; i++) {
      const v = batchVariants[i];
      const branch = branches[i % branches.length];
      let receivedAt: number;

      if (i < 5) {
        // Red tier: 200+ days old
        receivedAt = now - (200 + Math.floor(rng() * 60)) * DAY_MS;
      } else if (i < 12) {
        // Yellow tier: 91-180 days old
        receivedAt = now - (100 + Math.floor(rng() * 70)) * DAY_MS;
      } else {
        // Green tier: < 90 days
        receivedAt = now - (5 + Math.floor(rng() * 60)) * DAY_MS;
      }

      inventoryBatches.push({
        branchId: branch._id,
        variantId: v._id as Id<"variants">,
        quantity: 10 + Math.floor(rng() * 40),
        costPriceCentavos: Math.round(v.priceCentavos * 0.5),
        receivedAt,
      });
    }

    const batchesCreated = await ctx.runMutation(internal.seed._seedInventoryBatches, {
      batches: inventoryBatches,
    });
    console.log(`Inventory batches: ${batchesCreated} created`);

    const summary = {
      promotions: promoResults.length,
      transactions: totalTxns,
      transactionItems: totalItems,
      inventoryBatches: batchesCreated,
    };

    console.log("=== Transactions & Promos Seed: Complete ===");
    return summary;
  },
});

import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

// ═══════════════════════════════════════════════════════════════════════════════
// RICH RESEED
// Clears all transactional data (keeps users, branches, catalog, colors, sizes,
// settings, cashierAccounts, banners, announcements, hotDeals, storageFiles).
// Then seeds 60 days of rich data for analytics, operations, marketing & insights.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Helpers ─────────────────────────────────────────────────────────────────

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function removeVat(p: number) { return Math.round(p / 1.12); }
function vatAmount(p: number) { return p - removeVat(p); }
function roundUpTender(c: number) { return Math.ceil(c / 10000) * 10000; }

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Step 1: Clear Misc Transactional Tables ─────────────────────────────────

export const _clearMiscTransactional = internalMutation({
  args: {},
  handler: async (ctx) => {
    let total = 0;
    for (const row of await ctx.db.query("crossSellEvents").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("auditLogs").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("demandLogs").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("demandWeeklySummaries").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("staffNotifications").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("branchScores").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("restockSuggestions").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("reservations").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("tradingEvents").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("tradingReminders").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("sellThruNotes").take(500)) { await ctx.db.delete(row._id); total++; }
    for (const row of await ctx.db.query("fashionAssistants").take(500)) { await ctx.db.delete(row._id); total++; }
    return total;
  },
});

// ─── Step 2: Seed Cashier Shifts ─────────────────────────────────────────────

export const _seedCashierShifts = internalMutation({
  args: {
    shifts: v.array(v.object({
      branchId: v.id("branches"),
      cashierId: v.id("users"),
      cashFundCentavos: v.number(),
      changeFundCentavos: v.optional(v.number()),
      status: v.union(v.literal("open"), v.literal("closed")),
      openedAt: v.number(),
      closedAt: v.optional(v.number()),
      closeType: v.optional(v.union(v.literal("turnover"), v.literal("endOfDay"))),
      closedCashBalanceCentavos: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    for (const s of args.shifts) {
      await ctx.db.insert("cashierShifts", {
        branchId: s.branchId,
        cashierId: s.cashierId,
        cashFundCentavos: s.cashFundCentavos,
        changeFundCentavos: s.changeFundCentavos,
        status: s.status,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        closeType: s.closeType,
        closedCashBalanceCentavos: s.closedCashBalanceCentavos,
      });
    }
    return args.shifts.length;
  },
});

// ─── Step 3: Seed Transfers ───────────────────────────────────────────────────

export const _seedTransfersData = internalMutation({
  args: {
    transfers: v.array(v.object({
      fromBranchId: v.id("branches"),
      toBranchId: v.id("branches"),
      requestedById: v.id("users"),
      status: v.union(
        v.literal("requested"),
        v.literal("approved"),
        v.literal("packed"),
        v.literal("inTransit"),
        v.literal("delivered")
      ),
      notes: v.optional(v.string()),
      createdAt: v.number(),
      approvedAt: v.optional(v.number()),
      approvedById: v.optional(v.id("users")),
      packedAt: v.optional(v.number()),
      shippedAt: v.optional(v.number()),
      deliveredAt: v.optional(v.number()),
      items: v.array(v.object({
        variantId: v.id("variants"),
        requestedQuantity: v.number(),
        packedQuantity: v.optional(v.number()),
        receivedQuantity: v.optional(v.number()),
      })),
    })),
  },
  handler: async (ctx, args) => {
    let txfrCount = 0;
    let itemCount = 0;
    for (const t of args.transfers) {
      const now = Date.now();
      const txfrId = await ctx.db.insert("transfers", {
        fromBranchId: t.fromBranchId,
        toBranchId: t.toBranchId,
        requestedById: t.requestedById,
        type: "stockRequest",
        status: t.status,
        notes: t.notes,
        createdAt: t.createdAt,
        updatedAt: now,
        approvedAt: t.approvedAt,
        approvedById: t.approvedById,
        packedAt: t.packedAt,
        shippedAt: t.shippedAt,
        deliveredAt: t.deliveredAt,
      });
      for (const item of t.items) {
        await ctx.db.insert("transferItems", {
          transferId: txfrId,
          variantId: item.variantId,
          requestedQuantity: item.requestedQuantity,
          packedQuantity: item.packedQuantity,
          receivedQuantity: item.receivedQuantity,
        });
        itemCount++;
      }
      txfrCount++;
    }
    return { txfrCount, itemCount };
  },
});

// ─── Step 4: Seed Cross-Sell Events ──────────────────────────────────────────

export const _seedCrossellEvents = internalMutation({
  args: {
    events: v.array(v.object({
      branchId: v.id("branches"),
      suggestedVariantId: v.id("variants"),
      cartVariantIds: v.array(v.id("variants")),
      priceCentavos: v.number(),
      createdAt: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    for (const e of args.events) {
      await ctx.db.insert("crossSellEvents", e);
    }
    return args.events.length;
  },
});

// ─── Helper: Get All Branches ─────────────────────────────────────────────────

export const _getAllBranches = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("branches").collect();
  },
});

// ─── Orchestrator Action ─────────────────────────────────────────────────────

export const richReseed = action({
  args: {},
  handler: async (ctx): Promise<{
    cleared: number;
    promotions: number;
    transactions: number;
    transactionItems: number;
    inventoryBatches: number;
    cashierShifts: number;
    transfers: number;
    transferItems: number;
    crossSellEvents: number;
  }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internalSeed = internal.seed as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internalReset = internal.seedReset as any;

    const user = await ctx.runQuery(internalSeed._getAdminUser);
    if (!user) throw new Error("No admin user found. Run seedDatabase first.");

    console.log("=== Rich Reseed: Starting ===");

    // ── 1. Clear all transactional data ──────────────────────────────────────
    console.log("Clearing transactional data...");
    let cleared = 0;
    // Loop until empty (handles >500 rows per table)
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const n: number = await ctx.runMutation(internalSeed._wipePromosAndTxns);
      cleared += n;
      if (n === 0) break;
    }
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const n: number = await ctx.runMutation(internalSeed._wipeTransfers);
      cleared += n;
      if (n === 0) break;
    }
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const n: number = await ctx.runMutation(internalSeed._wipeTransactions);
      cleared += n;
      if (n === 0) break;
    }
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const n: number = await ctx.runMutation(internalReset._clearMiscTransactional);
      cleared += n;
      if (n === 0) break;
    }
    console.log(`Cleared ${cleared} rows`);

    // ── 2. Fetch reference data ───────────────────────────────────────────────
    const allBranches = await ctx.runQuery(internalReset._getAllBranches);
    const warehouse = allBranches.find((b: { type?: string }) => b.type === "warehouse");
    const retailBranches = allBranches.filter((b: { type?: string; isActive: boolean }) => b.type === "retail" && b.isActive);
    if (retailBranches.length === 0) throw new Error("No retail branches. Run seedDatabase first.");

    const catalog = await ctx.runQuery(internalSeed._getCatalogIds);
    const allVariants = await ctx.runQuery(internalSeed._getVariantsWithHierarchy, { limit: 300 });
    if (allVariants.length < 20) throw new Error("Need at least 20 variants. Run seedDatabase first.");

    const findBrand = (name: string) => catalog.brands.find((b: { name: string }) => b.name === name)?._id;
    const findCatsByName = (names: string[]) =>
      catalog.categories.filter((c: { name: string }) => names.includes(c.name)).map((c: { _id: string }) => c._id);
    const findCatsForBrand = (brandId: string, names: string[]) =>
      catalog.categories
        .filter((c: { brandId: string; name: string }) => c.brandId === brandId && names.includes(c.name))
        .map((c: { _id: string }) => c._id);

    const aeropostaleId = findBrand("Aeropostale");
    const playboyId = findBrand("Playboy");
    const illestId = findBrand("Illest");
    const rillaId = findBrand("Rilla");
    const caseStudyId = findBrand("Case Study");
    const scentSmithId = findBrand("ScentSmith");

    const tShirtCatIds = findCatsByName(["T-Shirts"]);
    const poloCatIds = findCatsByName(["Polo Shirts"]);
    const socksCatIds = findCatsByName(["Socks"]);
    const footwearCatIds = findCatsByName(["Sneakers", "Slides", "Boots"]);
    const manilaBranch = retailBranches.find((b: { name: string }) => b.name === "Manila Flagship");
    const cebuBranch = retailBranches.find((b: { name: string }) => b.name === "Cebu Branch");

    // ── 3. Seed promotions ────────────────────────────────────────────────────
    console.log("Seeding promotions...");

    type PromoArg = {
      name: string; description: string;
      promoType: "percentage" | "fixedAmount" | "buyXGetY" | "tiered";
      percentageValue?: number; maxDiscountCentavos?: number;
      fixedAmountCentavos?: number; buyQuantity?: number; getQuantity?: number;
      minSpendCentavos?: number; tieredDiscountCentavos?: number;
      branchIds?: Id<"branches">[];
      brandIds: Id<"brands">[]; categoryIds: Id<"categories">[];
      styleIds?: Id<"styles">[]; variantIds?: Id<"variants">[];
      colors?: string[]; sizes?: string[];
      genders?: ("mens" | "womens" | "unisex" | "kids" | "boys" | "girls")[];
      agingTiers?: ("green" | "yellow" | "red")[];
      priority: number;
    };

    const defaultPctPromos: PromoArg[] = [10, 20, 30, 40, 50, 60, 70, 80].map((pct, i) => ({
      name: `${pct}% Off`,
      description: `${pct}% discount on any item`,
      promoType: "percentage" as const,
      percentageValue: pct,
      brandIds: [], categoryIds: [],
      priority: 100 + i,
    }));

    const promoArgs: PromoArg[] = [
      ...defaultPctPromos,
      {
        name: "Summer Tee Sale",
        description: "15% off all Aeropostale T-Shirts (max P200)",
        promoType: "percentage", percentageValue: 15, maxDiscountCentavos: 20000,
        brandIds: aeropostaleId ? [aeropostaleId as Id<"brands">] : [],
        categoryIds: tShirtCatIds as Id<"categories">[], priority: 1,
      },
      {
        name: "Flat P100 Off Polos",
        description: "P100 off any Aeropostale Polo Shirt",
        promoType: "fixedAmount", fixedAmountCentavos: 10000,
        brandIds: aeropostaleId ? [aeropostaleId as Id<"brands">] : [],
        categoryIds: poloCatIds as Id<"categories">[], priority: 2,
      },
      {
        name: "Buy 2 Get 1 Free Socks",
        description: "Buy 2 ScentSmith socks, get 1 free",
        promoType: "buyXGetY", buyQuantity: 2, getQuantity: 1,
        brandIds: scentSmithId ? [scentSmithId as Id<"brands">] : [],
        categoryIds: socksCatIds as Id<"categories">[], priority: 3,
      },
      {
        name: "Spend P3000 Save P500",
        description: "Spend P3,000+ and save P500",
        promoType: "tiered", minSpendCentavos: 300000, tieredDiscountCentavos: 50000,
        brandIds: [], categoryIds: [], priority: 4,
      },
      {
        name: "Red Items 10% Off",
        description: "10% off all red-colored items",
        promoType: "percentage", percentageValue: 10,
        brandIds: [], categoryIds: [], colors: ["Red"], priority: 5,
      },
      {
        name: "Footwear Flash Sale",
        description: "20% off all mens footwear",
        promoType: "percentage", percentageValue: 20,
        brandIds: [], categoryIds: footwearCatIds as Id<"categories">[],
        genders: ["mens"] as ("mens" | "womens" | "unisex" | "kids" | "boys" | "girls")[],
        priority: 6,
      },
      {
        name: "Manila Black Hoodie Deal",
        description: "P200 off black mens Playboy hoodies — Manila Flagship only",
        promoType: "fixedAmount", fixedAmountCentavos: 20000,
        branchIds: manilaBranch ? [manilaBranch._id] : [],
        brandIds: playboyId ? [playboyId as Id<"brands">] : [],
        categoryIds: findCatsForBrand(playboyId ?? "", ["Hoodies"]) as Id<"categories">[],
        colors: ["Black"], genders: ["mens"], priority: 7,
      },
      {
        name: "Slow-Moving Footwear Blowout",
        description: "30% off white/black unisex Illest sneakers & slides — aging yellow/red stock",
        promoType: "percentage", percentageValue: 30, maxDiscountCentavos: 100000,
        brandIds: illestId ? [illestId as Id<"brands">] : [],
        categoryIds: findCatsForBrand(illestId ?? "", ["Sneakers", "Slides"]) as Id<"categories">[],
        colors: ["White", "Black"], genders: ["unisex"],
        agingTiers: ["yellow", "red"], priority: 8,
      },
      {
        name: "Rilla Tees Bundle",
        description: "Buy 2 get 1 free on Rilla T-Shirts",
        promoType: "buyXGetY", buyQuantity: 2, getQuantity: 1,
        brandIds: rillaId ? [rillaId as Id<"brands">] : [],
        categoryIds: findCatsByName(["T-Shirts"]) as Id<"categories">[],
        genders: ["mens"], priority: 9,
      },
      {
        name: "Clearance: Chelsea Boots Manila",
        description: "25% off brown/tan Chelsea Boots at Manila — aging red-tier stock",
        promoType: "percentage", percentageValue: 25,
        branchIds: manilaBranch ? [manilaBranch._id] : [],
        brandIds: caseStudyId ? [caseStudyId as Id<"brands">] : [],
        categoryIds: findCatsForBrand(caseStudyId ?? "", ["Boots"]) as Id<"categories">[],
        colors: ["Brown", "Tan"], agingTiers: ["red"], priority: 10,
      },
      {
        name: "Cebu Selvedge Jean Promo",
        description: "10% off Selvedge Slim jeans — Cebu Branch only",
        promoType: "percentage", percentageValue: 10,
        branchIds: cebuBranch ? [cebuBranch._id] : [],
        brandIds: playboyId ? [playboyId as Id<"brands">] : [],
        categoryIds: findCatsForBrand(playboyId ?? "", ["Jeans"]) as Id<"categories">[],
        priority: 11,
      },
    ];

    const promoResults = await ctx.runMutation(internalSeed._seedPromotions, {
      userId: user._id,
      promos: promoArgs,
    });
    console.log(`Promotions: ${promoResults.length} created`);

    // ── 4. Build 60-day transactions ─────────────────────────────────────────
    console.log("Generating 60-day transactions...");
    const rng = seededRng(99);
    const now = Date.now();

    type TxnItem = {
      variantId: Id<"variants">; quantity: number;
      unitPriceCentavos: number; lineTotalCentavos: number;
    };
    type TxnRecord = {
      branchId: Id<"branches">; cashierId: Id<"users">; receiptNumber: string;
      subtotalCentavos: number; vatAmountCentavos: number;
      discountAmountCentavos: number; totalCentavos: number;
      paymentMethod: "cash" | "gcash" | "maya";
      discountType: "senior" | "pwd" | "none";
      amountTenderedCentavos?: number; changeCentavos?: number;
      promotionId?: Id<"promotions">; promoDiscountAmountCentavos?: number;
      createdAt: number; items: TxnItem[];
    };

    const allTxns: TxnRecord[] = [];
    const branchWeights = [0.5, 0.3, 0.2];
    let globalCounter = 0;

    const pickVariant = () => allVariants[Math.floor(rng() * allVariants.length)];
    const pickPayment = (): "cash" | "gcash" | "maya" => {
      const r = rng();
      if (r < 0.60) return "cash";
      if (r < 0.85) return "gcash";
      return "maya";
    };
    const pickBranch = () => {
      const r = rng();
      let cum = 0;
      for (let i = 0; i < retailBranches.length; i++) {
        cum += branchWeights[i] ?? 0.2;
        if (r < cum) return retailBranches[i];
      }
      return retailBranches[0];
    };

    for (let dayOffset = 59; dayOffset >= 0; dayOffset--) {
      const dayBase = now - dayOffset * DAY_MS;
      const isWeekend = new Date(dayBase).getDay() % 6 === 0; // Sat(6) or Sun(0)
      // More transactions on weekends
      const txnsPerDay = isWeekend
        ? 6 + Math.floor(rng() * 5)   // 6-10
        : 4 + Math.floor(rng() * 4);  // 4-7

      for (let t = 0; t < txnsPerDay; t++) {
        const branch = pickBranch();
        const hourOffset = (10 + Math.floor(rng() * 10)) * 3600 * 1000;
        const txnTime = dayBase + hourOffset;
        const payment = pickPayment();
        globalCounter++;

        const typeRoll = rng();
        const isSeniorPwd = typeRoll > 0.80;        // 20%
        const isPromo = !isSeniorPwd && typeRoll > 0.65; // 15%

        const itemCount = isSeniorPwd ? 1 + Math.floor(rng() * 2)
          : isPromo ? 1 + Math.floor(rng() * 3)
          : 1 + Math.floor(rng() * 4);

        const items: TxnItem[] = [];
        for (let i = 0; i < itemCount; i++) {
          const variant = pickVariant();
          const qty = 1 + Math.floor(rng() * 3);
          items.push({
            variantId: variant._id as Id<"variants">,
            quantity: qty,
            unitPriceCentavos: variant.priceCentavos,
            lineTotalCentavos: variant.priceCentavos * qty,
          });
        }

        const subtotal = items.reduce((s, it) => s + it.lineTotalCentavos, 0);

        if (isSeniorPwd) {
          const discType = rng() < 0.6 ? "senior" : "pwd";
          let vatExemptBase = 0;
          for (const it of items) vatExemptBase += removeVat(it.unitPriceCentavos) * it.quantity;
          const discountAmount = Math.round(vatExemptBase * 0.20);
          const total = vatExemptBase - discountAmount;
          const txn: TxnRecord = {
            branchId: branch._id,
            cashierId: user._id,
            receiptNumber: `RS-${dayOffset}-${globalCounter}`,
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
          const promoIdx = Math.floor(rng() * promoResults.length);
          const promo = promoResults[promoIdx];
          const promoArg = promoArgs[promoIdx];

          let promoDiscount = 0;
          if (promoArg.promoType === "percentage") {
            promoDiscount = Math.round(subtotal * (promoArg.percentageValue ?? 0) / 100);
            if (promoArg.maxDiscountCentavos && promoDiscount > promoArg.maxDiscountCentavos)
              promoDiscount = promoArg.maxDiscountCentavos;
          } else if (promoArg.promoType === "fixedAmount") {
            promoDiscount = Math.min(promoArg.fixedAmountCentavos ?? 0, subtotal);
          } else if (promoArg.promoType === "buyXGetY") {
            promoDiscount = Math.min(...items.map((it) => it.unitPriceCentavos));
          } else if (promoArg.promoType === "tiered") {
            if (subtotal >= (promoArg.minSpendCentavos ?? 0))
              promoDiscount = Math.min(promoArg.tieredDiscountCentavos ?? 0, subtotal);
          }

          const vat = items.reduce((s, it) => s + vatAmount(it.unitPriceCentavos) * it.quantity, 0);
          const total = subtotal - promoDiscount;
          const txn: TxnRecord = {
            branchId: branch._id,
            cashierId: user._id,
            receiptNumber: `RS-${dayOffset}-${globalCounter}`,
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
          const vat = items.reduce((s, it) => s + vatAmount(it.unitPriceCentavos) * it.quantity, 0);
          const txn: TxnRecord = {
            branchId: branch._id,
            cashierId: user._id,
            receiptNumber: `RS-${dayOffset}-${globalCounter}`,
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

    console.log(`Built ${allTxns.length} transactions, inserting...`);
    let totalTxns = 0;
    let totalItems = 0;
    const TXN_BATCH = 20;
    for (let i = 0; i < allTxns.length; i += TXN_BATCH) {
      const batch = allTxns.slice(i, i + TXN_BATCH);
      const result = await ctx.runMutation(internalSeed._seedTransactionsBatch, { transactions: batch });
      totalTxns += result.txnCount;
      totalItems += result.itemCount;
    }
    console.log(`Inserted ${totalTxns} transactions, ${totalItems} items`);

    // ── 5. Inventory batches for aging tiers ─────────────────────────────────
    console.log("Seeding inventory batches...");
    const batchVariants = allVariants.slice(0, 60);
    const invBatches: Array<{
      branchId: Id<"branches">; variantId: Id<"variants">;
      quantity: number; costPriceCentavos: number; receivedAt: number;
    }> = [];
    for (let i = 0; i < batchVariants.length; i++) {
      const v = batchVariants[i];
      const branch = retailBranches[i % retailBranches.length];
      let receivedAt: number;
      if (i < 8) {
        receivedAt = now - (200 + Math.floor(rng() * 60)) * DAY_MS; // Red: 200-260d
      } else if (i < 20) {
        receivedAt = now - (100 + Math.floor(rng() * 60)) * DAY_MS; // Yellow: 100-160d
      } else {
        receivedAt = now - (5 + Math.floor(rng() * 70)) * DAY_MS;   // Green: 5-75d
      }
      invBatches.push({
        branchId: branch._id,
        variantId: v._id as Id<"variants">,
        quantity: 10 + Math.floor(rng() * 50),
        costPriceCentavos: Math.round(v.priceCentavos * 0.5),
        receivedAt,
      });
    }
    const batchesCreated: number = await ctx.runMutation(internalSeed._seedInventoryBatches, { batches: invBatches });
    console.log(`Inventory batches: ${batchesCreated} created`);

    // ── 6. Cashier shifts (1 per day per retail branch, last 60 days) ─────────
    console.log("Seeding cashier shifts...");
    type ShiftArg = {
      branchId: Id<"branches">; cashierId: Id<"users">;
      cashFundCentavos: number; changeFundCentavos?: number;
      status: "open" | "closed";
      openedAt: number; closedAt?: number;
      closeType?: "turnover" | "endOfDay";
      closedCashBalanceCentavos?: number;
    };
    const shifts: ShiftArg[] = [];
    for (let dayOffset = 59; dayOffset >= 0; dayOffset--) {
      const dayBase = now - dayOffset * DAY_MS;
      const openTime = dayBase + 10 * 3600 * 1000; // 10am
      const closeTime = dayBase + 21 * 3600 * 1000; // 9pm
      const isToday = dayOffset === 0;

      for (const branch of retailBranches) {
        const cashFund = (5000 + Math.floor(rng() * 5000)) * 100; // P5000-P10000 in centavos
        const changeFund = (2000 + Math.floor(rng() * 2000)) * 100;
        if (isToday) {
          // Today: open shift
          shifts.push({
            branchId: branch._id,
            cashierId: user._id,
            cashFundCentavos: cashFund,
            changeFundCentavos: changeFund,
            status: "open",
            openedAt: openTime,
          });
        } else {
          // Past: closed shift
          const closedBalance = cashFund + Math.floor(rng() * 2000000); // cash + sales
          shifts.push({
            branchId: branch._id,
            cashierId: user._id,
            cashFundCentavos: cashFund,
            changeFundCentavos: changeFund,
            status: "closed",
            openedAt: openTime,
            closedAt: closeTime,
            closeType: "endOfDay",
            closedCashBalanceCentavos: closedBalance,
          });
        }
      }
    }
    const shiftsCreated: number = await ctx.runMutation(internalReset._seedCashierShifts, { shifts });
    console.log(`Cashier shifts: ${shiftsCreated} created`);

    // ── 7. Transfers (warehouse → retail branches) ────────────────────────────
    if (warehouse) {
      console.log("Seeding transfers...");
      const transferVariants = allVariants.slice(0, 40);

      type TxfrArg = {
        fromBranchId: Id<"branches">; toBranchId: Id<"branches">;
        requestedById: Id<"users">; status: "requested" | "approved" | "packed" | "inTransit" | "delivered";
        notes?: string; createdAt: number;
        approvedAt?: number; approvedById?: Id<"users">;
        packedAt?: number; shippedAt?: number; deliveredAt?: number;
        items: { variantId: Id<"variants">; requestedQuantity: number; packedQuantity?: number; receivedQuantity?: number; }[];
      };

      const transfers: TxfrArg[] = [];

      // Helper to pick items for a transfer
      const pickItems = (count: number, packed: boolean, received: boolean) => {
        const items = [];
        for (let i = 0; i < count; i++) {
          const v = transferVariants[Math.floor(rng() * transferVariants.length)];
          const qty = 5 + Math.floor(rng() * 20);
          items.push({
            variantId: v._id as Id<"variants">,
            requestedQuantity: qty,
            packedQuantity: packed ? qty : undefined,
            receivedQuantity: received ? qty : undefined,
          });
        }
        return items;
      };

      // Delivered transfers (2 per retail branch, spread over last 60 days)
      for (const branch of retailBranches) {
        for (let t = 0; t < 4; t++) {
          const daysAgo = 15 + Math.floor(rng() * 40);
          const createdAt = now - daysAgo * DAY_MS;
          transfers.push({
            fromBranchId: warehouse._id,
            toBranchId: branch._id,
            requestedById: user._id,
            status: "delivered",
            notes: `Restocking batch ${t + 1}`,
            createdAt,
            approvedAt: createdAt + 2 * 3600 * 1000,
            approvedById: user._id,
            packedAt: createdAt + 6 * 3600 * 1000,
            shippedAt: createdAt + 24 * 3600 * 1000,
            deliveredAt: createdAt + (2 + Math.floor(rng() * 3)) * DAY_MS,
            items: pickItems(3 + Math.floor(rng() * 5), true, true),
          });
        }
      }

      // In-transit transfers
      for (const branch of retailBranches) {
        const createdAt = now - (3 + Math.floor(rng() * 5)) * DAY_MS;
        transfers.push({
          fromBranchId: warehouse._id,
          toBranchId: branch._id,
          requestedById: user._id,
          status: "inTransit",
          createdAt,
          approvedAt: createdAt + 3600 * 1000,
          approvedById: user._id,
          packedAt: createdAt + 4 * 3600 * 1000,
          shippedAt: createdAt + DAY_MS,
          items: pickItems(2 + Math.floor(rng() * 4), true, false),
        });
      }

      // Pending/approved transfers
      for (const branch of retailBranches) {
        transfers.push({
          fromBranchId: warehouse._id,
          toBranchId: branch._id,
          requestedById: user._id,
          status: "approved",
          createdAt: now - 2 * DAY_MS,
          approvedAt: now - DAY_MS,
          approvedById: user._id,
          items: pickItems(2 + Math.floor(rng() * 3), false, false),
        });
        transfers.push({
          fromBranchId: warehouse._id,
          toBranchId: branch._id,
          requestedById: user._id,
          status: "requested",
          createdAt: now - 12 * 3600 * 1000,
          items: pickItems(2 + Math.floor(rng() * 3), false, false),
        });
      }

      const txfrResult = await ctx.runMutation(internalReset._seedTransfersData, { transfers });
      console.log(`Transfers: ${txfrResult.txfrCount} created, ${txfrResult.itemCount} items`);

      // ── 8. Cross-sell events ────────────────────────────────────────────────
      console.log("Seeding cross-sell events...");
      type CrossSellArg = {
        branchId: Id<"branches">; suggestedVariantId: Id<"variants">;
        cartVariantIds: Id<"variants">[]; priceCentavos: number; createdAt: number;
      };
      const crossSellEvents: CrossSellArg[] = [];
      for (let i = 0; i < 120; i++) {
        const branch = retailBranches[Math.floor(rng() * retailBranches.length)];
        const suggested = allVariants[Math.floor(rng() * allVariants.length)];
        const cartCount = 1 + Math.floor(rng() * 3);
        const cartVids: Id<"variants">[] = [];
        for (let j = 0; j < cartCount; j++) {
          cartVids.push(allVariants[Math.floor(rng() * allVariants.length)]._id as Id<"variants">);
        }
        crossSellEvents.push({
          branchId: branch._id,
          suggestedVariantId: suggested._id as Id<"variants">,
          cartVariantIds: cartVids,
          priceCentavos: suggested.priceCentavos,
          createdAt: now - Math.floor(rng() * 60) * DAY_MS,
        });
      }
      const csCreated: number = await ctx.runMutation(internalReset._seedCrossellEvents, { events: crossSellEvents });
      console.log(`Cross-sell events: ${csCreated} created`);

      console.log("=== Rich Reseed: Complete ===");
      return {
        cleared, promotions: promoResults.length,
        transactions: totalTxns, transactionItems: totalItems,
        inventoryBatches: batchesCreated, cashierShifts: shiftsCreated,
        transfers: (txfrResult as { txfrCount: number }).txfrCount,
        transferItems: (txfrResult as { itemCount: number }).itemCount,
        crossSellEvents: csCreated,
      };
    }

    console.log("=== Rich Reseed: Complete (no warehouse branch found) ===");
    return {
      cleared, promotions: promoResults.length,
      transactions: totalTxns, transactionItems: totalItems,
      inventoryBatches: batchesCreated, cashierShifts: shiftsCreated,
      transfers: 0, transferItems: 0, crossSellEvents: 0,
    };
  },
});

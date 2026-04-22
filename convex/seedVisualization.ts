// convex/seedVisualization.ts
//
// Seeds dashboard-ready demo data so admin pages show realistic visuals:
//   • /admin/settings          — orgMonthlyTargetCentavos set
//   • /admin/catalog           — brands have parLevel
//   • /admin/dashboard         — metric cards, SOH graph, sales graph, store ranking
//   • /admin/reports           — KPI cards, People Performance, Against LY, Movements
//   • /admin/sell-through      — Current Period + Lifecycle (12-week)
//   • /admin/reports/movers    — Velocity classification
//
// Usage (Convex CLI):
//   npx convex run seedVisualization:seedDashboardVisualization
//
// Idempotent-ish: resets transactions/inventoryBatches before re-seeding.
// Requires: seedDatabase already executed (branches + catalog + variants must exist).

import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// ─── Constants ───────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;

// ─── Deterministic RNG (seeded LCG) ──────────────────────────────────────────

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ─── Tax helpers (match seed.ts semantics) ────────────────────────────────────

function removeVat(priceCentavos: number): number {
  return Math.round(priceCentavos / 1.12);
}
function vatAmount(priceCentavos: number): number {
  return priceCentavos - removeVat(priceCentavos);
}
function roundUpTender(total: number): number {
  return Math.ceil(total / 2000) * 2000;
}

// ─── Internal mutations ──────────────────────────────────────────────────────

export const _setOrgMonthlyTarget = internalMutation({
  args: { pesos: v.number() },
  handler: async (ctx, args) => {
    const centavos = Math.max(0, Math.round(args.pesos * 100));
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "orgMonthlyTargetCentavos"))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value: String(centavos), updatedAt: Date.now() });
    } else {
      await ctx.db.insert("settings", {
        key: "orgMonthlyTargetCentavos",
        value: String(centavos),
        updatedAt: Date.now(),
      });
    }
    return centavos;
  },
});

export const _setAllBrandParLevels = internalMutation({
  args: { defaultPar: v.number() },
  handler: async (ctx, args) => {
    const brands = await ctx.db.query("brands").collect();
    let patched = 0;
    for (const b of brands) {
      if (!b.isActive) continue;
      await ctx.db.patch(b._id, { parLevel: args.defaultPar, updatedAt: Date.now() });
      patched++;
    }
    return patched;
  },
});

export const _ensureDemoCashiers = internalMutation({
  args: { targetCount: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "cashier"))
      .collect();
    const active = existing.filter((u) => u.isActive);
    const needed = Math.max(0, args.targetCount - active.length);

    const firstNames = ["Maria", "Jose", "Ana", "Carlos", "Sofia", "Juan", "Luisa", "Pedro"];
    const lastNames = ["Santos", "Reyes", "Cruz", "Gonzales", "Bautista", "Ramos", "Lopez", "Torres"];

    const nowTs = Date.now();
    const created: Id<"users">[] = [];
    for (let i = 0; i < needed; i++) {
      const fn = firstNames[(active.length + i) % firstNames.length];
      const ln = lastNames[Math.floor((active.length + i) / firstNames.length) % lastNames.length];
      const name = `${fn} ${ln}`;
      const email = `seed-cashier-${nowTs}-${i}@example.com`;
      const id = await ctx.db.insert("users", {
        clerkId: `seed-cashier-${nowTs}-${i}`,
        email,
        name,
        role: "cashier",
        isActive: true,
        createdAt: nowTs,
        updatedAt: nowTs,
      });
      created.push(id);
    }

    const all = [...active, ...(await Promise.all(created.map((id) => ctx.db.get(id))))]
      .filter((u): u is NonNullable<typeof u> => u !== null);
    return all.map((u) => ({ _id: u._id, name: u.name }));
  },
});

export const _wipeInventoryBatchesOnly = internalMutation({
  args: {},
  handler: async (ctx) => {
    const batches = await ctx.db.query("inventoryBatches").collect();
    let deleted = 0;
    for (const b of batches) {
      await ctx.db.delete(b._id);
      deleted++;
    }
    return deleted;
  },
});

/** Delete today's snapshots so they regenerate with fresh transaction/inventory data. */
export const _wipeTodaySnapshots = internalMutation({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    let deleted = 0;
    const branchSnaps = await ctx.db
      .query("branchDailySnapshots")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();
    for (const s of branchSnaps) {
      await ctx.db.delete(s._id);
      deleted++;
    }
    const variantSnaps = await ctx.db
      .query("variantDailySnapshots")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();
    for (const s of variantSnaps) {
      await ctx.db.delete(s._id);
      deleted++;
    }
    return deleted;
  },
});

// ─── Internal queries ─────────────────────────────────────────────────────────

export const _getBranchesWithChannels = internalQuery({
  args: {},
  handler: async (ctx) => {
    const branches = await ctx.db.query("branches").collect();
    return branches
      .filter((b) => b.isActive)
      .map((b) => ({
        _id: b._id,
        name: b.name,
        channel: b.channel ?? null,
      }));
  },
});

// ─── Orchestrator action ──────────────────────────────────────────────────────

export const seedDashboardVisualization = action({
  args: {
    monthlyTargetPesos: v.optional(v.number()), // default 4_000_000
    defaultParLevel: v.optional(v.number()),     // default 500
    cashierCount: v.optional(v.number()),         // default 4
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    monthlyTargetCentavos: number;
    brandsWithPar: number;
    cashiers: number;
    transactions: number;
    lifecycleTransactions: number;
    transactionItems: number;
    inventoryBatches: number;
    lastYearTransactions: number;
    branchSnapshots: number;
    variantSnapshots: number;
    lifecycleAssignments: { fast: number; mid: number; slow: number };
  }> => {
    const monthlyTargetPesos = args.monthlyTargetPesos ?? 4_000_000;
    const defaultParLevel = args.defaultParLevel ?? 500;
    const cashierCount = args.cashierCount ?? 4;

    console.log("=== Dashboard Visualization Seed: Starting ===");

    // 1. Org monthly target
    const monthlyTargetCentavos = await ctx.runMutation(
      internal.seedVisualization._setOrgMonthlyTarget,
      { pesos: monthlyTargetPesos },
    );
    console.log(`Monthly target: ₱${monthlyTargetPesos.toLocaleString()} (${monthlyTargetCentavos} centavos)`);

    // 2. PAR levels on all active brands
    const brandsWithPar = await ctx.runMutation(
      internal.seedVisualization._setAllBrandParLevels,
      { defaultPar: defaultParLevel },
    );
    console.log(`PAR level ${defaultParLevel} set on ${brandsWithPar} brands`);

    // 3. Demo cashiers (so People Performance has multiple rows)
    const cashiers = await ctx.runMutation(
      internal.seedVisualization._ensureDemoCashiers,
      { targetCount: cashierCount },
    );
    console.log(`Active cashiers: ${cashiers.length}`);
    if (cashiers.length === 0) throw new Error("Failed to ensure demo cashiers");

    // 4. Reset current transactions + inventory batches so we can re-seed cleanly
    let wipedTxns = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const wiped = await ctx.runMutation(internal.seed._wipeTransactions);
      wipedTxns += wiped;
      if (wiped === 0) break;
    }
    const wipedBatches = await ctx.runMutation(
      internal.seedVisualization._wipeInventoryBatchesOnly,
    );
    console.log(`Wiped ${wipedTxns} txns, ${wipedBatches} inventory batches`);

    // 5. Fetch catalog + branches
    type BranchRow = { _id: Id<"branches">; name: string; channel: string | null };
    const branches: BranchRow[] = await ctx.runQuery(
      internal.seedVisualization._getBranchesWithChannels,
    );
    if (branches.length === 0) {
      throw new Error(
        "No active branches in the database. Run `npx convex run seed:seedDatabase` first to seed branches + catalog.",
      );
    }
    let retailBranches = branches.filter((b: BranchRow) => b.channel !== "warehouse");
    if (retailBranches.length === 0) {
      console.log(
        `No retail branches (only warehouse). Falling back to all ${branches.length} active branches.`,
      );
      retailBranches = branches;
    }
    const outletBranches = retailBranches.filter((b: BranchRow) => b.channel === "outlet");
    console.log(
      `Branches: ${retailBranches.length} retail (${outletBranches.length} outlet) of ${branches.length} active`,
    );

    const allVariants = await ctx.runQuery(internal.seed._getVariantsWithHierarchy, { limit: 200 });
    if (allVariants.length < 20) throw new Error("Need at least 20 variants. Run seedDatabase first.");

    // 6. Compute date anchors in PHT
    const now = Date.now();
    const phtNow = new Date(now + PHT_OFFSET_MS);
    const phtYear = phtNow.getUTCFullYear();
    const phtMonth = phtNow.getUTCMonth();
    const phtToday = phtNow.getUTCDate();
    const monthStartMs = Date.UTC(phtYear, phtMonth, 1) - PHT_OFFSET_MS;

    // 7. Generate inventory batches for Lifecycle analysis (spread across 12 weeks)
    // Pick variants spanning the full pool (every Nth) so both brands are represented.
    console.log("Building lifecycle inventory batches (12 weeks)...");
    const rng = seededRng(20260421);
    const lifecycleCount = Math.min(40, allVariants.length);
    const stride = Math.max(1, Math.floor(allVariants.length / lifecycleCount));
    const lifecycleVariants = Array.from({ length: lifecycleCount }, (_, i) => allVariants[i * stride]).filter(Boolean);

    // Per-variant lifecycle assignment so we can deterministically generate sell-through later.
    type LifecycleAssignment = {
      variant: typeof allVariants[number];
      weekIndex: number;       // 3, 6, 9, or 12 (the wave's WK marker)
      receivedAt: number;       // earliest receivedAt across this variant's batches
      branches: BranchRow[];    // which branches received it
      totalReceived: number;    // sum of quantities across branches
      bucket: "fast" | "mid" | "slow";
    };
    const assignments: LifecycleAssignment[] = [];

    const invBatches: Array<{
      branchId: Id<"branches">;
      variantId: Id<"variants">;
      quantity: number;
      costPriceCentavos: number;
      receivedAt: number;
    }> = [];

    // 4 waves of 10 variants each, ages WK 12, 9, 6, 3 (oldest → newest).
    // Within each wave, rotate Fast/Mid/Slow so all 3 buckets appear at every WK.
    const waves = 4;
    const waveSize = Math.ceil(lifecycleCount / waves);
    const buckets: Array<"fast" | "mid" | "slow"> = ["fast", "mid", "slow"];
    for (let w = 0; w < waves; w++) {
      const weekIndex = 12 - w * 3; // 12, 9, 6, 3
      const weeksAgoMs = now - weekIndex * WEEK_MS + Math.floor(rng() * DAY_MS);
      const waveVariants = lifecycleVariants.slice(w * waveSize, (w + 1) * waveSize);
      for (let i = 0; i < waveVariants.length; i++) {
        const vr = waveVariants[i];
        const bucket = buckets[i % 3];
        // Seed to 1-3 branches
        const branchCount = 1 + Math.floor(rng() * 3);
        const shuffled = [...retailBranches].sort(() => rng() - 0.5).slice(0, branchCount);
        let totalReceived = 0;
        for (const br of shuffled) {
          const qty = 20 + Math.floor(rng() * 30);
          totalReceived += qty;
          invBatches.push({
            branchId: br._id as Id<"branches">,
            variantId: vr._id as Id<"variants">,
            quantity: qty,
            costPriceCentavos: Math.round(vr.priceCentavos * 0.5),
            receivedAt: weeksAgoMs + Math.floor(rng() * DAY_MS),
          });
        }
        assignments.push({
          variant: vr,
          weekIndex,
          receivedAt: weeksAgoMs,
          branches: shuffled,
          totalReceived,
          bucket,
        });
      }
    }

    // Also add some aging batches (200+ days) so the aging analysis has data
    for (let i = 0; i < 8; i++) {
      const vr = allVariants[(i * 7) % allVariants.length];
      const br = retailBranches[i % retailBranches.length];
      invBatches.push({
        branchId: br._id as Id<"branches">,
        variantId: vr._id as Id<"variants">,
        quantity: 15 + Math.floor(rng() * 25),
        costPriceCentavos: Math.round(vr.priceCentavos * 0.5),
        receivedAt: now - (200 + Math.floor(rng() * 80)) * DAY_MS,
      });
    }

    const invBatchesCreated = await ctx.runMutation(internal.seed._seedInventoryBatches, {
      batches: invBatches,
    });
    console.log(`Inserted ${invBatchesCreated} inventory batches`);

    // 7b. Generate per-variant lifecycle transactions to hit each variant's
    //     assigned Fast/Mid/Slow bucket. Each line item moves units within the
    //     variant's [receivedAt, now] window — ensuring the lifecycle table shows
    //     a clear distribution across all three classifications.
    console.log("Building lifecycle sell-through transactions...");
    // Threshold table (must match getLifecycleMovers in convex/dashboards/productMovers.ts).
    const LC_THRESHOLDS: Array<{ fast: number; slow: number }> = [
      { fast: 0, slow: 0 },     // idx 0 unused
      { fast: 5, slow: 3 },     // WK 1
      { fast: 10, slow: 7 },    // WK 2
      { fast: 15, slow: 10 },   // WK 3
      { fast: 20, slow: 13 },   // WK 4
      { fast: 25, slow: 17 },   // WK 5
      { fast: 30, slow: 20 },   // WK 6
      { fast: 35, slow: 23 },   // WK 7
      { fast: 40, slow: 27 },   // WK 8
      { fast: 45, slow: 30 },   // WK 9
      { fast: 50, slow: 33 },   // WK 10
      { fast: 55, slow: 37 },   // WK 11
      { fast: 60, slow: 40 },   // WK 12
    ];
    function targetSellThruPct(weekIndex: number, bucket: "fast" | "mid" | "slow"): number {
      const wk = Math.max(1, Math.min(12, weekIndex));
      const { fast, slow } = LC_THRESHOLDS[wk];
      if (bucket === "fast") return Math.min(95, fast + 8);     // safely above fast threshold
      if (bucket === "mid") return Math.round((fast + slow) / 2); // squarely between
      return Math.max(0, slow - 2);                              // safely below slow
    }

    const lifecycleTxns: TxnRecord[] = [];
    let lcCounter = 0;
    for (const a of assignments) {
      const targetPct = targetSellThruPct(a.weekIndex, a.bucket);
      const unitsToSell = Math.round((a.totalReceived * targetPct) / 100);
      if (unitsToSell <= 0) continue;

      const windowMs = Math.max(DAY_MS, now - a.receivedAt);
      // Spread units across multiple txns: 1-3 units per txn.
      let remaining = unitsToSell;
      while (remaining > 0) {
        lcCounter++;
        const qty = Math.min(remaining, 1 + Math.floor(rng() * 3));
        remaining -= qty;
        const branch = a.branches[Math.floor(rng() * a.branches.length)];
        const cashier = cashiers[Math.floor(rng() * cashiers.length)];
        const createdAt = a.receivedAt + Math.floor(rng() * windowMs);
        const unit = a.variant.priceCentavos;
        const line = unit * qty;
        const vat = vatAmount(unit) * qty;
        const txn: TxnRecord = {
          branchId: branch._id as Id<"branches">,
          cashierId: cashier._id,
          receiptNumber: `DEMO-LC-${lcCounter.toString().padStart(5, "0")}`,
          subtotalCentavos: line,
          vatAmountCentavos: vat,
          discountAmountCentavos: 0,
          totalCentavos: line,
          paymentMethod: "cash",
          discountType: "none",
          createdAt,
          items: [
            {
              variantId: a.variant._id as Id<"variants">,
              quantity: qty,
              unitPriceCentavos: unit,
              lineTotalCentavos: line,
            },
          ],
        };
        txn.amountTenderedCentavos = roundUpTender(line);
        txn.changeCentavos = txn.amountTenderedCentavos - line;
        lifecycleTxns.push(txn);
      }
    }
    const lcSummary = {
      fast: assignments.filter((a) => a.bucket === "fast").length,
      mid: assignments.filter((a) => a.bucket === "mid").length,
      slow: assignments.filter((a) => a.bucket === "slow").length,
    };
    console.log(
      `Lifecycle: ${assignments.length} variants assigned (${lcSummary.fast} Fast, ${lcSummary.mid} Mid, ${lcSummary.slow} Slow) → ${lifecycleTxns.length} txns`,
    );

    // 8. Generate transactions for CURRENT month (~75% of target so Sales card reads healthily)
    // Target sales: monthlyTarget × 0.75, spread across retail branches & cashiers
    console.log("Building current-month transactions...");
    const targetSalesCurrent = Math.round(monthlyTargetPesos * 0.75 * 100); // centavos
    const currentTxns = buildTransactionSet({
      retailBranches: retailBranches.map((b: BranchRow) => ({ _id: b._id, channel: b.channel })),
      outletBranches: outletBranches.map((b: BranchRow) => ({ _id: b._id })),
      cashiers,
      variants: allVariants,
      rangeStartMs: monthStartMs,
      rangeEndMs: now,
      targetRevenueCentavos: targetSalesCurrent,
      receiptPrefix: "DEMO-CUR",
      rng,
      outletShareTarget: 0.22, // ~22% of sales from outlet → Liquidation Rate card visible
    });

    // 9. Generate LAST YEAR same-period transactions (~90% of this year for positive LY comparison)
    console.log("Building last-year transactions...");
    const lyMonthStartMs = Date.UTC(phtYear - 1, phtMonth, 1) - PHT_OFFSET_MS;
    const lyNowMs = lyMonthStartMs + (now - monthStartMs);
    const targetSalesLastYear = Math.round(monthlyTargetPesos * 0.68 * 100);
    const lastYearTxns = buildTransactionSet({
      retailBranches: retailBranches.map((b: BranchRow) => ({ _id: b._id, channel: b.channel })),
      outletBranches: outletBranches.map((b: BranchRow) => ({ _id: b._id })),
      cashiers,
      variants: allVariants,
      rangeStartMs: lyMonthStartMs,
      rangeEndMs: lyNowMs,
      targetRevenueCentavos: targetSalesLastYear,
      receiptPrefix: "DEMO-LY",
      rng,
      outletShareTarget: 0.20,
    });

    // 10. Insert both sets in batches
    const allTxns = [...lifecycleTxns, ...currentTxns, ...lastYearTxns];
    const TXN_BATCH = 25;
    let totalTxns = 0;
    let totalItems = 0;
    for (let i = 0; i < allTxns.length; i += TXN_BATCH) {
      const batch = allTxns.slice(i, i + TXN_BATCH);
      const result = await ctx.runMutation(internal.seed._seedTransactionsBatch, {
        transactions: batch,
      });
      totalTxns += result.txnCount;
      totalItems += result.itemCount;
    }
    console.log(`Inserted ${totalTxns} total txns (${currentTxns.length} current + ${lastYearTxns.length} last-year), ${totalItems} items`);

    // 11. Generate today's snapshots so Sell-Through (Current Period), Lifecycle, and
    //     Product Movers (Velocity) views all have data to read.
    console.log("Generating today's snapshots (branch + variant)...");
    const todayDate: string = await ctx.runQuery(
      internal.seedVisualization._getTodayPHTDate,
    );
    // Wipe today's snapshots first so they're regenerated against the fresh seed data
    const wipedSnaps = await ctx.runMutation(
      internal.seedVisualization._wipeTodaySnapshots,
      { date: todayDate },
    );
    if (wipedSnaps > 0) console.log(`Wiped ${wipedSnaps} stale snapshots for ${todayDate}`);

    // Branch snapshots (chunks of 20)
    const branchIdsForSnap: Id<"branches">[] = branches.map((b: BranchRow) => b._id);
    let branchSnapshotCount = 0;
    const BRANCH_SNAP_CHUNK = 20;
    for (let i = 0; i < branchIdsForSnap.length; i += BRANCH_SNAP_CHUNK) {
      const chunk = branchIdsForSnap.slice(i, i + BRANCH_SNAP_CHUNK);
      await ctx.runMutation(internal.snapshots.generate._generateBranchChunk, {
        branchIds: chunk,
        date: todayDate,
      });
      branchSnapshotCount += chunk.length;
    }

    // Variant snapshots — paginate through all active variants (chunks of 500)
    let variantSnapshotCount = 0;
    let cursor: string | null = null;
    const VARIANT_SNAP_CHUNK = 500;
    while (true) {
      const page: { variants: Id<"variants">[]; nextCursor: string | null } = await ctx.runQuery(
        internal.snapshots.generate._getVariantIds,
        { limit: VARIANT_SNAP_CHUNK, ...(cursor ? { cursor } : {}) },
      );
      if (page.variants.length === 0) break;
      await ctx.runMutation(internal.snapshots.generate._generateVariantChunk, {
        variantIds: page.variants,
        date: todayDate,
      });
      variantSnapshotCount += page.variants.length;
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    console.log(`Generated ${branchSnapshotCount} branch + ${variantSnapshotCount} variant snapshots`);

    console.log("=== Dashboard Visualization Seed: Done ===");
    return {
      monthlyTargetCentavos,
      brandsWithPar,
      cashiers: cashiers.length,
      transactions: currentTxns.length,
      lifecycleTransactions: lifecycleTxns.length,
      transactionItems: totalItems,
      inventoryBatches: invBatchesCreated,
      lastYearTransactions: lastYearTxns.length,
      branchSnapshots: branchSnapshotCount,
      variantSnapshots: variantSnapshotCount,
      lifecycleAssignments: lcSummary,
    };
  },
});

// Helper query exposed for action use (today's PHT date)
export const _getTodayPHTDate = internalQuery({
  args: {},
  handler: async () => {
    const PHT = 8 * 60 * 60 * 1000;
    const d = new Date(Date.now() + PHT);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  },
});

// ─── Transaction builder ──────────────────────────────────────────────────────

type VariantInfo = {
  _id: string;
  sku: string;
  priceCentavos: number;
};

type BranchInfo = {
  _id: Id<"branches">;
  channel?: string | null;
};

type CashierInfo = {
  _id: Id<"users">;
  name: string;
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
  createdAt: number;
  items: Array<{
    variantId: Id<"variants">;
    quantity: number;
    unitPriceCentavos: number;
    lineTotalCentavos: number;
  }>;
};

function buildTransactionSet(opts: {
  retailBranches: BranchInfo[];
  outletBranches: BranchInfo[];
  cashiers: CashierInfo[];
  variants: VariantInfo[];
  rangeStartMs: number;
  rangeEndMs: number;
  targetRevenueCentavos: number;
  receiptPrefix: string;
  rng: () => number;
  outletShareTarget: number;
}): TxnRecord[] {
  const {
    retailBranches, outletBranches, cashiers, variants,
    rangeStartMs, rangeEndMs, targetRevenueCentavos, receiptPrefix, rng, outletShareTarget,
  } = opts;

  const rangeMs = Math.max(1, rangeEndMs - rangeStartMs);
  const txns: TxnRecord[] = [];
  const paymentMethods: TxnRecord["paymentMethod"][] = ["cash", "cash", "gcash", "maya"]; // cash heavy

  let accumulated = 0;
  let counter = 0;
  let outletAccumulated = 0;

  while (accumulated < targetRevenueCentavos && counter < 5000) {
    counter++;
    const receiptNumber = `${receiptPrefix}-${counter.toString().padStart(5, "0")}`;
    const payment = paymentMethods[Math.floor(rng() * paymentMethods.length)];
    const createdAt = rangeStartMs + Math.floor(rng() * rangeMs);

    // Pick branch — bias toward outlet until we hit outletShareTarget
    const wantOutlet =
      outletBranches.length > 0 &&
      accumulated > 0 &&
      outletAccumulated / accumulated < outletShareTarget;
    const branch = wantOutlet
      ? outletBranches[Math.floor(rng() * outletBranches.length)]
      : retailBranches[Math.floor(rng() * retailBranches.length)];

    const cashier = cashiers[Math.floor(rng() * cashiers.length)];

    // 1-4 line items per txn
    const itemCount = 1 + Math.floor(rng() * 4);
    const items: TxnRecord["items"] = [];
    let subtotal = 0;
    let vatSum = 0;

    for (let i = 0; i < itemCount; i++) {
      const vr = variants[Math.floor(rng() * variants.length)];
      const qty = 1 + Math.floor(rng() * 2);
      const unit = vr.priceCentavos;
      const line = unit * qty;
      items.push({
        variantId: vr._id as Id<"variants">,
        quantity: qty,
        unitPriceCentavos: unit,
        lineTotalCentavos: line,
      });
      subtotal += line;
      vatSum += vatAmount(unit) * qty;
    }

    const total = subtotal;
    const txn: TxnRecord = {
      branchId: branch._id,
      cashierId: cashier._id,
      receiptNumber,
      subtotalCentavos: subtotal,
      vatAmountCentavos: vatSum,
      discountAmountCentavos: 0,
      totalCentavos: total,
      paymentMethod: payment,
      discountType: "none",
      createdAt,
      items,
    };
    if (payment === "cash") {
      txn.amountTenderedCentavos = roundUpTender(total);
      txn.changeCentavos = txn.amountTenderedCentavos - total;
    }
    txns.push(txn);

    accumulated += total;
    if (branch.channel === "outlet") outletAccumulated += total;
  }

  return txns;
}

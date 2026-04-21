import { v, ConvexError } from "convex/values";
import { query, mutation } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { withBranchScope } from "../_helpers/withBranchScope";
import { _logAuditEntry } from "../_helpers/auditLog";

// ─── Classification Thresholds ──────────────────────────────────────────────

const FAST_THRESHOLD = 70; // >= 70% sell-through
const MID_THRESHOLD = 30;  // >= 30% sell-through

type Classification = "fast" | "mid" | "slow" | "dead";

function classifySellThrough(sellThruPct: number, hasSales: boolean): Classification {
  if (!hasSales) return "dead";
  if (sellThruPct >= FAST_THRESHOLD) return "fast";
  if (sellThruPct >= MID_THRESHOLD) return "mid";
  return "slow";
}

// ─── Shared aggregation logic ───────────────────────────────────────────────

async function computeSellThrough(
  ctx: { db: any; storage?: any },
  args: { periodDays: number; branchId?: Id<"branches"> }
) {
  const now = Date.now();
  const periodStart = now - args.periodDays * 86_400_000;

  // Fetch branches
  const allBranches: Doc<"branches">[] = await ctx.db.query("branches").collect();
  const activeBranches = allBranches.filter((b: Doc<"branches">) => b.isActive);
  const targetBranches = args.branchId
    ? activeBranches.filter((b: Doc<"branches">) => b._id === args.branchId)
    : activeBranches;

  if (targetBranches.length === 0) return { styles: [], branches: activeBranches };

  // Fetch transactions in period for target branches
  const allTxnArrays = await Promise.all(
    targetBranches.map((branch: Doc<"branches">) =>
      ctx.db
        .query("transactions")
        .withIndex("by_branch_date", (q: any) =>
          q.eq("branchId", branch._id).gte("createdAt", periodStart)
        )
        .collect()
    )
  );

  // Build variantId → { branchId → soldQty }
  const variantBranchSold = new Map<string, Map<string, number>>();

  for (let bi = 0; bi < targetBranches.length; bi++) {
    const branchId = String(targetBranches[bi]._id);
    for (const txn of allTxnArrays[bi]) {
      const items: Doc<"transactionItems">[] = await ctx.db
        .query("transactionItems")
        .withIndex("by_transaction", (q: any) => q.eq("transactionId", txn._id))
        .collect();
      for (const item of items) {
        const vid = String(item.variantId);
        if (!variantBranchSold.has(vid)) variantBranchSold.set(vid, new Map());
        const bMap = variantBranchSold.get(vid)!;
        bMap.set(branchId, (bMap.get(branchId) ?? 0) + item.quantity);
      }
    }
  }

  // Fetch current inventory for target branches
  const allInventoryArrays = await Promise.all(
    targetBranches.map((branch: Doc<"branches">) =>
      ctx.db
        .query("inventory")
        .withIndex("by_branch", (q: any) => q.eq("branchId", branch._id))
        .collect()
    )
  );

  // Build variantId → { branchId → currentStock }
  const variantBranchStock = new Map<string, Map<string, number>>();
  for (let bi = 0; bi < targetBranches.length; bi++) {
    const branchId = String(targetBranches[bi]._id);
    for (const inv of allInventoryArrays[bi]) {
      const vid = String(inv.variantId);
      if (!variantBranchStock.has(vid)) variantBranchStock.set(vid, new Map());
      variantBranchStock.get(vid)!.set(branchId, inv.quantity);
    }
  }

  // Union of all variant IDs
  const allVariantIds = new Set<string>();
  for (const vid of variantBranchSold.keys()) allVariantIds.add(vid);
  for (const vid of variantBranchStock.keys()) allVariantIds.add(vid);

  // Group by styleId
  const variantDocs = await Promise.all(
    [...allVariantIds].map((vid) => ctx.db.get(vid as Id<"variants">))
  );
  const variantMap = new Map<string, Doc<"variants">>();
  const styleVariants = new Map<string, string[]>(); // styleId → variantIds
  for (let i = 0; i < variantDocs.length; i++) {
    const doc = variantDocs[i];
    if (!doc) continue;
    const vid = [...allVariantIds][i];
    variantMap.set(vid, doc);
    const sid = String(doc.styleId);
    if (!styleVariants.has(sid)) styleVariants.set(sid, []);
    styleVariants.get(sid)!.push(vid);
  }

  // Compute per-style sell-through
  const styleEntries: {
    styleId: string;
    beg: number;
    soh: number;
    sold: number;
    sellThruPct: number;
    classification: Classification;
    avgAgeDays: number;
    oldestAgeDays: number;
    agingTier: "green" | "yellow" | "red";
    branchBreakdown: {
      branchId: string;
      beg: number;
      soh: number;
      sold: number;
      sellThruPct: number;
      classification: Classification;
    }[];
  }[] = [];

  for (const [styleId, variantIds] of styleVariants) {
    let totalSold = 0;
    let totalSOH = 0;

    // Per-branch breakdown for this style
    const branchMap = new Map<string, { sold: number; soh: number }>();

    for (const vid of variantIds) {
      const soldByBranch = variantBranchSold.get(vid) ?? new Map();
      const stockByBranch = variantBranchStock.get(vid) ?? new Map();

      for (const [bid, qty] of soldByBranch) {
        totalSold += qty;
        if (!branchMap.has(bid)) branchMap.set(bid, { sold: 0, soh: 0 });
        branchMap.get(bid)!.sold += qty;
      }
      for (const [bid, qty] of stockByBranch) {
        totalSOH += qty;
        if (!branchMap.has(bid)) branchMap.set(bid, { sold: 0, soh: 0 });
        branchMap.get(bid)!.soh += qty;
      }
    }

    // BEG = SOH + SOLD (beginning balance = what you have now + what you sold)
    const totalBeg = totalSOH + totalSold;
    const sellThruPct = totalBeg > 0 ? Math.round((totalSold / totalBeg) * 100) : 0;
    const classification = classifySellThrough(sellThruPct, totalSold > 0);

    // Branch breakdown
    const branchBreakdown = [...branchMap.entries()]
      .map(([bid, data]) => {
        const beg = data.soh + data.sold;
        const pct = beg > 0 ? Math.round((data.sold / beg) * 100) : 0;
        return {
          branchId: bid,
          beg,
          soh: data.soh,
          sold: data.sold,
          sellThruPct: pct,
          classification: classifySellThrough(pct, data.sold > 0),
        };
      })
      .sort((a, b) => b.sellThruPct - a.sellThruPct); // best first

    if (totalBeg > 0 || totalSold > 0) {
      styleEntries.push({
        styleId,
        beg: totalBeg,
        soh: totalSOH,
        sold: totalSold,
        sellThruPct,
        classification,
        avgAgeDays: 0,
        oldestAgeDays: 0,
        agingTier: "green",
        branchBreakdown,
      });
    }
  }

  // ── Aging: fetch inventoryBatches for target branches and compute per-style weighted avg age ──
  const allBatchArrays = await Promise.all(
    targetBranches.map((branch: Doc<"branches">) =>
      ctx.db
        .query("inventoryBatches")
        .withIndex("by_branch_variant", (q: any) => q.eq("branchId", branch._id))
        .collect()
    )
  );

  const now2 = Date.now();
  // variantId → { totalQty, weightedAgeDaysSum, oldestAgeDays, greenQty, yellowQty, redQty }
  const variantAgingMap = new Map<string, {
    totalQty: number; weightedSum: number; oldestDays: number;
    greenQty: number; yellowQty: number; redQty: number;
  }>();

  for (const batches of allBatchArrays) {
    for (const batch of batches) {
      if (batch.quantity <= 0) continue;
      const vid = String(batch.variantId);
      const ageDays = Math.floor((now2 - batch.receivedAt) / 86_400_000);
      let entry = variantAgingMap.get(vid);
      if (!entry) {
        entry = { totalQty: 0, weightedSum: 0, oldestDays: 0, greenQty: 0, yellowQty: 0, redQty: 0 };
        variantAgingMap.set(vid, entry);
      }
      entry.totalQty += batch.quantity;
      entry.weightedSum += ageDays * batch.quantity;
      if (ageDays > entry.oldestDays) entry.oldestDays = ageDays;
      if (ageDays <= 90) entry.greenQty += batch.quantity;
      else if (ageDays <= 180) entry.yellowQty += batch.quantity;
      else entry.redQty += batch.quantity;
    }
  }

  // Roll up to style level
  const styleAgingMap = new Map<string, {
    totalQty: number; weightedSum: number; oldestDays: number;
    greenQty: number; yellowQty: number; redQty: number;
  }>();

  for (const [styleId, variantIds] of styleVariants) {
    let agg = { totalQty: 0, weightedSum: 0, oldestDays: 0, greenQty: 0, yellowQty: 0, redQty: 0 };
    for (const vid of variantIds) {
      const va = variantAgingMap.get(vid);
      if (!va) continue;
      agg.totalQty += va.totalQty;
      agg.weightedSum += va.weightedSum;
      if (va.oldestDays > agg.oldestDays) agg.oldestDays = va.oldestDays;
      agg.greenQty += va.greenQty;
      agg.yellowQty += va.yellowQty;
      agg.redQty += va.redQty;
    }
    if (agg.totalQty > 0) styleAgingMap.set(styleId, agg);
  }

  // Attach aging to style entries
  for (const entry of styleEntries) {
    const aging = styleAgingMap.get(entry.styleId);
    if (aging) {
      entry.avgAgeDays = Math.round(aging.weightedSum / aging.totalQty);
      entry.oldestAgeDays = aging.oldestDays;
      entry.agingTier = aging.redQty > 0 ? "red" : aging.yellowQty > 0 ? "yellow" : "green";
    }
  }

  return { styles: styleEntries, branches: activeBranches };
}

// ─── Enrichment helper ──────────────────────────────────────────────────────

async function enrichStyles(
  ctx: { db: any },
  entries: { styleId: string }[]
) {
  const uniqueStyleIds = [...new Set(entries.map((e) => e.styleId))];
  const styleDocs = await Promise.all(
    uniqueStyleIds.map((id) => ctx.db.get(id as Id<"styles">))
  );
  const styleMap = new Map<string, Doc<"styles">>();
  for (let i = 0; i < uniqueStyleIds.length; i++) {
    if (styleDocs[i]) styleMap.set(uniqueStyleIds[i], styleDocs[i]);
  }

  const catIds = [...new Set(
    [...styleMap.values()].map((s) => String(s.categoryId ?? ""))
  )];
  const catDocs = await Promise.all(
    catIds.map((id) => ctx.db.get(id as Id<"categories">))
  );
  const catMap = new Map<string, Doc<"categories">>();
  for (let i = 0; i < catIds.length; i++) {
    if (catDocs[i]) catMap.set(catIds[i], catDocs[i]);
  }

  const brandIds = [...new Set(
    [...catMap.values()].map((c) => String(c.brandId))
  )];
  const brandDocs = await Promise.all(
    brandIds.map((id) => ctx.db.get(id as Id<"brands">))
  );
  const brandMap = new Map<string, string>();
  for (let i = 0; i < brandIds.length; i++) {
    if (brandDocs[i]) brandMap.set(brandIds[i], brandDocs[i]!.name);
  }

  return { styleMap, catMap, brandMap };
}

// ─── getSellThroughAnalysis (HQ — overall or filtered by branch) ────────────

export const getSellThroughAnalysis = query({
  args: {
    periodDays: v.number(),
    branchId: v.optional(v.id("branches")),
    brandId: v.optional(v.id("brands")),
    classification: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const { styles, branches } = await computeSellThrough(ctx, {
      periodDays: args.periodDays,
      branchId: args.branchId,
    });

    // If brand filter specified, resolve which styleIds belong to that brand
    let brandStyleIds: Set<string> | null = null;
    if (args.brandId) {
      const cats = await ctx.db
        .query("categories")
        .withIndex("by_brand", (q: any) => q.eq("brandId", args.brandId))
        .collect();
      const catIds = new Set(cats.map((c: Doc<"categories">) => String(c._id)));
      const allStyles: Doc<"styles">[] = await ctx.db.query("styles").collect();
      brandStyleIds = new Set(
        allStyles
          .filter((s: Doc<"styles">) => s.categoryId ? catIds.has(String(s.categoryId)) : false)
          .map((s: Doc<"styles">) => String(s._id))
      );
    }

    // Filter by brand + classification
    let filtered = brandStyleIds
      ? styles.filter((s) => brandStyleIds!.has(s.styleId))
      : styles;

    filtered = args.classification
      ? filtered.filter((s) => s.classification === args.classification)
      : filtered;

    // Sort: slow → mid → fast (worst first for action)
    const classOrder: Record<string, number> = { dead: 0, slow: 1, mid: 2, fast: 3 };
    filtered.sort((a, b) => classOrder[a.classification] - classOrder[b.classification]);

    // Enrich
    const { styleMap, catMap, brandMap } = await enrichStyles(ctx, filtered);

    const branchNameMap = new Map(branches.map((b: Doc<"branches">) => [String(b._id), b.name]));

    // Fetch notes count per style
    const notesCounts = new Map<string, number>();
    for (const entry of filtered) {
      const notes = await ctx.db
        .query("sellThruNotes")
        .withIndex("by_style", (q: any) => q.eq("styleId", entry.styleId as Id<"styles">))
        .collect();
      notesCounts.set(entry.styleId, notes.length);
    }

    const items = filtered.map((entry) => {
      const style = styleMap.get(entry.styleId);
      const cat = style && style.categoryId ? catMap.get(String(style.categoryId)) : null;
      const brandName = cat ? brandMap.get(String(cat.brandId)) ?? "" : "";

      return {
        styleId: entry.styleId,
        styleName: style?.name ?? "Unknown",
        brandName,
        categoryName: cat?.name ?? "",
        beg: entry.beg,
        soh: entry.soh,
        sold: entry.sold,
        sellThruPct: entry.sellThruPct,
        classification: entry.classification,
        avgAgeDays: entry.avgAgeDays,
        oldestAgeDays: entry.oldestAgeDays,
        agingTier: entry.agingTier,
        notesCount: notesCounts.get(entry.styleId) ?? 0,
        branchBreakdown: entry.branchBreakdown.map((bb) => ({
          ...bb,
          branchName: branchNameMap.get(bb.branchId) ?? "Unknown",
        })),
      };
    });

    // Summary counts
    const summary = {
      fast: styles.filter((s) => s.classification === "fast").length,
      mid: styles.filter((s) => s.classification === "mid").length,
      slow: styles.filter((s) => s.classification === "slow").length,
      dead: styles.filter((s) => s.classification === "dead").length,
      total: styles.length,
    };

    return {
      items,
      summary,
      branches: branches.map((b: Doc<"branches">) => ({ _id: b._id, name: b.name })),
    };
  },
});

// ─── getBranchSellThrough (branch-scoped for managers) ──────────────────────

export const getBranchSellThrough = query({
  args: {
    periodDays: v.number(),
    classification: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!scope.branchId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Branch scope required" });
    }

    const { styles } = await computeSellThrough(ctx, {
      periodDays: args.periodDays,
      branchId: scope.branchId,
    });

    const filtered = args.classification
      ? styles.filter((s) => s.classification === args.classification)
      : styles;

    const classOrder: Record<string, number> = { dead: 0, slow: 1, mid: 2, fast: 3 };
    filtered.sort((a, b) => classOrder[a.classification] - classOrder[b.classification]);

    const { styleMap, catMap, brandMap } = await enrichStyles(ctx, filtered);

    const items = filtered.map((entry) => {
      const style = styleMap.get(entry.styleId);
      const cat = style && style.categoryId ? catMap.get(String(style.categoryId)) : null;
      const brandName = cat ? brandMap.get(String(cat.brandId)) ?? "" : "";

      return {
        styleId: entry.styleId,
        styleName: style?.name ?? "Unknown",
        brandName,
        categoryName: cat?.name ?? "",
        beg: entry.beg,
        soh: entry.soh,
        sold: entry.sold,
        sellThruPct: entry.sellThruPct,
        classification: entry.classification,
        avgAgeDays: entry.avgAgeDays,
        oldestAgeDays: entry.oldestAgeDays,
        agingTier: entry.agingTier,
      };
    });

    const summary = {
      fast: styles.filter((s) => s.classification === "fast").length,
      mid: styles.filter((s) => s.classification === "mid").length,
      slow: styles.filter((s) => s.classification === "slow").length,
      dead: styles.filter((s) => s.classification === "dead").length,
      total: styles.length,
    };

    return { items, summary };
  },
});

// ─── Barcode / SKU Lookup ───────────────────────────────────────────────────

export const lookupByBarcode = query({
  args: {
    code: v.string(),
    periodDays: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    // Try barcode first, then SKU
    let variant = await ctx.db
      .query("variants")
      .withIndex("by_barcode", (q: any) => q.eq("barcode", args.code))
      .first();

    if (!variant) {
      variant = await ctx.db
        .query("variants")
        .withIndex("by_sku", (q: any) => q.eq("sku", args.code))
        .first();
    }

    if (!variant) return null;

    const style = await ctx.db.get(variant.styleId);
    if (!style) return null;

    const category = style.categoryId ? await ctx.db.get(style.categoryId) : null;
    const brand = style.brandId
      ? await ctx.db.get(style.brandId)
      : category ? await ctx.db.get(category.brandId) : null;

    // Get sell-through data for this style
    const { styles, branches } = await computeSellThrough(ctx, {
      periodDays: args.periodDays,
    });

    const styleData = styles.find((s) => s.styleId === String(style._id));
    const branchNameMap = new Map(branches.map((b: Doc<"branches">) => [String(b._id), b.name]));

    // Get notes
    const notes = await ctx.db
      .query("sellThruNotes")
      .withIndex("by_style", (q: any) => q.eq("styleId", style._id))
      .collect();

    return {
      styleId: String(style._id),
      styleName: style.name,
      brandName: brand?.name ?? "",
      categoryName: category?.name ?? "",
      sku: variant.sku,
      barcode: variant.barcode ?? "",
      beg: styleData?.beg ?? 0,
      soh: styleData?.soh ?? 0,
      sold: styleData?.sold ?? 0,
      sellThruPct: styleData?.sellThruPct ?? 0,
      classification: styleData?.classification ?? "dead",
      branchBreakdown: (styleData?.branchBreakdown ?? []).map((bb) => ({
        ...bb,
        branchName: branchNameMap.get(bb.branchId) ?? "Unknown",
      })),
      notes: notes
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((n) => ({
          _id: n._id,
          note: n.note,
          verdict: n.verdict,
          authorName: n.authorName,
          createdAt: n.createdAt,
        })),
    };
  },
});

// ─── Notes CRUD ─────────────────────────────────────────────────────────────

export const addNote = mutation({
  args: {
    styleId: v.id("styles"),
    branchId: v.optional(v.id("branches")),
    note: v.string(),
    verdict: v.optional(
      v.union(
        v.literal("markdown"),
        v.literal("transfer"),
        v.literal("return_to_supplier"),
        v.literal("bundle"),
        v.literal("promote"),
        v.literal("hold"),
        v.literal("other")
      )
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const id = await ctx.db.insert("sellThruNotes", {
      styleId: args.styleId,
      branchId: args.branchId,
      note: args.note,
      verdict: args.verdict,
      authorId: user._id,
      authorName: user.name,
      createdAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "sellThruNote.create",
      userId: user._id,
      entityType: "sellThruNotes",
      entityId: id,
      after: { styleId: args.styleId, verdict: args.verdict },
    });

    return id;
  },
});

export const getNotesForStyle = query({
  args: { styleId: v.id("styles") },
  handler: async (ctx, args) => {
    await requireRole(ctx, HQ_ROLES);

    const notes = await ctx.db
      .query("sellThruNotes")
      .withIndex("by_style", (q: any) => q.eq("styleId", args.styleId))
      .collect();

    return notes
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((n) => ({
        _id: n._id,
        note: n.note,
        verdict: n.verdict,
        authorName: n.authorName,
        branchId: n.branchId,
        createdAt: n.createdAt,
      }));
  },
});

export const deleteNote = mutation({
  args: { noteId: v.id("sellThruNotes") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);
    const note = await ctx.db.get(args.noteId);
    if (!note) throw new ConvexError({ code: "NOT_FOUND", message: "Note not found" });

    await ctx.db.delete(args.noteId);

    await _logAuditEntry(ctx, {
      action: "sellThruNote.delete",
      userId: user._id,
      entityType: "sellThruNotes",
      entityId: args.noteId,
    });
  },
});

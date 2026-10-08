// convex/suppliers/preAllocation.ts — splitting a supplier delivery across
// stores before it arrives.
//
// A PO is declared against the warehouse. Until now the store split happened
// afterwards: receive it, put it away, then re-pick it when a store asked.
// Pre-allocating lets the delivery cross-dock — the store transfers are
// already settled when the goods are scanned in, so they leave the same day
// instead of touching a shelf twice.
//
// The file is the same one the warehouse-to-store allocation uses:
//
//     SKU,Branch,Quantity,Notes
//
// deliberately identical, so one template serves both and nobody has to
// remember which upload wants which columns. The only difference is what the
// quantities are checked against: a warehouse allocation is limited by stock
// on hand, a pre-allocation by what the PO DECLARED. Both go through the same
// planAllocation, which already takes the supply as a map — so there is one
// planner for both, not two that can drift apart.
//
// Approval happens BEFORE the goods land, which is the point: it is a plan,
// and there is nothing to move yet.
//
// What actually moves is scaled to what the supplier really sent. Suppliers
// short-ship — supplierReceipts has a "discrepancy" status because it happens —
// so a plan for 300 against 240 received gives every store its proportional
// share of the 240 rather than the first stores winning and the last getting
// nothing. The transfers are then created already approved, with the plan
// recorded as the basis: one human gate, not two.

import { mutation, query, type MutationCtx } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { withBranchScope, type BranchScope } from "../_helpers/withBranchScope";
import { HQ_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";
import {
  createTransferForRequester,
  approveTransferRecord,
} from "../transfers/requests";
import {
  planAllocation,
  normaliseBranchName,
  scaleToReceived,
  type AllocationLookup,
  type BranchMatch,
} from "../transfers/allocationPlan";

/** Who may plan a push: HQ, or the merchandising account. */
const PLANNING_ROLES = Array.from(new Set([...HQ_ROLES, "merchandiser"]));
/** Who signs one off. Logistics owns the warehouse, so warehouse staff count. */
const APPROVAL_ROLES = Array.from(new Set([...HQ_ROLES, "warehouseStaff"]));

const MAX_ROWS = 5000;

// ─── uploadPreAllocation ─────────────────────────────────────────────────────

export const uploadPreAllocation = mutation({
  args: {
    receiptId: v.id("supplierReceipts"),
    fileName: v.string(),
    rows: v.array(
      v.object({
        sku: v.string(),
        branchName: v.string(),
        quantity: v.number(),
        notes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!PLANNING_ROLES.includes(scope.user.role)) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Only HQ or merchandising can pre-allocate a delivery.",
      });
    }
    if (args.rows.length === 0) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "That file has no rows under its header.",
      });
    }
    if (args.rows.length > MAX_ROWS) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: `That file has ${args.rows.length} rows; the most at once is ${MAX_ROWS}.`,
      });
    }

    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Receipt not found." });
    }
    // Once the goods are in, there is nothing left to pre-allocate — the
    // warehouse-to-store upload is the tool for stock already on a shelf.
    if (receipt.status === "completed" || receipt.status === "discrepancy") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message:
          "That delivery has already been received. Allocate it from the warehouse instead.",
      });
    }

    // One plan at a time, so there is never a question of which was approved.
    const existing = await ctx.db
      .query("preAllocations")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
      .collect();
    const live = existing.find(
      (a) => a.status === "pending" || a.status === "approved"
    );
    if (live) {
      throw new ConvexError({
        code: "INVALID_STATE",
        message:
          live.status === "pending"
            ? "This delivery already has a plan waiting for approval. Reject it first."
            : "This delivery already has an approved plan.",
      });
    }

    // ── The supply is what the PO declared, not stock on hand ───────────────
    const declaredItems = await ctx.db
      .query("supplierReceiptItems")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
      .collect();
    if (declaredItems.length === 0) {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "That delivery has no declared lines to allocate.",
      });
    }

    const variantBySku = new Map<string, { key: string; sku: string } | null>();
    const availableByVariant = new Map<string, number>();
    const variantById = new Map<string, Doc<"variants">>();
    for (const item of declaredItems) {
      const variant = await ctx.db.get(item.variantId);
      if (!variant) continue;
      const key = variant._id as string;
      variantById.set(key, variant);
      variantBySku.set(variant.sku, { key, sku: variant.sku });
      availableByVariant.set(
        key,
        (availableByVariant.get(key) ?? 0) + item.declaredQuantity
      );
    }
    // Any SKU the file names that this PO does not carry resolves to nothing,
    // and the planner reports it as an unknown SKU — which is the truth: it is
    // not on this delivery.
    for (const raw of args.rows) {
      const sku = raw.sku.trim();
      if (sku && !variantBySku.has(sku)) variantBySku.set(sku, null);
    }

    const branches = (await ctx.db.query("branches").collect()).filter(
      (b) => b.isActive
    );
    const branchesByName = new Map<string, BranchMatch[]>();
    for (const branch of branches) {
      const key = normaliseBranchName(branch.name);
      const match: BranchMatch = { key: branch._id as string, name: branch.name };
      const bucket = branchesByName.get(key);
      if (bucket) bucket.push(match);
      else branchesByName.set(key, [match]);
    }

    const source = await ctx.db.get(receipt.branchId);
    const lookup: AllocationLookup = {
      sourceKey: receipt.branchId as string,
      sourceName: source?.name ?? "the warehouse",
      branchesByName,
      variantBySku,
      availableByVariant,
    };
    const plan = planAllocation(args.rows, lookup);

    // ── Store the plan ──────────────────────────────────────────────────────
    const fileName = args.fileName.trim() || "pre-allocation";
    const now = Date.now();
    let unitsPlanned = 0;
    let lineCount = 0;
    for (const branch of plan.branches) {
      for (const line of branch.lines) {
        unitsPlanned += line.quantity;
        lineCount++;
      }
    }

    if (lineCount === 0) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message:
          plan.problems.length > 0
            ? `No usable row in that file. First problem: ${plan.problems[0].reason}`
            : "No usable row in that file.",
      });
    }

    const allocationId = await ctx.db.insert("preAllocations", {
      receiptId: args.receiptId,
      fileName,
      status: "pending",
      lineCount,
      unitsPlanned,
      branchCount: plan.branches.length,
      skippedCount: plan.problems.length,
      submittedById: scope.userId,
      submittedAt: now,
    });

    for (const branch of plan.branches) {
      for (const line of branch.lines) {
        const variant = variantBySku.get(line.sku);
        if (!variant) continue;
        const doc = variantById.get(variant.key);
        await ctx.db.insert("preAllocationLines", {
          allocationId,
          receiptId: args.receiptId,
          branchId: branch.branchKey as Id<"branches">,
          branchName: branch.branchName,
          variantId: variant.key as Id<"variants">,
          sku: line.sku,
          label: doc
            ? [doc.size, doc.color].filter(Boolean).join(" / ") || doc.sku
            : line.sku,
          quantity: line.quantity,
          ...(branch.notes.length > 0 ? { notes: branch.notes.join(" · ") } : {}),
        });
      }
    }

    await _logAuditEntry(ctx, {
      action: "preAllocation.upload",
      userId: scope.userId,
      entityType: "preAllocations",
      entityId: allocationId as string,
      after: {
        receiptId: args.receiptId,
        fileName,
        poNumber: receipt.poNumber,
        lineCount,
        unitsPlanned,
        branchCount: plan.branches.length,
        rowsSkipped: plan.problems.length,
      },
    });

    return {
      allocationId,
      fileName,
      lineCount,
      unitsPlanned,
      branches: plan.branches.map((b) => ({
        branchName: b.branchName,
        lines: b.lines.length,
        units: b.lines.reduce((sum, l) => sum + l.quantity, 0),
      })),
      problems: plan.problems,
    };
  },
});

// ─── Reading ─────────────────────────────────────────────────────────────────

export const getPreAllocation = query({
  args: { receiptId: v.id("supplierReceipts") },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (
      !PLANNING_ROLES.includes(scope.user.role) &&
      !APPROVAL_ROLES.includes(scope.user.role)
    ) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const all = await ctx.db
      .query("preAllocations")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
      .collect();
    // The one that matters is the live plan, else the most recent.
    const allocation =
      all.find((a) => a.status === "pending" || a.status === "approved") ??
      all.sort((a, b) => b.submittedAt - a.submittedAt)[0];
    if (!allocation) return null;

    const lines = await ctx.db
      .query("preAllocationLines")
      .withIndex("by_allocation", (q) => q.eq("allocationId", allocation._id))
      .collect();

    const submitter = await ctx.db.get(allocation.submittedById);
    const reviewer = allocation.reviewedById
      ? await ctx.db.get(allocation.reviewedById)
      : null;

    // What the PO declared, so the page can show the plan against the supply.
    const declared = new Map<string, number>();
    for (const item of await ctx.db
      .query("supplierReceiptItems")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
      .collect()) {
      declared.set(
        item.variantId as string,
        (declared.get(item.variantId as string) ?? 0) + item.declaredQuantity
      );
    }

    const byBranch = new Map<
      string,
      { branchName: string; units: number; lines: number }
    >();
    for (const line of lines) {
      const row = byBranch.get(line.branchName) ?? {
        branchName: line.branchName,
        units: 0,
        lines: 0,
      };
      row.units += line.quantity;
      row.lines++;
      byBranch.set(line.branchName, row);
    }

    return {
      _id: allocation._id,
      status: allocation.status,
      fileName: allocation.fileName,
      lineCount: allocation.lineCount,
      unitsPlanned: allocation.unitsPlanned,
      branchCount: allocation.branchCount,
      skippedCount: allocation.skippedCount,
      submittedAt: allocation.submittedAt,
      submittedByName: submitter?.name ?? "Unknown",
      reviewedAt: allocation.reviewedAt ?? null,
      reviewedByName: reviewer?.name ?? null,
      rejectionReason: allocation.rejectionReason ?? null,
      appliedAt: allocation.appliedAt ?? null,
      unitsApplied: allocation.unitsApplied ?? null,
      transfersCreated: allocation.transfersCreated ?? null,
      byBranch: [...byBranch.values()].sort((a, b) =>
        a.branchName.localeCompare(b.branchName)
      ),
      lines: lines
        .map((line) => ({
          _id: line._id,
          sku: line.sku,
          label: line.label,
          branchName: line.branchName,
          quantity: line.quantity,
          declaredOnPo: declared.get(line.variantId as string) ?? 0,
        }))
        .sort(
          (a, b) => a.sku.localeCompare(b.sku) || a.branchName.localeCompare(b.branchName)
        ),
    };
  },
});

export const listPendingPreAllocations = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    if (!APPROVAL_ROLES.includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const pending = await ctx.db
      .query("preAllocations")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    return await Promise.all(
      pending
        .sort((a, b) => a.submittedAt - b.submittedAt)
        .map(async (allocation) => {
          const receipt = await ctx.db.get(allocation.receiptId);
          const supplier = receipt ? await ctx.db.get(receipt.supplierId) : null;
          const submitter = await ctx.db.get(allocation.submittedById);
          return {
            _id: allocation._id,
            receiptId: allocation.receiptId,
            poNumber: receipt?.poNumber ?? "(deleted)",
            supplierName: supplier?.name ?? "Unknown",
            deliveryWindowEnd: receipt?.deliveryWindowEnd ?? null,
            fileName: allocation.fileName,
            lineCount: allocation.lineCount,
            unitsPlanned: allocation.unitsPlanned,
            branchCount: allocation.branchCount,
            submittedAt: allocation.submittedAt,
            submittedByName: submitter?.name ?? "Unknown",
          };
        })
    );
  },
});

// ─── Approving ───────────────────────────────────────────────────────────────

export const approvePreAllocation = mutation({
  args: { allocationId: v.id("preAllocations") },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!APPROVAL_ROLES.includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const allocation = await ctx.db.get(args.allocationId);
    if (!allocation) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Plan not found." });
    }
    if (allocation.status !== "pending") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: `This plan was already ${allocation.status}.`,
      });
    }

    await ctx.db.patch(args.allocationId, {
      status: "approved",
      reviewedById: scope.userId,
      reviewedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "preAllocation.approve",
      userId: scope.userId,
      entityType: "preAllocations",
      entityId: args.allocationId as string,
      before: { status: "pending" },
      after: {
        status: "approved",
        unitsPlanned: allocation.unitsPlanned,
        // Nothing moves yet: the goods are not here.
        appliesOn: "receiptCompletion",
      },
    });

    return { unitsPlanned: allocation.unitsPlanned, branchCount: allocation.branchCount };
  },
});

export const rejectPreAllocation = mutation({
  args: { allocationId: v.id("preAllocations"), reason: v.string() },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!APPROVAL_ROLES.includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }
    const reason = args.reason.trim();
    if (reason === "") {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Give a reason, so it is clear why the plan was not taken.",
      });
    }

    const allocation = await ctx.db.get(args.allocationId);
    if (!allocation) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Plan not found." });
    }
    if (allocation.status === "applied") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "That plan has already moved stock and cannot be rejected.",
      });
    }

    await ctx.db.patch(args.allocationId, {
      status: "rejected",
      reviewedById: scope.userId,
      reviewedAt: Date.now(),
      rejectionReason: reason,
    });

    await _logAuditEntry(ctx, {
      action: "preAllocation.reject",
      userId: scope.userId,
      entityType: "preAllocations",
      entityId: args.allocationId as string,
      before: { status: allocation.status },
      after: { status: "rejected", reason },
    });

    return { ok: true };
  },
});

// ─── applyApprovedPreAllocation ──────────────────────────────────────────────
// Called from completeReceipt, once the goods are counted in and the stock is
// on the warehouse's books — the transfers hold that stock, so this cannot run
// before it exists.

export async function applyApprovedPreAllocation(
  ctx: MutationCtx,
  receiptId: Id<"supplierReceipts">,
  actorId: Id<"users">
): Promise<{ applied: boolean; transfers: number; units: number; scaled: boolean }> {
  const allocations = await ctx.db
    .query("preAllocations")
    .withIndex("by_receipt", (q) => q.eq("receiptId", receiptId))
    .collect();
  const approved = allocations.find((a) => a.status === "approved");
  if (!approved) return { applied: false, transfers: 0, units: 0, scaled: false };

  const receipt = await ctx.db.get(receiptId);
  if (!receipt) return { applied: false, transfers: 0, units: 0, scaled: false };

  const lines = await ctx.db
    .query("preAllocationLines")
    .withIndex("by_allocation", (q) => q.eq("allocationId", approved._id))
    .collect();

  // What actually arrived, per product.
  const received = new Map<string, number>();
  for (const item of await ctx.db
    .query("supplierReceiptItems")
    .withIndex("by_receipt", (q) => q.eq("receiptId", receiptId))
    .collect()) {
    received.set(
      item.variantId as string,
      (received.get(item.variantId as string) ?? 0) + item.receivedQuantity
    );
  }

  // Planned per product, so each store's share can be worked out.
  const plannedPerVariant = new Map<string, number>();
  for (const line of lines) {
    plannedPerVariant.set(
      line.variantId as string,
      (plannedPerVariant.get(line.variantId as string) ?? 0) + line.quantity
    );
  }

  // A short shipment scales every store's share down together, per product,
  // since a delivery can be complete on one SKU and short on the next.
  const scaledPerLine = new Map<string, number>();
  let scaled = false;
  for (const [variantKey, planned] of plannedPerVariant) {
    const got = received.get(variantKey) ?? 0;
    if (got < planned) scaled = true;
    const variantLines = lines
      .filter((l) => (l.variantId as string) === variantKey)
      .map((l) => ({ id: l._id as string, quantity: l.quantity }));
    for (const [id, quantity] of scaleToReceived(variantLines, got)) {
      scaledPerLine.set(id, quantity);
    }
  }

  // Group what is left into one transfer per store.
  const byBranch = new Map<string, { sku: string; requestedQuantity: number }[]>();
  let unitsApplied = 0;
  for (const line of lines) {
    const quantity = scaledPerLine.get(line._id as string) ?? 0;
    if (quantity <= 0) continue;
    const bucket = byBranch.get(line.branchId as string) ?? [];
    bucket.push({ sku: line.sku, requestedQuantity: quantity });
    byBranch.set(line.branchId as string, bucket);
    unitsApplied += quantity;
  }

  // createTransferForRequester takes the caller's scope and expects it to have
  // been authenticated already. The caller here is whoever completed the
  // receipt, and the direction rules it checks are waived for HQ — so the
  // scope is built unscoped on purpose: a warehouse-to-store push is being
  // carried out on an approved plan, not requested by a branch.
  const actor = await ctx.db.get(actorId);
  if (!actor) return { applied: false, transfers: 0, units: 0, scaled: false };
  const scope: BranchScope = {
    user: actor,
    userId: actorId,
    branchId: null,
    canAccessAllBranches: true,
  };

  let transfers = 0;
  for (const [branchKey, items] of byBranch) {
    const transferId = await createTransferForRequester(ctx, scope, {
      fromBranchId: receipt.branchId,
      toBranchId: branchKey as Id<"branches">,
      type: "stockRequest",
      notes: `Pre-allocated · PO ${receipt.poNumber} · ${approved.fileName}`,
      allocationFileName: approved.fileName,
      items,
    });
    // The plan was signed off before the goods arrived, so this is not a
    // second decision to make — it is the first one being carried out. No
    // approver is named; the audit entry records the plan as the basis.
    await approveTransferRecord(ctx, transferId, {
      actorId,
      basis: `preAllocation:${approved._id as string}`,
    });
    transfers++;
  }

  await ctx.db.patch(approved._id, {
    status: "applied",
    appliedAt: Date.now(),
    unitsApplied,
    transfersCreated: transfers,
  });

  await _logAuditEntry(ctx, {
    action: "preAllocation.apply",
    userId: actorId,
    entityType: "preAllocations",
    entityId: approved._id as string,
    after: {
      poNumber: receipt.poNumber,
      unitsPlanned: approved.unitsPlanned,
      unitsApplied,
      transfersCreated: transfers,
      // True when the supplier sent less than the PO declared.
      scaledToReceived: scaled,
    },
  });

  return { applied: true, transfers, units: unitsApplied, scaled };
}

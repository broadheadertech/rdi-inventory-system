import { v, ConvexError } from "convex/values";
import { query, mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { withBranchScope } from "../_helpers/withBranchScope";
import { requireRole } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";
import type { Id } from "../_generated/dataModel";

const MANAGER_ROLES = ["admin", "manager"] as const;

// ─── listActive ──────────────────────────────────────────────────────────────
// The associates the till may attribute a sale to: approved by HQ, and still
// working here. One waiting for approval, or refused, is not offered — an
// incentive earned against a name nobody signed off is the thing approval is
// there to prevent.

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    if (!scope.branchId) return [];

    const active = await ctx.db
      .query("fashionAssistants")
      .withIndex("by_branch", (q) =>
        q.eq("branchId", scope.branchId!).eq("isActive", true)
      )
      .collect();

    return active.filter((fa) => fa.status === "approved");
  },
});

// ─── listAll ─────────────────────────────────────────────────────────────────
// Returns all FAs (active + inactive) for management view.

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    if (!scope.branchId) return [];

    const all = await ctx.db
      .query("fashionAssistants")
      .withIndex("by_branch", (q) =>
        q.eq("branchId", scope.branchId!)
      )
      .collect();

    // Active first, then inactive; alphabetical within groups
    return all.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  },
});

// ─── create ──────────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    name: v.string(),
    employeeCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, MANAGER_ROLES);
    const scope = await withBranchScope(ctx);
    if (!scope.branchId) {
      throw new ConvexError({ code: "NO_BRANCH", message: "No branch assigned." });
    }

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({ code: "INVALID", message: "Name is required." });
    }

    // Check for duplicate name in this branch
    const existing = await ctx.db
      .query("fashionAssistants")
      .withIndex("by_branch", (q) =>
        q.eq("branchId", scope.branchId!).eq("isActive", true)
      )
      .collect();

    if (existing.some((fa) => fa.name.toLowerCase() === name.toLowerCase())) {
      throw new ConvexError({ code: "DUPLICATE", message: "A fashion assistant with this name already exists." });
    }

    // The branch knows who works on its floor; HQ decides who earns against a
    // sale. So this goes in waiting, and the till cannot pick it yet.
    return ctx.db.insert("fashionAssistants", {
      name,
      branchId: scope.branchId,
      employeeCode: args.employeeCode?.trim() || undefined,
      status: "pending" as const,
      isActive: true,
      createdAt: Date.now(),
      createdById: user._id,
    });
  },
});

// ─── update ──────────────────────────────────────────────────────────────────

export const update = mutation({
  args: {
    id: v.id("fashionAssistants"),
    name: v.string(),
    employeeCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, MANAGER_ROLES);
    const scope = await withBranchScope(ctx);

    const fa = await ctx.db.get(args.id);
    if (!fa) throw new ConvexError({ code: "NOT_FOUND", message: "Fashion assistant not found." });
    if (fa.branchId !== scope.branchId) throw new ConvexError({ code: "UNAUTHORIZED" });

    const name = args.name.trim();
    if (!name) throw new ConvexError({ code: "INVALID", message: "Name is required." });

    await ctx.db.patch(args.id, {
      name,
      employeeCode: args.employeeCode?.trim() || undefined,
    });
  },
});

// ─── setActive ────────────────────────────────────────────────────────────────

export const setActive = mutation({
  args: {
    id: v.id("fashionAssistants"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, MANAGER_ROLES);
    const scope = await withBranchScope(ctx);

    const fa = await ctx.db.get(args.id);
    if (!fa) throw new ConvexError({ code: "NOT_FOUND", message: "Fashion assistant not found." });
    if (fa.branchId !== scope.branchId) throw new ConvexError({ code: "UNAUTHORIZED" });

    await ctx.db.patch(args.id, { isActive: args.isActive });
  },
});

// ─── getPerformance ──────────────────────────────────────────────────────────
// Aggregates sales data per fashion assistant for the caller's branch.
// Returns: per-FA transaction count, items sold, revenue for the given date range.

export const getPerformance = query({
  args: {
    startMs: v.number(),
    endMs: v.number(),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!scope.branchId) return [];

    // Get all FAs for this branch
    const allFAs = await ctx.db
      .query("fashionAssistants")
      .withIndex("by_branch", (q) => q.eq("branchId", scope.branchId!))
      .collect();

    if (allFAs.length === 0) return [];

    // Get transactions in date range for this branch
    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q
          .eq("branchId", scope.branchId!)
          .gte("createdAt", args.startMs)
          .lte("createdAt", args.endMs)
      )
      .collect();

    // Filter to non-voided transactions with a fashionAssistantId
    const faTxns = txns.filter(
      (t) => t.fashionAssistantId && t.status !== "voided"
    );

    // Aggregate per FA
    const faMap = new Map<
      string,
      { transactionCount: number; itemsSold: number; revenueCentavos: number }
    >();

    for (const txn of faTxns) {
      const faId = txn.fashionAssistantId as string;
      const entry = faMap.get(faId) ?? {
        transactionCount: 0,
        itemsSold: 0,
        revenueCentavos: 0,
      };
      entry.transactionCount++;
      entry.revenueCentavos += txn.totalCentavos;

      // Count items sold
      const items = await ctx.db
        .query("transactionItems")
        .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
        .collect();
      for (const item of items) {
        entry.itemsSold += item.quantity;
      }

      faMap.set(faId, entry);
    }

    // Build results — include all FAs (even those with 0 sales)
    const results = allFAs.map((fa) => {
      const stats = faMap.get(fa._id as string) ?? {
        transactionCount: 0,
        itemsSold: 0,
        revenueCentavos: 0,
      };
      return {
        _id: fa._id,
        name: fa.name,
        employeeCode: fa.employeeCode,
        isActive: fa.isActive,
        ...stats,
      };
    });

    // Sort by revenue descending
    return results.sort((a, b) => b.revenueCentavos - a.revenueCentavos);
  },
});

// ─── HQ review ───────────────────────────────────────────────────────────────
// A branch adds the people on its own floor; HQ says who may earn against a
// sale. Approval is admin's alone — it is the control on incentive spend, not
// a routine back-office task.

const APPROVER_ROLES = ["admin"] as const;

/** Every submission across the business, newest first, for the review queue. */
export const listForReview = query({
  args: {
    status: v.optional(
      v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"))
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, APPROVER_ROLES);

    const all = await ctx.db.query("fashionAssistants").collect();
    const branches = await ctx.db.query("branches").collect();
    const nameById = new Map(branches.map((b) => [b._id as string, b.name]));

    const rows = await Promise.all(
      all.map(async (fa) => {
        const [addedBy, reviewedBy] = await Promise.all([
          ctx.db.get(fa.createdById),
          fa.reviewedById ? ctx.db.get(fa.reviewedById) : Promise.resolve(null),
        ]);
        return {
          _id: fa._id,
          name: fa.name,
          uid: fa.uid ?? null,
          employeeCode: fa.employeeCode ?? null,
          branchName: nameById.get(fa.branchId as string) ?? "Unknown",
          status: fa.status,
          isActive: fa.isActive,
          createdAt: fa.createdAt,
          addedByName: addedBy?.name ?? "Unknown",
          reviewedAt: fa.reviewedAt ?? null,
          reviewedByName: reviewedBy?.name ?? null,
          rejectionReason: fa.rejectionReason ?? null,
        };
      })
    );

    // Waiting first — the queue is the point of the page — then newest.
    const order = { pending: 0, rejected: 1, approved: 2 } as const;
    return rows
      .filter((row) => (args.status ? row.status === args.status : true))
      .sort((a, b) => order[a.status] - order[b.status] || b.createdAt - a.createdAt);
  },
});

/** How many are waiting, for the badge on the nav. */
export const countPending = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, APPROVER_ROLES);
    const pending = await ctx.db
      .query("fashionAssistants")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    return pending.length;
  },
});

/** FA-0001, FA-0002 … company-wide, and never reused. */
const UID_PREFIX = "FA-";

async function nextUid(ctx: MutationCtx): Promise<string> {
  const all = await ctx.db.query("fashionAssistants").collect();
  let highest = 0;
  for (const fa of all) {
    if (!fa.uid?.startsWith(UID_PREFIX)) continue;
    const n = Number(fa.uid.slice(UID_PREFIX.length));
    if (Number.isFinite(n) && n > highest) highest = n;
  }
  // Counting past the highest ever issued, not past the current count, so a
  // number is never handed to a second person.
  return `${UID_PREFIX}${String(highest + 1).padStart(4, "0")}`;
}

export const approve = mutation({
  args: { id: v.id("fashionAssistants") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, APPROVER_ROLES);

    const fa = await ctx.db.get(args.id);
    if (!fa) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Fashion assistant not found." });
    }
    if (fa.status === "approved") {
      throw new ConvexError({ code: "INVALID_STATE", message: "Already approved." });
    }

    // Approval is what makes someone real to the till, so that is when they
    // get the number the till works to. One they were given before — an
    // approval that was later withdrawn — is theirs to keep.
    const uid = fa.uid ?? (await nextUid(ctx));

    await ctx.db.patch(args.id, {
      status: "approved" as const,
      uid,
      reviewedAt: Date.now(),
      reviewedById: user._id,
      // A refusal that is later approved should not keep explaining itself.
      rejectionReason: undefined,
    });

    await _logAuditEntry(ctx, {
      action: "fashionAssistant.approve",
      userId: user._id,
      branchId: fa.branchId,
      entityType: "fashionAssistants",
      entityId: args.id,
      before: { status: fa.status },
      after: { status: "approved", name: fa.name, uid },
    });
  },
});

export const reject = mutation({
  args: { id: v.id("fashionAssistants"), reason: v.string() },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, APPROVER_ROLES);

    const fa = await ctx.db.get(args.id);
    if (!fa) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Fashion assistant not found." });
    }
    const reason = args.reason.trim();
    if (reason === "") {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Give a reason, so the branch knows what to fix.",
      });
    }

    await ctx.db.patch(args.id, {
      status: "rejected" as const,
      reviewedAt: Date.now(),
      reviewedById: user._id,
      rejectionReason: reason,
    });

    await _logAuditEntry(ctx, {
      action: "fashionAssistant.reject",
      userId: user._id,
      branchId: fa.branchId,
      entityType: "fashionAssistants",
      entityId: args.id,
      before: { status: fa.status },
      after: { status: "rejected", name: fa.name, reason },
    });
  },
});

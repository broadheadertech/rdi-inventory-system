// convex/admin/birRegistration.ts — Per-branch BIR registration with approval.
//
// Branch admins (managers) propose changes; Admin approves/rejects. Only the
// approved ("active") values appear on POS receipts.

import { query, mutation } from "../_generated/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  requireRole,
  requireAuth,
  ADMIN_ROLES,
  BRANCH_MANAGEMENT_ROLES,
} from "../_helpers/permissions";
import { withBranchScope } from "../_helpers/withBranchScope";
import { _logAuditEntry } from "../_helpers/auditLog";

const birConfigArg = v.object({
  businessName: v.optional(v.string()),
  tin: v.optional(v.string()),
  businessAddress: v.optional(v.string()),
  storeCode: v.optional(v.string()),
  terminalNumber: v.optional(v.string()),
  minNumber: v.optional(v.string()),
  serialNumber: v.optional(v.string()),
  accreditationNumber: v.optional(v.string()),
  accreditationDate: v.optional(v.string()),
  ptuNumber: v.optional(v.string()),
  ptuDate: v.optional(v.string()),
  softwareName: v.optional(v.string()),
  softwareVersion: v.optional(v.string()),
  supplierName: v.optional(v.string()),
  supplierTin: v.optional(v.string()),
  supplierAddress: v.optional(v.string()),
});

async function getRow(ctx: QueryCtx | MutationCtx, branchId: Id<"branches">) {
  return await ctx.db
    .query("birRegistrations")
    .withIndex("by_branch", (q) => q.eq("branchId", branchId))
    .unique();
}

// ─── Read: a single branch's registration ──────────────────────────────────────

export const getBranchBirRegistration = query({
  args: { branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    // Managers default to their own branch; admins/HQ may pass any branchId.
    const branchId =
      args.branchId ?? (scope.branchId as Id<"branches"> | null);
    if (!branchId) return null;
    if (!scope.canAccessAllBranches && scope.branchId !== branchId) {
      throw new ConvexError({ code: "BRANCH_MISMATCH", message: "Not your branch." });
    }
    const row = await getRow(ctx, branchId);
    if (!row) return { branchId, active: null, pending: null, pendingStatus: null, reviewNotes: null };
    return {
      branchId,
      active: row.active ?? null,
      pending: row.pending ?? null,
      pendingStatus: row.pendingStatus ?? null,
      reviewNotes: row.reviewNotes ?? null,
      requestedAt: row.requestedAt ?? null,
    };
  },
});

// ─── Read: active config for receipts (any authenticated staff) ────────────────

export const getActiveBirConfig = query({
  args: { branchId: v.id("branches") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const row = await getRow(ctx, args.branchId);
    return row?.active ?? null;
  },
});

// ─── Branch admin submits a change (awaits approval) ───────────────────────────

export const submitBirChange = mutation({
  args: { branchId: v.id("branches"), config: birConfigArg },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(BRANCH_MANAGEMENT_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }
    if (!scope.canAccessAllBranches && scope.branchId !== args.branchId) {
      throw new ConvexError({ code: "BRANCH_MISMATCH", message: "Not your branch." });
    }

    const now = Date.now();
    const existing = await getRow(ctx, args.branchId);
    if (existing) {
      await ctx.db.patch(existing._id, {
        pending: args.config,
        pendingStatus: "pending",
        requestedById: scope.userId,
        requestedAt: now,
        reviewNotes: undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("birRegistrations", {
        branchId: args.branchId,
        pending: args.config,
        pendingStatus: "pending",
        requestedById: scope.userId,
        requestedAt: now,
        updatedAt: now,
      });
    }

    await _logAuditEntry(ctx, {
      action: "bir.changeRequested",
      userId: scope.userId,
      branchId: args.branchId,
      entityType: "birRegistrations",
      entityId: args.branchId,
      after: { pendingStatus: "pending" },
    });
  },
});

// ─── Admin approves the pending change (applies to active) ─────────────────────

export const approveBirChange = mutation({
  args: { branchId: v.id("branches") },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, ADMIN_ROLES);
    const row = await getRow(ctx, args.branchId);
    if (!row || !row.pending || row.pendingStatus !== "pending") {
      throw new ConvexError({ code: "INVALID_STATE", message: "No pending change to approve." });
    }
    const now = Date.now();
    await ctx.db.patch(row._id, {
      active: row.pending,
      pending: undefined,
      pendingStatus: undefined,
      reviewedById: admin._id,
      reviewedAt: now,
      reviewNotes: undefined,
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "bir.changeApproved",
      userId: admin._id,
      branchId: args.branchId,
      entityType: "birRegistrations",
      entityId: args.branchId,
      after: { active: row.pending },
    });
  },
});

// ─── Admin rejects the pending change ──────────────────────────────────────────

export const rejectBirChange = mutation({
  args: { branchId: v.id("branches"), reason: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, ADMIN_ROLES);
    if (!args.reason.trim()) {
      throw new ConvexError({ code: "INVALID_ARGUMENT", message: "A reason is required." });
    }
    const row = await getRow(ctx, args.branchId);
    if (!row || row.pendingStatus !== "pending") {
      throw new ConvexError({ code: "INVALID_STATE", message: "No pending change to reject." });
    }
    const now = Date.now();
    await ctx.db.patch(row._id, {
      pendingStatus: "rejected",
      reviewedById: admin._id,
      reviewedAt: now,
      reviewNotes: args.reason.trim(),
      updatedAt: now,
    });

    await _logAuditEntry(ctx, {
      action: "bir.changeRejected",
      userId: admin._id,
      branchId: args.branchId,
      entityType: "birRegistrations",
      entityId: args.branchId,
      before: { pendingStatus: "pending" },
      after: { pendingStatus: "rejected", reviewNotes: args.reason.trim() },
    });
  },
});

// ─── Admin: list all pending change requests ───────────────────────────────────

export const listPendingBirChanges = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ADMIN_ROLES);
    const rows = await ctx.db.query("birRegistrations").collect();
    const pending = rows.filter((r) => r.pendingStatus === "pending");

    return await Promise.all(
      pending.map(async (r) => {
        const branch = await ctx.db.get(r.branchId);
        const requester = r.requestedById ? await ctx.db.get(r.requestedById) : null;
        return {
          branchId: r.branchId,
          branchName: branch?.name ?? "Unknown",
          requesterName: requester?.name ?? "Unknown",
          requestedAt: r.requestedAt ?? null,
          active: r.active ?? null,
          pending: r.pending ?? null,
        };
      })
    );
  },
});

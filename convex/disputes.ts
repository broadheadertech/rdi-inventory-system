// convex/disputes.ts — differences someone has to settle.
//
// A dispute is raised wherever the system records a difference a person has
// to explain:
//
//   cashCount          a Switch Cashier, End of Day or missed-day count that
//                      doesn't match the drawer's expected cash, or a turnover
//                      counted above it
//   turnoverShort      a turnover counted short. It also holds the register
//                      until a manager approves the count or sends it back to
//                      recount; a recount closes the dispute on its own
//   transferReceiving  a transfer that arrived different from its packing
//
// The branch manager settles their own branch's disputes with a cause and a
// note; admin oversees every branch and can reopen a settled one. An open
// dispute blocks nothing beyond what already was.

import {
  query,
  mutation,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { withBranchScope, requireBranchScope } from "./_helpers/withBranchScope";
import { HQ_ROLES } from "./_helpers/permissions";
import { _logAuditEntry } from "./_helpers/auditLog";

type Ctx = QueryCtx | MutationCtx;

const DAY_MS = 24 * 60 * 60 * 1000;

// Who may read the list, and who may settle. Reopening is admin/HQ only.
const VIEW_ROLES: readonly string[] = ["admin", "hqStaff", "manager", "viewer"];
const SETTLE_ROLES: readonly string[] = ["admin", "hqStaff", "manager"];

const causeValidator = v.union(
  v.literal("countingError"),
  v.literal("found"),
  v.literal("chargedToStaff"),
  v.literal("writtenOff"),
  v.literal("other")
);

function peso(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ─── names for the list ───────────────────────────────────────────────────────

async function cashierNameOf(ctx: Ctx, shift: Doc<"cashierShifts">): Promise<string> {
  if (shift.cashierAccountId) {
    const account = await ctx.db.get(shift.cashierAccountId);
    if (account) return `${account.firstName} ${account.lastName}`;
  }
  return (await ctx.db.get(shift.cashierId))?.name ?? "Cashier";
}

async function accountNameOf(ctx: Ctx, id: Id<"cashierAccounts"> | undefined): Promise<string> {
  if (!id) return "Cashier";
  const account = await ctx.db.get(id);
  return account ? `${account.firstName} ${account.lastName}` : "Cashier";
}

async function registerLabelOf(ctx: Ctx, id: Id<"posTerminals"> | undefined): Promise<string> {
  if (!id) return "Unassigned register";
  return (await ctx.db.get(id))?.label ?? "Unknown register";
}

async function transferLabelOf(ctx: Ctx, transfer: Doc<"transfers">): Promise<string> {
  const from = await ctx.db.get(transfer.fromBranchId);
  return `TRF-${(transfer._id as string).slice(-6).toUpperCase()} from ${from?.name ?? "Unknown"}`;
}

// ─── raising ──────────────────────────────────────────────────────────────────

type NewDispute = {
  branchId: Id<"branches">;
  kind: Doc<"disputes">["kind"];
  stage: Doc<"disputes">["stage"];
  sourceId: string;
  terminalId?: Id<"posTerminals">;
  transferId?: Id<"transfers">;
  approvalId?: Id<"cashTurnoverApprovals">;
  subject: string;
  detail: string;
  expectedCentavos?: number;
  countedCentavos?: number;
  differenceCentavos?: number;
  unitsDifference?: number;
};

/** Once per source and stage, so a retried mutation or the backfill never doubles one. */
async function raise(ctx: MutationCtx, d: NewDispute): Promise<void> {
  const existing = await ctx.db
    .query("disputes")
    .withIndex("by_source", (q) => q.eq("sourceId", d.sourceId))
    .collect();
  if (existing.some((e) => e.stage === d.stage)) return;
  await ctx.db.insert("disputes", { ...d, status: "open", raisedAt: Date.now() });
}

const CASH_STAGE_LABEL = {
  switchCashier: "Switch Cashier count",
  endOfDay: "End of Day count",
  missedDay: "Missed-day count",
  turnoverOver: "Turnover counted over",
} as const;

/** A cash count that doesn't match the drawer. Nothing is raised when it does. */
export async function raiseCashCountDispute(
  ctx: MutationCtx,
  shift: Doc<"cashierShifts">,
  stage: keyof typeof CASH_STAGE_LABEL,
  figures: { countedCentavos: number; expectedCentavos: number }
): Promise<void> {
  const difference = figures.countedCentavos - figures.expectedCentavos;
  if (difference === 0) return;
  await raise(ctx, {
    branchId: shift.branchId,
    kind: "cashCount",
    stage,
    sourceId: shift._id as string,
    terminalId: shift.terminalId,
    subject: `${await registerLabelOf(ctx, shift.terminalId)} · ${await cashierNameOf(ctx, shift)}`,
    detail: `${CASH_STAGE_LABEL[stage]}: counted ${peso(figures.countedCentavos)}, expected ${peso(figures.expectedCentavos)}`,
    expectedCentavos: figures.expectedCentavos,
    countedCentavos: figures.countedCentavos,
    differenceCentavos: difference,
  });
}

/** A turnover counted short, held for a manager. */
export async function raiseTurnoverShortDispute(
  ctx: MutationCtx,
  approval: Doc<"cashTurnoverApprovals">
): Promise<void> {
  const prev = await ctx.db.get(approval.prevShiftId);
  const outgoing = prev ? await cashierNameOf(ctx, prev) : "Unknown";
  const incoming = await accountNameOf(ctx, approval.cashierAccountId);
  await raise(ctx, {
    branchId: approval.branchId,
    kind: "turnoverShort",
    stage: "turnoverShort",
    sourceId: approval._id as string,
    terminalId: approval.terminalId,
    approvalId: approval._id,
    subject: `${await registerLabelOf(ctx, approval.terminalId)} · ${outgoing} → ${incoming}`,
    detail:
      `Turnover counted ${peso(approval.countedCentavos)} · declared ` +
      `${approval.declaredCentavos === undefined ? "— (force-closed)" : peso(approval.declaredCentavos)}` +
      ` · expected ${peso(approval.expectedCentavos)}`,
    expectedCentavos: approval.expectedCentavos,
    countedCentavos: approval.countedCentavos,
    differenceCentavos:
      approval.countedCentavos - Math.max(approval.expectedCentavos, approval.declaredCentavos ?? 0),
  });
}

/** A short turnover sent back to recount: that count is superseded, so its dispute closes. */
export async function closeTurnoverShortDispute(
  ctx: MutationCtx,
  approvalId: Id<"cashTurnoverApprovals">,
  note: string
): Promise<void> {
  const rows = await ctx.db
    .query("disputes")
    .withIndex("by_source", (q) => q.eq("sourceId", approvalId as string))
    .collect();
  for (const d of rows) {
    if (d.status !== "open" || d.stage !== "turnoverShort") continue;
    await ctx.db.patch(d._id, { status: "settled", note, settledAt: Date.now() });
  }
}

/** A transfer received by piece whose lines don't match the packing, or were damaged. */
export async function raiseTransferDispute(
  ctx: MutationCtx,
  transfer: Doc<"transfers">
): Promise<void> {
  const items = await ctx.db
    .query("transferItems")
    .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
    .collect();

  const lines: string[] = [];
  let units = 0;
  for (const item of items) {
    const packed = item.packedQuantity ?? item.requestedQuantity;
    const received = item.receivedQuantity ?? 0;
    if (received === packed && !item.damageNotes) continue;
    const sku = (await ctx.db.get(item.variantId))?.sku ?? "item";
    units += received - packed;
    lines.push(
      item.damageNotes
        ? `${sku} damaged (${item.damageNotes})`
        : `${sku} ${received} of ${packed} (${received > packed ? "+" : ""}${received - packed})`
    );
  }
  if (lines.length === 0) return;

  await raise(ctx, {
    branchId: transfer.toBranchId,
    kind: "transferReceiving",
    stage: "pieceReceiving",
    sourceId: transfer._id as string,
    transferId: transfer._id,
    subject: await transferLabelOf(ctx, transfer),
    detail: lines.slice(0, 4).join(" · ") + (lines.length > 4 ? ` · +${lines.length - 4} more` : ""),
    unitsDifference: units,
  });
}

/** A box the receiving branch flagged. */
export async function raiseBoxDispute(ctx: MutationCtx, box: Doc<"transferBoxes">): Promise<void> {
  const transfer = await ctx.db.get(box.transferId);
  if (!transfer) return;
  await raise(ctx, {
    branchId: transfer.toBranchId,
    kind: "transferReceiving",
    stage: "boxReceiving",
    sourceId: box._id as string,
    transferId: transfer._id,
    subject: `${box.boxCode} · ${await transferLabelOf(ctx, transfer)}`,
    detail: `Box flagged on receipt: ${box.discrepancyNotes ?? "no notes"}`,
  });
}

// ─── listDisputes ─────────────────────────────────────────────────────────────
// A branch sees its own; admin and HQ see every branch, or one they filter to.

export const listDisputes = query({
  args: {
    status: v.union(v.literal("open"), v.literal("settled")),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!VIEW_ROLES.includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const branchId = scope.canAccessAllBranches ? args.branchId : (scope.branchId ?? undefined);
    const canSettle = SETTLE_ROLES.includes(scope.user.role);
    const canReopen = (HQ_ROLES as readonly string[]).includes(scope.user.role);
    if (!scope.canAccessAllBranches && !branchId) {
      return { canSettle, canReopen, disputes: [] };
    }

    const rows = branchId
      ? await ctx.db
          .query("disputes")
          .withIndex("by_branch_status", (q) => q.eq("branchId", branchId).eq("status", args.status))
          .order("desc")
          .take(200)
      : await ctx.db
          .query("disputes")
          .withIndex("by_status", (q) => q.eq("status", args.status))
          .order("desc")
          .take(200);

    const branchNames = new Map<string, string>();
    const disputes = [];
    for (const d of rows) {
      const key = d.branchId as string;
      if (!branchNames.has(key)) {
        branchNames.set(key, (await ctx.db.get(d.branchId))?.name ?? "Unknown branch");
      }
      const approval = d.approvalId ? await ctx.db.get(d.approvalId) : null;
      const settledBy = d.settledById ? await ctx.db.get(d.settledById) : null;
      disputes.push({
        _id: d._id,
        kind: d.kind,
        stage: d.stage,
        branchName: branchNames.get(key)!,
        subject: d.subject,
        detail: d.detail,
        differenceCentavos: d.differenceCentavos ?? null,
        unitsDifference: d.unitsDifference ?? null,
        raisedAt: d.raisedAt,
        status: d.status,
        cause: d.cause ?? null,
        note: d.note ?? null,
        settledAt: d.settledAt ?? null,
        settledByName: settledBy?.name ?? null,
        approvalId: d.approvalId ?? null,
        // A short turnover's count still with a manager: decide it before settling.
        approvalPending: approval?.status === "pending",
      });
    }

    return { canSettle, canReopen, disputes };
  },
});

// ─── settle / reopen ──────────────────────────────────────────────────────────

export const settleDispute = mutation({
  args: {
    disputeId: v.id("disputes"),
    cause: causeValidator,
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const dispute = await ctx.db.get(args.disputeId);
    if (!dispute) throw new ConvexError("Dispute not found");

    const scope = await requireBranchScope(ctx, dispute.branchId);
    if (!SETTLE_ROLES.includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }
    if (dispute.status !== "open") throw new ConvexError("This dispute is already settled.");

    if (dispute.approvalId) {
      const approval = await ctx.db.get(dispute.approvalId);
      if (approval?.status === "pending") {
        throw new ConvexError(
          "Approve the count or send it back for a recount first — a register may be waiting on it."
        );
      }
    }

    const note = args.note.trim();
    if (!note) throw new ConvexError("Add a note explaining how this was settled.");

    await ctx.db.patch(args.disputeId, {
      status: "settled",
      cause: args.cause,
      note,
      settledById: scope.userId,
      settledAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "dispute.settle",
      userId: scope.userId,
      branchId: dispute.branchId,
      entityType: "disputes",
      entityId: args.disputeId,
      before: { status: "open" },
      after: { status: "settled", cause: args.cause, note },
    });
  },
});

export const reopenDispute = mutation({
  args: { disputeId: v.id("disputes"), note: v.string() },
  handler: async (ctx, args) => {
    const dispute = await ctx.db.get(args.disputeId);
    if (!dispute) throw new ConvexError("Dispute not found");

    const scope = await requireBranchScope(ctx, dispute.branchId);
    if (!(HQ_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }
    if (dispute.status !== "settled") throw new ConvexError("This dispute is already open.");
    const note = args.note.trim();
    if (!note) throw new ConvexError("Say why it is being reopened.");

    await ctx.db.patch(args.disputeId, {
      status: "open",
      cause: undefined,
      note: undefined,
      settledById: undefined,
      settledAt: undefined,
    });

    // The settlement being undone stays in the audit trail.
    await _logAuditEntry(ctx, {
      action: "dispute.reopen",
      userId: scope.userId,
      branchId: dispute.branchId,
      entityType: "disputes",
      entityId: args.disputeId,
      before: {
        status: "settled",
        cause: dispute.cause ?? null,
        note: dispute.note ?? null,
        settledById: dispute.settledById ?? null,
      },
      after: { status: "open", reason: note },
    });
  },
});

// ─── backfillDisputes ─────────────────────────────────────────────────────────
// One-time, from the CLI after the table first deploys: raises disputes for
// differences recorded in the last `days` days, so the tab doesn't start blank.
// Safe to run again — raising is once per source and stage.

export const backfillDisputes = internalMutation({
  args: { days: v.number() },
  handler: async (ctx, args) => {
    const since = Date.now() - args.days * DAY_MS;

    for await (const shift of ctx.db.query("cashierShifts").order("desc")) {
      if (shift._creationTime < since - DAY_MS) break;
      if (
        shift.status === "closed" &&
        (shift.closedAt ?? 0) >= since &&
        shift.declaredCashCentavos !== undefined &&
        shift.closedCashBalanceCentavos !== undefined
      ) {
        await raiseCashCountDispute(
          ctx,
          shift,
          shift.closeType === "endOfDay" ? "endOfDay" : "switchCashier",
          {
            countedCentavos: shift.declaredCashCentavos,
            expectedCentavos: shift.closedCashBalanceCentavos,
          }
        );
      }
      if (
        shift.openedAt >= since &&
        shift.prevShiftId !== undefined &&
        shift.handoverCashInRegisterCentavos !== undefined &&
        (shift.changeFundCentavos ?? 0) > shift.handoverCashInRegisterCentavos
      ) {
        await raiseCashCountDispute(ctx, shift, "turnoverOver", {
          countedCentavos: shift.changeFundCentavos ?? 0,
          expectedCentavos: shift.handoverCashInRegisterCentavos,
        });
      }
    }

    for await (const approval of ctx.db.query("cashTurnoverApprovals").order("desc")) {
      if (approval.requestedAt < since) break;
      if (approval.status === "rejected") continue;
      // A pending count another count of the same drawer has since opened a
      // shift from is left over, not a dispute.
      const opened = await ctx.db
        .query("cashierShifts")
        .withIndex("by_branch_opened", (q) =>
          q.eq("branchId", approval.branchId).gte("openedAt", approval.requestedAt)
        )
        .collect();
      if (
        approval.status === "pending" &&
        opened.some((s) => s.prevShiftId === approval.prevShiftId)
      ) {
        continue;
      }
      await raiseTurnoverShortDispute(ctx, approval);
    }

    const delivered = await ctx.db
      .query("transfers")
      .withIndex("by_status", (q) => q.eq("status", "delivered"))
      .order("desc")
      .take(1000);
    for (const transfer of delivered) {
      if ((transfer.deliveredAt ?? 0) < since) continue;
      const boxes = await ctx.db
        .query("transferBoxes")
        .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
        .collect();
      if (boxes.length > 0) {
        for (const box of boxes) {
          if (box.status === "discrepancy") await raiseBoxDispute(ctx, box);
        }
      } else {
        await raiseTransferDispute(ctx, transfer);
      }
    }

    const open = await ctx.db
      .query("disputes")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    return { openDisputes: open.length };
  },
});

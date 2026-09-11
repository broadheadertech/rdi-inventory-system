// convex/pos/shifts.ts — cashier shifts on a register.
//
// A shift is one cashier's session on one register, and the drawer passes
// through a chain of them each business day:
//
//   first shift     sets the drawer's float
//   Switch Cashier  the outgoing cashier declares the cash on hand; the next
//                   cashier counts it again before their shift opens
//   End of Day      the last cashier declares the cash on hand, which becomes
//                   the day's count, and the register's Z-reading is filed
//
// Every count is blind: the till never shows what the system expects, so no
// one can simply type it back. A turnover count that comes up short — of the
// outgoing declaration or of the drawer's expected cash — holds the register
// until a manager approves it. And a register cannot start a new business day
// while its last one has no Z-reading.

import { v, ConvexError } from "convex/values";
import { query, mutation, type QueryCtx, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { withBranchScope, requireBranchScope } from "../_helpers/withBranchScope";
import { BRANCH_MANAGEMENT_ROLES, POS_ROLES } from "../_helpers/permissions";
import { requireTerminal, touchTerminal } from "../_helpers/requireTerminal";
import { _logAuditEntry } from "../_helpers/auditLog";
import { fileZReading, findZReading } from "./readings";
import {
  closeTurnoverShortDispute,
  raiseCashCountDispute,
  raiseTurnoverShortDispute,
} from "../disputes";

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type Ctx = QueryCtx | MutationCtx;
type RegisterId = Id<"posTerminals"> | null;

// ─── dates (PHT) ──────────────────────────────────────────────────────────────

/** The PHT business date of a timestamp, as YYYYMMDD — the key zReadings are filed under. */
function phtDate(ms: number): string {
  const d = new Date(ms + PHT_OFFSET_MS);
  return (
    `${d.getUTCFullYear()}` +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0")
  );
}

function todayPht(): string {
  return phtDate(Date.now());
}

/** When today's PHT business day began. */
function todayStartMs(): number {
  const d = new Date(Date.now() + PHT_OFFSET_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - PHT_OFFSET_MS;
}

function formatYmd(ymd: string): string {
  return new Date(
    Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)))
  ).toLocaleDateString("en-PH", { dateStyle: "medium", timeZone: "UTC" });
}

// ─── the register ─────────────────────────────────────────────────────────────

/** Whether a row belongs to this register — or, on an unbound device, to no register. */
function onRegister(terminalId: RegisterId) {
  return (row: { terminalId?: Id<"posTerminals"> }) =>
    terminalId ? row.terminalId === terminalId : row.terminalId === undefined;
}

async function requirePosScope(ctx: Ctx) {
  const scope = await withBranchScope(ctx);
  if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
    throw new ConvexError({ code: "UNAUTHORIZED" });
  }
  return scope;
}

async function requireManagerScope(ctx: Ctx) {
  const scope = await withBranchScope(ctx);
  if (!(BRANCH_MANAGEMENT_ROLES as readonly string[]).includes(scope.user.role)) {
    throw new ConvexError({ code: "UNAUTHORIZED" });
  }
  return scope;
}

/**
 * The open shift on this register. A shift belongs to a register, not a store:
 * on an enrolled terminal only that terminal's shift counts, so Lane 2 never
 * walks into Lane 1's shift. An unbound device only ever sees a shift that
 * predates terminals.
 */
async function openShiftOnRegister(ctx: Ctx, branchId: Id<"branches">, terminalId: RegisterId) {
  if (terminalId) {
    return await ctx.db
      .query("cashierShifts")
      .withIndex("by_terminal_status", (q) => q.eq("terminalId", terminalId).eq("status", "open"))
      .first();
  }
  const open = await ctx.db
    .query("cashierShifts")
    .withIndex("by_branch_status", (q) => q.eq("branchId", branchId).eq("status", "open"))
    .collect();
  return open.find((s) => s.terminalId === undefined) ?? null;
}

/** The newest shift on this register opened before `beforeMs`. */
async function latestShiftOnRegister(
  ctx: Ctx,
  branchId: Id<"branches">,
  terminalId: RegisterId,
  beforeMs = Number.MAX_SAFE_INTEGER
): Promise<Doc<"cashierShifts"> | null> {
  const matches = onRegister(terminalId);
  for await (const shift of ctx.db
    .query("cashierShifts")
    .withIndex("by_branch_opened", (q) => q.eq("branchId", branchId).lt("openedAt", beforeMs))
    .order("desc")) {
    if (matches(shift)) return shift;
  }
  return null;
}

async function lastZOnRegister(
  ctx: Ctx,
  branchId: Id<"branches">,
  terminalId: RegisterId
): Promise<Doc<"zReadings"> | null> {
  if (terminalId) {
    return await ctx.db
      .query("zReadings")
      .withIndex("by_terminal", (q) => q.eq("terminalId", terminalId))
      .order("desc")
      .first();
  }
  for await (const z of ctx.db
    .query("zReadings")
    .withIndex("by_branch", (q) => q.eq("branchId", branchId))
    .order("desc")) {
    if (z.terminalId === undefined) return z;
  }
  return null;
}

/** The last earlier business day this register traded on without filing its Z-reading. */
async function missingZReadingDate(
  ctx: Ctx,
  branchId: Id<"branches">,
  terminalId: RegisterId
): Promise<string | null> {
  const last = await latestShiftOnRegister(ctx, branchId, terminalId, todayStartMs());
  if (!last) return null;
  const date = phtDate(last.openedAt);
  return (await findZReading(ctx, branchId, terminalId, date)) ? null : date;
}

/**
 * The drawer the next cashier must count: this register's last shift, if it
 * ended as a Switch Cashier after the register's last Z-reading.
 */
async function pendingHandover(
  ctx: Ctx,
  branchId: Id<"branches">,
  terminalId: RegisterId
): Promise<Doc<"cashierShifts"> | null> {
  const last = await latestShiftOnRegister(ctx, branchId, terminalId);
  if (!last || last.status !== "closed" || last.closeType !== "turnover") return null;
  const lastZ = await lastZOnRegister(ctx, branchId, terminalId);
  if (lastZ && (last.closedAt ?? 0) <= lastZ.generatedAt) return null;
  return last;
}

async function shiftCashierName(ctx: Ctx, shift: Doc<"cashierShifts">): Promise<string> {
  if (shift.cashierAccountId) {
    const account = await ctx.db.get(shift.cashierAccountId);
    if (account) return `${account.firstName} ${account.lastName}`;
  }
  const user = await ctx.db.get(shift.cashierId);
  return user?.name ?? "Cashier";
}

// ─── expected cash ────────────────────────────────────────────────────────────

/** Cash a sale put in the drawer: its cash tender, including the cash half of a split. */
function cashTendered(t: Doc<"transactions">): number {
  const splitAmt = t.splitPayment?.amountCentavos ?? 0;
  const primary = splitAmt > 0 ? t.totalCentavos - splitAmt : t.totalCentavos;
  let cash = t.paymentMethod === "cash" ? primary : 0;
  if (t.splitPayment?.method === "cash") cash += splitAmt;
  return cash;
}

/**
 * Cash that should be in the drawer `shift` is part of: the float it was last
 * set with, plus cash taken and Cash In since, less Cash Out. Voided sales are
 * left out — their cash went back.
 *
 * "Last set" walks back through the turnovers that handed this drawer on. Each
 * cashier counts it, but the day keeps one running figure, so cash lost at one
 * handover still shows at the next count and at the end of the day. The walk
 * stops at an End of Day, at a Z-reading, or where the chain changes register
 * (older shifts linked handovers across lanes).
 */
async function expectedDrawerCash(
  ctx: Ctx,
  branchId: Id<"branches">,
  shift: Doc<"cashierShifts">
): Promise<number> {
  const lastZ = await lastZOnRegister(ctx, branchId, shift.terminalId ?? null);
  const sinceZ = lastZ?.generatedAt ?? 0;

  let start = shift;
  for (let i = 0; i < 50 && start.prevShiftId; i++) {
    const prev = await ctx.db.get(start.prevShiftId);
    if (
      !prev ||
      prev.terminalId !== start.terminalId ||
      prev.closeType === "endOfDay" ||
      prev.openedAt < sinceZ
    ) {
      break;
    }
    start = prev;
  }

  const matches = onRegister(shift.terminalId ?? null);

  const txns = (
    await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", start.openedAt)
      )
      .collect()
  ).filter(matches);
  let cash = 0;
  for (const t of txns) {
    if (t.status !== "voided") cash += cashTendered(t);
  }

  const ops = (
    await ctx.db
      .query("drawerOperations")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", start.openedAt)
      )
      .collect()
  ).filter(matches);
  let moved = 0;
  for (const op of ops) {
    if (op.type === "payIn") moved += op.amountCentavos;
    else if (op.type === "payOut") moved -= op.amountCentavos;
  }

  return (start.changeFundCentavos ?? start.cashFundCentavos) + cash + moved;
}

// ─── requireShiftForSale ──────────────────────────────────────────────────────
// Every sale and drawer movement at the till happens inside a shift: without
// one there is no cashier to attribute it to and no drawer count it will ever
// appear in. The login gate keeps the POS closed without a shift; this is the
// server holding the same line.

// How long an offline sale may wait to be replayed.
const OFFLINE_REPLAY_WINDOW_MS = 7 * DAY_MS;

export async function requireShiftForSale(
  ctx: MutationCtx,
  branchId: Id<"branches">,
  terminalId: RegisterId,
  // For a sale queued offline and replayed on reconnect: when it was rung. It
  // is judged by the shift open then, since the till only reaches the server
  // later — possibly after that shift has ended.
  queuedAt?: number
): Promise<Doc<"cashierShifts">> {
  if (queuedAt === undefined) {
    const shift = await openShiftOnRegister(ctx, branchId, terminalId);
    if (!shift) {
      throw new ConvexError({
        code: "NO_ACTIVE_SHIFT",
        message: "No shift is open on this register. Log in and open a shift first.",
      });
    }
    const shiftDate = phtDate(shift.openedAt);
    if (shiftDate < todayPht()) {
      throw new ConvexError({
        code: "PREVIOUS_DAY_SHIFT",
        message: `This shift started on ${formatYmd(shiftDate)}. Close that day with End of Day before ringing sales today.`,
      });
    }
    return shift;
  }

  const now = Date.now();
  if (queuedAt > now || queuedAt < now - OFFLINE_REPLAY_WINDOW_MS) {
    throw new ConvexError({
      code: "INVALID_OFFLINE_SALE",
      message: "This offline sale's time is out of range, so it cannot be replayed.",
    });
  }
  const shift = await latestShiftOnRegister(ctx, branchId, terminalId, queuedAt + 1);
  if (!shift || (shift.closedAt !== undefined && shift.closedAt < queuedAt)) {
    throw new ConvexError({
      code: "NO_ACTIVE_SHIFT",
      message: "This offline sale was rung with no shift open on this register.",
    });
  }
  return shift;
}

// ─── getActiveShift ───────────────────────────────────────────────────────────
// The open shift on this register. No cash figures: the till counts blind.

export const getActiveShift = query({
  args: { deviceToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const scope = await requirePosScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const terminal = await requireTerminal(ctx, args.deviceToken, branchId);
    const terminalId = terminal?._id ?? null;
    const shift = await openShiftOnRegister(ctx, branchId, terminalId);
    if (!shift) return null;

    const matches = onRegister(terminalId);
    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("createdAt", shift.openedAt)
      )
      .collect();
    const transactionCount = txns.filter((t) => matches(t) && t.status !== "voided").length;

    const openedDate = phtDate(shift.openedAt);
    return {
      shiftId: shift._id,
      cashierName: await shiftCashierName(ctx, shift),
      cashierAccountId: shift.cashierAccountId ?? null,
      changeFundCentavos: shift.changeFundCentavos ?? shift.cashFundCentavos,
      cashFundCentavos: shift.cashFundCentavos,
      openedAt: shift.openedAt,
      openedDate,
      // Left open from an earlier business day: that day has to be closed
      // before this register trades today.
      isPreviousDay: openedDate < todayPht(),
      transactionCount,
    };
  },
});

// ─── getRegisterStatus ────────────────────────────────────────────────────────
// What stands between this register and its next shift, for the login gate.

export const getRegisterStatus = query({
  args: { deviceToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const scope = await requirePosScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return null;

    const terminal = await requireTerminal(ctx, args.deviceToken, branchId);
    const terminalId = terminal?._id ?? null;

    const closedToday = await findZReading(ctx, branchId, terminalId, todayPht());
    const missingZDate = closedToday ? null : await missingZReadingDate(ctx, branchId, terminalId);
    const handover =
      closedToday || missingZDate ? null : await pendingHandover(ctx, branchId, terminalId);

    // A count of this drawer already with a manager: the till resumes waiting on
    // it after a login or reload, rather than taking a new count the server would
    // refuse. The amount is the cashier's own count, not what was handed over.
    const waiting = handover
      ? ((
          await ctx.db
            .query("cashTurnoverApprovals")
            .withIndex("by_prevShift", (q) => q.eq("prevShiftId", handover._id))
            .collect()
        ).find((a) => a.status === "pending") ?? null)
      : null;

    return {
      // Closed for the day — its Z and its last shift's Y stay printable, even
      // after the till has been reloaded.
      closedToday: closedToday
        ? {
            zCounter: closedToday.zCounter,
            date: closedToday.date,
            lastShiftId: (await latestShiftOnRegister(ctx, branchId, terminalId))?._id ?? null,
          }
        : null,
      missingZDate,
      // Who handed over and when — never how much: the next cashier counts blind.
      handover: handover
        ? {
            shiftId: handover._id,
            cashierName: await shiftCashierName(ctx, handover),
            closedAt: handover.closedAt ?? null,
            pendingCount: waiting
              ? { approvalId: waiting._id, countedCentavos: waiting.countedCentavos }
              : null,
          }
        : null,
    };
  },
});

// ─── openShift ────────────────────────────────────────────────────────────────

async function requestTurnoverApproval(
  ctx: MutationCtx,
  a: {
    branchId: Id<"branches">;
    terminalId: RegisterId;
    prevShiftId: Id<"cashierShifts">;
    cashierAccountId?: Id<"cashierAccounts">;
    countedCentavos: number;
    declaredCentavos?: number;
    expectedCentavos: number;
    userId: Id<"users">;
  }
): Promise<Id<"cashTurnoverApprovals">> {
  const now = Date.now();
  const existing = await ctx.db
    .query("cashTurnoverApprovals")
    .withIndex("by_prevShift", (q) => q.eq("prevShiftId", a.prevShiftId))
    .collect();

  for (const e of existing) {
    if (e.status !== "pending") continue;
    // The same count asked again — a reloaded till — waits on the same request.
    if (e.countedCentavos === a.countedCentavos && e.cashierAccountId === a.cashierAccountId) {
      return e._id;
    }
    // A recount replaces the one still waiting.
    await ctx.db.patch(e._id, { status: "rejected", decidedAt: now, note: "Replaced by a recount" });
    await closeTurnoverShortDispute(ctx, e._id, "Replaced by a recount");
  }

  const approvalId = await ctx.db.insert("cashTurnoverApprovals", {
    branchId: a.branchId,
    terminalId: a.terminalId ?? undefined,
    prevShiftId: a.prevShiftId,
    cashierAccountId: a.cashierAccountId,
    countedCentavos: a.countedCentavos,
    declaredCentavos: a.declaredCentavos,
    expectedCentavos: a.expectedCentavos,
    status: "pending",
    requestedAt: now,
  });
  await raiseTurnoverShortDispute(ctx, (await ctx.db.get(approvalId))!);

  await _logAuditEntry(ctx, {
    action: "pos.shift.turnoverShort",
    userId: a.userId,
    branchId: a.branchId,
    entityType: "cashTurnoverApprovals",
    entityId: approvalId,
    after: {
      countedCentavos: a.countedCentavos,
      declaredCentavos: a.declaredCentavos ?? null,
      expectedCentavos: a.expectedCentavos,
    },
  });

  return approvalId;
}

export const openShift = mutation({
  args: {
    cashierAccountId: v.optional(v.id("cashierAccounts")),
    deviceToken: v.optional(v.string()),
    // The first shift of the day sets the drawer…
    changeFundCentavos: v.optional(v.number()),
    cashFundCentavos: v.optional(v.number()),
    // …a shift taking over a drawer counts it instead.
    turnoverCountCentavos: v.optional(v.number()),
    approvalId: v.optional(v.id("cashTurnoverApprovals")),
  },
  handler: async (ctx, args) => {
    const scope = await requirePosScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) throw new ConvexError("No branch assigned");

    // Device binding — a shift may only be opened from an enrolled register.
    const terminal = await requireTerminal(ctx, args.deviceToken, branchId);
    const terminalId = terminal?._id ?? null;

    if (await openShiftOnRegister(ctx, branchId, terminalId)) {
      throw new ConvexError(
        terminal
          ? `A shift is already open on ${terminal.label}. Close it first.`
          : "A shift is already open for this branch. Close it first."
      );
    }

    // A Z-reading closes that machine's trading day. Selling after it would
    // produce sales that appear in no Z-reading at all.
    const closedToday = await findZReading(ctx, branchId, terminalId, todayPht());
    if (closedToday) {
      throw new ConvexError(
        `The Z-reading for today has already been finalised${
          terminal ? ` on ${terminal.label}` : ""
        } (Z-counter ${String(closedToday.zCounter).padStart(8, "0")}). No further sales can be recorded today — the next shift starts tomorrow.`
      );
    }

    // Nor can a register start a new day while its last one was never closed.
    const missingZ = await missingZReadingDate(ctx, branchId, terminalId);
    if (missingZ) {
      throw new ConvexError(
        `The Z-reading for ${formatYmd(missingZ)} was never filed${
          terminal ? ` on ${terminal.label}` : ""
        }. File it before opening today's first shift.`
      );
    }

    const now = Date.now();
    const handover = await pendingHandover(ctx, branchId, terminalId);

    // ── First shift of the day: it sets the drawer ──────────────────────────
    if (!handover) {
      const changeFund = args.changeFundCentavos ?? 0;
      const cashFund = args.cashFundCentavos ?? 0;
      if (changeFund < 0) throw new ConvexError("Change fund cannot be negative");
      if (cashFund < 0) throw new ConvexError("Cash fund cannot be negative");

      const shiftId = await ctx.db.insert("cashierShifts", {
        branchId,
        cashierId: scope.userId,
        cashierAccountId: args.cashierAccountId,
        terminalId: terminal?._id,
        changeFundCentavos: changeFund,
        cashFundCentavos: cashFund,
        status: "open",
        openedAt: now,
      });
      await touchTerminal(ctx, terminal);
      return { status: "opened" as const, shiftId };
    }

    // ── Taking over a drawer: it is counted, blind ──────────────────────────
    const counted = args.turnoverCountCentavos;
    if (counted === undefined) {
      throw new ConvexError("Count the cash handed over before opening this shift.");
    }
    if (!Number.isInteger(counted) || counted < 0) {
      throw new ConvexError("The counted amount must be zero or more.");
    }

    // One count at a time. While a short count is with a manager, no one may
    // count this drawer again until the manager decides — otherwise a count
    // that did not pass could simply be retyped until one does, and the blind
    // count becomes a guessing game. A manager's "recount" reopens counting.
    const waiting = (
      await ctx.db
        .query("cashTurnoverApprovals")
        .withIndex("by_prevShift", (q) => q.eq("prevShiftId", handover._id))
        .collect()
    ).find((a) => a.status === "pending");
    if (waiting && waiting.countedCentavos !== counted) {
      throw new ConvexError(
        "This drawer's count is with a manager. Wait for their decision before counting again."
      );
    }

    const declared = handover.declaredCashCentavos;
    const expected = await expectedDrawerCash(ctx, branchId, handover);
    const short = counted < expected || (declared !== undefined && counted < declared);

    let approvalId: Id<"cashTurnoverApprovals"> | undefined;
    if (short) {
      const approval = args.approvalId ? await ctx.db.get(args.approvalId) : null;
      if (
        !approval ||
        approval.status !== "approved" ||
        approval.prevShiftId !== handover._id ||
        approval.countedCentavos !== counted ||
        approval.cashierAccountId !== args.cashierAccountId ||
        approval.openedShiftId !== undefined
      ) {
        return {
          status: "needsApproval" as const,
          approvalId: await requestTurnoverApproval(ctx, {
            branchId,
            terminalId,
            prevShiftId: handover._id,
            cashierAccountId: args.cashierAccountId,
            countedCentavos: counted,
            declaredCentavos: declared,
            expectedCentavos: expected,
            userId: scope.userId,
          }),
        };
      }
      approvalId = approval._id;
    }

    const shiftId = await ctx.db.insert("cashierShifts", {
      branchId,
      cashierId: scope.userId,
      cashierAccountId: args.cashierAccountId,
      terminalId: terminal?._id,
      // The drawer is what this cashier counted; the expenses fund passes on with it.
      changeFundCentavos: counted,
      cashFundCentavos: handover.cashFundCentavos,
      status: "open",
      openedAt: now,
      prevShiftId: handover._id,
      handoverCashInRegisterCentavos: expected,
      handoverChangeFundCentavos: handover.changeFundCentavos,
      handoverCashFundCentavos: handover.cashFundCentavos,
      turnoverApprovalId: approvalId,
    });
    if (approvalId) await ctx.db.patch(approvalId, { openedShiftId: shiftId });
    // Counted above what the drawer should hold: it opens, but goes to Disputes.
    if (counted > expected) {
      await raiseCashCountDispute(ctx, (await ctx.db.get(shiftId))!, "turnoverOver", {
        countedCentavos: counted,
        expectedCentavos: expected,
      });
    }

    await _logAuditEntry(ctx, {
      action: "pos.shift.turnoverCount",
      userId: scope.userId,
      branchId,
      entityType: "cashierShifts",
      entityId: shiftId,
      after: {
        countedCentavos: counted,
        declaredCentavos: declared ?? null,
        expectedCentavos: expected,
        approvalId: approvalId ?? null,
      },
    });

    await touchTerminal(ctx, terminal);
    return { status: "opened" as const, shiftId };
  },
});

// ─── closeShift ───────────────────────────────────────────────────────────────
// Ends the shift once the cashier has declared the cash on hand — the only way
// out of a shift at the till. End of Day also records the declaration as the
// day's count and files the register's Z-reading.

export const closeShift = mutation({
  args: {
    closeType: v.union(v.literal("turnover"), v.literal("endOfDay")),
    declaredCashCentavos: v.number(),
    notes: v.optional(v.string()),
    deviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await requirePosScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) throw new ConvexError("No branch assigned");

    // Close this register's shift. Closing by branch would let one lane end
    // another lane's shift and bank its float.
    const terminal = await requireTerminal(ctx, args.deviceToken, branchId);
    const terminalId = terminal?._id ?? null;
    const shift = await openShiftOnRegister(ctx, branchId, terminalId);
    if (!shift) throw new ConvexError("No open shift to close");

    const declared = args.declaredCashCentavos;
    if (!Number.isInteger(declared) || declared < 0) {
      throw new ConvexError("Declare the cash on hand — zero or more.");
    }

    // A shift left open past its business day can only close that day.
    const shiftDate = phtDate(shift.openedAt);
    if (args.closeType === "turnover" && shiftDate < todayPht()) {
      throw new ConvexError(
        `This shift started on ${formatYmd(shiftDate)}. Close it with End of Day first.`
      );
    }

    const expected = await expectedDrawerCash(ctx, branchId, shift);
    const now = Date.now();

    await ctx.db.patch(shift._id, {
      status: "closed",
      closedAt: now,
      closeType: args.closeType,
      closedCashBalanceCentavos: expected,
      declaredCashCentavos: declared,
      notes: args.notes,
    });

    await _logAuditEntry(ctx, {
      action: "pos.shift.close",
      userId: scope.userId,
      branchId,
      entityType: "cashierShifts",
      entityId: shift._id,
      after: {
        closeType: args.closeType,
        declaredCashCentavos: declared,
        expectedCashCentavos: expected,
        differenceCentavos: declared - expected,
      },
    });

    await raiseCashCountDispute(
      ctx,
      shift,
      args.closeType === "endOfDay" ? "endOfDay" : "switchCashier",
      { countedCentavos: declared, expectedCentavos: expected }
    );

    let zCounter: number | null = null;
    if (args.closeType === "endOfDay") {
      // The day this drawer traded — the shift's own, if it ran past midnight.
      const z =
        (await findZReading(ctx, branchId, terminalId, shiftDate)) ??
        (await fileZReading(ctx, { branchId, terminalId, dateStr: shiftDate, userId: scope.userId }));
      zCounter = z.zCounter;

      // The declared cash is the day's count.
      await ctx.db.insert("reconciliations", {
        branchId,
        cashierId: scope.userId,
        reconciliationDate: shiftDate,
        expectedCashCentavos: expected,
        actualCashCentavos: declared,
        differenceCentavos: declared - expected,
        transactionCount: z.transactionCount,
        cashSalesCentavos: z.cashSalesCentavos,
        gcashSalesCentavos: z.gcashSalesCentavos,
        mayaSalesCentavos: z.mayaSalesCentavos,
        totalSalesCentavos: z.grossSalesCentavos,
        notes: args.notes,
        createdAt: now,
      });
    }

    return { shiftId: shift._id, closeType: args.closeType, zCounter };
  },
});

// ─── closeMissedDay ───────────────────────────────────────────────────────────
// Closes a business day the register traded on but never ended with End of
// Day — its last cashier switched out and nobody closed up. The drawer is
// counted first, blind, like any End of Day, and that count is the day's cash
// count: a day is never closed on nothing but the last cashier's declaration.
// A turnover count still waiting for a manager stays with them.

export const closeMissedDay = mutation({
  args: {
    date: v.string(), // YYYYMMDD — the day the register reports as never closed
    declaredCashCentavos: v.number(),
    deviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await requirePosScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) throw new ConvexError("No branch assigned");

    const terminal = await requireTerminal(ctx, args.deviceToken, branchId);
    const terminalId = terminal?._id ?? null;

    if (await openShiftOnRegister(ctx, branchId, terminalId)) {
      throw new ConvexError(
        "A shift is still open on this register. Close it with End of Day instead."
      );
    }
    if ((await missingZReadingDate(ctx, branchId, terminalId)) !== args.date) {
      throw new ConvexError("That day doesn't need closing on this register.");
    }

    const declared = args.declaredCashCentavos;
    if (!Number.isInteger(declared) || declared < 0) {
      throw new ConvexError("Declare the cash in the drawer — zero or more.");
    }

    // The drawer as the day's last shift left it.
    const lastShift = await latestShiftOnRegister(ctx, branchId, terminalId, todayStartMs());
    if (!lastShift) throw new ConvexError("No shift was found for that day.");
    const expected = await expectedDrawerCash(ctx, branchId, lastShift);

    const z = await fileZReading(ctx, {
      branchId,
      terminalId,
      dateStr: args.date,
      userId: scope.userId,
    });

    const now = Date.now();
    await ctx.db.insert("reconciliations", {
      branchId,
      cashierId: scope.userId,
      reconciliationDate: args.date,
      expectedCashCentavos: expected,
      actualCashCentavos: declared,
      differenceCentavos: declared - expected,
      transactionCount: z.transactionCount,
      cashSalesCentavos: z.cashSalesCentavos,
      gcashSalesCentavos: z.gcashSalesCentavos,
      mayaSalesCentavos: z.mayaSalesCentavos,
      totalSalesCentavos: z.grossSalesCentavos,
      notes: "Counted when closing a day that was never ended",
      createdAt: now,
    });

    await raiseCashCountDispute(ctx, lastShift, "missedDay", {
      countedCentavos: declared,
      expectedCentavos: expected,
    });

    await _logAuditEntry(ctx, {
      action: "pos.shift.missedDayClosed",
      userId: scope.userId,
      branchId,
      entityType: "zReadings",
      entityId: z._id,
      after: {
        date: args.date,
        declaredCashCentavos: declared,
        expectedCashCentavos: expected,
        differenceCentavos: declared - expected,
      },
    });

    return { zCounter: z.zCounter };
  },
});

// ─── Turnover approvals ───────────────────────────────────────────────────────

/** The till's view of its request: the decision only, never the amounts it is checked against. */
export const getTurnoverApproval = query({
  args: { approvalId: v.id("cashTurnoverApprovals") },
  handler: async (ctx, args) => {
    const scope = await requirePosScope(ctx);
    const approval = await ctx.db.get(args.approvalId);
    if (!approval || approval.branchId !== scope.branchId) return null;
    return { status: approval.status, note: approval.note ?? null };
  },
});

async function terminalLabel(ctx: Ctx, terminalId: Id<"posTerminals"> | undefined) {
  if (!terminalId) return "Unassigned register";
  return (await ctx.db.get(terminalId))?.label ?? "Unknown register";
}

async function accountName(ctx: Ctx, cashierAccountId: Id<"cashierAccounts"> | undefined) {
  if (!cashierAccountId) return "Cashier";
  const account = await ctx.db.get(cashierAccountId);
  return account ? `${account.firstName} ${account.lastName}` : "Cashier";
}

export const listTurnoverApprovals = query({
  args: {},
  handler: async (ctx) => {
    const scope = await requireManagerScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return [];

    const pending = await ctx.db
      .query("cashTurnoverApprovals")
      .withIndex("by_branch_status", (q) => q.eq("branchId", branchId).eq("status", "pending"))
      .collect();

    // Every count that still needs a decision. A count is only left over when
    // another count of the same drawer has since opened a shift from it — the
    // old retype loophole — and that one is hidden. A count whose day was
    // closed before anyone decided stays: no register waits on it any more,
    // but the decision still belongs on the record.
    const handoverByRegister = new Map<string, Id<"cashierShifts"> | null>();
    const out = [];
    for (const a of pending) {
      const prev = await ctx.db.get(a.prevShiftId);
      const openedFromIt = (
        await ctx.db
          .query("cashierShifts")
          .withIndex("by_branch_opened", (q) =>
            q.eq("branchId", branchId).gte("openedAt", prev?.closedAt ?? a.requestedAt)
          )
          .collect()
      ).some((s) => s.prevShiftId === a.prevShiftId);
      if (openedFromIt) continue;

      const registerKey = (a.terminalId as string | undefined) ?? "unbound";
      if (!handoverByRegister.has(registerKey)) {
        const handover = await pendingHandover(ctx, branchId, a.terminalId ?? null);
        handoverByRegister.set(registerKey, handover?._id ?? null);
      }

      out.push({
        // False once the day has been closed: deciding opens nothing.
        registerWaiting: handoverByRegister.get(registerKey) === a.prevShiftId,
        approvalId: a._id,
        terminalLabel: await terminalLabel(ctx, a.terminalId),
        outgoingCashierName: prev ? await shiftCashierName(ctx, prev) : "Unknown",
        incomingCashierName: await accountName(ctx, a.cashierAccountId),
        countedCentavos: a.countedCentavos,
        declaredCentavos: a.declaredCentavos ?? null,
        expectedCentavos: a.expectedCentavos,
        shortCentavos: Math.max(a.expectedCentavos, a.declaredCentavos ?? 0) - a.countedCentavos,
        requestedAt: a.requestedAt,
      });
    }
    return out.sort((x, y) => x.requestedAt - y.requestedAt);
  },
});

export const decideTurnoverApproval = mutation({
  args: {
    approvalId: v.id("cashTurnoverApprovals"),
    approve: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new ConvexError("Request not found");

    const scope = await requireBranchScope(ctx, approval.branchId);
    if (!(BRANCH_MANAGEMENT_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }
    if (approval.status !== "pending") {
      throw new ConvexError("This count has already been decided, or the cashier recounted.");
    }

    await ctx.db.patch(args.approvalId, {
      status: args.approve ? "approved" : "rejected",
      decidedById: scope.userId,
      decidedAt: Date.now(),
      note: args.note?.trim() || undefined,
    });

    // Sent back to recount: that count is superseded, so its dispute closes. An
    // approved count keeps its dispute open — the shortfall still needs settling.
    if (!args.approve) {
      await closeTurnoverShortDispute(
        ctx,
        args.approvalId,
        `Sent back to recount${args.note?.trim() ? `: ${args.note.trim()}` : ""}`
      );
    }

    await _logAuditEntry(ctx, {
      action: args.approve ? "pos.shift.turnoverApproved" : "pos.shift.turnoverRejected",
      userId: scope.userId,
      branchId: approval.branchId,
      entityType: "cashTurnoverApprovals",
      entityId: args.approvalId,
      before: { status: "pending" },
      after: { status: args.approve ? "approved" : "rejected" },
    });
  },
});

// ─── Cash variances ───────────────────────────────────────────────────────────
// The last week's counts that did not match what the drawer should hold. The
// till never sees these figures; this is where a manager does.

export const listCashVariances = query({
  args: {},
  handler: async (ctx) => {
    const scope = await requireManagerScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return [];

    const since = Date.now() - 7 * DAY_MS;

    const recentShifts = await ctx.db
      .query("cashierShifts")
      .withIndex("by_branch_opened", (q) =>
        q.eq("branchId", branchId).gte("openedAt", since - DAY_MS)
      )
      .collect();

    // Turnover counts above what the drawer should hold: cash that appeared
    // between cashiers needs explaining as much as cash that went. They open
    // without approval — only short counts are held — so this is where they show.
    const overCounts = recentShifts.filter(
      (s) =>
        s.openedAt >= since &&
        s.prevShiftId !== undefined &&
        s.handoverCashInRegisterCentavos !== undefined &&
        (s.changeFundCentavos ?? 0) > s.handoverCashInRegisterCentavos
    );

    const closes = recentShifts.filter(
      (s) =>
        s.status === "closed" &&
        (s.closedAt ?? 0) >= since &&
        s.declaredCashCentavos !== undefined &&
        s.closedCashBalanceCentavos !== undefined &&
        s.declaredCashCentavos !== s.closedCashBalanceCentavos
    );

    const approved = (
      await ctx.db
        .query("cashTurnoverApprovals")
        .withIndex("by_branch_status", (q) => q.eq("branchId", branchId).eq("status", "approved"))
        .collect()
    ).filter((a) => (a.decidedAt ?? 0) >= since);

    const rows = [];
    for (const s of closes) {
      rows.push({
        key: s._id as string,
        kind: s.closeType === "endOfDay" ? ("endOfDay" as const) : ("switchCashier" as const),
        at: s.closedAt ?? 0,
        terminalLabel: await terminalLabel(ctx, s.terminalId),
        cashierName: await shiftCashierName(ctx, s),
        expectedCentavos: s.closedCashBalanceCentavos ?? 0,
        countedCentavos: s.declaredCashCentavos ?? 0,
        differenceCentavos: (s.declaredCashCentavos ?? 0) - (s.closedCashBalanceCentavos ?? 0),
      });
    }
    for (const a of approved) {
      rows.push({
        key: a._id as string,
        kind: "turnoverApproved" as const,
        at: a.decidedAt ?? 0,
        terminalLabel: await terminalLabel(ctx, a.terminalId),
        cashierName: await accountName(ctx, a.cashierAccountId),
        expectedCentavos: a.expectedCentavos,
        countedCentavos: a.countedCentavos,
        differenceCentavos: a.countedCentavos - a.expectedCentavos,
      });
    }

    for (const s of overCounts) {
      const expected = s.handoverCashInRegisterCentavos ?? 0;
      const counted = s.changeFundCentavos ?? 0;
      rows.push({
        key: `${s._id as string}-open`,
        kind: "turnoverOver" as const,
        at: s.openedAt,
        terminalLabel: await terminalLabel(ctx, s.terminalId),
        cashierName: await shiftCashierName(ctx, s),
        expectedCentavos: expected,
        countedCentavos: counted,
        differenceCentavos: counted - expected,
      });
    }

    return rows.sort((x, y) => y.at - x.at).slice(0, 30);
  },
});

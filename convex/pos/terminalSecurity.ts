// convex/pos/terminalSecurity.ts — duplicate-use detection for POS terminals.
//
// The device token is a bearer credential. Anyone who copies it out of a
// register's localStorage becomes that terminal, and no server-side check can
// tell the copy from the original — which is why kiosk mode matters. What the
// server *can* do is notice the consequences:
//
//   • one terminal reporting two different browser installs
//   • one cashier account active on two terminals at once
//   • an account being locked out by repeated failed logins
//
// None of these is proof of anything, so none of them blocks a sale. They are
// raised as flags for a manager to look at.

import { query, mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { withBranchScope } from "../_helpers/withBranchScope";
import { BRANCH_MANAGEMENT_ROLES, POS_ROLES } from "../_helpers/permissions";
import { requireTerminal } from "../_helpers/requireTerminal";

const MINUTE = 60 * 1000;

/** How recently a session must have been seen to count as "live". */
export const ACTIVE_WINDOW_MS = 20 * MINUTE;

/** How far back the flags query looks for concurrent use. */
export const FLAG_WINDOW_MS = 12 * 60 * MINUTE;

// ─── recordActivity ───────────────────────────────────────────────────────────
// Called by the POS shell on mount and on a slow heartbeat. Upserts this
// browser's session row for the terminal it is running on.

export const recordActivity = mutation({
  args: {
    deviceToken: v.optional(v.string()),
    installId: v.string(),
    cashierAccountId: v.optional(v.id("cashierAccounts")),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const branchId = scope.branchId;
    if (!branchId) return;

    // Nothing to attribute activity to on an unenrolled device.
    const terminal = await requireTerminal(ctx, args.deviceToken, branchId);
    if (!terminal) return;

    const now = Date.now();

    const existing = await ctx.db
      .query("posTerminalSessions")
      .withIndex("by_terminal_install", (q) =>
        q.eq("terminalId", terminal._id).eq("installId", args.installId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastSeenAt: now,
        userId: scope.userId,
        ...(args.cashierAccountId
          ? { lastCashierAccountId: args.cashierAccountId }
          : {}),
      });
      return;
    }

    await ctx.db.insert("posTerminalSessions", {
      terminalId: terminal._id,
      branchId,
      installId: args.installId,
      userId: scope.userId,
      lastCashierAccountId: args.cashierAccountId,
      firstSeenAt: now,
      lastSeenAt: now,
    });
  },
});

// ─── getSecurityFlags ─────────────────────────────────────────────────────────
// Manager/admin view of anything worth a second look at this branch.

export const getSecurityFlags = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    if (!(BRANCH_MANAGEMENT_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const branchId = scope.branchId;
    if (!branchId) return { duplicateTerminals: [], sharedCashiers: [], lockedAccounts: [] };

    const now = Date.now();
    const since = now - FLAG_WINDOW_MS;

    const sessions = (
      await ctx.db
        .query("posTerminalSessions")
        .withIndex("by_branch", (q) => q.eq("branchId", branchId))
        .collect()
    ).filter((s) => s.lastSeenAt >= since);

    const terminals = await ctx.db
      .query("posTerminals")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();
    const terminalById = new Map(terminals.map((t) => [t._id as string, t]));

    // ── One terminal, several browser installs ──────────────────────────────
    const byTerminal = new Map<string, typeof sessions>();
    for (const s of sessions) {
      const key = s.terminalId as string;
      byTerminal.set(key, [...(byTerminal.get(key) ?? []), s]);
    }

    const duplicateTerminals = [];
    for (const [terminalId, rows] of byTerminal) {
      if (rows.length < 2) continue;
      const terminal = terminalById.get(terminalId);
      if (!terminal) continue;

      const live = rows.filter((r) => r.lastSeenAt >= now - ACTIVE_WINDOW_MS);
      duplicateTerminals.push({
        terminalId,
        label: terminal.label,
        terminalNumber: terminal.terminalNumber,
        installCount: rows.length,
        liveCount: live.length,
        // Overlapping activity is far more suspicious than a machine that was
        // reimaged, which also produces a second install id but never overlaps.
        concurrent: live.length >= 2,
        lastSeenAt: Math.max(...rows.map((r) => r.lastSeenAt)),
      });
    }

    // ── One cashier account, several terminals at once ──────────────────────
    const byCashier = new Map<string, typeof sessions>();
    for (const s of sessions) {
      if (!s.lastCashierAccountId) continue;
      if (s.lastSeenAt < now - ACTIVE_WINDOW_MS) continue;
      const key = s.lastCashierAccountId as string;
      byCashier.set(key, [...(byCashier.get(key) ?? []), s]);
    }

    const sharedCashiers = [];
    for (const [cashierAccountId, rows] of byCashier) {
      const distinctTerminals = new Set(rows.map((r) => r.terminalId as string));
      if (distinctTerminals.size < 2) continue;

      const account = await ctx.db.get(rows[0].lastCashierAccountId!);
      sharedCashiers.push({
        cashierAccountId,
        name: account ? `${account.firstName} ${account.lastName}` : "Unknown",
        username: account?.username ?? "—",
        terminalLabels: [...distinctTerminals]
          .map((id) => terminalById.get(id)?.label ?? "Unknown terminal")
          .sort(),
        lastSeenAt: Math.max(...rows.map((r) => r.lastSeenAt)),
      });
    }

    // ── Accounts currently locked by failed logins ──────────────────────────
    const accounts = await ctx.db
      .query("cashierAccounts")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();

    const lockedAccounts = accounts
      .filter((a) => a.lockedUntil !== undefined && a.lockedUntil > now)
      .map((a) => ({
        cashierAccountId: a._id,
        name: `${a.firstName} ${a.lastName}`,
        username: a.username,
        failedAttempts: a.failedAttempts ?? 0,
        lockedUntil: a.lockedUntil!,
      }));

    return { duplicateTerminals, sharedCashiers, lockedAccounts };
  },
});

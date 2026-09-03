import { v, ConvexError } from "convex/values";
import { internalQuery, internalMutation, query } from "../_generated/server";
import { withBranchScope } from "../_helpers/withBranchScope";
import { POS_ROLES } from "../_helpers/permissions";
import { requireTerminal } from "../_helpers/requireTerminal";

// Brute-force lockout policy for cashier sub-accounts.
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

// ─── _resolveLoginContext (internal) ─────────────────────────────────────────
// Establishes, server-side, which branch and terminal a cashier login is
// happening on. The branch is derived from the signed-in staff session — never
// taken from a client argument — and the device must be an enrolled register.

export const _resolveLoginContext = internalQuery({
  args: {
    clerkSubject: v.string(),
    deviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkSubject))
      .unique();

    if (!user || !user.isActive) throw new ConvexError({ code: "UNAUTHORIZED" });
    if (!(POS_ROLES as readonly string[]).includes(user.role))
      throw new ConvexError({ code: "UNAUTHORIZED" });

    const branchId = user.role === "admin" || user.role === "hqStaff"
      ? (user.viewingAsBranchId ?? user.branchId)
      : user.branchId;

    if (!branchId)
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "No branch assigned. Contact your administrator.",
      });

    const terminal = await requireTerminal(ctx, args.deviceToken, branchId);

    return { branchId, terminalId: terminal?._id ?? null };
  },
});

// ─── _getCashierByUsername (internal) ────────────────────────────────────────
// Used by verifyCashierLogin action to look up the stored hash+salt.

export const _getCashierByUsername = internalQuery({
  args: {
    branchId: v.id("branches"),
    username: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("cashierAccounts")
      .withIndex("by_branch_username", (q) =>
        q.eq("branchId", args.branchId).eq("username", args.username.toLowerCase())
      )
      .first();
  },
});

// ─── _recordFailedAttempt (internal) ─────────────────────────────────────────

export const _recordFailedAttempt = internalMutation({
  args: { accountId: v.id("cashierAccounts") },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) return;

    const attempts = (account.failedAttempts ?? 0) + 1;
    await ctx.db.patch(args.accountId, {
      failedAttempts: attempts,
      lockedUntil: attempts >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MS : undefined,
    });
  },
});

// ─── _recordSuccessfulLogin (internal) ───────────────────────────────────────
// Clears lockout state and, for accounts still on the legacy SHA-256 scheme,
// transparently upgrades the stored hash to PBKDF2.

export const _recordSuccessfulLogin = internalMutation({
  args: {
    accountId: v.id("cashierAccounts"),
    upgradedHash: v.optional(v.string()),
    upgradedSalt: v.optional(v.string()),
    upgradedAlgo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {
      failedAttempts: 0,
      lockedUntil: undefined,
    };

    if (args.upgradedHash && args.upgradedSalt && args.upgradedAlgo) {
      patch.passwordHash = args.upgradedHash;
      patch.passwordSalt = args.upgradedSalt;
      patch.passwordAlgo = args.upgradedAlgo;
    }

    await ctx.db.patch(args.accountId, patch);
  },
});


// ─── getPrevShiftHandover ─────────────────────────────────────────────────────
// Returns the most-recently closed shift for this branch so the new cashier
// can count the handover cash before opening their shift.

export const getPrevShiftHandover = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const branchId = scope.branchId;
    if (!branchId) return null;

    // Most recently closed shift for this branch
    const lastShift = await ctx.db
      .query("cashierShifts")
      .withIndex("by_branch_opened", (q) => q.eq("branchId", branchId))
      .order("desc")
      .filter((q) => q.eq(q.field("status"), "closed"))
      .first();

    if (!lastShift) return null;

    // Resolve cashier name
    let cashierName = "Unknown";
    if (lastShift.cashierAccountId) {
      const account = await ctx.db.get(lastShift.cashierAccountId);
      if (account) cashierName = `${account.firstName} ${account.lastName}`;
    } else {
      const user = await ctx.db.get(lastShift.cashierId);
      if (user) cashierName = user.name ?? "Unknown";
    }

    return {
      shiftId: lastShift._id,
      cashierName,
      openedAt: lastShift.openedAt,
      closedAt: lastShift.closedAt,
      closeType: lastShift.closeType,
      changeFundCentavos: lastShift.changeFundCentavos ?? 0,
      cashFundCentavos: lastShift.cashFundCentavos,
      cashInRegisterCentavos: lastShift.closedCashBalanceCentavos ?? 0,
    };
  },
});

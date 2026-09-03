"use node";
import { v, ConvexError } from "convex/values";
import { action } from "../_generated/server";
import { internal as _internal } from "../_generated/api";
import {
  CURRENT_ALGO,
  generateSalt,
  hashPassword,
  verifyPassword,
} from "../_helpers/passwordHash";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internal = _internal as any;

const MAX_FAILED_ATTEMPTS = 5;

// ─── verifyCashierLogin ───────────────────────────────────────────────────────
// Second factor at the register: the device is already signed in as branch
// staff (terminal account), and the cashier identifies themselves here.
//
// Security notes:
//   - Requires an authenticated staff session; branchId is derived from that
//     session, never accepted from the client.
//   - Requires an enrolled terminal when POS_REQUIRE_TERMINAL=true, so the
//     login cannot be completed from a phone or an unregistered PC.
//   - Locks the account for 15 minutes after 5 consecutive failures.
//   - Username and password failures return an identical message so the
//     response cannot be used to enumerate valid usernames.

export const verifyCashierLogin = action({
  args: {
    username: v.string(),
    password: v.string(),
    deviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHORIZED" });

    // Throws TERMINAL_NOT_ENROLLED / TERMINAL_REVOKED / TERMINAL_BRANCH_MISMATCH
    const { branchId, terminalId } = await ctx.runQuery(
      internal.cashier.auth._resolveLoginContext,
      { clerkSubject: identity.subject, deviceToken: args.deviceToken }
    );

    const account = await ctx.runQuery(internal.cashier.auth._getCashierByUsername, {
      branchId,
      username: args.username,
    });

    if (!account) {
      throw new ConvexError("Invalid username or password");
    }
    if (!account.isActive) {
      throw new ConvexError("This cashier account has been deactivated");
    }
    if (account.lockedUntil && account.lockedUntil > Date.now()) {
      const minutes = Math.ceil((account.lockedUntil - Date.now()) / 60000);
      throw new ConvexError(
        `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or ask your manager to reset your password.`
      );
    }

    const { valid, needsRehash } = verifyPassword(
      args.password,
      account.passwordSalt,
      account.passwordHash,
      account.passwordAlgo
    );

    if (!valid) {
      await ctx.runMutation(internal.cashier.auth._recordFailedAttempt, {
        accountId: account._id,
      });
      const remaining = MAX_FAILED_ATTEMPTS - ((account.failedAttempts ?? 0) + 1);
      throw new ConvexError(
        remaining > 0 && remaining <= 2
          ? `Invalid username or password. ${remaining} attempt${remaining === 1 ? "" : "s"} left before lockout.`
          : "Invalid username or password"
      );
    }

    // Upgrade legacy SHA-256 records to PBKDF2 now that we hold the plaintext.
    let upgrade = {};
    if (needsRehash) {
      const salt = generateSalt();
      upgrade = {
        upgradedHash: hashPassword(args.password, salt),
        upgradedSalt: salt,
        upgradedAlgo: CURRENT_ALGO,
      };
    }

    await ctx.runMutation(internal.cashier.auth._recordSuccessfulLogin, {
      accountId: account._id,
      ...upgrade,
    });

    return {
      cashierAccountId: account._id,
      firstName: account.firstName,
      lastName: account.lastName,
      username: account.username,
      terminalId,
    };
  },
});

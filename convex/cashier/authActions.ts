"use node";
import { v, ConvexError } from "convex/values";
import { action } from "../_generated/server";
import { internal as _internal } from "../_generated/api";
import { createHash } from "crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internal = _internal as any;

function hashPassword(password: string, salt: string): string {
  return createHash("sha256").update(salt + password).digest("hex");
}

// ─── verifyCashierLogin ───────────────────────────────────────────────────────

export const verifyCashierLogin = action({
  args: {
    branchId: v.id("branches"),
    username: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.runQuery(
      internal.cashier.auth._getCashierByUsername,
      { branchId: args.branchId, username: args.username }
    );

    if (!account) {
      throw new ConvexError("Invalid username or password");
    }
    if (!account.isActive) {
      throw new ConvexError("This cashier account has been deactivated");
    }

    const hash = hashPassword(args.password, account.passwordSalt);
    if (hash !== account.passwordHash) {
      throw new ConvexError("Invalid username or password");
    }

    return {
      cashierAccountId: account._id,
      firstName: account.firstName,
      lastName: account.lastName,
      username: account.username,
    };
  },
});

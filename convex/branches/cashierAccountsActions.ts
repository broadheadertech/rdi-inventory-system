"use node";
import { v, ConvexError } from "convex/values";
import { action } from "../_generated/server";
import { internal as _internal } from "../_generated/api";
import { createHash, randomBytes } from "crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internal = _internal as any;

function hashPassword(password: string, salt: string): string {
  return createHash("sha256").update(salt + password).digest("hex");
}

function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

// ─── createCashier ────────────────────────────────────────────────────────────

export const createCashier = action({
  args: {
    branchId: v.id("branches"),
    firstName: v.string(),
    lastName: v.string(),
    username: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHORIZED" });

    if (!args.firstName.trim()) throw new ConvexError("First name is required");
    if (!args.lastName.trim()) throw new ConvexError("Last name is required");
    if (!args.username.trim()) throw new ConvexError("Username is required");
    if (args.password.length < 6)
      throw new ConvexError("Password must be at least 6 characters");

    const salt = generateSalt();
    const passwordHash = hashPassword(args.password, salt);

    return await ctx.runMutation(
      internal.branches.cashierAccounts._insertCashierByManager,
      {
        branchId: args.branchId,
        firstName: args.firstName.trim(),
        lastName: args.lastName.trim(),
        username: args.username.trim().toLowerCase(),
        passwordHash,
        passwordSalt: salt,
        clerkSubject: identity.subject,
      }
    );
  },
});

// ─── resetCashierPassword ─────────────────────────────────────────────────────

export const resetCashierPassword = action({
  args: {
    accountId: v.id("cashierAccounts"),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHORIZED" });

    if (args.newPassword.length < 6)
      throw new ConvexError("Password must be at least 6 characters");

    const salt = generateSalt();
    const passwordHash = hashPassword(args.newPassword, salt);

    await ctx.runMutation(
      internal.branches.cashierAccounts._updatePasswordByManager,
      {
        accountId: args.accountId,
        passwordHash,
        passwordSalt: salt,
        clerkSubject: identity.subject,
      }
    );
  },
});

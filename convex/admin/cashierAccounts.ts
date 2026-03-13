import { v, ConvexError } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { requireRole } from "../_helpers/permissions";
import { ADMIN_ROLES } from "../_helpers/permissions";

// ─── listByBranch ─────────────────────────────────────────────────────────────

export const listByBranch = query({
  args: {
    branchId: v.id("branches"),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);

    const accounts = await ctx.db
      .query("cashierAccounts")
      .withIndex("by_branch", (q) => q.eq("branchId", args.branchId))
      .collect();

    const filtered = args.includeInactive
      ? accounts
      : accounts.filter((a) => a.isActive);

    return filtered
      .sort((a, b) => a.firstName.localeCompare(b.firstName))
      .map((a) => ({
        _id: a._id,
        branchId: a.branchId,
        firstName: a.firstName,
        lastName: a.lastName,
        username: a.username,
        isActive: a.isActive,
        createdAt: a.createdAt,
      }));
  },
});


export const _insertCashierAccount = internalMutation({
  args: {
    branchId: v.id("branches"),
    firstName: v.string(),
    lastName: v.string(),
    username: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
    clerkSubject: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkSubject))
      .unique();
    if (!user) throw new ConvexError({ code: "UNAUTHORIZED" });
    if (!ADMIN_ROLES.includes(user.role as "admin"))
      throw new ConvexError({ code: "UNAUTHORIZED" });

    // Username must be unique within the branch
    const existing = await ctx.db
      .query("cashierAccounts")
      .withIndex("by_branch_username", (q) =>
        q.eq("branchId", args.branchId).eq("username", args.username)
      )
      .first();
    if (existing) throw new ConvexError("Username already taken at this branch");

    const id = await ctx.db.insert("cashierAccounts", {
      branchId: args.branchId,
      firstName: args.firstName,
      lastName: args.lastName,
      username: args.username,
      passwordHash: args.passwordHash,
      passwordSalt: args.passwordSalt,
      isActive: true,
      createdById: user._id,
      createdAt: Date.now(),
    });

    return { id };
  },
});

// ─── updateCashierAccount ─────────────────────────────────────────────────────

export const updateCashierAccount = mutation({
  args: {
    accountId: v.id("cashierAccounts"),
    firstName: v.string(),
    lastName: v.string(),
    username: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);

    const account = await ctx.db.get(args.accountId);
    if (!account) throw new ConvexError("Account not found");

    const username = args.username.trim().toLowerCase();

    // Check username uniqueness (exclude self)
    if (username !== account.username) {
      const existing = await ctx.db
        .query("cashierAccounts")
        .withIndex("by_branch_username", (q) =>
          q.eq("branchId", account.branchId).eq("username", username)
        )
        .first();
      if (existing) throw new ConvexError("Username already taken at this branch");
    }

    await ctx.db.patch(args.accountId, {
      firstName: args.firstName.trim(),
      lastName: args.lastName.trim(),
      username,
    });
  },
});


export const _updatePassword = internalMutation({
  args: {
    accountId: v.id("cashierAccounts"),
    passwordHash: v.string(),
    passwordSalt: v.string(),
    clerkSubject: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkSubject))
      .unique();
    if (!user) throw new ConvexError({ code: "UNAUTHORIZED" });
    if (!ADMIN_ROLES.includes(user.role as "admin"))
      throw new ConvexError({ code: "UNAUTHORIZED" });

    const account = await ctx.db.get(args.accountId);
    if (!account) throw new ConvexError("Account not found");

    await ctx.db.patch(args.accountId, {
      passwordHash: args.passwordHash,
      passwordSalt: args.passwordSalt,
    });
  },
});

// ─── deactivate / reactivate ──────────────────────────────────────────────────

export const deactivateCashierAccount = mutation({
  args: { accountId: v.id("cashierAccounts") },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);
    const account = await ctx.db.get(args.accountId);
    if (!account) throw new ConvexError("Account not found");
    await ctx.db.patch(args.accountId, { isActive: false });
  },
});

export const reactivateCashierAccount = mutation({
  args: { accountId: v.id("cashierAccounts") },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);
    const account = await ctx.db.get(args.accountId);
    if (!account) throw new ConvexError("Account not found");
    await ctx.db.patch(args.accountId, { isActive: true });
  },
});

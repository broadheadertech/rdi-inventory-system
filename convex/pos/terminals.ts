import { v, ConvexError } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "../_generated/server";
import { withBranchScope, requireBranchScope } from "../_helpers/withBranchScope";
import { BRANCH_MANAGEMENT_ROLES, POS_ROLES } from "../_helpers/permissions";
import { terminalBindingEnforced } from "../_helpers/requireTerminal";

const ENROLLMENT_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// ─── whoAmI ───────────────────────────────────────────────────────────────────
// Called by the POS shell on boot to decide between the enrollment screen and
// the normal cashier login. Never returns the deviceToken back to the client.

export const whoAmI = query({
  args: { deviceToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const enforced = terminalBindingEnforced();

    if (!args.deviceToken) {
      return { enrolled: false, enforced, terminal: null };
    }

    const terminal = await ctx.db
      .query("posTerminals")
      .withIndex("by_deviceToken", (q) => q.eq("deviceToken", args.deviceToken!))
      .unique();

    // Stale or revoked token — the shell clears localStorage and re-enrolls.
    if (!terminal || !terminal.isActive || terminal.branchId !== scope.branchId) {
      return { enrolled: false, enforced, terminal: null };
    }

    return {
      enrolled: true,
      enforced,
      terminal: {
        _id: terminal._id,
        label: terminal.label,
        terminalNumber: terminal.terminalNumber,
        minNumber: terminal.minNumber ?? null,
        serialNumber: terminal.serialNumber ?? null,
        ptuNumber: terminal.ptuNumber ?? null,
        ptuDate: terminal.ptuDate ?? null,
      },
    };
  },
});

// ─── listTerminals ────────────────────────────────────────────────────────────
// Manager/admin view of every register registered to the branch.

export const listTerminals = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(BRANCH_MANAGEMENT_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const branchId = scope.branchId;
    if (!branchId) return [];

    const terminals = await ctx.db
      .query("posTerminals")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();

    return terminals
      .filter((t) => args.includeInactive || t.isActive)
      .sort((a, b) => a.terminalNumber.localeCompare(b.terminalNumber))
      .map((t) => ({
        _id: t._id,
        label: t.label,
        terminalNumber: t.terminalNumber,
        isActive: t.isActive,
        enrolledAt: t.enrolledAt,
        lastSeenAt: t.lastSeenAt ?? null,
        minNumber: t.minNumber ?? null,
        serialNumber: t.serialNumber ?? null,
        ptuNumber: t.ptuNumber ?? null,
        ptuDate: t.ptuDate ?? null,
        // deviceToken deliberately omitted — shown once at enrollment only.
      }));
  },
});

// ─── setTerminalActive ────────────────────────────────────────────────────────
// Revoking a terminal immediately locks out the device holding its token.

export const setTerminalActive = mutation({
  args: {
    terminalId: v.id("posTerminals"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const terminal = await ctx.db.get(args.terminalId);
    if (!terminal) throw new ConvexError("Terminal not found");

    const scope = await requireBranchScope(ctx, terminal.branchId);
    if (!(BRANCH_MANAGEMENT_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    await ctx.db.patch(args.terminalId, {
      isActive: args.isActive,
      revokedAt: args.isActive ? undefined : Date.now(),
    });
  },
});

// ─── updateTerminalBir ────────────────────────────────────────────────────────
// BIR registers each register separately: its own MIN, serial and PTU.

export const updateTerminalBir = mutation({
  args: {
    terminalId: v.id("posTerminals"),
    label: v.optional(v.string()),
    minNumber: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    ptuNumber: v.optional(v.string()),
    ptuDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const terminal = await ctx.db.get(args.terminalId);
    if (!terminal) throw new ConvexError("Terminal not found");

    const scope = await requireBranchScope(ctx, terminal.branchId);
    if (!(BRANCH_MANAGEMENT_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const { terminalId, ...fields } = args;
    await ctx.db.patch(terminalId, fields);
  },
});

// ─── internal: enrollment code lifecycle ──────────────────────────────────────

export const _insertEnrollmentCode = internalMutation({
  args: {
    code: v.string(),
    label: v.string(),
    terminalNumber: v.string(),
    clerkSubject: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkSubject))
      .unique();
    if (!user || !user.isActive) throw new ConvexError({ code: "UNAUTHORIZED" });
    if (!(BRANCH_MANAGEMENT_ROLES as readonly string[]).includes(user.role))
      throw new ConvexError({ code: "UNAUTHORIZED" });

    const branchId = user.role === "admin" ? user.viewingAsBranchId : user.branchId;
    if (!branchId)
      throw new ConvexError(
        "No branch selected. Admins must use “View as Branch” before enrolling a terminal."
      );

    const duplicate = await ctx.db
      .query("posTerminals")
      .withIndex("by_branch_terminalNumber", (q) =>
        q.eq("branchId", branchId).eq("terminalNumber", args.terminalNumber)
      )
      .first();
    if (duplicate && duplicate.isActive)
      throw new ConvexError(`Terminal number ${args.terminalNumber} is already in use at this branch`);

    const now = Date.now();
    await ctx.db.insert("terminalEnrollmentCodes", {
      branchId,
      code: args.code,
      label: args.label,
      terminalNumber: args.terminalNumber,
      createdById: user._id,
      createdAt: now,
      expiresAt: now + ENROLLMENT_CODE_TTL_MS,
    });

    return { expiresAt: now + ENROLLMENT_CODE_TTL_MS };
  },
});

export const _getEnrollmentCode = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("terminalEnrollmentCodes")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
  },
});

// ─── internal: redeem a code and register the device ──────────────────────────

export const _redeemEnrollmentCode = internalMutation({
  args: {
    code: v.string(),
    deviceToken: v.string(),
    clerkSubject: v.string(),
  },
  handler: async (ctx, args) => {
    // A person is signing the machine in anyway, so enrolment requires a valid
    // staff session on top of the code.
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkSubject))
      .unique();
    if (!user || !user.isActive) throw new ConvexError({ code: "UNAUTHORIZED" });
    if (!(POS_ROLES as readonly string[]).includes(user.role))
      throw new ConvexError({ code: "UNAUTHORIZED" });

    const record = await ctx.db
      .query("terminalEnrollmentCodes")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();

    if (!record) throw new ConvexError("Invalid enrollment code");
    if (record.usedAt) throw new ConvexError("This enrollment code has already been used");
    if (record.expiresAt < Date.now())
      throw new ConvexError("This enrollment code has expired. Ask your manager for a new one.");

    const terminalId = await ctx.db.insert("posTerminals", {
      branchId: record.branchId,
      label: record.label,
      terminalNumber: record.terminalNumber,
      deviceToken: args.deviceToken,
      isActive: true,
      enrolledById: record.createdById,
      enrolledAt: Date.now(),
    });

    // Burn the code before returning — a redeemed code is never reusable.
    await ctx.db.patch(record._id, { usedAt: Date.now(), usedTerminalId: terminalId });

    return { terminalId, label: record.label, terminalNumber: record.terminalNumber };
  },
});

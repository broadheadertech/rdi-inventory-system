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
    const record = await ctx.db
      .query("terminalEnrollmentCodes")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!record) return null;

    const branch = await ctx.db.get(record.branchId);
    const issuer = await ctx.db.get(record.createdById);

    return {
      code: record.code,
      label: record.label,
      terminalNumber: record.terminalNumber,
      branchId: record.branchId,
      branchName: branch?.name ?? "Branch",
      usedAt: record.usedAt ?? null,
      expiresAt: record.expiresAt,
      // The terminal account is minted on the issuing manager's own email
      // domain — a real domain the business controls, so Clerk accepts it, and
      // nothing is ever delivered to it.
      issuerEmail: issuer?.email ?? null,
    };
  },
});

// ─── internal: redeem a code and register the device ──────────────────────────

export const _redeemEnrollmentCode = internalMutation({
  args: {
    code: v.string(),
    deviceToken: v.string(),
    // Provisioned by enrollTerminal immediately before this call.
    terminalClerkId: v.string(),
    terminalEmail: v.string(),
    terminalName: v.string(),
  },
  handler: async (ctx, args) => {
    // Deliberately unauthenticated: a fresh register has no Clerk session yet —
    // getting one is the whole point of enrolling. The enrollment code is the
    // credential, and it is single use, expires in 15 minutes, and can only be
    // minted by an authenticated manager.
    const record = await ctx.db
      .query("terminalEnrollmentCodes")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();

    if (!record) throw new ConvexError("Invalid enrollment code");
    if (record.usedAt) throw new ConvexError("This enrollment code has already been used");
    if (record.expiresAt < Date.now())
      throw new ConvexError("This enrollment code has expired. Ask your manager for a new one.");

    // Give the freshly created Clerk account its Convex identity. Registers are
    // cashier-role so they reach the POS and nothing else.
    const now = Date.now();
    const terminalUserId = await ctx.db.insert("users", {
      clerkId: args.terminalClerkId,
      email: args.terminalEmail,
      name: args.terminalName,
      role: "cashier",
      branchId: record.branchId,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const terminalId = await ctx.db.insert("posTerminals", {
      branchId: record.branchId,
      label: record.label,
      terminalNumber: record.terminalNumber,
      deviceToken: args.deviceToken,
      terminalUserId,
      terminalClerkId: args.terminalClerkId,
      isActive: true,
      enrolledById: record.createdById,
      enrolledAt: Date.now(),
    });

    // Burn the code before returning — a redeemed code is never reusable.
    await ctx.db.patch(record._id, { usedAt: Date.now(), usedTerminalId: terminalId });

    return {
      terminalId,
      label: record.label,
      terminalNumber: record.terminalNumber,
    };
  },
});

// ─── _resolveTerminalSession (internal) ───────────────────────────────────────
// Exchanges a device token for the Clerk account the register runs as. Backs
// the silent sign-in that replaces the email/password screen at the till.

export const _resolveTerminalSession = internalQuery({
  args: { deviceToken: v.string() },
  handler: async (ctx, args) => {
    const terminal = await ctx.db
      .query("posTerminals")
      .withIndex("by_deviceToken", (q) => q.eq("deviceToken", args.deviceToken))
      .unique();

    if (!terminal) return { ok: false as const, reason: "NOT_ENROLLED" };
    if (!terminal.isActive) return { ok: false as const, reason: "REVOKED" };

    const user = await ctx.db.get(terminal.terminalUserId);
    if (!user || !user.isActive) return { ok: false as const, reason: "ACCOUNT_DISABLED" };

    return {
      ok: true as const,
      terminalClerkId: terminal.terminalClerkId,
      label: terminal.label,
    };
  },
});

// ─── _touchTerminalByToken (internal) ─────────────────────────────────────────

export const _touchTerminalByToken = internalMutation({
  args: { deviceToken: v.string() },
  handler: async (ctx, args) => {
    const terminal = await ctx.db
      .query("posTerminals")
      .withIndex("by_deviceToken", (q) => q.eq("deviceToken", args.deviceToken))
      .unique();
    if (terminal) await ctx.db.patch(terminal._id, { lastSeenAt: Date.now() });
  },
});

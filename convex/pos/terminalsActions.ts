"use node";
import { v, ConvexError } from "convex/values";
import { action } from "../_generated/server";
import { internal as _internal } from "../_generated/api";
import { randomBytes, randomInt } from "crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internal = _internal as any;

// Excludes I/O/0/1 — these get read aloud and typed on a shop floor.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateEnrollmentCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

function generateDeviceToken(): string {
  return randomBytes(32).toString("hex"); // 256-bit
}

// ─── createEnrollmentCode ─────────────────────────────────────────────────────
// Manager/admin generates this in the back office, then carries it to the new
// register. Single use, expires in 15 minutes.

export const createEnrollmentCode = action({
  args: {
    label: v.string(),
    terminalNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHORIZED" });

    if (!args.label.trim()) throw new ConvexError("Terminal name is required");
    if (!args.terminalNumber.trim()) throw new ConvexError("Terminal number is required");

    const code = generateEnrollmentCode();

    // Role, branch scoping and duplicate checks live in the internal mutation.
    const { expiresAt } = await ctx.runMutation(
      internal.pos.terminals._insertEnrollmentCode,
      {
        code,
        label: args.label.trim(),
        terminalNumber: args.terminalNumber.trim(),
        clerkSubject: identity.subject,
      }
    );

    return { code, expiresAt };
  },
});

// ─── enrollTerminal ───────────────────────────────────────────────────────────
// Run ON the register being enrolled, by a signed-in manager or admin. Returns
// the device token exactly once — the caller must persist it to localStorage
// immediately; it is never retrievable afterwards.

export const enrollTerminal = action({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHORIZED" });

    const code = args.code.trim().toUpperCase();
    if (!code) throw new ConvexError("Enter the enrollment code");

    const deviceToken = generateDeviceToken();

    const result = await ctx.runMutation(internal.pos.terminals._redeemEnrollmentCode, {
      code,
      deviceToken,
      clerkSubject: identity.subject,
    });

    return { ...result, deviceToken };
  },
});

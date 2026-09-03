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
    terminalUserId: v.id("users"),
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
        terminalUserId: args.terminalUserId,
        clerkSubject: identity.subject,
      }
    );

    return { code, expiresAt };
  },
});

// ─── enrollTerminal ───────────────────────────────────────────────────────────
// Run ON the register being enrolled. Returns the device token exactly once —
// the caller must persist it to localStorage immediately; it is never
// retrievable afterwards.

export const enrollTerminal = action({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    // No Clerk session required — a brand-new register does not have one, and
    // obtaining one is what enrollment is for. The code is the credential.
    const code = args.code.trim().toUpperCase();
    if (!code) throw new ConvexError("Enter the enrollment code");

    const deviceToken = generateDeviceToken();

    const result = await ctx.runMutation(internal.pos.terminals._redeemEnrollmentCode, {
      code,
      deviceToken,
    });

    // Hand back a ticket too, so the register signs itself in immediately after
    // enrolling instead of bouncing the user to a sign-in page.
    const ticket = await createSignInTicket(result.terminalClerkId);

    return { ...result, deviceToken, ticket };
  },
});

// ─── createTerminalSession ────────────────────────────────────────────────────
// Called by the POS shell whenever an enrolled register has no Clerk session:
// first boot after enrollment, and every time the session later lapses.
//
// The device token is the credential. Anyone holding it can obtain a session
// for that register's account — which is the intended design, and why revoking
// a terminal (Branch → POS Terminals) cuts the device off immediately.

export const createTerminalSession = action({
  args: { deviceToken: v.string() },
  handler: async (ctx, args) => {
    const resolved = await ctx.runQuery(internal.pos.terminals._resolveTerminalSession, {
      deviceToken: args.deviceToken,
    });

    if (!resolved.ok) {
      throw new ConvexError({
        code: resolved.reason === "REVOKED" ? "TERMINAL_REVOKED" : "TERMINAL_NOT_ENROLLED",
        message:
          resolved.reason === "REVOKED"
            ? "This terminal has been deactivated. Contact your manager."
            : "This device is not registered as a POS terminal.",
      });
    }

    const ticket = await createSignInTicket(resolved.terminalClerkId);

    await ctx.runMutation(internal.pos.terminals._touchTerminalByToken, {
      deviceToken: args.deviceToken,
    });

    return { ticket, label: resolved.label };
  },
});

// ─── Clerk sign-in tokens ─────────────────────────────────────────────────────
// A sign-in token is a one-time ticket the frontend redeems via
// signIn.create({ strategy: "ticket", ticket }) to establish a session without
// anyone typing credentials.

async function createSignInTicket(clerkUserId: string): Promise<string> {
  const clerkSecret = process.env.CLERK_SECRET_KEY;
  if (!clerkSecret) {
    throw new ConvexError({ code: "CONFIG_ERROR", message: "CLERK_SECRET_KEY not set" });
  }

  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${clerkSecret}`,
    },
    body: JSON.stringify({
      user_id: clerkUserId,
      expires_in_seconds: 120, // redeemed immediately by the page that asked
    }),
  });

  const body = await res.json();
  if (!res.ok || !body?.token) {
    throw new ConvexError({
      code: "CLERK_API_ERROR",
      message: `Could not start the terminal session: ${res.status}`,
    });
  }

  return body.token as string;
}

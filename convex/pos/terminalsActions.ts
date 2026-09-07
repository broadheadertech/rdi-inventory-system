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

/** Lowercase, alphanumeric-and-dashes, safe inside an email local part. */
function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "pos"
  );
}

// ─── createEnrollmentCode ─────────────────────────────────────────────────────
// Manager/admin generates this in the back office, then carries it to the new
// register. Single use, expires in 15 minutes.
//
// Two fields, and no prerequisites: the register's account is created during
// enrolment, not chosen from a list.

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
// Run ON the register being enrolled, with no session — a fresh machine has
// none, and obtaining one is the point. The enrollment code is the credential:
// single use, 15-minute life, and only an authenticated manager can mint one.
//
// The register's Clerk account is created HERE rather than picked from a list.
// Requiring an admin to pre-create an email-backed account per store and then
// select it in a dropdown made registering a till harder than the sign-in it was
// meant to replace. Nobody ever sees or uses this address: it is minted on the
// issuing manager's own domain (a real domain, so Clerk accepts it), receives no
// mail, and its password is random and immediately discarded.

export const enrollTerminal = action({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();
    if (!code) throw new ConvexError("Enter the enrollment code");

    // Validate before touching Clerk, so a mistyped code cannot litter the user
    // directory with accounts for enrolments that never happen.
    const record = await ctx.runQuery(internal.pos.terminals._getEnrollmentCode, { code });
    if (!record) throw new ConvexError("Invalid enrollment code");
    if (record.usedAt) throw new ConvexError("This enrollment code has already been used");
    if (record.expiresAt < Date.now()) {
      throw new ConvexError(
        "This enrollment code has expired. Ask your manager for a new one."
      );
    }

    const domain = (record.issuerEmail ?? "").split("@")[1];
    if (!domain) {
      throw new ConvexError(
        "Could not work out an email domain for this terminal. Ask an admin to check that the manager who issued the code has an email address on their account."
      );
    }

    const suffix = randomBytes(4).toString("hex");
    const terminalEmail = `pos-${slug(record.branchName)}-${slug(
      record.terminalNumber
    )}-${suffix}@${domain}`;
    const terminalName = `${record.label} — ${record.branchName} (terminal)`;

    const terminalClerkId = await createClerkTerminalUser(terminalEmail, terminalName);

    let result;
    try {
      result = await ctx.runMutation(internal.pos.terminals._redeemEnrollmentCode, {
        code,
        deviceToken: generateDeviceToken(),
        terminalClerkId,
        terminalEmail,
        terminalName,
      });
    } catch (err) {
      // Someone redeemed the code in the gap, or the write failed. Clean up so
      // no orphan account is left for an enrolment that did not happen.
      await removeClerkUser(terminalClerkId).catch(() => {});
      throw err;
    }

    const ticket = await createSignInTicket(terminalClerkId);
    return { ...result, ticket };
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

// ─── Clerk backend calls ──────────────────────────────────────────────────────

async function clerkFetch(path: string, init: RequestInit): Promise<Response> {
  const clerkSecret = process.env.CLERK_SECRET_KEY;
  if (!clerkSecret) {
    throw new ConvexError({ code: "CONFIG_ERROR", message: "CLERK_SECRET_KEY not set" });
  }
  return await fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${clerkSecret}`,
      ...(init.headers ?? {}),
    },
  });
}

/** Creates the Clerk account a register signs in as. Returns its user id. */
async function createClerkTerminalUser(email: string, name: string): Promise<string> {
  const res = await clerkFetch("/users", {
    method: "POST",
    body: JSON.stringify({
      email_address: [email],
      // Never used — registers sign in by ticket. Set anyway so the account is
      // not left in a passwordless state that someone could later claim.
      password: randomBytes(24).toString("base64url"),
      skip_password_checks: true,
      first_name: name.slice(0, 60),
      public_metadata: { role: "cashier", isTerminal: true },
    }),
  });

  const body = await res.json();
  if (!res.ok || !body?.id) {
    throw new ConvexError({
      code: "CLERK_API_ERROR",
      message: `Could not create the terminal account: ${
        body?.errors?.[0]?.message ?? res.status
      }`,
    });
  }
  return body.id as string;
}

/** Rolls back a terminal account when enrolment fails after it was created. */
async function removeClerkUser(clerkUserId: string): Promise<void> {
  await clerkFetch(`/users/${clerkUserId}`, { method: "DELETE" });
}

// A sign-in token is a one-time ticket the frontend redeems via
// signIn.create({ strategy: "ticket", ticket }) to establish a session without
// anyone typing credentials.

async function createSignInTicket(clerkUserId: string): Promise<string> {
  const res = await clerkFetch("/sign_in_tokens", {
    method: "POST",
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

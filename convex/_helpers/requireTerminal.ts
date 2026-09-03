// Device binding for the POS — resolves and validates an enrolled register.
//
// Pairs with withBranchScope: branch scoping answers "which store's data may
// this user touch", terminal binding answers "is this request coming from a
// register that store actually registered". A cashier signing in from a phone
// passes the first and fails the second.

import { ConvexError } from "convex/values";
import { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * Set POS_REQUIRE_TERMINAL=true on the Convex deployment to enforce device
 * binding. Left unset, unbound requests are still allowed, so terminals can be
 * enrolled one at a time without taking every register offline at once.
 *
 * Roll out: deploy → enroll every register → set the flag → binding is enforced.
 */
export function terminalBindingEnforced(): boolean {
  return process.env.POS_REQUIRE_TERMINAL === "true";
}

/**
 * Resolves a device token to its registered terminal.
 *
 * @param deviceToken - Token held in the register's localStorage, or undefined
 *                      when the device has never been enrolled.
 * @param branchId    - The caller's branch, from withBranchScope.
 * @returns The terminal, or null when binding is not yet enforced and no token
 *          was supplied.
 * @throws ConvexError TERMINAL_NOT_ENROLLED / TERMINAL_REVOKED / TERMINAL_BRANCH_MISMATCH
 */
export async function requireTerminal(
  ctx: QueryCtx | MutationCtx,
  deviceToken: string | undefined,
  branchId: Id<"branches">
): Promise<Doc<"posTerminals"> | null> {
  if (!deviceToken) {
    if (terminalBindingEnforced()) {
      throw new ConvexError({
        code: "TERMINAL_NOT_ENROLLED",
        message:
          "This device is not registered as a POS terminal. Ask your manager to enroll it.",
      });
    }
    return null;
  }

  const terminal = await ctx.db
    .query("posTerminals")
    .withIndex("by_deviceToken", (q) => q.eq("deviceToken", deviceToken))
    .unique();

  // An unrecognised token is always rejected, enforced or not — presenting a
  // bad token is a stronger signal than presenting none.
  if (!terminal) {
    throw new ConvexError({
      code: "TERMINAL_NOT_ENROLLED",
      message:
        "This device is not registered as a POS terminal. Ask your manager to enroll it.",
    });
  }

  if (!terminal.isActive) {
    throw new ConvexError({
      code: "TERMINAL_REVOKED",
      message: "This terminal has been deactivated. Contact your manager.",
    });
  }

  if (terminal.branchId !== branchId) {
    throw new ConvexError({
      code: "TERMINAL_BRANCH_MISMATCH",
      message: "This terminal belongs to a different branch.",
    });
  }

  return terminal;
}

/** Records terminal activity. Best-effort — never blocks the caller's operation. */
export async function touchTerminal(
  ctx: MutationCtx,
  terminal: Doc<"posTerminals"> | null
): Promise<void> {
  if (!terminal) return;
  await ctx.db.patch(terminal._id, { lastSeenAt: Date.now() });
}

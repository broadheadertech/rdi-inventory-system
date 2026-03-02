import { ConvexError } from "convex/values";
import { QueryCtx, MutationCtx } from "../_generated/server";

// Valid role values — used for runtime validation in webhooks and actions
export const VALID_ROLES = new Set([
  "admin",
  "manager",
  "cashier",
  "warehouseStaff",
  "hqStaff",
  "viewer",
  "driver",
  "supplier",
] as const);
export type ValidRole =
  | "admin"
  | "manager"
  | "cashier"
  | "warehouseStaff"
  | "hqStaff"
  | "viewer"
  | "driver"
  | "supplier";

// Role group constants for reuse across Convex functions
export const ADMIN_ROLES = ["admin"] as const;
export const HQ_ROLES = ["admin", "hqStaff"] as const;
export const BRANCH_MANAGEMENT_ROLES = ["admin", "manager"] as const;
export const POS_ROLES = ["admin", "manager", "cashier"] as const;
export const WAREHOUSE_ROLES = ["admin", "hqStaff", "warehouseStaff"] as const;
export const BRANCH_VIEW_ROLES = ["admin", "manager", "viewer"] as const;
export const DRIVER_ROLES = ["admin", "driver"] as const;
export const SUPPLIER_ROLES = ["admin", "supplier"] as const;

/**
 * Validates the current user is authenticated and has an active account.
 * Compares session token role with Convex DB role — throws SESSION_STALE on mismatch.
 *
 * @returns The authenticated user's Convex record
 * @throws ConvexError with code UNAUTHORIZED or SESSION_STALE
 */
export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ code: "UNAUTHORIZED" });
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (!user) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "User record not found. Please sign out and sign back in.",
    });
  }

  if (!user.isActive) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Account has been deactivated.",
    });
  }

  // SESSION_STALE check: compare token role with DB role
  // identity from Clerk includes custom claims from session token customization
  const tokenMetadata = (identity as Record<string, unknown>).metadata as
    | Record<string, unknown>
    | undefined;
  const tokenRole = tokenMetadata?.role as string | undefined;
  if (tokenRole && tokenRole !== user.role) {
    throw new ConvexError({ code: "SESSION_STALE" });
  }

  return user;
}

/**
 * Validates the current user has one of the specified roles.
 *
 * @param allowedRoles - Array of role strings that are permitted
 * @returns The authenticated user's Convex record
 * @throws ConvexError with code UNAUTHORIZED if role not in allowedRoles
 */
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  allowedRoles: readonly string[]
) {
  const user = await requireAuth(ctx);
  if (!allowedRoles.includes(user.role)) {
    throw new ConvexError({ code: "UNAUTHORIZED" });
  }
  return user;
}

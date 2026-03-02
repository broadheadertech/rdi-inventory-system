import { ConvexError } from "convex/values";
import { QueryCtx, MutationCtx } from "../_generated/server";
import { requireAuth, HQ_ROLES } from "./permissions";
import type { Id, Doc } from "../_generated/dataModel";

export type BranchScope = {
  user: Doc<"users">;
  userId: Id<"users">;
  branchId: Id<"branches"> | null;
  canAccessAllBranches: boolean;
};

/**
 * Core branch-scoping helper — THE single enforcement point for branch isolation.
 *
 * Every Convex query/mutation that accesses branch-scoped data MUST call this.
 * - Admin and HQ Staff bypass branch filter (access all branches)
 * - All other roles are restricted to their assigned branch
 * - Users without a branch assignment (non-HQ roles) are blocked
 *
 * @returns BranchScope with user, userId, branchId, and canAccessAllBranches flag
 * @throws ConvexError UNAUTHORIZED if non-HQ user has no branch assigned
 */
export async function withBranchScope(
  ctx: QueryCtx | MutationCtx
): Promise<BranchScope> {
  const user = await requireAuth(ctx);

  const canAccessAllBranches = (HQ_ROLES as readonly string[]).includes(
    user.role
  );

  if (!canAccessAllBranches && !user.branchId) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "No branch assigned. Contact your administrator.",
    });
  }

  return {
    user,
    userId: user._id,
    branchId: canAccessAllBranches ? null : (user.branchId ?? null),
    canAccessAllBranches,
  };
}

/**
 * Convenience variant that validates a specific branchId matches the user's scope.
 *
 * Use this in mutations that receive an explicit branchId argument
 * (e.g., createTransaction({ branchId, ... })).
 *
 * @param branchId - The branch ID to validate access for
 * @returns BranchScope for the authenticated user
 * @throws ConvexError BRANCH_MISMATCH if user cannot access the specified branch
 */
export async function requireBranchScope(
  ctx: QueryCtx | MutationCtx,
  branchId: Id<"branches">
): Promise<BranchScope> {
  const scope = await withBranchScope(ctx);

  if (!scope.canAccessAllBranches && scope.branchId !== branchId) {
    throw new ConvexError({
      code: "BRANCH_MISMATCH",
      message: "You do not have access to this branch",
    });
  }

  return scope;
}

import { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Logs an immutable audit entry to the `auditLogs` table.
 *
 * This is the ONLY write path for audit logs — append-only by convention.
 * No update or delete mutations exist for `auditLogs`.
 *
 * Called from every mutation that modifies user, branch, or settings data.
 * Future epics will add calls for transactions, inventory, and transfers.
 *
 * @param ctx - Convex MutationCtx (provides ctx.db.insert)
 * @param args - Audit entry fields
 * @param args.action - Dot-notation action type (e.g., "branch.create", "user.roleChange")
 * @param args.userId - The user performing the action
 * @param args.branchId - The branch context (optional — omitted for HQ-initiated actions)
 * @param args.entityType - The table/entity type being modified (e.g., "branches", "users", "settings")
 * @param args.entityId - The ID of the entity being modified (stringified)
 * @param args.before - State before the change (undefined to omit from storage)
 * @param args.after - State after the change (undefined to omit from storage)
 */
export async function _logAuditEntry(
  ctx: MutationCtx,
  args: {
    action: string;
    userId: Id<"users">;
    branchId?: Id<"branches">;
    entityType: string;
    entityId: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  }
) {
  await ctx.db.insert("auditLogs", {
    action: args.action,
    userId: args.userId,
    branchId: args.branchId,
    entityType: args.entityType,
    entityId: args.entityId,
    before: args.before,
    after: args.after,
    timestamp: Date.now(),
  });
}

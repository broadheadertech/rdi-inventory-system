import { v, ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import { withBranchScope } from "../_helpers/withBranchScope";
import { POS_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

/**
 * Flag an offline transaction that failed to replay during sync.
 * Logs to auditLogs for HQ review — does NOT retry the transaction.
 */
export const flagSyncConflict = mutation({
  args: {
    offlineTimestamp: v.number(),
    errorCode: v.string(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    await _logAuditEntry(ctx, {
      action: "offline.sync.conflict",
      userId: scope.userId,
      branchId: scope.branchId ?? undefined,
      entityType: "transactions",
      entityId: String(args.offlineTimestamp),
      after: {
        errorCode: args.errorCode,
        errorMessage: args.errorMessage,
      },
    });
  },
});

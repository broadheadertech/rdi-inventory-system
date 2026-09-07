// convex/pos/drawer.ts — Drawer operations: No Sale, Cash Pay-In, Cash Pay-Out.

import { mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { withBranchScope } from "../_helpers/withBranchScope";
import { requireTerminal } from "../_helpers/requireTerminal";
import { POS_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

export const recordDrawerOperation = mutation({
  args: {
    deviceToken: v.optional(v.string()),
    type: v.union(v.literal("noSale"), v.literal("payIn"), v.literal("payOut")),
    amountCentavos: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }
    const branchId = scope.branchId;
    if (!branchId) {
      throw new ConvexError({ code: "INVALID_STATE", message: "No branch in scope." });
    }

    let amount = 0;
    if (args.type !== "noSale") {
      amount = args.amountCentavos ?? 0;
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new ConvexError({
          code: "INVALID_ARGUMENT",
          message: "Enter a valid amount.",
        });
      }
    }

    const now = Date.now();
    const terminal = await requireTerminal(ctx, args.deviceToken, branchId);

    const id = await ctx.db.insert("drawerOperations", {
      terminalId: terminal?._id,
      branchId,
      cashierId: scope.userId,
      type: args.type,
      amountCentavos: amount,
      reason: args.reason?.trim() || undefined,
      createdAt: now,
    });

    await _logAuditEntry(ctx, {
      action: `pos.drawer.${args.type}`,
      userId: scope.userId,
      branchId,
      entityType: "drawerOperations",
      entityId: id,
      after: { type: args.type, amountCentavos: amount },
    });
  },
});

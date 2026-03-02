import { v, ConvexError } from "convex/values";
import { query, mutation, internalQuery } from "../_generated/server";
import { withBranchScope } from "../_helpers/withBranchScope";
import { POS_ROLES, BRANCH_MANAGEMENT_ROLES } from "../_helpers/permissions";
import { requireRole } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

// ─── Queries ────────────────────────────────────────────────────────────────

const STAFF_ROLES = [...BRANCH_MANAGEMENT_ROLES, ...POS_ROLES] as const;
// Deduplicate: admin, manager, cashier
const UNIQUE_STAFF_ROLES = [...new Set(STAFF_ROLES)] as string[];

export const listBranchReservations = query({
  args: {
    statusFilter: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("fulfilled"),
        v.literal("expired"),
        v.literal("cancelled")
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, UNIQUE_STAFF_ROLES);
    const scope = await withBranchScope(ctx);

    let reservations;
    if (scope.canAccessAllBranches) {
      if (args.statusFilter) {
        reservations = await ctx.db
          .query("reservations")
          .withIndex("by_status", (q) => q.eq("status", args.statusFilter!))
          .collect();
      } else {
        reservations = await ctx.db.query("reservations").collect();
      }
    } else {
      if (args.statusFilter) {
        reservations = await ctx.db
          .query("reservations")
          .withIndex("by_branch_status", (q) =>
            q.eq("branchId", scope.branchId!).eq("status", args.statusFilter!)
          )
          .collect();
      } else {
        reservations = await ctx.db
          .query("reservations")
          .withIndex("by_branch", (q) => q.eq("branchId", scope.branchId!))
          .collect();
      }
    }

    // Sort by createdAt desc and limit to most recent 200
    reservations.sort((a, b) => b.createdAt - a.createdAt);
    const limited = reservations.slice(0, 200);

    // Enrich with variant/style/branch info
    const enriched = await Promise.all(
      limited.map(async (r) => {
        const variant = await ctx.db.get(r.variantId);
        const style = variant ? await ctx.db.get(variant.styleId) : null;
        const branch = await ctx.db.get(r.branchId);
        return {
          ...r,
          styleName: style?.name ?? "Unknown",
          size: variant?.size ?? "",
          color: variant?.color ?? "",
          priceCentavos: variant?.priceCentavos ?? 0,
          branchName: branch?.name ?? "Unknown",
        };
      })
    );

    return enriched;
  },
});

// ─── Internal Queries ────────────────────────────────────────────────────────

export const _getReservationNotificationData = internalQuery({
  args: { reservationId: v.id("reservations") },
  handler: async (ctx, args) => {
    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation) return null;

    const variant = await ctx.db.get(reservation.variantId);
    const style = variant ? await ctx.db.get(variant.styleId) : null;
    const branch = await ctx.db.get(reservation.branchId);

    // Find staff (admin/manager) assigned to this branch
    const branchUsers = await ctx.db
      .query("users")
      .withIndex("by_branch", (q) => q.eq("branchId", reservation.branchId))
      .collect();

    const staffEmails = branchUsers
      .filter((u) => u.isActive && (u.role === "admin" || u.role === "manager"))
      .map((u) => u.email);

    return {
      customerName: reservation.customerName,
      customerPhone: reservation.customerPhone,
      confirmationCode: reservation.confirmationCode,
      expiresAt: reservation.expiresAt,
      styleName: style?.name ?? "Unknown Product",
      size: variant?.size ?? "",
      color: variant?.color ?? "",
      branchName: branch?.name ?? "Unknown Branch",
      staffEmails,
    };
  },
});

// ─── Mutations ──────────────────────────────────────────────────────────────

export const fulfillReservation = mutation({
  args: { reservationId: v.id("reservations") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, UNIQUE_STAFF_ROLES);
    const scope = await withBranchScope(ctx);

    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Reservation not found" });
    }

    // Validate branch access
    if (!scope.canAccessAllBranches && scope.branchId !== reservation.branchId) {
      throw new ConvexError({ code: "BRANCH_MISMATCH", message: "Reservation belongs to a different branch" });
    }

    if (reservation.status !== "pending") {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: `Cannot fulfill a reservation with status "${reservation.status}"`,
      });
    }

    // Check if reservation has expired (cron may not have run yet)
    if (reservation.expiresAt < Date.now()) {
      // Auto-expire it now and restore inventory
      await ctx.db.patch(args.reservationId, {
        status: "expired",
        updatedAt: Date.now(),
      });
      const inv = await ctx.db
        .query("inventory")
        .withIndex("by_branch_variant", (q) =>
          q.eq("branchId", reservation.branchId).eq("variantId", reservation.variantId)
        )
        .unique();
      if (inv) {
        await ctx.db.patch(inv._id, {
          quantity: inv.quantity + 1,
          updatedAt: Date.now(),
        });
      }
      throw new ConvexError({
        code: "RESERVATION_EXPIRED",
        message: "This reservation has expired. Stock has been restored.",
      });
    }

    await ctx.db.patch(args.reservationId, {
      status: "fulfilled",
      updatedAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "reservation.fulfill",
      userId: user._id,
      branchId: reservation.branchId,
      entityType: "reservations",
      entityId: args.reservationId,
      before: { status: "pending" },
      after: {
        status: "fulfilled",
        customerName: reservation.customerName,
        customerPhone: reservation.customerPhone,
        confirmationCode: reservation.confirmationCode,
      },
    });
  },
});

export const cancelReservation = mutation({
  args: { reservationId: v.id("reservations") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, UNIQUE_STAFF_ROLES);
    const scope = await withBranchScope(ctx);

    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Reservation not found" });
    }

    // Validate branch access
    if (!scope.canAccessAllBranches && scope.branchId !== reservation.branchId) {
      throw new ConvexError({ code: "BRANCH_MISMATCH", message: "Reservation belongs to a different branch" });
    }

    if (reservation.status !== "pending") {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: `Cannot cancel a reservation with status "${reservation.status}"`,
      });
    }

    // Cancel reservation
    await ctx.db.patch(args.reservationId, {
      status: "cancelled",
      updatedAt: Date.now(),
    });

    // Restore inventory
    const inv = await ctx.db
      .query("inventory")
      .withIndex("by_branch_variant", (q) =>
        q.eq("branchId", reservation.branchId).eq("variantId", reservation.variantId)
      )
      .unique();

    if (inv) {
      await ctx.db.patch(inv._id, {
        quantity: inv.quantity + 1,
        updatedAt: Date.now(),
      });
    }

    await _logAuditEntry(ctx, {
      action: "reservation.cancel",
      userId: user._id,
      branchId: reservation.branchId,
      entityType: "reservations",
      entityId: args.reservationId,
      before: { status: "pending" },
      after: {
        status: "cancelled",
        customerName: reservation.customerName,
        confirmationCode: reservation.confirmationCode,
        stockRestored: true,
      },
    });
  },
});

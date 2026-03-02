import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

export const expireReservations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find all pending reservations that have expired
    const pendingReservations = await ctx.db
      .query("reservations")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const expired = pendingReservations.filter((r) => r.expiresAt < now);

    let expiredCount = 0;

    for (const reservation of expired) {
      // Mark as expired
      await ctx.db.patch(reservation._id, {
        status: "expired",
        updatedAt: now,
      });

      // Restore inventory
      const inv = await ctx.db
        .query("inventory")
        .withIndex("by_branch_variant", (q) =>
          q
            .eq("branchId", reservation.branchId)
            .eq("variantId", reservation.variantId)
        )
        .unique();

      if (inv) {
        await ctx.db.patch(inv._id, {
          quantity: inv.quantity + 1,
          updatedAt: now,
        });
      }

      // Schedule expiry notification email to branch staff
      await ctx.scheduler.runAfter(
        0,
        internal.reservations.notifications.sendReservationExpiredEmail,
        { reservationId: reservation._id }
      );

      expiredCount++;
    }

    if (expiredCount > 0) {
      console.log(
        `[expireReservations] Expired ${expiredCount} reservation(s) and restored stock`
      );
    }
  },
});
